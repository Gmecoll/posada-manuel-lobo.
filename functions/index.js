
const { onCall } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const functions = require("firebase-functions/v1");
const axios = require('axios');
const crypto = require('crypto');
const admin = require('firebase-admin');

// Inicialización única
if (!admin.apps.length) {
    admin.initializeApp();
}

const ACCESS_ID = "g84wgnf5ajyv4pknnn8n";
const SECRET = "32850b4de252491c8f2608e0b74631f0";
const ENDPOINT = "https://openapi.tuyaus.com";

// --- FUNCIÓN 1: APERTURA INTELIGENTE (onCall v2) ---
exports.solicitarAperturaTuya = onCall(async (request) => {
    const data = request.data;
    const db = admin.firestore();

    if (!data.room_number) {
        throw new functions.https.HttpsError('invalid-argument', 'Falta room_number.');
    }

    try {
        // Buscamos la habitación por número para obtener el ID real de la base de datos
        const snapshot = await db.collection('rooms')
            .where('room_number', '==', data.room_number)
            .limit(1).get();

        if (snapshot.empty) {
            throw new functions.https.HttpsError('not-found', 'Habitación no existe.');
        }

        const roomData = snapshot.docs[0].data();
        const verifiedDeviceId = roomData.tuya_device_id;

        // Si el ID es inválido o XXXX, forzamos el error para activar el Plan B en la App
        if (!verifiedDeviceId || verifiedDeviceId === 'XXXX') {
            await db.collection('activity_logs').add({
                description: `Apertura denegada (Hab. ${data.room_number}): sin llave configurada.`,
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
                success: false
            });
            throw new functions.https.HttpsError('failed-precondition', 'Habitación sin llave configurada');
        }

        // --- Lógica Tuya ---
        const t = Date.now().toString();
        const urlToken = "/v1.0/token?grant_type=1";
        const contentHashEmpty = crypto.createHash('sha256').update("").digest('hex');
        const strToSignToken = ["GET", contentHashEmpty, "", urlToken].join("\n");
        const signToken = crypto.createHmac('sha256', SECRET).update(ACCESS_ID + t + strToSignToken).digest('hex').toUpperCase();

        const resToken = await axios.get(ENDPOINT + urlToken, {
            headers: { 'client_id': ACCESS_ID, 'sign': signToken, 't': t, 'sign_method': 'HMAC-SHA256' }
        });

        const token = resToken.data.result.access_token;
        const urlCmd = `/v1.0/devices/${verifiedDeviceId}/commands`;
        const body = { "commands": [{ "code": "lock_motor_state", "value": true }] };
        const bodyStr = JSON.stringify(body);
        const contentHashCmd = crypto.createHash('sha256').update(bodyStr).digest('hex');
        const strToSignCmd = ["POST", contentHashCmd, "", urlCmd].join("\n");
        const signCmd = crypto.createHmac('sha256', SECRET).update(ACCESS_ID + token + t + strToSignCmd).digest('hex').toUpperCase();

        const resCmd = await axios.post(ENDPOINT + urlCmd, body, {
            headers: { 'client_id': ACCESS_ID, 'access_token': token, 'sign': signCmd, 't': t, 'sign_method': 'HMAC-SHA256', 'Content-Type': 'application/json' }
        });

        if (resCmd.data.success) {
            return { success: true };
        } else {
            throw new Error(resCmd.data.msg);
        }
    } catch (error) {
        if (error instanceof functions.https.HttpsError) throw error;
        throw new functions.https.HttpsError('internal', error.message);
    }
});

// --- FUNCIÓN 2: ROTACIÓN DE CÓDIGO (onSchedule v2 cada 30 min) ---
exports.mantenimientoHabitaciones = onSchedule("every 30 minutes", async (event) => {
    const db = admin.firestore();

    try {
        const roomsSnapshot = await db.collection('rooms').get();
        const batch = db.batch();
        let count = 0;

        roomsSnapshot.forEach(roomDoc => {
            const roomData = roomDoc.data();
            let updates = {};

            // 1. ROTACIÓN DE CÓDIGO (Plan B)
            if (roomData.codes_pool && Array.isArray(roomData.codes_pool) && roomData.codes_pool.length > 0) {
                const randomCode = roomData.codes_pool[Math.floor(Math.random() * roomData.codes_pool.length)];
                updates.backup_code = randomCode;
                updates.last_rotation = admin.firestore.FieldValue.serverTimestamp();
            }
            
            // Si hay algo que actualizar, lo añadimos al batch
            if (Object.keys(updates).length > 0) {
                batch.update(roomDoc.ref, updates);
                count++;
            }
        });

        if (count > 0) {
            await batch.commit();
            console.log(`Mantenimiento completado: ${count} códigos de emergencia rotados.`);
        }
        return null;
    } catch (err) {
        console.error("Error en mantenimiento de códigos:", err);
        return null;
    }
});

