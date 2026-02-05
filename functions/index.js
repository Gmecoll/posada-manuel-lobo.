
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onObjectFinalized } = require("firebase-functions/v2/storage");
const admin = require('firebase-admin');
const axios = require('axios');
const crypto = require('crypto');
const { MercadoPagoConfig, Preference } = require('mercadopago');

if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();

// CONFIGURACIÓN DE SEGURIDAD
const ADMIN_EMAIL = "gmecollg@gmail.com";

// ==========================================
// --- FUNCIÓN 1: PAGO CON MERCADO PAGO ---
// ==========================================
exports.iniciarPagoServicio = onCall({ 
    region: "us-central1", 
    cors: true, 
    secrets: ["MERCADOPAGO_ACCESSTOKEN"] 
}, async (request) => {
    try {
        if (!process.env.MERCADOPAGO_ACCESSTOKEN) {
            throw new HttpsError('failed-precondition', 'Configuración de MP incompleta.');
        }
        const client = new MercadoPagoConfig({ accessToken: process.env.MERCADOPAGO_ACCESSTOKEN });
        const preference = new Preference(client);
        const { items, back_urls, external_reference } = request.data;

        const response = await preference.create({
            body: {
                items,
                back_urls,
                external_reference,
                notification_url: "https://us-central1-studio-4343626376-fea63.cloudfunctions.net/webhookMercadoPago",
                auto_return: "approved",
            }
        });
        return { init_point: response.init_point };
    } catch (error) {
        throw new HttpsError('internal', error.message);
    }
});

