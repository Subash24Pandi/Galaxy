const sttService = require('../services/sttService');
const translationService = require('../services/translationService');
const ttsService = require('../services/ttsService');
const { saveMessage, createSession } = require('../models/sessionModel');

const handleAudioUtterance = async (req, res) => {
  const { sessionId, role, audioBase64, inputLang, outputLang } = req.body;
  const io = req.app.get('io');

  if (!sessionId || !role || !audioBase64) {
    return res.status(400).json({ success: false, message: 'Invalid payload.' });
  }

  try {
    console.log(`[Socket-Pipeline] [${role}] in ${sessionId}: ${inputLang} -> ${outputLang}`);
    
    // Ensure session exists in DB (Auto-create if joined manually)
    await createSession(sessionId);

    
    // 1. Transcription (STT)
    const originalText = await sttService.transcribeAudio(audioBase64, inputLang);
    if (!originalText) throw new Error('Could not understand audio');
    console.log(`[Pipeline] STT Step Done: "${originalText.substring(0, 50)}..."`);

    // 2. Translation
    const targetRole = role === 'agent' ? 'customer' : 'agent';
    const translatedText = await translationService.translateText(originalText, inputLang, outputLang);
    console.log(`[Pipeline] Translation Step Done: "${translatedText.substring(0, 50)}..."`);

    // 3. Synthesis (TTS)
    console.log(`[Pipeline] TTS Synthesis Starting for: ${outputLang}...`);
    const ttsAudio = await ttsService.synthesizeSpeech(translatedText, outputLang);
    console.log(`[Pipeline] TTS Synthesis Done. Size: ${ttsAudio.length} bytes`);

    // 4. Distribute to room via Socket.io
    const timestamp = new Date().toISOString();
    const room = `session-${sessionId}`;
    
    // Emit transcript update
    io.to(room).emit('transcript_update', {
      role,
      originalText,
      translatedText,
      timestamp
    });

    // Emit audio playback
    io.to(room).emit('audio_playback', {
      targetRole,
      audioBase64: ttsAudio,
      timestamp
    });

    // Persist to Postgres (Async)
    saveMessage({
      sessionId,
      senderRole: role,
      originalText,
      originalLang: inputLang,
      translatedText,
      translatedLang: outputLang,
    }).catch(dbErr => console.warn('[Socket-Pipeline] DB save failed:', dbErr.message));

    res.json({ success: true, text: originalText });
  } catch (error) {
    console.error('[Socket-Pipeline] Error:', error.message);
    
    // Notify the room of the error
    io.to(`session-${sessionId}`).emit('session_status', { 
      message: `AI Error: ${error.message}` 
    });
    
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { handleAudioUtterance };

