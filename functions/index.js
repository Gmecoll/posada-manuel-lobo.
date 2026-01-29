const functions = require('firebase-functions');
const axios = require('axios');
const crypto = require('crypto');
const admin = require('firebase-admin');

if (!admin.apps.length) { admin.initializeApp(); }

const ACCESS_ID = "g84wgnf5ajyv4pknnn8n";
const SECRET = "32850b4de252491c8f2608e0b74631f0";
const ENDPOINT = "https://openapi.tuyaus.com";

exports.solicitarAperturaTuya = functions.https.onCall(async (data, context) => {
    
    console.log("Datos recibidos en la función:", JSON.stringify(data));
    const deviceId = data.tuya_device_id;
    
    if (!deviceId) {
        throw new functions.https.HttpsError('not-found', 'Esta habitación no tiene una cerradura vinculada (falta tuya_device_id)');
    }

    try {
        await admin.firestore().collection('activity_logs').add({
            description: `Intento de apertura para ${data.guest_name || 'Desconocido'} en Hab: ${data.room_number || '?'}. ID: ${deviceId}`,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            status: "initiated"
        });

        const t = Date.now().toString();
        const urlToken = "/v1.0/token?grant_type=1";
        const contentHashEmpty = crypto.createHash('sha256').update("").digest('hex');
        const stringToSignToken = ["GET", contentHashEmpty, "", urlToken].join("\n");
        const signToken = crypto.createHmac('sha256', SECRET)
            .update(ACCESS_ID + t + stringToSignToken)
            .digest('hex').toUpperCase();

        const resToken = await axios.get(ENDPOINT + urlToken, {
            headers: { 'client_id': ACCESS_ID, 'sign': signToken, 't': t, 'sign_method': 'HMAC-SHA256' }
        });

        if (!resToken.data.success) {
             throw new Error(`Error al obtener token de Tuya: ${resToken.data.msg}`);
        }
        
        const token = resToken.data.result.access_token;

        const urlCommand = `/v1.0/devices/${deviceId}/commands`;
        const body = { "commands": [{ "code": "unlock_remote", "value": true }] };
        const bodyStr = JSON.stringify(body);
        const contentHashBody = crypto.createHash('sha256').update(bodyStr).digest('hex');
        const stringToSignCmd = ["POST", contentHashBody, "", urlCommand].join("\n");
        const signCmd = crypto.createHmac('sha256', SECRET)
            .update(ACCESS_ID + token + t + stringToSignCmd)
            .digest('hex').toUpperCase();

        const resCmd = await axios.post(ENDPOINT + urlCommand, body, {
            headers: {
                'client_id': ACCESS_ID, 'access_token': token,
                'sign': signCmd, 't': t, 'sign_method': 'HMAC-SHA256',
                'Content-Type': 'application/json'
            }
        });

        if (resCmd.data.success) {
            return { success: true };
        } else {
            throw new Error(`Error en el comando de Tuya: ${resCmd.data.msg}`);
        }

    } catch (error) {
        console.error("Error en solicitarAperturaTuya:", error.message);
        throw new functions.https.HttpsError('internal', error.message || 'Error interno en la función de apertura.');
    }
});
