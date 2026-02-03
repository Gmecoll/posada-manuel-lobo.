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
        if (!process.env.MERCADOPAGO_ACCESSTOKEN) {
            throw new HttpsError('failed-precondition', 'La configuración de Mercado Pago no está completa.');
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
        console.error("Error creando preferencia de Mercado Pago:", error);
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
        console.error("Error en conserjeCall:", error);
        throw new HttpsError('internal', error.message);
    }
});

// ==========================================
// --- FUNCIONES TTLOCK (REVISADAS Y MEJORADAS) ---
// ==========================================

// --- FUNCIÓN 4: VINCULACIÓN INICIAL (OBTENER TOKEN) ---
exports.obtenerTokenTTLock = onCall({ 
    region: "us-central1",
    secrets: ["TTLOCK_CLIENT_ID", "TTLOCK_CLIENT_SECRET"] 
}, async (request) => {
    const { username, passwordRaw } = request.data || {};
    const clientId = process.env.TTLOCK_CLIENT_ID;
    const clientSecret = process.env.TTLOCK_CLIENT_SECRET;

    if (!username || !passwordRaw) {
        throw new HttpsError('invalid-argument', 'El nombre de usuario y la contraseña son requeridos.');
    }
    if (!clientId || !clientSecret) {
        throw new HttpsError('failed-precondition', 'La configuración del servidor para TTLock está incompleta. Contacte a soporte.');
    }
    const md5Password = crypto.createHash('md5').update(passwordRaw).digest('hex');

    try {
        const params = new URLSearchParams();
        params.append('client_id', clientId);
        params.append('client_secret', clientSecret);
        params.append('username', username);
        params.append('password', md5Password);
        params.append('grant_type', 'password');

        const response = await axios.post('https://euapi.ttlock.com/oauth2/token', params);
        
        if (response.data.error) {
            return { success: false, error: `${response.data.error}: ${response.data.error_description}` };
        }

        if (response.data.access_token) {
            await db.collection('configuracion_sistema').doc('ttlock_auth').set({
                accessToken: response.data.access_token,
                uid: response.data.uid,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            return { success: true };
        }
        return { success: false, error: response.data.errmsg || 'Respuesta inesperada del servidor de TTLock.' };
    } catch (error) {
        console.error("Error al obtener token de TTLock:", error.response ? error.response.data : error.message);
        const errorData = error.response?.data;
        const errorMessage = errorData ? `${errorData.error}: ${errorData.error_description}` : error.message;
        throw new HttpsError('internal', 'No se pudo obtener el token de TTLock. ' + errorMessage);
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
    
    if (!authDoc.exists || !authDoc.data()?.accessToken) {
        throw new HttpsError('failed-precondition', 'No vinculado a TTLock o token no encontrado. Por favor, vincule la cuenta de nuevo.');
    }

    const { accessToken } = authDoc.data();
    try {
        const params = new URLSearchParams();
        params.append('clientId', clientId);
        params.append('accessToken', accessToken);
        params.append('lockId', lockId);
        params.append('date', Date.now().toString());

        const response = await axios.post('https://euapi.ttlock.com/v3/lock/unlock', params);
        
        if (response.data.errcode !== 0) {
            return { success: false, error: response.data.errmsg || 'Error desconocido de TTLock' };
        }
        
        return { success: true, error: null };
    } catch (error) {
        console.error("Error al abrir cerradura en TTLock:", error.response ? error.response.data : error.message);
        throw new HttpsError('internal', 'Fallo al intentar abrir la cerradura: ' + (error.response?.data?.errmsg || error.message));
    }
});

// --- FUNCIÓN 6: LISTAR CERRADURAS (CORREGIDA) ---
exports.listarCerradurasTTLock = onCall({ 
    region: "us-central1",
    secrets: ["TTLOCK_CLIENT_ID"] 
}, async (request) => {
    const authDoc = await db.collection('configuracion_sistema').doc('ttlock_auth').get();
    if (!authDoc.exists || !authDoc.data()?.accessToken) {
        throw new HttpsError('failed-precondition', 'No vinculado a TTLock o token no encontrado. Por favor, vincule la cuenta de nuevo.');
    }
    
    const { accessToken } = authDoc.data();
    try {
        const response = await axios.get('https://euapi.ttlock.com/v3/lock/list', {
            params: { 
                clientId: process.env.TTLOCK_CLIENT_ID, 
                accessToken, 
                pageNo: 1, 
                pageSize: 20, 
                date: Date.now().toString() 
            }
        });
        
        if (response.data.errcode !== 0) {
            return { success: false, error: response.data.errmsg || 'Error desconocido de TTLock' };
        }

        return { 
            success: true, 
            locks: (response.data.list || []).map(l => ({ 
                id: l.lockId, 
                nombre: l.lockAlias || l.lockName, 
                bateria: l.electricQuantity, 
                online: l.hasGateway === 1 
            })) 
        };
    } catch (error) {
        console.error("Error al listar cerraduras de TTLock:", error.response ? error.response.data : error.message);
        throw new HttpsError('internal', 'No se pudo conectar con el servicio de TTLock: ' + (error.response?.data?.errmsg || error.message));
    }
});
