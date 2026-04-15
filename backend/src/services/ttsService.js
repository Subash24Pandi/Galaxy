const synthesizeSpeech = async (text, language) => {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error('ELEVENLABS_API_KEY is missing');
  }

  if (!text || text.trim() === '') {
    throw new Error('TTS: No text provided');
  }

  const voiceId = 'Xb7hH8MSUJpSbSDYk0k2'; // Alice - Verified active on your account
  
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
    const base64 = Buffer.from(buffer).toString('base64');

    return base64;
  } catch (err) {
    console.error(`[TTS] Synthesis failure:`, err.message);
    throw err;
  }
};

module.exports = { synthesizeSpeech };