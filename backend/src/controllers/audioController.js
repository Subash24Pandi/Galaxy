const sttService         = require('../services/sttService');
const translationService = require('../services/translationService');
const ttsService         = require('../services/ttsService');
const { saveMessage, createSession } = require('../models/sessionModel');

const sessionState = new Map();
const processingLocks = new Set(); 

/**
 * Main Audio Processing Pipeline
 * Optimized with High-Performance Streaming Prompt + Sub-2s Latency
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

    res.json({ success: true, message: 'Streaming...' });
    const startTime = Date.now();

    await createSession(sessionId).catch(() => {});

    // ── STEP 1: STT (Overlapping Context) ──────────────────────────────────
    const audioBuffer = Buffer.from(audioBase64, 'base64');
    const chunkText = await sttService.transcribeAudio(audioBuffer, inputLang);

    if (!chunkText || chunkText.trim().length < 2) return;

    // Split chunk into fragments (aggressive streaming)
    // We split by punctuation but also handle partial fragments if long enough
    const fragments = chunkText.trim().split(/(?<=[.!?।])\s+/).map(s => s.trim()).filter(s => s.length > 1);

    for (const fragment of fragments) {
      // ── FUZZY DUPLICATE PREVENTION ──
      const isDuplicate = state.history.some(prev => {
        const s1 = fragment.toLowerCase().replace(/[^\w]/g, '');
        const s2 = prev.toLowerCase().replace(/[^\w]/g, '');
        return s1 === s2 || s1.includes(s2) || s2.includes(s1);
      });

      if (isDuplicate) continue;

      // AGGRESSIVE STREAMING: 
      // If user provided prompt says "handle partial/incomplete", 
      // we only wait for 3+ words or a final stop.
      const wordCount = fragment.split(/\s+/).length;
      const isComplete = /[.!?।]$/.test(fragment);
      if (!isComplete && !isFinal && wordCount < 4) continue;

      try {
        console.log(`[Pipeline] ⚡ Streaming Fragment: "${fragment}"`);
        const translated = await translationService.translateText(fragment, inputLang, outputLang);
        
        if (translated && translated.trim().length > 0) {
          state.history.push(fragment);
          
          const audio = await ttsService.synthesizeSpeech(translated, outputLang);
          state.audioQueue.push({ original: fragment, translated, audio });

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
      } catch (err) { console.warn('[Pipeline] Stream error:', err.message); }
    }

    // Live UI Update
    io.to(room).emit('transcript_update', {
      role,
      phase: 'transcribing',
      originalText: state.history.join(' '),
      timestamp: new Date().toISOString(),
    });

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
