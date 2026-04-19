/**
 * TTS Service — Hybrid Engine
 * 
 * Engines:
 *  - Cartesia sonic-3: Used for English (fastest, high quality)
 *  - Sarvam Saaras: Used for Indian languages (Tamil, Hindi, etc. — best accents)
 */

const axios = require('axios');

const VOICE_MAP = {
  'en':  'e8e5fffb-252c-436d-b842-8879b84445b6', // Cartesia English
  'hi':  'meera', // Sarvam Hindi
  'ta':  'meera', // Sarvam Tamil
  'te':  'meera',
  'kn':  'meera',
  'ml':  'meera',
  'bn':  'meera',
  'gu':  'meera',
  'mr':  'meera',
  'or':  'meera',
  'as':  'meera',
  'bho': 'meera',
  'default': 'meera',
};

const SARVAM_LANG_MAP = {
  'hi': 'hi-IN', 'ta': 'ta-IN', 'te': 'te-IN', 'kn': 'kn-IN',
  'ml': 'ml-IN', 'bn': 'bn-IN', 'gu': 'gu-IN', 'mr': 'mr-IN',
  'or': 'or-IN', 'as': 'as-IN', 'bho': 'hi-IN',
};

const getLangBase = (language) => (language || 'en').toLowerCase().split('-')[0];

/**
 * Main TTS entry point — routes to the best engine for the language
 */
const synthesizeSpeech = async (text, language) => {
  const base = getLangBase(language);
  
  if (base === 'en') {
    return synthesizeWithCartesia(text, language);
  } else {
    return synthesizeWithSarvam(text, language);
  }
};

/**
 * Cartesia Engine (English)
 */
const synthesizeWithCartesia = async (text, language) => {
  const apiKey = process.env.CARTESIA_API_KEY;
  const voiceId = VOICE_MAP['en'];

  console.log(`[TTS] Cartesia sonic-3 | en | "${text.substring(0, 40)}..."`);

  const response = await fetch('https://api.cartesia.ai/tts/bytes', {
    method: 'POST',
    headers: {
      'X-API-Key':        apiKey,
      'Cartesia-Version': '2024-06-10',
      'Content-Type':     'application/json',
    },
    body: JSON.stringify({
      model_id:   'sonic-3',
      language:   'en',
      transcript: text.trim(),
      voice: { mode: 'id', id: voiceId },
      output_format: {
        container:   'mp3',
        bit_rate:    128000,
        sample_rate: 44100,
      },
    }),
  });

  if (!response.ok) throw new Error(`Cartesia error: ${response.status}`);
  const buffer = await response.arrayBuffer();
  return Buffer.from(buffer).toString('base64');
};

/**
 * Sarvam Saaras Engine (Indian Languages)
 */
const synthesizeWithSarvam = async (text, language) => {
  const apiKey = process.env.SARVAM_API_KEY;
  const base = getLangBase(language);
  const sarvamLang = SARVAM_LANG_MAP[base] || 'hi-IN';

  console.log(`[TTS] Sarvam Saaras | ${sarvamLang} | "${text.substring(0, 40)}..."`);

  const response = await axios.post('https://api.sarvam.ai/v1/text-to-speech', {
    inputs: [text.trim()],
    target_language_code: sarvamLang,
    speaker: 'meera',
    model: 'saaras:v1',
    speech_sample_rate: 16000,
    enable_preprocessing: true,
  }, {
    headers: { 'api-subscription-key': apiKey }
  });

  if (response.data?.audios?.[0]) {
    return response.data.audios[0]; // Already base64 from Sarvam
  }
  throw new Error('Sarvam TTS failed to return audio');
};

module.exports = { synthesizeSpeech };