const { createSession, getSessionHistory } = require('../models/sessionModel');

const createNewSession = async (req, res) => {
  try {
    const session = await createSession();
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

module.exports = {
  createNewSession,
  getSessionHistoryController
};
