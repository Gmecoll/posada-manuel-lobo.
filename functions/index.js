// 1. IMPORTACIONES ÚNICAS
const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onObjectFinalized } = require("firebase-functions/v2/storage");
const { defineSecret } = require('firebase-functions/params');
const logger = require("firebase-functions/logger"); 
const admin = require('firebase-admin');
const axios = require('axios');
const crypto = require('crypto');

// 2. INICIALIZACIÓN ÚNICA
if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();

// 3. CONFIGURACIONES Y SECRETOS
const ADMIN_EMAIL = "gmecollg@gmail.com";
const MERCADO_PAGO_ACCESS_TOKEN = defineSecret('MERCADO_PAGO_ACCESS_TOKEN');
const CLOUDBEDS_CLIENT_ID = defineSecret("CLOUDBEDS_CLIENT_ID");
const CLOUDBEDS_CLIENT_SECRET = defineSecret("CLOUDBEDS_CLIENT_SECRET");

// ==========================================
// --- FUNCIÓN 1: INICIAR PAGO SERVICIO (MERCADO PAGO) ---
// ==========================================
exports.iniciarPagoServicio = onCall({ 
    region: "us-central1", 
    secrets: [MERCADO_PAGO_ACCESS_TOKEN] 
}, async (request) => {
    const { serviceId, quantity, userId, guestName, roomNumber, reservationDate, reservationTime, comments, externalReference } = request.data;

    try {
        if (!serviceId || !userId) throw new HttpsError('invalid-argument', 'Faltan datos.');

        const serviceDoc = await db.collection('services').doc(serviceId).get();
        if (!serviceDoc.exists) throw new HttpsError('not-found', 'El servicio no existe.');
        const serviceData = serviceDoc.data();

        const { MercadoPagoConfig, Preference } = require('mercadopago');
        const client = new MercadoPagoConfig({ accessToken: MERCADO_PAGO_ACCESS_TOKEN.value() });
        const preference = new Preference(client);

        const result = await preference.create({
            body: {
                items: [{
                    id: serviceId,
                    title: serviceData.title,
                    unit_price: Number(serviceData.price),
                    quantity: Number(quantity),
                    currency_id: 'UYU'
                }],
                metadata: { userId, guestName, roomNumber, reservationDate, reservationTime, comments },
                back_urls: {
                    success: `https://${process.env.GCLOUD_PROJECT}.web.app/payment-success`,
                    failure: `https://${process.env.GCLOUD_PROJECT}.web.app/services`
                },
                auto_return: "approved",
            }
        });

        const cleanRoomNumber = roomNumber ? String(roomNumber).replace('room-', '') : "N/A";
        const requestId = externalReference || `solicitud-${Date.now()}`;
        
        await db.collection('solicitudes_servicios').doc(requestId).set({
            cantidad: Number(quantity),
            currency: 'UYU',
            estado_pago: 'pendiente',
            external_reference: requestId,
            fecha: admin.firestore.FieldValue.serverTimestamp(),
            guestName: guestName || "Huésped",
            leido: false,
            monto: Number(serviceData.price) * Number(quantity),
            nombreServicio: serviceData.title,
            roomNumber: cleanRoomNumber,
            servicioId: serviceId,
            usuarioId: userId,
            reservationDate: reservationDate || null,
            reservationTime: reservationTime || null,
            comentarios: comments || "",
            preferenceId: result.id
        });

        try {
            const webhookUrl = "https://hook.us2.make.com/8v6qga9kx9sm3ef488yl664aw8uceeub";
            await axios.post(webhookUrl, {
                servicio: serviceData.title,
                cantidad: Number(quantity),
                huesped: guestName || "Huésped",
                habitacion: cleanRoomNumber,
                fecha_reserva: reservationDate || "Sin fecha",
                hora_reserva: reservationTime || "Sin hora",
                comentarios: comments || "Sin comentarios",
                total: Number(serviceData.price) * Number(quantity)
            });
            console.log("✅ Webhook disparado a Make.com con éxito");
        } catch (webhookError) {
            console.error("❌ Error enviando webhook a Make.com:", webhookError.message);
        }

        return { id: result.id, init_point: result.init_point };

    } catch (error) {
        console.error("ERROR EN PAGO:", error);
        return { error: error.message || "Error interno", details: error.stack };
    }
});

