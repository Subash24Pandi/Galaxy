const synthesizeSpeech = async (text, language) => {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey || apiKey === 'your_elevenlabs_api_key') {
    throw new Error('ELEVENLABS_API_KEY is missing');
  }

  if (!text || text.trim() === '') {
    throw new Error('TTS: No text provided');
  }

  // Sarah voice — multilingual capable
  const voiceId = 'EXAVITQu4vr4xnSDxMaL';

  console.log(`[TTS] Synthesizing ${text.length} chars in lang: ${language}`);

  // Use standard endpoint (NOT /stream) for reliable base64 return
  // Turbo model = lowest latency while still being high quality
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_64`, {
    method: 'POST',
    headers: {
      'Accept': 'audio/mpeg',
      'Content-Type': 'application/json',
      'xi-api-key': apiKey
    },
    body: JSON.stringify({
      text: text.trim(),
      model_id: 'eleven_turbo_v2_5',
      voice_settings: {
        stability: 0.4,
        similarity_boost: 0.75,
        style: 0.0
      }
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error(`[TTS] ElevenLabs Error: ${response.status}`, errText);
    throw new Error(`ElevenLabs TTS Error: ${response.status} - ${errText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString('base64');
  console.log(`[TTS] Success — audio size: ${base64.length} chars`);
  return base64;
};

module.exports = { synthesizeSpeech };