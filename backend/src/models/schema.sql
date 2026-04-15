-- SQL commands to create the necessary tables
-- MIGRATION: Robust conversion from UUID to VARCHAR
DO $$ 
BEGIN 
    -- 1. Drop the foreign key constraint first
    ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_session_id_fkey;
    
    -- 2. Change the column types
    ALTER TABLE sessions ALTER COLUMN id TYPE VARCHAR(100);
    ALTER TABLE messages ALTER COLUMN session_id TYPE VARCHAR(100);
    
    -- 3. Restore the constraint
    ALTER TABLE messages ADD CONSTRAINT messages_session_id_fkey FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE;
EXCEPTION
    WHEN others THEN 
        RAISE NOTICE 'Migration failed or already applied: %', SQLERRM;
END $$;

CREATE TABLE IF NOT EXISTS sessions (
  id VARCHAR(100) PRIMARY KEY,
  agent_lang VARCHAR(10) DEFAULT 'en',
  customer_lang VARCHAR(10) DEFAULT 'en',
  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Ensure columns exist for older local DBs
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'active';
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS agent_lang VARCHAR(10) DEFAULT 'en';
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS customer_lang VARCHAR(10) DEFAULT 'en';



CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY,
  session_id VARCHAR(100) REFERENCES sessions(id) ON DELETE CASCADE,
  sender_role VARCHAR(50) NOT NULL,
  original_text TEXT NOT NULL,
  original_lang VARCHAR(50) NOT NULL,
  translated_text TEXT NOT NULL,
  translated_lang VARCHAR(50) NOT NULL,
  audio_url TEXT, -- In a real app, you'd store the TTS audio in S3 and reference it here
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
