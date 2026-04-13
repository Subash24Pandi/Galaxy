const axios = require('axios');
const FormData = require('form-data');

const transcribeAudio = async (audioBase64, language) => {
  const apiKey = process.env.SARVAM_API_KEY;
  if (!apiKey || apiKey === 'your_sarvam_api_key') {
    throw new Error('SARVAM_API_KEY is missing');
  }

  try {
    const audioBuffer = Buffer.from(audioBase64, 'base64');
    const sarvamLang = language.includes('-IN') ? language : `${language}-IN`;
    
    const formData = new FormData();
    formData.append('file', audioBuffer, {
      filename: 'audio.wav',
      contentType: 'audio/wav',
    });
    formData.append('language_code', sarvamLang);
    formData.append('model', 'saaras:v3');

    const response = await axios.post('https://api.sarvam.ai/speech-to-text', formData, {
      headers: {
        ...formData.getHeaders(),
        'api-subscription-key': apiKey,
      },
    });

    const resultText = response.data.transcript || response.data.text;
    if (!resultText) {
      throw new Error('Sarvam STT returned no transcript');
    }

    return resultText;
  } catch (error) {
    const errDetail = error.response ? JSON.stringify(error.response.data) : error.message;
    console.error(`[STT] Sarvam API Error:`, errDetail);
    throw new Error(`Sarvam STT Failed: ${errDetail}`);
  }
};

module.exports = { transcribeAudio };