// --- FUNCIÓN 3: INICIAR PAGO CON DLOCAL GO (onCall v2) ---
exports.iniciarPagoServicio = onCall(async (request) => {
    const data = request.data;
    const db = admin.firestore();

    // 1. Validar datos de entrada
    const requiredFields = ['serviceId', 'amount', 'guestId', 'guestName'];
    for (const field of requiredFields) {
        if (!data[field]) {
            throw new functions.https.HttpsError('invalid-argument', `Falta el campo requerido: ${field}.`);
        }
    }

    try {
        // 2. Obtener el título del servicio desde Firestore
        console.log("Buscando ServiceID:", data.serviceId);
        const serviceRef = db.collection('services').doc(data.serviceId);
        const serviceDoc = await serviceRef.get();
        if (!serviceDoc.exists) {
            throw new functions.https.HttpsError('not-found', 'No encontré el servicio con ID: ' + data.serviceId);
        }
        const serviceData = serviceDoc.data();
        const serviceTitle = serviceData.title || serviceData.nombre;

        // 3. Obtener credenciales de dLocal Go desde la configuración de Firebase
        const dlocalConfig = functions.config().dlocal;
        if (!dlocalConfig || !dlocalConfig.login || !dlocalConfig.secret || !dlocalConfig.trans_key) {
            console.error("La configuración de dLocal Go no está definida en Firebase Functions.");
            throw new functions.https.HttpsError('internal', 'La configuración del procesador de pagos no está completa.');
        }
        const LOGIN = dlocalConfig.login;
        const SECRET = dlocalConfig.secret;
        const TRANS_KEY = dlocalConfig.trans_key;
        const DLOCAL_ENDPOINT = "https://api.dlocalgo.com/v1/payments";

        // 4. Preparar el cuerpo (payload) para la API de dLocal
        const appUrl = 'https://posada-manuel-lobo.web.app';
        const orderId = `service-${data.serviceId}-${data.guestId}-${Date.now()}`;
        const description = `Reserva ${serviceTitle} - ${data.date || ''} ${data.time || ''} - ${data.guestName}`.trim();
        
        // NOTA: dLocal requiere un email de pagador. Se usa un placeholder.
        const guestEmail = `${data.guestName.replace(/\s+/g, '.').toLowerCase()}@posada-manuel-lobo.test`;

        const body = {
            amount: data.amount,
            currency: 'USD',
            country: 'UY',
            payer: {
                name: data.guestName,
                email: guestEmail, 
            },
            order_id: orderId,
            description: description,
            success_url: `${appUrl}/?payment=success`,
            back_url: `${appUrl}/services`,
            metadata: {
                guestId: data.guestId,
                roomNumber: data.roomNumber || 'N/A'
            }
        };

        // 5. Generar firma y cabeceras
        const idempotencyKey = crypto.randomUUID();
        const bodyStr = JSON.stringify(body);
        const signature = crypto.createHmac('sha256', SECRET).update(bodyStr).digest('hex');

        const headers = {
            'X-Login': LOGIN,
            'X-Trans-Key': TRANS_KEY,
            'X-Version': '2.1',
            'X-Signature': `HMAC-SHA256 ${signature}`,
            'Content-Type': 'application/json',
            'X-Idempotency-Key': idempotencyKey,
        };

        // 6. Realizar la petición a dLocal Go
        const dlocalResponse = await axios.post(DLOCAL_ENDPOINT, body, { headers });

        // 7. Procesar respuesta y retornar la URL de checkout
        if (dlocalResponse.data && dlocalResponse.data.redirect_url) {
            // Guardar la solicitud en Firestore para seguimiento
            await db.collection('solicitudes_servicios').add({
                servicioId: data.serviceId,
                nombreServicio: serviceTitle,
                monto: data.monto,
                fecha: admin.firestore.FieldValue.serverTimestamp(),
                estado_pago: 'pendiente',
                usuarioId: data.guestId,
                guestName: data.guestName,
                dlocalPaymentId: dlocalResponse.data.id,
                comments: data.comments || null
            });
            
            return { checkout_url: dlocalResponse.data.redirect_url };
        } else {
            console.error("Respuesta de dLocal Go sin redirect_url:", dlocalResponse.data);
            throw new functions.https.HttpsError('internal', 'La respuesta del procesador de pagos es inválida.');
        }

    } catch (error) {
        console.error("Error al iniciar el pago con dLocal:", error.response ? error.response.data : error.message);
        if (error instanceof functions.https.HttpsError) {
            throw error;
        }
        const errorMessage = error.response?.data?.message || 'No se pudo iniciar el proceso de pago. Intente de nuevo más tarde.';
        throw new functions.https.HttpsError('internal', errorMessage);
    }
});
