const functions = require('firebase-functions');
const axios = require('axios');
const crypto = require('crypto');
const admin = require('firebase-admin');

if (!admin.apps.length) { admin.initializeApp(); }

const ACCESS_ID = "g84wgnf5ajyv4pknnn8n";
const SECRET = "32850b4de252491c8f2608e0b74631f0";
const ENDPOINT = "https://openapi.tuyaus.com";

let tokenCache = { accessToken: null, expireTime: 0 };

const getToken = async () => {
    const now = Date.now();
    if (tokenCache.accessToken && tokenCache.expireTime > now) return tokenCache.accessToken;
    const t = now.toString();
    const url = "/v1.0/token?grant_type=1";
    const contentHash = crypto.createHash('sha256').update("").digest('hex');
    const stringToSign = ["GET", contentHash, "", url].join("\n");
    const sign = crypto.createHmac('sha256', SECRET).update(ACCESS_ID + t + stringToSign).digest('hex').toUpperCase();
    try {
        const res = await axios.get(ENDPOINT + url, { headers: { 'client_id': ACCESS_ID, 'sign': sign, 't': t, 'sign_method': 'HMAC-SHA256' } });
        tokenCache.accessToken = res.data.result.access_token;
        tokenCache.expireTime = now + (res.data.result.expire_time - 60) * 1000;
        return res.data.result.access_token;
    } catch (e) { throw new Error("Fallo de Autenticación Tuya"); }
};

exports.solicitarAperturaTuya = functions.https.onCall(async (data, context) => {
    // 1. CAPTURA Y VALIDACIÓN (Evita el crash si el ID no existe en Firestore)
    const deviceId = data.deviceId || data.device_id || data.id;
    const g_name = data.guest_name || "Huésped";
    const r_num = data.room_number || "N/A";

    if (!deviceId || deviceId.length < 5) {
        throw new functions.https.HttpsError('failed-precondition', `El ID '${deviceId}' es inválido o no está cargado en Firestore.`);
    }

    try {
        // 2. LOG DE ACTIVIDAD
        await admin.firestore().collection('activity_logs').add({
            description: `Intento de apertura: Huésped ${g_name} en Habitación ${r_num}`,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            deviceId: deviceId
        });

        // 3. COMANDO TUYA V2
        const token = await getToken();
        const t = Date.now().toString();
        const url = `/v1.0/devices/${deviceId}/commands`;
        const body = { "commands": [{ "code": "unlock_remote", "value": true }] };
        const bodyStr = JSON.stringify(body);
        const contentHash = crypto.createHash('sha256').update(bodyStr).digest('hex');
        const stringToSign = ["POST", contentHash, "", url].join("\n");
        const sign = crypto.createHmac('sha256', SECRET).update(ACCESS_ID + token + t + stringToSign).digest('hex').toUpperCase();

        const response = await axios.post(ENDPOINT + url, body, {
            headers: { 'client_id': ACCESS_ID, 'access_token': token, 'sign': sign, 't': t, 'sign_method': 'HMAC-SHA256', 'Content-Type': 'application/json' }
        });

        if (!response.data.success) {
            throw new Error(`Tuya dice: ${response.data.msg} (Código: ${response.data.code})`);
        }

        return { success: true };

    } catch (error) {
        console.error("Error Detallado:", error.message);
        throw new functions.https.HttpsError('internal', error.message);
    }
});
