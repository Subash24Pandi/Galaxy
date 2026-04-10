const transcribeAudio = async (audioBase64, language) => {
  console.log(`[STT Service] Transcribing audio in ${language}`);

  const apiKey = process.env.SARVAM_API_KEY;

  if (!apiKey || apiKey === 'your_sarvam_api_key') {
    throw new Error('SARVAM_API_KEY is missing or invalid in .env');
  }

  if (process.env.USE_MOCKS === 'true') {
    throw new Error('USE_MOCKS is true in .env');
  }

  // Sarvam API strictly requires the '-IN' suffix (e.g., 'en-IN', 'hi-IN')
  const sarvamLang = language.includes('-IN') ? language : `${language}-IN`;

  const response = await fetch('https://api.sarvam.ai/speech-to-text', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-subscription-key': apiKey
    },
    body: JSON.stringify({
      audio_base64: audioBase64,
      language_code: sarvamLang
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Sarvam STT Error: ${response.status} - ${errText}`);
  }

  const data = await response.json();
  console.log('[STT Service] Full API response:', data);

  const resultText = data.transcript || data.text;

  if (!resultText) {
    throw new Error('Sarvam STT returned no transcript text');
  }

  console.log(`[STT Service] Real STT Success. Result: "${resultText}"`);
  return resultText;
};

module.exports = {
  transcribeAudio
};