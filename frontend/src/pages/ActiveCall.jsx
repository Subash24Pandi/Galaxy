import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { ShieldCheck, PhoneOff, Globe, MessageSquare, MicOff, Mic, Activity, Sparkles, ArrowRight } from 'lucide-react';


const ActiveCall = () => {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const { role, inputLang } = location.state || { role: 'agent', inputLang: 'ta' };
  
  // Zero-Config: We track the target language live from the Peer
  const [targetLang, setTargetLang] = useState(location.state?.outputLang || 'en');
  const [status, setStatus] = useState('Connecting...');
  const [messages, setMessages] = useState([]);
  const [isMuted, setIsMuted] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isReceiverPlaying, setIsReceiverPlaying] = useState(false);
  const [volume, setVolume] = useState(0);

  // For the visual wave
  useEffect(() => {
    setIsSpeaking(volume > 0.005);
  }, [volume]);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  const socketRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const streamRef = useRef(null);
  const pcmDataRef = useRef([]); 
  const isRecordingRef = useRef(false);
  const recordingStartTimeRef = useRef(null);
  const isMutedRef = useRef(true); 
  const chatEndRef = useRef(null);
  const targetLangRef = useRef(targetLang);

  // Keep Ref in sync with state for long-running closures (VAD loop)
  useEffect(() => {
    targetLangRef.current = targetLang;
  }, [targetLang]);

  useEffect(() => {
    const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
    const socket = io(BACKEND_URL);
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('join-session', { sessionId: id, role });
      // Sync my language immediately on join
      socket.emit('update_language', { sessionId: id, role, lang: inputLang });
      setStatus('Online');
    });

    socket.on('session_status', (data) => setStatus(data.message));
    socket.on('transcript_update', (data) => setMessages((prev) => [...prev, data]));
    
    // Auto-detect Peer's language
    socket.on('peer_language_updated', ({ lang }) => {
      console.log(`[Sync] Peer updated language to: ${lang}`);
      setTargetLang(lang);
    });

    // Initial Handshake Sync for Zero-Config
    socket.on('initial_sync', ({ agentLang, customerLang }) => {
      const peerLang = role === 'agent' ? customerLang : agentLang;
      console.log(`[Sync] Handshake received. Setting Peer Language to: ${peerLang}`);
      setTargetLang(peerLang);
    });

    socket.on('audio_playback', async (data) => {
      if (data.targetRole === role && data.audioBase64) {
        try {
          if (!audioContextRef.current) return;
          if (audioContextRef.current.state === 'suspended') await audioContextRef.current.resume();

          const binaryString = window.atob(data.audioBase64);
          const len = binaryString.length;
          const bytes = new Uint8Array(len);
          for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);
          
          const audioBuffer = await audioContextRef.current.decodeAudioData(bytes.buffer);
          const source = audioContextRef.current.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(audioContextRef.current.destination);
          
          setIsReceiverPlaying(true);
          source.onended = () => setIsReceiverPlaying(false);
          
          source.start(0);
        } catch (err) {
          console.error('[Audio-Playback] Failed to play TTS:', err);
        }
      }
    });

    return () => socket.disconnect();
  }, [id, role, inputLang]);

  const stopAndSend = useCallback(async () => {
    if (isRecordingRef.current) {
      isRecordingRef.current = false;
      setIsSpeaking(false);
      
      const pcmBuffer = pcmDataRef.current;
      if (pcmBuffer.length === 0) return;

      const wavBlob = encodeWAV(pcmBuffer, 16000);
      pcmDataRef.current = [];

      const reader = new FileReader();
      reader.readAsDataURL(wavBlob);
      reader.onloadend = async () => {
        const base64data = reader.result.split(',')[1];
        if (base64data.length > 500) {
          const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
          await fetch(`${BACKEND_URL}/api/audio`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              sessionId: id, 
              role, 
              audioBase64: base64data,
              inputLang,
              outputLang: targetLangRef.current // Use the Live Ref to avoid stale captures
            })
          });
        }
      };
    }
  }, [id, role, inputLang, targetLang]);

  const startNewRecording = useCallback(() => {
    if (isRecordingRef.current) return;
    if (audioContextRef.current?.state === 'suspended') audioContextRef.current.resume();
    pcmDataRef.current = [];
    isRecordingRef.current = true;
    setIsSpeaking(true);
  }, []);

  const encodeWAV = (samples, sampleRate) => {
    const inputSampleRate = audioContextRef.current?.sampleRate || 44100;
    const resampledData = downsampleBuffer(samples, inputSampleRate, 16000);
    const buffer = new ArrayBuffer(44 + resampledData.length * 2);
    const view = new DataView(buffer);
    const writeString = (offset, string) => {
      for (let i = 0; i < string.length; i++) view.setUint8(offset + i, string.charCodeAt(i));
    };
    writeString(0, 'RIFF');
    view.setUint32(4, 32 + resampledData.length * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, 16000, true);
    view.setUint32(28, 32000, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, resampledData.length * 2, true);
    let offset = 44;
    for (let i = 0; i < resampledData.length; i++, offset += 2) {
      const s = Math.max(-1, Math.min(1, resampledData[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }
    return new Blob([buffer], { type: 'audio/wav' });
  };

  const downsampleBuffer = (buffer, inputSampleRate, targetSampleRate) => {
    if (inputSampleRate === targetSampleRate) return buffer;
    const sampleRateRatio = inputSampleRate / targetSampleRate;
    const newLength = Math.round(buffer.length / sampleRateRatio);
    const result = new Float32Array(newLength);
    let offsetResult = 0, offsetBuffer = 0;
    while (offsetResult < result.length) {
      const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
      let accum = 0, count = 0;
      for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
        accum += buffer[i];
        count++;
      }
      result[offsetResult] = accum / count;
      offsetResult++;
      offsetBuffer = nextOffsetBuffer;
    }
    return result;
  };

  const isInitializedRef = useRef(false);
  const rafRef = useRef(null);

  useEffect(() => {
    const initVAD = async () => {
      if (isInitializedRef.current) return;
      isInitializedRef.current = true;

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } 
        });
        streamRef.current = stream;

        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        audioContextRef.current = audioContext;

        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        analyserRef.current = analyser;

        const source = audioContext.createMediaStreamSource(stream);
        const processor = audioContext.createScriptProcessor(4096, 1, 1);
        
        processor.onaudioprocess = (e) => {
          if (isRecordingRef.current) {
            pcmDataRef.current.push(...e.inputBuffer.getChannelData(0));
          }
        };

        source.connect(analyser);
        source.connect(processor);
        processor.connect(audioContext.destination);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const THRESHOLD = 0.0005; // More sensitive for whispered/quiet speech
        const SILENCE_DURATION = 1200;
        let lastSpeechTime = Date.now();

        const checkAudio = () => {
          if (!isInitializedRef.current || !analyserRef.current) return;
          
          analyserRef.current.getByteTimeDomainData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            const amp = (dataArray[i] / 128) - 1;
            sum += amp * amp;
          }
          const rms = Math.sqrt(sum / dataArray.length);

          if (isMutedRef.current) {
            setVolume(0);
            if (isRecordingRef.current) stopAndSend();
          } else {
            setVolume(rms);
            if (rms > THRESHOLD) {
              lastSpeechTime = Date.now();
              if (!isRecordingRef.current) {
                startNewRecording();
                recordingStartTimeRef.current = Date.now();
              }
            }
            
            const duration = recordingStartTimeRef.current ? (Date.now() - recordingStartTimeRef.current) : 0;
            if (isRecordingRef.current && (duration > 25000 || Date.now() - lastSpeechTime > SILENCE_DURATION)) {
              stopAndSend();
              recordingStartTimeRef.current = null;
            }
          }
          rafRef.current = requestAnimationFrame(checkAudio);
        };

        checkAudio();
      } catch (err) {
        console.error('VAD Init Failed:', err);
        setStatus('Mic Error');
      }
    };

    initVAD();

    return () => {
      isInitializedRef.current = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      if (audioContextRef.current?.state !== 'closed') audioContextRef.current?.close();
    };
  }, [startNewRecording, stopAndSend]);

  const leaveCall = () => { navigate('/'); };

  return (
    <div className="container" style={{ display: 'flex', flexDirection: 'column', height: '100vh', padding: isMobile ? '1rem' : '1.5rem', maxWidth: '1400px' }}>
      
      {/* Cinematic Header */}
      <div className="glass-panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.25rem 2rem', marginBottom: '1.5rem', border: '1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <div className="hover-glow" style={{ width: '50px', height: '50px', borderRadius: '14px', background: 'var(--accent-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Activity size={24} color="white" />
          </div>
          <div>
            <h2 style={{ fontSize: '1.2rem', fontWeight: '700' }}>{id}</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', fontSize: '0.7rem' }}>
              <span style={{ color: 'var(--accent-secondary)', fontWeight: '800' }}>● {status.toUpperCase()}</span>
              {isReceiverPlaying && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--accent-tertiary)', animation: 'pulse 1s infinite' }}>
                  <Sparkles size={12} />
                  <span>HEARING PEER...</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <div className="glass-panel" style={{ padding: '0.6rem 1.2rem', borderRadius: '12px', fontSize: '0.85rem', fontWeight: '600', display: 'flex', gap: '0.5rem' }}>
            <span style={{ color: 'var(--accent-secondary)' }}>YOU: {inputLang.toUpperCase()}</span>
            <ArrowRight size={14} style={{ opacity: 0.3 }} />
            <span style={{ color: 'var(--accent-tertiary)' }}>PEER: {targetLang.toUpperCase()}</span>
          </div>
          <button onClick={leaveCall} className="btn-secondary" style={{ padding: '0.6rem 1.2rem', color: '#f87171' }}>
            <PhoneOff size={18} />
          </button>
        </div>
      </div>

      {/* Arena */}
      <div className="glass-panel" style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '1.5rem' : '2.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', background: 'rgba(2, 6, 23, 0.4)', borderRadius: '32px' }}>
        {messages.length === 0 ? (
          <div style={{ margin: 'auto', textAlign: 'center', maxWidth: '400px', opacity: 0.6 }}>
            <Sparkles size={48} color="var(--accent-primary)" style={{ marginBottom: '1.5rem' }} />
            <h3 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Bridge Active</h3>
            <p style={{ fontSize: '0.95rem' }}>Talk naturally. The system will automatically translate and stream your voice to the peer using Zero-Config Pairing.</p>
          </div>
        ) : (
          messages.map((msg, idx) => (
            <div key={idx} style={{ alignSelf: msg.role === role ? 'flex-end' : 'flex-start', maxWidth: isMobile ? '90%' : '70%', animation: 'fadeIn 0.5s ease-out' }}>
              <div style={{ 
                background: msg.role === role ? 'rgba(99, 102, 241, 0.1)' : 'rgba(255,255,255,0.02)',
                padding: '1.5rem 2rem', borderRadius: '24px', border: '1px solid var(--glass-border)'
              }}>
                <div style={{ fontSize: '0.8rem', opacity: 0.5, fontStyle: 'italic', marginBottom: '0.5rem' }}>"{msg.originalText}"</div>
                <div style={{ fontSize: '1.1rem', fontWeight: '700' }}>{msg.translatedText}</div>
              </div>
            </div>
          ))
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Control Bar */}
      <div style={{ padding: '2.5rem 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '2rem' }}>
        <button
          onClick={async () => { 
            if (audioContextRef.current?.state === 'suspended') await audioContextRef.current.resume();
            isMutedRef.current = !isMuted; 
            setIsMuted(!isMuted); 
          }}
          className="btn-primary"
          style={{ 
            background: isMuted ? 'rgba(244, 63, 94, 0.1)' : 'linear-gradient(135deg, var(--accent-primary), #4f46e5)',
            color: isMuted ? '#f43f5e' : 'white',
            border: isMuted ? '1px solid rgba(244, 63, 94, 0.2)' : 'none',
            flex: isMobile ? 1 : 'none', minWidth: '220px',
            boxShadow: (!isMuted && volume > 0.01) ? '0 0 20px var(--accent-primary)' : 'none',
            transition: 'all 0.3s ease'
          }}
        >
          {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
          {isMuted ? 'Mic is Off' : 'Mic is Live'}
        </button>

        <div className="wave-container" style={{ flex: 1, justifyContent: 'center', opacity: isMuted ? 0.1 : 1 }}>
          {[...Array(isMobile ? 12 : 24)].map((_, i) => (
            <div key={i} className="wave-bar" style={{ height: `${8 + (volume * 600 * (0.4 + Math.random()))}px`, animationPlayState: isSpeaking ? 'running' : 'paused' }} />
          ))}
        </div>

        {!isMobile && <div style={{ flex: 1, textAlign: 'right', fontWeight: '800', color: isSpeaking ? 'var(--accent-secondary)' : 'var(--text-muted)' }}>{isSpeaking ? 'TRANSMITTING' : 'LISTENING'}</div>}
      </div>
    </div>
  );
};

export default ActiveCall;