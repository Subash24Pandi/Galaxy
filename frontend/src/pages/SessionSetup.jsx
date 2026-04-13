import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Settings, CheckCircle2, User, UserCog, Languages, Sparkles, ChevronRight } from 'lucide-react';

const LANGUAGES = [
  { code: 'en', name: 'English', flag: '🇺🇸' },
  { code: 'hi', name: 'Hindi', flag: '🇮🇳' },
  { code: 'ta', name: 'Tamil', flag: '🇮🇳' },
  { code: 'te', name: 'Telugu', flag: '🇮🇳' },
  { code: 'kn', name: 'Kannada', flag: '🇮🇳' },
  { code: 'bn', name: 'Bengali', flag: '🇮🇳' },
  { code: 'od', name: 'Odiya', flag: '🇮🇳' },
  { code: 'as', name: 'Assamese', flag: '🇮🇳' },
  { code: 'bho', name: 'Bhojpuri', flag: '🇮🇳' },
  { code: 'gu', name: 'Gujarati', flag: '🇮🇳' },
  { code: 'mr', name: 'Marathi', flag: '🇮🇳' }
];

const SessionSetup = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [role, setRole] = useState('agent');
  const [inputLang, setInputLang] = useState('en');
  const [outputLang, setOutputLang] = useState('hi');
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const joinCall = (e) => {
    e.preventDefault();
    navigate(`/session/${id}/call`, { 
      state: { role, inputLang, outputLang } 
    });
  };

  return (
    <div className="flex-center" style={{ padding: isMobile ? '2rem 1rem' : '4rem 2rem' }}>
      <div className="container" style={{ maxWidth: '900px' }}>
        <div className="glass-panel animate-fade-in" style={{ padding: isMobile ? '1.5rem' : '4rem' }}>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', marginBottom: isMobile ? '2rem' : '3.5rem' }}>
            <div style={{ 
              width: isMobile ? '48px' : '64px', height: isMobile ? '48px' : '64px', borderRadius: '14px', background: 'rgba(99, 102, 241, 0.1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--glass-border)'
            }}>
              <Settings size={isMobile ? 24 : 32} color="var(--accent-primary)" />
            </div>
            <div>
              <h1 style={{ fontSize: isMobile ? '1.75rem' : '2.5rem', fontWeight: '700' }}>Setup</h1>
              <p style={{ color: 'var(--text-secondary)', fontSize: isMobile ? '0.85rem' : '1rem' }}>Configure preferences.</p>
            </div>
          </div>

          <form onSubmit={joinCall} style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? '2rem' : '3rem' }}>
            
            {/* Role Selection */}
            <div>
              <label style={{ display: 'block', marginBottom: '1.25rem', fontWeight: '700', fontSize: '1.1rem', color: 'var(--text-primary)' }}>1. Identity</label>
              <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: '1rem' }}>
                {[
                  { id: 'agent', label: 'Agent', icon: UserCog, desc: 'Internal' },
                  { id: 'customer', label: 'Customer', icon: User, desc: 'External' }
                ].map((r) => (
                  <div 
                    key={r.id}
                    onClick={() => setRole(r.id)}
                    style={{ 
                      flex: 1, cursor: 'pointer', padding: isMobile ? '1.25rem' : '2rem', borderRadius: '24px',
                      background: role === r.id ? 'rgba(99, 102, 241, 0.12)' : 'rgba(255, 255, 255, 0.02)',
                      border: `2px solid ${role === r.id ? 'var(--accent-primary)' : 'var(--glass-border)'}`,
                      transition: 'var(--transition)', textAlign: 'center',
                      position: 'relative'
                    }}
                  >
                    {role === r.id && <div style={{ position: 'absolute', top: '12px', right: '12px' }}><CheckCircle2 size={18} color="var(--accent-primary)" /></div>}
                    <r.icon size={isMobile ? 32 : 48} style={{ marginBottom: '1rem', color: role === r.id ? 'var(--accent-primary)' : 'var(--text-muted)' }} />
                    <div style={{ fontWeight: '700', fontSize: isMobile ? '1rem' : '1.2rem', color: role === r.id ? 'white' : 'var(--text-secondary)' }}>{r.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Language Grid */}
            <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: '2rem' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem', fontWeight: '700', fontSize: '1.1rem' }}>
                  <Languages size={20} color="var(--accent-tertiary)" /> 2. You Speak
                </label>
                <div style={{ 
                  display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)', gap: '0.75rem',
                  maxHeight: isMobile ? '200px' : '300px', overflowY: 'auto', paddingRight: '0.5rem'
                }}>
                  {LANGUAGES.map(l => (
                    <div 
                      key={l.code}
                      onClick={() => setInputLang(l.code)}
                      style={{
                        padding: '1rem', borderRadius: '14px', cursor: 'pointer',
                        background: inputLang === l.code ? 'var(--accent-primary)' : 'rgba(255,255,255,0.03)',
                        border: '1px solid var(--glass-border)', transition: 'var(--transition)',
                        display: 'flex', alignItems: 'center', gap: '0.75rem'
                      }}
                    >
                      <span>{l.flag}</span>
                      <span style={{ fontSize: '0.9rem' }}>{l.name}</span>
                    </div>
                  ))}
                </div>
              </div>
              
              <div style={{ flex: 1 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem', fontWeight: '700', fontSize: '1.1rem' }}>
                   <Sparkles size={20} color="var(--accent-secondary)" /> 3. They Hear
                </label>
                <div style={{ 
                  display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)', gap: '0.75rem',
                  maxHeight: isMobile ? '200px' : '300px', overflowY: 'auto', paddingRight: '0.5rem'
                }}>
                  {LANGUAGES.map(l => (
                    <div 
                      key={l.code}
                      onClick={() => setOutputLang(l.code)}
                      style={{
                        padding: '1rem', borderRadius: '14px', cursor: 'pointer',
                        background: outputLang === l.code ? 'var(--accent-secondary)' : 'rgba(255,255,255,0.03)',
                        border: '1px solid var(--glass-border)', transition: 'var(--transition)',
                        display: 'flex', alignItems: 'center', gap: '0.75rem'
                      }}
                    >
                      <span>{l.flag}</span>
                      <span style={{ fontSize: '0.9rem' }}>{l.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <button type="submit" className="btn-primary" style={{ padding: '1.5rem', fontSize: '1.2rem', marginTop: '1rem' }}>
              Finalize & Join
              <ChevronRight size={24} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default SessionSetup;
