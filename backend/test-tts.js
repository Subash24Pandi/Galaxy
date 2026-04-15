require('dotenv').config();
const { synthesizeSpeech } = require('./src/services/ttsService');

async function testTTS() {
  console.log('--- TTS Diagnostic Start ---');
  try {
    const testText = 'Hello, this is a technical diagnostic for Galaxy Bridge.';
    console.log(`Input: "${testText}"`);
    console.log('Requesting synthesis from Sarvam AI...');
    
    const base64 = await synthesizeSpeech(testText, 'en-IN');
    
    if (!base64) {
      console.error('FAILED: Received empty response from TTS service.');
      return;
    }

    console.log('SUCCESS: Voice data received!');
    console.log(`Data Size: ${base64.length} characters`);
    console.log(`Start of Data: ${base64.substring(0, 50)}...`);
    
    // Check for common WAV/MP3 signatures in base64
    const binaryPrefix = Buffer.from(base64.substring(0, 20), 'base64').toString('hex');
    console.log(`Binary Prefix (Hex): ${binaryPrefix}`);

    if (binaryPrefix.includes('52494646')) {
      console.log('Format Detected: RIFF/WAVE (Playable)');
    } else {
      console.log('Format Detected: Raw PCM or Unknown (Might need header)');
    }

  } catch (err) {
    console.error('CRITICAL FAILURE during TTS Synthesis:');
    console.error(err.message);
  }
  console.log('--- Diagnostic End ---');
}

testTTS();
