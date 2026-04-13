# 🌌 Proyek Galaxy: Real-Time AI Voice Translation

**Last Deployment Sync:** April 13, 2026

[![Status](https://img.shields.io/badge/Status-Elite_Demo_Ready-brightgreen)](https://github.com/The-Aitel/translator)
[![Backend](https://img.shields.io/badge/Backend-Node.js-blue)](backend/)
[![Frontend](https://img.shields.io/badge/Frontend-React-61dafb)](frontend/)

Proyek Galaxy adalah platform komunikasi suara real-time elit yang didukung oleh AI untuk menerjemahkan bahasa secara instan menggunakan infrastruktur tercanggih.

## ✨ Fitur Utama
- **Real-Time VAD (Voice Activity Detection)**: Deteksi suara ultra-responsif yang hanya aktif saat Anda berbicara.
- **Intelligent Translation**: Secara otomatis mendeteksi bahasa lawan bicara dan menerjemahkan ke bahasa yang benar.
- **Ultra-Low Latency**: Menggunakan model ElevenLabs Turbo v2.5 untuk respon suara instan.
- **Premium Mesh UI**: Desain Glassmorphism modern yang responsif di PC dan Mobile.
- **Persistent History**: Riwayat percakapan disimpan dengan aman di Neon PostgreSQL.

## 🚀 Persiapan Cepat

### Persyaratan
- Node.js (v18+)
- Postgres (Neon.tech direkomendasikan)
- Sarvam AI API Key
- ElevenLabs API Key

### Instalasi
1. Clone repo:
   ```bash
   git clone https://github.com/The-Aitel/translator.git
   ```
2. Backend:
   ```bash
   cd backend
   npm install
   cp .env.example .env
   # Update .env dengan API key Anda
   npm start
   ```
3. Frontend:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

## 🌐 Deployment
- **Backend**: Host di Render menggunakan `render.yaml`.
- **Frontend**: Host di Vercel/Render (Static Site).

---
© 2026 Proyek Galaxy - Elite Communication AI
