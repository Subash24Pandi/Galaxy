const express = require('express');
const router = express.Router();
const sessionController = require('../controllers/sessionController');

// Route to create a new session
router.post('/', sessionController.createNewSession);

// Route to get session history
router.get('/:id/history', sessionController.getSessionHistoryController);

module.exports = router;
