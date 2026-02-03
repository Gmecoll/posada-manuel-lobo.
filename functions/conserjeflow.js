const { ai } = require('./genkit'); 
const { z } = require('zod');

const conserjeflow = ai.defineFlow(
  {
    name: 'conserjeflow',
    inputSchema: z.any(), 
    outputSchema: z.string(),
  },
  async (input) => {
    // 1. DESCOMPRESIÓN DE DATOS (Solución al error "Falta el texto")
    // Firebase onCall envía los datos en input.data. Si no existe, usamos input.
    const payload = input?.data || input;

    // 2. EXTRACCIÓN Y VALIDACIÓN DE LA PREGUNTA
    const pregunta = typeof payload === 'string' 
      ? payload 
      : (payload?.message || "");
    
    // Si la pregunta llega vacía, evitamos llamar a Gemini para no causar error
    if (!pregunta || pregunta.trim().length === 0) {
      console.error("Error: el campo 'message' llegó vacío al backend.", input);
      return "Lo siento, no pude recibir tu mensaje. ¿Podrías intentar escribirlo de nuevo?";
    }

    // 3. FORMATEO DEL HISTORIAL
    let history = [];
    const rawHistory = payload?.history;

    if (Array.isArray(rawHistory)) {
      history = rawHistory.map(m => ({
        role: m.role === 'user' ? 'user' : 'model',
        content: Array.isArray(m.content) 
          ? m.content 
          : [{ text: String(m.content?.text || m.content || "") }]
      })).filter(m => m.content[0].text.length > 0);
    }

    try {
      const { text } = await ai.generate({
        model: 'googleai/gemini-2.5-flash', 
        history: history,
        prompt: `
        ### ROL
        Eres el Asistente de la Posada Manuel Lobo en Colonia del Sacramento. Tu misión es ayudar al huésped con todo lo relacionado a su estadía.

        ### TAREAS PROACTIVAS
        1. BREVEDAD: Máximo 2 o 3 párrafos cortos. Ve directo al grano.
        2. SERVICIOS EXTERNOS: Si el huésped pide alquilar un auto, indícale las agencias principales en Colonia (ej. Avis, Hertz, Thrifty, Localiza) que están cerca del Puerto o el Centro.
        3. DETALLES: Proporciona números de teléfono, horarios y cómo llegar desde la Posada Manuel Lobo.
        4. TURISMO: Recomienda actividades, sitios históricos y traslados.

        ### REGLAS DE ORO
        - Tono: Profesional, amable y ejecutivo.
        - Limitación: No realices reservas directamente, solo provee información de contacto.
        - Reclamos: Deriva siempre al WhatsApp del administrador: [+59899429348].

        ### CONSULTA ACTUAL DEL HUÉSPED: 
        "${pregunta}"

        ### RESPUESTA DETALLADA DEL ASISTENTE:`, 
        config: { 
          temperature: 0.4, 
          topP: 0.8, 
          maxOutputTokens: 5000 
        },
      });
      
      return text;
    } catch (error) {
      console.error("ERROR CRÍTICO EN AI.GENERATE:", error);
      return "Lo siento, tuve un problema al procesar la respuesta. Por favor, intenta nuevamente.";
    }
  }
);

module.exports = { conserjeflow };