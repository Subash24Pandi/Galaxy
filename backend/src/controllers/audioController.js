const sttService         = require('../services/sttService');
const translationService = require('../services/translationService');
const ttsService         = require('../services/ttsService');
const { saveMessage, createSession } = require('../models/sessionModel');

const sessionState = new Map();
const processingLocks = new Set(); 
const processedSentences = new Set(); 

/**
 * Main Audio Processing Pipeline
 * Fixed for: No-Splitting + Accurate Delivery + Persistent State
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

    res.json({ success: true, message: 'Bridge active...' });
    const startTime = Date.now();

    await createSession(sessionId).catch(() => {});

    // ── STEP 1: STT ──────────────────────────────────────────────────────────
    const audioBuffer = Buffer.from(audioBase64, 'base64');
    const fullTranscript = await sttService.transcribeAudio(audioBuffer, inputLang);

    if (!fullTranscript || fullTranscript.trim() === '') {
       // If mic is off but we have leftovers, translate them now
       return;
    }

    const currentText = fullTranscript.trim();
    const sentences = currentText.split(/(?<=[.!?।])\s+/).map(s => s.trim()).filter(s => s.length > 1);

    // ── STEP 2: Balanced Translation (No Splitting Partial Thoughts) ──
    // Only process sentences that end in punctuation. 
    // This ensures thoughts stay together.
    const toProcess = isFinal ? sentences : sentences.filter(s => /[.!?।]$/.test(s));

    for (const sentence of toProcess) {
      try {
        const fingerprint = `${sessionId}-${role}-${sentence.toLowerCase().replace(/[^\w]/g, '')}`;
        if (processedSentences.has(fingerprint)) continue;

        console.log(`[Pipeline] ⚡ Processing: "${sentence}"`);
        const translated = await translationService.translateText(sentence, inputLang, outputLang);
        
        if (translated && translated.trim().length > 0) {
          processedSentences.add(fingerprint);
          state.history.push(sentence);
          
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
      } catch (err) { console.warn('[Pipeline] Error:', err.message); }
    }

    // Live UI Update
    io.to(room).emit('transcript_update', {
      role,
      phase: 'transcribing',
      originalText: currentText,
      timestamp: new Date().toISOString(),
    });

    if (isFinal) {
      console.log(`[Pipeline] 🔴 FINALIZING | session=${sessionId}`);
      
      // Process anything remaining that didn't have a punctuation
      const remaining = currentText; // We use full transcript to catch any last bits
      const remainingSentences = remaining.split(/(?<=[.!?।])\s+/).map(s => s.trim()).filter(s => s.length > 1);
      
      for (const s of remainingSentences) {
        const fp = `${sessionId}-${role}-${s.toLowerCase().replace(/[^\w]/g, '')}`;
        if (!processedSentences.has(fp)) {
           const translated = await translationService.translateText(s, inputLang, outputLang);
           if (translated) {
             processedSentences.add(fp);
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
        }
      }

      // Final UI Sync
      io.to(room).emit('transcript_update', {
        role,
        phase: 'translated',
        originalText: currentText,
        translatedText: state.audioQueue.map(q => q.translated).join(' '),
        timestamp: new Date().toISOString(),
      });

      saveMessage({
        sessionId,
        senderRole: role,
        originalText: currentText,
        translatedText: state.audioQueue.map(q => q.translated).join(' '),
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
