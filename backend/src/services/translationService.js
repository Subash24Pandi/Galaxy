const LANGUAGE_NAMES = {
  'hi-IN': 'HINDI',
  'ta-IN': 'TAMIL',
  'te-IN': 'TELUGU',
  'kn-IN': 'KANNADA',
  'bn-IN': 'BENGALI',
  'gu-IN': 'GUJARATI',
  'mr-IN': 'MARATHI',
  'or-IN': 'ODIYA',
  'as-IN': 'ASSAMESE',
  'bho-IN': 'BHOJPURI',
  'en-IN': 'ENGLISH'
};

const translateText = async (text, sourceLang, targetLang) => {
  const apiKey = process.env.SARVAM_API_KEY;
  if (!apiKey || apiKey === 'your_sarvam_api_key') throw new Error('SARVAM_API_KEY is missing');

  const sarvamSource = sourceLang.includes('-IN') ? sourceLang : `${sourceLang}-IN`;
  const sarvamTarget = targetLang.includes('-IN') ? targetLang : `${targetLang}-IN`;

  // Always use high-quality LLM for Indian regional languages
  const targetName = LANGUAGE_NAMES[sarvamTarget];
  
  if (targetName) {
    console.log(`[Translation] [Universal] ${sarvamSource} → ${targetName}: "${text.substring(0, 30)}..."`);
    try {
      const response = await fetch('https://api.sarvam.ai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'api-subscription-key': apiKey },
        body: JSON.stringify({
          model: 'sarvam-30b',
          messages: [
            { role: 'system', content: `Translate to SPOKEN, COLLOQUIAL ${targetName}. Return ONLY THE TRANSLATION in the NATIVE SCRIPT. NEVER use English letters for the translation. Do NOT explain. Do NOT give multiple versions. No notes. No labels.` },
            { role: 'user', content: text }
          ],
          temperature: 0.1
        })
      });
      
      const data = await response.json();
      let content = data.choices?.[0]?.message?.content;
      if (content) {
        return content.trim()
          .replace(/^["']|["']$/g, '') 
          .replace(/\(.*\)/g, '')      
          .replace(/Note:.*$/gi, '')   
          .replace(/[A-Z]:\s/g, '')    
          .trim();
      }
    } catch (err) {
      console.warn(`[Translation] LLM failed for ${targetName}, falling back to NMT.`);
    }
  }

  // STANDARD CASE: Fast NMT (Failover)
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
    const data = await response.json();
    return (data.translated_text || text).trim().replace(/^["']|["']$/g, '');
  } catch (error) {
    console.error(`[Translation] Final Error:`, error.message);
    return text;
  }
};

module.exports = { translateText };