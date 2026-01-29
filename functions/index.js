const functions = require('firebase-functions');
const axios = require('axios');
const crypto = require('crypto');

// Credenciales confirmadas
const ACCESS_ID = "g84wgnf5ajyv4pknnn8n";
const SECRET = "32850b4de252491c8f2608e0b74631f0";
const ENDPOINT = "https://openapi.tuyaus.com";
const DEVICE_ID = "vdevo176964136999932";

exports.solicitarAperturaTuya = functions.https.onCall(async (data, context) => {
    try {
        // --- 1. OBTENER TOKEN (Firma V2) ---
        const t = Date.now().toString();
        const urlToken = "/v1.0/token?grant_type=1";
        const contentHash = crypto.createHash('sha256').update("").digest('hex');
        const stringToSign = `GET\n${contentHash}\n\n${urlToken}`;
        
        const sign = crypto.createHmac('sha256', SECRET)
            .update(ACCESS_ID + t + stringToSign)
            .digest('hex').toUpperCase();

        const tokenRes = await axios.get(`${ENDPOINT}${urlToken}`, {
            headers: { 
                'client_id': ACCESS_ID, 
                'sign': sign, 
                't': t, 
                'sign_method': 'HMAC-SHA256' 
            }
        });

        if (!tokenRes.data.success) throw new Error(`Tuya Token Fail: ${tokenRes.data.msg}`);
        const accessToken = tokenRes.data.result.access_token;

        // --- 2. FUNCIÓN INTERNA PARA ENVIAR COMANDOS ---
        const enviarComando = async (valor) => {
            const tCmd = Date.now().toString();
            const urlCmd = `/v1.0/devices/${DEVICE_ID}/commands`;
            const body = { "commands": [{ "code": "door_opened", "value": valor }] };
            const bHash = crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex');
            
            const stringToSignCmd = `POST\n${bHash}\n\n${urlCmd}`;
            const s2 = crypto.createHmac('sha256', SECRET)
                .update(ACCESS_ID + accessToken + tCmd + stringToSignCmd)
                .digest('hex').toUpperCase();

            return axios.post(`${ENDPOINT}${urlCmd}`, body, {
                headers: { 
                    'client_id': ACCESS_ID, 
                    'access_token': accessToken, 
                    'sign': s2, 
                    't': tCmd, 
                    'sign_method': 'HMAC-SHA256', 
                    'Content-Type': 'application/json' 
                }
            });
        };

        // --- 3. EJECUCIÓN ---
        // Abrir la puerta inmediatamente
        const openRes = await enviarComando(true);
        
        if (!openRes.data.success) throw new Error(`Tuya Command Fail: ${openRes.data.msg}`);

        // Esperar 5 segundos y cerrar el switch virtual en Smart Life
        setTimeout(async () => {
            try {
                await enviarComando(false);
                console.log("Switch virtual restablecido a cerrado");
            } catch (e) {
                console.error("Error al restablecer switch:", e.message);
            }
        }, 5000);

        return { 
            success: true, 
            message: "Puerta abierta correctamente", 
            detail: openRes.data 
        };

    } catch (error) {
        console.error("Error en proceso:", error.message);
        throw new functions.https.HttpsError('internal', error.message);
    }
});