const { getRedisClient } = require('../config/redisClient');
const { saveMessage } = require('../models/sessionModel');
const sttService = require('../services/sttService');
const translationService = require('../services/translationService');
const ttsService = require('../services/ttsService');

module.exports = (io) => {
  io.on('connection', (socket) => {
    console.log('\n======================================');
    console.log(`[Backend] Client securely connected: ${socket.id}`);
    console.log('======================================\n');

    /**
     * JOIN SESSION
     * Payload:
     * {
     *   sessionId: string,
     *   role: 'agent' | 'customer',
     *   inputLang: string,
     *   outputLang: string
     * }
     */
    socket.on('join_session', async ({ sessionId, role, inputLang, outputLang }) => {
      try {
        if (!sessionId || !role) {
          socket.emit('error', { message: 'sessionId and role are required.' });
          return;
        }

        console.log(
          `[Backend] Socket ${socket.id} joined session ${sessionId} as ${role}`
        );

        // Store basic info directly on socket for disconnect cleanup and memory fallback
        socket.sessionId = sessionId;
        socket.role = role;
        socket.inputLang = inputLang;
        socket.outputLang = outputLang;

        // Join Socket.IO room
        socket.join(sessionId);

        // Save participant info in Redis
        const redisClient = getRedisClient();
        if (redisClient) {
          const userData = JSON.stringify({
            socketId: socket.id,
            role,
            inputLang,
            outputLang,
            joinedAt: new Date().toISOString(),
          });

          await redisClient.hSet(`session:${sessionId}`, role, userData);
        }

        // Notify current socket
        socket.emit('joined_session', {
          success: true,
          sessionId,
          role,
          inputLang,
          outputLang,
        });

        // Notify everyone in room
        io.to(sessionId).emit('session_status', {
          type: 'join',
          sessionId,
          role,
          message: `${role} has joined the session.`,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        console.error('[Backend] join_session error:', error);
        socket.emit('error', { message: 'Failed to join session.' });
      }
    });

    /**
     * OPTIONAL MANUAL TEXT MESSAGE EVENT
     * Useful for testing transcript sync before audio pipeline
     */
    socket.on(
      'send_message',
      async ({
        sessionId,
        role,
        originalText,
        translatedText,
        sourceLang,
        targetLang,
      }) => {
        try {
          if (!sessionId || !role || !originalText) {
            socket.emit('error', { message: 'Missing required message fields.' });
            return;
          }

          const message = {
            role,
            originalText,
            translatedText: translatedText || '',
            sourceLang: sourceLang || '',
            targetLang: targetLang || '',
            timestamp: new Date().toISOString(),
          };

          // Save to DB
          await saveMessage({
            sessionId,
            senderRole: role,
            originalText: message.originalText,
            originalLang: message.sourceLang,
            translatedText: message.translatedText,
            translatedLang: message.targetLang,
          });

          // Send to both participants
          io.to(sessionId).emit('receive_message', message);
        } catch (error) {
          console.error('[Backend] send_message error:', error);
          socket.emit('error', { message: 'Failed to send message.' });
        }
      }
    );

    /**
     * AUDIO PIPELINE EVENT
     * Payload:
     * {
     *   sessionId: string,
     *   role: 'agent' | 'customer',
     *   audioBase64: string
     * }
     */
    socket.on('audio_utterance', async ({ sessionId, role, audioBase64 }) => {
      console.log(`[Backend] Received audio from ${role} in session ${sessionId}`);

      try {
        if (!sessionId || !role || !audioBase64) {
          socket.emit('error', { message: 'Missing audio payload fields.' });
          return;
        }

        const redisClient = getRedisClient();

        // 1. Fallback to memory properties if Redis is null
        let inputLang = socket.inputLang || 'en';
        let outputLang = socket.outputLang || 'hi';

        // Get speaker language settings from Redis (if available)
        if (redisClient) {
          const userDataStr = await redisClient.hGet(`session:${sessionId}`, role);

          if (userDataStr) {
            const userData = JSON.parse(userDataStr);
            inputLang = userData.inputLang || inputLang;
            outputLang = userData.outputLang || outputLang;
          }
        }

        // 1. Speech-to-Text
        console.log(`[Backend] Step 1: Sending audio block to STT Engine (Input: ${inputLang})`);
        const originalText = await sttService.transcribeAudio(audioBase64, inputLang);

        // 2. Translate
        console.log(`[Backend] Step 2: Translating "${originalText}" from ${inputLang} to ${outputLang}`);
        const translatedText = await translationService.translateText(
          originalText,
          inputLang,
          outputLang
        );

        // 3. Text-to-Speech
        console.log(`[Backend] Step 3: Synthesizing AI TTS Audio for "${translatedText}"`);
        const translatedAudioBase64 = await ttsService.synthesizeSpeech(
          translatedText,
          outputLang
        );

        // Build shared message object for transcript panel
        console.log(`[Backend] Step 4: Emitting transcript_update and audio_playback`);
        const transcriptMessage = {
          role,
          originalText,
          translatedText,
          sourceLang: inputLang,
          targetLang: outputLang,
          timestamp: new Date().toISOString(),
        };

        // Save message in DB
        await saveMessage({
          sessionId,
          senderRole: role,
          originalText,
          originalLang: inputLang,
          translatedText,
          translatedLang: outputLang,
        });

        // Send transcript to BOTH users
        io.to(sessionId).emit('transcript_update', transcriptMessage);

        // Audio should be played only by opposite role
        const targetRole = role === 'agent' ? 'customer' : 'agent';

        io.to(sessionId).emit('audio_playback', {
          sessionId,
          fromRole: role,
          targetRole,
          sourceLang: inputLang,
          targetLang: outputLang,
          audioBase64: translatedAudioBase64,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        console.error('[Backend] Error processing audio pipeline:', error);
        socket.emit('error', {
          message: 'Pipeline failure',
          details: error.message || 'Unknown error',
        });
      }
    });

    /**
     * DISCONNECT
     */
    socket.on('disconnect', async () => {
      try {
        console.log(`[Backend] Client disconnected: ${socket.id}`);

        const redisClient = getRedisClient();

        if (redisClient && socket.sessionId && socket.role) {
          await redisClient.hDel(`session:${socket.sessionId}`, socket.role);

          io.to(socket.sessionId).emit('session_status', {
            type: 'disconnect',
            sessionId: socket.sessionId,
            role: socket.role,
            message: `${socket.role} disconnected.`,
            timestamp: new Date().toISOString(),
          });
        }
      } catch (error) {
        console.error('[Backend] disconnect cleanup error:', error);
      }
    });
  });
};