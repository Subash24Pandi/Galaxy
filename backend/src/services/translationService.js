/**
 * Translation Service — Sarvam AI ONLY (STRICT: no ElevenLabs, no OpenAI)
 *
 * Primary:  Sarvam NMT  /translate  (fast, neural machine translation)
 * Fallback: Sarvam LLM  /v1/chat/completions  (if NMT fails)
 *
 * Mode: modern-colloquial — spoken, casual, NOT formal
 */

const LANGUAGE_NAMES = {
  'en-IN':  'English',
  'hi-IN':  'Hindi',
  'ta-IN':  'Tamil',
  'te-IN':  'Telugu',
  'kn-IN':  'Kannada',
  'bn-IN':  'Bengali',
  'gu-IN':  'Gujarati',
  'mr-IN':  'Marathi',
  'ml-IN':  'Malayalam',
  'or-IN':  'Odiya',
  'as-IN':  'Assamese',
  'bho-IN': 'Bhojpuri',
};

// Normalize language code to Sarvam format (xx-IN)
const toSarvamCode = (lang) => {
  if (!lang) return 'en-IN';
  if (lang.includes('-IN')) return lang;
  return `${lang}-IN`;
};

/**
 * Strip <think>...</think> reasoning blocks from LLM output.
 * Sarvam-m is a reasoning model — it outputs CoT before the answer.
 */
const stripThinkTags = (text) => {
  if (!text) return text;
  // Remove full <think>...</think> blocks (including multiline)
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<think>[\s\S]*/gi, '')   // unclosed think tag
    .trim()
    .replace(/^["""'']|["""'']$/g, '')  // strip surrounding quotes
    .trim();
};

/**
 * Translate text from sourceLang → targetLang using Sarvam AI.
 * @param {string} text       - Source text (from STT)
 * @param {string} sourceLang - e.g. 'ta', 'hi-IN'
 * @param {string} targetLang - e.g. 'en', 'te-IN'
 * @returns {Promise<string>} - Translated colloquial text
 */
const translateText = async (text, sourceLang, targetLang) => {
  const apiKey = process.env.SARVAM_API_KEY;
  if (!apiKey) throw new Error('[Translation] SARVAM_API_KEY missing');

  const trimmed = text?.trim();
  if (!trimmed) return text;

  const src = toSarvamCode(sourceLang);
  const tgt = toSarvamCode(targetLang);

  // Skip if same language
  if (src === tgt) {
    console.log(`[Translation] Same language (${src}) — skipping`);
    return trimmed;
  }

  const targetName = LANGUAGE_NAMES[tgt] || tgt;
  console.log(`[Translation] ${src} → ${tgt}: "${trimmed.substring(0, 50)}..."`);

  // ── STEP 1: Sarvam NMT (Primary — fast neural translation) ──────────────────
  try {
    const nmtCtrl  = new AbortController();
    const nmtTimer = setTimeout(() => nmtCtrl.abort(), 6000); // 6s cap — fail fast
    const nmtRes = await fetch('https://api.sarvam.ai/translate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-subscription-key': apiKey,
      },
      body: JSON.stringify({
        input:                trimmed,
        source_language_code: src,
        target_language_code: tgt,
        mode:                 'formal',        // Use formal for higher precision as requested
        enable_preprocessing: true,
      }),
      signal: nmtCtrl.signal,
    });
    clearTimeout(nmtTimer);

    if (nmtRes.ok) {
      const nmtData = await nmtRes.json();
      if (nmtData.translated_text) {
        const result = nmtData.translated_text.trim();
        if (result) {
          console.log(`[Translation] NMT ✅ "${result.substring(0, 60)}"`);
          return result;
        }
      }
    }
  } catch (err) {
    console.warn('[Translation] NMT error:', err.message);
  }

  // ── STEP 2: Sarvam LLM Fallback (sarvam-m) ──────────────────────────────────
  // Note: we use a strict prompt to prevent model hallucinations
  console.log(`[Translation] NMT failed → LLM fallback for ${targetName}`);
  try {
    const llmCtrl  = new AbortController();
    const llmTimer = setTimeout(() => llmCtrl.abort(), 10000); // 10s cap
    const llmRes = await fetch('https://api.sarvam.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-subscription-key': apiKey,
      },
      body: JSON.stringify({
        model: 'sarvam-m',
        messages: [
          {
            role: 'system',
            content: `Translate the input exactly into ${targetName}.
- DO NOT add any extra meaning, notes, or creative interpretations.
- DO NOT hallucinate or add personal topics.
- ONLY output the translated text. No quotes. No reasoning.`,
          },
          {
            role: 'user',
            content: trimmed,
          },
        ],
        temperature: 0.01, // Near-zero for maximum accuracy
        max_tokens:  400,
      }),
      signal: llmCtrl.signal,
    });
    clearTimeout(llmTimer);

    if (llmRes.ok) {
      const llmData = await llmRes.json();
      const raw = llmData.choices?.[0]?.message?.content;
      if (raw) {
        // CRITICAL: strip <think>...</think> reasoning blocks before using
        const cleaned = stripThinkTags(raw);
        if (cleaned) {
          console.log(`[Translation] LLM ✅ "${cleaned.substring(0, 60)}"`);
          return cleaned;
        }
      }
    } else {
      const errBody = await llmRes.text();
      console.warn(`[Translation] LLM HTTP ${llmRes.status}: ${errBody.substring(0, 200)}`);
    }
  } catch (err) {
    console.warn('[Translation] LLM error:', err.message);
  }

  // ── Last resort: return original ────────────────────────────────────────────
  console.error('[Translation] All engines failed — returning original');
  return trimmed;
};

module.exports = { translateText };