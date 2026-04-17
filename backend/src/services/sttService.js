/**
 * STT Service — Sarvam AI Saaras:v1
 * 
 * Specifically optimized for Indian languages and accents.
 * Automatically handles multilingual speech and regional dialects.
 */

const axios    = require('axios');
const FormData = require('form-data');

// Sarvam supported languages
const LANG_MAP = {
  'en': 'en-IN', 'en-IN': 'en-IN',
  'hi': 'hi-IN', 'hi-IN': 'hi-IN',
  'ta': 'ta-IN', 'ta-IN': 'ta-IN',
  'te': 'te-IN', 'te-IN': 'te-IN',
  'kn': 'kn-IN', 'kn-IN': 'kn-IN',
  'bn': 'bn-IN', 'bn-IN': 'bn-IN',
  'gu': 'gu-IN', 'gu-IN': 'gu-IN',
  'mr': 'mr-IN', 'mr-IN': 'mr-IN',
  'ml': 'ml-IN', 'ml-IN': 'ml-IN',
  'or': 'or-IN', 'or-IN': 'or-IN',
  'as': 'as-IN', 'as-IN': 'as-IN',
  'bho': 'hi-IN', // Fallback Bhojpuri to Hindi (Saaras understands it via Hindi)
};

/**
 * Transcribe audio using Sarvam Saaras:v1
 * @param {Buffer|string} audioInput - Raw Buffer OR base64 string
 * @param {string} language          - Language code e.g. 'ta', 'hi-IN'
 * @returns {Promise<string>}        - Transcript text
 */
const transcribeAudio = async (audioInput, language) => {
  const apiKey = process.env.SARVAM_API_KEY;
  if (!apiKey) throw new Error('[STT] SARVAM_API_KEY missing');

  // Normalize language code
  const langBase = (language || 'en').toLowerCase().split('-')[0];
  const langFull  = (language || 'en').toLowerCase();
  const langCode  = LANG_MAP[langFull] || LANG_MAP[langBase] || 'hi-IN';

  // Normalize to Buffer
  const audioBuffer = Buffer.isBuffer(audioInput)
    ? audioInput
    : Buffer.from(audioInput, 'base64');

  if (audioBuffer.length < 1000) {
    throw new Error('[STT] Audio too short — likely silence');
  }

  // Build multipart form
  const form = new FormData();
  form.append('file', audioBuffer, {
    filename:    'audio.wav',
    contentType: 'audio/wav',
    knownLength: audioBuffer.length,
  });
  form.append('model', 'saarika:v1');
  // Optional: form.append('language_code', langCode); // Saaras often auto-detects better without this, but we'll include it for stability

  console.log(`[STT] Sarvam | ${audioBuffer.length}B | expected_lang=${langCode}`);

  try {
    const response = await axios.post(
      'https://api.sarvam.ai/speech-to-text',
      form,
      {
        headers: {
          'api-subscription-key': apiKey,
          ...form.getHeaders(),
        },
        timeout: 20000, // 20s
      }
    );

    const transcript = response.data?.transcript?.trim();
    if (!transcript) throw new Error('SILENT:Empty transcript');

    // Reject background noise/media leaks
    if (transcript.length > 500) {
      console.warn(`[STT] ⚠ Sequence too long (${transcript.length}) — stripping as noise`);
      throw new Error('SILENT:Background media detected');
    }

    console.log(`[STT] ✅ "${transcript.substring(0, 80)}"`);
    return transcript;

  } catch (err) {
    if (err.response) {
      const detail = JSON.stringify(err.response.data);
      throw new Error(`[STT] Sarvam ${err.response.status}: ${detail}`);
    }
    throw new Error(`[STT] ${err.message}`);
  }
};

module.exports = { transcribeAudio };