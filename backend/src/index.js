require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { connectDB, pool } = require('./config/db');
const { connectRedis, getRedisClient } = require('./config/redisClient');
const sessionRoutes = require('./routes/sessionRoutes');
const socketHandler = require('./sockets/socketHandler');

const app = express();
const server = http.createServer(app);

// Relaxed CORS for local development and demos
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST'],
  credentials: true
}));
app.use(express.json());

// Routes
app.use('/api/sessions', sessionRoutes);

// Health Check
app.get('/api/health', async (req, res) => {
  const healthStatus = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: {
      server: 'up',
      database: 'down',
      redis: 'down'
    }
  };

  try {
    await pool.query('SELECT 1');
    healthStatus.services.database = 'up';
  } catch (e) {
    healthStatus.services.database = 'error';
  }

  try {
    const redisClient = getRedisClient();
    if (redisClient && redisClient.isOpen) {
      healthStatus.services.redis = 'up';
    }
  } catch (e) {
    healthStatus.services.redis = 'error';
  }

  const overallOk = Object.values(healthStatus.services).every(s => s === 'up');
  res.status(overallOk ? 200 : 207).json(healthStatus);
});

// Initialize Socket.io with production-grade CORS and lifecycle logging
const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      // Allow all origins for the MVP, but reflect correctly for browsers
      callback(null, true);
    },
    methods: ['GET', 'POST'],
    credentials: true
  },
  allowEIO3: true,
  transports: ['websocket', 'polling']
});

io.on('connection', (socket) => {
  console.log(`[Socket] Connection Handshake Successful: ${socket.id} (Transport: ${socket.conn.transport.name})`);
});

const startServer = async () => {
  try {
    await connectDB();
    await connectRedis(); // Will log error if fails, but won't crash
    socketHandler(io);

    const PORT = process.env.PORT || 5000;
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`[Galaxy] Server listening on port ${PORT}`);
    });
  } catch (error) {
    console.error('[Galaxy] Startup failed:', error);
    process.exit(1);
  }
};

startServer();
