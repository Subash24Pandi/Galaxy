require('dotenv').config();

async function listVoices() {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  console.log('--- ElevenLabs Voice Discovery ---');
  try {
    const response = await fetch('https://api.elevenlabs.io/v1/voices', {
      method: 'GET',
      headers: { 'xi-api-key': apiKey }
    });
    
    if (!response.ok) {
        const err = await response.text();
        throw new Error(`Failed: ${response.status} - ${err}`);
    }

    const data = await response.json();
    console.log(`Found ${data.voices.length} voices on your account:`);
    data.voices.slice(0, 10).forEach(v => {
      console.log(`- ${v.name}: ${v.voice_id} (${v.category})`);
    });
  } catch (err) {
    console.error(err.message);
  }
}

listVoices();
