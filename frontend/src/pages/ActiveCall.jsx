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

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const chatEndRef = useRef(null);
  
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const streamRef = useRef(null);
  const isRecordingRef = useRef(false);

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
    const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
    const newSocket = io(BACKEND_URL, { transports: ['websocket', 'polling'] });
    setSocket(newSocket);

    newSocket.on('connect', () => {
      newSocket.emit('join_session', { sessionId: id, role, inputLang, outputLang });
      setStatus('Ready');
    });

    newSocket.on('error', (err) => setStatus(`Error: ${err.message}`));
    newSocket.on('session_status', (data) => setStatus(data.message));
    newSocket.on('transcript_update', (data) => setMessages((prev) => [...prev, data]));
    
    newSocket.on('audio_playback', (data) => {
      if (data.targetRole === role && data.audioBase64) {
        const audio = new Audio(`data:audio/mp3;base64,${data.audioBase64}`);
        audio.play().catch((e) => console.error('Audio playback failed:', e));
      }
    });

    return () => newSocket.close();
  }, [id, role, inputLang, outputLang]);

  const stopAndSend = useCallback(() => {
    if (mediaRecorderRef.current && isRecordingRef.current) {
      mediaRecorderRef.current.stop();
      isRecordingRef.current = false;
      setIsSpeaking(false);
    }
  }, []);

  const startNewRecording = useCallback(() => {
    if (isMuted || isRecordingRef.current) return;
    
    audioChunksRef.current = [];
    const mediaRecorder = new MediaRecorder(streamRef.current);
    mediaRecorderRef.current = mediaRecorder;

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) audioChunksRef.current.push(event.data);
    };

    mediaRecorder.onstop = () => {
      const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
      const reader = new FileReader();
      reader.readAsDataURL(audioBlob);
      reader.onloadend = () => {
        const base64data = reader.result.split(',')[1];
        if (socket && base64data.length > 1000) {
          socket.emit('audio_utterance', { sessionId: id, role, audioBase64: base64data });
        }
      };
      if (!isMuted) startNewRecording();
    };

    mediaRecorder.start();
    isRecordingRef.current = true;
    setIsSpeaking(true);
  }, [isMuted, socket, id, role]);

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

        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const analyser = audioContext.createAnalyser();
        const source = audioContext.createMediaStreamSource(stream);
        
        analyser.fftSize = 256; // Smaller = faster analysis loop
        source.connect(analyser);
        
        audioContextRef.current = audioContext;
        analyserRef.current = analyser;

        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        
        // Tuned: picks up normal speech but ignores background hum
        const THRESHOLD = 0.02;
        // Tuned: faster send after pause
        const SILENCE_DURATION = 700;
        let lastSpeechTime = Date.now();

        const checkAudio = () => {
          if (isMuted) {
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

    if (!isMuted) initVAD();
    
    return () => {
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      if (audioContextRef.current) audioContextRef.current.close();
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
              <h2 style={{ fontSize: isMobile ? '0.9rem' : '1.25rem', fontWeight: '700' }}>ID: {id.substring(0, 4)}...</h2>
              <div style={{ 
                padding: '0.2rem 0.5rem', borderRadius: '6px', fontSize: '0.6rem', fontWeight: '800', 
                background: 'rgba(255,255,255,0.08)', border: '1px solid var(--glass-border)', color: 'var(--accent-secondary)'
              }}>{role.toUpperCase()}</div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {!isMobile && (
            <div className="glass-panel" style={{ padding: '0.75rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.75rem', borderRadius: '14px' }}>
               <Globe size={18} color="var(--accent-tertiary)" />
               <span style={{ fontSize: '0.9rem', fontWeight: '600' }}>{inputLang.toUpperCase()} &rarr; {outputLang.toUpperCase()}</span>
            </div>
          )}
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
              height: `${6 + (volume * 400 * (0.5 + Math.random()))}px`,
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