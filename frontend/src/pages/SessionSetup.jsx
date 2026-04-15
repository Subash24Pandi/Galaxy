import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Settings, CheckCircle2, User, UserCog, Languages, Sparkles, ChevronRight, Activity } from 'lucide-react';
import io from 'socket.io-client';

const LANGUAGES = [
  { code: 'en', name: 'English', flag: '🇺🇸' },
  { code: 'hi', name: 'Hindi', flag: '🇮🇳' },
  { code: 'ta', name: 'Tamil', flag: '🇮🇳' },
  { code: 'te', name: 'Telugu', flag: '🇮🇳' },
  { code: 'kn', name: 'Kannada', flag: '🇮🇳' },
  { code: 'bn', name: 'Bengali', flag: '🇮🇳' },
  { code: 'gu', name: 'Gujarati', flag: '🇮🇳' },
  { code: 'mr', name: 'Marathi', flag: '🇮🇳' }
];

const SessionSetup = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [role, setRole] = useState('agent');
  const [inputLang, setInputLang] = useState('ta');
  const [peerLang, setPeerLang] = useState(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const socketRef = useRef(null);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    
    // Connect socket for real-time language sync
    const API_BASE_URL = import.meta.env.VITE_BACKEND_URL || 'https://galaxy-ld7t.onrender.com';
    socketRef.current = io(API_BASE_URL);
    
    socketRef.current.emit('join-session', { sessionId: id, role: 'setup' });
    
    socketRef.current.on('peer_language_updated', ({ lang }) => {
      setPeerLang(lang);
    });

    return () => {
      window.removeEventListener('resize', handleResize);
      socketRef.current.disconnect();
    };
  }, [id]);

  const handleLangChange = (code) => {
    setInputLang(code);
    socketRef.current.emit('update_language', { sessionId: id, role, lang: code });
  };

  const joinCall = (e) => {
    e.preventDefault();
    // In Zero-Config, my outputLang is whatever the Peer speaks. 
    // If peer hasn't selected yet, we default (will be updated live in ActiveCall)
    navigate(`/session/${id}/call`, { 
      state: { role, inputLang, outputLang: peerLang || 'en' } 
    });
  };

  return (
    <div className="flex-center" style={{ padding: isMobile ? '1rem' : '4rem' }}>
      <div className="container animate-fade-in" style={{ maxWidth: '1000px' }}>
        <div className="glass-panel" style={{ padding: isMobile ? '2rem' : '4rem', position: 'relative', overflow: 'hidden' }}>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', marginBottom: '4rem' }}>
            <div className="hover-glow" style={{ width: '64px', height: '64px', borderRadius: '18px', background: 'rgba(99, 102, 241, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--glass-border)' }}>
              <Settings size={32} color="var(--accent-primary)" />
            </div>
            <div>
              <h1 style={{ fontSize: '2.5rem', fontWeight: '700' }}>Bridge Setup</h1>
              <p style={{ color: 'var(--text-secondary)' }}>Session ID: <span style={{ color: 'var(--accent-secondary)', fontWeight: '700' }}>{id}</span></p>
            </div>
          </div>

          <form onSubmit={joinCall} style={{ display: 'flex', flexDirection: 'column', gap: '4rem' }}>
            
            {/* Role Selection */}
            <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: '1.5rem' }}>
              {[
                { id: 'agent', label: 'Internal Agent', icon: UserCog },
                { id: 'customer', label: 'External Customer', icon: User }
              ].map((r) => (
                <div 
                  key={r.id}
                  onClick={() => setRole(r.id)}
                  className="glass-panel"
                  style={{ 
                    flex: 1, cursor: 'pointer', padding: '2rem', textAlign: 'center',
                    background: role === r.id ? 'rgba(99, 102, 241, 0.1)' : 'transparent',
                    borderColor: role === r.id ? 'var(--accent-primary)' : 'var(--glass-border)',
                    position: 'relative'
                  }}
                >
                  {role === r.id && <div style={{ position: 'absolute', top: '1rem', right: '1rem' }}><CheckCircle2 size={20} color="var(--accent-primary)" /></div>}
                  <r.icon size={48} style={{ marginBottom: '1.5rem', color: role === r.id ? 'var(--accent-primary)' : 'var(--text-muted)' }} />
                  <div style={{ fontWeight: '700', fontSize: '1.25rem' }}>{r.label}</div>
                </div>
              ))}
            </div>

            {/* Language Selection */}
            <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: '3rem' }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontWeight: '700', fontSize: '1.2rem' }}>
                    <Languages size={22} color="var(--accent-secondary)" /> What is your Language?
                  </label>
                </div>
                
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '1rem' }}>
                  {LANGUAGES.map(l => (
                    <div 
                      key={l.code}
                      onClick={() => handleLangChange(l.code)}
                      className="glass-panel"
                      style={{
                        padding: '1.25rem', cursor: 'pointer',
                        background: inputLang === l.code ? 'var(--accent-primary)' : 'rgba(255,255,255,0.02)',
                        border: '1px solid',
                        borderColor: inputLang === l.code ? 'var(--accent-primary)' : 'var(--glass-border)',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', transition: 'var(--transition)'
                      }}
                    >
                      <span style={{ fontSize: '1.5rem' }}>{l.flag}</span>
                      <span style={{ fontSize: '0.9rem', fontWeight: '600' }}>{l.name}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Status Indicator */}
              <div className="glass-panel" style={{ width: isMobile ? '100%' : '300px', padding: '2rem', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', background: 'rgba(255,255,255,0.01)' }}>
                {peerLang ? (
                  <div className="animate-fade-in">
                    <Sparkles size={32} color="var(--accent-secondary)" style={{ marginBottom: '1rem' }} />
                    <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Peer Detected!</div>
                    <div style={{ fontWeight: '800', fontSize: '1.4rem' }}>
                      {LANGUAGES.find(l => l.code === peerLang)?.flag} {LANGUAGES.find(l => l.code === peerLang)?.name}
                    </div>
                  </div>
                ) : (
                  <div style={{ color: 'var(--text-muted)' }}>
                    <Activity size={32} style={{ marginBottom: '1rem', opacity: 0.5 }} className="pulse-recording" />
                    <p style={{ fontSize: '0.9rem' }}>Waiting for Peer...</p>
                  </div>
                )}
              </div>
            </div>

            <button type="submit" className="btn-primary" style={{ height: '70px', fontSize: '1.3rem' }}>
              Join Bridge Session
              <ChevronRight size={24} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default SessionSetup;
