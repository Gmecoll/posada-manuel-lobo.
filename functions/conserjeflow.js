const { ai } = require('./genkit'); 
const { z } = require('zod');

const conserjeflow = ai.defineFlow(
  {
    name: 'conserjeflow',
    inputSchema: z.any(), 
    outputSchema: z.string(),
  },
  async (input) => {
    // 1. DESCOMPRESIÓN DE DATOS
    // El frontend parece estar enviando los datos dentro de 'data' o directamente
    const payload = input?.data || input;

    // 2. EXTRACCIÓN FLEXIBLE (Busca 'preguntaUsuario' que es lo que llega en tu log)
    const pregunta = payload?.preguntaUsuario || payload?.message || payload?.text || (typeof payload === 'string' ? payload : "");
    
    if (!pregunta || pregunta.trim().length === 0) {
      console.error("DATOS RECIBIDOS EN BACKEND:", JSON.stringify(payload));
      return "Lo siento, no recibí ninguna pregunta clara. ¿En qué puedo ayudarte?";
    }

    // 3. FORMATEO DEL HISTORIAL
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
        model: 'googleai/gemini-1.5-flash', 
        history: history,
        prompt: `
        ### ROL
        Eres el Asistente de la Posada Manuel Lobo en Colonia del Sacramento. 

        ### REGLAS
        - Sé breve y amable.
        - Si piden servicios externos (autos, tours), da recomendaciones locales.
        - Reclamos al WhatsApp: [+59899429348].

        ### PREGUNTA DEL HUÉSPED: 
        "${pregunta}"`, 
        config: { temperature: 0.5 }
      });
      
      return text;
    } catch (error) {
      console.error("ERROR GENERANDO RESPUESTA IA:", error);
      return "Hubo un error al procesar tu solicitud con la IA.";
    }
  }
);

module.exports = { conserjeflow };