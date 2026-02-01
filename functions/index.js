const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require('firebase-admin');
const { MercadoPagoConfig, Preference } = require('mercadopago');

// 1. Inicialización Única
if (!admin.apps.length) {
    admin.initializeApp();
}

// 2. Configuración de Mercado Pago
const client = new MercadoPagoConfig({ 
    accessToken: 'APP_USR-1380997564314497-012922-d7b98ce611bb36b3a5cef2ffe93e0c25-3169176624' 
});

// --- FUNCIÓN 1: PAGO CON MERCADO PAGO ---
exports.iniciarPagoServicio = onCall(async (request) => {
    const data = request.data;

    // Validación básica de entrada
    if (!data.amount) {
        throw new HttpsError('invalid-argument', 'El monto es obligatorio.');
    }

    try {
        const preference = new Preference(client);

        const result = await preference.create({
            body: {
                items: [
                    {
                        title: data.serviceTitle || 'Servicio de Posada - Alquiler',
                        quantity: 1,
                        unit_price: Number(data.amount),
                        currency_id: 'USD'
                    }
                ],
                back_urls: {
                    success: "https://posada-manuel-lobo.web.app/?payment=success",
                    failure: "https://posada-manuel-lobo.web.app/services",
                    pending: "https://posada-manuel-lobo.web.app/services"
                },
                auto_return: "approved",
                external_reference: `reserva-${Date.now()}`,
                metadata: {
                    guest_name: data.guestName,
                    service_id: data.serviceId
                }
            }
        });

        // Retornamos la URL de Checkout Pro
        return { checkout_url: result.init_point };

    } catch (error) {
        console.error("ERROR MERCADO PAGO:", error);
        throw new HttpsError('internal', 'Error al generar el link de pago');
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