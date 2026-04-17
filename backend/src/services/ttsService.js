/**
 * TTS Service — Cartesia AI (All Languages)
 *
 * Model: sonic-2 (latest, fastest, supports all languages on paid plan)
 * Output: MP3 (browser-compatible, no partial playback issues unlike WAV PCM)
 *
 * User-provided Voice IDs are used for each language.
 */

// ─────────────────────────────────────────────────────────────────────────────
// VOICE MAP — User-provided Cartesia Voice IDs
// ─────────────────────────────────────────────────────────────────────────────
const VOICE_MAP = {
  'en':  '7c6219d2-e8d2-462c-89d8-7ecba7c75d65',
  'hi':  '7c6219d2-e8d2-462c-89d8-7ecba7c75d65',
  'ta':  '25d2c432-139c-4035-bfd6-9baaabcdd006',
  'bho': '7c6219d2-e8d2-462c-89d8-7ecba7c75d65',
  'te':  'cf061d8b-a752-4865-81a2-57570a6e0565',
  'kn':  '7c6219d2-e8d2-462c-89d8-7ecba7c75d65',
  'bn':  '2ba861ea-7cdc-43d1-8608-4045b5a41de5',
  'gu':  '4590a461-bc68-4a50-8d14-ac04f5923d22',
  'mr':  '5c32dce6-936a-4892-b131-bafe474afe5f',
  'ml':  '374b80da-e622-4dfc-90f6-1eeb13d331c9',
  'as':  '2ba861ea-7cdc-43d1-8608-4045b5a41de5',
  'or':  '25d2c432-139c-4035-bfd6-9baaabcdd006',
  'default': '7c6219d2-e8d2-462c-89d8-7ecba7c75d65',
};

// Cartesia language code mapping (BCP-47)
const LANG_MAP = {
  'en': 'en', 'hi': 'hi', 'ta': 'ta', 'te': 'te',
  'kn': 'kn', 'ml': 'ml', 'bn': 'bn', 'gu': 'gu',
  'mr': 'mr', 'or': 'or', 'as': 'as', 'bho': 'hi',
};

const getLangBase = (language) => (language || 'en').toLowerCase().split('-')[0];

const getVoiceId = (language) => {
  const base = getLangBase(language);
  return VOICE_MAP[base] || VOICE_MAP['default'];
};

const getCartesiaLang = (language) => {
  const base = getLangBase(language);
  return LANG_MAP[base] || 'en';
};

/**
 * Synthesize speech using Cartesia sonic-2 and return base64-encoded MP3.
 * @param {string} text     - Text to speak
 * @param {string} language - Target language code (e.g. 'ta', 'hi', 'en')
 * @returns {Promise<string>} Base64-encoded MP3
 */
const synthesizeSpeech = async (text, language) => {
  if (!text || text.trim() === '') throw new Error('[TTS] No text provided');

  const apiKey = process.env.CARTESIA_API_KEY;
  if (!apiKey) throw new Error('[TTS] CARTESIA_API_KEY missing');

  const voiceId      = getVoiceId(language);
  const cartesiaLang = getCartesiaLang(language);

  console.log(`[TTS] Cartesia sonic-2 | lang=${cartesiaLang} voice=${voiceId} | "${text.substring(0, 60)}"`);

  const response = await fetch('https://api.cartesia.ai/tts/bytes', {
    method: 'POST',
    headers: {
      'X-API-Key':        apiKey,
      'Cartesia-Version': '2024-06-10',
      'Content-Type':     'application/json',
    },
    body: JSON.stringify({
      model_id:   'sonic-3',           // Latest model with full multilingual support on paid plans
      language:   cartesiaLang,        // Required: BCP-47 language code
      transcript: text.trim(),
      voice: {
        mode: 'id',
        id:   voiceId,
      },
      output_format: {
        container:   'mp3',            // MP3: smaller, faster, no partial playback issues
        bit_rate:    128000,
        sample_rate: 44100,
      },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`[TTS] Cartesia ${response.status}: ${errText}`);
  }

  const buffer = await response.arrayBuffer();
  const base64  = Buffer.from(buffer).toString('base64');
  console.log(`[TTS] ✅ Cartesia: ${buffer.byteLength} bytes (MP3) for lang=${cartesiaLang}`);
  return base64;
};

module.exports = { synthesizeSpeech, getVoiceId };