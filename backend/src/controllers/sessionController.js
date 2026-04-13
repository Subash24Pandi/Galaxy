const { createSession, getSessionHistory, listSessions } = require('../models/sessionModel');

const createNewSession = async (req, res) => {
  try {
    const { customId } = req.body;
    const session = await createSession(customId);
    res.status(201).json({ success: true, session });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error while creating session' });
  }
};


const getSessionHistoryController = async (req, res) => {
  try {
    const { id } = req.params;
    const history = await getSessionHistory(id);
    res.status(200).json({ success: true, history });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error while fetching history' });
  }
};

const getRecentSessions = async (req, res) => {
  try {
    const sessions = await listSessions(10);
    res.status(200).json({ success: true, sessions });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error while listing sessions' });
  }
};

module.exports = {
  createNewSession,
  getSessionHistoryController,
  getRecentSessions
};
