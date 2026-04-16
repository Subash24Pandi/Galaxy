/**
 * TTS Service — ElevenLabs Text-to-Speech ONLY (STRICT: No Sarvam TTS)
 *
 * Model: eleven_flash_v2_5 for ALL languages
 *   → Fastest model (~300-500ms), supports 32+ languages including all Indian languages
 *   → Used instead of eleven_multilingual_v2 to minimize latency for live streaming
 *
 * Voice Assignment: Each language gets a distinct voice suitable for that language/accent
 */

// ─────────────────────────────────────────────────────────────────────────────
// VOICE MAP — one distinct voice per language
// All voices below support eleven_flash_v2_5 (multilingual capable)
// ─────────────────────────────────────────────────────────────────────────────
const VOICE_MAP = {
  // English
  'en':    'EXAVITQu4vr4xnSDxMaL',   // Sarah   — clear, natural American English (female)
  'en-IN': '9BWtsMINqrJLrRacOk9x',   // Aria    — warm, multilingual, Indian-friendly (female)

  // Hindi
  'hi':    'pNInz6obpgDQGcFmaJgB',   // Adam    — deep, articulate multilingual (male)
  'hi-IN': 'pNInz6obpgDQGcFmaJgB',

  // Tamil
  'ta':    'Xb7hH8MSUJpSbSDYk0k2',   // Alice   — bright, multilingual (female)
  'ta-IN': 'Xb7hH8MSUJpSbSDYk0k2',

  // Telugu
  'te':    'XB0fDUnXU5powFXDhCwa',   // Charlotte — smooth, multilingual (female)
  'te-IN': 'XB0fDUnXU5powFXDhCwa',

  // Kannada
  'kn':    'TX3LPaxmHKxFdv7VOQHJ',   // Liam    — confident, multilingual (male)
  'kn-IN': 'TX3LPaxmHKxFdv7VOQHJ',

  // Bengali
  'bn':    'JBFqnCBsd6RMkjVDRZzb',   // George  — expressive, multilingual (male)
  'bn-IN': 'JBFqnCBsd6RMkjVDRZzb',

  // Gujarati
  'gu':    'XrExE9yKIg1WjnnlVkGX',   // Matilda — warm, multilingual (female)
  'gu-IN': 'XrExE9yKIg1WjnnlVkGX',

  // Marathi
  'mr':    'bIHbv24MWmeRgasZH58o',   // Will    — friendly, multilingual (male)
  'mr-IN': 'bIHbv24MWmeRgasZH58o',

  // Odiya — fallback to Alice (multilingual)
  'or':    'Xb7hH8MSUJpSbSDYk0k2',
  'or-IN': 'Xb7hH8MSUJpSbSDYk0k2',

  // Assamese — fallback to Aria (multilingual)
  'as':    '9BWtsMINqrJLrRacOk9x',
  'as-IN': '9BWtsMINqrJLrRacOk9x',

  // Bhojpuri — Callum (expressive, multilingual male)
  'bho':   'N2lVS1w4EtoT3dr4eOWO',
  'bho-IN':'N2lVS1w4EtoT3dr4eOWO',
};

// ─────────────────────────────────────────────────────────────────────────────
// MODEL: eleven_flash_v2_5 for ALL languages
//   - Fastest ElevenLabs model (~300-500ms latency)
//   - Supports 32+ languages including Tamil, Hindi, Telugu, Kannada, Bengali etc.
//   - Better for live streaming than eleven_multilingual_v2 (which is slower)
// ─────────────────────────────────────────────────────────────────────────────
const MODEL_ID = 'eleven_flash_v2_5';

const getVoiceId = (language) => {
  const langFull = (language || 'en').toLowerCase();
  const langBase = langFull.split('-')[0];
  return VOICE_MAP[langFull] || VOICE_MAP[langBase] || VOICE_MAP['en'];
};

/**
 * Synthesize speech and return base64-encoded MP3 audio.
 * @param {string} text     - Text to speak
 * @param {string} language - Target language code (e.g. 'ta', 'hi', 'en-IN')
 * @returns {Promise<string>} Base64-encoded MP3
 */
const synthesizeSpeech = async (text, language) => {
  if (!text || text.trim() === '') throw new Error('[TTS] No text provided');

  const apiKey  = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error('[TTS] ELEVENLABS_API_KEY missing');

  const voiceId = getVoiceId(language);

  console.log(`[TTS] voice=${voiceId} model=${MODEL_ID} lang=${language} | "${text.substring(0, 50)}"`);

  // optimize_streaming_latency=4 = maximum latency optimization
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?optimize_streaming_latency=4&output_format=mp3_44100_128`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key':   apiKey,
    },
    body: JSON.stringify({
      text:     text.trim(),
      model_id: MODEL_ID,
      voice_settings: {
        stability:         0.45,
        similarity_boost:  0.75,
        style:             0.10,
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
  console.log(`[TTS] ✅ ${buffer.byteLength} bytes for lang=${language}`);
  return base64;
};

module.exports = { synthesizeSpeech, getVoiceId };