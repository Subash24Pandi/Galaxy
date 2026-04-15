import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Globe, ArrowRight, Users, Sparkles, Clock, History, CheckCircle, XCircle, Activity, PlusCircle } from 'lucide-react';

const Home = () => {
  const navigate = useNavigate();
  const [joinId, setJoinId] = useState('');
  const [customStartId, setCustomStartId] = useState('');
  const [recentSessions, setRecentSessions] = useState([]);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [health, setHealth] = useState({ database: 'checking', pipeline: 'checking' });

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    
    const API_BASE_URL = import.meta.env.VITE_BACKEND_URL || 'https://galaxy-ld7t.onrender.com';

    const fetchRecent = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/sessions/recent`);
        const data = await res.json();
        if (data.success) setRecentSessions(data.sessions);
      } catch (err) { console.error('Recent fail'); }
    };

    const checkHealth = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/health`);
        const data = await res.json();
        setHealth(data);
      } catch (err) {
        setHealth({ database: 'error', pipeline: 'error' });
      }
    };

    fetchRecent();
    checkHealth();
    const interval = setInterval(checkHealth, 30000);

    return () => {
      window.removeEventListener('resize', handleResize);
      clearInterval(interval);
    };
  }, []);

  const createSession = async () => {
    try {
      const API_BASE_URL = import.meta.env.VITE_BACKEND_URL || 'https://galaxy-ld7t.onrender.com';
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
      const fakeId = customStartId.trim() || Math.random().toString(36).substring(2, 10);
      navigate(`/session/${fakeId}/setup`);
    }
  };

  const joinSession = (e) => {
    e.preventDefault();
    if (joinId.trim()) navigate(`/session/${joinId.trim()}/setup`);
  };

  return (
    <div className="flex-center" style={{ minHeight: '100vh', position: 'relative', padding: isMobile ? '1rem' : '2rem' }}>
      
      {/* System Health Badge */}
      <div className="glass-panel" style={{ 
        position: 'absolute', top: '2rem', right: '2rem', padding: '0.6rem 1rem', 
        display: isMobile ? 'none' : 'flex', gap: '1.25rem', borderRadius: '12px', fontSize: '0.65rem', fontWeight: '800',
        border: '1px solid rgba(255,255,255,0.05)', letterSpacing: '0.05em'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: health.database === 'up' ? '#10b981' : health.database === 'checking' ? '#f59e0b' : '#ef4444', boxShadow: health.database === 'up' ? '0 0 10px #10b981' : 'none' }}></div>
          <span style={{ color: health.database === 'up' ? 'white' : 'var(--text-muted)' }}>DATABASE</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: health.pipeline === 'up' ? '#10b981' : health.pipeline === 'checking' ? '#f59e0b' : '#ef4444', boxShadow: health.pipeline === 'up' ? '0 0 10px #10b981' : 'none' }}></div>
          <span style={{ color: health.pipeline === 'up' ? 'white' : 'var(--text-muted)' }}>PIPELINE</span>
        </div>
      </div>
      {/* Cinematic Background Elements */}
      <div style={{ position: 'fixed', top: '10%', left: '10%', width: '400px', height: '400px', background: 'var(--accent-primary)', filter: 'blur(150px)', opacity: 0.05, borderRadius: '50%', zIndex: -1 }}></div>
      <div style={{ position: 'fixed', bottom: '10%', right: '10%', width: '400px', height: '400px', background: 'var(--accent-secondary)', filter: 'blur(150px)', opacity: 0.05, borderRadius: '50%', zIndex: -1 }}></div>

      <div className="container animate-fade-in" style={{ maxWidth: '1200px', position: 'relative' }}>
        
        {/* Hero Section */}
        <div style={{ textAlign: 'center', marginBottom: isMobile ? '3rem' : '6rem', paddingTop: '4rem' }}>
          <div className="hover-glow" style={{ position: 'relative', display: 'inline-block', marginBottom: '3rem' }}>
            <div style={{ position: 'absolute', inset: '-30px', background: 'var(--accent-primary)', filter: 'blur(50px)', opacity: 0.15, borderRadius: '50%' }}></div>
            <div className="glass-panel" style={{ width: '100px', height: '100px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(255,255,255,0.1)' }}>
              <Globe size={48} color="var(--accent-secondary)" />
            </div>
          </div>

          <h1 style={{ fontSize: isMobile ? '2.8rem' : '5rem', fontWeight: '700', lineHeight: '1', marginBottom: '1.5rem' }}>
            Voice Translation <br />
            <span className="gradient-text">Without Limits</span>
          </h1>
          
          <p style={{ color: 'var(--text-secondary)', fontSize: '1.25rem', marginBottom: '4rem', maxWidth: '650px', margin: '0 auto 4rem' }}>
            Connect with anyone, anywhere. High-fidelity, real-time voice bridge powered by state-of-the-art AI.
          </p>

          <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'center', gap: '2rem', alignItems: 'center' }}>
            
            {/* Create Card */}
            <div className="glass-panel" style={{ padding: '1.5rem', width: isMobile ? '100%' : '380px', textAlign: 'left' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
                <Activity size={20} color="var(--accent-primary)" />
                <span style={{ fontWeight: '700', fontSize: '1.1rem' }}>Create Session</span>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <input 
                  type="text" 
                  placeholder="Custom ID (Optional)" 
                  value={customStartId}
                  onChange={(e) => setCustomStartId(e.target.value)}
                  style={{ flex: 1 }}
                />
                <button onClick={createSession} className="btn-primary" style={{ padding: '0 1.5rem' }}>
                  <PlusCircle size={20} />
                </button>
              </div>
            </div>

            {/* Join Card */}
            <div className="glass-panel" style={{ padding: '1.5rem', width: isMobile ? '100%' : '380px', textAlign: 'left' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
                <Users size={20} color="var(--accent-secondary)" />
                <span style={{ fontWeight: '700', fontSize: '1.1rem' }}>Join Bridge</span>
              </div>
              <form onSubmit={joinSession} style={{ display: 'flex', gap: '0.75rem' }}>
                <input 
                  type="text" 
                  placeholder="Enter Session ID..." 
                  value={joinId}
                  onChange={(e) => setJoinId(e.target.value)}
                  style={{ flex: 1 }}
                />
                <button type="submit" className="btn-secondary" style={{ padding: '0 1.5rem' }}>
                  <ArrowRight size={20} />
                </button>
              </form>
            </div>

          </div>
        </div>

        {/* Activity Section */}
        {recentSessions.length > 0 && (
          <div style={{ animationDelay: '0.4s' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2.5rem' }}>
              <Clock size={20} color="var(--text-muted)" />
              <h3 style={{ textTransform: 'uppercase', letterSpacing: '0.2em', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Recently Joined</h3>
              <div style={{ flex: 1, height: '1px', background: 'var(--glass-border)' }}></div>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(340px, 1fr))', gap: '1.5rem' }}>
              {recentSessions.map((session) => (
                <div 
                  key={session.id} 
                  className="glass-panel" 
                  onClick={() => navigate(`/session/${session.id}/setup`)}
                  style={{ padding: '1.5rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid rgba(255,255,255,0.05)' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
                    <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: 'rgba(255,255,255,0.03)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--glass-border)' }}>
                      <Activity size={20} color="var(--accent-secondary)" />
                    </div>
                    <div>
                      <div style={{ fontWeight: '700', fontSize: '1rem', marginBottom: '0.25rem' }}>{session.id.substring(0, 12)}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{new Date(session.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • Active</div>
                    </div>
                  </div>
                  <ArrowRight size={18} color="var(--text-muted)" />
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
