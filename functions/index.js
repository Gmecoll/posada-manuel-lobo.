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
    
    // Hash de body vacío para GET
    const contentHash = crypto.createHash('sha256').update("").digest('hex');
    const stringToSign = [method, contentHash, "", url].join("\n");
    const signStr = ACCESS_ID + t + stringToSign;
    const sign = crypto.createHmac('sha256', SECRET).update(signStr).digest('hex').toUpperCase();

    try {
        const res = await axios.get(ENDPOINT + url, {
            headers: { 'client_id': ACCESS_ID, 'sign': sign, 't': t, 'sign_method': 'HMAC-SHA256' }
        });
        if (res.data.success) {
            tokenCache.accessToken = res.data.result.access_token;
            tokenCache.expireTime = now + (res.data.result.expire_time - 60) * 1000;
            return res.data.result.access_token;
        }
        throw new Error(res.data.msg || "Error Token");
    } catch (e) { 
        console.error("TOKEN FAIL:", e.message);
        throw new Error("Error de Token Tuya"); 
    }
};

exports.solicitarAperturaTuya = functions.https.onCall(async (data, context) => {
    // 1. Log para depuración: Imprime los datos recibidos
    console.log('Datos recibidos en la función:', JSON.stringify(data));

    // 2. CAPTURA DE DATOS
    const deviceId = data.deviceId || data.device_id || data.id;
    const g_name = data.guest_name || "Huésped";
    const r_num = data.room_number || "N/A";

    // 3. Validación mejorada para depuración
    if (!deviceId) {
        const errorMessage = `Falta deviceId. Recibido: ${JSON.stringify(data)}`;
        console.error(errorMessage);
        throw new functions.https.HttpsError('invalid-argument', errorMessage);
    }

    // 4. REGISTRO PREVIO (Para asegurar que la descripción aparezca)
    const logDescription = `El huésped ${g_name} abrió la puerta de la Habitación ${r_num}`;
    try {
        await admin.firestore().collection('activity_logs').add({
            description: logDescription, 
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            type: "wifi_manual_click",
            via: "cloud_v2_strict"
        });
    } catch (e) { 
        console.error("Firestore Log Error:", e.message); 
        // No lanzamos error aquí para no detener el flujo de apertura
    }

    // 5. APERTURA CON FIRMA V2 ESTRICTA
    try {
        const token = await getToken();
        const t = Date.now().toString();
        const method = "POST";
        const url = `/v1.0/devices/${deviceId}/commands`;
        
        const bodyObj = { "commands": [{ "code": "unlock_remote", "value": true }] };
        const bodyStr = JSON.stringify(bodyObj); 

        const contentHash = crypto.createHash('sha256').update(bodyStr).digest('hex');
        const stringToSign = [method, contentHash, "", url].join("\n");
        const signStr = ACCESS_ID + token + t + stringToSign;
        const sign = crypto.createHmac('sha256', SECRET).update(signStr).digest('hex').toUpperCase();

        const response = await axios({
            method: 'POST',
            url: ENDPOINT + url,
            data: bodyObj,
            headers: {
                'client_id': ACCESS_ID,
                'access_token': token,
                'sign': sign,
                't': t,
                'sign_method': 'HMAC-SHA256',
                'Content-Type': 'application/json'
            }
        });

        if (response.data.success) {
            return { success: true, message: "Puerta abierta" };
        } else {
            console.error("Tuya Error Detalle:", JSON.stringify(response.data));
            throw new Error(`Tuya: ${response.data.msg} (Code: ${response.data.code})`);
        }

    } catch (error) {
        console.error("INTERNAL ERROR CAUSE:", error.message);
        // Usamos el mensaje de error de Axios/Tuya si está disponible
        const errorMessage = error.response?.data?.msg || error.message || "Error desconocido en la apertura";
        throw new functions.https.HttpsError('internal', errorMessage);
    }
});
