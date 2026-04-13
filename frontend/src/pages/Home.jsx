import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Globe, ArrowRight, Users, Sparkles, Clock, History, CheckCircle, XCircle, Activity, PlusCircle } from 'lucide-react';

const Home = () => {
  const navigate = useNavigate();
  const [joinId, setJoinId] = useState('');
  const [customStartId, setCustomStartId] = useState('');
  const [recentSessions, setRecentSessions] = useState([]);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [health, setHealth] = useState({ database: 'checking', redis: 'checking' });

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    
    const API_BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

    const fetchRecent = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/sessions/recent`);
        const data = await res.json();
        if (data.success) setRecentSessions(data.sessions);
      } catch (err) {
        console.error('Failed to fetch recent sessions');
      }
    };

    const checkHealth = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/health`);
        const data = await res.json();
        setHealth(data.services);
      } catch (err) {
        setHealth({ database: 'error', redis: 'error' });
      }
    };

    fetchRecent();
    checkHealth();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const createSession = async () => {
    try {
      const API_BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
      const res = await fetch(`${API_BASE_URL}/api/sessions`, { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customId: customStartId.trim() || undefined })
      });
      const data = await res.json();
      if (data.success) {
        navigate(`/session/${data.session.id}/setup`);
      }
    } catch (err) {
      console.error(err);
      const fakeId = customStartId.trim() || Math.random().toString(36).substring(2, 9);
      navigate(`/session/${fakeId}/setup`);
    }
  };

  const joinSession = (e) => {
    e.preventDefault();
    if (joinId.trim()) {
      navigate(`/session/${joinId.trim()}/setup`);
    }
  };

  return (
    <div className="flex-center" style={{ flexDirection: 'column', padding: isMobile ? '2rem 1rem' : '4rem 2rem', position: 'relative' }}>
      
      {/* System Health Badge */}
      <div className="glass-panel" style={{ 
        position: 'absolute', top: '2rem', right: '2rem', padding: '0.75rem 1rem', 
        display: isMobile ? 'none' : 'flex', gap: '1.25rem', borderRadius: '14px', fontSize: '0.75rem', fontWeight: '700'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {health.database === 'up' ? <CheckCircle size={14} color="#4ade80" /> : <XCircle size={14} color="#f87171" />}
          <span style={{ color: health.database === 'up' ? 'var(--text-primary)' : 'var(--text-muted)' }}>DATABASE</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {health.redis === 'up' ? <CheckCircle size={14} color="#4ade80" /> : <XCircle size={14} color="#f87171" />}
          <span style={{ color: health.redis === 'up' ? 'var(--text-primary)' : 'var(--text-muted)' }}>PIPELINE</span>
        </div>
      </div>

      <div className="container" style={{ maxWidth: '1000px' }}>
        
        {/* Hero Section */}
        <div className="animate-fade-in" style={{ textAlign: 'center', marginBottom: isMobile ? '2.5rem' : '4rem' }}>
          <div style={{ position: 'relative', display: 'inline-block', marginBottom: '2rem' }}>
            <div style={{ 
              position: 'absolute', inset: '-20px', background: 'var(--accent-primary)', 
              filter: 'blur(40px)', opacity: 0.2, borderRadius: '50%'
            }}></div>
            <div style={{
              width: isMobile ? '64px' : '80px', height: isMobile ? '64px' : '80px', 
              borderRadius: '22px', background: 'rgba(99, 102, 241, 0.1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--glass-border)',
              position: 'relative'
            }}>
              <Globe size={isMobile ? 32 : 40} className="gradient-text" style={{ color: '#818cf8' }} />
            </div>
          </div>

          <h1 style={{ fontSize: isMobile ? '2.5rem' : '4.5rem', marginBottom: '1.5rem', lineHeight: '1.1' }} className="gradient-text">
            {isMobile ? 'Global Communication' : <>The Future of <br /> Global Communication</>}
          </h1>
          
          <p style={{ color: 'var(--text-secondary)', fontSize: isMobile ? '1rem' : '1.25rem', marginBottom: '3rem', maxWidth: '600px', margin: '0 auto 3rem' }}>
            Break language barriers instantly with our high-fidelity AI voice translation platform. 
          </p>

          <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'center', gap: '1.5rem', alignItems: 'center' }}>
            
            {/* Create Group */}
            <div className="glass-panel" style={{ display: 'flex', padding: '0.5rem', borderRadius: '16px', width: isMobile ? '100%' : 'auto' }}>
              <div style={{ display: 'flex', gap: '0.5rem', width: '100%' }}>
                <input 
                  type="text" 
                  placeholder="Custom Agent ID (optional)" 
                  value={customStartId}
                  onChange={(e) => setCustomStartId(e.target.value)}
                  style={{ border: 'none', background: 'transparent', width: isMobile ? '100%' : '220px' }}
                />
                <button 
                  onClick={createSession} 
                  className="btn-primary" 
                  style={{ border: 'none', padding: '0.75rem 1.5rem', whiteSpace: 'nowrap' }}
                >
                  <PlusCircle size={18} /> Start
                </button>
              </div>
            </div>

            {/* Join Group */}
            <div className="glass-panel" style={{ display: 'flex', padding: '0.5rem', borderRadius: '16px', width: isMobile ? '100%' : 'auto' }}>
              <form onSubmit={joinSession} style={{ display: 'flex', gap: '0.5rem', width: '100%' }}>
                <input 
                  type="text" 
                  placeholder="Join ID..." 
                  value={joinId}
                  onChange={(e) => setJoinId(e.target.value)}
                  style={{ border: 'none', background: 'transparent', width: isMobile ? '100%' : '180px' }}
                />
                <button type="submit" className="btn-outline" style={{ border: 'none', background: 'var(--accent-primary)', color: 'white', whiteSpace: 'nowrap' }}>
                  Join <ArrowRight size={18} />
                </button>
              </form>
            </div>

          </div>
        </div>

        {/* Recent Activity Section */}
        {recentSessions.length > 0 && (
          <div className="animate-fade-in" style={{ animationDelay: '0.3s' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem', color: 'var(--text-secondary)' }}>
              <History size={20} />
              <h3 style={{ fontSize: '1.1rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Recent Activity</h3>
            </div>
            
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(300px, 1fr))', 
              gap: '1.25rem'
            }}>
              {recentSessions.map((session) => (
                <div 
                  key={session.id} 
                  className="glass-panel" 
                  onClick={() => navigate(`/session/${session.id}/setup`)}
                  style={{ 
                    padding: '1.25rem', cursor: 'pointer', display: 'flex', 
                    alignItems: 'center', justifyContent: 'space-between'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ 
                      width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(255,255,255,0.05)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--glass-border)'
                    }}>
                      <Clock size={18} color="var(--accent-secondary)" />
                    </div>
                    <div>
                      <div style={{ fontWeight: '600', fontSize: '0.9rem' }}>ID: {session.id.substring(0, 15)}...</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{new Date(session.created_at).toLocaleDateString()}</div>
                    </div>
                  </div>
                  <ArrowRight size={16} color="var(--text-muted)" />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Home;
