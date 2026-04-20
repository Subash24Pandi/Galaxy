const axios = require('axios');

const LANG_NAMES = {
  'en': 'English', 'hi': 'Hindi', 'ta': 'Tamil', 'te': 'Telugu',
  'kn': 'Kannada', 'ml': 'Malayalam', 'bn': 'Bengali', 'gu': 'Gujarati',
  'mr': 'Marathi', 'or': 'Odiya', 'as': 'Assamese', 'bho': 'Bhojpuri'
};

/**
 * Translate text using Groq (Llama 3.1 8B Instant)
 * Optimized for zero-latency and high-accuracy Indian language support.
 */
const translateText = async (text, srcLang, tgtLang) => {
  const trimmed = text?.trim();
  if (!trimmed) return '';

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('[Translation] GROQ_API_KEY missing');

  const srcName = LANG_NAMES[srcLang.split('-')[0]] || srcLang;
  const targetName = LANG_NAMES[tgtLang.split('-')[0]] || tgtLang;

  console.log(`[Translation] Groq | ${srcName} → ${targetName} | "${trimmed.substring(0, 40)}..."`);

  try {
    const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
      model: 'llama-3.1-8b-instant',
      messages: [
        {
          role: 'system',
          content: `You are a professional real-time voice translator. 
Translate the input from ${srcName} to ${targetName} naturally.

CRITICAL RULES:
1. Output ONLY the translated text. DO NOT include the original text or any explanations.
2. YOU MUST USE THE ${targetName} SCRIPT ONLY.
3. DO NOT transliterate. (Example: If input is Tamil 'Saptiya?', translate to English 'Have you eaten?', DO NOT write 'Saptiya').
4. Maintain a colloquial, spoken tone.
5. If the input is noise or meaningless, return an empty string.`
        },
        {
          role: 'user',
          content: trimmed
        }
      ],
      temperature: 0.1,
      max_tokens: 1024,
      stream: false
    }, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    const translated = response.data.choices[0]?.message?.content?.trim() || '';
    
    // Safety check: If the AI returned the exact same text as input, it failed to translate.
    if (translated.toLowerCase() === trimmed.toLowerCase()) {
       console.warn('[Translation] ⚠️ AI returned same text. Possible routing error.');
    }

    return translated;
  } catch (error) {
    console.error(`[Translation] ❌ Error: ${error.response?.data?.error?.message || error.message}`);
    return trimmed; // Fallback
  }
};

module.exports = { translateText };