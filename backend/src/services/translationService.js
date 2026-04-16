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
  const targetName = LANGUAGE_NAMES[sarvamTarget] || sarvamTarget;

  console.log(`[Translation] [NMT] ${sarvamSource} → ${sarvamTarget}: "${text.substring(0, 40)}..."`);

  // STEP 1: Reliable NMT translation (primary engine — handles all Indian script pairs)
  let nmtResult = null;
  try {
    const nmtResponse = await fetch('https://api.sarvam.ai/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-subscription-key': apiKey },
      body: JSON.stringify({
        input: text.trim(),
        source_language_code: sarvamSource,
        target_language_code: sarvamTarget,
        mode: 'colloquial',
        enable_preprocessing: true
      })
    });
    const nmtData = await nmtResponse.json();
    if (nmtData.translated_text) {
      nmtResult = nmtData.translated_text.trim().replace(/^["']|["']$/g, '');
      console.log(`[Translation] [NMT] ✅ Success: "${nmtResult.substring(0, 40)}..."`);
    }
  } catch (err) {
    console.warn('[Translation] NMT failed:', err.message);
  }

  // If NMT succeeded, return it — it's already colloquial with enable_preprocessing
  if (nmtResult) return nmtResult;

  // STEP 2: LLM fallback (only if NMT fails completely)
  console.log(`[Translation] [LLM Fallback] Trying sarvam-30b for ${targetName}...`);
  try {
    const llmResponse = await fetch('https://api.sarvam.ai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-subscription-key': apiKey },
      body: JSON.stringify({
        model: 'sarvam-30b',
        messages: [
          { role: 'system', content: `You are a translator. Translate the following text to spoken, colloquial ${targetName}. Return ONLY the translation in native ${targetName} script. No explanations.` },
          { role: 'user', content: text }
        ],
        temperature: 0.1
      })
    });
    const llmData = await llmResponse.json();
    const content = llmData.choices?.[0]?.message?.content?.trim();
    if (content) return content.replace(/^["']|["']$/g, '').trim();
  } catch (err) {
    console.warn('[Translation] LLM fallback also failed:', err.message);
  }

  // Final fallback: return original text
  return text;
};

module.exports = { translateText };