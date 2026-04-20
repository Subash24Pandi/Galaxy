/**
 * Translation Service — Groq AI (Llama 3.3 70B)
 * 
 * Used for ultra-low latency, high-accuracy translation.
 */

const axios = require('axios');

const LANG_NAMES = {
  'en': 'English', 'hi': 'Hindi', 'ta': 'Tamil', 'te': 'Telugu',
  'kn': 'Kannada', 'ml': 'Malayalam', 'bn': 'Bengali', 'gu': 'Gujarati',
  'mr': 'Marathi', 'or': 'Odiya', 'as': 'Assamese', 'bho': 'Bhojpuri'
};

/**
 * Translate text using Groq Llama 3.3 70B
 * @param {string} text     - Input text
 * @param {string} srcLang  - Source language code
 * @param {string} tgtLang  - Target language code
 * @returns {Promise<string>} Translated text
 */
const translateText = async (text, srcLang, tgtLang) => {
  const trimmed = text?.trim();
  if (!trimmed) return '';

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('[Translation] GROQ_API_KEY missing');

  const targetName = LANG_NAMES[tgtLang.split('-')[0]] || tgtLang;

  console.log(`[Translation] Groq (Llama 3.3 70B) | ${srcLang} → ${tgtLang} | "${trimmed.substring(0, 40)}..."`);

  try {
    const startTime = Date.now();
    const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
      model: 'llama-3.3-70b-versatile',
      messages: [
        {
          role: 'system',
          content: `Translate the input text exactly into ${targetName}.
- DO NOT add any extra information, notes, or explanations.
- DO NOT hallucinate or change the meaning.
- Maintain a natural, spoken tone.
- Output ONLY the translated text. No quotes. No conversational filler.`
        },
        {
          role: 'user',
          content: trimmed
        }
      ],
      temperature: 0.1, // Low temperature for high accuracy
      max_tokens: 1024,
      stream: false
    }, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 5000 // Groq is fast, 5s is plenty
    });

    const translated = response.data?.choices?.[0]?.message?.content?.trim();
    const duration = Date.now() - startTime;

    if (translated) {
      console.log(`[Translation] ✅ Groq (${duration}ms): "${translated.substring(0, 60)}..."`);
      return translated;
    }
    throw new Error('Empty response from Groq');

  } catch (err) {
    console.error(`[Translation] Groq failed: ${err.message}`);
    // No fallback to Sarvam NMT to ensure maximum speed and consistency
    throw err;
  }
};

module.exports = { translateText };