const { getRedisClient } = require('../config/redisClient');
const { saveMessage } = require('../models/sessionModel');
const sttService = require('../services/sttService');
const translationService = require('../services/translationService');
const ttsService = require('../services/ttsService');

// ELITE FALLBACK: Local memory store for sessions if Redis is unavailable
const memoryStore = {};

module.exports = (io) => {
  io.on('connection', (socket) => {
    console.log(`[Socket] New connection: ${socket.id}`);

    /**
     * JOIN SESSION
     */
    socket.on('join_session', async ({ sessionId, role, inputLang, outputLang }) => {
      console.log(`[Socket] Attempting Join: Session=${sessionId}, Role=${role}, Lang=${inputLang}->${outputLang}`);
      try {
        if (!sessionId || !role) {
          console.error('[Socket] Join failed: Missing sessionId or role');
          socket.emit('error', { message: 'sessionId and role are required.' });
          return;
        }

        socket.sessionId = sessionId;
        socket.role = role;
        socket.inputLang = inputLang;
        socket.outputLang = outputLang;
        socket.join(sessionId);

        const userData = {
          socketId: socket.id,
          role,
          inputLang,
          outputLang,
          joinedAt: new Date().toISOString(),
        };

        // Always update local memory store
        if (!memoryStore[sessionId]) memoryStore[sessionId] = {};
        memoryStore[sessionId][role] = userData;

        // Try updating Redis if available
        const redisClient = getRedisClient();
        if (redisClient && redisClient.isOpen) {
          try {
            await redisClient.hSet(`session:${sessionId}`, role, JSON.stringify(userData));
          } catch (err) {
            console.warn('[Socket] Redis set failed, falling back to memory.');
          }
        }

        socket.emit('joined_session', { success: true, sessionId, role });
        console.log(`[Socket] Join Success: ${socket.id} joined ${sessionId} as ${role}`);
        
        io.to(sessionId).emit('session_status', {
          type: 'join',
          sessionId,
          role,
          message: `${role} joined.`,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        console.error('[Socket] Join error:', error);
        socket.emit('error', { message: 'Failed to join session.' });
      }
    });

    /**
     * AUDIO PIPELINE
     */
    socket.on('audio_utterance', async ({ sessionId, role, audioBase64 }) => {
      try {
        if (!sessionId || !role || !audioBase64) {
          socket.emit('error', { message: 'Invalid payload.' });
          return;
        }

        const redisClient = getRedisClient();
        let inputLang = socket.inputLang || 'en';
        let targetLang = socket.outputLang || 'hi'; 

        const targetRole = role === 'agent' ? 'customer' : 'agent';
        let targetData = null;
        let senderData = null;

        // 1. Try to get data from Local Memory Store FIRST (fastest/reliable)
        if (memoryStore[sessionId]) {
          targetData = memoryStore[sessionId][targetRole];
          senderData = memoryStore[sessionId][role];
        }

        // 2. Fallback to Redis if memory store is missing (e.g. server restart)
        if (!targetData && redisClient && redisClient.isOpen) {
          try {
            const data = await redisClient.hGet(`session:${sessionId}`, targetRole);
            if (data) targetData = JSON.parse(data);
          } catch (e) {
            console.warn('[Socket] Redis get failed.');
          }
        }

        // ELITE FIX: Finalize languages
        if (targetData) targetLang = targetData.inputLang || targetLang;
        if (senderData) inputLang = senderData.inputLang || inputLang;

        // 3. Transcription
        console.log(`[Pipeline] Step 1: STT Starting (${inputLang})`);
        const sttStartTime = Date.now();
        const originalText = await sttService.transcribeAudio(audioBase64, inputLang);
        console.log(`[Pipeline] Step 1: STT Done in ${Date.now() - sttStartTime}ms. Text: "${originalText}"`);
        
        if (!originalText || originalText.trim() === '') {
          console.warn('[Pipeline] Aborting: Empty transcript');
          return;
        }

        // 4. Translation
        console.log(`[Pipeline] Step 2: Translation Starting (${inputLang} -> ${targetLang})`);
        const transStartTime = Date.now();
        const translatedText = await translationService.translateText(originalText, inputLang, targetLang);
        console.log(`[Pipeline] Step 2: Translation Done in ${Date.now() - transStartTime}ms. Text: "${translatedText}"`);

        // 5. Synthesis
        console.log(`[Pipeline] Step 3: TTS Starting (${targetLang})`);
        const ttsStartTime = Date.now();
        const translatedAudioBase64 = await ttsService.synthesizeSpeech(translatedText, targetLang);
        console.log(`[Pipeline] Step 3: TTS Done in ${Date.now() - ttsStartTime}ms.`);

        const timestamp = new Date().toISOString();
        const transcriptMessage = { role, originalText, translatedText, sourceLang: inputLang, targetLang, timestamp };

        // Persist to Postgres — non-fatal, pipeline must not crash on DB error
        try {
          await saveMessage({
            sessionId,
            senderRole: role,
            originalText,
            originalLang: inputLang,
            translatedText,
            translatedLang: targetLang,
          });
        } catch (dbErr) {
          console.warn('[Socket] DB save failed (non-fatal):', dbErr.message);
        }

        // Broadcast transcript to all participants
        io.to(sessionId).emit('transcript_update', transcriptMessage);
        
        // Send translated audio ONLY to the recipient
        io.to(sessionId).emit('audio_playback', {
          sessionId,
          fromRole: role,
          targetRole: targetRole,
          audioBase64: translatedAudioBase64,
          timestamp,
        });
        
        console.log(`[Socket] ✅ Pipeline complete: ${role} → ${targetRole} (${inputLang} → ${targetLang})`);
      } catch (error) {
        console.error('[Socket] Pipeline error:', error);
        socket.emit('error', { message: 'Translation failed', details: error.message });
      }
    });

    /**
     * DISCONNECT
     */
    socket.on('disconnect', async () => {
      try {
        const sessionId = socket.sessionId;
        const role = socket.role;

        if (sessionId && role) {
          // Clean up memory
          if (memoryStore[sessionId]) delete memoryStore[sessionId][role];
          
          // Clean up Redis
          const redisClient = getRedisClient();
          if (redisClient && redisClient.isOpen) {
            await redisClient.hDel(`session:${sessionId}`, role);
          }

          io.to(sessionId).emit('session_status', {
            type: 'disconnect',
            role: role,
            message: `${role} left.`,
            timestamp: new Date().toISOString(),
          });
        }
      } catch (error) {
        console.error('[Socket] Disconnect error:', error);
      }
    });
  });
};