
const functions = require('firebase-functions');
const axios = require('axios');
const crypto = require('crypto');
const admin = require('firebase-admin');

if (!admin.apps.length) {
    admin.initializeApp();
}

// Credenciales de la Posada Manuel Lobo
const ACCESS_ID = "g84wgnf5ajyv4pknnn8n";
const SECRET = "32850b4de252491c8f2608e0b74631f0";
const ENDPOINT = "https://openapi.tuyaus.com";

// --- Token Caching ---
let tokenCache = {
    accessToken: null,
    expireTime: 0,
};

const getToken = async () => {
    const now = Date.now();
    if (tokenCache.accessToken && tokenCache.expireTime > now) {
        return tokenCache.accessToken;
    }

    const method = "GET";
    const path = "/v1.0/token?grant_type=1";
    const timestamp = now.toString();
    const nonce = ""; 
    const stringToSign = ACCESS_ID + timestamp + nonce + method + "\n" + "" + "\n" + path;
    const sign = crypto.createHmac("sha256", SECRET).update(stringToSign, "utf8").digest("hex").toUpperCase();

    const headers = {
        "client_id": ACCESS_ID,
        "sign": sign,
        "t": timestamp,
        "sign_method": "HMAC-SHA256",
        "nonce": nonce,
    };

    try {
        const response = await axios.get(ENDPOINT + path, { headers });
        if (response.data && response.data.success) {
            const { access_token, expire_time } = response.data.result;
            tokenCache.accessToken = access_token;
            tokenCache.expireTime = now + (expire_time - 10) * 1000;
            return access_token;
        } else {
            throw new Error("Failed to get Tuya token: " + (response.data.msg || "Unknown error"));
        }
    } catch (error) {
        console.error("Error fetching Tuya token:", error.response ? error.response.data : error.message);
        throw new functions.https.HttpsError('internal', 'Error al obtener el token de Tuya.');
    }
};

exports.solicitarAperturaTuya = functions.https.onCall(async (data, context) => {
    const { deviceId, guest_name, room_number } = data;

    if (!deviceId) {
        throw new functions.https.HttpsError('invalid-argument', 'La función debe ser llamada con un "deviceId".');
    }
    if (deviceId === 'XXXX') {
        // Aunque el front-end lo valida, es bueno tener una guarda en el back-end.
        const logErrorDesc = `Intento de apertura fallido: Habitación ${room_number || 'N/A'} no tiene cerradura configurada.`;
         await admin.firestore().collection('activity_logs').add({
            description: logErrorDesc,
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });
        throw new functions.https.HttpsError('failed-precondition', 'La cerradura para esta habitación no está configurada.');
    }
    
    // --- PASO 1: Registrar el intento de actividad PRIMERO ---
    // Esto asegura que el log se cree con el formato correcto, sin importar el resultado de la llamada a Tuya.
    const logDescription = `El huésped ${guest_name || 'Desconocido'} abrió la puerta de la Habitación ${room_number || 'N/A'}`;
    try {
        await admin.firestore().collection('activity_logs').add({
            description: logDescription,
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });
    } catch (logError) {
        console.error("CRITICAL: Fallo al escribir el log de actividad en Firestore:", logError);
        // Continuamos de todas formas, abrir la puerta es la prioridad.
    }

    // --- PASO 2: Intentar abrir la puerta ---
    try {
        const token = await getToken();
        const timestamp = Date.now().toString();
        const method = "POST";
        const path = `/v1.0/devices/${deviceId}/commands`;
        const nonce = "";
        
        const body = JSON.stringify({
            "commands": [{
                "code": "unlock_remote",
                "value": true
            }]
        });
        
        const bodyHash = crypto.createHash("sha256").update(body, "utf8").digest("hex").toLowerCase();
        const stringToSign = ACCESS_ID + token + timestamp + nonce + method + "\n" + bodyHash + "\n" + path;
        const sign = crypto.createHmac("sha256", SECRET).update(stringToSign, "utf8").digest("hex").toUpperCase();

        const headers = {
            "client_id": ACCESS_ID,
            "access_token": token,
            "sign": sign,
            "t": timestamp,
            "sign_method": "HMAC-SHA256",
            "nonce": nonce,
            "Content-Type": "application/json",
        };

        const response = await axios.post(ENDPOINT + path, body, { headers });

        if (response.data && response.data.success) {
            return { success: true, message: "¡Puerta abierta!", detail: response.data };
        } else {
            console.error("Error en la API de Tuya al ejecutar comando:", response.data);
            throw new functions.https.HttpsError('internal', response.data.msg || "Error en la API de Tuya.");
        }

    } catch (error) {
        console.error("Error en la ejecución de solicitarAperturaTuya:", error.message, error.response ? error.response.data : '');
        // El error ya fue logeado arriba con el formato correcto, aquí solo lanzamos el error al cliente.
        throw new functions.https.HttpsError('internal', error.message || "Ocurrió un error inesperado al contactar con la cerradura.");
    }
});
