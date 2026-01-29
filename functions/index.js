const functions = require('firebase-functions');
const axios = require('axios');
const crypto = require('crypto');

exports.solicitarAperturaTuya = functions.https.onCall(async (data, context) => {
    // El deviceId se debe pasar desde el cliente
    const deviceId = data.deviceId;
    if (!deviceId) {
        throw new functions.https.HttpsError('invalid-argument', 'La función debe ser llamada con un argumento "deviceId".');
    }

    const accessId = "g84wgnf5ajyv4pknnn8n";
    const secret = "32850b4de252491c8f2608e0b74631f0";
    const url = `https://openapi.tuyaus.com/v1.0/devices/${deviceId}/commands`;

    try {
        const t = Date.now().toString();
        // Lógica de firma de la API de Tuya
        const sign = crypto.createHmac('sha256', secret)
            .update(accessId + t)
            .digest('hex').toUpperCase();

        const response = await axios.post(url, {
            "commands": [{ "code": "door_opened", "value": true }]
        }, {
            headers: {
                't': t,
                'sign': sign,
                'client_id': accessId,
                'sign_method': 'HMAC-SHA256',
                'Content-Type': 'application/json'
            }
        });
        
        if (response.data && response.data.success) {
            return { success: true, result: response.data };
        } else {
            console.error("Error desde la API de Tuya:", response.data);
            throw new functions.https.HttpsError('unknown', 'La API de Tuya retornó un error.', response.data);
        }

    } catch (error) {
        console.error("Error al llamar a Tuya:", error.response ? error.response.data : error.message);
        throw new functions.https.HttpsError('internal', 'Error al abrir la cerradura.');
    }
});
