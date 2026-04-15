const translateText = async (text, sourceLang, targetLang) => {
  const apiKey = process.env.SARVAM_API_KEY;
  if (!apiKey || apiKey === 'your_sarvam_api_key') {
    throw new Error('SARVAM_API_KEY is missing');
  }

  // Ensure format is 'xx-IN' for Sarvam NMT
  const sarvamSource = sourceLang.includes('-IN') ? sourceLang : `${sourceLang}-IN`;
  const sarvamTarget = targetLang.includes('-IN') ? targetLang : `${targetLang}-IN`;

  console.log(`[Translation] [NMT] ${sarvamSource} → ${sarvamTarget}: "${text.substring(0, 60)}..."`);

  try {
    const response = await fetch('https://api.sarvam.ai/translate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-subscription-key': apiKey
      },
      body: JSON.stringify({
        input: text.trim(),
        source_language_code: sarvamSource,
        target_language_code: sarvamTarget
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Sarvam NMT Error: ${response.status} - ${errText}`);
    }

    const data = await response.json();
    const translatedText = data.translated_text;
    
    if (!translatedText) {
      console.warn('[Translation] NMT returned empty content');
      return text;
    }

    let resultText = translatedText.trim();
    
    // Remove any quotes added by the AI
    resultText = resultText.replace(/^["']|["']$/g, '');

    return resultText || text;
  } catch (error) {
    console.error(`[Translation] Error:`, error.message);
    return text;
  }
};

module.exports = { translateText };