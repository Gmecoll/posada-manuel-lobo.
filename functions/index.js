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
