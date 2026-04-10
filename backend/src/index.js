require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { connectDB } = require('./config/db');
const { connectRedis } = require('./config/redisClient');
const sessionRoutes = require('./routes/sessionRoutes');
const testRoutes = require('./routes/testRoutes');
const socketHandler = require('./sockets/socketHandler');

const app = express();
const server = http.createServer(app);

// Enable CORS for frontend
app.use(cors({ origin: '*' }));
app.use(express.json());

// Initialize WebSockets
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Setup API routes
app.use('/api/sessions', sessionRoutes);
app.use('/api/test', testRoutes);

// Detailed health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'Galaxy Backend MVP is running' });
});

// Initialize connections and start server
const startServer = async () => {
  try {
    await connectDB();
    await connectRedis();

    // Attach socket handler
    socketHandler(io);

    const PORT = process.env.PORT || 5000;
    server.listen(PORT, () => {
      console.log(`Server listening on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
