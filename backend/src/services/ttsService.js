const synthesizeElevenLabs = async (text) => {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = 'Xb7hH8MSUJpSbSDYk0k2'; // Alice - Premium Multilingual

  console.log(`[TTS] [ElevenLabs] Synthesizing...`);

  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'xi-api-key': apiKey },
    body: JSON.stringify({
      text: text.trim(),
      model_id: 'eleven_flash_v2_5',
      voice_settings: { stability: 0.5, similarity_boost: 0.75 }
    })
  });

  if (!response.ok) throw new Error(`ElevenLabs Error: ${response.status}`);
  const buffer = await response.arrayBuffer();
  return Buffer.from(buffer).toString('base64');
};

const synthesizeSarvam = async (text) => {
  const apiKey = process.env.SARVAM_API_KEY;
  console.log(`[TTS] [Sarvam-Native] Synthesizing...`);

  const response = await fetch('https://api.sarvam.ai/text-to-speech', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'api-subscription-key': apiKey },
    body: JSON.stringify({
      inputs: [text.trim()],
      target_language_code: 'ta-IN',
      speaker: 'meera',
      model: 'bulbul:v1'
    })
  });

  if (!response.ok) throw new Error(`Sarvam TTS Error: ${response.status}`);
  const data = await response.json();
  return data.audios[0]; // Sarvam returns base64 directly in an array
};

const synthesizeSpeech = async (text, language) => {
  if (!text || text.trim() === '') throw new Error('TTS: No text provided');

  try {
    // HYBRID ROUTE: Tamil goes to Sarvam Native, others to ElevenLabs Flash
    if (language && language.toLowerCase().includes('ta')) {
      return await synthesizeSarvam(text);
    } else {
      return await synthesizeElevenLabs(text);
    }
  } catch (err) {
    console.error(`[TTS] Hybrid Strategy Failure:`, err.message);
    throw err;
  }
};

module.exports = { synthesizeSpeech };