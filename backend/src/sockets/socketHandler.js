const { getRedisClient } = require('../config/redisClient');
const { saveMessage, createSession } = require('../models/sessionModel');
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

        // ELITE FIX: Ensure session exists in DB so messages can be saved
        await createSession(sessionId);

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
        
        // Notify self
        socket.emit('session_status', { 
          status: 'joined', 
          message: `Joined session ${sessionId} as ${role}` 
        });

        // Notify others in the room
        socket.to(sessionId).emit('session_status', { 
          message: `${role.toUpperCase()} has joined the session` 
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

        try {
        console.log(`[Pipeline] Processing audio from ${role}...`);
        
        // Get the actual session data for this specific user
        const sessionData = participants[sessionId];
        if (!sessionData || !sessionData[role]) throw new Error('Session data lost');

        const senderData = sessionData[role];
        const targetRole = role === 'agent' ? 'customer' : 'agent';
        const receiverData = sessionData[targetRole];

        // 1. Transcription (STT)
        // Use the sender's input language
        const originalText = await sttService.transcribeAudio(audioBase64, senderData.inputLang);
        if (!originalText) throw new Error('Could not understand audio');

        // 2. Translation
        // Target is the receiver's inputLang, or the sender's outputLang as fallback
        const targetLang = receiverData ? receiverData.inputLang : senderData.outputLang;
        const translatedText = await translationService.translateText(originalText, senderData.inputLang, targetLang);

        // 3. Synthesis (TTS)
        const ttsAudio = await ttsService.synthesizeSpeech(translatedText, targetLang);

        // 4. Distribute to room
        io.to(sessionId).emit('transcript_update', {
          role,
          originalText,
          translatedText,
          timestamp: new Date().toISOString()
        });

        io.to(sessionId).emit('audio_playback', {
          targetRole,
          audioBase64: ttsAudio
        });

        console.log(`[Pipeline] Completed successfully for ${role}`);
      } catch (error) {
        console.error('[Pipeline] Error:', error.message);
        socket.emit('session_status', { message: `AI Error: ${error.message}` });
      }

        // Persist to Postgres
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
          console.warn('[Socket] DB save failed:', dbErr.message);
        }

        // Broadcast
        io.to(sessionId).emit('transcript_update', transcriptMessage);
        
        io.to(sessionId).emit('audio_playback', {
          sessionId,
          fromRole: role,
          targetRole: targetRole,
          audioBase64: translatedAudioBase64,
          timestamp,
        });
        
        console.log(`[Pipeline] ✅ ${role} → ${targetRole}: "${originalText.substring(0, 30)}..." → "${translatedText.substring(0, 30)}..."`);
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