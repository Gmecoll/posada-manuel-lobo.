const { googleAI } = require('@genkit-ai/google-genai');
const { genkit } = require('genkit');

const ai = genkit({
  plugins: [
    googleAI({ 
      apiKey: process.env.GOOGLE_GENAI_API_KEY 
    }),
  ],
});

module.exports = { ai };