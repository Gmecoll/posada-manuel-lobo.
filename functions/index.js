const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require('firebase-admin');
const axios = require('axios');
const crypto = require('crypto');
const { MercadoPagoConfig, Preference } = require('mercadopago');

if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();

// --- FUNCIÓN 1: PAGO CON MERCADO PAGO ---
exports.iniciarPagoServicio = onCall({ 
    region: "us-central1",
    secrets: ["MERCADOPAGO_ACCESSTOKEN"] 
}, async (request) => {
    try {
        if (!process.env.MERCADOPAGO_ACCESSTOKEN) {
            throw new HttpsError('failed-precondition', 'Configuración de MP incompleta.');
        }
        const client = new MercadoPagoConfig({ accessToken: process.env.MERCADOPAGO_ACCESSTOKEN });
        const preference = new Preference(client);
        const { items, back_urls, external_reference } = request.data;

        const response = await preference.create({
            body: {
                items,
                back_urls,
                external_reference,
                notification_url: "https://us-central1-studio-4343626376-fea63.cloudfunctions.net/webhookMercadoPago",
                auto_return: "approved",
            }
        });
        return { init_point: response.init_point };
    } catch (error) {
        throw new HttpsError('internal', error.message);
    }
});

// --- FUNCIÓN 2: ROTACIÓN DE CÓDIGO ---
exports.mantenimientoHabitaciones = onSchedule({ schedule: "every 30 minutes", region: "us-central1" }, async (event) => {
    const ahora = new Date();
    const locksSnap = await db.collection('locks').get();
    for (const doc of locksSnap.docs) {
        const data = doc.data();
        if (data.tempCode && data.expiryDate) {
            const expiry = data.expiryDate.toDate();
            if (ahora > expiry) {
                await doc.ref.update({ tempCode: null, expiryDate: null, status: 'vacante' });
            }
        }
    }
    return null;
});

// --- FUNCIÓN 3: IA CONSERJE (CARGA PEREZOSA) ---
exports.conserjeCall = onCall({ 
    secrets: ["GOOGLE_GENAI_API_KEY"], 
    region: "us-central1" 
}, async (request) => {
    let aiModule;
    try { 
        aiModule = require('./conserjeflow.js'); 
    } catch (e) { 
        console.error("Error cargando conserjeflow:", e.message);
        throw new HttpsError('unavailable', 'IA no cargada');
    }

    try {
        const result = await aiModule.conserjeflow(request.data);
        return { response: result };
    } catch (error) {
        console.error("Error en conserjeCall:", error);
        throw new HttpsError('internal', error.message);
    }
});

// ==========================================
// --- FUNCIONES TTLOCK (AMÉRICA) ---
// ==========================================

// --- FUNCIÓN 4: OBTENER TOKEN (AMÉRICA) ---
exports.obtenerTokenTTLock = onCall({ 
    region: "us-central1",
    secrets: ["TTLOCK_CLIENT_ID", "TTLOCK_CLIENT_SECRET"] 
}, async (request) => {
    const { username, passwordRaw } = request.data || {};
    const clientId = process.env.TTLOCK_CLIENT_ID;
    const clientSecret = process.env.TTLOCK_CLIENT_SECRET;

    if (!username || !passwordRaw) throw new HttpsError('invalid-argument', 'Faltan credenciales.');
    
    const md5Password = crypto.createHash('md5').update(passwordRaw).digest('hex');

    try {
        const params = new URLSearchParams();
        params.append('client_id', clientId);
        params.append('client_secret', clientSecret);
        params.append('username', username);
        params.append('password', md5Password);
        params.append('grant_type', 'password');
        
        const response = await axios.post('https://api.ttlock.com/oauth2/token', params);
        
        if (response.data.access_token) {
            await db.collection('configuracion_sistema').doc('ttlock_auth').set({
                accessToken: response.data.access_token,
                uid: response.data.uid,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            return { success: true };
        }
        return { success: false, error: response.data.error_description || 'Error en autenticación' };
    } catch (error) {
        throw new HttpsError('internal', error.message);
    }
});

// --- FUNCIÓN 5: APERTURA REMOTA (AMÉRICA) ---
exports.abrirCerraduraRemote = onCall({ 
    region: "us-central1",
    secrets: ["TTLOCK_CLIENT_ID"] 
}, async (request) => {
    const clientId = process.env.TTLOCK_CLIENT_ID;
    const { lockId } = request.data || {};

    try {
        const authDoc = await db.collection('configuracion_sistema').doc('ttlock_auth').get();
        if (!authDoc.exists) throw new HttpsError('failed-precondition', 'No vinculado.');

        const { accessToken } = authDoc.data();
        const params = new URLSearchParams();
        params.append('clientId', clientId);
        params.append('accessToken', accessToken);
        params.append('lockId', lockId);
        params.append('date', Date.now().toString());

        const response = await axios.post('https://api.ttlock.com/v3/lock/unlock', params);
        return { success: response.data.errcode === 0, error: response.data.errmsg };
    } catch (error) {
        throw new HttpsError('internal', error.message);
    }
});

// --- FUNCIÓN 6: LISTAR CERRADURAS (ADAPTADA Y MAPEADA) ---
exports.listarCerradurasTTLock = onCall({ 
    region: "us-central1",
    secrets: ["TTLOCK_CLIENT_ID"] 
}, async (request) => {
    const clientId = process.env.TTLOCK_CLIENT_ID;
    try {
        const authDoc = await db.collection('configuracion_sistema').doc('ttlock_auth').get();
        if (!authDoc.exists) throw new HttpsError('failed-precondition', 'Token no encontrado.');

        const { accessToken } = authDoc.data();
        
        const response = await axios.get('https://api.ttlock.com/v3/lock/list', {
            params: { clientId, accessToken, pageNo: 1, pageSize: 20, date: Date.now().toString() }
        });

        console.log("--- RESPUESTA CRUDA AMÉRICA ---", JSON.stringify(response.data));

        if (response.data.errcode !== 0) {
            return { success: false, error: response.data.errmsg };
        }

        // Mapeo de datos para el Frontend
        const locks = (response.data.list || []).map(l => ({ 
            id: l.lockId, 
            nombre: l.lockAlias || l.lockName, 
            bateria: l.electricQuantity, 
            online: l.hasGateway === 1 
        }));

        // Retorno de objeto plano para evitar problemas de serialización
        return { 
            success: true, 
            locks: locks 
        };
        
    } catch (error) {
        console.error("Error en listarCerradurasTTLock:", error);
        throw new HttpsError('internal', error.message);
    }
});