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
// Definimos los secretos aquí para usarlos en las funciones
const MERCADO_PAGO_ACCESS_TOKEN = defineSecret('MERCADO_PAGO_ACCESS_TOKEN');
const ANAM_API_KEY = defineSecret("ANAM_API_KEY"); 

// ==========================================
// --- FUNCIÓN 1: INICIAR PAGO SERVICIO (MERCADO PAGO) ---
// ==========================================
exports.iniciarPagoServicio = onCall({ 
    region: "us-central1", 
    secrets: [MERCADO_PAGO_ACCESS_TOKEN] 
}, async (request) => {
    const { serviceId, quantity, userId, guestName, roomNumber, reservationDate, reservationTime, comments } = request.data;

    try {
        if (!serviceId || !userId) {
            throw new HttpsError('invalid-argument', 'Faltan datos del servicio o usuario.');
        }

        const serviceDoc = await db.collection('services').doc(serviceId).get();
        if (!serviceDoc.exists) {
            throw new HttpsError('not-found', 'El servicio solicitado no existe.');
        }
        const serviceData = serviceDoc.data();

        // SDK V2
        const { MercadoPagoConfig, Preference } = require('mercadopago');
        const client = new MercadoPagoConfig({ 
            accessToken: MERCADO_PAGO_ACCESS_TOKEN.value() 
        });
        const preference = new Preference(client);

        const result = await preference.create({
            body: {
                items: [{
                    id: serviceId,
                    title: serviceData.title,
                    unit_price: Number(serviceData.price),
                    quantity: Number(quantity),
                    currency_id: 'UYU'
                }],
                metadata: { userId, guestName, roomNumber, reservationDate, reservationTime, comments },
                back_urls: {
                    success: `https://${process.env.GCLOUD_PROJECT}.web.app/payment-success`,
                    failure: `https://${process.env.GCLOUD_PROJECT}.web.app/services`
                },
                auto_return: "approved",
            }
        });

        await db.collection('orders').add({
            userId, guestName, roomNumber, serviceId,
            serviceTitle: serviceData.title,
            total: Number(serviceData.price) * Number(quantity),
            status: 'pending',
            preferenceId: result.id,
            reservationDate, reservationTime,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        await db.collection('solicitudes_servicios').add({
            servicioId: serviceId,
            nombreServicio: serviceData.title,
            monto: Number(serviceData.price) * Number(quantity),
            currency: 'UYU',
            cantidad: Number(quantity),
            fecha: admin.firestore.FieldValue.serverTimestamp(),
            estado_pago: 'pendiente',
            usuarioId: userId,
            guestName: guestName,
            roomNumber: roomNumber,
            leido: false,
        });

        return { id: result.id, init_point: result.init_point };

    } catch (error) {
        console.error("ERROR EN PAGO:", error);
        return { error: error.message || "Error interno", details: error.stack };
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
// --- FUNCIÓN 5: APERTURA INTELIGENTE ---
// ==========================================
exports.abrirCerraduraRemote = onCall({ 
    region: "us-central1", 
    secrets: ["TTLOCK_CLIENT_ID"]
}, async (request) => {
    const { booking_id, lockId: adminLockId } = request.data;
    const email = request.auth ? request.auth.token.email : "";

    if (email === ADMIN_EMAIL && adminLockId) {
        return await llamarTTLock(adminLockId, `Admin (${email})`, "Apertura remota Admin");
    }

    if (!booking_id) throw new HttpsError('invalid-argument', 'Falta booking_id.');

    const querySnapshot = await db.collection('bookings').where('booking_id', '==', String(booking_id)).limit(1).get();
    if (querySnapshot.empty) throw new HttpsError('permission-denied', 'Reserva no encontrada.');
    
    const bData = querySnapshot.docs[0].data();
    const roomId = bData.roomId || bData.room_number || bData.roomNumber;
    const roomSnap = await db.collection('rooms').doc(`room-${String(roomId).replace(/^(room-)/, '')}`).get();
    const lockIdReal = roomSnap.exists ? (roomSnap.data().lockId || roomSnap.data().lock_id) : null;

    if (!lockIdReal) throw new HttpsError('internal', 'Cerradura no vinculada.');
    return await llamarTTLock(lockIdReal, bData.guest_name, `Apertura por huésped Hab ${roomId}`);
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

        if (response.data.errcode === 10003) { // Refresh Token logic
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
// --- FUNCIÓN 7: VALIDACIÓN OCR ---
// ==========================================
exports.validarDocumentoHuesped = onObjectFinalized({
    region: "us-central1"
}, async (event) => {
    const filePath = event.data.name; 
    if (!filePath.toLowerCase().endsWith('doc_frontal.jpg')) return null;

    const bookingId = filePath.split('/')[1]; 
    try {
        const vision = require('@google-cloud/vision');
        const visionClient = new vision.ImageAnnotatorClient();
        const [result] = await visionClient.textDetection(`gs://${event.data.bucket}/${filePath}`);
        const fullText = result.textAnnotations.length > 0 ? result.textAnnotations[0].description.toLowerCase() : '';
        const keywords = ['dni', 'pasaporte', 'passport', 'identidad', 'nombre', 'apellido'];
        const matches = keywords.filter(word => fullText.includes(word));

        const updateData = matches.length >= 2 
            ? { document_status: 'approved', access_enabled: true, ocr_text: fullText.substring(0, 500) }
            : { document_status: 'not_uploaded', ocr_text: "Rechazo automático: No se detecta documento." };

        await db.collection('bookings').doc(bookingId).update({
            ...updateData,
            document_validated_at: admin.firestore.FieldValue.serverTimestamp()
        });
    } catch (e) { console.error("OCR Error:", e); }
    return null;
});

// ==========================================
// --- FUNCIÓN 8: SKY ROOMS AI (ANAM TOKEN - SECURE) ---
// ==========================================

//const ANAM_PERSONA_ID = "01f755de-1bd6-428a-9ac0-93c5ae6007c3";
const ANAM_PERSONA_ID = "89760c52-643c-4465-89cc-3d708e11ae36";
exports.anamToken = onRequest(
  { 
    region: "us-central1",
    cors: true, 
    secrets: [ANAM_API_KEY] // 2. ¡IMPORTANTE! Damos permiso a la función para leerlo
  }, 
  async (request, response) => {
    try {
      // 3. Leemos el valor del secreto (NO está escrito en el código)
      const apiKey = ANAM_API_KEY.value(); 

      const apiResponse = await fetch("https://api.anam.ai/v1/auth/session-token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`, // Usamos la variable segura
        },
        body: JSON.stringify({
            personaConfig: {
                personaId: ANAM_PERSONA_ID
            }
        }),
      });

      const data = await apiResponse.json();
      
      // Manejo de error de la API de Anam
      if (!apiResponse.ok) {
          console.error("Error respuesta Anam:", data);
          response.status(apiResponse.status).json(data);
          return;
      }

      response.json(data);

    } catch (error) {
      logger.error("Error obteniendo token:", error);
      response.status(500).send("Error interno");
    }
  }
);
