const sttService         = require('../services/sttService');
const translationService = require('../services/translationService');
const ttsService         = require('../services/ttsService');
const { saveMessage, createSession } = require('../models/sessionModel');

const sessionState = new Map();
const processingLocks = new Set(); 

/**
 * Main Audio Processing Pipeline
 * Optimized for "No Splitting" + "Full Context" + "Instant Mic Off Playback"
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
  
  while (processingLocks.has(stateKey)) {
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  processingLocks.add(stateKey);

  try {
    if (!sessionState.has(stateKey)) {
      sessionState.set(stateKey, { processedText: '', audioQueue: [] });
    }
    const state = sessionState.get(stateKey);

    res.json({ success: true, message: isFinal ? 'Finalizing...' : 'Transcribing...' });
    const startTime = Date.now();

    await createSession(sessionId).catch(() => {});

    // ── STEP 1: STT ──────────────────────────────────────────────────────────
    const audioBuffer = Buffer.from(audioBase64, 'base64');
    const fullTranscript = await sttService.transcribeAudio(audioBuffer, inputLang);

    if (!fullTranscript || fullTranscript.trim() === '') return;

    // Find NEW text by stripping what we already processed
    const currentText = fullTranscript.trim();
    const newText = currentText.slice(state.processedText.length).trim();

    if (newText.length > 0) {
      // ── STEP 2: Incremental Synthesis ────────────────────────────────────
      const sentences = newText.split(/(?<=[.!?।])\s+/).map(s => s.trim()).filter(s => s.length > 1);
      
      // Background mode: only process sentences that end in punctuation
      // Final mode: process EVERYTHING remaining
      const toProcess = isFinal ? sentences : sentences.filter(s => /[.!?।]$/.test(s));

      for (const sentence of toProcess) {
        try {
          // Double-check to avoid reprocessing if Sarvam slightly changed the previous text
          if (state.processedText.includes(sentence)) continue;

          console.log(`[Pipeline] ⚡ Pre-synthesizing: "${sentence}"`);
          const translated = await translationService.translateText(sentence, inputLang, outputLang);
          if (translated) {
            const audio = await ttsService.synthesizeSpeech(translated, outputLang);
            state.audioQueue.push({ translated, audio });
            state.processedText += (state.processedText ? ' ' : '') + sentence;

            // Emit to client for buffering
            io.to(room).emit('audio_playback', {
              senderRole:  role,
              clientId:    clientId,
              targetRole,
              audioBase64: audio,
              format:      'mp3',
              language:    outputLang,
              translatedText: translated,
              bufferOnly:  true,
              timestamp:   new Date().toISOString(),
            });
          }
        } catch (err) { console.warn('[Pipeline] Synth error:', err.message); }
      }

      // Update UI (Single growing bubble)
      io.to(room).emit('transcript_update', {
        role,
        phase: 'transcribing',
        originalText: currentText,
        timestamp: new Date().toISOString(),
      });
    }

    // ── STEP 3: Finalization ───────────────────────────────────────────────
    if (isFinal) {
      console.log(`[Pipeline] 🔴 FINALIZING | session=${sessionId}`);
      
      const remaining = currentText.slice(state.processedText.length).trim();
      if (remaining.length > 0) {
        try {
          const translated = await translationService.translateText(remaining, inputLang, outputLang);
          if (translated) {
            const audio = await ttsService.synthesizeSpeech(translated, outputLang);
            state.audioQueue.push({ translated, audio });
            
            io.to(room).emit('audio_playback', {
              senderRole:  role,
              clientId:    clientId,
              targetRole,
              audioBase64: audio,
              format:      'mp3',
              language:    outputLang,
              translatedText: translated,
              bufferOnly:  false, // Play immediately
              timestamp:   new Date().toISOString(),
            });
          }
        } catch (err) { console.warn('[Pipeline] Final bit error:', err.message); }
      }

      // Start the buffered audio immediately
      io.to(room).emit('audio_command', { command: 'START_PLAYBACK', senderRole: role });

      // Final UI Update
      io.to(room).emit('transcript_update', {
        role,
        phase: 'translated',
        originalText: currentText,
        translatedText: state.audioQueue.map(q => q.translated).join(' '),
        timestamp: new Date().toISOString(),
      });

      sessionState.delete(stateKey);

      saveMessage({
        sessionId,
        senderRole: role,
        originalText: currentText,
        translatedText: state.audioQueue.map(q => q.translated).join(' '),
        originalLang: inputLang,
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
