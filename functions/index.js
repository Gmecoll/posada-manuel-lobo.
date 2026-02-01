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

// --- FUNCIÓN 1: PAGO CON MERCADO PAGO Y REPORTE ---
exports.iniciarPagoServicio = onCall(async (request) => {
    const data = request.data;
    const { serviceId, quantity, guestName, userId, roomNumber } = data;

    // Validación de parámetros
    if (!serviceId || !quantity || !guestName || !userId) {
        throw new HttpsError('invalid-argument', 'Faltan parámetros obligatorios.');
    }

    try {
        // Obtener datos del servicio desde Firestore
        const serviceRef = db.collection('services').doc(serviceId);
        const serviceDoc = await serviceRef.get();

        if (!serviceDoc.exists) {
            throw new HttpsError('not-found', 'El servicio no existe.');
        }

        const serviceData = serviceDoc.data();
        const { title, price, currency } = serviceData;
        const paymentCurrency = currency || 'UYU';
        const totalAmount = Number(price) * Number(quantity);

        // Generar ID único para la transacción y el reporte
        const externalReference = `solicitud-${Date.now()}`;

        // 3. CREAR REPORTE PARA EL ADMIN PANEL (Aquí se dispara el Pop-up en el Admin)
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
            leido: false // <--- IMPORTANTE: Esto activa la alerta en el Panel Admin
        };

        // Guardamos el reporte en Firestore (esto funciona aunque el cliente no tenga reglas de escritura)
        await db.collection('solicitudes_servicios').doc(externalReference).set(solicitudServicio);

        // 4. CREAR PREFERENCIA EN MERCADO PAGO
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

        return { 
            checkout_url: result.init_point,
            reporteId: externalReference 
        };

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
        return null;
    } catch (err) { 
        console.error("Error Scheduler:", err);
        return null; 
    }
});