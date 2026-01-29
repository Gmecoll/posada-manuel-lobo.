const functions = require('firebase-functions');
const axios = require('axios');
const crypto = require('crypto');
const admin = require('firebase-admin');

if (!admin.apps.length) {
    admin.initializeApp();
}

const ACCESS_ID = "g84wgnf5ajyv4pknnn8n";
const SECRET = "32850b4de252491c8f2608e0b74631f0";
const ENDPOINT = "https://openapi.tuyaus.com";

let tokenCache = { accessToken: null, expireTime: 0 };

const getToken = async () => {
    const now = Date.now();
    if (tokenCache.accessToken && tokenCache.expireTime > now) return tokenCache.accessToken;
    
    const t = now.toString();
    const method = "GET";
    const url = "/v1.0/token?grant_type=1";
    const signUrl = method + "\n" + crypto.createHash('sha256').update("").digest('hex') + "\n" + "" + "\n" + url;
    const str = ACCESS_ID + t + signUrl;
    const sign = crypto.createHmac('sha256', SECRET).update(str).digest('hex').toUpperCase();

    try {
        const res = await axios.get(ENDPOINT + url, {
            headers: { 'client_id': ACCESS_ID, 'sign': sign, 't': t, 'sign_method': 'HMAC-SHA256' }
        });
        if (res.data.success) {
            tokenCache.accessToken = res.data.result.access_token;
            tokenCache.expireTime = now + (res.data.result.expire_time - 60) * 1000;
            return res.data.result.access_token;
        }
        throw new Error(res.data.msg);
    } catch (e) { throw new Error("Error de Token Tuya"); }
};

exports.solicitarAperturaTuya = functions.https.onCall(async (data, context) => {
    const { deviceId, guest_name, room_number } = data;

    if (!deviceId) {
        throw new functions.https.HttpsError('invalid-argument', 'Falta deviceId');
    }

    try {
        const logDescription = `El huésped ${guest_name || 'Huésped'} abrió la puerta de la Habitación ${room_number || 'N/A'}`;
        
        await admin.firestore().collection('activity_logs').add({
            description: logDescription, 
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            type: "wifi_manual_click",
            via: "cloud_function"
        });

        if (deviceId === 'XXXX') throw new Error('Cerradura no configurada.');

        const token = await getToken();
        const t = Date.now().toString();
        const method = "POST";
        const url = `/v1.0/devices/${deviceId}/commands`;
        const body = { "commands": [{ "code": "unlock_remote", "value": true }] };
        const bodyStr = JSON.stringify(body);
        const contentHash = crypto.createHash('sha256').update(bodyStr).digest('hex');
        const signUrl = method + "\n" + contentHash + "\n" + "" + "\n" + url;
        const str = ACCESS_ID + token + t + signUrl;
        const sign = crypto.createHmac('sha256', SECRET).update(str).digest('hex').toUpperCase();

        const response = await axios.post(ENDPOINT + url, body, {
            headers: {
                'client_id': ACCESS_ID, 'access_token': token, 'sign': sign, 't': t,
                'sign_method': 'HMAC-SHA256', 'Content-Type': 'application/json'
            }
        });

        if (response.data.success) {
            return { success: true, message: "Puerta abierta" };
        } else {
            throw new Error(response.data.msg);
        }

    } catch (error) {
        console.error("Error en función:", error.message);
        throw new functions.https.HttpsError('internal', error.message);
    }
});
