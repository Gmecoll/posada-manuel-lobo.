
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
    // --- MODO DEPURACIÓN: Se aísla la escritura en Firestore ---
    try {
        const guest_name = data.guest_name || "Huésped (Prueba)";
        const room_number = data.room_number || "Desconocida (Prueba)";

        const logDescription = `El huésped ${guest_name} abrió la puerta de la Habitación ${room_number}`;
        
        await admin.firestore().collection('activity_logs').add({
            description: logDescription,
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });

        // Se simula una respuesta exitosa sin llamar a Tuya.
        return { 
            success: true, 
            message: "Acceso autorizado y puerta abierta (MODO DEPURACIÓN)", 
            detail: { msg: "Simulated success" } 
        };

    } catch (error) {
        console.error("Error en proceso de apertura (MODO DEPURACIÓN):", error.message);
        throw new functions.https.HttpsError('internal', error.message);
    }
});
