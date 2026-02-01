const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require('firebase-admin');

// 1. Inicialización Única
if (!admin.apps.length) {
    admin.initializeApp();
}

// --- FUNCIÓN 2: ROTACIÓN DE CÓDIGO ---
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
        return null;
    } catch (err) { 
        console.error("Error Scheduler:", err);
        return null; 
    }
});

const { MercadoPagoConfig, Preference } = require('mercadopago');

// Inicializa el cliente con tu Token de la imagen 6b279a
const client = new MercadoPagoConfig({ 
    accessToken: 'APP_USR-1380997564314497-012922-d7b98ce611bb36b3a5cef2ffe93e0c25-3169176624' 
});

exports.iniciarPagoServicio = onCall(async (request) => {
    const data = request.data;

    try {
        const preference = new Preference(client);

        // Creamos la "Preferencia" (el carrito de compra en MP)
        const result = await preference.create({
            body: {
                items: [
                    {
                        title: 'Servicio de Posada - Alquiler',
                        quantity: 1,
                        unit_price: Number(data.amount) || 250, // Asegura que sea número
                        currency_id: 'USD' // O 'UYU' si cobras en pesos
                    }
                ],
                back_urls: {
                    success: "https://posada-manuel-lobo.web.app/?payment=success",
                    failure: "https://posada-manuel-lobo.web.app/services",
                    pending: "https://posada-manuel-lobo.web.app/services"
                },
                auto_return: "approved", // Vuelve a tu web apenas pague
            }
        });

        // Este es el link mágico que el usuario debe abrir
        return { checkout_url: result.init_point };

    } catch (error) {
        console.error("ERROR MERCADO PAGO:", error);
        throw new HttpsError('internal', 'Error al generar el pago');
    }
});
