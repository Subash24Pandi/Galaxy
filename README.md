# 🌌 Proyek Galaxy: Real-Time AI Voice Translation

[![Status](https://img.shields.io/badge/Status-Elite_Demo_Ready-brightgreen)](https://github.com/your-repo)
[![Backend](https://img.shields.io/badge/Backend-Node.js-blue)](backend/)
[![Frontend](https://img.shields.io/badge/Frontend-React-61dafb)](frontend/)
[![Database](https://img.shields.io/badge/Database-Neon_Postgres-00e599)](https://neon.tech)

**Proyek Galaxy** is a premium, production-ready multilingual voice translation platform designed for seamless human-to-human communication across language barriers. 

Featuring a state-of-the-art **Glassmorphism 2.0** interface and a high-performance **VAD (Voice Activity Detection)** engine, Galaxy makes global communication feel invisible and natural.

---

## ✨ Features

| Feature | Description |
| :--- | :--- |
| **🎙️ Hands-Free VAD** | Automatic speech detection—just speak naturally, no buttons required. |
| **🌊 Liquid Design** | Premium "Glassmorphism" UI with animated mesh gradients and glowing visualizers. |
| **⚡ Ultra-Low Latency** | Optimized AI pipeline (Sarvam & ElevenLabs) with Socket.io streaming. |
| **📱 Fully Responsive** | Seamless experience across PC, Tablet, and Mobile devices. |
| **🗄️ Neon Persistence** | Full session history and chat transcripts stored in Cloud PostgreSQL. |
| **🛡️ System Diagnostics** | Real-time health monitoring of Database and AI pipelines on the Home page. |

---

## 🛠️ Architecture

- **Frontend**: React (Vite) + Lucide Icons + Web Audio API.
- **Backend**: Node.js + Express + Socket.io + Helmet Security.
- **AI Stack**:
  - **Transcription & Translation**: [Sarvam AI](https://sarvam.ai/) (`saaras:v3`)
  - **Speech Synthesis**: [ElevenLabs](https://elevenlabs.io/) (`eleven_multilingual_v2`)
- **Infrastructure**: [Neon.tech](https://neon.tech) (Postgres) & Redis.

---

## 🚀 Getting Started

### 1. Environment Configuration
Create a `.env` file in the `backend/` directory:

```env
PORT=5000
DATABASE_URL=your_neon_postgres_url
REDIS_URL=your_redis_url
SARVAM_API_KEY=your_key
ELEVENLABS_API_KEY=your_key
```

### 2. Installations
```bash
# Terminal 1: Backend
cd backend
npm install
npm run dev

# Terminal 2: Frontend
cd frontend
npm install
npm run dev
```

---

## 📽️ The Demo Flow
1. **Health Check**: Verify the **Database** and **Pipeline** indicators are Green on the Home page.
2. **Start Session**: Click "New Translation Session" to create a unique ID on Neon.
3. **Configure**: Select your Role and Languages (e.g., English to Tamil).
4. **Communicate**: Speak. The **Glowing Visualizer** will show activity, and your translation will appear in a **Glass Bubble** while playing audio instantly.

---

*Transforming how the world talks, one session at a time.*
