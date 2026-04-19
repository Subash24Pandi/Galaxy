/**
 * Audio Controller — Real-time STT → Translate → TTS streaming pipeline
 * 
 * Architecture:
 *  1. Receive audio chunk (base64 WAV) from client via HTTP POST
 *  2. ElevenLabs STT → transcript
 *  3. Sarvam NMT → translation (colloquial)
 *  4. ElevenLabs TTS → synthesized audio (base64)
 *  5. Push transcript + audio to the correct peer via Socket.io
 * 
 * The pipeline is STT→Translate→TTS all within one request.
 * Low latency is achieved by:
 *   - Fast VAD chunking on the client (1-2s chunks)
 *   - Immediate parallel STT + translation (where possible)
 *   - ElevenLabs optimize_streaming_latency=4
 */

const sttService         = require('../services/sttService');
const translationService = require('../services/translationService');
const ttsService         = require('../services/ttsService');
const { saveMessage, createSession } = require('../models/sessionModel');

/**
 * Handle a single audio utterance chunk from a speaker.
 * Emits translated audio + transcript to the session room.
 */
const handleAudioUtterance = async (req, res) => {
  const { sessionId, role, audioBase64, inputLang, outputLang } = req.body;
  const io = req.app.get('io');

  // ── Validation ──────────────────────────────────────────────────────────────
  if (!sessionId || !role || !audioBase64) {
    return res.status(400).json({ 
      success: false, 
      message: 'Missing required fields: sessionId, role, audioBase64' 
    });
  }
  if (!inputLang || !outputLang) {
    return res.status(400).json({ 
      success: false, 
      message: 'Missing language config: inputLang, outputLang' 
    });
  }

  const room       = `session-${sessionId}`;
  const targetRole = role === 'agent' ? 'customer' : 'agent';
  const startTime  = Date.now();

  // Respond immediately so client can capture next chunk (non-blocking UX)
  res.json({ success: true, message: 'Processing audio chunk...' });

  console.log(`\n[Pipeline] ▶ ${role.toUpperCase()} | session=${sessionId} | ${inputLang} → ${outputLang}`);

  try {
    // Ensure session exists
    await createSession(sessionId).catch(() => {}); // silent if already exists

    // ── STEP 1: STT — ElevenLabs Speech-to-Text ─────────────────────────────
    const sttStart   = Date.now();
    const audioBuffer = Buffer.from(audioBase64, 'base64');
    const originalText = await sttService.transcribeAudio(audioBuffer, inputLang);
    const sttMs = Date.now() - sttStart;
    
    console.log(`[Pipeline] STT ✅ ${sttMs}ms: "${originalText.substring(0, 60)}"`);

    if (!originalText || originalText.trim().length < 1) {
      console.warn('[Pipeline] STT returned empty — skipping pipeline');
      io.to(room).emit('session_status', { message: 'Could not understand audio. Try again.' });
      return;
    }

    // Emit immediate transcript feedback (speaker sees their own text right away)
    io.to(room).emit('transcript_update', {
      role,
      phase:        'transcribing',
      originalText,
      translatedText: null,
      timestamp:    new Date().toISOString(),
    });

    // ── STEP 2: Translation — Sarvam AI ─────────────────────────────────────
    const transStart    = Date.now();
    const translatedText = await translationService.translateText(originalText, inputLang, outputLang);
    const transMs = Date.now() - transStart;

    // Safety guard: reject if think tags leaked through OR translation is empty (noise filter)
    if (!translatedText || translatedText.trim() === '' || translatedText.toLowerCase().includes('<think>')) {
      console.warn('[Pipeline] Translation empty or invalid (noise filter) — aborting');
      return;
    }
    // Trim translation to max 1000 chars for TTS (prevents truncation for long speech)
    const ttsText = translatedText.length > 1000
      ? translatedText.substring(0, 1000).replace(/[,.]?$/, '…')
      : translatedText;

    console.log(`[Pipeline] Translation ✅ ${transMs}ms: "${ttsText.substring(0, 60)}"`);

    // Update transcript with final translation (one bubble)
    io.to(room).emit('transcript_update', {
      role,
      phase:        'translated',
      originalText,
      translatedText,
      timestamp:    new Date().toISOString(),
    });

    // ── STEP 3: TTS — Sentence-level Streaming for Low Latency ────────────────
    // We split the full text into sentences and synthesize each one immediately.
    // This allows the first sentence to play while the others are still generating.
    const sentences = ttsText
      .split(/(?<=[.!?।])\s+/)
      .map(s => s.trim())
      .filter(s => s.length > 1);

    console.log(`[Pipeline] TTS streaming ${sentences.length} sentences...`);

    for (const sentence of sentences) {
      try {
        const sentenceAudio = await ttsService.synthesizeSpeech(sentence, outputLang);
        io.to(room).emit('audio_playback', {
          senderRole:  role,
          targetRole,
          audioBase64: sentenceAudio,
          format:      'mp3',
          language:    outputLang,
          translatedText: sentence,
          timestamp:   new Date().toISOString(),
        });
        console.log(`[Pipeline] Sent TTS chunk: "${sentence.substring(0, 30)}..."`);
      } catch (ttsErr) {
        console.error(`[Pipeline] TTS chunk failed: ${ttsErr.message}`);
      }
    }

    console.log(`[Pipeline] ✅ All chunks sent | total=${Date.now() - startTime}ms`);

    // ── STEP 5: Persist to DB (non-blocking) ────────────────────────────────
    saveMessage({
      sessionId,
      senderRole:     role,
      originalText,
      originalLang:   inputLang,
      translatedText,
      translatedLang: outputLang,
    }).catch(dbErr => console.warn('[Pipeline] DB persist failed:', dbErr.message));

  } catch (error) {
    const isSilent = error.message.startsWith('SILENT:');
    const displayMsg = error.message.replace('SILENT:', '').trim();

    if (isSilent) {
      console.log(`[Pipeline] (Quiet Skip) ${displayMsg}`);
    } else {
      console.error(`[Pipeline] ❌ Error: ${error.message}`);
      io.to(room).emit('session_status', {
        message: `⚠️ Pipeline error: ${displayMsg.replace('[STT]', '').replace('[TTS]', '').replace('[Translation]', '').trim()}`,
        type: 'error',
      });
    }
  }
};

module.exports = { handleAudioUtterance };
