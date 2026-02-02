const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require('firebase-admin');
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
    
    const accessToken = process.env.MERCADOPAGO_ACCESSTOKEN;
    
    if (!accessToken) {
        throw new HttpsError('failed-precondition', 'Secreto MERCADOPAGO_ACCESSTOKEN no encontrado.');
    }

    const client = new MercadoPagoConfig({ accessToken: accessToken });
    const { serviceId, quantity, guestName, userId, roomNumber } = request.data || {};

    try {
        const serviceDoc = await db.collection('services').doc(serviceId).get();
        if (!serviceDoc.exists) throw new HttpsError('not-found', 'Servicio no encontrado.');

        const serviceData = serviceDoc.data();
        const totalAmount = Number(serviceData.price) * Number(quantity);
        const externalReference = `solicitud-${Date.now()}`;

        // Registro de la solicitud en Firestore
        await db.collection('solicitudes_servicios').doc(externalReference).set({
            servicioId: serviceId,
            nombreServicio: serviceData.title,
            monto: totalAmount,
            cantidad: Number(quantity),
            fecha: admin.firestore.FieldValue.serverTimestamp(),
            estado_pago: 'pendiente', 
            usuarioId: userId,
            guestName: guestName,
            roomNumber: roomNumber || "N/A",
            external_reference: externalReference
        });

        const preference = new Preference(client);
        
        // Creación de la preferencia con URLs de retorno de tu dominio
        const result = await preference.create({ 
            body: {
                items: [{ 
                    title: serviceData.title, 
                    quantity: Number(quantity), 
                    unit_price: Number(serviceData.price), 
                    currency_id: 'UYU' 
                }],
                external_reference: externalReference,
                back_urls: {
                    success: "https://posada-manuel-lobo.web.app/servicios", 
                    failure: "https://posada-manuel-lobo.web.app/servicios",
                    pending: "https://posada-manuel-lobo.web.app/servicios"
                },
                auto_return: "approved"
            } 
        });

        return { checkout_url: result.init_point };
    } catch (error) {
        console.error("Error en Mercado Pago:", error);
        throw new HttpsError('internal', error.message);
    }
});

// --- FUNCIÓN 2: ROTACIÓN DE CÓDIGO (SCHEDULER) ---
exports.mantenimientoHabitaciones = onSchedule({ schedule: "every 30 minutes", region: "us-central1" }, async (event) => {
    const roomsSnapshot = await db.collection('rooms').get();
    const batch = db.batch();
    roomsSnapshot.forEach(roomDoc => {
        const codes = roomDoc.data().codes_pool;
        if (codes?.length > 0) {
            batch.update(roomDoc.ref, { backup_code: codes[Math.floor(Math.random() * codes.length)] });
        }
    });
    return batch.commit();
});

// --- FUNCIÓN 3: IA CONSERJE ---
let aiModule;
try {
    aiModule = require('./conserjeflow.js');
} catch (e) {
    console.error("Error cargando conserjeflow:", e.message);
}

exports.conserjeCall = onCall(
  { 
    secrets: ["GOOGLE_GENAI_API_KEY"], 
    region: "us-central1" 
  }, 
  async (request) => {
    if (!aiModule?.conserjeflow) throw new HttpsError('unavailable', 'IA no cargada.');

    try {
        const response = await aiModule.conserjeflow(request.data);
        return { response };
    } catch (error) {
        console.error("Error en ejecución de IA:", error);
        throw new HttpsError('internal', error.message);
    }
});