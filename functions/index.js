const functions = require('firebase-functions');
const axios = require('axios');
const crypto = require('crypto');
const admin = require('firebase-admin');

admin.initializeApp();

// Credenciales validadas de tu consola
const ACCESS_ID = "g84wgnf5ajyv4pknnn8n";
const SECRET = "32850b4de252491c8f2608e0b74631f0";
const ENDPOINT = "https://openapi.tuyaus.com";

exports.solicitarAperturaTuya = functions.https.onCall(async (data, context) => {
    // 1. Validar que el deviceId existe antes que nada.
    if (!data.tuya_device_id) {
        throw new functions.https.HttpsError('not-found', 'Esta habitación no tiene una cerradura vinculada (falta deviceId)');
    }
    
    // Si la validación es exitosa, se procede con el registro de actividad.
    const db = admin.firestore();
    const logData = {
        description: `Intento Acceso - Hab ${data.room_number || 'N/A'} por ${data.guest_name || 'Desconocido'}`,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        details: {
            guest: data.guest_name || 'Desconocido',
            room: data.room_number || 'N/A',
            deviceId: data.tuya_device_id,
        }
    };
    await db.collection('activity_logs').add(logData);

    // 2. Envolver la lógica de Tuya en un try/catch para manejar errores de conexión.
    try {
        const t = Date.now().toString();
        
        // --- PASO 1: OBTENER TOKEN ---
        const urlToken = "/v1.0/token?grant_type=1";
        const contentHashEmpty = crypto.createHash('sha256').update("").digest('hex');
        const strToSignToken = ["GET", contentHashEmpty, "", urlToken].join("\n");
        const signToken = crypto.createHmac('sha256', SECRET)
            .update(ACCESS_ID + t + strToSignToken)
            .digest('hex').toUpperCase();

        const resToken = await axios.get(ENDPOINT + urlToken, {
            headers: { 'client_id': ACCESS_ID, 'sign': signToken, 't': t, 'sign_method': 'HMAC-SHA256' }
        });

        if (!resToken.data.success) {
            throw new Error(`Token Error: ${resToken.data.msg}`);
        }
        const token = resToken.data.result.access_token;

        // --- PASO 2: ENVIAR COMANDO BOOLEAN ---
        const urlCmd = `/v1.0/devices/${data.tuya_device_id}/commands`;
        const body = { 
            "commands": [{ "code": "door_opened", "value": true }] 
        };
        
        const bodyStr = JSON.stringify(body);
        const contentHashCmd = crypto.createHash('sha256').update(bodyStr).digest('hex');
        const strToSignCmd = ["POST", contentHashCmd, "", urlCmd].join("\n");
        const signCmd = crypto.createHmac('sha256', SECRET)
            .update(ACCESS_ID + token + t + strToSignCmd)
            .digest('hex').toUpperCase();

        const resCmd = await axios.post(ENDPOINT + urlCmd, body, {
            headers: {
                'client_id': ACCESS_ID,
                'access_token': token,
                'sign': signCmd,
                't': t,
                'sign_method': 'HMAC-SHA256',
                'Content-Type': 'application/json'
            }
        });

        if (resCmd.data.success) {
            return { success: true, status: "Puerta virtual abierta (door_opened: true)" };
        } else {
            throw new Error(`Tuya dice: ${resCmd.data.msg} (Código: ${resCmd.data.code})`);
        }

    } catch (error) {
        // 'aborted' o 'internal' asegura que el mensaje llegue a la UI sin ser genérico.
        throw new functions.https.HttpsError('internal', error.message);
    }
});


exports.rotarCodigoEmergencia = functions.pubsub.schedule('every 30 minutes').onRun(async (context) => {
    const db = admin.firestore();
    const roomsRef = db.collection('rooms');

    try {
        const snapshot = await roomsRef.get();
        if (snapshot.empty) {
            console.log('No se encontraron habitaciones para rotar códigos.');
            return null;
        }

        const batch = db.batch();

        snapshot.forEach(doc => {
            const roomData = doc.data();
            // Valida que codes_pool exista, sea un array y no esté vacío
            if (roomData.codes_pool && Array.isArray(roomData.codes_pool) && roomData.codes_pool.length > 0) {
                const randomIndex = Math.floor(Math.random() * roomData.codes_pool.length);
                const newBackupCode = roomData.codes_pool[randomIndex];
                
                const roomDocRef = doc.ref;
                batch.update(roomDocRef, {
                    backup_code: newBackupCode,
                    last_rotation: admin.firestore.FieldValue.serverTimestamp()
                });
            } else {
                console.log(`Habitación ${doc.id} (${roomData.room_number || 'N/A'}) ignorada por no tener codes_pool.`);
            }
        });

        await batch.commit();
        console.log('Rotación de códigos de emergencia completada exitosamente.');
        return null;

    } catch (error) {
        console.error('Error al rotar los códigos de emergencia:', error);
        throw new functions.https.HttpsError('internal', 'Error al ejecutar la rotación de códigos.');
    }
});
