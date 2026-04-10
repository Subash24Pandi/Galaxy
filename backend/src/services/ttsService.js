const synthesizeSpeech = async (text, language) => {
  console.log(`[TTS Service] Synthesizing speech for ${language}`);

  const apiKey = process.env.ELEVENLABS_API_KEY;

  if (!apiKey || apiKey === 'your_elevenlabs_api_key') {
    throw new Error('ELEVENLABS_API_KEY is missing or invalid in .env');
  }

  if (process.env.USE_MOCKS === 'true') {
    throw new Error('USE_MOCKS is true in .env');
  }

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
      model_id: 'eleven_multilingual_v2',
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.5
      }
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`ElevenLabs TTS Error: ${response.status} - ${errText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  console.log(`[TTS Service] Real TTS Success`);

  return buffer.toString('base64');
};

module.exports = {
  synthesizeSpeech
};