// ==========================================
// --- FUNCIÓN 2: MANTENIMIENTO ---
// ==========================================
exports.mantenimientoHabitaciones = onSchedule({
  schedule: "every 5 minutes",
  region: "us-central1",
  memory: "256MiB",
}, async (event) => {
  try {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0); 
    const [roomsSnap, bookingsSnap] = await Promise.all([
      db.collection("rooms").get(),
      db.collection("bookings").where("status", "in", ["Checked-In", "Bloqueada", "Confirmed"]).get(),
    ]);

    if (roomsSnap.empty) return null;

    const occupiedRooms = new Set();
    bookingsSnap.forEach((doc) => {
      const booking = doc.data();
      const fechaIn = new Date(booking.checkInDate + "T00:00:00");
      const fechaOut = new Date(booking.checkOutDate + "T00:00:00");
      if (hoy >= fechaIn && hoy < fechaOut) occupiedRooms.add(booking.roomId);
    });

    const batch = db.batch();
    let hayCambios = false;

    roomsSnap.forEach((roomDoc) => {
      const roomRef = roomDoc.ref;
      const roomData = roomDoc.data();
      const updatePayload = {};
      const newStatus = occupiedRooms.has(roomDoc.id) ? "Ocupada" : "Disponible";

      if (roomData.status !== newStatus && roomData.status !== "Limpieza") updatePayload.status = newStatus;

      const pool = roomData.codes_pool;
      if (Array.isArray(pool) && pool.length > 0) {
        const nuevoCodigo = String(pool[Math.floor(Math.random() * pool.length)]);
        if (roomData.backup_code !== nuevoCodigo) {
          updatePayload.backup_code = nuevoCodigo;
          updatePayload.last_rotation = admin.firestore.FieldValue.serverTimestamp();
        }
      }

      if (Object.keys(updatePayload).length > 0) {
        batch.update(roomRef, updatePayload);
        hayCambios = true;
      }
    });

    if (hayCambios) await batch.commit();
    return null;
  } catch (error) {
    console.error("Error mantenimiento:", error);
    return null;
  }
});

// ==========================================
// --- FUNCIÓN 3: IA CONSERJE ---
// ==========================================
exports.conserjeCall = onCall({ 
    secrets: ["GOOGLE_GENAI_API_KEY"], 
    region: "us-central1",
    cors: true,
    invoker: 'public'
}, async (request) => {
    try { 
        const aiModule = require('./conserjeflow.js'); 
        const result = await aiModule.conserjeflow(request.data);
        return { response: result };
    } catch (error) {
        throw new HttpsError('internal', error.message);
    }
});

