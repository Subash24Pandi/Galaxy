/**
 * STT Service — Sarvam AI Primary + ElevenLabs Fallback
 *
 * Primary:  Sarvam saarika:v2.5 (best for Indian languages)
 * Fallback: ElevenLabs scribe_v1 (if Sarvam returns empty or fails)
 */

const axios    = require('axios');
const FormData = require('form-data');

// Sarvam language code mapping
const SARVAM_LANG_MAP = {
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
  'bho': 'hi-IN',
};

// ElevenLabs language code mapping
const ELEVENLABS_LANG_MAP = {
  'en': 'en', 'en-IN': 'en',
  'hi': 'hi', 'hi-IN': 'hi',
  'ta': 'ta', 'ta-IN': 'ta',
  'te': 'te', 'te-IN': 'te',
  'kn': 'kn', 'kn-IN': 'kn',
  'bn': 'bn', 'bn-IN': 'bn',
  'gu': 'gu', 'gu-IN': 'gu',
  'mr': 'mr', 'mr-IN': 'mr',
  'ml': 'ml', 'ml-IN': 'ml',
  'or': 'or', 'or-IN': 'or',
  'as': 'as', 'as-IN': 'as',
  'bho': 'hi',
};

const cleanTranscript = (raw) => {
  if (!raw) return '';
  return raw
    .replace(/\(.*?\)/g, '')  // remove (background noise), (music), etc.
    .replace(/\[.*?\]/g, '')
    .replace(/\*.*?\*/g, '')
    .trim();
};

// ─────────────────────────────────────────────────────────────────────────────
// PRIMARY: Sarvam saarika:v2.5
// ─────────────────────────────────────────────────────────────────────────────
const transcribeWithSarvam = async (audioBuffer, langCode) => {
  const apiKey = process.env.SARVAM_API_KEY;
  if (!apiKey) throw new Error('SARVAM_API_KEY missing');

  const form = new FormData();
  form.append('file', audioBuffer, {
    filename:    'audio.wav',
    contentType: 'audio/wav',
    knownLength: audioBuffer.length,
  });
  form.append('model', 'saarika:v2.5');
  form.append('language_code', langCode);

  const response = await axios.post(
    'https://api.sarvam.ai/speech-to-text',
    form,
    {
      headers: {
        'api-subscription-key': apiKey,
        ...form.getHeaders(),
      },
      timeout: 4000,
    }
  );

  const transcript = cleanTranscript(response.data?.transcript);
  if (!transcript) throw new Error('Empty transcript');
  return transcript;
};

// ─────────────────────────────────────────────────────────────────────────────
// FALLBACK: ElevenLabs scribe_v1
// ─────────────────────────────────────────────────────────────────────────────
const transcribeWithElevenLabs = async (audioBuffer, langCode) => {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY missing');

  const form = new FormData();
  form.append('file', audioBuffer, {
    filename:    'audio.wav',
    contentType: 'audio/wav',
    knownLength: audioBuffer.length,
  });
  form.append('model_id', 'scribe_v1');
  if (langCode) form.append('language_code', langCode);
  form.append('tag_audio_events', 'false');
  form.append('diarize', 'false');

  const response = await axios.post(
    'https://api.elevenlabs.io/v1/speech-to-text',
    form,
    {
      headers: {
        'xi-api-key': apiKey,
        ...form.getHeaders(),
      },
      maxBodyLength: Infinity,
      timeout: 6000,
    }
  );

  const transcript = cleanTranscript(response.data?.text);
  if (!transcript) throw new Error('Empty transcript from ElevenLabs');
  return transcript;
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN: Try Sarvam first, fallback to ElevenLabs on failure
// ─────────────────────────────────────────────────────────────────────────────
const transcribeAudio = async (audioInput, language) => {
  const audioBuffer = Buffer.isBuffer(audioInput)
    ? audioInput
    : Buffer.from(audioInput, 'base64');

  if (audioBuffer.length < 1000) {
    throw new Error('SILENT:Audio too short — likely silence');
  }

  const langFull  = (language || 'en').toLowerCase();
  const langBase  = langFull.split('-')[0];
  const sarvamCode  = SARVAM_LANG_MAP[langFull]  || SARVAM_LANG_MAP[langBase]  || 'hi-IN';
  const elevenCode  = ELEVENLABS_LANG_MAP[langFull] || ELEVENLABS_LANG_MAP[langBase] || 'en';

  console.log(`[STT] ${audioBuffer.length}B | lang=${sarvamCode}`);

  // ── PRIMARY: Sarvam saarika:v2.5 (Fast & optimized for Indian accents) ──
  try {
    const transcript = await transcribeWithSarvam(audioBuffer, sarvamCode);
    if (transcript.length > 1000) throw new Error('SILENT:Transcript too long — possible background media');
    console.log(`[STT] ✅ Sarvam: "${transcript.substring(0, 80)}"`);
    return transcript;
  } catch (err) {
    if (err.message.startsWith('SILENT:')) throw err;
    console.warn(`[STT] Sarvam failed (${err.message}) → trying ElevenLabs`);
  }

  // ── FALLBACK: ElevenLabs (High accuracy backup) ──────────────────────────
  try {
    const transcript = await transcribeWithElevenLabs(audioBuffer, elevenCode);
    if (transcript.length > 1000) throw new Error('SILENT:Transcript too long — possible background media');
    console.log(`[STT] ✅ ElevenLabs fallback: "${transcript.substring(0, 80)}"`);
    return transcript;
  } catch (err) {
    if (err.message.startsWith('SILENT:')) throw err;
    throw new Error(`SILENT:Both engines failed: ${err.message}`);
  }
};

module.exports = { transcribeAudio };