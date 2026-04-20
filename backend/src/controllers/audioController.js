const sttService         = require('../services/sttService');
const translationService = require('../services/translationService');
const ttsService         = require('../services/ttsService');
const { saveMessage, createSession } = require('../models/sessionModel');

const sessionState = new Map();
const processingLocks = new Set(); 

// ── NEW: Robust Duplicate Prevention ──
// Stores hashes of "processed sentences" per session to prevent ANY double-translation.
const processedSentences = new Set(); 

/**
 * Main Audio Processing Pipeline
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

    const currentText = fullTranscript.trim();
    const newText = currentText.slice(state.processedText.length).trim();

    if (newText.length > 0) {
      // ── STEP 2: Real-time Synthesis ────────────────────────────────────
      const sentences = newText.split(/(?<=[.!?।])\s+/).map(s => s.trim()).filter(s => s.length > 1);
      const toProcess = isFinal ? sentences : sentences.filter(s => /[.!?।]$/.test(s));

      for (const sentence of toProcess) {
        try {
          // ── FINGERPRINT CHECK (Strict Duplicate Prevention) ──
          const fingerprint = `${sessionId}-${role}-${sentence.toLowerCase().replace(/\s/g, '')}`;
          if (processedSentences.has(fingerprint)) continue;

          console.log(`[Pipeline] ⚡ Real-time Synthesis: "${sentence}"`);
          const translated = await translationService.translateText(sentence, inputLang, outputLang);
          
          if (translated && translated.trim().length > 0) {
            // Mark as processed BEFORE async synthesis to lock it
            processedSentences.add(fingerprint);
            
            const audio = await ttsService.synthesizeSpeech(translated, outputLang);
            state.audioQueue.push({ translated, audio });
            state.processedText += (state.processedText ? ' ' : '') + sentence;

            io.to(room).emit('audio_playback', {
              senderRole:  role,
              clientId:    clientId,
              targetRole,
              audioBase64: audio,
              format:      'mp3',
              language:    outputLang,
              translatedText: translated,
              timestamp:   new Date().toISOString(),
            });
          }
        } catch (err) { console.warn('[Pipeline] Synth error:', err.message); }
      }

      io.to(room).emit('transcript_update', {
        role,
        phase: 'transcribing',
        originalText: currentText,
        timestamp: new Date().toISOString(),
      });
    }

    if (isFinal) {
      console.log(`[Pipeline] 🔴 FINALIZING | session=${sessionId}`);
      
      const remaining = currentText.slice(state.processedText.length).trim();
      const fingerprintRem = `${sessionId}-${role}-${remaining.toLowerCase().replace(/\s/g, '')}`;

      if (remaining.length > 0 && !processedSentences.has(fingerprintRem)) {
        try {
          const translated = await translationService.translateText(remaining, inputLang, outputLang);
          if (translated) {
            processedSentences.add(fingerprintRem);
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
              timestamp:   new Date().toISOString(),
            });
          }
        } catch (err) { console.warn('[Pipeline] Final bit error:', err.message); }
      }

      io.to(room).emit('transcript_update', {
        role,
        phase: 'translated',
        originalText: currentText,
        translatedText: state.audioQueue.map(q => q.translated).join(' '),
        timestamp: new Date().toISOString(),
      });

      sessionState.delete(stateKey);
      
      // Cleanup fingerprints for this session after it completes
      // (Optional, keep for history if needed, or clear to save memory)
      // Array.from(processedSentences).filter(f => f.startsWith(sessionId)).forEach(f => processedSentences.delete(f));

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