// ==========================================
// --- FUNCIÓN 2: MANTENIMIENTO (ROTACIÓN Y ESTADO) ---
// ==========================================
exports.mantenimientoHabitaciones = onSchedule({
  schedule: "every 1 minutes",
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

    if (roomsSnap.empty) {
      console.log("Mantenimiento: No se encontraron habitaciones.");
      return null;
    }

    const occupiedRooms = new Set();
    bookingsSnap.forEach((doc) => {
      const booking = doc.data();
      const fechaIn = new Date(booking.checkInDate + "T00:00:00");
      const fechaOut = new Date(booking.checkOutDate + "T00:00:00");

      if (hoy >= fechaIn && hoy < fechaOut) {
        occupiedRooms.add(booking.roomId);
      }
    });

    const batch = db.batch();
    let hayCambios = false;

    roomsSnap.forEach((roomDoc) => {
      const roomRef = roomDoc.ref;
      const roomData = roomDoc.data();
      const roomId = roomDoc.id;

      const updatePayload = {};
      const isOccupied = occupiedRooms.has(roomId);
      const newStatus = isOccupied ? "Ocupada" : "Disponible";

      if (roomData.status !== newStatus && roomData.status !== "Limpieza") {
        updatePayload.status = newStatus;
      }

      const pool = roomData.codes_pool;
      if (Array.isArray(pool) && pool.length > 0) {
        const randomIndex = Math.floor(Math.random() * pool.length);
        const nuevoCodigo = String(pool[randomIndex]);

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
      console.log("Mantenimiento: Batch de actualizaciones completado.");
    }

    return null;
  } catch (error) {
    console.error("Error crítico en mantenimiento:", error);
    return null;
  }
});


// ==========================================
// --- FUNCIÓN 3: IA CONSERJE ---
// ==========================================
exports.conserjeCall = onCall({ 
    secrets: ["GOOGLE_GENAI_API_KEY"], 
    region: "us-central1",
    cors: true
}, async (request) => {
    let aiModule;
    try { 
        aiModule = require('./conserjeflow.js'); 
    } catch (e) { 
        throw new HttpsError('unavailable', 'IA no cargada');
    }
    try {
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
    cors: true, 
    secrets: ["TTLOCK_CLIENT_ID", "TTLOCK_CLIENT_SECRET"] 
}, async (request) => {
    const { username, passwordRaw } = request.data || {};
    if (!username || !passwordRaw) throw new HttpsError('invalid-argument', 'Faltan credenciales.');
    
    if (!process.env.TTLOCK_CLIENT_ID || !process.env.TTLOCK_CLIENT_SECRET) {
        throw new HttpsError('failed-precondition', 'Servicio de cerraduras no configurado.');
    }
    
    const md5Password = crypto.createHash('md5').update(passwordRaw).digest('hex');

    try {
        const params = new URLSearchParams();
        params.append('client_id', process.env.TTLOCK_CLIENT_ID);
        params.append('client_secret', process.env.TTLOCK_CLIENT_SECRET);
        params.append('username', username);
        params.append('password', md5Password);
        params.append('grant_type', 'password');
        
        const response = await axios.post('https://api.ttlock.com/oauth2/token', params);
        
        if (response.data.access_token) {
            // AHORA GUARDAMOS EL REFRESH_TOKEN PARA EVITAR QUE CADUQUE
            await db.collection('configuracion_sistema').doc('ttlock_auth').set({
                accessToken: response.data.access_token,
                refreshToken: response.data.refresh_token, // <--- CAMBIO CLAVE
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
    cors: true, 
    secrets: ["TTLOCK_CLIENT_ID"]
}, async (request) => {
    
    const { booking_id, lockId: adminLockId } = request.data;
    const email = request.auth ? request.auth.token.email : "";

    if (!process.env.TTLOCK_CLIENT_ID) {
        throw new HttpsError('failed-precondition', 'Configuración incompleta.');
    }

    // 1. ATAJO PARA ADMIN
    if (email === ADMIN_EMAIL && adminLockId) {
        const userIdentifier = `Admin (${email})`;
        const logDescription = `${userIdentifier} abrió la cerradura ${adminLockId} remotamente.`;
        return await llamarTTLock(adminLockId, userIdentifier, logDescription);
    }

    // 2. VALIDACIÓN DE CREDENCIALES
    if (!booking_id) throw new HttpsError('invalid-argument', 'Falta el código de reserva.');

    const querySnapshot = await db.collection('bookings')
        .where('booking_id', '==', String(booking_id))
        .limit(1)
        .get();

    if (querySnapshot.empty) {
        throw new HttpsError('permission-denied', 'Reserva no encontrada.');
    }
    
    const bData = querySnapshot.docs[0].data();

    const ahora = new Date();
    const fechaIn = new Date(bData.checkInDate || bData.checkIn);
    const fechaOut = new Date(bData.checkOutDate || bData.checkOut);
    fechaIn.setHours(0,0,0,0); 
    fechaOut.setHours(23, 59, 59, 999);

    if (ahora < fechaIn || ahora > fechaOut) {
        throw new HttpsError('permission-denied', 'Su acceso no está vigente hoy.');
    }

    const accessEnabled = bData.access_enabled === true || bData.accessEnabled === true;
    if (!accessEnabled) {
        throw new HttpsError('permission-denied', 'Acceso restringido por la administración.');
    }

    const roomId = bData.roomId || bData.room_id || bData.room_number || bData.roomNumber; 
    if (!roomId) throw new HttpsError('internal', 'Reserva sin habitación vinculada.');

    const cleanRoomId = String(roomId).replace(/^(room-)/, '');
    const roomRef = db.collection('rooms').doc(`room-${cleanRoomId}`);
    const roomSnap = await roomRef.get();
    
    if (!roomSnap.exists) throw new HttpsError('internal', 'Habitación no encontrada.');

    const rData = roomSnap.data();
    const lockIdReal = rData.lockId || rData.lock_id;
    
    if (!lockIdReal) throw new HttpsError('internal', 'Cerradura no configurada.');

    const userIdentifier = bData.guest_name || `Booking ${booking_id}`;
    const logDescription = `${userIdentifier} (Hab. ${bData.room_number}) abrió la cerradura ${lockIdReal}.`;

    return await llamarTTLock(lockIdReal, userIdentifier, logDescription);
});

// --- HELPER: LLAMADA A API TTLOCK ---
async function llamarTTLock(lockId, userIdentifier, logDescription) {
    try {
        const authDoc = await db.collection('configuracion_sistema').doc('ttlock_auth').get();
        if (!authDoc.exists || !authDoc.data().accessToken) {
            throw new HttpsError('failed-precondition', 'La cuenta de TTLock no ha sido vinculada o el token no está disponible.');
        }
        const tokenDinamico = authDoc.data().accessToken;

        const response = await axios.post('https://api.ttlock.com/v3/lock/unlock', null, {
            params: {
                clientId: process.env.TTLOCK_CLIENT_ID,
                accessToken: tokenDinamico,
                lockId: lockId,
                date: Date.now()
            }
        });

        if (response.data.errcode !== 0) {
            return { success: false, error: response.data.errmsg, code: response.data.errcode };
        }
        
        if(userIdentifier && logDescription) {
            await db.collection('activity_logs').add({
                description: logDescription,
                user: userIdentifier,
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
                type: 'access'
            });
        }
        
        return { success: true };
    } catch (error) {
        throw new HttpsError('internal', 'Error de comunicación con la cerradura.');
    }
}

// ==========================================
// --- FUNCIÓN 6: LISTAR CERRADURAS ---
// ==========================================
exports.listarCerradurasTTLock = onCall({ 
    region: "us-central1", 
    cors: true, 
    secrets: ["TTLOCK_CLIENT_ID"]
}, async (request) => {

    if (!process.env.TTLOCK_CLIENT_ID) {
        throw new HttpsError('failed-precondition', 'Servicio no configurado.');
    }
    
    try {
        const authDoc = await db.collection('configuracion_sistema').doc('ttlock_auth').get();
        if (!authDoc.exists || !authDoc.data().accessToken) {
            throw new HttpsError('failed-precondition', 'La cuenta de TTLock no ha sido vinculada.');
        }
        const accessToken = authDoc.data().accessToken;

        const response = await axios.get('https://api.ttlock.com/v3/lock/list', {
            params: {
                clientId: process.env.TTLOCK_CLIENT_ID, 
                accessToken: accessToken,
                pageNo: 1, 
                pageSize: 40, 
                date: Date.now()
            }
        });
        
        if (response.data.errcode !== 0) {
             throw new HttpsError('unknown', response.data.errmsg || 'Error de TTLock');
        }

        return { success: true, list: response.data.list || [] };
    } catch (error) {
        console.error("Error al listar cerraduras:", error);
        throw new HttpsError('internal', error.message);
    }
});


// ==========================================
// --- FUNCIÓN 7: VALIDACIÓN AUTOMÁTICA OCR ---
// ==========================================
exports.validarDocumentoHuesped = onObjectFinalized({
    region: "us-central1",
    timeoutSeconds: 60,
    memory: "512MiB"
}, async (event) => {
    const filePath = event.data.name; 
    const bucket = event.data.bucket;
    
    if (!filePath.toLowerCase().endsWith('doc_frontal.jpg')) return null;

    const pathParts = filePath.split('/');
    if (pathParts.length < 2) return null;
    
    const bookingId = pathParts[1]; 
    const bookingRef = db.collection('bookings').doc(bookingId);

    console.log(`Iniciando validación para Reserva: ${bookingId}`);

    try {
        const vision = require('@google-cloud/vision');
        const visionClient = new vision.ImageAnnotatorClient();

        const [result] = await visionClient.textDetection(`gs://${bucket}/${filePath}`);
        const detections = result.textAnnotations;
        const fullText = detections.length > 0 ? detections[0].description.toLowerCase() : '';

        const keywords = ['dni', 'pasaporte', 'passport', 'identidad', 'república', 'documento', 'nombre', 'apellido', 'nacimiento'];
        const matches = keywords.filter(word => fullText.includes(word));
        
        let updateData = {};

        if (matches.length >= 2) {
            updateData = {
                document_status: 'approved',
                access_enabled: true,
                ocr_text: fullText.substring(0, 800),
                document_validated_at: admin.firestore.FieldValue.serverTimestamp()
            };
        } else {
            updateData = {
                document_status: 'not_uploaded',
                document_url: admin.firestore.FieldValue.delete(), 
                ocr_text: "RECHAZO_AUTO: No parece un documento (" + matches.length + " matches)"
            };
        }

        await new Promise(resolve => setTimeout(resolve, 800));

        await bookingRef.update({
            ...updateData,
            updated_at: admin.firestore.FieldValue.serverTimestamp()
        });

    } catch (error) {
        console.error("Error en proceso OCR:", error);
        await bookingRef.update({
            document_status: 'error',
            ocr_text: "ERROR_TECNICO: " + error.message,
            updated_at: admin.firestore.FieldValue.serverTimestamp()
        });
    }
    return null;
});
