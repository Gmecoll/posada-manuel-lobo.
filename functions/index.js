// ==========================================
// 1. IMPORTACIONES ÚNICAS
// ==========================================
const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onObjectFinalized } = require("firebase-functions/v2/storage");
const { defineSecret } = require('firebase-functions/params');
const logger = require("firebase-functions/logger"); 
const admin = require('firebase-admin');
const axios = require('axios');
const crypto = require('crypto');
const sharp = require('sharp');
const { ImageAnnotatorClient } = require('@google-cloud/vision');
const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require("@google/generative-ai");

// ==========================================
// 2. INICIALIZACIÓN ÚNICA
// ==========================================
if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();

// ==========================================
// 3. CONFIGURACIONES Y SECRETOS GLOBALES
// ==========================================
const ADMIN_EMAIL = "gmecollg@gmail.com";
const CLOUDBEDS_CLIENT_ID = defineSecret("CLOUDBEDS_CLIENT_ID");
const CLOUDBEDS_CLIENT_SECRET = defineSecret("CLOUDBEDS_CLIENT_SECRET");
const TTLOCK_CLIENT_ID = defineSecret("TTLOCK_CLIENT_ID");
const TTLOCK_CLIENT_SECRET = defineSecret("TTLOCK_CLIENT_SECRET");
const REPLICATE_API_TOKEN = defineSecret("REPLICATE_API_TOKEN");
const GOOGLE_GENAI_API_KEY = defineSecret("GOOGLE_GENAI_API_KEY");

const LATE_CHECKOUT_FEE = 50; // Precio base ajustable para Late Checkout

// 🚀 PRECIOS OFICIALES PARA UPGRADES (Inhackeable, el servidor usa esta tabla)
const JERARQUIA_HABITACIONES = [
    { id: "es", name: "Estándar", extra: 0 },                  // Base
    { id: "do", name: "Doble Superior", extra: 50 },           // Diferencia $50/noche
    { id: "dk", name: "Deluxe King", extra: 100 },             // Diferencia $100/noche
    { id: "sh", name: "Suites con Hidromasaje", extra: 150 }   // Diferencia $150/noche
];

// ==========================================
// --- HELPERS INTERNOS ---
// ==========================================

