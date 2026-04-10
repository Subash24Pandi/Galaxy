import React, { useEffect, useState, useRef } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { Mic, MicOff, PhoneOff, MessageSquare } from 'lucide-react';

const ActiveCall = () => {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const {
    role,
    inputLang,
    outputLang
  } = location.state || {
    role: 'agent',
    inputLang: 'en',
    outputLang: 'hi'
  };

  const [socket, setSocket] = useState(null);
  const [status, setStatus] = useState('Connecting...');
  const [messages, setMessages] = useState([]);
  const [isRecording, setIsRecording] = useState(false);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  useEffect(() => {
    // Connect using public environment variable or local dev fallback
    const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
    
    // Explicitly enforce secure websockets
    const newSocket = io(BACKEND_URL, {
      transports: ['websocket', 'polling']
    });

    setSocket(newSocket);

    newSocket.on('connect', () => {
      console.log('[Frontend] WebSocket connected successfully! ID:', newSocket.id);

      newSocket.emit('join_session', {
        sessionId: id,
        role,
        inputLang,
        outputLang
      });

      setStatus('Connected');
    });

    newSocket.on('connect_error', (err) => {
      console.error('[Frontend] WebSocket Connection Error:', err.message);
      setStatus('Connection Failed. Retrying...');
    });

    // Listen to fatal server pipeline errors natively instead of silently swallowing!
    newSocket.on('error', (err) => {
      console.error('[Frontend] Backend Pipeline Error:', err);
      setStatus(`Pipeline Error: ${err.details || err.message}`);
    });

    newSocket.on('disconnect', (reason) => {
      console.warn('[Frontend] WebSocket disconnected:', reason);
      setStatus('Disconnected');
    });

    // Session join / leave updates
    newSocket.on('session_status', (data) => {
      setStatus(data.message);
    });

    // Transcript updates from audio pipeline
    newSocket.on('transcript_update', (data) => {
      console.log('[Frontend] transcript_update:', data);
      setMessages((prev) => [...prev, data]);
    });

    // Manual text messages, if backend emits them
    newSocket.on('receive_message', (data) => {
      console.log('[Frontend] receive_message:', data);
      setMessages((prev) => [...prev, data]);
    });

    // Play translated audio only for the intended role
    newSocket.on('audio_playback', (data) => {
      console.log('[Frontend] audio_playback:', data);

      if (data.targetRole === role && data.audioBase64) {
        const audio = new Audio(`data:audio/mp3;base64,${data.audioBase64}`);
        audio.play().catch((e) => {
          console.error('[Frontend] Audio playback failed:', e);
        });
      }
    });

    return () => {
      newSocket.close();
    };
  }, [id, role, inputLang, outputLang]);

  const startRecording = async () => {
    try {
      console.log('[Frontend] Starting microphone recording...');

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);

      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        console.log('[Frontend] Recording stopped. Converting audio to base64...');

        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();

        reader.readAsDataURL(audioBlob);

        reader.onloadend = () => {
          const base64data = reader.result.split(',')[1];

          if (socket) {
            console.log('[Frontend] Emitting audio_utterance to backend...');

            socket.emit('audio_utterance', {
              sessionId: id,
              role,
              audioBase64: base64data
            });
          }
        };
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error('[Frontend] Microphone access denied or failed:', err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);

      if (mediaRecorderRef.current.stream) {
        mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
      }
    }
  };

  const leaveCall = () => {
    if (socket) socket.disconnect();
    navigate('/');
  };

  const formatTime = (isoString) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    return date.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  return (
    <div
      className="container"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        padding: '1rem'
      }}
    >
      <div
        className="glass-panel"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '1rem 2rem',
          marginBottom: '1rem'
        }}
      >
        <div>
          <h2 style={{ fontSize: '1.2rem', margin: 0 }}>
            Active Session:{' '}
            <span
              style={{
                fontFamily: 'monospace',
                color: 'var(--primary-color)'
              }}
            >
              {id}
            </span>
          </h2>
          <span
            style={{
              fontSize: '0.85rem',
              color: 'var(--text-muted)'
            }}
          >
            You are: <strong>{role.toUpperCase()}</strong>
          </span>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            color: 'var(--secondary-color)',
            fontSize: '0.9rem'
          }}
        >
          <div
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: 'var(--secondary-color)',
              animation: 'pulse 2s infinite'
            }}
          ></div>
          {status}
        </div>

        <button
          onClick={leaveCall}
          style={{
            background: 'rgba(239, 68, 68, 0.2)',
            color: '#f87171',
            padding: '0.5rem 1rem'
          }}
        >
          <PhoneOff size={18} /> Leave
        </button>
      </div>

      <div
        className="glass-panel"
        style={{
          flex: 1,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
          padding: '2rem'
        }}
      >
        {messages.length === 0 ? (
          <div
            style={{
              margin: 'auto',
              textAlign: 'center',
              color: 'var(--text-muted)'
            }}
          >
            <MessageSquare
              size={48}
              style={{ opacity: 0.3, marginBottom: '1rem' }}
            />
            <p>No messages yet. Press Push to Talk to start.</p>
          </div>
        ) : (
          messages.map((msg, idx) => {
            const isMe = msg.role === role;

            return (
              <div
                key={idx}
                style={{
                  alignSelf: isMe ? 'flex-end' : 'flex-start',
                  background: isMe
                    ? 'rgba(99, 102, 241, 0.2)'
                    : 'rgba(255, 255, 255, 0.05)',
                  padding: '1rem',
                  borderRadius: '12px',
                  maxWidth: '70%',
                  border: `1px solid ${
                    isMe
                      ? 'rgba(99, 102, 241, 0.3)'
                      : 'var(--border-color)'
                  }`
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '0.4rem',
                    borderBottom: '1px solid rgba(255,255,255,0.1)',
                    paddingBottom: '0.4rem'
                  }}
                >
                  <div
                    style={{
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      color: 'var(--secondary-color)'
                    }}
                  >
                    {isMe ? 'You said' : 'Other person said'}
                  </div>

                  <div
                    style={{
                      fontSize: '0.7rem',
                      color: 'var(--text-muted)'
                    }}
                  >
                    {msg.timestamp ? formatTime(msg.timestamp) : ''}
                  </div>
                </div>

                <div
                  style={{
                    fontSize: '0.9rem',
                    color: 'var(--text-muted)',
                    fontStyle: 'italic',
                    marginBottom: '0.5rem'
                  }}
                >
                  [{msg.sourceLang?.toUpperCase()}] "{msg.originalText}"
                </div>

                <div
                  style={{
                    fontSize: '1.1rem',
                    fontWeight: 500
                  }}
                >
                  [{msg.targetLang?.toUpperCase()}] {msg.translatedText}
                </div>
              </div>
            );
          })
        )}
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          padding: '2rem',
          position: 'relative'
        }}
      >
        <button
          onPointerDown={startRecording}
          onPointerUp={stopRecording}
          onPointerLeave={stopRecording}
          style={{
            width: '80px',
            height: '80px',
            borderRadius: '50%',
            background: isRecording
              ? 'var(--secondary-color)'
              : 'var(--surface-color)',
            border: `2px solid ${
              isRecording
                ? 'var(--secondary-color)'
                : 'var(--border-color)'
            }`,
            boxShadow: isRecording
              ? '0 0 20px rgba(236, 72, 153, 0.5)'
              : 'var(--glass-shadow)',
            transition: 'all 0.1s ease'
          }}
        >
          {isRecording ? (
            <Mic size={32} color="white" />
          ) : (
            <MicOff size={32} color="var(--text-muted)" />
          )}
        </button>

        <div
          style={{
            position: 'absolute',
            bottom: '1rem',
            color: 'var(--text-muted)',
            fontSize: '0.8rem'
          }}
        >
          Hold to talk
        </div>
      </div>
    </div>
  );
};

export default ActiveCall;