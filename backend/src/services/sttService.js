/**
 * STT Service — ElevenLabs Speech-to-Text ONLY
 * Uses axios + form-data (compatible in Node 18+)
 * Native fetch + form-data npm package are INCOMPATIBLE — causes 400 "error parsing the body"
 */

const axios    = require('axios');
const FormData = require('form-data');

// ElevenLabs language code mapping (BCP-47)
const LANG_MAP = {
  'en': 'en', 'en-IN': 'en',
  'hi': 'hi', 'hi-IN': 'hi',
  'ta': 'ta', 'ta-IN': 'ta',
  'te': 'te', 'te-IN': 'te',
  'kn': 'kn', 'kn-IN': 'kn',
  'bn': 'bn', 'bn-IN': 'bn',
  'gu': 'gu', 'gu-IN': 'gu',
  'mr': 'mr', 'mr-IN': 'mr',
  'or': 'or', 'or-IN': 'or',
  'as': 'as', 'as-IN': 'as',
  'bho': 'hi', 'bho-IN': 'hi',   // Bhojpuri → Hindi fallback
};

/**
 * Transcribe audio using ElevenLabs scribe_v1
 * @param {Buffer|string} audioInput - Raw Buffer OR base64 string
 * @param {string} language          - Language code e.g. 'ta', 'hi-IN'
 * @returns {Promise<string>}        - Transcript text
 */
const transcribeAudio = async (audioInput, language) => {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error('[STT] ELEVENLABS_API_KEY missing');

  // Resolve language code
  const langBase = (language || 'en').toLowerCase().split('-')[0];
  const langFull  = (language || 'en').toLowerCase();
  const langCode  = LANG_MAP[langFull] || LANG_MAP[langBase] || 'en';

  // Normalize to Buffer
  const audioBuffer = Buffer.isBuffer(audioInput)
    ? audioInput
    : Buffer.from(audioInput, 'base64');

  if (audioBuffer.length < 1000) {
    throw new Error('[STT] Audio too short — likely silence');
  }

  // Build multipart form using form-data npm package + axios (compatible pair)
  const form = new FormData();
  form.append('file', audioBuffer, {
    filename:    'audio.wav',
    contentType: 'audio/wav',
    knownLength: audioBuffer.length,
  });
  form.append('model_id', 'scribe_v1');
  if (langCode) {
    form.append('language_code', langCode);
  }
  // Disable audio event tags — prevents (MUSIC), (Machine sound) etc. in transcript
  form.append('tag_audio_events', 'false');
  form.append('diarize',          'false');

  console.log(`[STT] Transcribing ${audioBuffer.length}B | lang=${langCode}`);

  try {
    const response = await axios.post(
      'https://api.elevenlabs.io/v1/speech-to-text',
      form,
      {
        headers: {
          'xi-api-key': apiKey,
          ...form.getHeaders(),   // sets Content-Type: multipart/form-data; boundary=...
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        timeout: 30000,   // 30s — ElevenLabs STT can be slow on first request
      }
    );

    const raw = response.data?.text?.trim();
    if (!raw) throw new Error('SILENT:Empty transcript');

    // Filter out ElevenLabs audio-event noise tags like (MUSIC), (Machine sound), etc.
    const transcript = raw
      .replace(/\(.*?\)/g, '')   // remove (anything in parens)
      .replace(/\[.*?\]/g, '')   // remove [anything in brackets]
      .replace(/\*.*?\*/g, '')   // remove *anything in asterisks*
      .trim();

    if (!transcript) throw new Error('SILENT:Only noise detected');

    // Reject suspiciously long transcripts (now 500+ chars for a full sentence)
    // which usually means TV/Movie sound is leaking through.
    if (transcript.length > 500) {
      console.warn(`[STT] ⚠ Sequence too long (${transcript.length}) — stripping as noise`);
      throw new Error('SILENT:Background media detected');
    }

    console.log(`[STT] ✅ "${transcript.substring(0, 80)}"`);
    return transcript;

  } catch (err) {
    if (err.response) {
      const detail = JSON.stringify(err.response.data);
      throw new Error(`[STT] ElevenLabs ${err.response.status}: ${detail}`);
    }
    throw new Error(`[STT] ${err.message}`);
  }
};

module.exports = { transcribeAudio };