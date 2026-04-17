/**
 * ActiveCall — Real-time bilingual voice call interface
 * 
 * Pipeline per utterance:
 *  1. VAD detects speech → starts recording PCM
 *  2. Silence detected (or chunk threshold) → encodes WAV → sends to backend
 *  3. Backend: ElevenLabs STT → Sarvam Translate → ElevenLabs TTS
 *  4. Socket emits transcript_update (two-phase) + audio_playback to peer
 *  5. Peer plays audio via AudioContext
 * 
 * Streaming design:
 *  - Max chunk = 8s (forces frequent sends for low latency)
 *  - Silence threshold = 1.0s (quick sentence detection)
 *  - Overlapping chunks allowed (non-blocking pipeline)
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import {
  PhoneOff, Globe, MicOff, Mic, Activity, Sparkles,
  ArrowRight, Zap, Volume2, CheckCircle2, AlertCircle
} from 'lucide-react';

// ─── Constants ───────────────────────────────────────────────────────────────
// SOCKET connects directly to backend (localhost:5000)
// API fetch calls use Vite proxy ("/api/...") — no CORS needed
const SOCKET_URL  = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
const API_BASE    = import.meta.env.VITE_BACKEND_URL || ''; 
const SAMPLE_RATE = 16000;       // Hz — optimal for STT
const SILENCE_MS       = 500;     // 0.5s pause triggers translation — fast but natural
const MAX_CHUNK_MS     = 15000;   // Sentence cap
const VAD_THRESHOLD    = 0.05;    // Aggressive fan/AC filter
const MIN_AUDIO_BYTES  = 15000;   // Reject background noise and short hums
const STREAM_INTERVAL_MS = 999999; // End-of-sentence mode

const LANG_LABELS = {
  en: 'English', 'en-IN': 'English',
  hi: 'Hindi',   'hi-IN': 'Hindi',
  ta: 'Tamil',   'ta-IN': 'Tamil',
  te: 'Telugu',  'te-IN': 'Telugu',
  kn: 'Kannada', 'kn-IN': 'Kannada',
  ml: 'Malayalam','ml-IN': 'Malayalam',
  bn: 'Bengali', 'bn-IN': 'Bengali',
  gu: 'Gujarati','gu-IN': 'Gujarati',
  mr: 'Marathi', 'mr-IN': 'Marathi',
  or: 'Odiya',   'or-IN': 'Odiya',
  as: 'Assamese','as-IN': 'Assamese',
  bho: 'Bhojpuri','bho-IN': 'Bhojpuri',
};

// ─── Utility: Downsample PCM buffer to target sample rate ────────────────────
function downsampleBuffer(buffer, inputSR, outputSR) {
  if (inputSR === outputSR) return buffer;
  const ratio = inputSR / outputSR;
  const newLen = Math.round(buffer.length / ratio);
  const result = new Float32Array(newLen);
  for (let i = 0; i < newLen; i++) {
    const start  = Math.round(i * ratio);
    const end    = Math.round((i + 1) * ratio);
    let sum = 0, count = 0;
    for (let j = start; j < end && j < buffer.length; j++) { sum += buffer[j]; count++; }
    result[i] = count ? sum / count : 0;
  }
  return result;
}

// ─── Utility: Encode PCM Float32Array → WAV Blob ─────────────────────────────
function encodeWAV(samples, sampleRate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view   = new DataView(buffer);
  const wr     = (o, s) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
  wr(0,  'RIFF'); view.setUint32(4,  32 + samples.length * 2, true);
  wr(8,  'WAVE'); wr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20,  1, true);  // PCM
  view.setUint16(22,  1, true);  // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32,  2, true);   // Block align
  view.setUint16(34, 16, true);   // Bits per sample
  wr(36, 'data'); view.setUint32(40, samples.length * 2, true);
  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

// ─── Component ───────────────────────────────────────────────────────────────
const ActiveCall = () => {
  const { id }       = useParams();
  const location     = useLocation();
  const navigate     = useNavigate();

  const { role, inputLang } = location.state || { role: 'agent', inputLang: 'ta' };
  const initialOutLang = location.state?.outputLang || 'en';

  const [targetLang,        setTargetLang]        = useState(initialOutLang);
  const [status,            setStatus]            = useState('Connecting...');
  const [statusType,        setStatusType]        = useState('info'); // info | error | success
  const [messages,          setMessages]          = useState([]);
  const [isMuted,           setIsMuted]           = useState(true);
  const [volume,            setVolume]            = useState(0);
  const [isSpeaking,        setIsSpeaking]        = useState(false);
  const [isPeerPlaying,     setIsPeerPlaying]     = useState(false);
  const [isPipelineActive,  setIsPipelineActive]  = useState(false);
  const [isMobile,          setIsMobile]          = useState(window.innerWidth < 768);

  // Refs (never cause re-renders, safe in closures)
  const socketRef            = useRef(null);
  const audioContextRef      = useRef(null);
  const analyserRef          = useRef(null);
  const streamRef            = useRef(null);
  const processorRef         = useRef(null);
  const pcmDataRef           = useRef([]);
  const isRecordingRef       = useRef(false);
  const recordingStartRef    = useRef(null);
  const lastSpeechTimeRef    = useRef(Date.now());
  const isMutedRef           = useRef(true);
  const targetLangRef        = useRef(initialOutLang);
  const chatEndRef           = useRef(null);
  const rafRef               = useRef(null);
  const isVADInitRef         = useRef(false);
  const pipelineQueueRef     = useRef(0);      // Track in-flight requests
  const lastStreamSentRef    = useRef(0);      // Timestamp of last mid-speech chunk sent
  const isPlayingRef         = useRef(false);  // True while peer TTS audio is playing — pause VAD to prevent echo

  // Keep targetLang ref in sync
  useEffect(() => { targetLangRef.current = targetLang; }, [targetLang]);
  useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);
  useEffect(() => { setIsSpeaking(volume > VAD_THRESHOLD); }, [volume]);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Resize handler
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // ── Socket Setup ────────────────────────────────────────────────────────────
  useEffect(() => {
    const socket = io(SOCKET_URL, {
      transports: ['polling', 'websocket'],  // polling first avoids WS close-before-connect
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('join-session', { sessionId: id, role });
      socket.emit('update_language', { sessionId: id, role, lang: inputLang });
      setStatus('● Connected');
      setStatusType('success');
    });

    socket.on('connect_error', () => {
      setStatus('Connection failed — retrying...');
      setStatusType('error');
    });

    socket.on('disconnect', () => {
      setStatus('Disconnected');
      setStatusType('error');
    });

    socket.on('session_status', (data) => {
      setStatus(data.message);
      setStatusType(data.type || 'info');
    });

    // Two-phase transcript: 'transcribing' shows original, 'translated' shows both
    socket.on('transcript_update', (data) => {
      setMessages((prev) => {
        const existing = prev.findIndex(
          m => m.role === data.role && m.phase === 'transcribing' && !m.translatedText
        );
        if (data.phase === 'transcribing' && existing === -1) {
          return [...prev, { ...data, id: Date.now() }];
        }
        if (data.phase === 'translated') {
          const updated = [...prev];
          const idx = updated.findLastIndex(m => m.role === data.role);
          if (idx !== -1) {
            updated[idx] = { ...updated[idx], ...data };
          } else {
            updated.push({ ...data, id: Date.now() });
          }
          return updated;
        }
        return prev;
      });
    });

    // Peer changed their language — update our outputLang live
    socket.on('peer_language_updated', ({ lang }) => {
      console.log(`[Sync] Peer language → ${lang}`);
      setTargetLang(lang);
      targetLangRef.current = lang;
    });

    // Initial handshake — only apply peer lang if server has a REAL value (not null)
    // Never overwrite if peer_language_updated already fired with correct data
    socket.on('initial_sync', ({ agentLang, customerLang }) => {
      const peerLang = role === 'agent' ? customerLang : agentLang;
      console.log(`[Sync] initial_sync received: agentLang=${agentLang} customerLang=${customerLang} → peerLang=${peerLang}`);
      // Only apply if the server actually has a stored value (not the fallback null/default)
      if (peerLang && peerLang !== 'en' || (peerLang && !targetLangRef.current)) {
        setTargetLang(peerLang);
        targetLangRef.current = peerLang;
        console.log(`[Sync] Applied peer lang from initial_sync: ${peerLang}`);
      } else {
        console.log(`[Sync] initial_sync skipped (keeping current targetLang: ${targetLangRef.current})`);
      }
    });

    // Play incoming audio (only if this is the targetRole)
    socket.on('audio_playback', async (data) => {
      if (data.targetRole !== role) return;
      if (!data.audioBase64) return;

      try {
        const ctx = audioContextRef.current;
        if (!ctx) return;
        if (ctx.state === 'suspended') await ctx.resume();

        const binary = window.atob(data.audioBase64);
        const bytes  = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

        const audioBuffer = await ctx.decodeAudioData(bytes.buffer);
        const source      = ctx.createBufferSource();
        source.buffer     = audioBuffer;
        source.connect(ctx.destination);

        // ── ECHO FIX: Pause VAD while TTS is playing ─────────────────────────────
        // Prevents mic from picking up TTS audio and creating an echo loop
        isPlayingRef.current = true;
        setIsPeerPlaying(true);
        source.onended = () => {
          isPlayingRef.current = false;
          setIsPeerPlaying(false);
          // Reset speech tracking so echo tail doesn't count as a new utterance
          lastSpeechTimeRef.current = Date.now();
        };
        source.start(0);
      } catch (err) {
        console.error('[Playback] Failed to decode/play audio:', err);
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [id, role, inputLang]);

  // ── Send Audio Chunk to Backend ──────────────────────────────────────────────
  const sendChunk = useCallback(async (pcmBuffer) => {
    if (pcmBuffer.length === 0) return;

    const inputSR  = audioContextRef.current?.sampleRate || 44100;
    const resampled = downsampleBuffer(pcmBuffer, inputSR, SAMPLE_RATE);
    const wavBlob   = encodeWAV(resampled, SAMPLE_RATE);

    // Size guard — skip tiny/silent chunks
    if (wavBlob.size < MIN_AUDIO_BYTES) {
      console.log(`[VAD] Chunk too small (${wavBlob.size}B) — likely silence, skipping`);
      return;
    }

    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = reader.result.split(',')[1];
      if (!base64) return;

      pipelineQueueRef.current += 1;
    try {
      pipelineQueueRef.current++;
      setIsPipelineActive(true);
      console.log(`[Pipeline] Sending sentence: ${wavBlob.size}B | ${inputLang} → ${targetLangRef.current}`);

      const res = await fetch(`${API_BASE}/api/audio/process`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId:   id,
          role:        role,
          audioBase64: base64,
          inputLang:   inputLang,
          outputLang:  targetLangRef.current,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || `Server error ${res.status}`);
      }
    } catch (err) {
      console.error('[Pipeline] Fetch error:', err.message);
      setStatus(`Pipeline error: ${err.message}`);
      setStatusType('error');
      } finally {
        pipelineQueueRef.current--;
        if (pipelineQueueRef.current <= 0) {
          pipelineQueueRef.current = 0;
          setIsPipelineActive(false);
        }
      }
    };
    reader.readAsDataURL(wavBlob);
  }, [id, role, inputLang]);

  // ── Voice Activity Detection (VAD) Loop ───────────────────────────────────
  useEffect(() => {
    const initVAD = async () => {
      if (isVADInitRef.current) return;
      isVADInitRef.current = true;

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation:  true,
            noiseSuppression:  true,
            autoGainControl:   true,
            sampleRate:        48000,
            channelCount:      1,
          },
        });
        streamRef.current = stream;

        const ctx       = new (window.AudioContext || window.webkitAudioContext)();
        audioContextRef.current = ctx;

        const analyser  = ctx.createAnalyser();
        analyser.fftSize = 512;
        analyserRef.current = analyser;

        const source    = ctx.createMediaStreamSource(stream);
        const processor = ctx.createScriptProcessor(2048, 1, 1);
        processorRef.current = processor;

        // Collect PCM data during active recording
        processor.onaudioprocess = (e) => {
          if (isRecordingRef.current && !isMutedRef.current) {
            const data = e.inputBuffer.getChannelData(0);
            pcmDataRef.current.push(...data);
          }
        };

        source.connect(analyser);
        source.connect(processor);
        processor.connect(ctx.destination);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        const tick = () => {
          if (!isVADInitRef.current) return;
          analyser.getByteTimeDomainData(dataArray);

          // Compute RMS amplitude
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            const amp = (dataArray[i] / 128) - 1;
            sum += amp * amp;
          }
          const rms = Math.sqrt(sum / dataArray.length);

          if (isMutedRef.current || isPlayingRef.current) {
            // Muted OR peer audio is playing — freeze VAD to prevent echo
            setVolume(0);
            if (isRecordingRef.current && !isPlayingRef.current) {
              // Only flush on actual mute, not during playback
              isRecordingRef.current = false;
              const buf = [...pcmDataRef.current];
              pcmDataRef.current = [];
              recordingStartRef.current = null;
              if (buf.length > 0) sendChunk(buf);
            } else if (isPlayingRef.current) {
              // During playback: discard any mic data (echo)
              pcmDataRef.current = [];
            }
          } else {
            setVolume(rms);

            if (rms > VAD_THRESHOLD) {
              lastSpeechTimeRef.current = Date.now();
              if (!isRecordingRef.current) {
                isRecordingRef.current     = true;
                recordingStartRef.current  = Date.now();
                lastStreamSentRef.current  = Date.now(); // reset → first chunk fires 2s AFTER speech starts
                console.log('[VAD] 🎙️ Speech started');
              }
            }

            if (isRecordingRef.current) {
              const silence = Date.now() - lastSpeechTimeRef.current;

              // ── END OF SENTENCE: send full buffer when silence detected ─────────
              if (silence > SILENCE_MS) {
                isRecordingRef.current    = false;
                recordingStartRef.current = null;
                const buf = [...pcmDataRef.current];
                pcmDataRef.current = [];
                if (buf.length > 0) {
                  console.log(`[VAD] 🔇 Sentence finished → sending ${buf.length} samples`);
                  sendChunk(buf);
                }
              }
            }
          }

          rafRef.current = requestAnimationFrame(tick);
        };

        tick();
        setStatus('● Ready — Unmute to speak');
        setStatusType('success');
      } catch (err) {
        console.error('[VAD] Init failed:', err.message);
        setStatus('⚠ Microphone access denied');
        setStatusType('error');
      }
    };

    initVAD();

    return () => {
      isVADInitRef.current = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
      if (audioContextRef.current?.state !== 'closed') {
        audioContextRef.current?.close();
      }
    };
  }, [sendChunk]);

  // ── Unmute Handler ───────────────────────────────────────────────────────────
  const toggleMute = useCallback(async () => {
    const ctx = audioContextRef.current;
    if (ctx?.state === 'suspended') await ctx.resume();
    const newMuted = !isMuted;
    isMutedRef.current = newMuted;
    setIsMuted(newMuted);
  }, [isMuted]);

  const leaveCall = () => navigate('/');

  const myLangLabel   = LANG_LABELS[inputLang] || inputLang.toUpperCase();
  const peerLangLabel = LANG_LABELS[targetLang] || targetLang.toUpperCase();

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100vh',
      padding: isMobile ? '0.75rem' : '1.25rem',
      maxWidth: '1400px', margin: '0 auto',
      fontFamily: "'Inter', 'Outfit', sans-serif",
    }}>

      {/* ── Header ── */}
      <div className="glass-panel" style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '1rem 1.75rem', marginBottom: '1rem',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: '20px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
          <div style={{
            width: '46px', height: '46px', borderRadius: '12px',
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 20px rgba(99,102,241,0.35)',
          }}>
            <Activity size={22} color="white" />
          </div>
          <div>
            <div style={{ fontSize: '1rem', fontWeight: '700' }}>
              {id.substring(0, 16)}{id.length > 16 ? '...' : ''}
            </div>
            <div style={{ fontSize: '0.7rem', fontWeight: '700', letterSpacing: '0.08em' }}>
              <span style={{
                color: statusType === 'error' ? '#f87171' :
                       statusType === 'success' ? '#34d399' : '#a78bfa'
              }}>
                {status}
              </span>
              {isPipelineActive && (
                <span style={{ marginLeft: '0.8rem', color: '#fbbf24', animation: 'pulse 1s infinite' }}>
                  ⚡ TRANSLATING...
                </span>
              )}
              {isPeerPlaying && (
                <span style={{ marginLeft: '0.8rem', color: '#34d399', animation: 'pulse 1s infinite' }}>
                  🔊 PEER SPEAKING...
                </span>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {/* Language Bridge Indicator */}
          <div className="glass-panel" style={{
            padding: '0.5rem 1rem', borderRadius: '10px',
            fontSize: '0.8rem', fontWeight: '700',
            display: 'flex', alignItems: 'center', gap: '0.5rem',
          }}>
            <span style={{ color: '#818cf8' }}>{myLangLabel}</span>
            <ArrowRight size={14} style={{ opacity: 0.4 }} />
            <span style={{ color: '#34d399' }}>{peerLangLabel}</span>
          </div>

          <div className="glass-panel" style={{
            padding: '0.4rem 0.75rem', borderRadius: '8px',
            fontSize: '0.65rem', fontWeight: '800', letterSpacing: '0.08em',
            color: role === 'agent' ? '#818cf8' : '#34d399',
          }}>
            {role === 'agent' ? '🏢 INTERNAL' : '👤 EXTERNAL'}
          </div>

          <button onClick={leaveCall} className="btn-secondary" style={{
            padding: '0.5rem 1rem', color: '#f87171', borderRadius: '10px',
          }}>
            <PhoneOff size={17} />
          </button>
        </div>
      </div>

      {/* ── Message Arena ── */}
      <div className="glass-panel" style={{
        flex: 1, overflowY: 'auto', padding: isMobile ? '1.25rem' : '2rem',
        display: 'flex', flexDirection: 'column', gap: '1.25rem',
        background: 'rgba(2, 6, 23, 0.5)', borderRadius: '24px',
        border: '1px solid rgba(255,255,255,0.04)',
      }}>
        {messages.length === 0 ? (
          <div style={{
            margin: 'auto', textAlign: 'center', maxWidth: '380px', opacity: 0.5,
          }}>
            <Globe size={48} color="var(--accent-primary)" style={{ marginBottom: '1.5rem' }} />
            <h3 style={{ fontSize: '1.4rem', marginBottom: '0.75rem', fontWeight: '700' }}>
              Bridge Active
            </h3>
            <p style={{ fontSize: '0.9rem', lineHeight: '1.7', color: 'var(--text-secondary)' }}>
              Unmute your mic and speak naturally. Your voice will be translated
              in real-time and streamed to your peer.
            </p>
            <div style={{
              marginTop: '2rem', display: 'flex', gap: '1rem',
              justifyContent: 'center', flexWrap: 'wrap',
            }}>
              {['ElevenLabs STT', 'Sarvam AI', 'ElevenLabs TTS'].map((step, i) => (
                <div key={i} style={{
                  padding: '0.4rem 0.85rem', borderRadius: '20px',
                  background: 'rgba(99,102,241,0.08)',
                  border: '1px solid rgba(99,102,241,0.2)',
                  fontSize: '0.7rem', fontWeight: '700', color: '#818cf8',
                }}>
                  {step}
                </div>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg, idx) => {
            const isMe    = msg.role === role;
            const isFinal = msg.phase === 'translated';

            return (
              <div key={msg.id || idx} style={{
                alignSelf: isMe ? 'flex-end' : 'flex-start',
                maxWidth: isMobile ? '92%' : '68%',
                animation: 'fadeIn 0.4s ease-out',
              }}>
                <div style={{
                  background: isMe
                    ? 'linear-gradient(135deg, rgba(99,102,241,0.12), rgba(139,92,246,0.08))'
                    : 'rgba(255,255,255,0.03)',
                  padding: '1.25rem 1.5rem',
                  borderRadius: isMe ? '20px 6px 20px 20px' : '6px 20px 20px 20px',
                  border: `1px solid ${isMe ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.06)'}`,
                }}>
                  {/* Role label */}
                  <div style={{
                    fontSize: '0.65rem', fontWeight: '800', letterSpacing: '0.1em',
                    color: isMe ? '#818cf8' : '#34d399', marginBottom: '0.5rem',
                  }}>
                    {isMe ? `YOU (${myLangLabel})` : `PEER (${myLangLabel})`}
                  </div>

                  {/* Original text */}
                  <div style={{
                    fontSize: '0.8rem', opacity: 0.5, fontStyle: 'italic',
                    marginBottom: msg.translatedText ? '0.5rem' : 0,
                  }}>
                    "{msg.originalText}"
                  </div>

                  {/* Translated text */}
                  {msg.translatedText && (
                    <div style={{ fontSize: '1.05rem', fontWeight: '600', lineHeight: '1.5' }}>
                      {msg.translatedText}
                    </div>
                  )}

                  {/* Processing indicator */}
                  {!isFinal && (
                    <div style={{
                      marginTop: '0.5rem', fontSize: '0.7rem',
                      color: '#fbbf24', display: 'flex', alignItems: 'center', gap: '0.4rem',
                    }}>
                      <Zap size={11} />
                      translating...
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={chatEndRef} />
      </div>

      {/* ── Control Bar ── */}
      <div style={{
        padding: '1.25rem 0',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1.5rem',
      }}>
        {/* Mute Toggle */}
        <button
          id="mute-toggle-btn"
          onClick={toggleMute}
          style={{
            display: 'flex', alignItems: 'center', gap: '0.75rem',
            padding: '0.9rem 2rem', borderRadius: '16px', border: 'none',
            fontWeight: '700', fontSize: '0.95rem', cursor: 'pointer',
            minWidth: isMobile ? '140px' : '200px',
            background: isMuted
              ? 'rgba(244, 63, 94, 0.1)'
              : 'linear-gradient(135deg, #6366f1, #4f46e5)',
            color:  isMuted ? '#f43f5e' : 'white',
            outline: isMuted ? '1px solid rgba(244,63,94,0.25)' : 'none',
            boxShadow: !isMuted && volume > 0.01
              ? '0 0 25px rgba(99,102,241,0.5)'
              : 'none',
            transition: 'all 0.25s ease',
          }}
        >
          {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
          {isMuted ? 'Mic Off' : 'Mic Live'}
        </button>

        {/* Waveform Visualizer */}
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: '3px', height: '56px', opacity: isMuted ? 0.15 : 1, transition: 'opacity 0.3s',
        }}>
          {Array.from({ length: isMobile ? 16 : 32 }).map((_, i) => {
            const height = isSpeaking
              ? 8 + (volume * 500 * (0.3 + Math.sin(i * 0.8) * 0.7))
              : 4 + Math.random() * 3;
            return (
              <div key={i} style={{
                width: '3px',
                height: `${Math.min(height, 52)}px`,
                borderRadius: '2px',
                background: isSpeaking
                  ? `hsl(${240 + i * 4}, 80%, 65%)`
                  : 'rgba(255,255,255,0.1)',
                transition: 'height 0.05s ease',
              }} />
            );
          })}
        </div>

        {/* Status indicator */}
        {!isMobile && (
          <div style={{
            fontSize: '0.75rem', fontWeight: '800', letterSpacing: '0.1em',
            textAlign: 'right', minWidth: '120px',
            color: isPeerPlaying ? '#34d399'
                 : isPipelineActive ? '#fbbf24'
                 : isSpeaking ? '#818cf8'
                 : 'var(--text-muted)',
          }}>
            {isPeerPlaying     ? '🔊 HEARING PEER'
             : isPipelineActive ? '⚡ PIPELINE ACTIVE'
             : isSpeaking       ? '📡 TRANSMITTING'
             :                    '👂 LISTENING'}
          </div>
        )}
      </div>
    </div>
  );
};

export default ActiveCall;