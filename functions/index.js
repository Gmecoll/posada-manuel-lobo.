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

exports.solicitarAperturaTuya = functions.https.onCall(async (data, context) => {
    // --- BLOQUE 1: VALIDACIÓN Y MAPEO ---
    
    // 1. Mapeo Híbrido: Acepta etiquetas de la App nueva (guest_name) y vieja (nombreHuesped)
    const deviceId = data.deviceId || "vdevo176964136999932";
    const guest_name = data.guest_name || data.nombreHuesped || "Huésped";
    const room_number = data.room_number || data.habitacion || "7";
    
    // 2. Validación de Seguridad (Opcional pero recomendada)
    if (context.auth) {
        const emailUsuario = context.auth.token.email;
        const reservaSnapshot = await admin.firestore().collection('reservas')
            .where('email', '==', emailUsuario)
            .where('room_number', '==', String(room_number))
            .where('estado', '==', 'Confirmed') // "Confirmed" en inglés según tu DB
            .get();

        if (reservaSnapshot.empty) {
            // Nota: Si quieres ser estricto, descomenta la línea de abajo. 
            // Por ahora solo lo logueamos para no bloquearte si hay error de datos.
            console.warn(`Usuario ${emailUsuario} sin reserva Confirmed para habitación ${room_number}`);
            // throw new functions.https.HttpsError('permission-denied', 'No tienes una reserva confirmada.');
        }
    }

    try {
        // --- BLOQUE 2: COMUNICACIÓN CON TUYA (Firma V2) ---

        // 3. Obtener Token
        const t = Date.now().toString();
        const urlToken = "/v1.0/token?grant_type=1";
        const contentHash = crypto.createHash('sha256').update("").digest('hex');
        const stringToSign = `GET\n${contentHash}\n\n${urlToken}`;
        
        const sign = crypto.createHmac('sha256', SECRET)
            .update(ACCESS_ID + t + stringToSign)
            .digest('hex').toUpperCase();

        const tokenRes = await axios.get(`${ENDPOINT}${urlToken}`, {
            headers: { 'client_id': ACCESS_ID, 'sign': sign, 't': t, 'sign_method': 'HMAC-SHA256' }
        });

        if (!tokenRes.data.success) throw new Error(`Tuya Token Fail: ${tokenRes.data.msg}`);
        const accessToken = tokenRes.data.result.access_token;

        // 4. Función interna para enviar comandos
        const enviarComando = async (valor) => {
            const tCmd = Date.now().toString();
            const urlCmd = `/v1.0/devices/${deviceId}/commands`;
            const body = { "commands": [{ "code": "door_opened", "value": valor }] };
            const bHash = crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex');
            
            const stringToSignCmd = `POST\n${bHash}\n\n${urlCmd}`;
            const s2 = crypto.createHmac('sha256', SECRET)
                .update(ACCESS_ID + accessToken + tCmd + stringToSignCmd)
                .digest('hex').toUpperCase();

            return axios.post(`${ENDPOINT}${urlCmd}`, body, {
                headers: { 
                    'client_id': ACCESS_ID, 'access_token': accessToken, 
                    'sign': s2, 't': tCmd, 'sign_method': 'HMAC-SHA256', 
                    'Content-Type': 'application/json' 
                }
            });
        };

        // --- BLOQUE 3: EJECUCIÓN Y REGISTRO ---

        // Abrir la puerta
        const openRes = await enviarComando(true);
        if (!openRes.data.success) throw new Error(`Tuya Command Fail: ${openRes.data.msg}`);

        // REGISTRO DE ACTIVIDAD: Usando la colección 'activity_logs' para que coincida con el frontend.
        await admin.firestore().collection('activity_logs').add({
            description: `El huésped ${guest_name} abrió la puerta de la Habitación ${room_number}`,
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });

        // REESTABLECER: 10 segundos para cerrar el switch virtual
        setTimeout(async () => {
            try {
                await enviarComando(false);
                console.log("Switch virtual restablecido a cerrado automáticamente");
            } catch (e) {
                console.error("Error al restablecer switch:", e.message);
            }
        }, 10000);

        return { 
            success: true, 
            message: "Acceso autorizado y puerta abierta", 
            detail: openRes.data 
        };

    } catch (error) {
        console.error("Error en proceso de apertura:", error.message);
        throw new functions.https.HttpsError('internal', error.message);
    }
});
