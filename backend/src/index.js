require('dotenv').config();
const express = require('express');
const http    = require('http');
const { Server } = require('socket.io');
const cors   = require('cors');
const { connectDB, query } = require('./config/db');

const { handleAudioUtterance }          = require('./controllers/audioController');
const sessionRoutes                      = require('./routes/sessionRoutes');
const { createSession, updateSessionLanguage } = require('./models/sessionModel');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

// ── CORS ──────────────────────────────────────────────────────────────────────
app.use(cors({ origin: '*', methods: ['GET', 'POST'] }));

// ── Startup Audit ─────────────────────────────────────────────────────────────
console.log('═══════════════════════════════════════════════════════');
console.log('  GALAXY BRIDGE  —  Real-time Bilingual Voice Translator');
console.log('  Pipeline: ElevenLabs STT → Sarvam NMT → ElevenLabs TTS');
console.log('═══════════════════════════════════════════════════════');
console.log(`[Audit] Node        : ${process.version}`);
console.log(`[Audit] DATABASE_URL: ${process.env.DATABASE_URL   ? '✅ PRESENT' : '❌ MISSING'}`);
console.log(`[Audit] SARVAM_KEY  : ${process.env.SARVAM_API_KEY ? '✅ OK'      : '❌ MISSING'}`);
console.log(`[Audit] ELEVENLABS  : ${process.env.ELEVENLABS_API_KEY ? '✅ OK'  : '❌ MISSING'}`);
console.log('═══════════════════════════════════════════════════════');

// ── Middleware ────────────────────────────────────────────────────────────────
app.set('io', io);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/', (req, res) => res.json({ status: 'Galaxy Bridge Online', ts: new Date().toISOString() }));

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  IN-MEMORY LANGUAGE STORE  (PRIMARY source of truth — 100% DB-independent)
//
//  Structure:  sessionLangs.get(sessionId) = { agent: 'ta', customer: 'en' }
//  This fixes the peer-language-auto-change bug caused by DB being offline.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const sessionLangs = new Map();

function getLangs(sessionId) {
  if (!sessionLangs.has(sessionId)) {
    sessionLangs.set(sessionId, { agent: null, customer: null });
  }
  return sessionLangs.get(sessionId);
}

function setLang(sessionId, role, lang) {
  const s = getLangs(sessionId);
  if (role === 'agent')    s.agent    = lang;
  if (role === 'customer') s.customer = lang;
  console.log(`[LangStore] ${sessionId} → agent="${s.agent}" | customer="${s.customer}"`);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  SOCKET.IO  —  Real-time language sync + session management
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
io.on('connection', (socket) => {
  console.log(`[Socket] ✅ Connected: ${socket.id}`);

  // ── join-session ─────────────────────────────────────────────────────────
  socket.on('join-session', ({ sessionId, role }) => {
    socket.join(`session-${sessionId}`);
    socket.data.sessionId = sessionId;
    socket.data.role      = role;
    console.log(`[Socket] ${role.toUpperCase()} joined session ${sessionId}`);

    // Create session in DB (fire-and-forget — doesn't block language sync)
    createSession(sessionId).catch(() => {});

    // ── Announce join ───────────────────────────────────────────────────
    const label    = role === 'agent' ? '🏢 Internal Customer' : '👤 External Customer';
    const room     = `session-${sessionId}`;
    const roomSize = io.sockets.adapter.rooms.get(room)?.size || 1;

    io.to(room).emit('session_status', {
      message: `${label} joined the bridge`,
      type: 'info',
    });

    if (roomSize >= 2) {
      io.to(room).emit('session_status', {
        message: '● Both participants connected — Bridge is live',
        type: 'success',
      });
    }

    // ── Delay initial_sync by 150ms ────────────────────────────────────
    // Client emits join-session then update_language immediately after.
    // Waiting lets update_language arrive and update in-memory store FIRST,
    // so initial_sync contains the correct language, not stale old values.
    setTimeout(() => {
      const langs = getLangs(sessionId);
      socket.emit('initial_sync', {
        agentLang:    langs.agent,
        customerLang: langs.customer,
      });
      console.log(`[LangSync] initial_sync → agent="${langs.agent}" customer="${langs.customer}"`);

      // Tell existing peers in room what MY language is (if already set)
      const myLang = role === 'agent' ? langs.agent : langs.customer;
      if (myLang) {
        socket.to(room).emit('peer_language_updated', { peerRole: role, lang: myLang });
      }
    }, 150);
  });

  // ── update_language ───────────────────────────────────────────────────────
  // Called when a user selects/changes their language in setup or active call
  socket.on('update_language', ({ sessionId, role, lang }) => {
    if (!sessionId || !role || !lang) return;
    console.log(`[LangSync] ${role.toUpperCase()} set lang="${lang}" in session ${sessionId}`);

    // 1. Update in-memory store immediately
    setLang(sessionId, role, lang);

    // 2. Persist to DB (best-effort, non-blocking)
    updateSessionLanguage(sessionId, role, lang).catch(() => {});

    // 3. Tell all PEERS in the room (NOT the sender) what our language is
    socket.to(`session-${sessionId}`).emit('peer_language_updated', {
      peerRole: role,
      lang,
    });
  });

  // ── disconnect ────────────────────────────────────────────────────────────
  socket.on('disconnect', (reason) => {
    const { sessionId, role } = socket.data || {};
    console.log(`[Socket] ❌ ${socket.id} disconnected (${reason})`);
    if (sessionId && role && role !== 'setup') {
      const label = role === 'agent' ? '🏢 Internal Customer' : '👤 External Customer';
      io.to(`session-${sessionId}`).emit('session_status', {
        message: `${label} left the bridge`,
        type: 'info',
      });
    }
  });
});

// ── REST Routes ───────────────────────────────────────────────────────────────
app.use('/api/sessions', sessionRoutes);
app.post('/api/audio', handleAudioUtterance);

app.get('/api/health', async (req, res) => {
  const health = { database: 'down', pipeline: 'down', memory: 'up' };
  try {
    await query('SELECT 1');
    health.database = 'up';
  } catch (e) {
    console.warn('[Health] DB check failed:', e.message);
  }
  if (process.env.SARVAM_API_KEY && process.env.ELEVENLABS_API_KEY) {
    health.pipeline = 'up';
  }
  res.json(health);
});

// ── DB Init ───────────────────────────────────────────────────────────────────
const startDatabase = async () => {
  try {
    console.log('[DB] Connecting...');
    await connectDB();

    await query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sessions' AND column_name='agent_lang') THEN
          ALTER TABLE sessions ADD COLUMN agent_lang VARCHAR(10) DEFAULT 'en';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sessions' AND column_name='customer_lang') THEN
          ALTER TABLE sessions ADD COLUMN customer_lang VARCHAR(10) DEFAULT 'en';
        END IF;
      END $$;
    `).catch(e => console.warn('[DB] Migration skipped:', e.message));

    console.log('[DB] ✅ Ready');
  } catch (err) {
    console.warn('[DB] ⚠ Unavailable — running in memory-only mode (translation still works)');
  }
};

// ── Start Server ──────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`[Galaxy] 🚀 Server on port ${PORT}`);
  startDatabase();
});
