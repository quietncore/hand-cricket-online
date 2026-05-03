import { useEffect, useState, useRef } from 'react';
import io from 'socket.io-client';

const getChessRank = (elo) => {
  if (elo < 1100) return { title: 'SOLDIER I', color: '#a8b2c1' };
  if (elo < 1200) return { title: 'SOLDIER II', color: '#a8b2c1' };
  if (elo < 1300) return { title: 'SOLDIER III', color: '#a8b2c1' };
  if (elo < 1400) return { title: 'KNIGHT I', color: '#00f3ff' };
  if (elo < 1500) return { title: 'KNIGHT II', color: '#00f3ff' };
  if (elo < 1600) return { title: 'KNIGHT III', color: '#00f3ff' };
  if (elo < 1700) return { title: 'BISHOP I', color: '#00ff66' };
  if (elo < 1800) return { title: 'BISHOP II', color: '#00ff66' };
  if (elo < 1900) return { title: 'BISHOP III', color: '#00ff66' };
  if (elo < 2000) return { title: 'ROOK I', color: '#bc13fe' };
  if (elo < 2100) return { title: 'ROOK II', color: '#bc13fe' };
  if (elo < 2200) return { title: 'ROOK III', color: '#bc13fe' };
  if (elo < 2300) return { title: 'QUEEN I', color: '#ffe300' };
  if (elo < 2400) return { title: 'QUEEN II', color: '#ffe300' };
  if (elo < 2500) return { title: 'QUEEN III', color: '#ffe300' };
  return { title: 'GRANDMASTER', color: '#ff003c', glow: true };
};

const THEMES = {
  default: { pri: '#00f3ff', sec: '#bc13fe', acc: '#00ff66', warn: '#ff003c', bg: 'rgba(0, 243, 255, 0.05)' },
  blood: { pri: '#ff003c', sec: '#8b0000', acc: '#ff4d4d', warn: '#ff003c', bg: 'rgba(255, 0, 60, 0.05)' },
  gold: { pri: '#ffe300', sec: '#b8860b', acc: '#ffd700', warn: '#ff4500', bg: 'rgba(255, 227, 0, 0.05)' },
  toxic: { pri: '#39ff14', sec: '#228b22', acc: '#00ffcc', warn: '#ff003c', bg: 'rgba(57, 255, 20, 0.05)' },
  synth: { pri: '#ff00ff', sec: '#8a2be2', acc: '#00ffff', warn: '#ff003c', bg: 'rgba(255, 0, 255, 0.05)' },
  plasma: { pri: '#ff5f1f', sec: '#ff4500', acc: '#ff8c00', warn: '#ff003c', bg: 'rgba(255, 95, 31, 0.05)' }
};