async function intentarCheckInFinal(bookingId) {
    const bookingRef = db.collection("bookings").doc(bookingId);
    const docSnap = await bookingRef.get();
    
    if (!docSnap.exists) return;
    const data = docSnap.data();

    // 1. Verificamos las dos llaves maestras
    const documentoAprobado = data.document_status === 'approved_active';
    const saldoCero = parseFloat(data.balance || 0) <= 0;

    console.log(`[CHECK-IN] Revisando Reserva ${bookingId}: Documento=${documentoAprobado}, Saldo=${saldoCero}`);

    if (documentoAprobado && saldoCero) {
        try {
            await bookingRef.update({
                status: 'Checked-In', 
                checkin_automatico_pms: true, 
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            console.log(`✅ [FIREBASE] Reserva ${bookingId} lista para ingreso físico (Estado interno: Checked-In)`);
        } catch (error) {
            console.error(`❌ [FIREBASE] Error al actualizar Check-in Digital interno:`, error.message);
        }
    }
}

async function registrarPagoEnCloudbeds(reservationId, amount, description) {
    try {
        console.log(`[CLOUDBEDS] Intentando registrar pago de ${amount} para reserva ${reservationId}...`);
        
        const cbAuthRef = await db.collection('integrations').doc('cloudbeds').get();
        const cbAuthData = cbAuthRef.data();
        
        if (!cbAuthData || !cbAuthData.access_token) {
            console.error("[CLOUDBEDS] No se encontró el Access Token de Cloudbeds en integrations/cloudbeds.");
            return false;
        }

        const payload = new URLSearchParams({
            reservationID: reservationId, 
            type: 'credit', 
            amount: amount.toString(),
            description: description || 'Pago procesado automáticamente vía SkyRooms (Plexo)'
        });

        const response = await axios.post('https://api.cloudbeds.com/api/v1.2/postPayment', payload.toString(), {
            headers: {
                'Authorization': `Bearer ${cbAuthData.access_token.trim()}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        if (response.data.success) {
            console.log(`[CLOUDBEDS] Pago registrado exitosamente:`, response.data);
            return true;
        } else {
            console.error(`[CLOUDBEDS] Error de Cloudbeds al registrar pago:`, response.data);
            return false;
        }
    } catch (error) {
        console.error(`[CLOUDBEDS] Fallo HTTP a Cloudbeds:`, error.response ? error.response.data : error.message);
        return false;
    }
}

async function llamarTTLock(lockId, userIdentifier, logDescription) {
    const authRef = db.collection('configuracion_sistema').doc('ttlock_auth');
    const authDoc = await authRef.get();
    let { accessToken, refreshToken } = authDoc.data() || {};
    
    if (!accessToken) return { success: false, error: "No hay token de TTLock configurado." };

    let response = await axios.post('https://api.ttlock.com/v3/lock/unlock', null, {
        params: {
            clientId: process.env.TTLOCK_CLIENT_ID,
            accessToken: accessToken,
            lockId: lockId,
            date: Date.now()
        }
    });

    if (response.data.errcode === 10003 && refreshToken) {
        console.log("Token de TTLock vencido. Intentando renovación automática...");
        try {
            const refreshParams = new URLSearchParams({
                client_id: process.env.TTLOCK_CLIENT_ID,
                client_secret: process.env.TTLOCK_CLIENT_SECRET,
                refresh_token: refreshToken,
                grant_type: 'refresh_token'
            });
            const refreshRes = await axios.post('https://api.ttlock.com/oauth2/token', refreshParams);
            
            if (refreshRes.data.access_token) {
                accessToken = refreshRes.data.access_token;
                await authRef.update({ 
                    accessToken, 
                    refreshToken: refreshRes.data.refresh_token, 
                    updatedAt: admin.firestore.FieldValue.serverTimestamp() 
                });
                
                response = await axios.post('https://api.ttlock.com/v3/lock/unlock', null, {
                    params: {
                        clientId: process.env.TTLOCK_CLIENT_ID,
                        accessToken: accessToken,
                        lockId: lockId,
                        date: Date.now()
                    }
                });
            }
        } catch (refreshError) {
            console.error("Error al intentar renovar el token de TTLock:", refreshError.message);
        }
    }

    if (response.data.errcode === 0) {
        await db.collection('activity_logs').add({
            description: logDescription,
            user: userIdentifier,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            type: 'access'
        });
        return { success: true };
    }
    return { success: false, error: response.data.errmsg || "Error desconocido de la cerradura" };
}

async function procesarSincronizacionTarifas() {
    const cbAuthDoc = await db.collection("integrations").doc("cloudbeds").get();
    if (!cbAuthDoc.exists) throw new Error("No hay credenciales.");
    
    const accessToken = cbAuthDoc.data().access_token.replace(/["'\s\n\r]/g, "");

    const hoy = new Date().toISOString().split('T')[0];
    const manana = new Date(Date.now() + 86400000).toISOString().split('T')[0];

    const response = await axios.get("https://api.cloudbeds.com/api/v1.2/getRatePlans", {
        params: { startDate: hoy, endDate: manana },
        headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    const dataCloudbeds = response.data.data || response.data;
    const tarifasPorTipo = {};
    
    const normalizar = (str) => {
        if (!str) return "";
        return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    };
    
    const buscarTarifas = (obj) => {
        if (Array.isArray(obj)) {
            obj.forEach(buscarTarifas);
        } else if (typeof obj === 'object' && obj !== null) {
            const nombre = obj.roomTypeName || obj.roomType || obj.roomName;
            const precio = obj.roomRate || obj.rate || obj.baseRate;
            if (nombre && precio && typeof nombre === 'string') {
                tarifasPorTipo[normalizar(nombre)] = parseFloat(precio);
            }
            Object.values(obj).forEach(buscarTarifas);
        }
    };
    buscarTarifas(dataCloudbeds);

    if (Object.keys(tarifasPorTipo).length === 0) return { success: false };

    const roomsSnap = await db.collection("rooms").get();
    const batch = db.batch();
    let count = 0;

    roomsSnap.forEach(doc => {
        const roomData = doc.data();
        const tipoNombre = normalizar(roomData.type_name);
        
        if (tarifasPorTipo[tipoNombre]) {
            batch.update(doc.ref, { 
                current_rate: tarifasPorTipo[tipoNombre],
                ultima_sincronizacion_tarifa: admin.firestore.FieldValue.serverTimestamp()
            });
            count++;
        }
    });

    await batch.commit();
    return { success: true, actualizadas: count, tarifas: tarifasPorTipo };
}


// ==========================================
// --- FUNCIÓN 1: MANTENIMIENTO ---
// ==========================================
exports.mantenimientoHabitaciones = onSchedule({
  schedule: "every 60 minutes",
  region: "us-central1",
  memory: "256MiB",
}, async (event) => {
  try {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0); 
    const [roomsSnap, bookingsSnap] = await Promise.all([
      db.collection("rooms").get(),
      db.collection("bookings").where("status", "in", ["Checked-In", "Bloqueada", "checked_in"]).get(),
    ]);

    if (roomsSnap.empty) return null;

    const roomsByCloudbedsId = new Map();
    roomsSnap.forEach(doc => {
      const roomData = doc.data();
      if (roomData.room_id_cloudbeds) {
        roomsByCloudbedsId.set(String(roomData.room_id_cloudbeds), doc.id);
      }
    });

    const occupiedRoomIds = new Set();
    const bookingForRoom = new Map(); 

    bookingsSnap.forEach((doc) => {
      const booking = doc.data();
      const fechaIn = new Date(booking.check_in + "T00:00:00");
      const fechaOut = new Date(booking.check_out + "T00:00:00");

      if (hoy >= fechaIn && hoy < fechaOut) {
        if (booking.rooms && Array.isArray(booking.rooms)) {
          booking.rooms.forEach(roomInfo => {
            if (roomInfo.room_id_cloudbeds) {
              const firestoreRoomId = roomsByCloudbedsId.get(String(roomInfo.room_id_cloudbeds));
              if (firestoreRoomId) {
                occupiedRoomIds.add(firestoreRoomId);
                if (!bookingForRoom.has(firestoreRoomId)) {
                   bookingForRoom.set(firestoreRoomId, booking);
                }
              }
            }
          });
        } else if (booking.room_id_cloudbeds) {
          const firestoreRoomId = roomsByCloudbedsId.get(String(booking.room_id_cloudbeds));
          if (firestoreRoomId) {
            occupiedRoomIds.add(firestoreRoomId);
            bookingForRoom.set(firestoreRoomId, booking);
          }
        }
      }
    });

    const batch = db.batch();
    let hayCambios = false;

    roomsSnap.forEach((roomDoc) => {
      const roomRef = roomDoc.ref;
      const roomData = roomDoc.data();
      const updatePayload = {};
      
      const isOccupied = occupiedRoomIds.has(roomDoc.id);
      const newStatus = isOccupied ? "Ocupada" : "Disponible";

      if (roomData.status !== newStatus && roomData.status !== "Limpieza") {
        updatePayload.status = newStatus;

        let description;
        const booking = bookingForRoom.get(roomDoc.id);

        if (newStatus === 'Ocupada') {
          description = `Habitación ${roomData.name || roomDoc.id} ocupada por ${booking?.guest_name || 'Huésped'}.`;
        } else {
          description = `Habitación ${roomData.name || roomDoc.id} ha quedado disponible.`;
        }
        
        const logRef = db.collection('activity_logs').doc();
        batch.set(logRef, {
          description: description,
          user: booking?.guest_name || 'Sistema',
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          type: 'maintenance'
        });
      }

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

    if (hayCambios) {
      await batch.commit();
    }
    return null;
  } catch (error) {
    console.error("Error en función de mantenimiento:", error);
    return null;
  }
});

// ==========================================
// --- FUNCIÓN 2: IA CONSERJE ---
// ==========================================
exports.conserjeCall = onCall({ 
    secrets: ["GOOGLE_GENAI_API_KEY"], 
    region: "us-central1",
    cors: true
}, async (request) => {
    try { 
        const aiModule = require('./conserjeflow.js'); 
        const result = await aiModule.conserjeflow(request.data);
        return { response: result };
    } catch (error) {
        console.error("Error en conserje:", error);
        throw new HttpsError('internal', error.message);
    }
});

// ==========================================
// --- FUNCIÓN 3: OBTENER TOKEN TTLOCK ---
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
// --- FUNCIÓN 4: APERTURA INTELIGENTE CON RENOVACIÓN AUTO ---
// ==========================================
exports.abrirCerraduraRemote = onCall({ 
    region: "us-central1", 
    secrets: ["TTLOCK_CLIENT_ID", "TTLOCK_CLIENT_SECRET"]
}, async (request) => {
    const { booking_id, lockId: adminLockId } = request.data;
    const email = request.auth ? request.auth.token.email : "";

    if (email === ADMIN_EMAIL && adminLockId) {
        return await llamarTTLock(adminLockId, `Admin (${email})`, "Apertura remota Admin");
    }

    if (!booking_id) throw new HttpsError('invalid-argument', 'Falta booking_id.');

    const bookingRef = db.collection('bookings').doc(String(booking_id).trim());
    const docSnap = await bookingRef.get();

    if (!docSnap.exists) {
        console.error("No se encontró el documento:", booking_id);
        throw new HttpsError('not-found', 'Reserva no encontrada en la base de datos.');
    }
    
    const bData = docSnap.data();

    // 🛡️ REGLAS DE SEGURIDAD (Saldo y Documento)
    if (parseFloat(bData.balance || 0) > 0) {
        throw new HttpsError('permission-denied', 'Saldo pendiente. Por favor regularice el pago.');
    }
    if (bData.document_status !== 'approved_active') {
        throw new HttpsError('permission-denied', 'Debe completar la validación de identidad para abrir.');
    }

    let lockIdReal = bData.lockId || bData.lock_id;

    if (!lockIdReal) {
        const roomId = bData.room_id_cloudbeds || bData.roomId || bData.room_number || bData.roomNumber;
        if (roomId) {
            const roomSnap = await db.collection('rooms').doc(`room-${String(roomId).replace(/^(room-)/, '')}`).get();
            lockIdReal = roomSnap.exists ? (roomSnap.data().lockId || roomSnap.data().lock_id) : null;
        }
    }

    if (!lockIdReal) {
        throw new HttpsError('internal', 'Cerradura no vinculada a esta reserva.');
    }

    // 🚀 Lógica de Apertura
    const resultadoApertura = await llamarTTLock(lockIdReal, bData.guest_name || "Huésped", `Apertura por huésped Hab ${bData.room_name || 'S/D'}`);

    if (resultadoApertura.success) {
        // SI ABRE POR PRIMERA VEZ (Cambio a Hospedado en PMS)
        if (bData.status === 'Checked-In' || bData.status === 'Confirmed' || bData.status === 'confirmed') {
            try {
                const cbAuth = await db.collection("integrations").doc("cloudbeds").get();
                const token = cbAuth.data().access_token.trim();
                
                // 🛑 CORRECCIÓN CRÍTICA: Debe ser obligatoriamente el ID de la reserva padre
                const cbIdPadre = bData.booking_id_cloudbeds;

                // Marcamos Hospedado (checked_in) en Cloudbeds
                const cbResponse = await axios.put(`https://api.cloudbeds.com/api/v1.2/putReservation`, 
                    new URLSearchParams({ 
                        reservationID: cbIdPadre,
                        status: 'checked_in'
                    }).toString(), 
                    { headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/x-www-form-urlencoded' } }
                );

                console.log(`[CLOUDBEDS PUT RESPONSE]:`, cbResponse.data);

                if (cbResponse.data && cbResponse.data.success) {
                    await bookingRef.update({
                        status: 'checked_in', 
                        primer_ingreso_at: admin.firestore.FieldValue.serverTimestamp(),
                        last_sync: admin.firestore.FieldValue.serverTimestamp()
                    });
                    console.log(`🏠 [PMS] Reserva ${cbIdPadre} cambió a HOSPEDADO (checked_in) tras apertura exitosa.`);
                } else {
                    console.error(`⚠️ Cloudbeds rechazó el cambio de estado:`, cbResponse.data);
                }
            } catch (e) {
                console.error("Fallo HTTP al marcar Hospedado en PMS:", e.response ? e.response.data : e.message);
            }
        }
    }

    return resultadoApertura;
});

// ==========================================
// --- FUNCIÓN 5: VERIFICAR ESTADO EN TIEMPO REAL DE CERRADURA ---
// ==========================================
exports.verificarEstadoCerradura = onCall({ 
    region: "us-central1", 
    secrets: ["TTLOCK_CLIENT_ID", "TTLOCK_CLIENT_SECRET"] 
}, async (request) => {
    const { lockId, roomId } = request.data;
    
    if (!lockId) return { success: false, is_online: false, error: "Falta lockId" };

    const authRef = db.collection('configuracion_sistema').doc('ttlock_auth');
    const authDoc = await authRef.get();
    let { accessToken, refreshToken } = authDoc.data() || {};

    if (!accessToken) return { success: false, is_online: false, error: "No hay token" };

    try {
        const makeRequest = (token) => axios.get('https://api.ttlock.com/v3/lock/queryElectricQuantity', {
            params: {
                clientId: process.env.TTLOCK_CLIENT_ID,
                accessToken: token,
                lockId: lockId,
                date: Date.now()
            }
        });

        let response = await makeRequest(accessToken);

        if (response.data.errcode === 10003 && refreshToken) {
            try {
                const refreshParams = new URLSearchParams({
                    client_id: process.env.TTLOCK_CLIENT_ID,
                    client_secret: process.env.TTLOCK_CLIENT_SECRET,
                    refresh_token: refreshToken,
                    grant_type: 'refresh_token'
                });
                const refreshRes = await axios.post('https://api.ttlock.com/oauth2/token', refreshParams);
                
                if (refreshRes.data.access_token) {
                    accessToken = refreshRes.data.access_token;
                    await authRef.update({ 
                        accessToken, 
                        refreshToken: refreshRes.data.refresh_token, 
                        updatedAt: admin.firestore.FieldValue.serverTimestamp() 
                    });
                    response = await makeRequest(accessToken);
                }
            } catch (refreshErr) {
                console.error("Fallo al renovar token:", refreshErr.message);
            }
        }

        let isOnline = false;
        let motivoFallo = null;
        
        if (response.data.electricQuantity !== undefined || response.data.errcode === 0) {
           isOnline = true; 
        } else {
           isOnline = false;
           motivoFallo = response.data.errmsg || `Código de error: ${response.data.errcode}`;
        }

        const resultPayload = { 
            success: true, 
            is_online: isOnline, 
            debug_error: motivoFallo,
            raw_ttlock_response: response.data 
        };

        if (roomId) {
            const cleanRoomId = String(roomId).replace(/^(room-)/, '');
            const updateData = {
                is_online: isOnline,
                last_checked: admin.firestore.FieldValue.serverTimestamp()
            };
            if (isOnline && response.data.electricQuantity !== undefined) {
                updateData.battery = response.data.electricQuantity;
            }
            await db.collection('rooms').doc(`room-${cleanRoomId}`).update(updateData);
        }

        return resultPayload;

    } catch (error) {
        return { success: true, is_online: false, debug_error: error.message };
    }
});

// ==========================================
// --- FUNCIÓN 6: VALIDACIÓN OCR + ROTACIÓN INTELIGENTE IA ---
// ==========================================
exports.validarDocumentoHuesped = onObjectFinalized({
    bucket: "studio-4343626376-fea63.firebasestorage.app", 
    region: "us-central1",
    memory: "512MiB",
    secrets: [REPLICATE_API_TOKEN]
}, async (event) => {
    const filePath = event.data.name;

    if (event.data.metadata && event.data.metadata.ocr_processed) return null;
    if (!filePath.toLowerCase().includes('doc_') || filePath.toLowerCase().includes('avatar_')) return null;

    let folderId = filePath.split('/')[1]; 
    const finalBookingId = folderId.startsWith('booking-') ? folderId : `booking-${folderId}`;
    const cleanId = finalBookingId.replace('booking-', '');

    const fileName = filePath.split('/').pop();
    const fileNameParts = fileName.split('_');
    const guestIndex = fileNameParts.length > 1 ? parseInt(fileNameParts[1]) : 1;

    const markAsInvalid = async (reason) => {
        console.log(`Documento rechazado (Reserva ${finalBookingId}, Huésped ${guestIndex}): ${reason}`);
        const bookingRef = db.collection('bookings').doc(finalBookingId);
        
        await db.runTransaction(async (transaction) => {
            const docSnap = await transaction.get(bookingRef);
            if (!docSnap.exists) return;
            
            const bData = docSnap.data();
            let guestsVerification = bData.guests_verification || {};
            
            if (!guestsVerification[guestIndex]) {
                guestsVerification[guestIndex] = {
                    front_uploaded: false, back_uploaded: false, front_text: "", first_name: "", last_name: "", name: "Pendiente", status: "pending", avatar_url: "", front_image_url: "", back_image_url: "", passport_url: ""
                };
            }
            
            guestsVerification[guestIndex].status = "unmatch";
            guestsVerification[guestIndex].front_uploaded = false; 
            
            let overallStatus = bData.document_status || "pending";
            if (!overallStatus.includes("approved")) {
                overallStatus = `unmatch ${guestIndex}`;
            }

            transaction.update(bookingRef, {
                guests_verification: guestsVerification,
                document_status: overallStatus,
                document_validated_at: admin.firestore.FieldValue.serverTimestamp() 
            });
        });
        return null;
    };

    try {
        const bucket = admin.storage().bucket(event.data.bucket);
        const file = bucket.file(filePath);
        const visionClient = new ImageAnnotatorClient();
        
        const [originalBuffer] = await file.download();
        const buffer = await sharp(originalBuffer).rotate().toBuffer(); 

        const [result] = await visionClient.annotateImage({
            image: { content: buffer },
            features: [ { type: 'TEXT_DETECTION' }, { type: 'FACE_DETECTION' } ]
        });
        
        if (!result.textAnnotations || result.textAnnotations.length === 0) {
            return await markAsInvalid("No se detectó ningún texto en la imagen.");
        }

        const fullText = result.textAnnotations[0].description;
        const upperText = fullText.toUpperCase();
        
        let isBack = false;
        let isFront = false;
        let isPassport = false;
        
        let extractedFirstName = "";
        let extractedLastName = "";
        let formattedName = "";

        const unifiedText = fullText.toUpperCase().replace(/[\s\n\r]+/g, '<');
        const hasMRZ = unifiedText.includes('<<');

        if (hasMRZ) {
            isBack = true;
            const passportMatch = unifiedText.match(/P<[A-Z]{3}<([A-Z<]+)<<([A-Z<]+)/);
            if (passportMatch) {
                isPassport = true;
                extractedLastName = passportMatch[1].replace(/<+/g, ' ').trim().split(' ')[0];
                extractedFirstName = passportMatch[2].replace(/<+/g, ' ').trim().split(' ')[0];
            } else {
                const nameLineMatch = unifiedText.match(/([A-Z]+<+[A-Z<]+<<[A-Z<]+)/);

                if (nameLineMatch && nameLineMatch[0]) {
                    const parts = nameLineMatch[0].split('<<');
                    if (parts.length >= 2) {
                        extractedLastName = parts[0].replace(/<+/g, ' ').trim().split(' ')[0];
                        extractedFirstName = parts[1].replace(/<+/g, ' ').trim().split(' ')[0];
                    }
                } else {
                    const nameMatch = unifiedText.match(/<<([A-Z]+)[<A-Z]*/);
                    if (nameMatch && nameMatch[1]) {
                        extractedFirstName = nameMatch[1].replace(/<+/g, ' ').trim().split(' ')[0];
                    }

                    const specificLastNameMatch = unifiedText.match(/([A-Z]+(?:<+[A-Z]+)*)<<[A-Z]+/);
                    if (specificLastNameMatch && specificLastNameMatch[1]) {
                        extractedLastName = specificLastNameMatch[1].replace(/<+/g, ' ').trim().split(' ')[0];
                    }
                }
            }
        } else {
            const frontKeywords = ['REPUBLICA', 'IDENTIDAD', 'CEDULA', 'CARTEIRA', 'DNI', 'MERCOSUR', 'DOCUMENTO', 'REGISTRO', 'ORIENTAL', 'ARGENTINA', 'BRASIL'];
            if (frontKeywords.some(kw => upperText.includes(kw))) {
                isFront = true;
            } else {
                return await markAsInvalid("La imagen contiene texto, pero no coincide con un documento de identidad válido."); 
            }
        }

        const capitalize = (s) => {
            if (!s) return "";
            return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
        };

        if (extractedFirstName || extractedLastName) {
            formattedName = `${capitalize(extractedFirstName)} ${capitalize(extractedLastName)}`.trim();
        }

        let imageRotationAngle = 0;
        const metadata = await sharp(buffer).metadata();
        if ((isFront || isPassport) && result.faceAnnotations && result.faceAnnotations.length > 0) {
            const roll = result.faceAnnotations[0].rollAngle;
            if (roll > 45 && roll <= 135) imageRotationAngle = -90;
            else if (roll < -45 && roll >= -135) imageRotationAngle = 90;
            else if (roll > 135 || roll < -135) imageRotationAngle = 180;
        }
        
        let document_image_url = "";
        let finalDocBuffer = buffer;
        const docBoundary = result.textAnnotations?.[0]?.boundingPoly;
        let needsSave = false;

        if (docBoundary) {
            const xs = docBoundary.vertices.map(v => v.x || 0);
            const ys = docBoundary.vertices.map(v => v.y || 0);
            const xMin = Math.max(0, Math.min(...xs));
            const yMin = Math.max(0, Math.min(...ys));
            const xMax = Math.min(metadata.width, Math.max(...xs));
            const yMax = Math.min(metadata.height, Math.max(...ys));
            
            const w = xMax - xMin;
            const h = yMax - yMin;
            const padX = Math.floor(w * 0.1);
            const padY = Math.floor(h * 0.1);

            const cropX = Math.max(0, xMin - padX);
            const cropY = Math.max(0, yMin - padY);
            const cropW = Math.min(metadata.width - cropX, w + padX * 2);
            const cropH = Math.min(metadata.height - cropY, h + padY * 2);

            if (cropW > 50 && cropH > 50) {
              finalDocBuffer = await sharp(finalDocBuffer).extract({ left: cropX, top: cropY, width: cropW, height: cropH }).toBuffer();
              needsSave = true;
            }
        }

        if (imageRotationAngle !== 0) {
            finalDocBuffer = await sharp(finalDocBuffer).rotate(imageRotationAngle).toBuffer();
            needsSave = true;
        }

        if (needsSave) {
            try {
                const finalProcessedBuffer = await sharp(finalDocBuffer).jpeg({ quality: 90 }).toBuffer();
                const newToken = crypto.randomUUID();
                
                await file.save(finalProcessedBuffer, {
                    metadata: { contentType: 'image/jpeg', metadata: { firebaseStorageDownloadTokens: newToken, ocr_processed: 'true' } }
                });
                document_image_url = `https://firebasestorage.googleapis.com/v0/b/${event.data.bucket}/o/${encodeURIComponent(filePath)}?alt=media&token=${newToken}`;
            } catch (procErr) {
                console.error("Error al guardar:", procErr);
                const [originalMetadata] = await file.getMetadata();
                let token = originalMetadata.metadata?.firebaseStorageDownloadTokens || crypto.randomUUID();
                document_image_url = `https://firebasestorage.googleapis.com/v0/b/${event.data.bucket}/o/${encodeURIComponent(filePath)}?alt=media&token=${token.split(',')[0]}`;
            }
        } else {
             const [originalMetadata] = await file.getMetadata();
             let token = originalMetadata.metadata?.firebaseStorageDownloadTokens || crypto.randomUUID();
             document_image_url = `https://firebasestorage.googleapis.com/v0/b/${event.data.bucket}/o/${encodeURIComponent(filePath)}?alt=media&token=${token.split(',')[0]}`;
             await file.setMetadata({ metadata: { ...(originalMetadata.metadata || {}), ocr_processed: 'true' }});
        }

        let avatarUrl = "";
        if ((isFront || isPassport) && result.faceAnnotations && result.faceAnnotations.length > 0) {
            try {
                const face = result.faceAnnotations[0];
                const vertices = face.fdBoundingPoly ? face.fdBoundingPoly.vertices : face.boundingPoly.vertices;
                const xs = vertices.map(v => v.x || 0);
                const ys = vertices.map(v => v.y || 0);
                const xMin = Math.min(...xs);
                const xMax = Math.max(...xs);
                const yMin = Math.min(...ys);
                const yMax = Math.max(...ys);

                const width = xMax - xMin;
                const height = yMax - yMin;
                const centerX = xMin + width / 2;
                const centerY = yMin + height / 2;
                const size = Math.max(width, height) * 1.5; 
                
                const cropLeft = Math.floor(Math.max(0, centerX - size / 2));
                const cropTop = Math.floor(Math.max(0, centerY - size / 2));
                const cropWidth = Math.floor(Math.min(size, metadata.width - cropLeft));
                const cropHeight = Math.floor(Math.min(size, metadata.height - cropTop));

                const croppedBuffer = await sharp(buffer)
                    .extract({ left: cropLeft, top: cropTop, width: cropWidth, height: cropHeight })
                    .rotate(imageRotationAngle) 
                    .jpeg({ quality: 95 })
                    .toBuffer();

                let avatarBufferToSave = croppedBuffer;

                try {
                    const token = REPLICATE_API_TOKEN.value();
                    if (token) {
                        const base64Image = `data:image/jpeg;base64,${croppedBuffer.toString('base64')}`;
                        const replicateResponse = await axios.post('https://api.replicate.com/v1/predictions', {
                            version: "7de2ea26c616d5bf2245ad0d5e24f0ff9a6204578a5c876db53142edd9d2cd56", 
                            input: { image: base64Image, upscale: 2, face_upsample: true, codeformer_fidelity: 0.9 }
                        }, { headers: { 'Authorization': `Token ${token}`, 'Content-Type': 'application/json' } });

                        let prediction = replicateResponse.data;
                        while (prediction.status !== 'succeeded' && prediction.status !== 'failed') {
                            await new Promise(r => setTimeout(r, 800));
                            const pollResponse = await axios.get(prediction.urls.get, { headers: { 'Authorization': `Token ${token}` } });
                            prediction = pollResponse.data;
                        }

                        if (prediction.status === 'succeeded' && prediction.output) {
                            const imageRes = await axios.get(prediction.output, { responseType: 'arraybuffer' });
                            avatarBufferToSave = Buffer.from(imageRes.data);
                        }
                    }
                } catch (iaError) {}

                const finalBnWBuffer = await sharp(avatarBufferToSave).grayscale().jpeg({ quality: 90 }).toBuffer();
                const avatarToken = crypto.randomUUID();
                const avatarPath = `checkins/${cleanId}/avatar_${guestIndex}.jpg`;
                const avatarFile = bucket.file(avatarPath);
                
                await avatarFile.save(finalBnWBuffer, {
                    metadata: { contentType: 'image/jpeg', metadata: { firebaseStorageDownloadTokens: avatarToken } }
                });

                avatarUrl = `https://firebasestorage.googleapis.com/v0/b/${event.data.bucket}/o/${encodeURIComponent(avatarPath)}?alt=media&token=${avatarToken}`;
            } catch (cropErr) {}
        }

        const bookingRef = db.collection('bookings').doc(finalBookingId);
        await db.runTransaction(async (transaction) => {
            const docSnap = await transaction.get(bookingRef);
            if (!docSnap.exists) return;

            const bData = docSnap.data();
            const guestCount = parseInt(bData.guest_count) || 1;
            let guestsVerification = bData.guests_verification || {};

            if (!guestsVerification[guestIndex]) {
                guestsVerification[guestIndex] = {
                    front_uploaded: false, back_uploaded: false, front_text: "", first_name: "", last_name: "", name: "Pendiente", status: "pending", avatar_url: "", front_image_url: "", back_image_url: "", passport_url: ""
                };
            }

            const gv = guestsVerification[guestIndex];
            
            if (avatarUrl) gv.avatar_url = avatarUrl;
            
            if (isPassport) {
                gv.is_passport = true; gv.front_uploaded = true; gv.back_uploaded = true; gv.first_name = extractedFirstName; gv.last_name = extractedLastName; gv.name = formattedName || gv.name;
                if (document_image_url) {
                    gv.passport_url = document_image_url; gv.front_image_url = document_image_url; gv.back_image_url = document_image_url;
                }
            } else if (isFront) {
                gv.front_uploaded = true; gv.front_text = upperText;
                if (document_image_url) gv.front_image_url = document_image_url;
            } else if (isBack) {
                gv.back_uploaded = true; gv.first_name = extractedFirstName; gv.last_name = extractedLastName; gv.name = formattedName || gv.name;
                if (document_image_url) gv.back_image_url = document_image_url;
            }

            if (gv.front_uploaded && gv.back_uploaded && !gv.is_passport) {
                const normalize = (str) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
                const textToSearch = normalize(gv.front_text);
                const fname = normalize(gv.first_name);
                const lname = normalize(gv.last_name);

                if (fname && lname && textToSearch.includes(fname) && textToSearch.includes(lname)) {
                    gv.status = "completed";
                } else {
                    gv.status = "unmatch"; gv.front_uploaded = false; 
                }
            } else if (gv.is_passport && gv.back_uploaded) {
                gv.status = "completed";
            } else if (gv.front_uploaded && !gv.back_uploaded) {
                gv.status = "front_only";
            } else if (!gv.front_uploaded && gv.back_uploaded) {
                gv.status = "back_only";
            }

            let overallStatus = "pending";
            let completedCount = 0;
            let partialIndex = 0;
            let unmatchIndex = 0;
            let allNames = [];

            for (let i = 1; i <= guestCount; i++) {
                const guestObj = guestsVerification[i];
                if (!guestObj) continue;
                if (guestObj.status === 'unmatch') unmatchIndex = i;
                if (guestObj.status === 'completed') {
                    completedCount++;
                    if (guestObj.name !== "Pendiente") allNames.push(guestObj.name);
                }
                if (guestObj.status === 'front_only' || guestObj.status === 'back_only') partialIndex = i;
            }

            if (unmatchIndex > 0) overallStatus = `unmatch ${unmatchIndex}`;
            else if (completedCount === guestCount) overallStatus = `approved_active`;
            else if (partialIndex > 0) overallStatus = `partial ${partialIndex}`;
            else if (completedCount > 0) overallStatus = `completed ${completedCount}`;

            const updatePayload = {
                document_status: overallStatus,
                guests_verification: guestsVerification, 
                last_verified_name: allNames.join(' | ') || formattedName || "Procesando...",
                document_validated_at: admin.firestore.FieldValue.serverTimestamp()
            };

            if (overallStatus === 'approved_active' && bData.status !== 'Checked-In' && bData.status !== 'checked_in') {
                updatePayload.status = 'Confirmed';
            }

            transaction.update(bookingRef, updatePayload);
        });

        // Intentar Check-in automático al final
        await intentarCheckInFinal(finalBookingId);

    } catch (e) { 
        return await markAsInvalid("Ocurrió un error procesando la imagen. Intenta tomar una foto más clara.");
    }
    return null;
});

// ==========================================
// --- FUNCIÓN 7: SINCRONIZAR HABITACIONES DESDE CLOUDBEDS ---
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

        dataRecibida.forEach((propiedad) => {
            if (propiedad.rooms && Array.isArray(propiedad.rooms)) {
                propiedad.rooms.forEach((room) => {
                    const roomId = `room-${room.roomID}`;
                    const roomRef = db.collection("rooms").doc(roomId);
                    
                    const lockField = room.customFields?.find(f => 
                        f.customFieldName.toLowerCase().includes('doorlock')
                    );

                    batch.set(roomRef, {
                        room_id_cloudbeds: room.roomID,
                        name: room.roomName || `Hab-${room.roomID}`,
                        type_name: room.roomTypeName || "Sin Tipo",
                        lockId: room.doorlockID || (lockField ? lockField.customFieldValue : null),
                        last_sync: admin.firestore.FieldValue.serverTimestamp()
                    }, { merge: true });
                    
                    count++;
                });
            }
        });

        if (count > 0) {
            await batch.commit();
            return res.status(200).send(`Sincronización Exitosa! ${count} habitaciones guardadas.`);
        } else {
            return res.status(200).json({ mensaje: "No se encontraron habitaciones", data: dataRecibida });
        }
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
});

