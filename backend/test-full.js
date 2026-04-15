require('dotenv').config();
const stt = require('./src/services/sttService');
const nmt = require('./src/services/translationService');
const tts = require('./src/services/ttsService');

async function testFullPipeline() {
  console.log('--- FULL PIPELINE TEST START ---');
  try {
    // 1. Mock Transcription (Simulate "Hello how are you" in Tamil)
    const testText = "ஹலோ, நீங்கள் எப்படி இருக்கிறீர்கள்?"; 
    console.log(`[1] Start with Tamil: "${testText}"`);

    // 2. Test NMT Translation (ta -> hi)
    console.log('[2] Testing NMT (ta -> hi)...');
    const translated = await nmt.translateText(testText, 'ta-IN', 'hi-IN');
    console.log(`[2] Translation Result: "${translated}"`);

    // 3. Test TTS Synthesis (Hindi)
    console.log('[3] Testing TTS for Hindi...');
    const voiceData = await tts.synthesizeSpeech(translated, 'hi-IN');
    console.log(`[3] TTS SUCCESS. Received ${voiceData.length} bytes.`);

    console.log('--- ALL SYSTEMS GREEN 🟢 ---');
  } catch (err) {
    console.error('--- PIPELINE FAILURE 🔴 ---');
    console.error(err.message);
  }
}

testFullPipeline();