function App() {
  const [hasSeenIntro, setHasSeenIntro] = useState(false);
  const [profile, setProfile] = useState(null);
  const [usernameInput, setUsernameInput] = useState('');
  const [deviceId, setDeviceId] = useState('');
  
  const [currentTab, setCurrentTab] = useState('LOBBY'); 
  const [hardcoreMode, setHardcoreMode] = useState(false);
  const [teamSize, setTeamSize] = useState(1); 
  const gameMode = `${teamSize}v${teamSize}`;
  
  const [socket, setSocket] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [myId, setMyId] = useState(null);
  const [isTeamA, setIsTeamA] = useState(null);
  
  const [privateCodeInput, setPrivateCodeInput] = useState('');
  const [activePrivateLobby, setActivePrivateLobby] = useState(null); 
  const [customBgInput, setCustomBgInput] = useState('');

  const [showDailySplash, setShowDailySplash] = useState(false);
  const [postMatchAdWatched, setPostMatchAdWatched] = useState(false);

  const [gameState, setGameState] = useState({ 
    status: 'offline', logs: [], score: 0, wickets: 0, teamSize: 1, isHardcore: false, batterCombo: 0, 
    tossWinner: null, battingTeam: null, batsman: null, bowler: null, lastClash: null,
    batCaptainNeedsPick: false, bowlCaptainNeedsPick: false, isPrivate: false, hostId: null,
    teamA: { captain: null, players: [] }, teamB: { captain: null, players: [] } 
  });
  
  const [movesLocked, setMovesLocked] = useState({ batsman: null, bowler: null });
  const [timeLeft, setTimeLeft] = useState(5);
  const [error, setError] = useState('');
  const [isWatchingAd, setIsWatchingAd] = useState(false);
  const [adTimer, setAdTimer] = useState(0);
  const [floatingEmote, setFloatingEmote] = useState(null);
  const [isShaking, setIsShaking] = useState(false);
  const [clashAnimation, setClashAnimation] = useState(false);
  const [selectedCapA, setSelectedCapA] = useState('');
  const [selectedCapB, setSelectedCapB] = useState('');
  const logContainerRef = useRef(null);

  let baseCost = teamSize <= 2 ? 1 : teamSize <= 4 ? 3 : teamSize <= 9 ? 4 : 5;
  const totalCost = baseCost + (hardcoreMode ? 1 : 0);

  useEffect(() => {
    const introCleared = localStorage.getItem('cyber_intro_cleared');
    if (introCleared === 'true') setHasSeenIntro(true);

    let savedDevice = localStorage.getItem('cyber_device_id');
    let savedUser = localStorage.getItem('cyber_username');
    if (!savedDevice) {
      savedDevice = 'DEV_' + Math.random().toString(36).substring(2, 15);
      localStorage.setItem('cyber_device_id', savedDevice);
    }
    setDeviceId(savedDevice);

    if (savedUser) {
      const newSocket = io('http://localhost:3001');
      initializeSocketListeners(newSocket);
      newSocket.emit('authenticate', { deviceId: savedDevice, username: savedUser });
      setSocket(newSocket);
    }
  }, []);

  useEffect(() => {
    if (gameState.logs.length > 0 && (gameState.logs[0].includes('OUT!') || gameState.logs[0].includes('TRAP TRIGGERED'))) { setIsShaking(true); setTimeout(() => setIsShaking(false), 500); }
    if (logContainerRef.current) logContainerRef.current.scrollTop = 0;
  }, [gameState.logs]);

  useEffect(() => { if (gameState.lastClash) { setClashAnimation(true); setTimeout(() => setClashAnimation(false), 2000); } }, [gameState.lastClash]);

  const acceptDirective = () => { localStorage.setItem('cyber_intro_cleared', 'true'); setHasSeenIntro(true); };

  const handleCreateProfile = () => {
    if (usernameInput.trim().length < 3) return setError('Callsign requires 3 characters.');
    localStorage.setItem('cyber_username', usernameInput.trim());
    const newSocket = io('http://localhost:3001'); initializeSocketListeners(newSocket);
    newSocket.emit('authenticate', { deviceId: deviceId, username: usernameInput.trim() });
    setSocket(newSocket); setError('');
  };

  const initializeSocketListeners = (newSocket) => {
    newSocket.on('sync_profile', (serverProfile) => setProfile(serverProfile));
    newSocket.on('daily_reward_triggered', () => setShowDailySplash(true));
    newSocket.on('identity', (data) => { setMyId(data.id); setIsTeamA(data.isTeamA); setError(''); setActivePrivateLobby(null); });
    newSocket.on('game_update', (state) => setGameState(state));
    newSocket.on('move_status', (moves) => setMovesLocked(moves));
    newSocket.on('timer_update', (time) => setTimeLeft(time));
    newSocket.on('error_message', (msg) => { setError(msg); setIsSearching(false); setActivePrivateLobby(null); });
    newSocket.on('receive_emote', (data) => { const sender = data.id === newSocket.id ? 'You' : 'Player'; setFloatingEmote({ emoji: data.emoji, sender: sender, id: Date.now() }); setTimeout(() => setFloatingEmote(null), 2000); });
    newSocket.on('private_room_status', (data) => { setActivePrivateLobby(data); setIsSearching(true); setError(''); });
  };

  const executeAdSequence = (callback) => {
    if (isWatchingAd) return; setIsWatchingAd(true); setAdTimer(5);
    let currentTimer = 5;
    const interval = setInterval(() => {
      currentTimer -= 1; setAdTimer(currentTimer);
      if (currentTimer <= 0) { clearInterval(interval); setIsWatchingAd(false); callback(); }
    }, 1000);
  };

  const findMatch = () => { setIsSearching(true); setGameState({ ...gameState, status: 'waiting' }); socket.emit('join_matchmaking', { hardcore: hardcoreMode, mode: gameMode }); };
  const createPrivateRoom = () => socket.emit('create_private_room', { hardcore: hardcoreMode, mode: gameMode });
  const joinPrivateRoom = () => { if (privateCodeInput.length < 5) return setError("Invalid Code."); socket.emit('join_private_room', { code: privateCodeInput.toUpperCase() }); };
  const watchAdCredits = () => executeAdSequence(() => socket.emit('watch_ad_credits'));
  const watchAdPostMatch = () => executeAdSequence(() => { socket.emit('watch_ad_elo_boost'); setPostMatchAdWatched(true); });
  const buyCustomBg = () => { if (customBgInput.length > 5) socket.emit('buy_item', { type: 'customBg', payload: customBgInput }); setCustomBgInput(''); };
  const buyTheme = (themeName) => socket.emit('buy_item', { type: 'theme', payload: themeName });
  const equipTheme = (themeName) => socket.emit('equip_theme', themeName);
  const buyVIP = () => socket.emit('buy_item', { type: 'vip' });

  const handleMove = (num) => { if (socket) socket.emit('make_move', num); };
  const handleTossThrow = (num) => { if (socket) socket.emit('toss_throw', num); };
  const handleEmote = (emoji) => { if (socket) socket.emit('send_emote', emoji); };
  const assignPlayer = (id) => { if (socket) socket.emit('captain_assign', id); };
  const hostAssignCaptains = () => { if (!selectedCapA || !selectedCapB) return setError("Select a Captain for both teams."); socket.emit('host_assign_captains', { capA: selectedCapA, capB: selectedCapB }); setError(''); };

  const isBatsman = myId === gameState.batsman; const isBowler = myId === gameState.bowler;
  const haveIMoved = (isBatsman && movesLocked.batsman !== null) || (isBowler && movesLocked.bowler !== null);
  const isCaptain = gameState.teamA?.captain === myId || gameState.teamB?.captain === myId;
  const isBattingCaptain = isCaptain && gameState.battingTeam === (isTeamA ? 'A' : 'B'); 
  const isBowlingCaptain = isCaptain && gameState.battingTeam !== (isTeamA ? 'A' : 'B');
  const currentMultiplier = 1 + Math.floor((gameState.batterCombo || 0) / 3) * 0.5;
  const rank = profile ? getChessRank(profile.elo) : null;
  const t = THEMES[profile?.theme || 'default'];
  const bgStyle = profile?.customBg ? `url(${profile.customBg}) center/cover no-repeat` : `radial-gradient(ellipse at bottom, #1b2735 0%, #090a0f 100%)`;

  const generateVipPayload = (platform) => {
    const text = `I am currently a [${rank.title}] with [${profile.elo} ELO] in Cyber Arena. I have initiated a ${activePrivateLobby.max/2}v${activePrivateLobby.max/2} Private Match. Enter Invite Code: [${activePrivateLobby.code}] to join my squad.`;
    return platform === 'wa' ? `https://wa.me/?text=${encodeURIComponent(text)}` : `https://ig.me/m/`;
  };

  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Rajdhani:wght@500;700&display=swap');
    body, html { margin: 0; padding: 0; height: 100%; background-color: #050505; color: #fff; font-family: 'Rajdhani', sans-serif; overflow-x: hidden; }
    h1, h2, h3, .orbitron { font-family: 'Orbitron', sans-serif; }
    .cyber-bg { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; z-index: -1; background: ${bgStyle}; }
    .stars { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background-image: radial-gradient(2px 2px at 20px 30px, #eee, rgba(0,0,0,0)), radial-gradient(2px 2px at 40px 70px, #fff, rgba(0,0,0,0)), radial-gradient(2px 2px at 50px 160px, #ddd, rgba(0,0,0,0)), radial-gradient(2px 2px at 90px 40px, #fff, rgba(0,0,0,0)), radial-gradient(2px 2px at 130px 80px, #fff, rgba(0,0,0,0)), radial-gradient(2px 2px at 160px 120px, #ddd, rgba(0,0,0,0)); background-repeat: repeat; background-size: 200px 200px; animation: starMove 100s linear infinite; opacity: 0.3; }
    @keyframes starMove { from { background-position: 0 0; } to { background-position: -10000px 5000px; } }
    @keyframes pulse-warn { 0%, 100% { text-shadow: 0 0 10px ${t.warn}; color: ${t.warn}; transform: scale(1); } 50% { text-shadow: 0 0 30px ${t.warn}, 0 0 40px ${t.warn}; color: #fff; transform: scale(1.1); } }
    @keyframes clash-zoom { 0% { transform: translate(-50%, -50%) scale(0.5); opacity: 0; } 20% { transform: translate(-50%, -50%) scale(1.2); opacity: 1; } 80% { transform: translate(-50%, -50%) scale(1); opacity: 1; } 100% { transform: translate(-50%, -50%) scale(1.5); opacity: 0; } }
    @keyframes float-side { 0% { transform: translateY(30px) scale(0.5); opacity: 0; } 20% { transform: translateY(0px) scale(1.2); opacity: 1; } 80% { transform: translateY(-60px) scale(1.2); opacity: 1; } 100% { transform: translateY(-120px) scale(0.5); opacity: 0; } }
    .shake-effect { animation: glitch 0.3s cubic-bezier(.25,.8,.25,1) both; border: 1px solid ${t.warn} !important; box-shadow: 0 0 20px rgba(255,0,60,0.5) !important; }
    .critical-time { animation: pulse-warn 0.5s infinite; }
    .cyber-panel { background: rgba(10, 15, 20, 0.85); backdrop-filter: blur(15px); border: 1px solid ${t.pri}; box-shadow: 0 0 30px ${t.bg}, inset 0 0 20px ${t.bg}; border-radius: 8px; padding: 30px; margin-bottom: 30px; position: relative; overflow: hidden; }
    .neon-btn { background: ${t.bg}; border: 1px solid ${t.pri}; color: ${t.pri}; padding: 15px 30px; font-size: 22px; cursor: pointer; transition: all 0.3s ease; font-family: 'Orbitron', sans-serif; font-weight: 700; text-transform: uppercase; border-radius: 4px; box-shadow: 0 0 10px ${t.bg}; clip-path: polygon(15px 0, 100% 0, 100% calc(100% - 15px), calc(100% - 15px) 100%, 0 100%, 0 15px); }
    .neon-btn:hover:not(:disabled) { background: ${t.pri}; color: #050505; box-shadow: 0 0 25px ${t.pri}; transform: translateY(-3px); }
    .neon-btn:disabled { border-color: #333; color: #555; background: transparent; cursor: not-allowed; box-shadow: none; transform: none; }
    .input-field { background: rgba(0,0,0,0.7); border: 1px solid ${t.pri}; color: #fff; padding: 20px; font-family: 'Orbitron', sans-serif; font-size: 22px; width: 100%; box-sizing: border-box; margin-bottom: 20px; border-radius: 4px; outline: none; transition: 0.3s; text-align: center; letter-spacing: 2px; }
    .input-field:focus { box-shadow: 0 0 25px ${t.bg}; }
    .nav-tabs { display: flex; gap: 15px; margin-bottom: 30px; border-bottom: 2px solid ${t.pri}; padding-bottom: 10px; }
    .nav-tab { flex: 1; text-align: center; padding: 15px; cursor: pointer; font-family: 'Orbitron'; font-size: 22px; color: #a8b2c1; transition: 0.3s; letter-spacing: 2px; }
    .nav-tab.active { color: ${t.pri}; text-shadow: 0 0 20px ${t.pri}; border-bottom: 4px solid ${t.pri}; }
    .floating-emote { position: fixed; bottom: 15%; right: 5%; font-size: 80px; z-index: 1000; pointer-events: none; animation: float-side 2s forwards; text-shadow: 0 0 30px rgba(255,255,255,0.8); text-align: center; }
    .ad-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(5,5,5,0.95); backdrop-filter: blur(10px); z-index: 9999; display: flex; flex-direction: column; justify-content: center; align-items: center; }
    .clash-box { position: absolute; top: 50%; left: 50%; background: rgba(10, 15, 20, 0.98); border: 3px solid #fff; border-radius: 12px; padding: 40px 60px; text-align: center; z-index: 50; animation: clash-zoom 2s forwards; pointer-events: none; }
    input[type=range] { -webkit-appearance: none; width: 100%; background: transparent; }
    input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; height: 28px; width: 14px; background: ${t.pri}; cursor: pointer; margin-top: -10px; box-shadow: 0 0 20px ${t.pri}; }
    input[type=range]::-webkit-slider-runnable-track { width: 100%; height: 6px; cursor: pointer; background: ${t.bg}; }
    .switch { position: relative; display: inline-block; width: 60px; height: 28px; }
    .switch input { opacity: 0; width: 0; height: 0; }
    .slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: rgba(255, 0, 60, 0.2); transition: .4s; border: 1px solid ${t.warn}; border-radius: 14px; }
    .slider:before { position: absolute; content: ""; height: 18px; width: 18px; left: 4px; bottom: 4px; background-color: ${t.warn}; transition: .4s; border-radius: 50%; box-shadow: 0 0 10px ${t.warn}; }
    input:checked + .slider { background-color: rgba(255, 0, 60, 0.5); }
    input:checked + .slider:before { transform: translateX(32px); background-color: #fff; }
    .hud-terminal { background: rgba(5,5,5,0.9); border-bottom: 2px solid ${t.pri}; padding: 15px 25px; font-family: monospace; font-size: 16px; max-height: 50px; overflow: hidden; color: ${t.acc}; position: absolute; top: 0; left: 0; right: 0; z-index: 10; display: flex; align-items: center; letter-spacing: 1px; box-shadow: 0 5px 20px rgba(0,0,0,0.8); }
  `;

  if (!hasSeenIntro) {
    return (
      <>
        <style>{css}</style>
        <div className="cyber-bg"><div className="stars"></div></div>
        <div style={{ padding: '20px', maxWidth: '850px', margin: '10vh auto', position: 'relative', zIndex: 1 }}>
          <div className="cyber-panel" style={{ padding: '50px' }}>
            <h1 className="orbitron" style={{ color: t.pri, borderBottom: `2px solid ${t.pri}`, paddingBottom: '15px' }}>SYSTEM DECRYPTION...</h1>
            <div style={{ color: t.pri, fontFamily: 'monospace', fontSize: '20px', lineHeight: '1.8', marginTop: '40px' }}>
              <p>YEAR 2142. Conflicts are settled in the <span style={{ color: t.warn, fontWeight: 'bold' }}>CYBER ARENA</span>.</p>
              <ul><li>Execute variables 1-10.</li><li>Matches = <span style={{ color: t.warn, fontWeight: 'bold' }}>ELIMINATION</span>.</li><li>Differing variables = Runs extracted.</li></ul>
            </div>
            <div style={{ textAlign: 'center', marginTop: '50px' }}><button className="neon-btn" style={{ fontSize: '28px' }} onClick={acceptDirective}>[ ACCEPT DIRECTIVE ]</button></div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <style>{css}</style>
      <div className="cyber-bg">{!profile?.customBg && <div className="stars"></div>}</div>
      
      {isWatchingAd && (
        <div className="ad-overlay">
          <h1 style={{ color: '#ffe300', fontSize: '60px', textShadow: '0 0 40px #ffe300' }}>SPONSOR LINK</h1>
          <h2 style={{ color: '#fff', fontSize: '35px', fontFamily: 'Orbitron' }}>Decryption in: <span className="critical-time">00:0{adTimer}</span></h2>
        </div>
      )}

      {showDailySplash && (
        <div className="ad-overlay" style={{ background: 'rgba(0,0,0,0.98)' }}>
          <h1 style={{ color: '#00ff66', fontSize: '70px', textShadow: '0 0 40px #00ff66', fontFamily: 'Orbitron' }}>DAILY PROTOCOL</h1>
          <h2 style={{ color: '#fff', fontSize: '40px', margin: '20px 0 50px 0' }}>+3🪙 ACQUIRED</h2>
          <button className="neon-btn" style={{ borderColor: '#00ff66', color: '#00ff66', fontSize: '30px' }} onClick={() => setShowDailySplash(false)}>ACKNOWLEDGE</button>
        </div>
      )}

      {floatingEmote && (<div key={floatingEmote.id} className="floating-emote">{floatingEmote.emoji}<div style={{ fontSize: '22px', color: '#fff', fontFamily: 'Orbitron', textShadow: '0 0 10px #000' }}>{floatingEmote.sender}</div></div>)}

      <div style={{ padding: '20px', maxWidth: '850px', margin: '0 auto', position: 'relative', zIndex: 1 }}>
        <h1 style={{ textAlign: 'center', color: t.pri, textShadow: `0 0 25px ${t.pri}`, fontSize: '65px', letterSpacing: '8px', margin: '25px 0' }}>CYBER ARENA</h1>
        {error && <div className="cyber-panel" style={{ borderColor: t.warn, color: t.warn, textAlign: 'center', fontSize: '22px', fontWeight: 'bold', boxShadow: `0 0 25px ${t.warn}` }}>[!] {error}</div>}

        {!profile && (
          <div className="cyber-panel" style={{ textAlign: 'center', marginTop: '60px' }}>
            <h2 style={{ color: '#fff', letterSpacing: '4px', fontSize: '30px' }}>INITIALIZE SECURE CONNECTION</h2>
            <input type="text" className="input-field" placeholder="CALLSIGN..." value={usernameInput} onChange={(e) => setUsernameInput(e.target.value)} maxLength={12} />
            <button className="neon-btn" style={{ width: '100%', fontSize: '28px', padding: '20px' }} onClick={handleCreateProfile}>JACK IN</button>
          </div>
        )}

        {profile && gameState.status === 'offline' && !activePrivateLobby && !isSearching && (
          <>
            <div className="nav-tabs">
              <div className={`nav-tab ${currentTab === 'LOBBY' ? 'active' : ''}`} onClick={() => setCurrentTab('LOBBY')}>[ COMMAND CENTER ]</div>
              <div className={`nav-tab ${currentTab === 'STORE' ? 'active' : ''}`} onClick={() => setCurrentTab('STORE')}>[ BLACK MARKET ]</div>
              <div className={`nav-tab ${currentTab === 'PROTOCOL' ? 'active' : ''}`} onClick={() => setCurrentTab('PROTOCOL')}>[ PROTOCOL ]</div>
            </div>

            {currentTab === 'LOBBY' && (
              <div className="cyber-panel">
                <div style={{ borderBottom: `1px solid ${t.pri}`, paddingBottom: '20px', marginBottom: '25px', display: 'flex', justifyContent: 'space-between' }}>
                  <h2 style={{ margin: 0, fontSize: '40px' }}>{profile.username}</h2>
                  <h2 style={{ margin: 0, color: '#ffe300', textShadow: '0 0 20px rgba(255,227,0,0.5)' }}>{profile.credits} 🪙</h2>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '26px', marginBottom: '35px', background: 'rgba(0,0,0,0.6)', padding: '25px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <div><span style={{ color: '#a8b2c1' }}>RANK:</span> <span style={{ color: rank.color, textShadow: rank.glow ? `0 0 20px ${rank.color}` : 'none', fontWeight: 'bold' }}>{rank.title}</span></div>
                  <div><span style={{ color: '#a8b2c1' }}>STREAK:</span> <span style={{ color: t.sec, textShadow: `0 0 20px ${t.sec}`, fontWeight: 'bold' }}>{profile.streak} 🔥</span></div>
                </div>
                
                <div style={{ padding: '30px', background: 'rgba(0,0,0,0.6)', border: `1px solid ${t.pri}`, borderRadius: '8px', marginBottom: '30px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '25px' }}>
                    <h3 style={{ margin: 0, color: '#a8b2c1', fontSize: '24px' }}>PROTOCOL:</h3><span style={{ color: t.pri, fontSize: '40px', fontWeight: '900', textShadow: `0 0 20px ${t.pri}` }}>{gameMode}</span>
                  </div>
                  <input type="range" min="1" max="12" value={teamSize} onChange={(e) => setTeamSize(parseInt(e.target.value))} />
                  <div style={{ color: '#a8b2c1', fontSize: '18px', marginTop: '15px', display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontFamily: 'Orbitron' }}>
                    <span>1v1</span><span>6v6</span><span>12v12</span>
                  </div>
                </div>

                <div style={{ background: 'rgba(255, 0, 60, 0.1)', border: `1px solid ${t.warn}`, padding: '25px', borderRadius: '8px', marginBottom: '40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div><strong style={{ color: t.warn, fontSize: '26px', fontFamily: 'Orbitron', textShadow: `0 0 15px ${t.warn}` }}>SPICY MODE (+1🪙)</strong><span style={{ display:'block', color: '#a8b2c1', fontSize: '20px', marginTop: '5px' }}>Lethal Traps. 2x ELO Stakes.</span></div>
                  <label className="switch"><input type="checkbox" checked={hardcoreMode} onChange={(e) => setHardcoreMode(e.target.checked)} /><span className="slider"></span></label>
                </div>
                
                <div style={{ display: 'flex', gap: '25px', marginBottom: '25px' }}>
                  <button className="neon-btn" style={{ flex: 1, padding: '20px', fontSize: '24px' }} onClick={findMatch} disabled={profile.credits < totalCost}>PUBLIC ({totalCost}🪙)</button>
                  <button className="neon-btn" style={{ flex: 1, padding: '20px', fontSize: '24px', borderColor: '#ffe300', color: '#ffe300' }} onClick={createPrivateRoom} disabled={profile.credits < totalCost}>PRIVATE ({totalCost}🪙)</button>
                </div>
                
                <div style={{ display: 'flex', gap: '20px', background: 'rgba(0,0,0,0.5)', padding: '25px', borderRadius: '8px', border: '1px solid #333' }}>
                   <input type="text" className="input-field" placeholder="INVITE CODE..." value={privateCodeInput} onChange={(e) => setPrivateCodeInput(e.target.value)} maxLength={6} style={{ margin: 0, flex: 2, fontSize: '24px' }} />
                   <button className="neon-btn" style={{ flex: 1, padding: '15px' }} onClick={joinPrivateRoom} disabled={profile.credits < 1}>JOIN (1🪙)</button>
                </div>
              </div>
            )}

            {currentTab === 'STORE' && (
              <div className="cyber-panel">
                <h2 style={{ color: t.sec, textShadow: `0 0 20px ${t.sec}`, borderBottom: `2px solid ${t.sec}`, paddingBottom: '15px', fontSize: '35px' }}>DATA OVERRIDES</h2>
                <div style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid #444', padding: '30px', borderRadius: '8px', marginTop: '30px' }}>
                  <h3 style={{ margin: '0 0 15px 0', color: '#fff', fontSize: '26px' }}>CUSTOM BACKGROUND UPLINK</h3>
                  <p style={{ margin: '0 0 20px 0', color: '#a8b2c1', fontSize: '20px' }}>Input image URL. {profile.customBg && <span style={{color:t.acc, fontWeight: 'bold'}}>ACTIVE UNTIL {new Date(profile.bgExpiry).toLocaleDateString()}</span>}</p>
                  <div style={{ display: 'flex', gap: '15px' }}>
                    <input type="text" className="input-field" placeholder="HTTPS://..." value={customBgInput} onChange={(e) => setCustomBgInput(e.target.value)} style={{ margin: 0, flex: 2 }} />
                    <button className="neon-btn" style={{ flex: 1 }} onClick={buyCustomBg}>UPLOAD (5🪙)</button>
                  </div>
                </div>

                <h2 style={{ color: t.sec, marginTop: '50px', borderBottom: `2px solid ${t.sec}`, paddingBottom: '15px', fontSize: '35px' }}>SYSTEM THEMES</h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px', marginTop: '30px' }}>
                  {Object.keys(THEMES).map(themeKey => (
                    <div key={themeKey} style={{ padding: '25px', border: `2px solid ${THEMES[themeKey].pri}`, background: THEMES[themeKey].bg, textAlign: 'center', borderRadius: '8px' }}>
                      <h3 style={{ color: THEMES[themeKey].pri, margin: '0 0 20px 0', fontSize: '28px', textShadow: `0 0 10px ${THEMES[themeKey].pri}` }}>{themeKey.toUpperCase()}</h3>
                      {profile.ownedThemes.includes(themeKey) ? (
                        <button className="neon-btn" style={{ width: '100%', borderColor: THEMES[themeKey].pri, color: THEMES[themeKey].pri, padding: '15px' }} onClick={() => equipTheme(themeKey)} disabled={profile.theme === themeKey}>{profile.theme === themeKey ? 'ACTIVE' : 'EQUIP'}</button>
                      ) : (
                        <button className="neon-btn" style={{ width: '100%', borderColor: THEMES[themeKey].pri, color: THEMES[themeKey].pri, padding: '15px' }} onClick={() => buyTheme(themeKey)}>BUY (10🪙)</button>
                      )}
                    </div>
                  ))}
                </div>
                <div style={{ textAlign: 'center', marginTop: '50px', borderTop: '1px solid rgba(255,255,255,0.15)', paddingTop: '30px' }}>
                  <button className="neon-btn ad-btn" style={{ width: '100%', padding: '20px', fontSize: '26px' }} onClick={watchAdCredits}>HACK CREDITS (+2🪙)</button>
                </div>
              </div>
            )}

            {currentTab === 'PROTOCOL' && (
              <div className="cyber-panel">
                <h2 style={{ color: t.pri, textShadow: `0 0 20px ${t.pri}`, borderBottom: `2px solid ${t.pri}`, paddingBottom: '15px', fontSize: '35px' }}>SYSTEM DECRYPTION...</h2>
                <div style={{ color: t.pri, fontFamily: 'monospace', fontSize: '20px', lineHeight: '1.8', marginTop: '20px' }}>
                  <p>YEAR 2142. Conflicts are settled in the <span style={{ color: t.warn, fontWeight: 'bold' }}>CYBER ARENA</span>.</p>
                  <ul><li>Execute variables 1-10. Matches = <span style={{ color: t.warn, fontWeight: 'bold' }}>ELIMINATION</span>. Differing = Runs.</li></ul>
                  <p style={{ marginTop: '30px', color: '#a8b2c1' }}>Build your ELO. Acquire Credits. Ascend to Grandmaster.</p>
                </div>
              </div>
            )}
          </>
        )}

        {/* WAITING ROOM & VIP COMMS */}
        {activePrivateLobby && (
          <div className="cyber-panel" style={{ textAlign: 'center', borderColor: '#ffe300', boxShadow: '0 0 40px rgba(255,227,0,0.2)' }}>
            <h2 style={{ margin: '0 0 20px 0', color: '#ffe300', fontSize: '35px' }}>INVITE CODE: <span style={{ fontSize: '60px', color: '#fff', display: 'block', textShadow: '0 0 20px #fff', margin: '15px 0' }}>{activePrivateLobby.code}</span></h2>
            <h3 style={{ margin: '30px 0', color: '#a8b2c1', fontSize: '28px' }}>SQUAD MEMBERS: {activePrivateLobby.current} / {activePrivateLobby.max}</h3>
            
            <div style={{ background: 'rgba(0,0,0,0.6)', padding: '25px', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '15px', border: '1px solid rgba(255,255,255,0.1)' }}>
              {activePrivateLobby.players?.map((p, i) => <div key={i} style={{ color: t.pri, fontSize: '24px', fontWeight: 'bold' }}>{p}</div>)}
            </div>

            {/* VIP HIGH COMMAND MODULE */}
            {activePrivateLobby.isHost && (
              <div style={{ marginTop: '40px', borderTop: '1px solid rgba(255,255,255,0.2)', paddingTop: '30px' }}>
                <h3 style={{ color: '#00ff66', fontSize: '28px', textShadow: '0 0 15px #00ff66', margin: '0 0 15px 0' }}>[ VIP HIGH COMMAND UPLINK ]</h3>
                <p style={{ color: '#a8b2c1', fontSize: '20px', marginBottom: '20px' }}>Generate formatted deployment orders to external social networks.</p>
                
                {profile.elo < 1500 ? (
                  <div style={{ border: '1px solid #ff003c', padding: '20px', color: '#ff003c', background: 'rgba(255,0,60,0.1)', fontSize: '20px', fontWeight: 'bold' }}>
                    ACCESS DENIED. REQUIRED ELO: 1500 (KNIGHT II).
                  </div>
                ) : profile.vipExpiry ? (
                  <div style={{ display: 'flex', gap: '20px', justifyContent: 'center' }}>
                    <a href={generateVipPayload('wa')} target="_blank" rel="noreferrer" className="neon-btn" style={{ textDecoration: 'none', borderColor: '#25D366', color: '#25D366', padding: '15px 30px' }}>
                      WHATSAPP RECRUIT
                    </a>
                    <a href={generateVipPayload('ig')} target="_blank" rel="noreferrer" className="neon-btn" style={{ textDecoration: 'none', borderColor: '#E1306C', color: '#E1306C', padding: '15px 30px' }}>
                      INSTAGRAM RECRUIT
                    </a>
                  </div>
                ) : (
                  <button className="neon-btn" style={{ borderColor: '#00ff66', color: '#00ff66', padding: '15px 40px', fontSize: '24px' }} onClick={buyVIP}>
                    ACTIVATE COMMS (4🪙 / 24H)
                  </button>
                )}
              </div>
            )}

            <p style={{ marginTop: '40px', color: t.pri, fontSize: '22px', animation: 'pulse 2s infinite' }}>{activePrivateLobby.isHost ? 'WAITING FOR SQUAD TO ASSEMBLE...' : 'WAITING FOR HOST TO START...'}</p>
          </div>
        )}

        {isSearching && !activePrivateLobby && <div className="cyber-panel" style={{ textAlign: 'center', padding: '60px', color: t.pri, border: `2px dashed ${t.pri}`, animation: 'pulse 2s infinite' }}><h2 style={{fontSize: '35px', margin: 0}}>SCANNING NETWORK...</h2></div>}

        {gameState.status === 'host_captain_pick' && (
          <div className="cyber-panel" style={{ borderColor: '#ffe300', textAlign: 'center', boxShadow: '0 0 30px rgba(255,227,0,0.2)' }}>
            <h2 style={{ color: '#ffe300', fontSize: '45px', margin: '0 0 20px 0' }}>HOST AUTHORITY</h2>
            {myId === gameState.hostId ? (
              <>
                <div style={{ display: 'flex', gap: '30px', justifyContent: 'center', marginTop: '40px' }}>
                  <div style={{ flex: 1, border: `2px solid ${t.acc}`, padding: '30px', background: 'rgba(0,255,102,0.05)' }}>
                    <h3 style={{ color: t.acc, fontSize: '26px' }}>TEAM A CAPTAIN</h3>
                    <select className="input-field" style={{ color: t.acc, fontSize: '22px' }} value={selectedCapA} onChange={(e) => setSelectedCapA(e.target.value)}><option value="">-- SELECT --</option>{gameState.teamA.players.map(p => <option key={p.id} value={p.id}>{p.username}</option>)}</select>
                  </div>
                  <div style={{ flex: 1, border: `2px solid ${t.sec}`, padding: '30px', background: 'rgba(188,19,254,0.05)' }}>
                    <h3 style={{ color: t.sec, fontSize: '26px' }}>TEAM B CAPTAIN</h3>
                    <select className="input-field" style={{ color: t.sec, fontSize: '22px' }} value={selectedCapB} onChange={(e) => setSelectedCapB(e.target.value)}><option value="">-- SELECT --</option>{gameState.teamB.players.map(p => <option key={p.id} value={p.id}>{p.username}</option>)}</select>
                  </div>
                </div>
                <button className="neon-btn" style={{ marginTop: '40px', padding: '20px 40px', fontSize: '26px', borderColor: '#ffe300', color: '#ffe300' }} onClick={hostAssignCaptains}>LOCK CAPTAINS</button>
              </>
            ) : <h2 style={{ color: '#a8b2c1', padding: '50px', fontSize: '30px' }}>WAITING FOR HOST...</h2>}
          </div>
        )}

        {gameState.status.includes('toss') && (
          <div className="cyber-panel" style={{ textAlign: 'center', borderColor: t.sec, boxShadow: `0 0 30px ${t.bg}` }}>
             <h1 style={{ color: t.sec, fontSize: '60px', margin: '0 0 30px 0', textShadow: `0 0 20px ${t.sec}` }}>THE TOSS</h1>
             {gameState.status === 'toss_selection' && (
               <div>
                 {myId === gameState.tossPicker ? (
                   <div>
                     <h2 style={{ color: '#fff', fontSize: '35px' }}>CAPTAIN, MAKE THE CALL</h2>
                     <div style={{ display: 'flex', gap: '40px', justifyContent: 'center', marginTop: '40px' }}>
                       <button className="neon-btn" style={{ padding: '20px 50px', fontSize: '28px' }} onClick={() => socket.emit('toss_pick', 'odd')}>ODD</button>
                       <button className="neon-btn" style={{ borderColor: t.warn, color: t.warn, padding: '20px 50px', fontSize: '28px' }} onClick={() => socket.emit('toss_pick', 'even')}>EVEN</button>
                     </div>
                   </div>
                 ) : <h2 style={{ color: '#a8b2c1', animation: 'pulse 2s infinite', fontSize: '28px' }}>Awaiting Network Consensus...</h2>}
               </div>
             )}
             {gameState.status === 'toss_throw' && (
               <div>
                 <h2 style={{ color: '#fff', fontSize: '35px' }}>TARGET PROTOCOL: <span style={{ color: gameState.tossChoice === 'odd' ? t.pri : t.warn, textShadow: `0 0 15px ${gameState.tossChoice === 'odd' ? t.pri : t.warn}` }}>{gameState.tossChoice.toUpperCase()}</span></h2>
                 {isCaptain ? (
                    gameState.tossMoves[myId] !== null ? <h2 style={{ color: t.acc, marginTop: '50px', fontSize: '35px' }}>[ ENCRYPTED ]</h2> : (
                     <div style={{ marginTop: '50px' }}>
                       <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', justifyContent: 'center' }}>
                         {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => <button key={n} className="neon-btn" style={{ width: '80px', height: '80px', fontSize: '35px', padding: 0 }} onClick={() => handleTossThrow(n)}>{n}</button>)}
                       </div>
                     </div>
                    )
                 ) : <h2 style={{ color: '#a8b2c1', marginTop: '50px', fontSize: '28px' }}>Captains executing...</h2>}
               </div>
             )}
             {gameState.status === 'toss_decision' && (
               <div>
                 {myId === gameState.tossWinner ? (
                   <div>
                     <h2 style={{ color: t.acc, fontSize: '40px', textShadow: `0 0 20px ${t.acc}` }}>NETWORK PRIORITY SECURED</h2>
                     <div style={{ display: 'flex', gap: '40px', justifyContent: 'center', marginTop: '50px' }}>
                       <button className="neon-btn" style={{ borderColor: t.acc, color: t.acc, padding: '20px 40px', fontSize: '28px' }} onClick={() => socket.emit('toss_decision', 'bat')}>OFFENSE (BAT)</button>
                       <button className="neon-btn" style={{ borderColor: t.sec, color: t.sec, padding: '20px 40px', fontSize: '28px' }} onClick={() => socket.emit('toss_decision', 'bowl')}>DEFENSE (BOWL)</button>
                     </div>
                   </div>
                 ) : <h2 style={{ color: '#a8b2c1', fontSize: '28px' }}>Enemy has Network Priority...</h2>}
               </div>
             )}
          </div>
        )}

        {gameState.status === 'captain_selection' && (
          <div className="cyber-panel" style={{ borderColor: '#ffe300', textAlign: 'center', boxShadow: '0 0 30px rgba(255,227,0,0.2)' }}>
            <h2 style={{ color: '#ffe300', fontSize: '45px', margin: '0 0 20px 0' }}>TACTICAL DEPLOYMENT</h2>
            {isBattingCaptain && gameState.batCaptainNeedsPick && (
              <div style={{ marginTop: '50px', border: `2px solid ${t.acc}`, padding: '30px', background: 'rgba(0,255,102,0.05)' }}>
                <h3 style={{ color: '#fff', fontSize: '28px' }}>Deploy Active STRIKER:</h3>
                <div style={{ display: 'flex', gap: '25px', flexWrap: 'wrap', justifyContent: 'center', marginTop: '20px' }}>
                  {myTeamObj.players.map(p => <button key={p.id} className="neon-btn" style={{ borderColor: p.isOut ? '#333' : t.acc, color: p.isOut ? '#555' : t.acc, padding: '15px 30px' }} disabled={p.isOut} onClick={() => assignPlayer(p.id)}>{p.username} {p.isOut && '[ KIA ]'}</button>)}
                </div>
              </div>
            )}
            {isBowlingCaptain && gameState.bowlCaptainNeedsPick && (
              <div style={{ marginTop: '50px', border: `2px solid ${t.sec}`, padding: '30px', background: 'rgba(188,19,254,0.05)' }}>
                <h3 style={{ color: '#fff', fontSize: '28px' }}>Deploy Active BOWLER:</h3>
                <div style={{ display: 'flex', gap: '25px', flexWrap: 'wrap', justifyContent: 'center', marginTop: '20px' }}>
                  {myTeamObj.players.map(p => <button key={p.id} className="neon-btn" style={{ borderColor: t.sec, color: t.sec, padding: '15px 30px' }} onClick={() => assignPlayer(p.id)}>{p.username}</button>)}
                </div>
              </div>
            )}
            {!isCaptain && <h3 style={{ color: '#a8b2c1', marginTop: '50px', fontSize: '28px', animation: 'pulse 2s infinite' }}>Awaiting Commander Directives...</h3>}
          </div>
        )}

        {gameState.status === 'playing' && (
          <div className={`cyber-panel ${isShaking ? 'shake-effect' : ''}`} style={{ paddingTop: '60px' }}>
            <div className="hud-terminal" ref={logContainerRef}>{gameState.logs.length > 0 ? `> ${gameState.logs[0]}` : '> AWAITING INPUT...'}</div>
            
            {clashAnimation && gameState.lastClash && (
              <div className="clash-box" style={{ borderColor: gameState.lastClash.type === 'out' || gameState.lastClash.type === 'trap' || gameState.lastClash.type === 'timeout' ? t.warn : t.acc, boxShadow: `0 0 60px ${gameState.lastClash.type === 'out' || gameState.lastClash.type === 'trap' ? t.warn : t.acc}` }}>
                {gameState.lastClash.batMove && gameState.lastClash.bowlMove ? (<h1 style={{ fontSize: '70px', color: '#fff', margin: '0 0 25px 0' }}><span style={{ color: t.acc }}>{gameState.lastClash.batMove}</span> <span style={{ color: '#a8b2c1', margin: '0 25px' }}>VS</span> <span style={{ color: t.sec }}>{gameState.lastClash.bowlMove}</span></h1>) : null}
                <h2 style={{ margin: 0, fontSize: '50px', color: gameState.lastClash.type === 'out' || gameState.lastClash.type === 'trap' || gameState.lastClash.type === 'timeout' ? t.warn : t.acc, textShadow: `0 0 20px ${gameState.lastClash.type === 'out' || gameState.lastClash.type === 'trap' ? t.warn : t.acc}` }}>{gameState.lastClash.resultText}</h2>
              </div>
            )}

            {gameState.isHardcore && (
              <div style={{ background: t.bg, borderBottom: `2px solid ${t.warn}`, padding: '15px 30px', display: 'flex', justifyContent: 'space-between', marginTop: '15px' }}>
                <span style={{ color: t.warn, fontWeight: '900', fontSize: '24px', fontFamily: 'Orbitron', textShadow: `0 0 10px ${t.warn}` }}>⚠ SPICY MODE</span>
                <span style={{ color: '#fff', fontSize: '22px' }}>MULTI: <span style={{ color: t.pri, fontWeight: 'bold', fontSize: '26px' }}>x{currentMultiplier}</span></span>
              </div>
            )}

            <div style={{ padding: '30px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: `2px solid ${t.pri}`, paddingBottom: '30px' }}>
                <div>
                  <h2 style={{ color: isBatsman ? t.acc : isBowler ? t.sec : '#a8b2c1', margin: '0 0 15px 0', fontSize: '35px', textShadow: isBatsman ? `0 0 15px ${t.acc}` : isBowler ? `0 0 15px ${t.sec}` : 'none' }}>{isBatsman ? '▶ OFFENSE' : isBowler ? '▶ DEFENSE' : '⏳ STANDBY'}</h2>
                  <div style={{ color: '#a8b2c1', fontSize: '24px', fontWeight: 'bold' }}>INNING: <span style={{color: '#fff'}}>{gameState.inning}</span></div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ color: t.pri, fontSize: '65px', fontWeight: '900', lineHeight: '1', fontFamily: 'Orbitron', textShadow: `0 0 20px ${t.pri}` }}>{gameState.score}</div>
                  {gameState.teamSize > 1 && <div style={{ color: t.warn, marginTop: '15px', fontWeight: 'bold', fontSize: '22px' }}>CASUALTIES: {gameState.wickets} / {gameState.teamSize}</div>}
                  {gameState.target && <div style={{ color: '#ffe300', marginTop: '10px', fontSize: '24px', fontWeight: 'bold', textShadow: '0 0 10px rgba(255,227,0,0.5)' }}>TARGET: {gameState.target}</div>}
                </div>
              </div>

              {(isBatsman || isBowler) ? (
                <>
                  <div style={{ textAlign: 'center', margin: '40px 0' }}>
                    <h1 style={{ fontSize: '110px', margin: 0, color: timeLeft <= 2 ? t.warn : '#fff', textShadow: timeLeft <= 2 ? `0 0 30px ${t.warn}` : '0 0 20px rgba(255,255,255,0.3)' }} className={timeLeft <= 2 ? 'critical-time' : ''}>00:0{timeLeft}</h1>
                  </div>
                  <div style={{ minHeight: '160px' }}>
                    {haveIMoved ? (
                      <div style={{ textAlign: 'center', padding: '50px', border: `2px solid ${t.acc}`, background: 'rgba(0,255,102,0.05)', color: t.acc, borderRadius: '8px' }}><h2 style={{margin: 0, letterSpacing: '4px', fontSize: '30px'}}>[ UPLOADED ]</h2></div>
                    ) : (
                      <div style={{ display: 'flex', gap: '25px', flexWrap: 'wrap', justifyContent: 'center' }}>
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(num => <button key={num} className="neon-btn" style={{ width: '85px', height: '85px', fontSize: '35px', padding: 0 }} onClick={() => handleMove(num)}>{num}</button>)}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                 <div style={{ textAlign: 'center', padding: '70px 20px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.5)', margin: '50px 0', borderRadius: '8px' }}>
                   <h2 style={{ color: '#a8b2c1', margin: 0, fontSize: '30px', letterSpacing: '2px' }}>OBSERVING COMBAT</h2>
                 </div>
              )}
              
              <div style={{ marginTop: '30px', display: 'flex', justifyContent: 'center', gap: '30px', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '30px' }}>
                {['🔥', '💀', '🤡', '⚡'].map(e => (
                  <button key={e} style={{ background: 'transparent', border: '2px solid rgba(255,255,255,0.2)', borderRadius: '50%', width: '70px', height: '70px', fontSize: '35px', cursor: 'pointer', transition: '0.3s' }} 
                    onMouseOver={(ev) => { ev.currentTarget.style.background = 'rgba(255,255,255,0.2)'; ev.currentTarget.style.transform = 'scale(1.15)'; ev.currentTarget.style.boxShadow = '0 0 15px rgba(255,255,255,0.3)'; }}
                    onMouseOut={(ev) => { ev.currentTarget.style.background = 'transparent'; ev.currentTarget.style.transform = 'scale(1)'; ev.currentTarget.style.boxShadow = 'none'; }}
                    onClick={() => handleEmote(e)}>{e}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {gameState.status === 'game_over' && (
          <div className="cyber-panel" style={{ borderColor: '#ffe300', textAlign: 'center', boxShadow: '0 0 40px rgba(255,227,0,0.3)', marginTop: '40px' }}>
            <h1 style={{ color: '#ffe300', fontSize: '65px', margin: '0 0 40px 0', textShadow: '0 0 20px #ffe300' }}>SIMULATION TERMINATED</h1>
            
            <div style={{ display: 'flex', gap: '20px', justifyContent: 'center' }}>
              <button className="neon-btn" style={{ padding: '20px 40px', fontSize: '24px' }} onClick={() => window.location.reload()}>RETURN TO GRID</button>
              {!postMatchAdWatched && (
                <button className="neon-btn ad-btn" style={{ padding: '20px 40px', fontSize: '24px' }} onClick={watchAdPostMatch}>BOOST ELO (+50%)</button>
              )}
            </div>

            <div style={{ height: '250px', overflowY: 'auto', textAlign: 'left', marginTop: '40px', background: 'rgba(0,0,0,0.6)', padding: '25px', borderRadius: '8px', border: '1px solid #333' }}>
              {gameState.logs.map((log, idx) => (
                 <div key={idx} style={{ margin: '12px 0', color: log.includes('OUT') ? t.warn : log.includes('WIN') ? t.acc : '#fff', fontFamily: 'monospace', fontSize: '18px', borderLeft: `4px solid ${log.includes('OUT') ? t.warn : log.includes('WIN') ? t.acc : '#888'}`, paddingLeft: '15px' }}>{log}</div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export default App;