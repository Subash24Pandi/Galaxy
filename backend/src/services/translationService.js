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
        mode:                 'modern-colloquial',
        enable_preprocessing: true,
      }),
      signal: nmtCtrl.signal,
    });
    clearTimeout(nmtTimer);

    if (nmtRes.ok) {
      const nmtData = await nmtRes.json();
      if (nmtData.translated_text) {
        const result = nmtData.translated_text.trim().replace(/^["""'']|["""'']$/g, '');
        if (result) {
          console.log(`[Translation] NMT ✅ "${result.substring(0, 60)}"`);
          return result;
        }
      } else {
        console.warn('[Translation] NMT returned no translated_text:', JSON.stringify(nmtData).substring(0, 200));
      }
    } else {
      const errBody = await nmtRes.text();
      console.warn(`[Translation] NMT HTTP ${nmtRes.status}: ${errBody.substring(0, 200)}`);
    }
  } catch (err) {
    console.warn('[Translation] NMT error:', err.message);
  }

  // ── STEP 2: Sarvam LLM Fallback (sarvam-m) ──────────────────────────────────
  // Note: sarvam-m is a reasoning model — MUST strip <think> tags from output
  console.log(`[Translation] NMT failed → LLM fallback for ${targetName}`);
  try {
    const llmCtrl  = new AbortController();
    const llmTimer = setTimeout(() => llmCtrl.abort(), 12000); // 12s cap
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
            content: `You are a real-time spoken language interpreter translating into ${targetName}.

RULES (follow strictly):
1. Translate MEANING-FOR-MEANING — do not add, remove, or change what was said.
2. Use natural, conversational ${targetName} as a native speaker would say it in a live call.
3. Preserve the original tone: if casual → casual, if formal → formal.
4. Fix obvious voice-to-text transcription errors in the input before translating.
5. If the input is just background noise, music lyrics, repetitive nonsense, or doesn't seem like actual human conversation, return an EMPTY STRING.
6. Output ONLY the ${targetName} translation. No quotes, no explanations, no extra text.`,
          },
          {
            role: 'user',
            content: trimmed,
          },
        ],
        temperature: 0.01,
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