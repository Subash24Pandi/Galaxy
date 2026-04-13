const fetch = require('node-fetch');

/**
 * Synthesizes speech using ElevenLabs API
 * @param {string} text The text to convert to speech
 * @param {string} language The language code (e.g. 'en-IN', 'hi-IN')
 * @returns {Promise<string>} Base64 encoded audio string
 */
const synthesizeSpeech = async (text, language) => {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error('ELEVENLABS_API_KEY is missing in your environment variables.');
  }

  // Common voice IDs
  // Rachel: 21m00Tcm4TlvDq8ikWAM
  // Josh: txL667pYf81YfWh74JtG
  const voiceId = '21m00Tcm4TlvDq8ikWAM'; 

  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'Accept': 'audio/mpeg',
      'Content-Type': 'application/json',
      'xi-api-key': apiKey
    },
    body: JSON.stringify({
      text: text,
      model_id: 'eleven_multilingual_v2', // Best for hi-IN, en-IN etc.
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75
      }
    })
  });

  if (!response.ok) {
    const errorBody = await response.text();
    // Catch the dreaded 403 Forbidden (Render IP Block)
    if (response.status === 403) {
      console.error('[TTS] ElevenLabs 403 Forbidden - Render IP is likely blocked.');
      throw new Error('ElevenLabs 403: Render IP addresses are currently blocked by ElevenLabs.');
    }
    throw new Error(`ElevenLabs API Error (${response.status}): ${errorBody}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  return buffer.toString('base64');
};

module.exports = { synthesizeSpeech };