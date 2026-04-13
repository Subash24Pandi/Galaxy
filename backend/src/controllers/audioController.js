const pusher = require('../config/pusher');
const sttService = require('../services/sttService');
const translationService = require('../services/translationService');
const ttsService = require('../services/ttsService');
const { saveMessage } = require('../models/sessionModel');

const handleAudioUtterance = async (req, res) => {
  const { sessionId, role, audioBase64, inputLang, outputLang } = req.body;

  if (!sessionId || !role || !audioBase64) {
    return res.status(400).json({ success: false, message: 'Invalid payload.' });
  }

  try {
    console.log(`[Pusher-Pipeline] Processing audio from ${role} in ${sessionId}...`);
    
    // 1. Transcription (STT)
    const originalText = await sttService.transcribeAudio(audioBase64, inputLang);
    if (!originalText) throw new Error('Could not understand audio');

    // 2. Translation
    // In serverless, we get the target lang directly from the body or session store
    const targetRole = role === 'agent' ? 'customer' : 'agent';
    const translatedText = await translationService.translateText(originalText, inputLang, outputLang);

    // 3. Synthesis (TTS)
    const ttsAudio = await ttsService.synthesizeSpeech(translatedText, outputLang);

    // 4. Distribute to room via Pusher
    const timestamp = new Date().toISOString();
    
    // Trigger transcript update
    await pusher.trigger(`session-${sessionId}`, 'transcript_update', {
      role,
      originalText,
      translatedText,
      timestamp
    });

    // Trigger audio playback
    await pusher.trigger(`session-${sessionId}`, 'audio_playback', {
      targetRole,
      audioBase64: ttsAudio,
      timestamp
    });

    // Persist to Postgres
    try {
      await saveMessage({
        sessionId,
        senderRole: role,
        originalText,
        originalLang: inputLang,
        translatedText,
        translatedLang: outputLang,
      });
    } catch (dbErr) {
      console.warn('[Pusher-Pipeline] DB save failed:', dbErr.message);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('[Pusher-Pipeline] Error:', error.message);
    
    // Notify the room of the error
    await pusher.trigger(`session-${sessionId}`, 'session_status', { 
      message: `AI Error: ${error.message}` 
    });
    
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { handleAudioUtterance };
