const transcribeAudio = async (audioBase64, language) => {
  const apiKey = process.env.SARVAM_API_KEY;
  if (!apiKey || apiKey === 'your_sarvam_api_key') {
    throw new Error('SARVAM_API_KEY is missing');
  }

  // Ensure format is 'xx-IN'
  const sarvamLang = language.includes('-IN') ? language : `${language}-IN`;
  const audioBuffer = Buffer.from(audioBase64, 'base64');
  const audioBlob = new Blob([audioBuffer], { type: 'audio/wav' });
  
  const formData = new FormData();
  formData.append('file', audioBlob, 'audio.wav');
  formData.append('language_code', sarvamLang);
  formData.append('model', 'saaras:v3'); 

  const response = await fetch('https://api.sarvam.ai/speech-to-text', {
    method: 'POST',
    headers: { 'api-subscription-key': apiKey },
    body: formData
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error(`[STT] Sarvam Error ${response.status}:`, errText);
    throw new Error(`Sarvam STT Error: ${response.status} - ${errText}`);
  }

  const data = await response.json();
  const resultText = data.transcript !== undefined ? data.transcript : data.text;

  if (resultText === undefined || resultText === null) {
    throw new Error('Sarvam STT returned no transcript');
  }

  return resultText;
};

module.exports = { transcribeAudio };