const translateText = async (text, sourceLang, targetLang) => {
  console.log(`[Translation Service] Translating from ${sourceLang} to ${targetLang}`);

  const apiKey = process.env.SARVAM_API_KEY;

  if (!apiKey || apiKey === 'your_sarvam_api_key') {
    throw new Error('SARVAM_API_KEY is missing or invalid in .env');
  }

  if (process.env.USE_MOCKS === 'true') {
    throw new Error('USE_MOCKS is true in .env');
  }

  // Sarvam API strictly requires the '-IN' suffix (e.g., 'en-IN', 'hi-IN')
  const sarvamSource = sourceLang.includes('-IN') ? sourceLang : `${sourceLang}-IN`;
  const sarvamTarget = targetLang.includes('-IN') ? targetLang : `${targetLang}-IN`;

  const response = await fetch('https://api.sarvam.ai/translate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-subscription-key': apiKey
    },
    body: JSON.stringify({
      input: text,
      source_language_code: sarvamSource,
      target_language_code: sarvamTarget
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Sarvam Translation Error: ${response.status} - ${errText}`);
  }

  const data = await response.json();
  console.log('[Translation Service] Full API response:', data);

  const resultText = data.translated_text || data.text;

  if (!resultText) {
    throw new Error('Sarvam Translation returned no translated text');
  }

  console.log(`[Translation Service] Real Translation Success. Result: "${resultText}"`);
  return resultText;
};

module.exports = {
  translateText
};