require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { connectDB, query } = require('./config/db');

const { handleAudioUtterance } = require('./controllers/audioController');
const sessionRoutes = require('./routes/sessionRoutes');
const { createSession, updateSessionLanguage } = require('./models/sessionModel');


const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'https://galaxy-silk-one.vercel.app'
];

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Provide io instance to controllers via app
app.set('io', io);

// Payload limit for audio
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST'],
  credentials: true
}));

// Socket.io Connection Logic
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('join-session', async ({ sessionId, role }) => {
    socket.join(`session-${sessionId}`);
    console.log(`${role} joined session: ${sessionId}`);
    
    // Auto-create or fetch session data (Now robustly returns current state)
    const sessionData = await createSession(sessionId);

    // Initial sync of languages for the newcomer
    socket.emit('initial_sync', {
      agentLang: sessionData.agent_lang,
      customerLang: sessionData.customer_lang
    });

    // Notify room
    io.to(`session-${sessionId}`).emit('session_status', { 
      message: `${role.toUpperCase()} has joined the session` 
    });
  });

  socket.on('update_language', async ({ sessionId, role, lang }) => {
    console.log(`[Socket-Pipeline] [${role}] in ${sessionId}: Language updated to: ${lang}`);
    await updateSessionLanguage(sessionId, role, lang);
    socket.to(`session-${sessionId}`).emit('peer_language_updated', {
      peerRole: role,
      lang: lang
    });
  });


  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Routes
app.use('/api/sessions', sessionRoutes);

// Real-time Endpoints
app.post('/api/audio', handleAudioUtterance);

app.post('/api/join', (req, res) => {
  const { sessionId, role } = req.body;
  // Fallback for HTTP-based join if needed, but sockets handle it now
  io.to(`session-${sessionId}`).emit('session_status', { 
    message: `${role.toUpperCase()} has joined the session` 
  });
  res.json({ success: true });
});

// Health Check
app.get('/api/health', async (req, res) => {
  const health = { database: 'down', pipeline: 'down' };
  try {
    await query('SELECT 1');
    health.database = 'up';
  } catch (e) {
    console.warn('[Health] DB Check Failed:', e.message);
  }

  if (process.env.SARVAM_API_KEY && process.env.SARVAM_API_KEY !== 'your_sarvam_api_key') {
    health.pipeline = 'up';
  }

  res.json(health);
});

const startServer = async () => {
  try {
    await connectDB();
    
    // Deep Harmonization: Ensure columns match the new schema regardless of local state
    await query(`
      DO $$ 
      BEGIN 
        -- 1. Harmonize sessions table
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sessions' AND column_name='session_id') THEN
          -- Check if it's the primary key, if so rename, if not just drop or make nullable
          BEGIN
            ALTER TABLE sessions RENAME COLUMN session_id TO id;
          EXCEPTION WHEN others THEN
            -- If 'id' already exists, 'session_id' is redundant/stale
            ALTER TABLE sessions ALTER COLUMN session_id DROP NOT NULL;
          END;
        END IF;

        -- 2. Harmonize messages table
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='messages' AND column_name='id' AND table_name='messages' AND column_name NOT IN (SELECT column_name FROM information_schema.columns WHERE table_name='messages' AND column_name='session_id')) THEN
          -- If 'id' is used for session reference incorrectly, we fix it
        END IF;

        -- 3. Add Lang Columns
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sessions' AND column_name='agent_lang') THEN
          ALTER TABLE sessions ADD COLUMN agent_lang VARCHAR(10) DEFAULT 'ta';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sessions' AND column_name='customer_lang') THEN
          ALTER TABLE sessions ADD COLUMN customer_lang VARCHAR(10) DEFAULT 'en';
        END IF;

        -- 4. Fix Constraints
        ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_session_id_fkey;
        ALTER TABLE sessions ALTER COLUMN id TYPE VARCHAR(100);
        ALTER TABLE messages ALTER COLUMN session_id TYPE VARCHAR(100);
        
        IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name='messages_session_id_fkey') THEN
          ALTER TABLE messages ADD CONSTRAINT messages_session_id_fkey FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE;
        END IF;
      END $$;
    `).catch(e => console.warn('[Migration] Deep Harmonization Handled:', e.message));

    const PORT = process.env.PORT || 5000;

    server.listen(PORT, () => {
      console.log(`[Galaxy-Local] Server listening on port ${PORT}`);
    });


  } catch (error) {
    console.error('[Galaxy] Startup failed:', error);
  }
};

startServer();

