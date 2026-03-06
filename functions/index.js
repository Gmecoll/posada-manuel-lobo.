// ==========================================
// 1. IMPORTACIONES ÚNICAS
// ==========================================
const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onObjectFinalized } = require("firebase-functions/v2/storage");
const { defineSecret } = require('firebase-functions/params');
const logger = require("firebase-functions/logger"); 
const admin = require('firebase-admin');
const axios = require('axios');
const crypto = require('crypto');
const sharp = require('sharp');
const { ImageAnnotatorClient } = require('@google-cloud/vision');
const fs = require('fs');
const path = require('path');

// ==========================================
// 2. INICIALIZACIÓN ÚNICA
// ==========================================
if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();

// ==========================================
// 3. CONFIGURACIONES Y SECRETOS
// ==========================================
const ADMIN_EMAIL = "gmecollg@gmail.com";
const MERCADO_PAGO_ACCESS_TOKEN = defineSecret('MERCADO_PAGO_ACCESS_TOKEN');
const CLOUDBEDS_CLIENT_ID = defineSecret("CLOUDBEDS_CLIENT_ID");
const CLOUDBEDS_CLIENT_SECRET = defineSecret("CLOUDBEDS_CLIENT_SECRET");
const TTLOCK_CLIENT_ID = defineSecret("TTLOCK_CLIENT_ID");
const TTLOCK_CLIENT_SECRET = defineSecret("TTLOCK_CLIENT_SECRET");
const REPLICATE_API_TOKEN = defineSecret("REPLICATE_API_TOKEN");

// ==========================================
// --- FUNCIÓN 1: INICIAR PAGO SERVICIO (MERCADO PAGO) ---
// ==========================================
const { MercadoPagoConfig, Preference } = require('mercadopago');

