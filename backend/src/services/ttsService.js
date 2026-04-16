const synthesizeSpeech = async (text, language) => {
  if (!text || text.trim() === '') throw new Error('TTS: No text provided');

  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = 'Xb7hH8MSUJpSbSDYk0k2'; // Alice - Premium Multilingual

  console.log(`[TTS] [ElevenLabs] Synthesizing speech for ${language}...`);

  try {
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': apiKey
      },
      body: JSON.stringify({
        text: text.trim(),
        model_id: 'eleven_flash_v2_5',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75
        }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[TTS] ElevenLabs Error: ${response.status}`, errText);
      throw new Error(`ElevenLabs Error: ${response.status} - ${errText}`);
    }

    const buffer = await response.arrayBuffer();
    return Buffer.from(buffer).toString('base64');
  } catch (err) {
    console.error(`[TTS] Synthesis failure:`, err.message);
    throw err;
  }
};

module.exports = { synthesizeSpeech };