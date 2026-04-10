import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Settings, CheckCircle2 } from 'lucide-react';

const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'hi', name: 'Hindi' },
  { code: 'ta', name: 'Tamil' },
  { code: 'te', name: 'Telugu' }
];

const SessionSetup = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [role, setRole] = useState('agent');
  const [inputLang, setInputLang] = useState('en');
  const [outputLang, setOutputLang] = useState('hi');

  const joinCall = (e) => {
    e.preventDefault();
    // Pass config via state to the next route
    navigate(`/session/${id}/call`, { 
      state: { role, inputLang, outputLang } 
    });
  };

  return (
    <div className="flex-center">
      <div className="glass-panel animate-fade-in" style={{ maxWidth: '600px', width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
          <Settings size={32} color="#818cf8" />
          <h2 style={{ fontSize: '1.8rem' }}>Setup Session</h2>
        </div>
        
        <div style={{ marginBottom: '2rem', padding: '1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Session ID:</span>
          <div style={{ fontFamily: 'monospace', fontSize: '1.1rem', letterSpacing: '1px', marginTop: '0.25rem' }}>
            {id}
          </div>
          <p style={{ fontSize: '0.8rem', color: 'var(--secondary-color)', marginTop: '0.5rem' }}>
            Share this ID with the other person to join.
          </p>
        </div>

        <form onSubmit={joinCall} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Select Your Role</label>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button 
                type="button"
                onClick={() => setRole('agent')}
                style={{ 
                  flex: 1, 
                  background: role === 'agent' ? 'rgba(99, 102, 241, 0.2)' : 'transparent',
                  border: `1px solid ${role === 'agent' ? 'var(--primary-color)' : 'var(--border-color)'}`
                }}
              >
                Agent
              </button>
              <button 
                type="button"
                onClick={() => setRole('customer')}
                style={{ 
                  flex: 1, 
                  background: role === 'customer' ? 'rgba(99, 102, 241, 0.2)' : 'transparent',
                  border: `1px solid ${role === 'customer' ? 'var(--primary-color)' : 'var(--border-color)'}`
                }}
              >
                Customer
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '1rem' }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>You will speak in:</label>
              <select value={inputLang} onChange={(e) => setInputLang(e.target.value)}>
                {LANGUAGES.map(l => (
                  <option key={l.code} value={l.code}>{l.name}</option>
                ))}
              </select>
            </div>
            
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>They will hear:</label>
              <select value={outputLang} onChange={(e) => setOutputLang(e.target.value)}>
                <option value="" disabled>Select Language</option>
                {LANGUAGES.map(l => (
                  <option key={l.code} value={l.code}>{l.name}</option>
                ))}
              </select>
            </div>
          </div>

          <button type="submit" className="btn-primary" style={{ marginTop: '1rem', padding: '1rem' }}>
            <CheckCircle2 size={20} />
            Join Call
          </button>
        </form>
      </div>
    </div>
  );
};

export default SessionSetup;
