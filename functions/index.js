const functions = require('firebase-functions');
const axios = require('axios');
const crypto = require('crypto');

// Credenciales validadas de tu consola
const ACCESS_ID = "g84wgnf5ajyv4pknnn8n";
const SECRET = "32850b4de252491c8f2608e0b74631f0";
const ENDPOINT = "https://openapi.tuyaus.com";

exports.solicitarAperturaTuya = functions.https.onCall(async (data, context) => {
    // 1. Captura del ID (Prioriza lo que envía la App, sino usa el virtual de respaldo)
    const deviceId = data.tuya_device_id || data.deviceId || "vdevo176964136999932";

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

        if (!resToken.data.success) throw new Error(`Token Error: ${resToken.data.msg}`);
        const token = resToken.data.result.access_token;

        // --- PASO 2: ENVIAR COMANDO BOOLEAN ---
        // Usamos "door_opened" porque tu dispositivo es de tipo boolean
        const urlCmd = `/v1.0/devices/${deviceId}/commands`;
        const body = { 
            "commands": [
                { 
                    "code": "door_opened", 
                    "value": true 
                }
            ] 
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
            // Esto mostrará el error específico de Tuya en el cuadro rojo de la App
            throw new Error(`Tuya dice: ${resCmd.data.msg} (Código: ${resCmd.data.code})`);
        }

    } catch (error) {
        // 'aborted' asegura que el mensaje llegue a la UI de la Guess App sin ser "INTERNAL"
        throw new functions.https.HttpsError('aborted', error.message);
    }
});