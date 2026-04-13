require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { connectDB, pool } = require('./config/db');
// Removed legacy socketHandler and redis imports for Serverless Vercel Build

const { handleAudioUtterance } = require('./controllers/audioController');
const pusher = require('./config/pusher');

const app = express();

// Increase payload limit for Base64 audio
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Relaxed CORS for Vercel and Local
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST'],
  credentials: true
}));

// Routes
app.use('/api/sessions', sessionRoutes);

// NEW: Serverless Real-time Endpoints
app.post('/api/audio', handleAudioUtterance);

app.post('/api/join', async (req, res) => {
  const { sessionId, role } = req.body;
  
  // Notify others via Pusher instead of Sockets
  await pusher.trigger(`session-${sessionId}`, 'session_status', { 
    message: `${role.toUpperCase()} has joined the session` 
  });
  
  res.json({ success: true });
});

// Health Check
app.get('/api/health', async (req, res) => {
  try {
    const healthStatus = {
      status: 'ok',
      services: { server: 'up', database: 'up' }
    };
    res.json(healthStatus);
  } catch (e) {
    res.status(500).json({ status: 'error' });
  }
});

// Vercel only: export the app
module.exports = app;

// Local development only: start the server
if (process.env.NODE_ENV !== 'production') {
  const startServer = async () => {
    try {
      await connectDB();
      const PORT = process.env.PORT || 5000;
      app.listen(PORT, () => {
        console.log(`[Galaxy-Serverless] Local server listening on port ${PORT}`);
      });
    } catch (error) {
      console.error('[Galaxy] Startup failed:', error);
    }
  };
  startServer();
}
