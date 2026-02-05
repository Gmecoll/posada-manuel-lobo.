const { ai } = require('./genkit'); 
const { z } = require('zod');

const conserjeflow = ai.defineFlow(
  {
    name: 'conserjeflow',
    inputSchema: z.any(), 
    outputSchema: z.string(),
  },
  async (input) => {
    // 1. DESCOMPRESIÓN FLEXIBLE
    const payload = input?.data || input;

    // 2. EXTRACCIÓN DEL TEXTO (Acepta 'preguntaUsuario' que es lo que envía tu frontend)
    const pregunta = payload?.preguntaUsuario || payload?.message || payload?.text || (typeof payload === 'string' ? payload : "");
    
    if (!pregunta || pregunta.trim().length === 0) {
      console.error("DEBUG: Datos recibidos incompletos:", JSON.stringify(payload));
      return "Lo siento, no recibí una pregunta clara. ¿En qué puedo ayudarte?";
    }

    // 3. FORMATEO DEL HISTORIAL (Adaptado a la estructura de Genkit)
    let history = [];
    const rawHistory = payload?.historial || payload?.history;

    if (Array.isArray(rawHistory)) {
      history = rawHistory.map(m => ({
        role: m.role === 'user' ? 'user' : 'model',
        content: [{ text: String(m.parts?.[0]?.text || m.content || "") }]
      })).filter(m => m.content[0].text.length > 0);
    }

    try {
      const { text } = await ai.generate({
        model: 'googleai/gemini-2.0-flash', // <--- ACTUALIZADO A LA VERSIÓN 2.0/2.5
        history: history,
        prompt: `
        ### ROL
        Eres el Asistente de la Posada Manuel Lobo en Colonia del Sacramento. Tu misión es ayudar al huésped con su estadía.

        ### REGLAS DE ORO
        - BREVEDAD: Máximo 2 párrafos.
        - RECOMENDACIONES: Si preguntan por alquiler de autos, menciona Avis, Hertz o Localiza cerca del puerto.
        - RECLAMOS: Deriva al WhatsApp del administrador: [+59899429348].

        ### CONSULTA ACTUAL: 
        "${pregunta}"`, 
        config: { 
          temperature: 0.4, 
          maxOutputTokens: 1000 
        },
      });
      
      return text;
    } catch (error) {
      console.error("ERROR CRÍTICO EN GEMINI 2.0/2.5:", error);
      return "Lo siento, tuve un problema al procesar la respuesta. Por favor, intenta nuevamente.";
    }
  }
);

module.exports = { conserjeflow };