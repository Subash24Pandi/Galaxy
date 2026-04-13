import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { Mic, MicOff, PhoneOff, MessageSquare, ShieldCheck, Activity, Globe, Send } from 'lucide-react';

const ActiveCall = () => {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const { role, inputLang, outputLang } = location.state || {
    role: 'agent', inputLang: 'en', outputLang: 'hi'
  };

  const [socket, setSocket] = useState(null);
  const [status, setStatus] = useState('Connecting...');
  const [messages, setMessages] = useState([]);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [volume, setVolume] = useState(0);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const streamRef = useRef(null);
  const pcmDataRef = useRef([]); // Stores raw PCM samples
  const isRecordingRef = useRef(false);
  const chatEndRef = useRef(null); // Fixed: Restored missing ref

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'https://galaxy-translator.onrender.com';
    console.log('[Socket] Connecting to:', BACKEND_URL);
    
    const newSocket = io(BACKEND_URL, { 
      transports: ['websocket'],
      reconnectionAttempts: 5,
      timeout: 10000
    });
    
    setSocket(newSocket);

    newSocket.on('connect', () => {
      console.log('[Socket] Connected!', newSocket.id);
      newSocket.emit('join_session', { sessionId: id, role, inputLang, outputLang });
      setStatus('Ready');
    });

    newSocket.on('connect_error', (err) => {
      console.error('[Socket] Connection error:', err);
      // Stringify the error object so it's readable in the UI
      const errDetail = typeof err === 'object' ? JSON.stringify(err) : String(err);
      setStatus(`Connect Error: ${errDetail}`);
    });

    newSocket.on('error', (err) => {
      console.error('[Socket] General error:', err);
      const errDetail = typeof err === 'object' ? JSON.stringify(err) : String(err);
      setStatus(`Error: ${errDetail}`);
    });
    
    newSocket.on('session_status', (data) => setStatus(data.message));
    newSocket.on('transcript_update', (data) => setMessages((prev) => [...prev, data]));
    
    newSocket.on('audio_playback', (data) => {
      if (data.targetRole === role && data.audioBase64) {
        console.log('[Socket] Audio received, playing...');
        playPcmAudio(data.audioBase64);
      }
    });

    // Helper: Wrap raw PCM in a WAV header so the browser can play it
    const playPcmAudio = (base64) => {
      try {
        const binaryString = window.atob(base64);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);

        const wavHeader = new ArrayBuffer(44);
        const view = new DataView(wavHeader);
        
        // RIFF chunk descriptor
        view.setUint32(0, 0x52494646, false); // "RIFF"
        view.setUint32(4, 36 + len, true);
        view.setUint32(8, 0x57415645, false); // "WAVE"
        
        // fmt sub-chunk
        view.setUint32(12, 0x666d7420, false); // "fmt "
        view.setUint32(16, 16, true); // Subchunk1Size
        view.setUint16(20, 1, true);  // AudioFormat (1 = PCM)
        view.setUint16(22, 1, true);  // NumChannels
        view.setUint32(24, 16000, true); // SampleRate (Sarvam default)
        view.setUint32(28, 16000 * 2, true); // ByteRate
        view.setUint16(32, 2, true);  // BlockAlign
        view.setUint16(34, 16, true); // BitsPerSample
        
        // data sub-chunk
        view.setUint32(36, 0x64617461, false); // "data"
        view.setUint32(40, len, true);

        const blob = new Blob([wavHeader, bytes], { type: 'audio/wav' });
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.play().catch(e => console.error('Playback failed:', e));
      } catch (e) {
        console.error('Audio processing failed:', e);
      }
    };

    return () => {
      console.log('[Socket] Disconnecting...');
      newSocket.off('connect');
      newSocket.off('connect_error');
      newSocket.off('error');
      newSocket.disconnect();
    };
  }, [id, role, inputLang, outputLang]);

  const stopAndSend = useCallback(() => {
    if (isRecordingRef.current) {
      isRecordingRef.current = false;
      setIsSpeaking(false);
      
      const pcmBuffer = pcmDataRef.current;
      if (pcmBuffer.length === 0) {
        console.warn('[VAD] No audio captured');
        return;
      }

      // Convert captured PCM to 16-bit WAV
      const wavBlob = encodeWAV(pcmBuffer, 16000);
      pcmDataRef.current = []; // Clear for next utterance

      if (wavBlob.size < 500) {
        console.warn('[VAD] Audio too short');
        return;
      }

      const reader = new FileReader();
      reader.readAsDataURL(wavBlob);
      reader.onloadend = () => {
        const base64data = reader.result.split(',')[1];
        if (socket && base64data.length > 500) {
          socket.emit('audio_utterance', { sessionId: id, role, audioBase64: base64data });
        }
      };
    }
  }, [socket, id, role]);

  const startNewRecording = useCallback(() => {
    if (isMuted || isRecordingRef.current) return;
    pcmDataRef.current = [];
    isRecordingRef.current = true;
    setIsSpeaking(true);
  }, [isMuted]);

  const encodeWAV = (samples, sampleRate) => {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);

    const writeString = (offset, string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 32 + samples.length * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, samples.length * 2, true);

    let offset = 44;
    for (let i = 0; i < samples.length; i++, offset += 2) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }

    return new Blob([buffer], { type: 'audio/wav' });
  };

  useEffect(() => {
    const initVAD = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          audio: { 
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            channelCount: 1,   // Mono is faster to process
            sampleRate: 16000  // 16kHz is ideal for STT
          } 
        });
        streamRef.current = stream;

        const audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
        const analyser = audioContext.createAnalyser();
        const source = audioContext.createMediaStreamSource(stream);
        
        // Custom Processor for raw PCM capture
        const processor = audioContext.createScriptProcessor(4096, 1, 1);
        
        processor.onaudioprocess = (e) => {
          if (isRecordingRef.current) {
            const inputData = e.inputBuffer.getChannelData(0);
            pcmDataRef.current.push(...inputData);
          }
        };

        analyser.fftSize = 256; 
        source.connect(analyser);
        source.connect(processor);
        processor.connect(audioContext.destination);
        
        audioContextRef.current = audioContext;
        analyserRef.current = analyser;

        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        
        // TUNED: Higher than background noise (0.0062 in screenshot)
        const THRESHOLD = 0.015;
        // Faster response
        const SILENCE_DURATION = 500;
        let lastSpeechTime = Date.now();

        const checkAudio = () => {
          if (isMuted) {
            setVolume(0);
            setIsSpeaking(false);
            if (isRecordingRef.current) stopAndSend();
            requestAnimationFrame(checkAudio);
            return;
          }

          analyser.getByteTimeDomainData(dataArray);
          
          let sum = 0;
          for (let i = 0; i < bufferLength; i++) {
            const amp = (dataArray[i] / 128) - 1;
            sum += amp * amp;
          }
          const rms = Math.sqrt(sum / bufferLength);
          setVolume(rms);

          if (rms > THRESHOLD) {
            lastSpeechTime = Date.now();
            if (!isRecordingRef.current) startNewRecording();
          } else {
            if (isRecordingRef.current && (Date.now() - lastSpeechTime > SILENCE_DURATION)) {
              stopAndSend();
            }
          }
          requestAnimationFrame(checkAudio);
        };

        checkAudio();
      } catch (err) {
        console.error('Microphone access failed:', err);
        setStatus('Microphone Error');
      }
    };

    if (isMuted) {
       setVolume(0);
       setIsSpeaking(false);
       if (isRecordingRef.current) stopAndSend();
    }
    
    initVAD();
    
    return () => {
      console.log('[Cleanup] Stopping audio context and stream...');
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(e => console.warn('Context close ignored:', e));
      }
    };
  }, [isMuted, startNewRecording, stopAndSend]);

  const leaveCall = () => {
    if (socket) socket.disconnect();
    navigate('/');
  };

  const formatTime = (isoString) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="container" style={{ display: 'flex', flexDirection: 'column', height: '100vh', padding: isMobile ? '0.5rem' : '1.5rem', maxWidth: '1400px' }}>
      
      {/* Header */}
      <div className="glass-panel" style={{ 
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
        padding: isMobile ? '1rem' : '1.5rem 2.5rem', marginBottom: isMobile ? '0.5rem' : '1.5rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '0.75rem' : '1.5rem' }}>
          <div style={{ 
            width: isMobile ? '40px' : '56px', height: isMobile ? '40px' : '56px', 
            borderRadius: '12px', background: 'var(--accent-primary)', 
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 8px 32px -4px rgba(99, 102, 241, 0.4)'
          }}>
            <ShieldCheck size={isMobile ? 20 : 28} color="white" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <h2 style={{ fontSize: isMobile ? '0.9rem' : '1.25rem', fontWeight: '700' }}>Session: {id}</h2>
              <div style={{ 
                padding: '0.2rem 0.5rem', borderRadius: '6px', fontSize: '0.6rem', fontWeight: '800', 
                background: 'rgba(255,255,255,0.08)', border: '1px solid var(--glass-border)', color: 'var(--accent-secondary)'
              }}>{role.toUpperCase()}</div>
            </div>
            {socket?.id && (
              <div style={{ fontSize: '0.65rem', opacity: 0.5, color: 'var(--accent-primary)', display: 'flex', gap: '1rem' }}>
                <span>Socket: {socket.id}</span>
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {!isMobile && (
            <div className="glass-panel" style={{ padding: '0.75rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.75rem', borderRadius: '14px' }}>
               <Globe size={18} color="var(--accent-tertiary)" />
               <span style={{ fontSize: '0.9rem', fontWeight: '600' }}>{inputLang.toUpperCase()} &rarr; {outputLang.toUpperCase()}</span>
            </div>
          )}
          <button 
            onClick={() => { if(isRecordingRef.current) stopAndSend(); }}
            className="btn-primary" 
            style={{ 
              padding: isMobile ? '0.5rem' : '0.75rem 1.5rem', borderRadius: '12px', width: 'auto',
              background: isSpeaking ? 'var(--accent-secondary)' : 'rgba(255,255,255,0.1)',
              display: isSpeaking ? 'flex' : 'none'
            }}
          >
            <Send size={18} /> Send Now
          </button>
          <button onClick={leaveCall} className="btn-outline" style={{ 
            background: 'rgba(239, 68, 68, 0.1)', color: '#f87171', border: '1px solid rgba(239, 68, 68, 0.2)', 
            padding: isMobile ? '0.5rem' : '0.75rem 1.5rem', borderRadius: '12px', width: 'auto'
          }}>
            <PhoneOff size={isMobile ? 18 : 20} /> {!isMobile && 'End'}
          </button>
        </div>
      </div>

      {/* Main Translation Arena */}
      <div className="glass-panel" style={{ 
        flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', 
        gap: isMobile ? '1.25rem' : '2rem', padding: isMobile ? '1.5rem 1rem' : '3rem', 
        background: 'rgba(15, 23, 42, 0.3)', borderRadius: isMobile ? '20px' : '32px'
      }}>
        {messages.length === 0 ? (
          <div style={{ margin: 'auto', textAlign: 'center', opacity: 0.7, maxWidth: '360px' }}>
            <MessageSquare size={isMobile ? 32 : 48} color="white" style={{ marginBottom: '1.25rem' }} />
            <p style={{ fontSize: isMobile ? '1.1rem' : '1.4rem', fontWeight: '700', marginBottom: '1rem' }}>How to Use</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', textAlign: 'left' }}>
              <div className="glass-panel" style={{ padding: '0.75rem 1rem', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ fontSize: '1.4rem' }}>1️⃣</span>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Make sure the second person has joined the session too.</span>
              </div>
              <div className="glass-panel" style={{ padding: '0.75rem 1rem', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ fontSize: '1.4rem' }}>2️⃣</span>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Allow microphone access when your browser asks.</span>
              </div>
              <div className="glass-panel" style={{ padding: '0.75rem 1rem', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ fontSize: '1.4rem' }}>3️⃣</span>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Just <strong>speak naturally</strong> — pause for 1 second when done. The visualizer below will glow when your mic is active.</span>
              </div>
              <div className="glass-panel" style={{ padding: '0.75rem 1rem', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ fontSize: '1.4rem' }}>4️⃣</span>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Your translated voice will play automatically on the other device.</span>
              </div>
            </div>
          </div>
        ) : (
          messages.map((msg, idx) => {
            const isMe = msg.role === role;
            return (
              <div key={idx} style={{ 
                alignSelf: isMe ? 'flex-end' : 'flex-start', maxWidth: isMobile ? '90%' : '70%', display: 'flex', 
                flexDirection: 'column', gap: '0.5rem', animation: 'fadeIn 0.5s ease-out'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', justifyContent: isMe ? 'flex-end' : 'flex-start', padding: '0 0.5rem' }}>
                  <span style={{ fontSize: '0.7rem', fontWeight: '800', color: isMe ? 'var(--accent-primary)' : 'var(--accent-tertiary)' }}>
                    {isMe ? 'YOU' : 'OTHER'}
                  </span>
                </div>
                <div style={{ 
                  background: isMe ? 'rgba(99, 102, 241, 0.2)' : 'rgba(30, 41, 59, 0.8)',
                  padding: isMobile ? '1rem' : '1.75rem 2rem', 
                  borderRadius: isMe ? '20px 20px 4px 20px' : '20px 20px 20px 4px',
                  border: '1px solid var(--glass-border)', backdropFilter: 'blur(10px)'
                }}>
                  <div style={{ fontSize: isMobile ? '0.85rem' : '1rem', fontStyle: 'italic', opacity: 0.6, marginBottom: '0.5rem' }}>
                    "{msg.originalText}"
                  </div>
                  <div style={{ fontSize: isMobile ? '1.1rem' : '1.4rem', fontWeight: '600', lineHeight: '1.3' }}>
                    {msg.translatedText}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Footer */}
      <div style={{ 
        display: 'flex', flexDirection: isMobile ? 'column-reverse' : 'row', 
        alignItems: 'center', justifyContent: 'space-between', 
        padding: isMobile ? '1rem 0' : '2.5rem 1rem', gap: '1.5rem'
      }}>
        
        <div style={{ width: isMobile ? '100%' : 'auto' }}>
          <button
            onClick={() => setIsMuted(!isMuted)}
            style={{
              padding: '0.85rem 1.5rem', borderRadius: '14px', background: isMuted ? 'rgba(239, 68, 68, 0.12)' : 'rgba(255, 255, 255, 0.05)',
              border: `1px solid ${isMuted ? 'rgba(239, 68, 68, 0.2)' : 'var(--glass-border)'}`,
              color: isMuted ? '#f87171' : 'white', fontWeight: '700', cursor: 'pointer', transition: 'all 0.3s',
              display: 'flex', alignItems: 'center', gap: '0.75rem', width: isMobile ? '100%' : 'auto', justifyContent: 'center'
            }}
          >
            {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
            {isMuted ? 'Mic Off' : 'Hands-Free'}
          </button>
        </div>

        <div style={{ 
          display: 'flex', gap: '4px', height: '40px', alignItems: 'center', flex: 1, justifyContent: 'center',
          opacity: isMuted ? 0.1 : 1, transition: 'opacity 0.5s', width: '100%'
        }}>
          {[...Array(isMobile ? 16 : 32)].map((_, i) => (
            <div key={i} style={{
              width: isMobile ? '4px' : '6px',
              background: isSpeaking ? 'var(--accent-primary)' : 'var(--glass-border)',
              borderRadius: '12px',
              height: `${6 + (volume * 800 * (0.5 + Math.random()))}px`,
              maxHeight: '100%',
              transition: 'height 0.15s ease-out'
            }} />
          ))}
        </div>

        {!isMobile && (
          <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: '700', letterSpacing: '0.1em' }}>
             {isSpeaking ? 'RECORDING' : 'IDLE'}
          </div>
        )}
      </div>
    </div>
  );
};

export default ActiveCall;