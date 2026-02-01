const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require('firebase-admin');
const { MercadoPagoConfig, Preference } = require('mercadopago');

// 1. Inicialización Única
if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();

// 2. Configuración de Mercado Pago
const client = new MercadoPagoConfig({ 
    accessToken: 'APP_USR-1380997564314497-012922-d7b98ce611bb36b3a5cef2ffe93e0c25-3169176624' 
});

// --- FUNCIÓN 1: PAGO CON MERCADO PAGO ---
exports.iniciarPagoServicio = onCall(async (request) => {
    const data = request.data;
    const { serviceId, quantity, guestName, userId } = data;

    if (!serviceId || !quantity || !guestName || !userId) {
        throw new HttpsError('invalid-argument', 'Faltan parámetros obligatorios (serviceId, quantity, guestName, userId).');
    }

    try {
        const serviceRef = db.collection('services').doc(serviceId);
        const serviceDoc = await serviceRef.get();

        if (!serviceDoc.exists) {
            throw new HttpsError('not-found', `El servicio con ID ${serviceId} no fue encontrado.`);
        }

        const serviceData = serviceDoc.data();
        const { title, price, currency } = serviceData;

        if (!title || !price || !currency) {
            throw new HttpsError('internal', 'El documento del servicio no tiene la información necesaria (title, price, currency).');
        }

        const preference = new Preference(client);
        const externalReference = `solicitud-${Date.now()}`;
        
        const preferenceData = {
            items: [
                {
                    id: serviceId,
                    title: title,
                    quantity: Number(quantity),
                    unit_price: Number(price),
                    currency_id: currency, // USD or UYU
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
            }
        };

        const result = await preference.create({ body: preferenceData });

        const solicitudServicio = {
            servicioId: serviceId,
            nombreServicio: title,
            monto: Number(price) * Number(quantity),
            currency: currency,
            cantidad: Number(quantity),
            fecha: admin.firestore.FieldValue.serverTimestamp(),
            estado_pago: 'pendiente',
            usuarioId: userId,
            guestName: guestName,
            external_reference: externalReference
        };

        await db.collection('solicitudes_servicios').doc(externalReference).set(solicitudServicio);
        
        return { checkout_url: result.init_point };

    } catch (error) {
        console.error("ERROR MERCADO PAGO:", error);
        if (error instanceof HttpsError) {
            throw error;
        }
        throw new HttpsError('internal', `Error al generar el link de pago: ${error.message}`);
    }
});


// --- FUNCIÓN 2: ROTACIÓN DE CÓDIGO (SCHEDULER) ---
exports.mantenimientoHabitaciones = onSchedule("every 30 minutes", async (event) => {
    const db = admin.firestore();
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
        console.log("Rotación de códigos completada exitosamente.");
        return null;
    } catch (err) { 
        console.error("Error Scheduler:", err);
        return null; 
    }
});
