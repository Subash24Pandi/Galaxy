const express = require('express');
const router = express.Router();
const testController = require('../controllers/testController');

// STT test route: Requires multipart/form-data upload
router.post('/stt', testController.upload.single('audio'), testController.testStt);

// Translation test route: Expects JSON
router.post('/translation', testController.testTranslation);

// TTS test route: Expects JSON, returns audio/mpeg
router.post('/tts', testController.testTts);

module.exports = router;
