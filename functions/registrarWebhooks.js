const axios = require('axios');

// 👉 1. PEGA AQUÍ EL TOKEN QUE COPIASTE DE FIRESTORE
const TOKEN = "cbat_hWPtz7TMs6yvNzThVumX3rTTfKfWjPGo"; 

// 👉 2. Esta es la URL exacta de tu función en Firebase
const ENDPOINT_URL = "https://us-central1-studio-4343626376-fea63.cloudfunctions.net/webhookCloudbeds";

const eventos = ['dates_changed', 'status_changed', 'accommodation_changed'];

async function registrar() {
    console.log("Iniciando registro de Webhooks en Cloudbeds...");
    
    for (let action of eventos) {
        try {
            const params = new URLSearchParams();
            params.append('endpointUrl', ENDPOINT_URL);
            params.append('object', 'reservation');
            params.append('action', action);

            const response = await axios.post('https://hotels.cloudbeds.com/api/v1.3/postWebhook', params, {
                headers: { 
                    'Authorization': `Bearer ${TOKEN}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });
            
            console.log(`✅ Éxito registrando: ${action} ->`, response.data.message || "OK");
        } catch (error) {
            console.error(`❌ Error en ${action}:`, error.response ? JSON.stringify(error.response.data) : error.message);
        }
    }
    console.log("¡Proceso terminado!");
}

registrar();