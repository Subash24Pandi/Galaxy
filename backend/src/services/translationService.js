const translateText = async (text, sourceLang, targetLang) => {
  const apiKey = process.env.SARVAM_API_KEY;
  if (!apiKey || apiKey === 'your_sarvam_api_key') {
    throw new Error('SARVAM_API_KEY is missing');
  }

  const sarvamSource = sourceLang.includes('-IN') ? sourceLang : `${sourceLang}-IN`;
  const sarvamTarget = targetLang.includes('-IN') ? targetLang : `${targetLang}-IN`;

  // SPECIAL CASE: For Tamil, use LLM to ensure "Spoken/Colloquial" dialect
  if (sarvamTarget === 'ta-IN') {
    console.log(`[Translation] [Colloquial-Tamil] ${sarvamSource} → ${sarvamTarget}: "${text.substring(0, 30)}..."`);
    try {
      const response = await fetch('https://api.sarvam.ai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'api-subscription-key': apiKey },
        body: JSON.stringify({
          model: 'sarvam-30b',
          messages: [
            { role: 'system', content: 'Translate to SPOKEN, COLLOQUIAL TAMIL as used in daily casual conversation. Avoid formal literary terms (Thuya Tamil). Be natural.' },
            { role: 'user', content: text }
          ],
          temperature: 0.1
        })
      });
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      return content ? content.trim().replace(/^["']|["']$/g, '') : text;
    } catch (err) {
      console.warn('[Translation] Colloquial fallback failed, using NMT.');
    }
  }

  // STANDARD CASE: Fast NMT for other languages
  console.log(`[Translation] [NMT] ${sarvamSource} → ${sarvamTarget}: "${text.substring(0, 30)}..."`);

  try {
    const response = await fetch('https://api.sarvam.ai/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-subscription-key': apiKey },
      body: JSON.stringify({
        input: text.trim(),
        source_language_code: sarvamSource,
        target_language_code: sarvamTarget
      })
    });

    if (!response.ok) throw new Error(`NMT Error: ${response.status}`);

    const data = await response.json();
    const translatedText = data.translated_text;
    
    return (translatedText || text).trim().replace(/^["']|["']$/g, '');
  } catch (error) {
    console.error(`[Translation] Error:`, error.message);
    return text;
  }
};

module.exports = { translateText };