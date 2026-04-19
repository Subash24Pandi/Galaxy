/**
 * TTS Service — Cartesia AI (All Languages)
 *
 * Model: sonic-3 (latest, fastest, supports all languages on paid plan)
 * Output: MP3
 *
 * User-provided Voice IDs are used for each language.
 */

// ─────────────────────────────────────────────────────────────────────────────
// VOICE MAP — User-provided Cartesia Voice IDs
// ─────────────────────────────────────────────────────────────────────────────
const VOICE_MAP = {
  'en':  'e8e5fffb-252c-436d-b842-8879b84445b6',
  'hi':  'faf0731e-dfb9-4cfc-8119-259a79b27e12',
  'ta':  '25d2c432-139c-4035-bfd6-9baaabcdd006',
  'bho': '7c6219d2-e8d2-462c-89d8-7ecba7c75d65',
  'te':  'cf061d8b-a752-4865-81a2-57570a6e0565',
  'kn':  '6baae46d-1226-45b5-a976-c7f9b797aae2',
  'bn':  '2ba861ea-7cdc-43d1-8608-4045b5a41de5',
  'gu':  '4590a461-bc68-4a50-8d14-ac04f5923d22',
  'mr':  '5c32dce6-936a-4892-b131-bafe474afe5f',
  'ml':  '374b80da-e622-4dfc-90f6-1eeb13d331c9',
  'as':  '2ba861ea-7cdc-43d1-8608-4045b5a41de5',
  'or':  '25d2c432-139c-4035-bfd6-9baaabcdd006',
  'default': '7c6219d2-e8d2-462c-89d8-7ecba7c75d65',
};

const LANG_MAP = {
  'en': 'en', 'hi': 'hi', 'ta': 'ta', 'te': 'te',
  'kn': 'kn', 'ml': 'ml', 'bn': 'bn', 'gu': 'gu',
  'mr': 'mr', 'or': 'or', 'as': 'as', 'bho': 'hi',
};

const getLangBase = (language) => (language || 'en').toLowerCase().split('-')[0];

const synthesizeSpeech = async (text, language) => {
  if (!text || text.trim() === '') throw new Error('[TTS] No text provided');

  const apiKey = process.env.CARTESIA_API_KEY;
  if (!apiKey) throw new Error('[TTS] CARTESIA_API_KEY missing');

  const base = getLangBase(language);
  const voiceId = VOICE_MAP[base] || VOICE_MAP['default'];
  const cartesiaLang = LANG_MAP[base] || 'en';

  console.log(`[TTS] Cartesia sonic-3 | lang=${cartesiaLang} | "${text.substring(0, 40)}..."`);

  const response = await fetch('https://api.cartesia.ai/tts/bytes', {
    method: 'POST',
    headers: {
      'X-API-Key':        apiKey,
      'Cartesia-Version': '2024-06-10',
      'Content-Type':     'application/json',
    },
    body: JSON.stringify({
      model_id:   'sonic-3',
      language:   cartesiaLang,
      transcript: text.trim(),
      voice: {
        mode: 'id',
        id:   voiceId,
      },
      output_format: {
        container:   'mp3',
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
  return Buffer.from(buffer).toString('base64');
};

module.exports = { synthesizeSpeech };