// ==========================================
// --- FUNCIÓN 8: SINCRONIZAR RACK DE RESERVAS (CLAVE PERMANENTE - SÚPER ESTABLE) ---
// ==========================================
exports.webhookCloudbeds = onRequest({ region: "us-central1" }, async (req, res) => {
    try {
        const reservationID = req.body.reservationID || req.body.reservationId;
        if (!reservationID) return res.status(200).send("No ID");
        
        console.log(`Webhook recibido para ${reservationID}. Esperando 8s...`);
        await new Promise(resolve => setTimeout(resolve, 8000));

        const cbAuthDoc = await db.collection("integrations").doc("cloudbeds").get();
        
        if (!cbAuthDoc.exists || !cbAuthDoc.data().access_token) {
            console.error("No hay token guardado en Firebase.");
            return res.status(500).send("Sin token");
        }

        const accessToken = cbAuthDoc.data().access_token.trim();
        
        // Vamos directo a la API con tu CLAVE PERMANENTE, sin intentar renovar nada.
        const detalleResponse = await axios.get("https://hotels.cloudbeds.com/api/v1.2/getReservation", {
            params: { reservationID },
            headers: { 'Authorization': `Bearer ${accessToken}` },
            validateStatus: () => true 
        });

        const apiResponse = detalleResponse.data;

        if (apiResponse.error || apiResponse.message === "Unauthenticated") {
            console.error("🚨 Cloudbeds rechazó la Clave API Permanente:", JSON.stringify(apiResponse));
            return res.status(500).send("Clave rechazada");
        }

        if (apiResponse.success === false) {
            console.log(`Reserva ${reservationID} borrada en Cloudbeds.`);
            await db.collection("bookings").doc(`booking-${reservationID}`).update({
                status: "canceled",
                last_sync: admin.firestore.FieldValue.serverTimestamp()
            }).catch(() => {});
            return res.status(200).send("OK - Reserva Borrada");
        }

        let d = apiResponse.data ? apiResponse.data : apiResponse;
        if (Array.isArray(d)) d = d[0] || {};
        
        if (!d || !d.startDate) {
            console.error("Data corrupta:", JSON.stringify(apiResponse));
            return res.status(200).send("Data corrupta");
        }

        const nombreCloudbeds = d.guestName || `${d.firstName || ""} ${d.lastName || ""}`.trim() || "Huésped";
        const saldoPendiente = parseFloat(d.balance || 0);
        let statusPago = saldoPendiente > 0 && d.status !== 'canceled' && d.status !== 'no_show' ? "pending" : "completed";

        // 🛡️ TRADUCTOR DE ESTADOS CLOUDBEDS -> FIREBASE BLINDADO
        let estadoParaFirebase = d.status || "confirmed";
        
        // Protegemos el estado interno de "espera en puerta"
        const docPrevio = await db.collection("bookings").doc(`booking-${reservationID}`).get();
        if (docPrevio.exists && docPrevio.data().status === 'Checked-In' && estadoParaFirebase === 'confirmed') {
            estadoParaFirebase = 'Checked-In'; 
        }

        let totalGuests = 0;
        let roomsAssigned = [];
        const allRooms = [];
        if (d.assigned && Array.isArray(d.assigned)) allRooms.push(...d.assigned);
        if (d.unassigned && Array.isArray(d.unassigned)) allRooms.push(...d.unassigned);

        for (const room of allRooms) {
            const adults = parseInt(room.adults) || 0;
            const children = parseInt(room.children) || 0;
            let roomGuests = adults + children;
            if (roomGuests === 0) roomGuests = 1; 
            totalGuests += roomGuests;

            let lockId = null;
            if (room.roomID) {
                try {
                    const roomDetailsResponse = await axios.get("https://hotels.cloudbeds.com/api/v1.2/getRooms", {
                         params: { roomID: room.roomID },
                         headers: { 'Authorization': `Bearer ${accessToken}` }
                    });
                    const rData = roomDetailsResponse.data.data?.[0]?.rooms?.[0];
                    if (rData) {
                        const lockField = rData.customFields?.find(f => f.customFieldName?.toLowerCase().includes('doorlock'));
                        lockId = rData.doorlockID || (lockField ? lockField.customFieldValue : null);
                        if (lockId) {
                            await db.collection("rooms").doc(`room-${room.roomID}`).update({ lockId: lockId }).catch(()=>{});
                        }
                    }
                } catch(e) {}
            }

            roomsAssigned.push({
                sub_reservation_id: room.subReservationID || reservationID,
                room_id_cloudbeds: room.roomID || null,
                room_name: room.roomName || "No asignada",
                lock_id: lockId || null,
                guest_count: roomGuests 
            });
        }

        if (totalGuests === 0) totalGuests = 1;

        const bookingRef = db.collection("bookings").doc(`booking-${reservationID}`);
        await bookingRef.set({
            booking_id_cloudbeds: String(reservationID),
            guest_name: nombreCloudbeds,
            check_in: d.startDate,
            check_out: d.endDate,
            status: estadoParaFirebase,
            pay_status: statusPago,
            balance: saldoPendiente,
            access_enabled: true, 
            rooms: roomsAssigned, 
            room_id_cloudbeds: roomsAssigned[0]?.room_id_cloudbeds || null,
            room_name: roomsAssigned.map(r => r.room_name).join(" + ") || "No asignada",
            lock_id: roomsAssigned[0]?.lock_id || null,
            guest_count: totalGuests,
            last_sync: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        
        console.log(`✅ Webhook: Reserva ${reservationID} guardada con éxito. Estado: ${estadoParaFirebase}, Saldo: $${saldoPendiente}`);
        return res.status(200).send("OK");

    } catch (error) {
        console.error("❌ Error Webhook:", error.message);
        return res.status(200).send("Error procesado");
    }
});

// ==========================================
// --- FUNCIÓN 9: SINCRONIZAR TODAS LAS HABITACIONES ---
// ==========================================
exports.syncAllRooms = onRequest({ region: "us-central1" }, async (req, res) => {
    try {
        const cbAuthDoc = await db.collection("integrations").doc("cloudbeds").get();
        if (!cbAuthDoc.exists) return res.status(400).send("No hay credenciales de Cloudbeds.");
        
        const accessToken = cbAuthDoc.data().access_token.trim();

        const roomsResponse = await axios.get("https://hotels.cloudbeds.com/api/v1.2/getRooms", {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });

        const properties = roomsResponse.data.data;
        if (!properties || properties.length === 0) return res.status(200).send("No hay propiedades.");

        const roomsList = properties[0].rooms || [];
        let updatedCount = 0;
        const batch = db.batch();

        for (const room of roomsList) {
            const roomId = room.roomID;
            const roomName = room.roomName;
            
            const lockField = room.customFields?.find(f => f.customFieldName.toLowerCase().includes('doorlock'));
            const lockId = room.doorlockID || (lockField ? lockField.customFieldValue : null) || "";

            const roomRef = db.collection("rooms").doc(`room-${roomId}`);
            
            batch.set(roomRef, {
                id: `room-${roomId}`,
                room_id_cloudbeds: roomId,
                name: roomName,
                lockId: lockId,
                last_sync: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });

            updatedCount++;
        }
        await batch.commit();

        return res.status(200).json({ success: true, message: `Sincronización completa. ${updatedCount} habs.` });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
});

// ==========================================
// --- FUNCIÓN 10: MOTOR DE UPSELLING ---
// ==========================================
exports.verificarUpgrade = onCall({
    region: "us-central1",
    cors: true
}, async (request) => {
    const data = request.data || {};
    const bookingId = data.bookingId;

    if (!bookingId) throw new HttpsError('invalid-argument', 'Falta el ID.');

    try {
        const bookingRef = db.collection("bookings").doc(`booking-${bookingId}`);
        const bookingSnap = await bookingRef.get();
        
        if (!bookingSnap.exists) return { available: false, reason: "Reserva no encontrada." };
        
        const bData = bookingSnap.data();
        if (['canceled', 'Cancelada', 'no_show'].includes(bData.status)) {
            return { available: false, reason: "Reserva inactiva." };
        }

        let roomNameActual = bData.room_name || "";
        if (bData.rooms && bData.rooms.length > 0 && bData.rooms[0].room_name) {
            roomNameActual = bData.rooms[0].room_name;
        }
        roomNameActual = roomNameActual.toLowerCase().trim();

        const checkInTxt = bData.check_in;
        const checkOutTxt = bData.check_out;

        if (!checkInTxt || !checkOutTxt) return { available: false, reason: "Sin fechas." };

        const myCheckIn = new Date(checkInTxt + "T00:00:00");
        const myCheckOut = new Date(checkOutTxt + "T00:00:00");

        // Usamos la variable global JERARQUIA_HABITACIONES
        const indexActual = JERARQUIA_HABITACIONES.findIndex(h => roomNameActual.includes(h.id));
        if (indexActual === -1 || indexActual === JERARQUIA_HABITACIONES.length - 1) {
            return { available: false, reason: `No aplica a upgrade.` };
        }

        const objetivo = JERARQUIA_HABITACIONES[indexActual + 1];
        const roomsSnap = await db.collection("rooms").get();
        const habitacionesFisicasObjetivo = [];

        roomsSnap.forEach(doc => {
            const rData = doc.data();
            const rName = (rData.name || "").toLowerCase().trim();
            const rTypeName = (rData.type_name || "").toLowerCase().trim();

            if (rName.includes(objetivo.id) || rTypeName.includes(objetivo.name.toLowerCase())) {
                if (rName) habitacionesFisicasObjetivo.push(rName);
            }
        });

        if (habitacionesFisicasObjetivo.length === 0) {
            return { available: false, reason: `No hay inventario para ${objetivo.name}.` };
        }

        const bookingsSnap = await db.collection("bookings")
            .where("status", "in", ["Confirmed", "confirmed", "Checked-In", "checked_in", "Bloqueada", "pending", "Pendiente", "Hospedado"])
            .get();

        const nombresOcupados = new Set();

        bookingsSnap.forEach(doc => {
            if (doc.id === bookingSnap.id) return;
            const res = doc.data();
            if (!res.check_in || !res.check_out) return;

            const resIn = new Date(res.check_in + "T00:00:00");
            const resOut = new Date(res.check_out + "T00:00:00");

            if (resIn < myCheckOut && resOut > myCheckIn) { 
                if (res.rooms && Array.isArray(res.rooms)) {
                    res.rooms.forEach(r => {
                        const rn = (r.room_name || "").toLowerCase().trim();
                        if (rn) nombresOcupados.add(rn);
                    });
                } else if (res.room_name) {
                    const rn = res.room_name.toLowerCase().trim();
                    if (rn) nombresOcupados.add(rn);
                }
            }
        });

       let habitacionLibre = null;
       for (const habFisica of habitacionesFisicasObjetivo) {
           if (!nombresOcupados.has(habFisica)) {
               habitacionLibre = habFisica; 
               break;
           }
       }

       if (habitacionLibre) {
           const hoy = new Date();
           hoy.setHours(0, 0, 0, 0); 
           const fechaInicioUpgrade = hoy > myCheckIn ? hoy : myCheckIn;
           const nochesRestantes = Math.ceil((myCheckOut - fechaInicioUpgrade) / (1000 * 60 * 60 * 24));

           if (nochesRestantes <= 0) return { available: false, reason: "Último día." };

           const diferenciaExtra = objetivo.extra - JERARQUIA_HABITACIONES[indexActual].extra;
           const diferenciaTotal = diferenciaExtra * nochesRestantes;

           return {
               available: true,
               offer: {
                   newRoomName: objetivo.name,
                   pricePerDay: diferenciaExtra, 
                   totalDifference: diferenciaTotal,
                   nights: nochesRestantes, 
                   description: `Disfruta de mayor espacio y comodidad.`
               }
           };
       }

       return { available: false, reason: `Sin disponibilidad en Rack para ${objetivo.name}.` };
   } catch (error) {
       return { available: false, error: "Falla calculando Rack." };
   }
});

// ==========================================
// --- FUNCIÓN 11: SINCRONIZAR TARIFAS ---
// ==========================================
exports.syncTarifasCloudbeds = onRequest({ region: "us-central1" }, async (req, res) => {
    try {
        const resultado = await procesarSincronizacionTarifas();
        if (!resultado.success) return res.status(200).send("Estructura no reconocida.");
        return res.status(200).send(`✅ Sincronización Exitosa: ${resultado.actualizadas} habs.`);
    } catch (error) {
        res.status(500).send("Error: " + error.message);
    }
});

exports.autoSyncTarifasCloudbeds = onSchedule({
    schedule: "0 0,12 * * *", 
    region: "us-central1",
    memory: "256MiB",
}, async (event) => {
    try {
        await procesarSincronizacionTarifas();
    } catch (error) {}
});

// ==========================================
// --- FUNCIÓN 12: WEBHOOK DE PLEXO A CLOUDBEDS (Crear Reservas de WhatsApp) ---
// ==========================================
exports.webhookPlexo = onRequest({ region: "us-central1" }, async (req, res) => {
    try {
        const data = req.body;
        if (data.status !== "approved") return res.status(200).send("Ignorando.");

        const bookingId = data.referenceId; 

        const bookingRef = db.collection("bookings").doc(bookingId);
        const bookingSnap = await bookingRef.get();

        if (!bookingSnap.exists) return res.status(404).send("No encontrada");

        const bData = bookingSnap.data();
        if (bData.status === "Confirmed") return res.status(200).send("Ya confirmada.");

        const cbAuthDoc = await db.collection("integrations").doc("cloudbeds").get();
        const accessToken = cbAuthDoc.data().access_token.trim();

        const nombrePartes = (bData.guest_name || "Huésped WhatsApp").split(" ");
        const firstName = nombrePartes[0];
        const lastName = nombrePartes.slice(1).join(" ") || "SkyRooms";

        const payloadCloudbeds = {
            startDate: bData.check_in,
            endDate: bData.check_out,
            guestFirstName: firstName,
            guestLastName: lastName,
            guestEmail: bData.guest_email || "reservas@skyrooms.uy",
            guestPhone: bData.guest_phone || "",
            rooms: bData.rooms_to_book
        };

        const response = await axios.post("https://api.cloudbeds.com/api/v1.2/postReservation", payloadCloudbeds, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });

        if (response.data.success) {
            const cbReservationId = response.data.reservationID;
            await bookingRef.update({
                status: "Confirmed",
                booking_id_cloudbeds: cbReservationId,
                pay_status: "completed",
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            return res.status(200).send("OK");
        } else {
            return res.status(500).send("Error de Cloudbeds");
        }
    } catch (error) {
        return res.status(500).send("Error interno");
    }
});

// ==========================================
// --- FUNCIÓN 13: PROCESAR PAGO DIRECTO PLEXO (WebApp) ---
// ==========================================
exports.crearPagoPlexo = onCall({ region: "us-central1", cors: true }, async (request) => {
    const data = request.data || {};
    // NUNCA extraemos 'amount' del frontend. El servidor decide cuánto cobrar.
    const { bookingId, currency, cardDetails, guestInfo, intentType, upgradeDetails } = data;

    if (!cardDetails || !bookingId) throw new HttpsError('invalid-argument', 'Faltan datos de la tarjeta o ID de reserva.');

    try {
        // 1. 🛡️ OBTENER LA RESERVA DE FIRESTORE (La fuente de la verdad)
        const bookingRef = db.collection("bookings").doc(`booking-${bookingId}`);
        const bookingSnap = await bookingRef.get();
        
        if (!bookingSnap.exists) {
            throw new HttpsError('not-found', 'Reserva no encontrada en la base de datos.');
        }
        const bData = bookingSnap.data();

        // 2. 🛡️ CÁLCULO DE PRECIO INHACKEABLE (Backend Only)
        let montoSeguro = 0;

        if (!intentType || intentType === 'pago_saldo') {
            // A. PAGO DE SALDO: Se lee directo de Cloudbeds
            const rawBalance = bData.balance !== undefined ? bData.balance : (bData.balanceDue || 0);
            montoSeguro = parseFloat(String(rawBalance).replace(/[^0-9.-]+/g,""));
            
        } else if (intentType === 'late_checkout') {
            // B. LATE CHECKOUT: Se cobra la tarifa global estricta
            montoSeguro = LATE_CHECKOUT_FEE;

        } else if (intentType === 'upgrade' || intentType === 'combined') {
            // C. UPGRADE: El servidor recalcula las noches y la diferencia de tarifa
            const myCheckIn = new Date(bData.check_in + "T00:00:00");
            const myCheckOut = new Date(bData.check_out + "T00:00:00");
            const hoy = new Date();
            hoy.setHours(0, 0, 0, 0); 
            
            const fechaInicioUpgrade = hoy > myCheckIn ? hoy : myCheckIn;
            const nochesRestantes = Math.ceil((myCheckOut - fechaInicioUpgrade) / (1000 * 60 * 60 * 24));

            if (nochesRestantes <= 0) throw new HttpsError('failed-precondition', 'Fechas inválidas para upgrade.');

            let roomNameActual = (bData.rooms?.[0]?.room_name || bData.room_name || "").toLowerCase().trim();
            
            const indexActual = JERARQUIA_HABITACIONES.findIndex(h => roomNameActual.includes(h.id));
            const indexObjetivo = JERARQUIA_HABITACIONES.findIndex(h => upgradeDetails?.newRoomName?.toLowerCase().includes(h.name.toLowerCase()));

            if (indexActual === -1 || indexObjetivo === -1 || indexObjetivo <= indexActual) {
                throw new HttpsError('invalid-argument', 'Upgrade no válido matemáticamente.');
            }

            const diferenciaExtra = JERARQUIA_HABITACIONES[indexObjetivo].extra - JERARQUIA_HABITACIONES[indexActual].extra;
            montoSeguro = diferenciaExtra * nochesRestantes;
        }

        // Validación final de seguridad antes de cobrar
        if (isNaN(montoSeguro) || montoSeguro <= 0) {
            throw new HttpsError('failed-precondition', `Monto final calculado es inválido para la operación: ${intentType}`);
        }

        console.log(`[Plexo Secure] Cobrando a ${bookingId} | Monto: $${montoSeguro} | Tipo: ${intentType || 'pago_saldo'}`);

        // 3. CREDENCIALES Y PAYLOAD A PLEXO
        const clientId = "1220";
        const apiKey = "04bcf7dd12f34b258e9fb5ef0f289f0e4960581c7183402fbe63fd537eed821c";
        const merchantId = 14304;
        const PLEXO_API_URL = "https://api.testing.plexo.com.uy/v1/payments"; 
        
        const authString = Buffer.from(`${clientId}:${apiKey}`).toString('base64');

        const [mesStr, anioStr] = cardDetails.expiry.split('/');
        const expMonth = parseInt(mesStr, 10);
        const expYear = parseInt("20" + anioStr, 10); 

        const nombrePartes = cardDetails.name.trim().split(" ");
        const firstName = nombrePartes[0] || "Usuario";
        const lastName = nombrePartes.slice(1).join(" ") || "SkyRooms";

        // 4. ARMADO DEL PAYLOAD CON EL MONTO BLINDADO
        const payload = {
            referenceId: `PAY-${bookingId}-${Date.now()}`,
            invoiceNumber: `INV-${bookingId}`,
            merchantId: merchantId,
            paymentMethod: {
                type: "card",
                processor: { acquirer: "mock" }, 
                card: {
                    number: cardDetails.number.replace(/\s/g, ''), 
                    expMonth: expMonth,
                    expYear: expYear,
                    cvc: cardDetails.cvc,
                    cardholder: {
                        firstName: firstName,
                        lastName: lastName,
                        email: guestInfo?.email || "reservas@skyrooms.uy",
                        identification: { type: 0, value: guestInfo?.documento || "11111111" }
                    }
                }
            },
            amount: {
                currency: currency || "UYU",
                total: montoSeguro, // <-- 100% DICTADO POR EL SERVIDOR
                details: { tax: { type: "none", amount: 0 } }
            },
            items: [{
                referenceId: `RES-${bookingId}`,
                name: intentType === 'upgrade' ? `Upgrade a ${upgradeDetails?.newRoomName}` : (intentType === 'late_checkout' ? "Late Checkout 14:00hs" : "Pago de Saldo"),
                quantity: 1,
                price: montoSeguro // <-- 100% DICTADO POR EL SERVIDOR
            }],
            browserDetails: { ipAddress: request.rawRequest?.ip || "127.0.0.1" }
        };

        const response = await axios.post(PLEXO_API_URL, payload, {
            headers: { 'Content-Type': 'application/json', 'Authorization': `Basic ${authString}` }
        });

        const resultado = response.data;

        // 5. PROCESAMIENTO POST-PAGO EXITOSO
        if (resultado && resultado.status === "approved") {
            let cloudbedsTargetId = bookingId; 
            if (bData && bData.rooms && bData.rooms.length > 0) {
                cloudbedsTargetId = bData.rooms[0].sub_reservation_id || bookingId;
            }

            const pagoImpactadoEnPMS = await registrarPagoEnCloudbeds(
                cloudbedsTargetId, 
                montoSeguro, 
                intentType === 'upgrade' ? `Upgrade a ${upgradeDetails?.newRoomName} (SkyRooms/Plexo)` : (intentType === 'late_checkout' ? "Late Checkout (SkyRooms/Plexo)" : "Pago de Saldo (SkyRooms/Plexo)")
            );

            const batch = db.batch();
            const updateData = {
                pay_status: "completed", 
                balance: 0,
                plexo_payment_id: resultado.id,
                cloudbeds_payment_sync: pagoImpactadoEnPMS, 
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            };

            if (intentType === 'upgrade' || intentType === 'combined') {
                updateData.room_name = upgradeDetails.newRoomName;
                updateData.room_id_cloudbeds = upgradeDetails.newRoomId || null;
            } else if (intentType === 'late_checkout') {
                updateData.late_checkout_confirmed = true;
                updateData.new_checkout_time = "14:00";
            }

            batch.update(bookingRef, updateData);
            await batch.commit();

            await intentarCheckInFinal(`booking-${bookingId}`);
            
            return { success: true, message: "Pago aprobado e impactado", data: resultado };
        } else {
            return { success: false, message: `El banco rechazó la operación. Estado: ${resultado?.status || 'unknown'}` };
        }

    } catch (error) {
        console.error("Error en crearPagoPlexo:", error.response?.data || error.message);
        throw new HttpsError('internal', error.message || 'Error al procesar el pago con Plexo.');
    }
});

// ==========================================
// --- FUNCIÓN 14: BOT DE WHATSAPP: LOBO (VERSIÓN UNIFICADA FINAL) ---
// ==========================================
exports.whatsappBot = onRequest({ 
    region: "us-central1",
    secrets: ["GOOGLE_GENAI_API_KEY"] 
}, async (req, res) => {
    
    const WA_TOKEN = "EAANYDE0FEZBcBQ5w3HxZAjOZAGr3ZAbdJRQ9ZCcePITyFHuZCUNUUufyfZCpw961IeEnUjUFwOMw0ijnDeNnvfZCZAeVfjl7UfpZADNMGRGZAODUZAdG4Wf0RFLjEtNulB7DzH6mWxjajKWu6bG1NqasW9gNpOMFWMOayuNf385RBYg6b9toJwWAA2F7to7buZAYlq4KqbAZDZD".trim(); 
    const WA_PHONE_ID = "981817001685074".trim();
    const VERIFY_TOKEN = "skyrooms_bot_2024";

    if (req.method === "GET") {
        if (req.query["hub.verify_token"] === VERIFY_TOKEN) return res.status(200).send(req.query["hub.challenge"]);
        return res.sendStatus(403);
    }
    if (req.method !== "POST") return res.sendStatus(404);

    const value = req.body.entry?.[0]?.changes?.[0]?.value;
    const message = value?.messages?.[0];
    
    if (!message || message.type !== "text") return res.status(200).send("EVENT_RECEIVED");

    const from = message.from; 
    const userMsg = message.text.body;
    const messageId = message.id; 

    try {
        // 🛡️ CAPA 1: BLOQUEO POR ID (Atómico)
        await db.collection("whatsapp_locks").doc(messageId).create({
            from: from,
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });
    } catch (lockError) {
        if (lockError.code === 6) return res.status(200).send("DUPLICATE_ID_IGNORED");
    }

    try {
        const chatRef = db.collection("whatsapp_chats").doc(from);
        
        // 🛡️ CAPA 2: COMPARADOR Y GUARDADO INMEDIATO
        const resultBloqueo = await db.runTransaction(async (transaction) => {
            const chatDoc = await transaction.get(chatRef);
            let historial = chatDoc.exists ? chatDoc.data().mensajes || [] : [];
            
            if (historial.length > 0) {
                const ultimoMsg = historial[historial.length - 1];
                const segundos = chatDoc.data().ultima_interaccion ? (new Date() - chatDoc.data().ultima_interaccion.toDate()) / 1000 : 999;
                
                if (ultimoMsg.role === "user" && ultimoMsg.parts[0].text === userMsg && segundos < 15) {
                    return { duplicated: true };
                }
            }

            historial.push({ role: "user", parts: [{ text: userMsg }] });
            if (historial.length > 10) historial = historial.slice(-10);
            
            transaction.set(chatRef, { 
                mensajes: historial, 
                ultima_interaccion: admin.firestore.FieldValue.serverTimestamp() 
            }, { merge: true });

            return { duplicated: false, historialActualizado: historial };
        });

        if (resultBloqueo.duplicated) return res.status(200).send("CONTENT_DUPLICATE_IGNORED");

        // --- CARGA DE DATOS (REPARADA) ---
        
        // 1. Inventario (FILTRO PRECIO > 0)
        const roomsSnap = await db.collection("rooms").get();
        let inventario = "";
        roomsSnap.forEach(doc => {
            const r = doc.data();
            if (r.current_rate && r.current_rate > 0) {
                inventario += `- Habitación ${r.name} (${r.type_name}). Tarifa: $${r.current_rate} UYU\n`;
            }
        });

        // 2. Ocupación (FILTRO MULTI-ESTADO)
        const hoyStr = new Date().toISOString().split('T')[0]; 
        const bookingsSnap = await db.collection("bookings")
            .where("status", "in", ["confirmed", "Confirmed", "checked_in", "Checked-In", "checked-in", "pending", "Pendiente", "Hospedado"])
            .get();
            
        let calendario = "";
        bookingsSnap.forEach(doc => {
            const b = doc.data();
            if (b.check_out >= hoyStr) {
                calendario += `- OCUPADA: Habitación ${b.room_name || b.roomName || 'Sin asignar'} | Del ${b.check_in} al ${b.check_out}\n`;
            }
        });

        // --- LLAMADA A IA ---
        const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENAI_API_KEY);
        const model = genAI.getGenerativeModel({ 
            model: "gemini-2.5-flash",
            systemInstruction: `Eres Lobo, recepcionista de SkyRooms. HOY ES ${hoyStr}.
Inventario: ${inventario}
Ocupación: ${calendario}

REGLAS:
1. No inventes servicios ni camas extra. Nuestras habitaciones son para 2 personas.
2. Si una habitación está OCUPADA en las fechas pedidas, no la ofrezcas.
3. Sé profesional y muy breve.`
        }); 

        let historialParaIA = resultBloqueo.historialActualizado.slice(0, -1);
        while (historialParaIA.length > 0 && historialParaIA[0].role !== "user") {
            historialParaIA.shift();
        }

        const result = await model.startChat({ history: historialParaIA }).sendMessage(userMsg);
        let respuestaIA = result.response.text().replace(/\*/g, '') || "Disculpe, ¿podría repetirlo?";

        await db.runTransaction(async (t) => {
            const doc = await t.get(chatRef);
            let mensajes = doc.data().mensajes;
            mensajes.push({ role: "model", parts: [{ text: respuestaIA }] });
            t.update(chatRef, { mensajes: mensajes });
        });

        await axios.post(`https://graph.facebook.com/v19.0/${WA_PHONE_ID}/messages`, {
            messaging_product: "whatsapp", to: String(from), type: "text", text: { body: respuestaIA }
        }, { headers: { 'Authorization': `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' } });

    } catch (error) {
        console.error("Error en bot:", error.message);
    }
    return res.status(200).send("EVENT_RECEIVED");
});

// ==========================================
// --- FUNCIÓN 15: AUTENTICACIÓN OAUTH CLOUDBEDS ---
// ==========================================
exports.cloudbedsAuth = onCall(
  {
    region: "us-central1",
    secrets: [CLOUDBEDS_CLIENT_ID, CLOUDBEDS_CLIENT_SECRET],
    cors: true,
  },
  async (request) => {
    const data = request.data || {};
    const authCode = data.authCode;
    const redirectUri = data.redirectUri;

    if (!authCode || !redirectUri) {
      throw new HttpsError("invalid-argument", "Se requiere authCode y redirectUri.");
    }

    const clientId = CLOUDBEDS_CLIENT_ID.value();
    const clientSecret = CLOUDBEDS_CLIENT_SECRET.value();

    try {
      const response = await axios.post("https://hotels.cloudbeds.com/api/v1.1/oauth", 
        new URLSearchParams({
          grant_type: "authorization_code",
          client_id: clientId,
          client_secret: clientSecret,
          code: authCode,
          redirect_uri: redirectUri
        }).toString(), 
        { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
      );

      const responseData = response.data;

      // PRO TIP: Guardar los tokens en la base de datos de manera automática
      await db.collection("integrations").doc("cloudbeds").set({
        access_token: responseData.access_token,
        refresh_token: responseData.refresh_token || null,
        expires_in: responseData.expires_in,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      return { 
        success: true, 
        message: "Autenticación exitosa y token guardado en Firebase.",
        expiresIn: responseData.expires_in
      };

    } catch (error) {
      console.error("Error crítico en la función cloudbedsAuth:", error.response ? error.response.data : error.message);
      throw new HttpsError("internal", "Error interno del servidor al procesar la autenticación de Cloudbeds.");
    }
  }
);

// ==========================================
// --- FUNCIÓN 16: MOTOR DE LATE CHECKOUT ---
// ==========================================
exports.verificarLateCheckout = onCall({ region: "us-central1", cors: true }, async (request) => {
    const data = request.data || {};
    const bookingId = data.bookingId;
    if (!bookingId) throw new HttpsError('invalid-argument', 'Falta el ID de la reserva.');

    try {
        const bRef = db.collection("bookings").doc(`booking-${bookingId}`);
        const bSnap = await bRef.get();
        if (!bSnap.exists) return { available: false, reason: "Reserva no encontrada." };

        const bData = bSnap.data();
        const myCheckOutDate = bData.check_out; // Formato YYYY-MM-DD
        const myRoomId = bData.room_id_cloudbeds;

        if (!myRoomId) return { available: false, reason: "Habitación no asignada todavía." };

        // 🔍 REGLA DE ORO: ¿Viene alguien después de mí a ESTA MISMA habitación física?
        const incomingSnap = await db.collection("bookings")
            .where("check_in", "==", myCheckOutDate)
            .where("status", "in", ["Confirmed", "confirmed", "Checked-In", "checked_in", "pending", "Pendiente"])
            .get();

        let habitacionComprometida = false;
        
        incomingSnap.forEach(doc => {
            const incomingData = doc.data();
            
            // 1. Validar la habitación directa de la reserva entrante
            if (String(incomingData.room_id_cloudbeds) === String(myRoomId)) {
                habitacionComprometida = true;
            }
            
            // 2. Validar si es una reserva multi-habitación
            if (incomingData.rooms && Array.isArray(incomingData.rooms)) {
                if (incomingData.rooms.some(r => String(r.room_id_cloudbeds) === String(myRoomId))) {
                    habitacionComprometida = true;
                }
            }
        });

        if (habitacionComprometida) {
            return { available: false, reason: "La habitación ya está asignada a un huésped que ingresa hoy." };
        }

        // ¡Habitación Libre! Devolvemos la oferta de late checkout
        return {
            available: true,
            offer: {
                type: "late_checkout",
                newTime: "14:00",
                price: LATE_CHECKOUT_FEE,
                description: "Quédate hasta las 14:00hs y disfruta la mañana sin prisas."
            }
        };
        
    } catch (e) { 
        return { available: false, error: e.message }; 
    }
});
// ==========================================
// --- FUNCIÓN 17: ACTUALIZAR HOUSEKEEPING EN CLOUDBEDS ---
// ==========================================
exports.updateHousekeepingStatus = onCall({ region: "us-central1", cors: true }, async (request) => {
    const data = request.data || {};
    const { roomId, hkStatus } = data; 

    if (!roomId || !hkStatus) throw new HttpsError('invalid-argument', 'Faltan datos de la habitación o estado.');

    try {
        const cbAuthDoc = await db.collection("integrations").doc("cloudbeds").get();
        if (!cbAuthDoc.exists || !cbAuthDoc.data().access_token) {
            throw new HttpsError('internal', "No hay token guardado en Firebase.");
        }
        const accessToken = cbAuthDoc.data().access_token.trim();

        // 🚀 CORRECCIÓN: Enviamos el ID completo de la unidad física (ej. "673063-0")
        // Ya no lo cortamos con split('-')[0]
        const payload = new URLSearchParams({
            roomID: roomId, 
            roomCondition: hkStatus // "clean" o "dirty"
        });

        // Enviamos POST a postHousekeepingStatus con formato de Formulario
        const response = await axios.post('https://hotels.cloudbeds.com/api/v1.2/postHousekeepingStatus', payload.toString(), {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            validateStatus: () => true 
        });

        console.log(`[CLOUDBEDS HK RESPONSE] para habitación ${roomId}:`, response.data);

        if (response.data && response.data.success) {
            await db.collection("rooms").doc(`room-${roomId}`).update({
                hk_status: hkStatus,
                status: hkStatus === 'clean' ? 'Disponible' : 'Limpieza', 
                last_hk_sync: admin.firestore.FieldValue.serverTimestamp()
            });
            return { success: true, message: "Estado actualizado en Cloudbeds" };
        } else {
            console.error("Cloudbeds rechazó el cambio:", response.data);
            return { success: false, error: response.data?.message || "Fallo en Cloudbeds" };
        }

    } catch (error) {
        console.error("Error crítico en updateHousekeepingStatus:", error.message);
        throw new HttpsError('internal', 'Error al sincronizar con Cloudbeds.');
    }
});