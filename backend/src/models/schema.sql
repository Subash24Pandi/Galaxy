-- SQL commands to create the necessary tables

CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY,
  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY,
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
  sender_role VARCHAR(50) NOT NULL,
  original_text TEXT NOT NULL,
  original_lang VARCHAR(50) NOT NULL,
  translated_text TEXT NOT NULL,
  translated_lang VARCHAR(50) NOT NULL,
  audio_url TEXT, -- In a real app, you'd store the TTS audio in S3 and reference it here
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
