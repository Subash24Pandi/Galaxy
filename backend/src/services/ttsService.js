const synthesizeSpeech = async (text, language) => {
  const apiKey = process.env.SARVAM_API_KEY;
  if (!apiKey || apiKey === 'your_sarvam_api_key') {
    throw new Error('SARVAM_API_KEY is missing');
  }

  if (!text || text.trim() === '') {
    throw new Error('TTS: No text provided');
  }

  // Ensure format is 'xx-IN'
  const sarvamLang = language.includes('-IN') ? language : `${language}-IN`;

  console.log(`[TTS] Synthesizing ${text.length} chars in lang: ${sarvamLang} (Sarvam AI)`);

  const response = await fetch('https://api.sarvam.ai/text-to-speech', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-subscription-key': apiKey
    },
    body: JSON.stringify({
      inputs: [text.trim()],
      target_language_code: sarvamLang,
      speaker: 'meera',
      model_variant: 'v1',
      speech_sample_rate: 16000
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error(`[TTS] Sarvam TTS Error: ${response.status}`, errText);
    throw new Error(`Sarvam TTS Error: ${response.status} - ${errText}`);
  }

  const data = await response.json();
  const base64 = data.audios[0]; // Sarvam returns an array of base64 strings

  if (!base64) {
    throw new Error('Sarvam TTS returned empty audio list');
  }

  console.log(`[TTS] Success — audio size: ${base64.length} chars`);
  return base64;
};

module.exports = { synthesizeSpeech };