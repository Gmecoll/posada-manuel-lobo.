const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require('firebase-admin');
const axios = require('axios'); // Para hablar con TTLock
const crypto = require('crypto'); // Para la contraseña en MD5
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

// --- FUNCIÓN 2: ROTACIÓN DE CÓDIGO (SCHEDULER) ---
exports.mantenimientoHabitaciones = onSchedule({ schedule: "every 30 minutes", region: "us-central1" }, async (event) => {
    const ahora = new Date();
    const locksSnap = await db.collection('locks').get();
    
    for (const doc of locksSnap.docs) {
        const data = doc.data();
        if (data.tempCode && data.expiryDate) {
            const expiry = data.expiryDate.toDate();
            if (ahora > expiry) {
                await doc.ref.update({ tempCode: null, expiryDate: null, status: 'vacante' });
                console.log(`Código expirado para: ${doc.id}`);
            }
        }
    }
    return null;
});

// --- FUNCIÓN 3: IA CONSERJE ---
let aiModule;
try {
    aiModule = require('./conserjeflow.js');
} catch (e) {
    console.error("Error cargando conserjeflow:", e.message);
}

exports.conserjeCall = onCall({ 
    secrets: ["GOOGLE_GENAI_API_KEY"], 
    region: "us-central1" 
}, async (request) => {
    if (!aiModule) throw new HttpsError('unavailable', 'Módulo IA no cargado');
    try {
        const result = await aiModule.conserjeflow(request.data);
        return { response: result };
    } catch (error) {
        throw new HttpsError('internal', error.message);
    }
});

// ==========================================
// --- NUEVAS FUNCIONES TTLOCK (DESACTIVADAS TEMPORALMENTE) ---
// ==========================================

/*
// --- FUNCIÓN 4: VINCULACIÓN INICIAL ---
exports.obtenerTokenTTLock = onCall({ 
    region: "us-central1",
    secrets: ["TTLOCK_CLIENT_ID", "TTLOCK_CLIENT_SECRET"] 
}, async (request) => {
    const { username, passwordRaw } = request.data || {};
    const clientId = process.env.TTLOCK_CLIENT_ID;
    const clientSecret = process.env.TTLOCK_CLIENT_SECRET;

    if (!username || !passwordRaw) throw new HttpsError('invalid-argument', 'Credenciales incompletas.');
    const md5Password = crypto.createHash('md5').update(passwordRaw).digest('hex');

    try {
        const params = new URLSearchParams();
        params.append('client_id', clientId);
        params.append('client_secret', clientSecret);
        params.append('username', username);
        params.append('password', md5Password);
        params.append('grant_type', 'password');

        const response = await axios.post('https://euapi.ttlock.com/oauth2/token', params);
        if (response.data.access_token) {
            await db.collection('configuracion_sistema').doc('ttlock_auth').set({
                accessToken: response.data.access_token,
                uid: response.data.uid,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            return { success: true };
        }
        return { success: false, error: response.data.errmsg };
    } catch (error) {
        throw new HttpsError('internal', error.message);
    }
});

// --- FUNCIÓN 5: APERTURA REMOTA ---
exports.abrirCerraduraRemote = onCall({ 
    region: "us-central1",
    secrets: ["TTLOCK_CLIENT_ID"] 
}, async (request) => {
    const { lockId } = request.data || {};
    const clientId = process.env.TTLOCK_CLIENT_ID;
    const authDoc = await db.collection('configuracion_sistema').doc('ttlock_auth').get();
    if (!authDoc.exists) throw new HttpsError('failed-precondition', 'No vinculado.');

    const { accessToken } = authDoc.data();
    try {
        const params = new URLSearchParams();
        params.append('clientId', clientId);
        params.append('accessToken', accessToken);
        params.append('lockId', lockId);
        params.append('date', Date.now().toString());

        const response = await axios.post('https://euapi.ttlock.com/v3/lock/unlock', params);
        return { success: response.data.errcode === 0, error: response.data.errmsg };
    } catch (error) {
        throw new HttpsError('internal', error.message);
    }
});

// --- FUNCIÓN 6: LISTAR CERRADURAS ---
exports.listarCerradurasTTLock = onCall({ 
    region: "us-central1",
    secrets: ["TTLOCK_CLIENT_ID"] 
}, async (request) => {
    const authDoc = await db.collection('configuracion_sistema').doc('ttlock_auth').get();
    if (!authDoc.exists) throw new HttpsError('failed-precondition', 'No vinculado.');
    
    const { accessToken } = authDoc.data();
    try {
        const response = await axios.get('https://euapi.ttlock.com/v3/lock/list', {
            params: { clientId: process.env.TTLOCK_CLIENT_ID, accessToken, pageNo: 1, pageSize: 20, date: Date.now() }
        });
        return { 
            success: true, 
            locks: response.data.list.map(l => ({ id: l.lockId, nombre: l.lockAlias || l.lockName, bateria: l.electricQuantity, online: l.hasGateway === 1 })) 
        };
    } catch (error) {
        throw new HttpsError('internal', error.message);
    }
});
*/