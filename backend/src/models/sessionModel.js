const { query } = require('../config/db');
const { v4: uuidv4 } = require('uuid');

const createSession = async (customId = null) => {
  const sessionId = customId || uuidv4();
  const text = 'INSERT INTO sessions(id, status) VALUES($1, $2) RETURNING *';
  const values = [sessionId, 'active'];
  try {
    const res = await query(text, values);
    return res.rows[0];
  } catch (err) {
    console.error('Error creating session in DB', err);
    // Return the ID anyway for mock support
    return { id: sessionId, status: 'active' };
  }
};


const getSessionHistory = async (sessionId) => {
  const text = 'SELECT * FROM messages WHERE session_id = $1 ORDER BY created_at ASC';
  try {
    const res = await query(text, [sessionId]);
    return res.rows;
  } catch (err) {
    console.error('Error fetching session history', err);
    return [];
  }
};

const saveMessage = async (messageData) => {
  const messageId = uuidv4();
  const { sessionId, senderRole, originalText, originalLang, translatedText, translatedLang } = messageData;
  const text = `
    INSERT INTO messages(id, session_id, sender_role, original_text, original_lang, translated_text, translated_lang)
    VALUES($1, $2, $3, $4, $5, $6, $7) RETURNING *
  `;
  const values = [messageId, sessionId, senderRole, originalText, originalLang, translatedText, translatedLang];
  try {
    const res = await query(text, values);
    return res.rows[0];
  } catch (err) {
    console.error('Error saving message', err);
    return null;
  }
};

const listSessions = async (limit = 10) => {
  const text = 'SELECT id, status, created_at FROM sessions ORDER BY created_at DESC LIMIT $1';
  try {
    const res = await query(text, [limit]);
    return res.rows;
  } catch (err) {
    console.error('Error listing sessions', err);
    return [];
  }
};

module.exports = {
  createSession,
  getSessionHistory,
  saveMessage,
  listSessions
};