// ==========================================
// --- FUNCIÓN 4: OBTENER TOKEN TTLOCK ---
// ==========================================
exports.obtenerTokenTTLock = onCall({ 
    region: "us-central1", 
    secrets: ["TTLOCK_CLIENT_ID", "TTLOCK_CLIENT_SECRET"] 
}, async (request) => {
    const { username, passwordRaw } = request.data || {};
    if (!username || !passwordRaw) throw new HttpsError('invalid-argument', 'Credenciales incompletas.');
    
    const md5Password = crypto.createHash('md5').update(passwordRaw).digest('hex');

    try {
        const params = new URLSearchParams({
            client_id: process.env.TTLOCK_CLIENT_ID,
            client_secret: process.env.TTLOCK_CLIENT_SECRET,
            username,
            password: md5Password,
            grant_type: 'password'
        });
        
        const response = await axios.post('https://api.ttlock.com/oauth2/token', params);
        
        if (response.data.access_token) {
            await db.collection('configuracion_sistema').doc('ttlock_auth').set({
                accessToken: response.data.access_token,
                refreshToken: response.data.refresh_token,
                uid: response.data.uid,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            return { success: true };
        }
        return { success: false, error: response.data.error_description };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// ==========================================
// --- FUNCIÓN 5: APERTURA INTELIGENTE ---
// ==========================================
exports.abrirCerraduraRemote = onCall({ 
    region: "us-central1", 
    secrets: ["TTLOCK_CLIENT_ID"]
}, async (request) => {
    const { booking_id, lockId: adminLockId } = request.data;
    const email = request.auth ? request.auth.token.email : "";

    if (email === ADMIN_EMAIL && adminLockId) {
        return await llamarTTLock(adminLockId, `Admin (${email})`, "Apertura remota Admin");
    }

    if (!booking_id) throw new HttpsError('invalid-argument', 'Falta booking_id.');

    const querySnapshot = await db.collection('bookings').where('booking_id', '==', String(booking_id)).limit(1).get();
    if (querySnapshot.empty) throw new HttpsError('permission-denied', 'Reserva no encontrada.');
    
    const bData = querySnapshot.docs[0].data();
    const roomId = bData.roomId || bData.room_number || bData.roomNumber;
    const roomSnap = await db.collection('rooms').doc(`room-${String(roomId).replace(/^(room-)/, '')}`).get();
    const lockIdReal = roomSnap.exists ? (roomSnap.data().lockId || roomSnap.data().lock_id) : null;

    if (!lockIdReal) throw new HttpsError('internal', 'Cerradura no vinculada.');
    return await llamarTTLock(lockIdReal, bData.guest_name, `Apertura por huésped Hab ${roomId}`);
});

// HELPER TTLOCK
async function llamarTTLock(lockId, userIdentifier, logDescription) {
    const authDoc = await db.collection('configuracion_sistema').doc('ttlock_auth').get();
    const token = authDoc.data()?.accessToken;
    
    const response = await axios.post('https://api.ttlock.com/v3/lock/unlock', null, {
        params: {
            clientId: process.env.TTLOCK_CLIENT_ID,
            accessToken: token,
            lockId: lockId,
            date: Date.now()
        }
    });

    if (response.data.errcode === 0) {
        await db.collection('activity_logs').add({
            description: logDescription,
            user: userIdentifier,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            type: 'access'
        });
        return { success: true };
    }
    return { success: false, error: response.data.errmsg };
}

// ==========================================
// --- FUNCIÓN 6: LISTAR CERRADURAS ---
// ==========================================
exports.listarCerradurasTTLock = onCall({ 
    region: "us-central1", 
    secrets: ["TTLOCK_CLIENT_ID", "TTLOCK_CLIENT_SECRET"]
}, async (request) => {
    try {
        const authRef = db.collection('configuracion_sistema').doc('ttlock_auth');
        const authDoc = await authRef.get();
        let { accessToken, refreshToken } = authDoc.data();

        let response = await axios.get('https://api.ttlock.com/v3/lock/list', {
            params: { clientId: process.env.TTLOCK_CLIENT_ID, accessToken, pageNo: 1, pageSize: 100, date: Date.now() }
        });

        if (response.data.errcode === 10003) { 
            const params = new URLSearchParams({
                client_id: process.env.TTLOCK_CLIENT_ID,
                client_secret: process.env.TTLOCK_CLIENT_SECRET,
                refresh_token: refreshToken,
                grant_type: 'refresh_token'
            });
            const refreshRes = await axios.post('https://api.ttlock.com/oauth2/token', params);
            if (refreshRes.data.access_token) {
                accessToken = refreshRes.data.access_token;
                await authRef.update({ accessToken, refreshToken: refreshRes.data.refresh_token, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
                response = await axios.get('https://api.ttlock.com/v3/lock/list', {
                    params: { clientId: process.env.TTLOCK_CLIENT_ID, accessToken, pageNo: 1, pageSize: 100, date: Date.now() }
                });
            }
        }
        return { success: true, list: response.data.list || [] };
    } catch (error) {
        throw new HttpsError('internal', error.message);
    }
});

// ==========================================
// --- FUNCIÓN 7: VALIDACIÓN OCR ---
// ==========================================
exports.validarDocumentoHuesped = onObjectFinalized({
    region: "us-central1"
}, async (event) => {
    const filePath = event.data.name; 
    if (!filePath.toLowerCase().endsWith('doc_frontal.jpg')) return null;

    const bookingId = filePath.split('/')[1]; 
    try {
        const vision = require('@google-cloud/vision');
        const visionClient = new vision.ImageAnnotatorClient();
        const [result] = await visionClient.textDetection(`gs://${event.data.bucket}/${filePath}`);
        const fullText = result.textAnnotations.length > 0 ? result.textAnnotations[0].description.toLowerCase() : '';
        const keywords = ['dni', 'pasaporte', 'passport', 'identidad', 'nombre', 'apellido'];
        const matches = keywords.filter(word => fullText.includes(word));

        const updateData = matches.length >= 2 
            ? { document_status: 'approved', access_enabled: true, ocr_text: fullText.substring(0, 500) }
            : { document_status: 'not_uploaded', ocr_text: "Rechazo automático: No se detecta documento." };

        await db.collection('bookings').doc(bookingId).update({
            ...updateData,
            document_validated_at: admin.firestore.FieldValue.serverTimestamp()
        });
    } catch (e) { console.error("OCR Error:", e); }
    return null;
    
});

// ==========================================
// --- FUNCIÓN 8: Cloudbeds ---
// ==========================================

exports.testSincronizarCloudbeds = onRequest({
    region: "us-central1"
}, async (req, res) => {
    try {
        const cbAuthDoc = await db.collection("integrations").doc("cloudbeds").get();
        const accessToken = cbAuthDoc.data().access_token.trim();

        const response = await axios.get("https://hotels.cloudbeds.com/api/v1.2/getRooms", {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });

        const dataRecibida = response.data.data;
        const batch = db.batch();
        let count = 0;

        // 1. Recorremos el array de propiedades (que en tu caso tiene la propiedad 320242)
        dataRecibida.forEach((propiedad) => {
            // 2. Entramos al array de 'rooms' de esa propiedad
            if (propiedad.rooms && Array.isArray(propiedad.rooms)) {
                propiedad.rooms.forEach((room) => {
                    
                    const roomId = `room-${room.roomID}`;
                    const roomRef = db.collection("rooms").doc(roomId);
                    
                    // Buscamos el ID de Doorlock si existe
                    const lockField = room.customFields?.find(f => 
                        f.customFieldName.toLowerCase().includes('doorlock')
                    );

                    batch.set(roomRef, {
                        room_id_cloudbeds: room.roomID,
                        name: room.roomName || `Hab-${room.roomID}`,
                        type_name: room.roomTypeName || "Sin Tipo",
                        room_type_id: room.roomTypeID,
                        // Si llenaste el ID de TTLock en Cloudbeds, aquí se guarda
                        lockId: lockField ? lockField.customFieldValue : null,
                        last_sync: admin.firestore.FieldValue.serverTimestamp()
                    }, { merge: true });
                    
                    count++;
                });
            }
        });

        if (count > 0) {
            await batch.commit();
            return res.status(200).send(`
                <div style="font-family: sans-serif; text-align: center; padding: 50px;">
                    <h1 style="color: #4CAF50;">¡Sincronización Exitosa!</h1>
                    <p style="font-size: 1.2em;">Se han guardado <b>${count}</b> habitaciones reales en Firestore.</p>
                    <p>Ya puedes ver <b>es(1), es(2), do(1)...</b> en tu colección 'rooms'.</p>
                </div>
            `);
        } else {
            return res.status(200).json({ mensaje: "No se encontraron habitaciones en la estructura.", data: dataRecibida });
        }

    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
});

// ==========================================
// --- FUNCIÓN 9: SINCRONIZAR RACK DE RESERVAS (30 DÍAS) ---
// ==========================================
// ==========================================
// --- FUNCIÓN 9: TEST RACK (Acceso por Link) ---
// ==========================================
exports.testsincronizarReservasRack = onRequest({
    region: "us-central1"
}, async (req, res) => {
    try {
        const cbAuthDoc = await db.collection("integrations").doc("cloudbeds").get();
        const accessToken = cbAuthDoc.data().access_token.trim();

        const hoy = new Date().toISOString().split('T')[0];

        const response = await axios.get("https://hotels.cloudbeds.com/api/v1.2/getReservations", {
            params: { checkOutFrom: hoy },
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });

        const reservas = response.data.data;
        const batch = db.batch();
        let count = 0;

        reservas.forEach((reserva) => {
            const bookingId = `booking-${reserva.reservationID}`;
            const bookingRef = db.collection("bookings").doc(bookingId);

            // PULIDO 1: Captura de nombre más flexible
            const nombreCompleto = reserva.guestName || 
                                   `${reserva.guestFirstName || ''} ${reserva.guestLastName || ''}`.trim() || 
                                   "Huésped sin nombre";

            batch.set(bookingRef, {
                booking_id_cloudbeds: reserva.reservationID,
                guest_name: nombreCompleto,
                check_in: reserva.startDate,
                check_out: reserva.endDate,
                status: reserva.status,
                // PULIDO 2: Asegurar la vinculación con la habitación física
                room_id_cloudbeds: reserva.roomID || null,
                room_name: reserva.roomName || "No asignada",
                last_sync: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            count++;
        });

        await batch.commit();
        return res.status(200).send(`¡Rack Pulido! Se actualizaron ${count} reservas con nombres corregidos.`);

    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
});