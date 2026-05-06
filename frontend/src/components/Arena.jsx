import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
const socket = io("https://cyber-arena-server.onrender.com");

// Initialize socket outside component to prevent multiple connections

const Arena = () => {
  const { roomCode } = useParams();
  const navigate = useNavigate();
  const username = localStorage.getItem('username') || 'UnknownPlayer';

  const [matchState, setMatchState] = useState(null);
  const [logs, setLogs] = useState([]);
  const [lockedNumber, setLockedNumber] = useState(null);
  const [isGameOver, setIsGameOver] = useState(false);
  const [winner, setWinner] = useState('');

  useEffect(() => {
    // Connect and join room
    socket.connect();
    socket.emit('join_live_room', roomCode, username);

    // Listen for alerts
    socket.on('player_joined_alert', (data) => {
      addLog(data.message);
    });

    // Listen for match start
    socket.on('match_start', (state) => {
      addLog('? MATCH STARTING! Prepare to throw.');
      setMatchState(state);
    });

    // Listen for ball results
    socket.on('ball_result', (data) => {
      setMatchState(data.state);
      addLog(data.message);
      setLockedNumber(null); // Unlock buttons for the next throw
    });

    // Listen for game over
    socket.on('game_over', (data) => {
      setMatchState(data.matchData);
      setWinner(data.winner);
      setIsGameOver(true);
      addLog(`?? MATCH FINISHED! Winner: ${data.winner}`);
    });

    return () => {
      socket.disconnect();
    };
  }, [roomCode, username]);

  const addLog = (msg) => {
    setLogs((prev) => [msg, ...prev].slice(0, 5)); // Keep last 5 messages
  };

  const playMove = (num) => {
    setLockedNumber(num);
    socket.emit('play_move', roomCode, num);
  };

  const exitArena = () => {
    navigate('/dashboard');
  };

  // UI rendering logic based on role
  let myRole = 'Waiting...';
  let myScore = 0;
  if (matchState) {
    if (matchState.p1.username === username) {
      myRole = matchState.p1.role;
      myScore = matchState.p1.score;
    } else if (matchState.p2 && matchState.p2.username === username) {
      myRole = matchState.p2.role;
      myScore = matchState.p2.score;
    }
  }

  return (
    <div className="auth-container">
      <div className="auth-card" style={{ width: '600px' }}>
        <h2 className="neon-title">ARENA: {roomCode}</h2>
        
        {!matchState && !isGameOver && (
          <h3 style={{ color: '#ff0', animation: 'pulse 1.5s infinite' }}>
            WAITING FOR OPPONENT...
          </h3>
        )}

        {matchState && (
          <div style={{ marginBottom: '20px', border: '1px solid #0ff', padding: '15px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#0f0', fontWeight: 'bold' }}>
              <span>INNINGS: {matchState.innings}</span>
              {matchState.innings === 2 && <span>TARGET: {matchState.targetScore}</span>}
              <span style={{color: '#ff0'}}>ROLE: {myRole.toUpperCase()}</span>
            </div>
            <h1 style={{ fontSize: '3em', margin: '10px 0', textShadow: '0 0 10px #fff' }}>
              SCORE: {myScore}
            </h1>
          </div>
        )}

        {/* The Action Buttons (1 through 6) */}
        {!isGameOver && matchState && (
          <div>
            <h3 style={{ color: '#888' }}>{lockedNumber ? `YOU THREW: ${lockedNumber} (Waiting on Umpire)` : 'SELECT YOUR THROW:'}</h3>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
              {[1, 2, 3, 4, 5, 6].map((num) => (
                <button 
                  key={num}
                  onClick={() => playMove(num)}
                  disabled={lockedNumber !== null}
                  className="neon-button"
                  style={{ 
                    fontSize: '1.5em', 
                    padding: '15px 25px', 
                    opacity: lockedNumber !== null ? 0.5 : 1,
                    borderColor: lockedNumber === num ? '#fff' : '#f0f'
                  }}
                >
                  {num}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Game Over Screen */}
        {isGameOver && (
          <div style={{ marginTop: '20px' }}>
            <h1 className="neon-title" style={{ color: winner === username ? '#0f0' : '#f00' }}>
              {winner === username ? 'VICTORY!' : 'DEFEAT!'}
            </h1>
            <button onClick={exitArena} className="neon-button" style={{ borderColor: '#0ff', color: '#0ff' }}>
              RETURN TO BASE
            </button>
          </div>
        )}

        {/* Live Umpire Feed */}
        <div style={{ marginTop: '30px', textAlign: 'left', background: '#000', padding: '10px', border: '1px solid #333' }}>
          <p style={{ color: '#0ff', margin: '0 0 10px 0', borderBottom: '1px solid #333' }}>UMPIRE FEED</p>
          {logs.map((log, idx) => (
            <p key={idx} style={{ margin: '5px 0', color: idx === 0 ? '#fff' : '#666' }}>
              > {log}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Arena;



