const sttService         = require('../services/sttService');
const translationService = require('../services/translationService');
const ttsService         = require('../services/ttsService');
const { saveMessage, createSession } = require('../models/sessionModel');

const sessionState = new Map();
const processingLocks = new Set(); // Concurrency lock to prevent duplicate sentences

/**
 * Main Audio Processing Pipeline
 * Handles background transcription and finalization with concurrency protection.
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
  
  // ── CONCURRENCY LOCK ──
  // Wait if this session/role is already being processed to avoid race conditions
  while (processingLocks.has(stateKey)) {
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  processingLocks.add(stateKey);

  try {
    if (!sessionState.has(stateKey)) {
      sessionState.set(stateKey, { processedText: '', audioQueue: [] });
    }
    const state = sessionState.get(stateKey);

    // Respond immediately
    res.json({ success: true, message: isFinal ? 'Finalizing...' : 'Transcribing...' });
    const startTime = Date.now();

    await createSession(sessionId).catch(() => {});

    // ── STEP 1: STT ──────────────────────────────────────────────────────────
    const audioBuffer = Buffer.from(audioBase64, 'base64');
    const fullTranscript = await sttService.transcribeAudio(audioBuffer, inputLang);

    if (!fullTranscript || fullTranscript.trim() === '') return;

    // Find what's new in the transcript
    const currentText = fullTranscript.trim();
    const newText = currentText.slice(state.processedText.length).trim();

    if (newText.length > 0) {
      // ── STEP 2: Incremental Synthesis ────────────────────────────────────
      const sentences = newText.split(/(?<=[.!?।])\s+/).map(s => s.trim()).filter(s => s.length > 1);
      const toProcess = isFinal ? sentences : sentences.filter(s => /[.!?।]$/.test(s));

      for (const sentence of toProcess) {
        try {
          // Double-check processedText to prevent duplicates
          if (state.processedText.toLowerCase().includes(sentence.toLowerCase())) continue;

          console.log(`[Pipeline] ⚡ Processing: "${sentence}"`);
          const translated = await translationService.translateText(sentence, inputLang, outputLang);
          if (translated) {
            const audio = await ttsService.synthesizeSpeech(translated, outputLang);
            state.audioQueue.push({ translated, audio });
            state.processedText += (state.processedText ? ' ' : '') + sentence;
          }
        } catch (err) {
          console.warn('[Pipeline] Synth error:', err.message);
        }
      }

      // Update UI with growing transcript
      io.to(room).emit('transcript_update', {
        role,
        phase: 'transcribing',
        originalText: currentText,
        timestamp: new Date().toISOString(),
      });
    }

    // ── STEP 3: Finalization (On Mic Off) ───────────────────────────────────
    if (isFinal) {
      console.log(`[Pipeline] 🔴 FINALIZING | session=${sessionId} | Queue=${state.audioQueue.length}`);
      
      const remaining = currentText.slice(state.processedText.length).trim();
      if (remaining.length > 0) {
        try {
          const translated = await translationService.translateText(remaining, inputLang, outputLang);
          if (translated) {
            const audio = await ttsService.synthesizeSpeech(translated, outputLang);
            state.audioQueue.push({ translated, audio });
            state.processedText += (state.processedText ? ' ' : '') + remaining;
          }
        } catch (err) { console.warn('[Pipeline] Final bit error:', err.message); }
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

      // Flush all buffered audio
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

      sessionState.delete(stateKey);

      saveMessage({
        sessionId,
        senderRole: role,
        originalText: fullOriginal,
        originalLang: inputLang,
        translatedText: fullTranslated,
        translatedLang: outputLang,
      }).catch(() => {});

      console.log(`[Pipeline] ✅ Complete in ${Date.now() - startTime}ms`);
    }

  } catch (error) {
    console.error(`[Pipeline] ❌ Fatal Error: ${error.message}`);
  } finally {
    processingLocks.delete(stateKey);
  }
};

module.exports = { handleAudioUtterance };
