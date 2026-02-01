const functions = require("firebase-functions");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require('firebase-admin');
const { MercadoPagoConfig, Preference } = require('mercadopago');

// 1. Inicialización Única
if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();

// --- FUNCIÓN 1: PAGO CON MERCADO PAGO Y REPORTE ---
exports.iniciarPagoServicio = onCall(async (request) => {
    // Valida que la configuración de Mercado Pago exista
    if (!functions.config().mercadopago || !functions.config().mercadopago.accesstoken) {
        console.error("Error: Faltan variables de configuración de Mercado Pago (mercadopago.accesstoken).");
        throw new HttpsError('internal', 'El servidor de pagos no está configurado correctamente.');
    }
    
    // 2. Configuración de Mercado Pago con variables de entorno
    const client = new MercadoPagoConfig({ 
        accessToken: functions.config().mercadopago.accesstoken
    });
    
    const data = request.data;
    const { serviceId, quantity, guestName, userId, roomNumber } = data;

    if (!serviceId || !quantity || !guestName || !userId) {
        throw new HttpsError('invalid-argument', 'Faltan parámetros obligatorios.');
    }

    try {
        const serviceRef = db.collection('services').doc(serviceId);
        const serviceDoc = await serviceRef.get();

        if (!serviceDoc.exists) {
            throw new HttpsError('not-found', 'El servicio no existe.');
        }

        const serviceData = serviceDoc.data();
        const { title, price, currency } = serviceData;
        const paymentCurrency = currency || 'UYU';
        const totalAmount = Number(price) * Number(quantity);
        const externalReference = `solicitud-${Date.now()}`;

        const solicitudServicio = {
            servicioId: serviceId,
            nombreServicio: title,
            monto: totalAmount,
            currency: paymentCurrency,
            cantidad: Number(quantity),
            fecha: admin.firestore.FieldValue.serverTimestamp(),
            estado_pago: 'pendiente', 
            usuarioId: userId,
            guestName: guestName,
            roomNumber: roomNumber || "N/A",
            external_reference: externalReference,
            leido: false 
        };

        await db.collection('solicitudes_servicios').doc(externalReference).set(solicitudServicio);

        const preference = new Preference(client);
        const preferenceData = {
            items: [
                {
                    id: serviceId,
                    title: title,
                    quantity: Number(quantity),
                    unit_price: Number(price),
                    currency_id: paymentCurrency,
                }
            ],
            back_urls: {
                success: "https://posada-manuel-lobo.web.app/services?payment=success",
                failure: "https://posada-manuel-lobo.web.app/services?payment=failure",
                pending: "https://posada-manuel-lobo.web.app/services?payment=pending"
            },
            auto_return: "approved",
            external_reference: externalReference,
            metadata: {
                guest_name: guestName,
                service_id: serviceId,
                user_id: userId,
                reporte_id: externalReference
            }
        };

        const result = await preference.create({ body: preferenceData });
        return { checkout_url: result.init_point, reporteId: externalReference };

    } catch (error) {
        console.error("ERROR MERCADO PAGO:", error);
        if (error instanceof HttpsError) throw error;
        throw new HttpsError('internal', `Error: ${error.message}`);
    }
});

// --- FUNCIÓN 2: ROTACIÓN DE CÓDIGO (SCHEDULER) ---
exports.mantenimientoHabitaciones = onSchedule("every 30 minutes", async (event) => {
    try {
        const roomsSnapshot = await db.collection('rooms').get();
        const batch = db.batch();
        
        roomsSnapshot.forEach(roomDoc => {
            const roomData = roomDoc.data();
            if (roomData.codes_pool?.length > 0) {
                const randomCode = roomData.codes_pool[Math.floor(Math.random() * roomData.codes_pool.length)];
                batch.update(roomDoc.ref, { 
                    backup_code: randomCode, 
                    last_rotation: admin.firestore.FieldValue.serverTimestamp() 
                });
            }
        });
        
        await batch.commit();
        console.log("Rotación exitosa.");
    } catch (err) { 
        console.error("Error Scheduler:", err);
    }
    return null;
});

// --- FUNCIÓN 3: IA CONSERJE (GENKIT) ---
// Usamos require para mantener consistencia con el resto del archivo
const { conserjeFlow } = require('./ai/flows/conserjeflow');

exports.conserjeCall = onCall(async (request) => {
    try {
        // Llamamos al flujo de Genkit pasándole el texto del usuario
        // Asegúrate de que conserjeFlow esté exportado correctamente en su archivo
        const response = await conserjeFlow(request.data);
        return response;
    } catch (error) {
        console.error("ERROR IA:", error);
        throw new HttpsError('internal', 'Error al procesar la consulta de IA.');
    }
});
