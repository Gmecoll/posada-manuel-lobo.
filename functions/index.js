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
      db.collection("bookings").where("status", "in", ["Checked-In", "Bloqueada", "Confirmed"]).get(),
    ]);

    if (roomsSnap.empty) return null;

    const occupiedRooms = new Set();
    bookingsSnap.forEach((doc) => {
      const booking = doc.data();
      const fechaIn = new Date(booking.checkInDate + "T00:00:00");
      const fechaOut = new Date(booking.checkOutDate + "T00:00:00");
      if (hoy >= fechaIn && hoy < fechaOut) occupiedRooms.add(booking.roomId);
    });

    const batch = db.batch();
    let hayCambios = false;

    roomsSnap.forEach((roomDoc) => {
      const roomRef = roomDoc.ref;
      const roomData = roomDoc.data();
      const updatePayload = {};
      const newStatus = occupiedRooms.has(roomDoc.id) ? "Ocupada" : "Disponible";

      if (roomData.status !== newStatus && roomData.status !== "Limpieza") updatePayload.status = newStatus;

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

    if (hayCambios) await batch.commit();
    return null;
  } catch (error) {
    console.error("Error mantenimiento:", error);
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
// --- FUNCIÓN 7: VALIDACIÓN OCR + RESTAURACIÓN FACIAL (B&N FINAL) ---
// ==========================================
exports.validarDocumentoHuesped = onObjectFinalized({
    region: "us-central1",
    memory: "512MiB",
    secrets: [REPLICATE_API_TOKEN]
}, async (event) => {
    const filePath = event.data.name; 
    
    if (!filePath.toLowerCase().includes('doc_')) return null;

    let folderId = filePath.split('/')[1]; 
    const finalBookingId = folderId.startsWith('booking-') ? folderId : `booking-${folderId}`;
    const cleanId = finalBookingId.replace('booking-', '');

    const fileName = filePath.split('/').pop();
    const fileNameParts = fileName.split('_');
    const guestIndex = fileNameParts.length > 1 ? parseInt(fileNameParts[1]) : 1;

    try {
        const vision = require('@google-cloud/vision');
        const visionClient = new vision.ImageAnnotatorClient();
        
        const [result] = await visionClient.annotateImage({
            image: { source: { imageUri: `gs://${event.data.bucket}/${filePath}` } },
            features: [
                { type: 'TEXT_DETECTION' }, 
                { type: 'FACE_DETECTION' }
            ]
        });
        
        if (!result.textAnnotations || result.textAnnotations.length === 0) return null;

        const fullText = result.textAnnotations[0].description;
        const upperText = fullText.toUpperCase();
        const lowerText = fullText.toLowerCase();

        let isBack = false;
        let isFront = false;
        let isPassport = lowerText.includes('pasaporte') || lowerText.includes('passport');
        
        let extractedFirstName = "";
        let extractedLastName = "";
        let formattedName = "";

        // ✨ 1. ANÁLISIS MRZ EXACTO (LA LÓGICA DE GABRIEL)
        // Unimos todo el texto para que los saltos de línea del OCR no rompan el código
        const unifiedText = fullText.replace(/[\s\n\r]/g, '').toUpperCase();
        
        // CÉDULAS (TD1): El apellido está entre <<0 y < (Usamos [0-9] por si el dígito verificador es otro número)
        const td1SurnameMatch = unifiedText.match(/<<[0-9]([A-Z]+)</); 
        // CÉDULAS (TD1): El nombre está entre << y < 
        const td1NameMatch = unifiedText.match(/[A-Z]<<([A-Z]+)</);

        // PASAPORTES (TD3): P<URYAPELLIDO<<NOMBRE<
        const passportMatch = unifiedText.match(/P<[A-Z]{3}([A-Z]+)<<([A-Z]+)</);

        if (td1SurnameMatch && td1NameMatch) {
            isBack = true;
            extractedLastName = td1SurnameMatch[1];
            extractedFirstName = td1NameMatch[1];
        } else if (passportMatch) {
            isPassport = true;
            isBack = true;
            extractedLastName = passportMatch[1];
            extractedFirstName = passportMatch[2];
        } else {
            // Si no encontramos códigos ICAO, buscamos si es el frente
            const frontKeywords = ['republica', 'identidad', 'cedula', 'carteira', 'dni', 'mercosur', 'nacional', 'documento', 'registro', 'oriental', 'argentina', 'brasil'];
            const foundKeywords = frontKeywords.filter(kw => lowerText.includes(kw));
            if (foundKeywords.length > 0) isFront = true;
            else return null; 
        }

        const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
        if (extractedFirstName || extractedLastName) {
            formattedName = `${capitalize(extractedFirstName)} ${capitalize(extractedLastName)}`.trim();
        }

        // 2. EXTRACCIÓN Y RESTAURACIÓN FACIAL (CONVERSIÓN A B&N)
        let avatarUrl = "";
        if ((isFront || isPassport || isBack) && result.faceAnnotations && result.faceAnnotations.length > 0) {
            try {
                console.log("Rostro detectado, iniciando recorte...");
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

                const admin = require('firebase-admin');
                const bucket = admin.storage().bucket(event.data.bucket);
                const file = bucket.file(filePath);
                const [buffer] = await file.download();

                const sharp = require('sharp');
                const metadata = await sharp(buffer).metadata();
                
                const cropW = Math.min(finalW, metadata.width - finalX);
                const cropH = Math.min(finalH, metadata.height - finalY);

                const croppedBuffer = await sharp(buffer)
                    .extract({ left: finalX, top: finalY, width: cropW, height: cropH })
                    .jpeg({ quality: 95 })
                    .toBuffer();

                let avatarBufferToSave = croppedBuffer;

                // --- IA DE RESTAURACIÓN (CODEFORMER 0.9) ---
                try {
                    const axios = require('axios');
                    const token = REPLICATE_API_TOKEN.value();
                    if (token) {
                        console.log("Enviando a Replicate (CodeFormer 0.9)...");
                        const base64Image = `data:image/jpeg;base64,${croppedBuffer.toString('base64')}`;
                        
                        const replicateResponse = await axios.post('https://api.replicate.com/v1/predictions', {
                            version: "7de2ea26c616d5bf2245ad0d5e24f0ff9a6204578a5c876db53142edd9d2cd56", 
                            input: { 
                                image: base64Image, 
                                upscale: 2, 
                                face_upsample: true,
                                codeformer_fidelity: 0.9 
                            }
                        }, {
                            headers: { 'Authorization': `Token ${token}`, 'Content-Type': 'application/json' }
                        });

                        let prediction = replicateResponse.data;
                        while (prediction.status !== 'succeeded' && prediction.status !== 'failed') {
                            await new Promise(resolve => setTimeout(resolve, 800));
                            const pollResponse = await axios.get(prediction.urls.get, {
                                headers: { 'Authorization': `Token ${token}` }
                            });
                            prediction = pollResponse.data;
                        }

                        if (prediction.status === 'succeeded' && prediction.output) {
                            console.log("¡Restauración exitosa! Descargando...");
                            const imageRes = await axios.get(prediction.output, { responseType: 'arraybuffer' });
                            avatarBufferToSave = Buffer.from(imageRes.data);
                        }
                    }
                } catch (iaError) { console.error("Error Replicate:", iaError.message); }

                console.log("Convirtiendo avatar final a Blanco y Negro...");
                const finalBnWBuffer = await sharp(avatarBufferToSave)
                    .grayscale() 
                    .jpeg({ quality: 90 })
                    .toBuffer();

                const crypto = require('crypto');
                const accessToken = crypto.randomUUID();
                const avatarPath = `checkins/${cleanId}/avatar_${guestIndex}.jpg`;
                const avatarFile = bucket.file(avatarPath);
                
                await avatarFile.save(finalBnWBuffer, {
                    metadata: { 
                        contentType: 'image/jpeg',
                        metadata: { firebaseStorageDownloadTokens: accessToken }
                    }
                });

                avatarUrl = `https://firebasestorage.googleapis.com/v0/b/${event.data.bucket}/o/${encodeURIComponent(avatarPath)}?alt=media&token=${accessToken}`;
                console.log("Avatar B&N guardado con éxito:", avatarUrl);

            } catch (cropErr) { console.error("Error extracción rostro:", cropErr); }
        }

        // 3. ACTUALIZACIÓN FIRESTORE
        const bookingRef = db.collection('bookings').doc(finalBookingId);
        await db.runTransaction(async (transaction) => {
            const docSnap = await transaction.get(bookingRef);
            if (!docSnap.exists) return;

            const bData = docSnap.data();
            const guestCount = parseInt(bData.guest_count) || 1;
            let guestsVerification = bData.guests_verification || {};

            if (!guestsVerification[guestIndex]) {
                guestsVerification[guestIndex] = {
                    front_uploaded: false,
                    back_uploaded: false,
                    front_text: "", 
                    first_name: "",
                    last_name: "",
                    name: "Pendiente",
                    status: "pending",
                    avatar_url: ""
                };
            }

            const gv = guestsVerification[guestIndex];
            if (avatarUrl) gv.avatar_url = avatarUrl;
            if (isFront) { gv.front_uploaded = true; gv.front_text = upperText; }
            if (isBack) {
                gv.back_uploaded = true;
                gv.first_name = extractedFirstName;
                gv.last_name = extractedLastName;
                gv.name = formattedName || gv.name;
                if (isPassport) { gv.is_passport = true; gv.front_uploaded = true; }
            }

            // Validar estados
            if (gv.front_uploaded && gv.back_uploaded && !gv.is_passport) {
                const normalize = (str) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
                const textToSearch = normalize(gv.front_text);
                const fname = normalize(gv.first_name);
                const lname = normalize(gv.last_name);

                if (fname && lname && textToSearch.includes(fname) && textToSearch.includes(lname)) {
                    gv.status = "completed";
                } else {
                    gv.status = "unmatch";
                    gv.front_uploaded = false; 
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

            transaction.update(bookingRef, {
                document_status: overallStatus,
                guests_verification: guestsVerification, 
                last_verified_name: allNames.join(' | ') || formattedName || "Procesando...",
                document_validated_at: admin.firestore.FieldValue.serverTimestamp()
            });
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
                        room_type_id: room.roomTypeID,
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
// --- FUNCIÓN 9: SINCRONIZAR RACK DE RESERVAS (30 DÍAS) ---
// ==========================================

// --- WEBHOOK: Actualización Automática de Reservas ---
exports.webhookCloudbeds = onRequest({ region: "us-central1" }, async (req, res) => {
    try {
        // 1. Extraer ID sin importar si viene como ID o Id
        const reservationID = req.body.reservationID || req.body.reservationId;
        
        if (!reservationID) {
            console.log("Webhook recibido sin ID válido");
            return res.status(200).send("No ID");
        }

        // 2. Obtener credenciales
        const cbAuthDoc = await db.collection("integrations").doc("cloudbeds").get();
        const accessToken = cbAuthDoc.data().access_token.trim();

        // 3. CONSULTA PROFUNDA
        const detalleResponse = await axios.get("https://hotels.cloudbeds.com/api/v1.2/getReservation", {
            params: { reservationID },
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });

        const d = detalleResponse.data.data;
        
        // 4. Mapear habitación
        const asignacion = (d.assigned && d.assigned.length > 0) ? d.assigned[0] : null;

        const nombreCloudbeds = d.guestName || `${d.firstName || ""} ${d.lastName || ""}`.trim();
        const nombreFinal = nombreCloudbeds || "Huésped";

        // ✨ NUEVO: Extracción real de huéspedes desde la asignación de la habitación
        let totalGuests = 1; 
        if (asignacion) {
            const adults = parseInt(asignacion.adults) || 0;
            const children = parseInt(asignacion.children) || 0;
            const sum = adults + children;
            if (sum > 0) totalGuests = sum;
        } else if (d.unassigned && d.unassigned.length > 0) {
            const adults = parseInt(d.unassigned[0].adults) || 0;
            const children = parseInt(d.unassigned[0].children) || 0;
            const sum = adults + children;
            if (sum > 0) totalGuests = sum;
        }

        // 5. Guardar en Firestore
        await db.collection("bookings").doc(`booking-${reservationID}`).set({
            booking_id_cloudbeds: reservationID,
            guest_name: nombreFinal,
            check_in: d.startDate,
            check_out: d.endDate,
            status: d.status,
            room_id_cloudbeds: asignacion ? asignacion.roomID : null,
            room_name: asignacion ? asignacion.roomName : "No asignada",
            guest_count: totalGuests, // Guardamos la cantidad extraída
            last_sync: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        console.log(`✅ Webhook: Reserva ${reservationID} actualizada con éxito.`);
        return res.status(200).send("OK");

    } catch (error) {
        console.error("❌ Error Webhook:", error.message);
        return res.status(200).send("Error procesado");
    }
});
