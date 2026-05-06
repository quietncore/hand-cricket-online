import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

const Dashboard = () => {
  const navigate = useNavigate();
  const username = localStorage.getItem('username') || 'Recruit';
  
  const [stats, setStats] = useState({ coins: '?', credits: '?', elo: '?' });
  const [roomCode, setRoomCode] = useState('');
  const [message, setMessage] = useState('');

  const getConfig = () => ({
    headers: { 'x-auth-token': localStorage.getItem('token') }
  });

  const claimReward = async () => {
    try {
      const res = await axios.post('https://cyber-arena-server.onrender.com/api/game/daily-reward', {}, getConfig());
      setMessage(`Success: ${res.data.message}`);
      setStats(prev => ({ ...prev, coins: res.data.newCoinBalance }));
    } catch (err) {
      setMessage(err.response?.data?.message || 'Transmission failed.');
    }
  };

  const createRoom = async () => {
    try {
      const res = await axios.post('https://cyber-arena-server.onrender.com/api/game/create-room', {}, getConfig());
      // Teleport Host to Arena
      navigate(`/arena/${res.data.roomCode}`); 
    } catch (err) {
      setMessage(err.response?.data?.message || 'Transmission failed.');
    }
  };

  const joinRoom = async () => {
    if (!roomCode || roomCode.length !== 6) {
      setMessage('Invalid Room Code format.');
      return;
    }
    try {
      const res = await axios.post('https://cyber-arena-server.onrender.com/api/game/join-room', { roomCode }, getConfig());
      // Teleport Guest to Arena
      navigate(`/arena/${res.data.roomCode}`);
    } catch (err) {
      setMessage(err.response?.data?.message || 'Transmission failed.');
    }
  };

  const logout = () => {
    localStorage.clear();
    navigate('/auth');
  };

  return (
    <div className="auth-container">
      <div className="auth-card" style={{width: '450px'}}>
        <h2 className="neon-title" style={{fontSize: '1.5em'}}>WELCOME, {username.toUpperCase()}</h2>
        
        <div style={{display: 'flex', justifyContent: 'space-around', marginBottom: '25px', color: '#0f0', fontWeight: 'bold'}}>
          <span>COINS: {stats.coins}</span>
          <span>CREDITS: {stats.credits}</span>
          <span>ELO: {stats.elo}</span>
        </div>

        <div className="auth-form">
          <button onClick={claimReward} className="neon-button">
            CLAIM DAILY REWARD (+3 COINS)
          </button>
          
          <button onClick={createRoom} className="neon-button" style={{borderColor: '#0ff', color: '#0ff'}}>
            CREATE MATCH (-2 CREDITS)
          </button>

          <div style={{display: 'flex', gap: '10px', marginTop: '10px'}}>
            <input 
              type="text" 
              placeholder="ENTER 6-DIGIT CODE" 
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              className="cyber-input"
              style={{flex: 1, textAlign: 'center', letterSpacing: '2px'}}
              maxLength="6"
            />
            <button onClick={joinRoom} className="neon-button" style={{borderColor: '#ff0', color: '#ff0'}}>
              JOIN
            </button>
          </div>
        </div>

        {message && <p className="system-message" style={{marginTop: '20px'}}>{message}</p>}
        
        <p className="auth-toggle" onClick={logout} style={{marginTop: '30px', color: '#ff0055'}}>
          [ INITIATE LOGOUT ]
        </p>
      </div>
    </div>
  );
};

export default Dashboard;

