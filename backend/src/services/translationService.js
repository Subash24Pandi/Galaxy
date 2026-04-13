const translateText = async (text, sourceLang, targetLang) => {
  const apiKey = process.env.SARVAM_API_KEY;
  if (!apiKey || apiKey === 'your_sarvam_api_key') {
    throw new Error('SARVAM_API_KEY is missing');
  }

  const sarvamSource = sourceLang.includes('-IN') ? sourceLang : `${sourceLang}-IN`;
  const sarvamTarget = targetLang.includes('-IN') ? targetLang : `${targetLang}-IN`;

  // If source and target are the same, skip translation 
  if (sarvamSource === sarvamTarget) {
    console.log(`[Translation] Same language (${sarvamSource}), skipping translation.`);
    return text;
  }

  console.log(`[Translation] ${sarvamSource} → ${sarvamTarget}: "${text.substring(0, 60)}..."`);

  const response = await fetch('https://api.sarvam.ai/translate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-subscription-key': apiKey
    },
    body: JSON.stringify({
      input: text,
      source_language_code: sarvamSource,
      target_language_code: sarvamTarget,
      mode: 'formal',
      enable_preprocessing: false
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error(`[Translation] Sarvam Error ${response.status}:`, errText);
    throw new Error(`Sarvam Translation Error: ${response.status} - ${errText}`);
  }

  const data = await response.json();
  const resultText = data.translated_text || data.text;

  if (!resultText) {
    throw new Error('Sarvam Translation returned empty result');
  }

  console.log(`[Translation] Result: "${resultText.substring(0, 60)}..."`);
  return resultText;
};

module.exports = { translateText };