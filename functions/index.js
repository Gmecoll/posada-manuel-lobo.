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
// --- FUNCIÓN 2: MANTENIMIENTO (ROTACIÓN) ---
// ==========================================
exports.mantenimientoHabitaciones = onSchedule({ 
    schedule: "every 1 minutes", 
    region: "us-central1",
    memory: "256MiB" 
}, async (event) => {
    try {
        const roomsSnap = await db.collection('rooms').get();
        if (roomsSnap.empty) return null;

        const batch = db.batch();
        let hayCambios = false;

        roomsSnap.forEach((doc) => {
            const data = doc.data();
            const pool = data.codes_pool;

            if (Array.isArray(pool) && pool.length > 0) {
                const randomIndex = Math.floor(Math.random() * pool.length);
                const nuevoCodigo = String(pool[randomIndex]);

                if (data.backup_code !== nuevoCodigo) {
                    batch.update(doc.ref, { 
                        backup_code: nuevoCodigo,
                        last_rotation: admin.firestore.FieldValue.serverTimestamp()
                    });
                    hayCambios = true;
                }
            }
        });

        if (hayCambios) await batch.commit();
        return null;
    } catch (error) {
        console.error("Error en mantenimiento:", error);
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
            await db.collection('configuracion_sistema').doc('ttlock_auth').set({
                accessToken: response.data.access_token,
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
    cors: true, 
    secrets: ["TTLOCK_CLIENT_ID", "TTLOCK_ACCESS_TOKEN"]
}, async (request) => {
    
    const { booking_id, lockId: adminLockId } = request.data;
    const email = request.auth ? request.auth.token.email : "";

    // 1. ATAJO PARA ADMIN
    if (email === ADMIN_EMAIL && adminLockId) {
        return await llamarTTLock(adminLockId);
    }

    // 2. VALIDACIÓN DE CREDENCIALES
    if (!booking_id) throw new HttpsError('invalid-argument', 'Falta el código de reserva.');

    // --- NUEVA LÓGICA DE BÚSQUEDA ---
    // Intentamos buscar por campo interno 'booking_id' ya que el ID del doc es aleatorio
    const querySnapshot = await db.collection('bookings')
        .where('booking_id', '==', String(booking_id))
        .limit(1)
        .get();

    if (querySnapshot.empty) {
        throw new HttpsError('permission-denied', 'Reserva no encontrada en el sistema.');
    }
    
    const bData = querySnapshot.docs[0].data();

    // VALIDACIÓN DE FECHAS
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

    // Buscamos la habitación (Normalizando el ID para buscar room-X)
    const cleanRoomId = String(roomId).replace(/^(room-)/, '');
    const roomRef = db.collection('rooms').doc(`room-${cleanRoomId}`);
    const roomSnap = await roomRef.get();
    
    if (!roomSnap.exists) throw new HttpsError('internal', 'Configuración de habitación no encontrada.');

    const rData = roomSnap.data();
    const lockIdReal = rData.lockId || rData.lock_id;
    
    if (!lockIdReal) throw new HttpsError('internal', 'Cerradura no configurada.');

    return await llamarTTLock(lockIdReal);
});

// --- HELPER: LLAMADA A API TTLOCK ---
async function llamarTTLock(lockId) {
    try {
        const response = await axios.post('https://api.ttlock.com/v3/lock/unlock', null, {
            params: {
                clientId: process.env.TTLOCK_CLIENT_ID,
                accessToken: process.env.TTLOCK_ACCESS_TOKEN,
                lockId: lockId,
                date: Date.now()
            }
        });

        if (response.data.errcode !== 0) {
            return { success: false, error: response.data.errmsg, code: response.data.errcode };
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
    secrets: ["TTLOCK_CLIENT_ID", "TTLOCK_ACCESS_TOKEN"]
}, async (request) => {
    try {
        const response = await axios.get('https://api.ttlock.com/v3/lock/list', {
            params: {
                clientId: process.env.TTLOCK_CLIENT_ID, 
                accessToken: process.env.TTLOCK_ACCESS_TOKEN,
                pageNo: 1, pageSize: 40, date: Date.now()
            }
        });
        return { success: true, list: response.data.list || [] };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// ==========================================
// --- FUNCIÓN 7: VALIDACIÓN AUTOMÁTICA OCR ---
// ==========================================
exports.validarDocumentoHuesped = onObjectFinalized({
    region: "us-central1"
}, async (event) => {
    const filePath = event.data.name; 
    const bucket = event.data.bucket;
    if (!filePath.startsWith('checkins/')) return null;

    const fileName = filePath.split('/').pop();
    const bookingId = fileName.split('.')[0];

    try {
        const vision = require('@google-cloud/vision');
        const visionClient = new vision.ImageAnnotatorClient();

        const [result] = await visionClient.textDetection(`gs://${bucket}/${filePath}`);
        const detections = result.textAnnotations;
        const fullText = detections.length > 0 ? detections[0].description.toLowerCase() : '';

        const keywords = ['dni', 'pasaporte', 'passport', 'identidad', 'nacimiento', 'republica', 'sexo', 'documento'];
        const hasKeywords = keywords.some(word => fullText.includes(word));

        const newStatus = hasKeywords ? 'approved' : 'manual_review';

        await db.collection('bookings').doc(bookingId).update({
            documentStatus: newStatus,
            ocrText: fullText.substring(0, 500),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        return null;
    } catch (error) {
        console.error("Error OCR:", error);
        return null;
    }
});