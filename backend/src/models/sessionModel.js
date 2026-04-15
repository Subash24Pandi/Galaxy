const { query } = require('../config/db');
const { v4: uuidv4 } = require('uuid');

const createSession = async (customId = null) => {
  const sessionId = customId || uuidv4();
  const insertText = `
    INSERT INTO sessions(id, status, agent_lang, customer_lang) VALUES($1, $2, $3, $4) 
    ON CONFLICT (id) DO NOTHING 
    RETURNING *
  `;
  try {
    const res = await query(insertText, [sessionId, 'active', 'en', 'en']);
    if (res.rows[0]) return res.rows[0];

    // Fallback: If session exists, fetch it to get current languages
    const selectRes = await query('SELECT * FROM sessions WHERE id = $1', [sessionId]);
    return selectRes.rows[0] || { id: sessionId, status: 'active', agent_lang: 'en', customer_lang: 'en' };
  } catch (err) {
    console.warn(`[DB] createSession error for ${sessionId}:`, err.message);
    return { id: sessionId, status: 'active', agent_lang: 'en', customer_lang: 'en' };
  }
};

const updateSessionLanguage = async (sessionId, role, lang) => {
  const column = role === 'agent' ? 'agent_lang' : 'customer_lang';
  const text = `UPDATE sessions SET ${column} = $1 WHERE id = $2`;
  try {
    await query(text, [lang, sessionId]);
    return true;
  } catch (err) {
    console.error(`Error updating session language:`, err);
    return false;
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
  // Use a safer query that handles missing 'status' column gracefully
  const text = 'SELECT id, created_at FROM sessions ORDER BY created_at DESC LIMIT $1';
  try {
    const res = await query(text, [limit]);
    return res.rows.map(row => ({ ...row, status: row.status || 'active' }));
  } catch (err) {
    console.error('Error listing sessions', err);
    return [];
  }
};


module.exports = {
  createSession,
  updateSessionLanguage,
  getSessionHistory,
  saveMessage,
  listSessions
};