exports.iniciarPagoServicio = onCall({
    region: "us-central1",
    cors: true,
    secrets: ["MERCADO_PAGO_ACCESS_TOKEN"]
}, async (request) => {
    try {
        const data = request.data;
        
        const client = new MercadoPagoConfig({ accessToken: process.env.MERCADO_PAGO_ACCESS_TOKEN });
        const preference = new Preference(client);
        
        const preferenceData = {
            body: {
                items: [{
                    id: data.serviceId || "servicio",
                    title: data.title || "Servicio Sky Rooms",
                    quantity: data.quantity || 1,
                    unit_price: Number(data.price || 0),
                    currency_id: "UYU"
                }],
                back_urls: {
                    success: data.success_url || "https://tudominio.com",
                    failure: data.failure_url || "https://tudominio.com",
                    pending: data.pending_url || "https://tudominio.com"
                },
                auto_return: "approved",
                external_reference: data.external_reference || "skyrooms",
            }
        };

        const prefResponse = await preference.create(preferenceData);

        const orderRef = await db.collection('orders').add({
            serviceId: data.serviceId || "",
            title: data.title || "Servicio Sky Rooms",
            quantity: data.quantity || 1,
            total: Number(data.price || 0) * (data.quantity || 1),
            userId: data.userId || "",
            guestName: data.guestName || "Huésped",
            roomNumber: data.roomNumber || "",
            comments: data.comments || "",
            status: "pending",
            preferenceId: prefResponse.id,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        try {
            await axios.post("https://hook.us2.make.com/8v6qga9kx9sm3ef488yl664aw8uceeub", {
                orderId: orderRef.id,
                guestName: data.guestName,
                roomNumber: data.roomNumber,
                service: data.title,
                status: "Pago Iniciado"
            });
        } catch (err) {
            console.log("Error notificando a Make.com:", err.message);
        }

        return { 
            success: true, 
            preferenceId: prefResponse.id,
            init_point: prefResponse.init_point
        };

    } catch (error) {
        console.error("Error en Mercado Pago:", error);
        throw new HttpsError('internal', error.message);
    }
});

// ==========================================
// --- FUNCIÓN 2: MANTENIMIENTO ---
// ==========================================
exports.mantenimientoHabitaciones = onSchedule({
  schedule: "every 5 minutes",
  region: "us-central1",
  memory: "256MiB",
}, async (event) => {
  try {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0); 
    const [roomsSnap, bookingsSnap] = await Promise.all([
      db.collection("rooms").get(),
      db.collection("bookings").where("status", "in", ["Checked-In", "Bloqueada", "checked_in"]).get(),
    ]);

    if (roomsSnap.empty) return null;

    const roomsByCloudbedsId = new Map();
    roomsSnap.forEach(doc => {
      const roomData = doc.data();
      if (roomData.room_id_cloudbeds) {
        roomsByCloudbedsId.set(String(roomData.room_id_cloudbeds), doc.id);
      }
    });

    const occupiedRoomIds = new Set();
    const bookingForRoom = new Map(); 

    bookingsSnap.forEach((doc) => {
      const booking = doc.data();
      const fechaIn = new Date(booking.check_in + "T00:00:00");
      const fechaOut = new Date(booking.check_out + "T00:00:00");

      if (hoy >= fechaIn && hoy < fechaOut) {
        if (booking.rooms && Array.isArray(booking.rooms)) {
          booking.rooms.forEach(roomInfo => {
            if (roomInfo.room_id_cloudbeds) {
              const firestoreRoomId = roomsByCloudbedsId.get(String(roomInfo.room_id_cloudbeds));
              if (firestoreRoomId) {
                occupiedRoomIds.add(firestoreRoomId);
                if (!bookingForRoom.has(firestoreRoomId)) {
                   bookingForRoom.set(firestoreRoomId, booking);
                }
              }
            }
          });
        } else if (booking.room_id_cloudbeds) {
          const firestoreRoomId = roomsByCloudbedsId.get(String(booking.room_id_cloudbeds));
          if (firestoreRoomId) {
            occupiedRoomIds.add(firestoreRoomId);
            bookingForRoom.set(firestoreRoomId, booking);
          }
        }
      }
    });

    const batch = db.batch();
    let hayCambios = false;

    roomsSnap.forEach((roomDoc) => {
      const roomRef = roomDoc.ref;
      const roomData = roomDoc.data();
      const updatePayload = {};
      
      const isOccupied = occupiedRoomIds.has(roomDoc.id);
      const newStatus = isOccupied ? "Ocupada" : "Disponible";

      if (roomData.status !== newStatus && roomData.status !== "Limpieza") {
        updatePayload.status = newStatus;

        let description;
        const booking = bookingForRoom.get(roomDoc.id);

        if (newStatus === 'Ocupada') {
          description = `Habitación ${roomData.name || roomDoc.id} ocupada por ${booking?.guest_name || 'Huésped'}.`;
        } else {
          description = `Habitación ${roomData.name || roomDoc.id} ha quedado disponible.`;
        }
        
        const logRef = db.collection('activity_logs').doc();
        batch.set(logRef, {
          description: description,
          user: booking?.guest_name || 'Sistema',
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          type: 'maintenance'
        });
      }

      const pool = roomData.codes_pool;
      if (Array.isArray(pool) && pool.length > 0) {
        const nuevoCodigo = String(pool[Math.floor(Math.random() * pool.length)]);
        if (roomData.backup_code !== nuevoCodigo) {
          updatePayload.backup_code = nuevoCodigo;
          updatePayload.last_rotation = admin.firestore.FieldValue.serverTimestamp();
        }
      }

      if (Object.keys(updatePayload).length > 0) {
        batch.update(roomRef, updatePayload);
        hayCambios = true;
      }
    });

    if (hayCambios) {
      await batch.commit();
    }
    return null;
  } catch (error) {
    console.error("Error en función de mantenimiento:", error);
    return null;
  }
});


// ==========================================
// --- FUNCIÓN 3: IA CONSERJE ---
// ==========================================
exports.conserjeCall = onCall({ 
    secrets: ["GOOGLE_GENAI_API_KEY"], 
    region: "us-central1",
    cors: true,
    invoker: 'public'
}, async (request) => {
    try { 
        const aiModule = require('./conserjeflow.js'); 
        const result = await aiModule.conserjeflow(request.data);
        return { response: result };
    } catch (error) {
        throw new HttpsError('internal', error.message);
    }
});

// ==========================================
// --- FUNCIÓN 4: OBTENER TOKEN TTLOCK ---
// ==========================================
exports.obtenerTokenTTLock = onCall({ 
    region: "us-central1", 
    secrets: ["TTLOCK_CLIENT_ID", "TTLOCK_CLIENT_SECRET"] 
}, async (request) => {
    const { username, passwordRaw } = request.data || {};
    if (!username || !passwordRaw) throw new HttpsError('invalid-argument', 'Credenciales incompletas.');
    
    const md5Password = crypto.createHash('md5').update(passwordRaw).digest('hex');

    try {
        const params = new URLSearchParams({
            client_id: process.env.TTLOCK_CLIENT_ID,
            client_secret: process.env.TTLOCK_CLIENT_SECRET,
            username,
            password: md5Password,
            grant_type: 'password'
        });
        
        const response = await axios.post('https://api.ttlock.com/oauth2/token', params);
        
        if (response.data.access_token) {
            await db.collection('configuracion_sistema').doc('ttlock_auth').set({
                accessToken: response.data.access_token,
                refreshToken: response.data.refresh_token,
                uid: response.data.uid,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            return { success: true };
        }
        return { success: false, error: response.data.error_description };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// ==========================================
// --- FUNCIÓN 5: APERTURA INTELIGENTE CON RENOVACIÓN AUTO ---
// ==========================================
exports.abrirCerraduraRemote = onCall({ 
    region: "us-central1", 
    secrets: ["TTLOCK_CLIENT_ID", "TTLOCK_CLIENT_SECRET"]
}, async (request) => {
    const { booking_id, lockId: adminLockId } = request.data;
    const email = request.auth ? request.auth.token.email : "";

    // 1. Caso Admin
    if (email === ADMIN_EMAIL && adminLockId) {
        return await llamarTTLock(adminLockId, `Admin (${email})`, "Apertura remota Admin");
    }

    if (!booking_id) throw new HttpsError('invalid-argument', 'Falta booking_id.');

    // 2. BÚSQUEDA DIRECTA POR ID DE DOCUMENTO
    const bookingRef = db.collection('bookings').doc(String(booking_id).trim());
    const docSnap = await bookingRef.get();

    if (!docSnap.exists) {
        console.error("No se encontró el documento:", booking_id);
        throw new HttpsError('not-found', 'Reserva no encontrada en la base de datos.');
    }
    
    const bData = docSnap.data();
    
    // 3. OBTENER EL LOCK ID
    let lockIdReal = bData.lockId || bData.lock_id;

    if (!lockIdReal) {
        const roomId = bData.room_id_cloudbeds || bData.roomId || bData.room_number || bData.roomNumber;
        if (roomId) {
            const roomSnap = await db.collection('rooms').doc(`room-${String(roomId).replace(/^(room-)/, '')}`).get();
            lockIdReal = roomSnap.exists ? (roomSnap.data().lockId || roomSnap.data().lock_id) : null;
        }
    }

    if (!lockIdReal) {
        throw new HttpsError('internal', 'Cerradura no vinculada a esta reserva.');
    }

    // 4. LLAMAR A TTLOCK
    return await llamarTTLock(lockIdReal, bData.guest_name || "Huésped", `Apertura por huésped Hab ${bData.room_name || 'S/D'}`);
});

// HELPER TTLOCK (CON AUTO-REFRESH INTEGRADO)
async function llamarTTLock(lockId, userIdentifier, logDescription) {
    const authRef = db.collection('configuracion_sistema').doc('ttlock_auth');
    const authDoc = await authRef.get();
    let { accessToken, refreshToken } = authDoc.data() || {};
    
    if (!accessToken) return { success: false, error: "No hay token de TTLock configurado." };

    let response = await axios.post('https://api.ttlock.com/v3/lock/unlock', null, {
        params: {
            clientId: process.env.TTLOCK_CLIENT_ID,
            accessToken: accessToken,
            lockId: lockId,
            date: Date.now()
        }
    });

    // AUTO-RENOVACIÓN: Si el token venció (errcode 10003), lo renovamos en caliente
    if (response.data.errcode === 10003 && refreshToken) {
        console.log("Token de TTLock vencido. Intentando renovación automática...");
        try {
            const refreshParams = new URLSearchParams({
                client_id: process.env.TTLOCK_CLIENT_ID,
                client_secret: process.env.TTLOCK_CLIENT_SECRET,
                refresh_token: refreshToken,
                grant_type: 'refresh_token'
            });
            const refreshRes = await axios.post('https://api.ttlock.com/oauth2/token', refreshParams);
            
            if (refreshRes.data.access_token) {
                accessToken = refreshRes.data.access_token;
                // Guardamos el nuevo token
                await authRef.update({ 
                    accessToken, 
                    refreshToken: refreshRes.data.refresh_token, 
                    updatedAt: admin.firestore.FieldValue.serverTimestamp() 
                });
                
                console.log("Token renovado con éxito. Reintentando apertura...");
                // Reintentamos la apertura original con el token nuevo
                response = await axios.post('https://api.ttlock.com/v3/lock/unlock', null, {
                    params: {
                        clientId: process.env.TTLOCK_CLIENT_ID,
                        accessToken: accessToken,
                        lockId: lockId,
                        date: Date.now()
                    }
                });
            }
        } catch (refreshError) {
            console.error("Error al intentar renovar el token de TTLock:", refreshError.message);
        }
    }

    if (response.data.errcode === 0) {
        await db.collection('activity_logs').add({
            description: logDescription,
            user: userIdentifier,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            type: 'access'
        });
        return { success: true };
    }
    return { success: false, error: response.data.errmsg || "Error desconocido de la cerradura" };
}
// ==========================================
// --- FUNCIÓN 6: VALIDACIÓN OCR + ROTACIÓN INTELIGENTE IA + B&N (OPTIMIZADA) ---
// ==========================================
exports.validarDocumentoHuesped = onObjectFinalized({
    bucket: "studio-4343626376-fea63.firebasestorage.app", 
    region: "us-central1",
    memory: "512MiB",
    secrets: [REPLICATE_API_TOKEN]
}, async (event) => {
    const filePath = event.data.name;

    if (event.data.metadata && event.data.metadata.ocr_processed) {
        console.log(`File ${filePath} has already been processed. Skipping.`);
        return null;
    }
    
    if (!filePath.toLowerCase().includes('doc_') || filePath.toLowerCase().includes('avatar_')) return null;

    let folderId = filePath.split('/')[1]; 
    const finalBookingId = folderId.startsWith('booking-') ? folderId : `booking-${folderId}`;
    const cleanId = finalBookingId.replace('booking-', '');

    const fileName = filePath.split('/').pop();
    const fileNameParts = fileName.split('_');
    const guestIndex = fileNameParts.length > 1 ? parseInt(fileNameParts[1]) : 1;

    // 🛑 HELPER PARA RECHAZAR Y AVISAR AL FRONTEND
    const markAsInvalid = async (reason) => {
        console.log(`Documento rechazado (Reserva ${finalBookingId}, Huésped ${guestIndex}): ${reason}`);
        const bookingRef = db.collection('bookings').doc(finalBookingId);
        
        await db.runTransaction(async (transaction) => {
            const docSnap = await transaction.get(bookingRef);
            if (!docSnap.exists) return;
            
            const bData = docSnap.data();
            let guestsVerification = bData.guests_verification || {};
            
            if (!guestsVerification[guestIndex]) {
                guestsVerification[guestIndex] = {
                    front_uploaded: false, back_uploaded: false, front_text: "", first_name: "", last_name: "", name: "Pendiente", status: "pending", avatar_url: "", front_image_url: "", back_image_url: "", passport_url: ""
                };
            }
            
            // Cambiamos el estado a 'unmatch' para destrabar el Frontend
            guestsVerification[guestIndex].status = "unmatch";
            guestsVerification[guestIndex].front_uploaded = false; 
            
            let overallStatus = bData.document_status || "pending";
            if (!overallStatus.includes("approved")) {
                overallStatus = `unmatch ${guestIndex}`;
            }

            transaction.update(bookingRef, {
                guests_verification: guestsVerification,
                document_status: overallStatus,
                document_validated_at: admin.firestore.FieldValue.serverTimestamp() 
            });
        });
        return null;
    };

    try {
        const bucket = admin.storage().bucket(event.data.bucket);
        const file = bucket.file(filePath);
        const visionClient = new ImageAnnotatorClient();
        
        const [originalBuffer] = await file.download();
        const buffer = await sharp(originalBuffer).rotate().toBuffer(); 

        const [result] = await visionClient.annotateImage({
            image: { content: buffer },
            features: [ { type: 'TEXT_DETECTION' }, { type: 'FACE_DETECTION' } ]
        });
        
        // 🛑 CONTROL: SI NO HAY NINGÚN TEXTO
        if (!result.textAnnotations || result.textAnnotations.length === 0) {
            return await markAsInvalid("No se detectó ningún texto en la imagen.");
        }

        const fullText = result.textAnnotations[0].description;
        const upperText = fullText.toUpperCase();
        
        let isBack = false;
        let isFront = false;
        let isPassport = false;
        
        let extractedFirstName = "";
        let extractedLastName = "";
        let formattedName = "";

        // 1. ANÁLISIS MRZ (LÓGICA OPTIMIZADA)
        const unifiedText = fullText.toUpperCase().replace(/[\s\n\r]+/g, '<');
        const hasMRZ = unifiedText.includes('<<');

        if (hasMRZ) {
            isBack = true;
            
            // 1er Intento: Pasaporte
            const passportMatch = unifiedText.match(/P<[A-Z]{3}<([A-Z<]+)<<([A-Z<]+)/);
            if (passportMatch) {
                isPassport = true;
                extractedLastName = passportMatch[1].replace(/<+/g, ' ').trim().split(' ')[0];
                extractedFirstName = passportMatch[2].replace(/<+/g, ' ').trim().split(' ')[0];
            } else {
                // 2do Intento: DNI/Cédulas (Busca específicamente la línea del nombre ignorando números)
                const nameLineMatch = unifiedText.match(/([A-Z]+<+[A-Z<]+<<[A-Z<]+)/);

                if (nameLineMatch && nameLineMatch[0]) {
                    const parts = nameLineMatch[0].split('<<');
                    if (parts.length >= 2) {
                        extractedLastName = parts[0].replace(/<+/g, ' ').trim().split(' ')[0];
                        extractedFirstName = parts[1].replace(/<+/g, ' ').trim().split(' ')[0];
                    }
                } else {
                    // 3er Intento: Fallback de seguridad
                    const nameMatch = unifiedText.match(/<<([A-Z]+)[<A-Z]*/);
                    if (nameMatch && nameMatch[1]) {
                        extractedFirstName = nameMatch[1].replace(/<+/g, ' ').trim().split(' ')[0];
                    }

                    const specificLastNameMatch = unifiedText.match(/([A-Z]+(?:<+[A-Z]+)*)<<[A-Z]+/);
                    if (specificLastNameMatch && specificLastNameMatch[1]) {
                        extractedLastName = specificLastNameMatch[1].replace(/<+/g, ' ').trim().split(' ')[0];
                    }
                }
            }
        } else {
            const frontKeywords = ['REPUBLICA', 'IDENTIDAD', 'CEDULA', 'CARTEIRA', 'DNI', 'MERCOSUR', 'DOCUMENTO', 'REGISTRO', 'ORIENTAL', 'ARGENTINA', 'BRASIL'];
            if (frontKeywords.some(kw => upperText.includes(kw))) {
                isFront = true;
            } else {
                // 🛑 CONTROL: HAY TEXTO PERO NO ES UN DOCUMENTO
                return await markAsInvalid("La imagen contiene texto, pero no coincide con un documento de identidad válido."); 
            }
        }

        const capitalize = (s) => {
            if (!s) return "";
            return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
        };

        if (extractedFirstName || extractedLastName) {
            formattedName = `${capitalize(extractedFirstName)} ${capitalize(extractedLastName)}`.trim();
        }

        let imageRotationAngle = 0;
        const metadata = await sharp(buffer).metadata();
        if ((isFront || isPassport) && result.faceAnnotations && result.faceAnnotations.length > 0) {
            const roll = result.faceAnnotations[0].rollAngle;
            if (roll > 45 && roll <= 135) imageRotationAngle = -90;
            else if (roll < -45 && roll >= -135) imageRotationAngle = 90;
            else if (roll > 135 || roll < -135) imageRotationAngle = 180;
        }
        
        let document_image_url = "";
        let finalDocBuffer = buffer;
        const docBoundary = result.textAnnotations?.[0]?.boundingPoly;
        let needsSave = false;

        if (docBoundary) {
            const xs = docBoundary.vertices.map(v => v.x || 0);
            const ys = docBoundary.vertices.map(v => v.y || 0);
            const xMin = Math.max(0, Math.min(...xs));
            const yMin = Math.max(0, Math.min(...ys));
            const xMax = Math.min(metadata.width, Math.max(...xs));
            const yMax = Math.min(metadata.height, Math.max(...ys));
            
            const w = xMax - xMin;
            const h = yMax - yMin;
            const padX = Math.floor(w * 0.1);
            const padY = Math.floor(h * 0.1);

            const cropX = Math.max(0, xMin - padX);
            const cropY = Math.max(0, yMin - padY);
            const cropW = Math.min(metadata.width - cropX, w + padX * 2);
            const cropH = Math.min(metadata.height - cropY, h + padY * 2);

            if (cropW > 50 && cropH > 50) {
              finalDocBuffer = await sharp(finalDocBuffer).extract({ left: cropX, top: cropY, width: cropW, height: cropH }).toBuffer();
              needsSave = true;
            }
        }

        if (imageRotationAngle !== 0) {
            finalDocBuffer = await sharp(finalDocBuffer).rotate(imageRotationAngle).toBuffer();
            needsSave = true;
        }

        if (needsSave) {
            try {
                const finalProcessedBuffer = await sharp(finalDocBuffer).jpeg({ quality: 90 }).toBuffer();
                const newToken = crypto.randomUUID();
                
                await file.save(finalProcessedBuffer, {
                    metadata: { contentType: 'image/jpeg', metadata: { firebaseStorageDownloadTokens: newToken, ocr_processed: 'true' } }
                });
                document_image_url = `https://firebasestorage.googleapis.com/v0/b/${event.data.bucket}/o/${encodeURIComponent(filePath)}?alt=media&token=${newToken}`;
            } catch (procErr) {
                console.error("Error al guardar:", procErr);
                const [originalMetadata] = await file.getMetadata();
                let token = originalMetadata.metadata?.firebaseStorageDownloadTokens || crypto.randomUUID();
                document_image_url = `https://firebasestorage.googleapis.com/v0/b/${event.data.bucket}/o/${encodeURIComponent(filePath)}?alt=media&token=${token.split(',')[0]}`;
            }
        } else {
             const [originalMetadata] = await file.getMetadata();
             let token = originalMetadata.metadata?.firebaseStorageDownloadTokens || crypto.randomUUID();
             document_image_url = `https://firebasestorage.googleapis.com/v0/b/${event.data.bucket}/o/${encodeURIComponent(filePath)}?alt=media&token=${token.split(',')[0]}`;
             await file.setMetadata({ metadata: { ...(originalMetadata.metadata || {}), ocr_processed: 'true' }});
        }

        let avatarUrl = "";
        if ((isFront || isPassport) && result.faceAnnotations && result.faceAnnotations.length > 0) {
            try {
                const face = result.faceAnnotations[0];
                const vertices = face.fdBoundingPoly ? face.fdBoundingPoly.vertices : face.boundingPoly.vertices;
                const xs = vertices.map(v => v.x || 0);
                const ys = vertices.map(v => v.y || 0);
                const xMin = Math.min(...xs);
                const xMax = Math.max(...xs);
                const yMin = Math.min(...ys);
                const yMax = Math.max(...ys);

                const width = xMax - xMin;
                const height = yMax - yMin;
                const centerX = xMin + width / 2;
                const centerY = yMin + height / 2;
                const size = Math.max(width, height) * 1.5; 
                
                const cropLeft = Math.floor(Math.max(0, centerX - size / 2));
                const cropTop = Math.floor(Math.max(0, centerY - size / 2));
                const cropWidth = Math.floor(Math.min(size, metadata.width - cropLeft));
                const cropHeight = Math.floor(Math.min(size, metadata.height - cropTop));

                const croppedBuffer = await sharp(buffer)
                    .extract({ left: cropLeft, top: cropTop, width: cropWidth, height: cropHeight })
                    .rotate(imageRotationAngle) 
                    .jpeg({ quality: 95 })
                    .toBuffer();

                let avatarBufferToSave = croppedBuffer;

                try {
                    const token = REPLICATE_API_TOKEN.value();
                    if (token) {
                        const base64Image = `data:image/jpeg;base64,${croppedBuffer.toString('base64')}`;
                        const replicateResponse = await axios.post('https://api.replicate.com/v1/predictions', {
                            version: "7de2ea26c616d5bf2245ad0d5e24f0ff9a6204578a5c876db53142edd9d2cd56", 
                            input: { image: base64Image, upscale: 2, face_upsample: true, codeformer_fidelity: 0.9 }
                        }, { headers: { 'Authorization': `Token ${token}`, 'Content-Type': 'application/json' } });

                        let prediction = replicateResponse.data;
                        while (prediction.status !== 'succeeded' && prediction.status !== 'failed') {
                            await new Promise(r => setTimeout(r, 800));
                            const pollResponse = await axios.get(prediction.urls.get, { headers: { 'Authorization': `Token ${token}` } });
                            prediction = pollResponse.data;
                        }

                        if (prediction.status === 'succeeded' && prediction.output) {
                            const imageRes = await axios.get(prediction.output, { responseType: 'arraybuffer' });
                            avatarBufferToSave = Buffer.from(imageRes.data);
                        }
                    }
                } catch (iaError) { console.error("Error Replicate:", iaError.message); }

                const finalBnWBuffer = await sharp(avatarBufferToSave).grayscale().jpeg({ quality: 90 }).toBuffer();
                const avatarToken = crypto.randomUUID();
                const avatarPath = `checkins/${cleanId}/avatar_${guestIndex}.jpg`;
                const avatarFile = bucket.file(avatarPath);
                
                await avatarFile.save(finalBnWBuffer, {
                    metadata: { contentType: 'image/jpeg', metadata: { firebaseStorageDownloadTokens: avatarToken } }
                });

                avatarUrl = `https://firebasestorage.googleapis.com/v0/b/${event.data.bucket}/o/${encodeURIComponent(avatarPath)}?alt=media&token=${avatarToken}`;
            } catch (cropErr) { console.error("Error extracción rostro:", cropErr); }
        }

        // 5. ACTUALIZACIÓN FIRESTORE FINAL
        const bookingRef = db.collection('bookings').doc(finalBookingId);
        await db.runTransaction(async (transaction) => {
            const docSnap = await transaction.get(bookingRef);
            if (!docSnap.exists) return;

            const bData = docSnap.data();
            const guestCount = parseInt(bData.guest_count) || 1;
            let guestsVerification = bData.guests_verification || {};

            if (!guestsVerification[guestIndex]) {
                guestsVerification[guestIndex] = {
                    front_uploaded: false, back_uploaded: false, front_text: "", first_name: "", last_name: "", name: "Pendiente", status: "pending", avatar_url: "", front_image_url: "", back_image_url: "", passport_url: ""
                };
            }

            const gv = guestsVerification[guestIndex];
            
            if (avatarUrl) gv.avatar_url = avatarUrl;
            
            if (isPassport) {
                gv.is_passport = true; gv.front_uploaded = true; gv.back_uploaded = true; gv.first_name = extractedFirstName; gv.last_name = extractedLastName; gv.name = formattedName || gv.name;
                if (document_image_url) {
                    gv.passport_url = document_image_url; gv.front_image_url = document_image_url; gv.back_image_url = document_image_url;
                }
            } else if (isFront) {
                gv.front_uploaded = true; gv.front_text = upperText;
                if (document_image_url) gv.front_image_url = document_image_url;
            } else if (isBack) {
                gv.back_uploaded = true; gv.first_name = extractedFirstName; gv.last_name = extractedLastName; gv.name = formattedName || gv.name;
                if (document_image_url) gv.back_image_url = document_image_url;
            }

            if (gv.front_uploaded && gv.back_uploaded && !gv.is_passport) {
                const normalize = (str) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
                const textToSearch = normalize(gv.front_text);
                const fname = normalize(gv.first_name);
                const lname = normalize(gv.last_name);

                if (fname && lname && textToSearch.includes(fname) && textToSearch.includes(lname)) {
                    gv.status = "completed";
                } else {
                    gv.status = "unmatch"; gv.front_uploaded = false; 
                }
            } else if (gv.is_passport && gv.back_uploaded) {
                gv.status = "completed";
            } else if (gv.front_uploaded && !gv.back_uploaded) {
                gv.status = "front_only";
            } else if (!gv.front_uploaded && gv.back_uploaded) {
                gv.status = "back_only";
            }

            let overallStatus = "pending";
            let completedCount = 0;
            let partialIndex = 0;
            let unmatchIndex = 0;
            let allNames = [];

            for (let i = 1; i <= guestCount; i++) {
                const guestObj = guestsVerification[i];
                if (!guestObj) continue;
                if (guestObj.status === 'unmatch') unmatchIndex = i;
                if (guestObj.status === 'completed') {
                    completedCount++;
                    if (guestObj.name !== "Pendiente") allNames.push(guestObj.name);
                }
                if (guestObj.status === 'front_only' || guestObj.status === 'back_only') partialIndex = i;
            }

            if (unmatchIndex > 0) overallStatus = `unmatch ${unmatchIndex}`;
            else if (completedCount === guestCount) overallStatus = `approved`;
            else if (partialIndex > 0) overallStatus = `partial ${partialIndex}`;
            else if (completedCount > 0) overallStatus = `completed ${completedCount}`;

            const updatePayload = {
                document_status: overallStatus,
                guests_verification: guestsVerification, 
                last_verified_name: allNames.join(' | ') || formattedName || "Procesando...",
                document_validated_at: admin.firestore.FieldValue.serverTimestamp()
            };

            if (overallStatus === 'approved' && bData.status !== 'Checked-In' && bData.status !== 'checked_in') {
                updatePayload.status = 'Confirmed';
            }

            transaction.update(bookingRef, updatePayload);
        });

    } catch (e) { 
        console.error("OCR Error General:", e); 
        // 🛑 CONTROL: SI FALLA LA IA POR CUALQUIER MOTIVO
        return await markAsInvalid("Ocurrió un error procesando la imagen. Intenta tomar una foto más clara.");
    }
    return null;
});


// ==========================================
// --- FUNCIÓN 7: Cloudbeds ---
// ==========================================
exports.testSincronizarCloudbeds = onRequest({
    region: "us-central1"
}, async (req, res) => {
    try {
        const cbAuthDoc = await db.collection("integrations").doc("cloudbeds").get();
        const accessToken = cbAuthDoc.data().access_token.trim();

        const response = await axios.get("https://hotels.cloudbeds.com/api/v1.2/getRooms", {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });

        const dataRecibida = response.data.data;
        const batch = db.batch();
        let count = 0;

        // 1. Recorremos el array de propiedades
        dataRecibida.forEach((propiedad) => {
            // 2. Entramos al array de 'rooms' de esa propiedad
            if (propiedad.rooms && Array.isArray(propiedad.rooms)) {
                propiedad.rooms.forEach((room) => {
                    
                    const roomId = `room-${room.roomID}`;
                    const roomRef = db.collection("rooms").doc(roomId);
                    
                    // Buscamos el ID de Doorlock si existe
                    const lockField = room.customFields?.find(f => 
                        f.customFieldName.toLowerCase().includes('doorlock')
                    );

                    batch.set(roomRef, {
                        room_id_cloudbeds: room.roomID,
                        name: room.roomName || `Hab-${room.roomID}`,
                        type_name: room.roomTypeName || "Sin Tipo",
                        lockId: room.doorlockID || (lockField ? lockField.customFieldValue : null),
                        last_sync: admin.firestore.FieldValue.serverTimestamp()
                    }, { merge: true });
                    
                    count++;
                });
            }
        });

        if (count > 0) {
            await batch.commit();
            return res.status(200).send(`
                <div style="font-family: sans-serif; text-align: center; padding: 50px;">
                    <h1 style="color: #4CAF50;">¡Sincronización Exitosa!</h1>
                    <p style="font-size: 1.2em;">Se han guardado <b>${count}</b> habitaciones reales en Firestore.</p>
                    <p>Ya puedes ver <b>es(1), es(2), do(1)...</b> en tu colección 'rooms'.</p>
                </div>
            `);
        } else {
            return res.status(200).json({ mensaje: "No se encontraron habitaciones en la estructura.", data: dataRecibida });
        }

    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
});

// ==========================================
// --- FUNCIÓN 8: SINCRONIZAR RACK DE RESERVAS (MULTI-HABITACIÓN PRO) ---
// ==========================================
exports.webhookCloudbeds = onRequest({ region: "us-central1" }, async (req, res) => {
    try {
        const reservationID = req.body.reservationID || req.body.reservationId;
        
        if (!reservationID) {
            console.log("Webhook recibido sin ID válido");
            return res.status(200).send("No ID");
        }

        const db = admin.firestore();
        const cbAuthDoc = await db.collection("integrations").doc("cloudbeds").get();
        const accessToken = cbAuthDoc.data().access_token.trim();

        const axios = require('axios');
        const detalleResponse = await axios.get("https://hotels.cloudbeds.com/api/v1.2/getReservation", {
            params: { reservationID },
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });

        const d = detalleResponse.data.data;
        
        const nombreCloudbeds = d.guestName || `${d.firstName || ""} ${d.lastName || ""}`.trim();
        const nombreFinal = nombreCloudbeds || "Huésped";

        // --- NUEVA LÓGICA DE SALDO Y PAGO ---
        const saldoPendiente = parseFloat(d.balance || 0);
        let statusPago = "completed"; // Asumimos pagado por defecto
        
        // Si el balance es mayor a 0 y la reserva no está cancelada/no show
        if (saldoPendiente > 0 && d.status !== 'canceled' && d.status !== 'no_show') {
            statusPago = "pending";
        }
        // ------------------------------------

        let totalGuests = 0;
        let roomsAssigned = [];
        
        const allRooms = [];
        if (d.assigned && d.assigned.length > 0) allRooms.push(...d.assigned);
        if (d.unassigned && d.unassigned.length > 0) allRooms.push(...d.unassigned);

        // Recorremos TODAS las habitaciones asignadas
        for (const room of allRooms) {
            const adults = parseInt(room.adults) || 0;
            const children = parseInt(room.children) || 0;
            
            // Calculamos huéspedes por habitación (mínimo 1 por cuarto para exigir 1 foto)
            let roomGuests = adults + children;
            if (roomGuests === 0) roomGuests = 1; 
            
            totalGuests += roomGuests;

            let lockId = null;

            if (room.roomID) {
                try {
                    const roomDetailsResponse = await axios.get("https://hotels.cloudbeds.com/api/v1.2/getRooms", {
                         params: { roomID: room.roomID },
                         headers: { 'Authorization': `Bearer ${accessToken}` }
                    });

                    const rData = roomDetailsResponse.data.data?.[0]?.rooms?.[0];
                    if (rData) {
                        const lockField = rData.customFields?.find(f => f.customFieldName.toLowerCase().includes('doorlock'));
                        lockId = rData.doorlockID || (lockField ? lockField.customFieldValue : null);

                        if (lockId) {
                            await db.collection("rooms").doc(`room-${room.roomID}`).update({ lockId: lockId });
                        }
                    }
                } catch(e) {
                     console.error(`Error sincronizando Lock ID para hab ${room.roomID}: `, e.message);
                }
            }

            roomsAssigned.push({
                sub_reservation_id: room.subReservationID || reservationID,
                room_id_cloudbeds: room.roomID || null,
                room_name: room.roomName || "No asignada",
                lock_id: lockId,
                guest_count: roomGuests 
            });
        }

        if (totalGuests === 0) totalGuests = 1;

        const bookingRef = db.collection("bookings").doc(`booking-${reservationID}`);
        await bookingRef.set({
            booking_id_cloudbeds: reservationID,
            guest_name: nombreFinal,
            check_in: d.startDate,
            check_out: d.endDate,
            status: d.status,
            // NUEVOS CAMPOS A GUARDAR EN FIRESTORE
            pay_status: statusPago,
            balance: saldoPendiente,
            access_enabled: true, 
            // ------------------------------------
            rooms: roomsAssigned, 
            room_id_cloudbeds: roomsAssigned[0]?.room_id_cloudbeds || null,
            room_name: roomsAssigned.map(r => r.room_name).join(" + ") || "No asignada",
            lock_id: roomsAssigned[0]?.lock_id || null,
            guest_count: totalGuests,
            last_sync: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        
        console.log(`✅ Webhook: Reserva ${reservationID} actualizada. Saldo: $${saldoPendiente} (${statusPago}).`);
        return res.status(200).send("OK");

    } catch (error) {
        console.error("❌ Error Webhook:", error.message);
        return res.status(200).send("Error procesado");
    }
});

// ==========================================
// --- FUNCIÓN DE UTILIDAD: SINCRONIZAR TODAS LAS HABITACIONES ---
// ==========================================
exports.syncAllRooms = onRequest({ region: "us-central1" }, async (req, res) => {
    try {
        const db = admin.firestore();
        
        // 1. Obtener credenciales de Cloudbeds
        const cbAuthDoc = await db.collection("integrations").doc("cloudbeds").get();
        if (!cbAuthDoc.exists) return res.status(400).send("No hay credenciales de Cloudbeds.");
        
        const accessToken = cbAuthDoc.data().access_token.trim();
        const axios = require('axios');

        console.log("Iniciando sincronización masiva de habitaciones...");

        // 2. Pedir TODAS las habitaciones a Cloudbeds (propertyID está implícito en el token)
        const roomsResponse = await axios.get("https://hotels.cloudbeds.com/api/v1.2/getRooms", {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });

        const properties = roomsResponse.data.data;
        if (!properties || properties.length === 0) {
             return res.status(200).send("No se encontraron propiedades.");
        }

        const roomsList = properties[0].rooms || [];
        let updatedCount = 0;

        // 3. Procesar cada habitación y actualizar Firestore
        for (const room of roomsList) {
            const roomId = room.roomID;
            const roomName = room.roomName;
            
            // Buscar el Custom Field del Lock ID
            const lockField = room.customFields?.find(f => f.customFieldName.toLowerCase().includes('doorlock'));
            const lockId = room.doorlockID || (lockField ? lockField.customFieldValue : null) || "";

            const roomRef = db.collection("rooms").doc(`room-${roomId}`);
            
            // Guardar usando merge para no pisar el backup_code si ya existe
            await roomRef.set({
                id: `room-${roomId}`,
                room_id_cloudbeds: roomId,
                name: roomName,
                lockId: lockId,
                last_sync: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });

            updatedCount++;
            console.log(`Actualizada hab: ${roomName} (ID: ${roomId}) - Lock: ${lockId}`);
        }

        return res.status(200).json({ 
            success: true, 
            message: `Sincronización completa. ${updatedCount} habitaciones actualizadas.`,
            rooms_processed: updatedCount
        });

    } catch (error) {
        console.error("❌ Error Sincronizando Habitaciones:", error.message);
        return res.status(500).json({ success: false, error: error.message });
    }
});

// ==========================================
// --- FUNCIÓN 9: INTEGRACIÓN PLEXO (WCF + PUERTO 4043) ---
// ==========================================
exports.crearPagoPlexo = onCall({
    region: "us-central1",
    cors: true
}, async (request) => {
    const data = request.data || {};
    const bookingId = data.bookingId ? String(data.bookingId) : "TEST-001";
    const amount = data.amount ? parseFloat(data.amount) : 1500.0;
    
    try {
        const pemPath = path.join(__dirname, 'private_key.pem');
        const privateKey = fs.readFileSync(pemPath, 'utf8');

        // El fingerprint exacto de SkyRoomsTest
        const PLEXO_FINGERPRINT = "A730BD63766B54048F8F9A2FCCB9BD42802D71ED"; 

        const requestInterno = {
            Action: 35, // 35 es crear pago
            Amount: amount,
            Currency: "UYU",
            ClientInformation: {
                Name: "Huesped de Prueba", 
                Email: "test@skyrooms.uy",
            },
            MetaReference: bookingId,
            RedirectUri: "https://skyrooms.uy/"
        };

        const objetoAFirmar = {
            Fingerprint: PLEXO_FINGERPRINT,
            Object: {
                Client: "SkyRoomsTest",
                Request: requestInterno
            },
            UTCUnixTimeExpiration: Math.floor((Date.now() + 300000) / 1000) // 5 minutos
        };

        const jsonCanonizado = JSON.stringify(objetoAFirmar);

        const sign = crypto.createSign('SHA512');
        sign.update(jsonCanonizado);
        const signature = sign.sign({ 
            key: privateKey, 
            padding: crypto.constants.RSA_PKCS1_PADDING 
        }, 'base64');

        const payloadFinal = {
            Object: objetoAFirmar,
            Signature: signature
        };

        console.log("Enviando JSON a Plexo...");

        // ¡EL DESCUBRIMIENTO DE GABRIEL! Agregamos el :4043 y la ruta AuthorizeJSON
        const PLEXO_API_URL = "https://testing.plexo.com.uy:4043/SecurePaymentGateway.svc/AuthorizeJSON";

        const response = await axios.post(PLEXO_API_URL, payloadFinal, {
            headers: { 'Content-Type': 'application/json; charset=utf-8' }
        });

        console.log("Respuesta del banco:", JSON.stringify(response.data));

        const resultado = response.data.AuthorizeJSONResult || response.data;

        if (resultado && resultado.RedirectUrl) {
            return { success: true, payment_url: resultado.RedirectUrl };
        } else if (resultado && resultado.Error) {
             throw new Error(resultado.Error);
        } else {
            return { success: false, error: "Estructura inesperada del banco" };
        }

    } catch (error) {
        const status = error.response ? error.response.status : "No status";
        const errorData = error.response && error.response.data ? JSON.stringify(error.response.data) : error.message;
        
        console.error(`Error HTTP ${status} en Plexo:`, errorData);
        throw new HttpsError('internal', `Plexo rechazó la solicitud (Status: ${status}). Revisa los logs.`);
    }
});
// ==========================================
// --- FUNCIÓN 10: MOTOR DE UPSELLING REAL ---
// ==========================================
exports.verificarUpgrade = onCall({
    region: "us-central1",
    cors: true
}, async (request) => {
    const data = request.data || {};
    const bookingId = data.bookingId;

    if (!bookingId) {
        throw new HttpsError('invalid-argument', 'Falta el ID de la reserva.');
    }

    // 1. Definimos tu jerarquía real y los precios EXTRA por NOCHE (Ajusta estos valores)
    const jerarquia = [
        { name: "Estándar", extra: 0 },
        { name: "Doble Superior", extra: 500 }, 
        { name: "Deluxe King", extra: 1000 },
        { name: "Suites con Hidromasaje", extra: 1800 }
    ];

    try {
        const cbAuthDoc = await db.collection("integrations").doc("cloudbeds").get();
        const cloudbedsToken = cbAuthDoc.data().access_token.trim();

        // 2. Traemos la reserva actual
        const resResponse = await axios.get("https://hotels.cloudbeds.com/api/v1.2/getReservation", {
            params: { reservationID: bookingId },
            headers: { 'Authorization': `Bearer ${cloudbedsToken}` }
        });

        const reserva = resResponse.data.data;
        // Obtenemos el nombre del tipo de habitación actual (ej: "Estándar")
        const habitacionActual = reserva.assigned[0]?.roomTypeName || "";
        const cantHuespedes = parseInt(reserva.adults) + parseInt(reserva.children || 0);

        // 3. Buscamos cuál es la categoría que le sigue
        const indexActual = jerarquia.findIndex(h => habitacionActual.includes(h.name));
        
        // Si no la encontramos o ya está en la mejor, no ofrecemos nada
        if (indexActual === -1 || indexActual === jerarquia.length - 1) {
            return { available: false, reason: "Categoría máxima alcanzada." };
        }

        const objetivo = jerarquia[indexActual + 1];

        // 4. Consultamos disponibilidad real para la categoría objetivo
        const availResponse = await axios.get("https://hotels.cloudbeds.com/api/v1.2/getAvailability", {
            params: { 
                propertyID: reserva.propertyID, 
                startDate: reserva.startDate, 
                endDate: reserva.endDate 
            },
            headers: { 'Authorization': `Bearer ${cloudbedsToken}` }
        });

        const tiposDisponibles = availResponse.data.data;
        const infoDisponibilidad = tiposDisponibles.find(t => t.roomTypeName.includes(objetivo.name));

        // 5. Si hay disponibilidad real (> 0), calculamos la oferta
        if (infoDisponibilidad && parseInt(infoDisponibilidad.available) > 0) {
            const noches = Math.ceil(Math.abs(new Date(reserva.endDate) - new Date(reserva.startDate)) / (1000 * 60 * 60 * 24));
            
            // Cálculo pedido: (Precio Extra por noche / Cantidad de Huéspedes)
            const precioPorPersonaDia = Math.round(objetivo.extra / cantHuespedes);
            const diferenciaTotal = objetivo.extra * noches;

            return {
                available: true,
                offer: {
                    newRoomName: objetivo.name,
                    pricePerGuestDay: precioPorPersonaDia,
                    totalDifference: diferenciaTotal,
                    nights: noches,
                    guestCount: cantHuespedes,
                    description: `Mejora tu estancia a una ${objetivo.name} y disfruta de una experiencia superior.`
                }
            };
        }

        return { available: false, reason: "Sin disponibilidad en la categoría superior." };

    } catch (error) {
        console.error("Error en motor de upgrade:", error.message);
        throw new HttpsError('internal', 'Error consultando disponibilidad.');
    }
});