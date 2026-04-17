/**
 * TTS Service — Hybrid Engine
 *
 * Cartesia sonic-multilingual ONLY supports: en, hi, de, es, fr, ja, pt, zh, ko, etc.
 * It does NOT support: ta, kn, te, ml, bn, gu, mr, as, or, bho
 *
 * Strategy:
 *   - Cartesia  → for English and Hindi (fastest, best quality)
 *   - ElevenLabs → for all other Indian regional languages (ta, kn, te, ml, etc.)
 */

// ─────────────────────────────────────────────────────────────────────────────
// Languages supported by Cartesia sonic-multilingual
// ─────────────────────────────────────────────────────────────────────────────
const CARTESIA_SUPPORTED_LANGS = new Set(['en', 'hi']);

// Cartesia Voice IDs (only used for supported languages)
const CARTESIA_VOICE_MAP = {
  'en':  '7c6219d2-e8d2-462c-89d8-7ecba7c75d65',
  'hi':  '7c6219d2-e8d2-462c-89d8-7ecba7c75d65',
  'bho': '7c6219d2-e8d2-462c-89d8-7ecba7c75d65',
};

// ElevenLabs Voice IDs for Indian regional languages
const ELEVENLABS_VOICE_MAP = {
  'ta':  'Xb7hH8MSUJpSbSDYk0k2',  // Alice   — bright, multilingual
  'te':  'XB0fDUnXU5powFXDhCwa',  // Charlotte — smooth
  'kn':  'TX3LPaxmHKxFdv7VOQHJ',  // Liam    — confident
  'ml':  'XrExE9yKIg1WjnnlVkGX',  // Matilda — warm
  'bn':  'JBFqnCBsd6RMkjVDRZzb',  // George  — expressive
  'gu':  'XrExE9yKIg1WjnnlVkGX',  // Matilda — warm
  'mr':  'bIHbv24MWmeRgasZH58o',  // Will    — friendly
  'or':  'Xb7hH8MSUJpSbSDYk0k2',  // Alice   — fallback
  'as':  '9BWtsMINqrJLrRacOk9x',  // Aria    — warm multilingual
};
const ELEVENLABS_DEFAULT_VOICE = 'EXAVITQu4vr4xnSDxMaL'; // Sarah

const getLangBase = (language) => (language || 'en').toLowerCase().split('-')[0];

// ─────────────────────────────────────────────────────────────────────────────
// Cartesia TTS — English & Hindi
// ─────────────────────────────────────────────────────────────────────────────
const synthesizeWithCartesia = async (text, langBase) => {
  const apiKey  = process.env.CARTESIA_API_KEY;
  if (!apiKey) throw new Error('[TTS] CARTESIA_API_KEY missing');

  const voiceId = CARTESIA_VOICE_MAP[langBase] || CARTESIA_VOICE_MAP['en'];
  console.log(`[TTS] Cartesia | voice=${voiceId} lang=${langBase} | "${text.substring(0, 50)}"`);

  const response = await fetch('https://api.cartesia.ai/tts/bytes', {
    method: 'POST',
    headers: {
      'X-API-Key':        apiKey,
      'Cartesia-Version': '2024-06-10',
      'Content-Type':     'application/json',
    },
    body: JSON.stringify({
      model_id:   'sonic-multilingual',
      language:   langBase,
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
  console.log(`[TTS] ✅ Cartesia: ${buffer.byteLength} bytes`);
  return base64;
};

// ─────────────────────────────────────────────────────────────────────────────
// ElevenLabs TTS — Indian Regional Languages
// ─────────────────────────────────────────────────────────────────────────────
const synthesizeWithElevenLabs = async (text, langBase) => {
  const apiKey  = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error('[TTS] ELEVENLABS_API_KEY missing');

  const voiceId = ELEVENLABS_VOICE_MAP[langBase] || ELEVENLABS_DEFAULT_VOICE;
  console.log(`[TTS] ElevenLabs | voice=${voiceId} lang=${langBase} | "${text.substring(0, 50)}"`);

  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?optimize_streaming_latency=4&output_format=mp3_44100_128`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key':   apiKey,
    },
    body: JSON.stringify({
      text:     text.trim(),
      model_id: 'eleven_flash_v2_5',
      voice_settings: {
        stability:        0.45,
        similarity_boost: 0.75,
        style:            0.10,
        use_speaker_boost: true,
      },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`[TTS] ElevenLabs ${response.status}: ${errText}`);
  }

  const buffer = await response.arrayBuffer();
  const base64  = Buffer.from(buffer).toString('base64');
  console.log(`[TTS] ✅ ElevenLabs: ${buffer.byteLength} bytes`);
  return base64;
};

// ─────────────────────────────────────────────────────────────────────────────
// Main Entry Point — Routes to correct engine
// ─────────────────────────────────────────────────────────────────────────────
const synthesizeSpeech = async (text, language) => {
  if (!text || text.trim() === '') throw new Error('[TTS] No text provided');

  const langBase = getLangBase(language);

  if (CARTESIA_SUPPORTED_LANGS.has(langBase)) {
    return synthesizeWithCartesia(text, langBase);
  } else {
    return synthesizeWithElevenLabs(text, langBase);
  }
};

const getVoiceId = (language) => {
  const langBase = getLangBase(language);
  return CARTESIA_VOICE_MAP[langBase] || ELEVENLABS_VOICE_MAP[langBase] || ELEVENLABS_DEFAULT_VOICE;
};

module.exports = { synthesizeSpeech, getVoiceId };