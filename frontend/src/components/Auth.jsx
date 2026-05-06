import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

const Auth = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';
    
    try {
      const response = await axios.post(`http://localhost:3000${endpoint}`, {
        username,
        password
      });

      if (isLogin) {
        localStorage.setItem('token', response.data.token);
        localStorage.setItem('username', response.data.username);
        setMessage('Access Granted. Entering Arena...');
        setTimeout(() => navigate('/dashboard'), 1500);
      } else {
        setMessage('Registration Successful! Please log in.');
        setIsLogin(true);
      }
    } catch (err) {
      setMessage(err.response?.data?.message || 'Transmission failed.');
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h1 className="neon-title">{isLogin ? 'SYSTEM LOGIN' : 'NEW RECRUIT'}</h1>
        
        <form onSubmit={handleSubmit} className="auth-form">
          <input 
            type="text" 
            placeholder="Username" 
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            className="cyber-input"
          />
          <input 
            type="password" 
            placeholder="Password" 
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="cyber-input"
          />
          <button type="submit" className="neon-button">
            {isLogin ? 'INITIALIZE' : 'REGISTER'}
          </button>
        </form>

        <p className="auth-toggle" onClick={() => setIsLogin(!isLogin)}>
          {isLogin ? 'No account? Register here.' : 'Already a recruit? Log in.'}
        </p>
        
        {message && <p className="system-message">{message}</p>}
      </div>
    </div>
  );
};

export default Auth;
