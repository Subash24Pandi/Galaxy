/**
 * TTS Service — Cartesia AI Integration
 *
 * Model: sonic-multilingual for ALL languages
 *   → Sub-100ms latency, high-fidelity regional language support
 *   → IMPORTANT: language field is REQUIRED in the request body
 */

// ─────────────────────────────────────────────────────────────────────────────
// VOICE MAP — Using user-provided Cartesia Voice IDs
// ─────────────────────────────────────────────────────────────────────────────
const VOICE_MAP = {
  // Core Languages
  'en':  '7c6219d2-e8d2-462c-89d8-7ecba7c75d65',
  'hi':  '7c6219d2-e8d2-462c-89d8-7ecba7c75d65',
  'ta':  '25d2c432-139c-4035-bfd6-9baaabcdd006',
  'bho': '7c6219d2-e8d2-462c-89d8-7ecba7c75d65',

  // Regional Languages
  'te':  'cf061d8b-a752-4865-81a2-57570a6e0565',
  'kn':  '7c6219d2-e8d2-462c-89d8-7ecba7c75d65',
  'bn':  '2ba861ea-7cdc-43d1-8608-4045b5a41de5',
  'gu':  '4590a461-bc68-4a50-8d14-ac04f5923d22',
  'mr':  '5c32dce6-936a-4892-b131-bafe474afe5f',
  'ml':  '374b80da-e622-4dfc-90f6-1eeb13d331c9',
  'as':  '2ba861ea-7cdc-43d1-8608-4045b5a41de5',

  // Fallback
  'default': '7c6219d2-e8d2-462c-89d8-7ecba7c75d65'
};

// ─────────────────────────────────────────────────────────────────────────────
// LANGUAGE MAP — Cartesia requires BCP-47 language codes in the request
// ─────────────────────────────────────────────────────────────────────────────
const CARTESIA_LANG_MAP = {
  'en':  'en',
  'hi':  'hi',
  'ta':  'ta',
  'te':  'te',
  'kn':  'kn',
  'ml':  'ml',
  'bn':  'bn',
  'gu':  'gu',
  'mr':  'mr',
  'or':  'or',
  'as':  'as',
  'bho': 'hi',   // Bhojpuri → Hindi (closest supported)
};

const MODEL_ID = 'sonic-multilingual';

const getVoiceId = (language) => {
  const langFull = (language || 'en').toLowerCase();
  const langBase = langFull.split('-')[0];
  return VOICE_MAP[langFull] || VOICE_MAP[langBase] || VOICE_MAP['default'];
};

const getCartesiaLang = (language) => {
  const langBase = (language || 'en').toLowerCase().split('-')[0];
  return CARTESIA_LANG_MAP[langBase] || 'en';
};

/**
 * Synthesize speech using Cartesia and return base64-encoded WAV audio.
 * @param {string} text     - Text to speak
 * @param {string} language - Target language code (e.g. 'ta', 'hi', 'en')
 * @returns {Promise<string>} Base64-encoded WAV
 */
const synthesizeSpeech = async (text, language) => {
  if (!text || text.trim() === '') throw new Error('[TTS] No text provided');

  const apiKey = process.env.CARTESIA_API_KEY;
  if (!apiKey) throw new Error('[TTS] CARTESIA_API_KEY missing');

  const voiceId      = getVoiceId(language);
  const cartesiaLang = getCartesiaLang(language);
  console.log(`[TTS] Cartesia | voice=${voiceId} lang=${cartesiaLang} | "${text.substring(0, 50)}"`);

  const response = await fetch('https://api.cartesia.ai/tts/bytes', {
    method: 'POST',
    headers: {
      'X-API-Key':        apiKey,
      'Cartesia-Version': '2024-06-10',
      'Content-Type':     'application/json',
    },
    body: JSON.stringify({
      model_id:   MODEL_ID,
      language:   cartesiaLang,   // ← REQUIRED: tells Cartesia which language to speak
      transcript: text.trim(),
      voice: {
        mode: 'id',
        id:   voiceId,
      },
      output_format: {
        container:   'wav',
        encoding:    'pcm_s16le',
        sample_rate: 24000,
      },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`[TTS] Cartesia ${response.status}: ${errText}`);
  }

  const buffer = await response.arrayBuffer();
  const base64  = Buffer.from(buffer).toString('base64');
  console.log(`[TTS] ✅ Cartesia: ${buffer.byteLength} bytes for lang=${cartesiaLang}`);
  return base64;
};

module.exports = { synthesizeSpeech, getVoiceId };