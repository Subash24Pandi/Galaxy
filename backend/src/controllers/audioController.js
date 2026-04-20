const sttService         = require('../services/sttService');
const translationService = require('../services/translationService');
const ttsService         = require('../services/ttsService');
const { saveMessage, createSession } = require('../models/sessionModel');

const sessionState = new Map();
const processingLocks = new Set(); 

/**
 * Main Audio Processing Pipeline
 * Optimized for: <3s Total Latency + Overlapping Chunk Support + Fuzzy Duplicate Prevention
 */
const handleAudioUtterance = async (req, res) => {
  const { sessionId, role, clientId, audioBase64, inputLang, outputLang, isFinal } = req.body;
  const io = req.app.get('io');

  if (!sessionId || !role || !audioBase64) {
    return res.status(400).json({ success: false, message: 'Missing fields' });
  }

  const stateKey = `${sessionId}-${role}`;
  const room     = `session-${sessionId}`;
  const targetRole = role === 'agent' ? 'customer' : 'agent';
  
  while (processingLocks.has(stateKey)) {
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  processingLocks.add(stateKey);

  try {
    if (!sessionState.has(stateKey)) {
      sessionState.set(stateKey, { processedText: '', audioQueue: [], history: [] });
    }
    const state = sessionState.get(stateKey);

    res.json({ success: true, message: 'Processing...' });
    const startTime = Date.now();

    await createSession(sessionId).catch(() => {});

    // ── STEP 1: STT (Overlapping Context) ──────────────────────────────────
    const audioBuffer = Buffer.from(audioBase64, 'base64');
    const chunkText = await sttService.transcribeAudio(audioBuffer, inputLang);

    if (!chunkText || chunkText.trim().length < 2) return;

    // Split chunk into sentences
    const sentences = chunkText.trim().split(/(?<=[.!?।])\s+/).map(s => s.trim()).filter(s => s.length > 1);

    for (const sentence of sentences) {
      // ── FUZZY DUPLICATE PREVENTION ──
      // Check if this sentence (or something very similar) was already processed
      const isDuplicate = state.history.some(prev => {
        const s1 = sentence.toLowerCase().replace(/[^\w]/g, '');
        const s2 = prev.toLowerCase().replace(/[^\w]/g, '');
        return s1 === s2 || s1.includes(s2) || s2.includes(s1);
      });

      if (isDuplicate) continue;

      // Only process complete sentences unless it's the final flush
      const isComplete = /[.!?।]$/.test(sentence);
      if (!isComplete && !isFinal) continue;

      try {
        console.log(`[Pipeline] ⚡ Processing: "${sentence}"`);
        const translated = await translationService.translateText(sentence, inputLang, outputLang);
        
        if (translated && translated.trim().length > 0) {
          state.history.push(sentence);
          
          const audio = await ttsService.synthesizeSpeech(translated, outputLang);
          state.audioQueue.push({ original: sentence, translated, audio });

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
      } catch (err) { console.warn('[Pipeline] Loop error:', err.message); }
    }

    // Live UI Update (Show unique sentences combined)
    const displayOriginal = state.history.join(' ');
    io.to(room).emit('transcript_update', {
      role,
      phase: 'transcribing',
      originalText: displayOriginal,
      timestamp: new Date().toISOString(),
    });

    // ── STEP 2: Finalization ───────────────────────────────────────────────
    if (isFinal) {
      console.log(`[Pipeline] 🔴 FINALIZING | session=${sessionId}`);
      
      const fullOriginal   = state.history.join(' ');
      const fullTranslated = state.audioQueue.map(q => q.translated).join(' ');

      io.to(room).emit('transcript_update', {
        role,
        phase: 'translated',
        originalText: fullOriginal,
        translatedText: fullTranslated,
        timestamp: new Date().toISOString(),
      });

      saveMessage({
        sessionId,
        senderRole: role,
        originalText: fullOriginal,
        translatedText: fullTranslated,
        originalLang: inputLang,
        translatedLang: outputLang,
      }).catch(() => {});

      sessionState.delete(stateKey);
      console.log(`[Pipeline] ✅ Complete in ${Date.now() - startTime}ms`);
    }

  } catch (error) {
    console.error(`[Pipeline] ❌ Fatal Error: ${error.message}`);
  } finally {
    processingLocks.delete(stateKey);
  }
};

module.exports = { handleAudioUtterance };
