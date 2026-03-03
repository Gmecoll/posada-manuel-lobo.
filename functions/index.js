// 1. IMPORTACIONES ÚNICAS
const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onObjectFinalized } = require("firebase-functions/v2/storage");
const { defineSecret } = require('firebase-functions/params');
const logger = require("firebase-functions/logger"); 
const admin = require('firebase-admin');
const axios = require('axios');
const crypto = require('crypto');

// 2. INICIALIZACIÓN ÚNICA
if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();

// 3. CONFIGURACIONES Y SECRETOS
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
        
        // 1. Configurar cliente de MP
        const client = new MercadoPagoConfig({ accessToken: process.env.MERCADO_PAGO_ACCESS_TOKEN });
        const preference = new Preference(client);
        
        // 2. Armar la preferencia de Mercado Pago
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

        // 3. Registrar en Firestore (Colección orders)
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

        // 4. Webhook a Make.com
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
// --- FUNCIÓN 5: APERTURA INTELIGENTE (CORREGIDA) ---
// ==========================================
exports.abrirCerraduraRemote = onCall({ 
    region: "us-central1", 
    secrets: ["TTLOCK_CLIENT_ID"]
}, async (request) => {
    const { booking_id, lockId: adminLockId } = request.data;
    const email = request.auth ? request.auth.token.email : "";

    // 1. Caso Admin
    if (email === ADMIN_EMAIL && adminLockId) {
        return await llamarTTLock(adminLockId, `Admin (${email})`, "Apertura remota Admin");
    }

    if (!booking_id) throw new HttpsError('invalid-argument', 'Falta booking_id.');

    // 2. BÚSQUEDA DIRECTA POR ID DE DOCUMENTO (Elimina el error de "Reserva no encontrada")
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

// HELPER TTLOCK
async function llamarTTLock(lockId, userIdentifier, logDescription) {
    const authDoc = await db.collection('configuracion_sistema').doc('ttlock_auth').get();
    const token = authDoc.data()?.accessToken;
    
    const response = await axios.post('https://api.ttlock.com/v3/lock/unlock', null, {
        params: {
            clientId: process.env.TTLOCK_CLIENT_ID,
            accessToken: token,
            lockId: lockId,
            date: Date.now()
        }
    });

    if (response.data.errcode === 0) {
        await db.collection('activity_logs').add({
            description: logDescription,
            user: userIdentifier,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            type: 'access'
        });
        return { success: true };
    }
    return { success: false, error: response.data.errmsg };
}

// ==========================================
// --- FUNCIÓN 6: LISTAR CERRADURAS ---
// ==========================================
exports.listarCerradurasTTLock = onCall({ 
    region: "us-central1", 
    secrets: ["TTLOCK_CLIENT_ID", "TTLOCK_CLIENT_SECRET"]
}, async (request) => {
    try {
        const authRef = db.collection('configuracion_sistema').doc('ttlock_auth');
        const authDoc = await authRef.get();
        let { accessToken, refreshToken } = authDoc.data();

        let response = await axios.get('https://api.ttlock.com/v3/lock/list', {
            params: { clientId: process.env.TTLOCK_CLIENT_ID, accessToken, pageNo: 1, pageSize: 100, date: Date.now() }
        });

        if (response.data.errcode === 10003) { 
            const params = new URLSearchParams({
                client_id: process.env.TTLOCK_CLIENT_ID,
                client_secret: process.env.TTLOCK_CLIENT_SECRET,
                refresh_token: refreshToken,
                grant_type: 'refresh_token'
            });
            const refreshRes = await axios.post('https://api.ttlock.com/oauth2/token', params);
            if (refreshRes.data.access_token) {
                accessToken = refreshRes.data.access_token;
                await authRef.update({ accessToken, refreshToken: refreshRes.data.refresh_token, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
                response = await axios.get('https://api.ttlock.com/v3/lock/list', {
                    params: { clientId: process.env.TTLOCK_CLIENT_ID, accessToken, pageNo: 1, pageSize: 100, date: Date.now() }
                });
            }
        }
        return { success: true, list: response.data.list || [] };
    } catch (error) {
        throw new HttpsError('internal', error.message);
    }
});

// ==========================================
// --- FUNCIÓN 7: VALIDACIÓN OCR + ROTACIÓN INTELIGENTE IA + B&N ---
// ==========================================
exports.validarDocumentoHuesped = onObjectFinalized({
    region: "us-central1",
    memory: "512MiB",
    secrets: [REPLICATE_API_TOKEN]
}, async (event) => {
    const filePath = event.data.name; 
    
    if (!filePath.toLowerCase().includes('doc_') || filePath.toLowerCase().includes('avatar_')) return null;

    let folderId = filePath.split('/')[1]; 
    const finalBookingId = folderId.startsWith('booking-') ? folderId : `booking-${folderId}`;
    const cleanId = finalBookingId.replace('booking-', '');

    const fileName = filePath.split('/').pop();
    const fileNameParts = fileName.split('_');
    const guestIndex = fileNameParts.length > 1 ? parseInt(fileNameParts[1]) : 1;

    try {
        const bucket = admin.storage().bucket(event.data.bucket);
        const file = bucket.file(filePath);
        const sharp = require('sharp');

        // DESCARGAMOS EL BUFFER ORIGINAL Y CORREGIMOS ROTACIÓN EXIF
        const [originalBuffer] = await file.download();
        const buffer = await sharp(originalBuffer).rotate().toBuffer(); // AUTO-ROTATE-EXIF

        const vision = require('@google-cloud/vision');
        const visionClient = new vision.ImageAnnotatorClient();
        
        const [result] = await visionClient.annotateImage({
            image: { content: buffer }, // Usar el buffer corregido
            features: [ { type: 'TEXT_DETECTION' }, { type: 'FACE_DETECTION' } ]
        });
        
        if (!result.textAnnotations || result.textAnnotations.length === 0) return null;

        const fullText = result.textAnnotations[0].description;
        const upperText = fullText.toUpperCase();
        
        let isBack = false;
        let isFront = false;
        let isPassport = false;
        
        let extractedFirstName = "";
        let extractedLastName = "";
        let formattedName = "";

        // ✨ 1. ANÁLISIS MRZ (NUEVA LÓGICA ANTI-ESPACIOS)
        // Convertimos todos los espacios y saltos de línea en '<' para estandarizar el código MRZ
        const unifiedText = fullText.toUpperCase().replace(/[\s\n\r]+/g, '<');
        const hasMRZ = unifiedText.includes('<<');

        if (hasMRZ) {
            isBack = true; 
            
            // Pasaportes
            const passportMatch = unifiedText.match(/P<[A-Z]{3}<*([A-Z]+)<<+([A-Z]+)/);
            if (passportMatch) {
                isPassport = true;
                extractedLastName = passportMatch[1];
                extractedFirstName = passportMatch[2];
            } else {
                // Cédulas: Apellido (Acepta <<, números opcionales, y < adicionales)
                const td1SurnameMatch = unifiedText.match(/<<+[0-9O]?<*([A-Z]+)</); 
                if (td1SurnameMatch) extractedLastName = td1SurnameMatch[1];
                
                // Cédulas: Nombre (Busca letras seguidas de <<, y frena en el próximo <)
                const td1NameMatch = unifiedText.match(/[A-Z]<<+<*([A-Z]+)(?:<|$)/);
                if (td1NameMatch) extractedFirstName = td1NameMatch[1];
            }
        } else {
            const frontKeywords = ['REPUBLICA', 'IDENTIDAD', 'CEDULA', 'CARTEIRA', 'DNI', 'MERCOSUR', 'DOCUMENTO', 'REGISTRO', 'ORIENTAL', 'ARGENTINA', 'BRASIL'];
            const foundKeywords = frontKeywords.filter(kw => unifiedText.includes(kw));
            if (foundKeywords.length > 0) isFront = true;
            else return null; 
        }

        const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
        if (extractedFirstName || extractedLastName) {
            formattedName = `${capitalize(extractedFirstName)} ${capitalize(extractedLastName)}`.trim();
        }

        // 2. LÓGICA DE ROTACIÓN INTELIGENTE (SIMPLIFICADA)
        let imageRotationAngle = 0;
        const metadata = await sharp(buffer).metadata();

        // Solo aplicamos rotación inteligente para el anverso o pasaportes que contengan un rostro.
        // Se elimina el fallback por texto para evitar los errores de orientación incorrecta en el dorso.
        if ((isFront || isPassport) && result.faceAnnotations && result.faceAnnotations.length > 0) {
            const roll = result.faceAnnotations[0].rollAngle;
            if (roll > 45 && roll <= 135) imageRotationAngle = -90; // Rotado a la izquierda, corregir a la derecha
            else if (roll < -45 && roll >= -135) imageRotationAngle = 90; // Rotado a la derecha, corregir a la izquierda
            else if (roll > 135 || roll < -135) imageRotationAngle = 180; // Al revés
        }
        
        // ✨ 3. RECORTE Y GUARDADO DEL DOCUMENTO (CON PADDING Y ANTI-CACHÉ)
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

            // Añadimos un 5% de margen para que no quede cortado muy al ras
            const padX = Math.floor(w * 0.05);
            const padY = Math.floor(h * 0.05);

            const cropX = Math.max(0, xMin - padX);
            const cropY = Math.max(0, yMin - padY);
            const cropW = Math.min(metadata.width - cropX, w + padX * 2);
            const cropH = Math.min(metadata.height - cropY, h + padY * 2);

            if (cropW > 50 && cropH > 50) {
              finalDocBuffer = await sharp(finalDocBuffer)
                  .extract({ left: cropX, top: cropY, width: cropW, height: cropH })
                  .toBuffer();
              needsSave = true;
            }
        }

        if (imageRotationAngle !== 0) {
            finalDocBuffer = await sharp(finalDocBuffer).rotate(imageRotationAngle).toBuffer();
            needsSave = true;
        }

        if (needsSave) {
            try {
                console.log('Guardando documento procesado (recortado/rotado)...');
                const finalProcessedBuffer = await sharp(finalDocBuffer).jpeg({ quality: 90 }).toBuffer();
                const crypto = require('crypto');
                
                // Generamos un NUEVO token para "romper" la caché del navegador
                const newToken = crypto.randomUUID();
                
                await file.save(finalProcessedBuffer, {
                    metadata: { 
                        contentType: 'image/jpeg',
                        metadata: { firebaseStorageDownloadTokens: newToken }
                    }
                });
                document_image_url = `https://firebasestorage.googleapis.com/v0/b/${event.data.bucket}/o/${encodeURIComponent(filePath)}?alt=media&token=${newToken}`;
            } catch (procErr) {
                console.error("Error al guardar el documento procesado:", procErr);
                const [originalMetadata] = await file.getMetadata();
                let token = originalMetadata.metadata?.firebaseStorageDownloadTokens || require('crypto').randomUUID();
                document_image_url = `https://firebasestorage.googleapis.com/v0/b/${event.data.bucket}/o/${encodeURIComponent(filePath)}?alt=media&token=${token.split(',')[0]}`;
            }
        } else {
             const [originalMetadata] = await file.getMetadata();
             let token = originalMetadata.metadata?.firebaseStorageDownloadTokens || require('crypto').randomUUID();
             document_image_url = `https://firebasestorage.googleapis.com/v0/b/${event.data.bucket}/o/${encodeURIComponent(filePath)}?alt=media&token=${token.split(',')[0]}`;
        }


        // 4. EXTRACCIÓN Y RESTAURACIÓN FACIAL (B&N)
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

                let width = xMax - xMin;
                let height = yMax - yMin;
                const padX = Math.floor(width * 0.30); 
                const padY = Math.floor(height * 0.40);

                const finalX = Math.max(0, xMin - padX);
                const finalY = Math.max(0, yMin - padY);
                const finalW = width + (padX * 2);
                const finalH = height + (padY * 2);
                
                const cropW = Math.min(finalW, metadata.width - finalX);
                const cropH = Math.min(finalH, metadata.height - finalY);

                const croppedBuffer = await sharp(buffer)
                    .extract({ left: finalX, top: finalY, width: cropW, height: cropH })
                    .rotate(imageRotationAngle) 
                    .jpeg({ quality: 95 })
                    .toBuffer();

                let avatarBufferToSave = croppedBuffer;

                try {
                    const axios = require('axios');
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
                const crypto = require('crypto');
                const avatarToken = crypto.randomUUID();
                const avatarPath = `checkins/${cleanId}/avatar_${guestIndex}.jpg`;
                const avatarFile = bucket.file(avatarPath);
                
                await avatarFile.save(finalBnWBuffer, {
                    metadata: { contentType: 'image/jpeg', metadata: { firebaseStorageDownloadTokens: avatarToken } }
                });

                avatarUrl = `https://firebasestorage.googleapis.com/v0/b/${event.data.bucket}/o/${encodeURIComponent(avatarPath)}?alt=media&token=${avatarToken}`;
            } catch (cropErr) { console.error("Error extracción rostro:", cropErr); }
        }

        // 5. ACTUALIZACIÓN FIRESTORE
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
                    gv.passport_url = document_image_url;
                    gv.front_image_url = document_image_url;
                    gv.back_image_url = document_image_url;
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

    } catch (e) { console.error("OCR Error:", e); }
    return null;
});
// ==========================================
// --- FUNCIÓN 8: Cloudbeds ---
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
// --- FUNCIÓN 9: SINCRONIZAR RACK DE RESERVAS (MULTI-HABITACIÓN PRO) ---
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
                guest_count: roomGuests // ✨ NUEVO: Huéspedes específicos de esta habitación
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
            rooms: roomsAssigned, 
            room_id_cloudbeds: roomsAssigned[0]?.room_id_cloudbeds || null,
            room_name: roomsAssigned.map(r => r.room_name).join(" + ") || "No asignada",
            lock_id: roomsAssigned[0]?.lock_id || null,
            guest_count: totalGuests,
            last_sync: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        
        console.log(`✅ Webhook: Reserva ${reservationID} actualizada con éxito (${roomsAssigned.length} habitaciones).`);
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

        // Cloudbeds devuelve un array de propiedades, tomamos la primera
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

    