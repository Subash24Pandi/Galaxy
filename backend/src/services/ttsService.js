const synthesizeElevenLabs = async (text, language) => {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = 'Xb7hH8MSUJpSbSDYk0k2'; // Alice - Premium Multilingual

  console.log(`[TTS] [ElevenLabs] Synthesizing speech for ${language}...`);

  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?optimize_streaming_latency=4`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': apiKey
    },
    body: JSON.stringify({
      text: text.trim(),
      model_id: 'eleven_flash_v2_5',
      voice_settings: {
        stability: 0.3,
        similarity_boost: 0.5
      }
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`ElevenLabs Error: ${response.status} - ${errText}`);
  }

  const buffer = await response.arrayBuffer();
  return Buffer.from(buffer).toString('base64');
};

const synthesizeSarvam = async (text, language) => {
  const apiKey = process.env.SARVAM_API_KEY;
  console.log(`[TTS] [Sarvam-Native] Synthesizing speech for ${language}...`);

  const sarvamLang = language.includes('-IN') ? language : `${language}-IN`;

  const response = await fetch('https://api.sarvam.ai/text-to-speech', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'api-subscription-key': apiKey },
    body: JSON.stringify({
      inputs: [text.trim()],
      target_language_code: sarvamLang,
      speaker: 'meera',
      pitch: 0,
      pace: 1.0,
      loudness: 1.5,
      speech_sample_rate: 8000,
      enable_preprocessing: true,
      model: 'bulbul:v1'
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Sarvam TTS Error: ${response.status} - ${errText}`);
  }
  
  const data = await response.json();
  return data.audios[0];
};

const synthesizeSpeech = async (text, language) => {
  if (!text || text.trim() === '') throw new Error('TTS: No text provided');

  const lowerLang = (language || 'en-IN').toLowerCase();
  
  // Advanced Routing: Sarvam is used for languages not yet optimized in ElevenLabs Multilingual
  const isSarvamSpecialty = lowerLang.includes('or') || lowerLang.includes('as') || lowerLang.includes('bho');

  try {
    if (isSarvamSpecialty) {
      return await synthesizeSarvam(text, language);
    } else {
      return await synthesizeElevenLabs(text, language);
    }
  } catch (err) {
    console.error(`[TTS] Universal Routing failure:`, err.message);
    throw err;
  }
};

module.exports = { synthesizeSpeech };