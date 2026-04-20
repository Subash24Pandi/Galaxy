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

// ── In-Memory Session Cache for Background Processing ──────────────────────
const sessionState = new Map();

/**
 * Main Audio Processing Pipeline
 * Handle background transcription (while speaking) and finalization (on Mic Off).
 */
const handleAudioUtterance = async (req, res) => {
  const { sessionId, role, clientId, audioBase64, inputLang, outputLang, isFinal } = req.body;
  const io = req.app.get('io');

  if (!sessionId || !role || !audioBase64) {
    return res.status(400).json({ success: false, message: 'Missing fields' });
  }

  const room       = `session-${sessionId}`;
  const targetRole = role === 'agent' ? 'customer' : 'agent';
  const stateKey   = `${sessionId}-${role}`;
  
  if (!sessionState.has(stateKey)) {
    sessionState.set(stateKey, { processedText: '', audioQueue: [], lastSentIndex: 0 });
  }
  const state = sessionState.get(stateKey);

  // Respond immediately
  res.json({ success: true, message: isFinal ? 'Finalizing...' : 'Transcribing...' });

  try {
    await createSession(sessionId).catch(() => {});

    // ── STEP 1: STT (Background or Final) ──────────────────────────────────
    const audioBuffer = Buffer.from(audioBase64, 'base64');
    const fullTranscript = await sttService.transcribeAudio(audioBuffer, inputLang);

    if (!fullTranscript || fullTranscript.trim() === '') return;

    // Find what's new in the transcript
    const currentText = fullTranscript.trim();
    const newText = currentText.slice(state.processedText.length).trim();

    if (newText.length > 0) {
      // ── STEP 2: Incremental Synthesis (Background) ───────────────────────
      // We look for completed sentences to synthesize in the background
      const sentences = newText.split(/(?<=[.!?।])\s+/).map(s => s.trim()).filter(s => s.length > 1);
      
      // If not final, we only process sentences that are definitely finished (ends with punctuation)
      const toProcess = isFinal ? sentences : sentences.filter(s => /[.!?।]$/.test(s));

      for (const sentence of toProcess) {
        try {
          console.log(`[Pipeline] ⚡ Background Synthesizing: "${sentence}"`);
          const translated = await translationService.translateText(sentence, inputLang, outputLang);
          if (translated) {
            const audio = await ttsService.synthesizeSpeech(translated, outputLang);
            state.audioQueue.push({ translated, audio });
            state.processedText += (state.processedText ? ' ' : '') + sentence;
          }
        } catch (err) {
          console.warn('[Pipeline] Background synth error:', err.message);
        }
      }

      // Update UI with current transcript
      io.to(room).emit('transcript_update', {
        role,
        phase: 'transcribing',
        originalText: currentText,
        timestamp: new Date().toISOString(),
      });
    }

    // ── STEP 3: Finalization (On Mic Off) ───────────────────────────────────
    if (isFinal) {
      console.log(`[Pipeline] 🔴 FINALIZING session ${sessionId} | Queue size: ${state.audioQueue.length}`);
      
      // Process any remaining text that didn't end in punctuation
      const remaining = currentText.slice(state.processedText.length).trim();
      if (remaining.length > 0) {
        try {
          const translated = await translationService.translateText(remaining, inputLang, outputLang);
          if (translated) {
            const audio = await ttsService.synthesizeSpeech(translated, outputLang);
            state.audioQueue.push({ translated, audio });
          }
        } catch (err) { console.warn('[Pipeline] Final bit synth error:', err.message); }
      }

      const fullOriginal = currentText;
      const fullTranslated = state.audioQueue.map(q => q.translated).join(' ');

      // Final UI Update
      io.to(room).emit('transcript_update', {
        role,
        phase: 'translated',
        originalText: fullOriginal,
        translatedText: fullTranslated,
        timestamp: new Date().toISOString(),
      });

      // Flush ALL buffered audio to the other end immediately
      for (const item of state.audioQueue) {
        io.to(room).emit('audio_playback', {
          senderRole:  role,
          clientId:    clientId,
          targetRole,
          audioBase64: item.audio,
          format:      'mp3',
          language:    outputLang,
          translatedText: item.translated,
          timestamp:   new Date().toISOString(),
        });
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
