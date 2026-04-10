import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Globe, ArrowRight, Users } from 'lucide-react';

const Home = () => {
  const navigate = useNavigate();
  const [joinId, setJoinId] = useState('');

  const createSession = async () => {
    try {
      // Leverage environment variable for cloud deployment, fallback to localhost
      const API_BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
      const res = await fetch(`${API_BASE_URL}/api/sessions`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        navigate(`/session/${data.session.id}/setup`);
      }
    } catch (err) {
      console.error(err);
      // Fallback for mock frontend-only testing
      const fakeId = Math.random().toString(36).substring(2, 9);
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
    <div className="flex-center">
      <div className="glass-panel animate-fade-in" style={{ maxWidth: '500px', width: '100%', textAlign: 'center' }}>
        <Globe size={48} color="#818cf8" style={{ margin: '0 auto 1.5rem auto' }} />
        <h1 style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }} className="gradient-text">Galaxy Translation</h1>
        <p style={{ color: 'var(--text-muted)', marginBottom: '2.5rem' }}>
          Real-time multilingual voice translation for seamless communication.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <button className="btn-primary" onClick={createSession} style={{ padding: '1rem' }}>
            <Users size={20} />
            Start New Session
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', color: 'var(--text-muted)' }}>
            <hr style={{ flex: 1, borderColor: 'var(--border-color)' }} />
            <span>OR</span>
            <hr style={{ flex: 1, borderColor: 'var(--border-color)' }} />
          </div>

          <form onSubmit={joinSession} style={{ display: 'flex', gap: '0.5rem' }}>
            <input 
              type="text" 
              placeholder="Enter Session ID" 
              value={joinId}
              onChange={(e) => setJoinId(e.target.value)}
              required
            />
            <button type="submit" className="btn-outline">
              Join <ArrowRight size={18} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Home;
