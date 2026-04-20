const axios = require('axios');

const LANG_NAMES = {
  'en': 'English', 'hi': 'Hindi', 'ta': 'Tamil', 'te': 'Telugu',
  'kn': 'Kannada', 'ml': 'Malayalam', 'bn': 'Bengali', 'gu': 'Gujarati',
  'mr': 'Marathi', 'or': 'Odiya', 'as': 'Assamese', 'bho': 'Bhojpuri'
};

/**
 * Translate text using Groq (Llama 3.1 8B Instant)
 * Optimized with USER-provided High-Performance System Prompt
 */
const translateText = async (text, srcLang, tgtLang) => {
  const trimmed = text?.trim();
  if (!trimmed) return '';

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('[Translation] GROQ_API_KEY missing');

  const srcName = LANG_NAMES[srcLang.split('-')[0]] || srcLang;
  const targetName = LANG_NAMES[tgtLang.split('-')[0]] || tgtLang;

  try {
    const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
      model: 'llama-3.1-8b-instant',
      messages: [
        {
          role: 'system',
          content: `You are a real-time speech translation engine.

TASK:
Translate the input text from ${srcName} to ${targetName}.

CORE REQUIREMENTS:
* Preserve the exact meaning of the original sentence.
* Do NOT omit any information.
* Do NOT add extra meaning or assumptions.
* Maintain the original tone (formal/informal, emotion).
* Keep names, numbers, and entities accurate.
* If a word has no direct equivalent, choose the closest natural translation.

OUTPUT RULES:
* Output ONLY the translated text.
* No explanations, no comments, no formatting.
* No quotes, no prefixes, no metadata.

LOW LATENCY MODE:
* Respond immediately.
* Do NOT use step-by-step reasoning.
* Do NOT overthink.
* Keep sentence structure simple but correct.
* Prefer direct translation, but adjust grammar if needed for correctness.

STREAMING HANDLING:
* If input is partial or incomplete, translate it as-is.
* Do not wait for full sentence completion.

QUALITY GUARD:
* Ensure nothing from the input is missing in the output.
* Ensure the translation is clear and natural in the target language.

Return only the translated text.`
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

    return response.data.choices[0]?.message?.content?.trim() || '';
  } catch (error) {
    console.error(`[Translation] ❌ Error: ${error.response?.data?.error?.message || error.message}`);
    return trimmed; 
  }
};

module.exports = { translateText };