import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import SessionSetup from './pages/SessionSetup';
import ActiveCall from './pages/ActiveCall';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/session/:id/setup" element={<SessionSetup />} />
        <Route path="/session/:id/call" element={<ActiveCall />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
