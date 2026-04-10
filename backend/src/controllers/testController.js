const multer = require('multer');
const sttService = require('../services/sttService');
const translationService = require('../services/translationService');
const ttsService = require('../services/ttsService');

// Use memory storage for fast processing without saving locally
const upload = multer({ storage: multer.memoryStorage() });

const testStt = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file uploaded. Send via multipart/form-data with field name "audio".' });
    }
    const language = req.body.language || 'en';
    
    // Convert buffer to base64
    const audioBase64 = req.file.buffer.toString('base64');
    
    const transcript = await sttService.transcribeAudio(audioBase64, language);
    res.status(200).json({ success: true, language, transcript });
  } catch (error) {
    console.error('STT Test Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

const testTranslation = async (req, res) => {
  try {
    const { text, sourceLang, targetLang } = req.body;
    if (!text || !sourceLang || !targetLang) {
      return res.status(400).json({ error: 'Missing required fields: text, sourceLang, targetLang' });
    }

    const translatedText = await translationService.translateText(text, sourceLang, targetLang);
    res.status(200).json({ success: true, original: text, translatedText });
  } catch (error) {
    console.error('Translation Test Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

const testTts = async (req, res) => {
  try {
    const { text, language } = req.body;
    if (!text) {
      return res.status(400).json({ error: 'Missing required field: text' });
    }

    const audioBase64 = await ttsService.synthesizeSpeech(text, language || 'en');
    
    // Convert base64 back to a buffer and send as a playable audio file response
    const audioBuffer = Buffer.from(audioBase64, 'base64');
    
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', audioBuffer.length);
    res.send(audioBuffer);

  } catch (error) {
    console.error('TTS Test Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = {
  upload,
  testStt,
  testTranslation,
  testTts
};
