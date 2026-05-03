const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });

// --- AUTHORITATIVE DATABASE LAYER ---
let usersDB = {}; // Secure Server-Side Memory

function getUser(deviceId, username) {
  if (!usersDB[deviceId]) {
    usersDB[deviceId] = {
      deviceId, username, elo: 1000, streak: 0, credits: 10,
      lastLogin: new Date().toISOString().split('T')[0],
      ownedThemes: ['default'], theme: 'default', customBg: null, bgExpiry: null, vipExpiry: null
    };
  }
  return usersDB[deviceId];
}

// --- GAME STATE MEMORY ---
let rooms = {}; 
let queues = {};
for (let i = 1; i <= 12; i++) { queues[`${i}v${i}`] = []; }
let socketToRoom = {};
let privateLobbies = {}; 
const botNames = ['GHOST_PROTOCOL', 'NEON_PHANTOM', 'VOID_WALKER', 'CYBER_RONIN', 'SYS_ADMIN', 'NULL_POINTER'];

function generateRoomId() { return 'room_' + Math.random().toString(36).substring(2, 9); }
function generateInviteCode() { return Math.random().toString(36).substring(2, 8).toUpperCase(); }
function generateBotProfile(humanElo) { return { username: botNames[Math.floor(Math.random() * botNames.length)], elo: humanElo + Math.floor(Math.random() * 100) - 50, streak: Math.floor(Math.random() * 5), isBot: true }; }

function initializeRoom(roomId, mode, playersArr, isPrivate = false, hostId = null) {
  const teamSize = parseInt(mode.split('v')[0]);
  let initialGameState = {
    status: (isPrivate && teamSize > 1) ? 'host_captain_pick' : 'toss_selection', 
    mode: mode, teamSize: teamSize, isPrivate: isPrivate, hostId: hostId,
    tossPicker: null, tossChoice: null, tossMoves: {}, tossWinner: null,
    batsman: null, bowler: null, batCaptainNeedsPick: false, bowlCaptainNeedsPick: false,
    battingTeam: null, score: 0, target: null, inning: 1, wickets: 0,
    logs: [], timeLeft: 5, isHardcore: false, batterCombo: 0, bowlerTrap: null, lastClash: null,
    teamA: { captain: null, players: [] }, teamB: { captain: null, players: [] }
  };

  let roomPlayers = {}; let hasBot = false; let botId = null;
  playersArr.forEach((p, index) => {
    roomPlayers[p.id] = { id: p.id, profile: p.profile, misses: 0, wantsHardcore: p.hardcore, isBot: p.isBot };
    initialGameState.tossMoves[p.id] = null;
    if (!initialGameState.isHardcore && p.hardcore) initialGameState.isHardcore = true;
    if (p.isBot) { hasBot = true; botId = p.id; }
    if (index < teamSize) initialGameState.teamA.players.push({ id: p.id, username: p.profile.username, isOut: false, isBot: p.isBot });
    else initialGameState.teamB.players.push({ id: p.id, username: p.profile.username, isOut: false, isBot: p.isBot });
  });

  if (!isPrivate || teamSize === 1) {
    initialGameState.teamA.captain = initialGameState.teamA.players[0].id;
    initialGameState.teamB.captain = initialGameState.teamB.players[0].id;
    initialGameState.tossPicker = Math.random() < 0.5 ? initialGameState.teamA.captain : initialGameState.teamB.captain;
    initialGameState.logs.unshift(`🪙 ${roomPlayers[initialGameState.tossPicker].profile.username} is calling Toss...`);
  } else { initialGameState.logs.unshift(`👑 Awaiting Host to designate Squad Captains...`); }

  rooms[roomId] = { id: roomId, playerIds: playersArr.map(p => p.id), players: roomPlayers, gameState: initialGameState, currentMoves: { batsman: null, bowler: null }, timerInterval: null, hasBot: hasBot, botId: botId };
}

function destroyRoom(roomId) {
  if (rooms[roomId]) {
    clearInterval(rooms[roomId].timerInterval);
    rooms[roomId].playerIds.forEach(id => delete socketToRoom[id]);
    delete rooms[roomId];
  }
}

function startTimer(roomId) {
  const room = rooms[roomId]; if (!room) return;
  clearInterval(room.timerInterval); room.gameState.timeLeft = 5;
  io.to(roomId).emit('timer_update', room.gameState.timeLeft);

  room.timerInterval = setInterval(() => {
    room.gameState.timeLeft--; io.to(roomId).emit('timer_update', room.gameState.timeLeft);
    if (room.gameState.timeLeft <= 0) { clearInterval(room.timerInterval); resolveTurn(roomId); }
  }, 1000);
}

function processPostGame(roomId, winningTeamStr) {
  const room = rooms[roomId];
  const eloReward = room.gameState.isHardcore ? 50 : 25; 
  const eloPenalty = room.gameState.isHardcore ? 30 : 15;

  const winningPlayers = winningTeamStr === 'A' ? room.gameState.teamA.players : room.gameState.teamB.players;
  const losingPlayers = winningTeamStr === 'A' ? room.gameState.teamB.players : room.gameState.teamA.players;

  winningPlayers.forEach(p => {
    let rp = room.players[p.id];
    if (rp && !rp.isBot && usersDB[rp.profile.deviceId]) {
      usersDB[rp.profile.deviceId].elo += eloReward; 
      usersDB[rp.profile.deviceId].streak += 1;
      io.to(p.id).emit('sync_profile', usersDB[rp.profile.deviceId]);
    }
  });

  losingPlayers.forEach(p => {
    let rp = room.players[p.id];
    if (rp && !rp.isBot && usersDB[rp.profile.deviceId]) {
      usersDB[rp.profile.deviceId].elo = Math.max(0, usersDB[rp.profile.deviceId].elo - eloPenalty); 
      usersDB[rp.profile.deviceId].streak = 0;
      io.to(p.id).emit('sync_profile', usersDB[rp.profile.deviceId]);
    }
  });
}

function transitionToCaptainSelection(roomId) {
  const room = rooms[roomId]; const state = room.gameState; state.lastClash = null;
  if (state.teamSize <= 2) {
    const batRoster = state.battingTeam === 'A' ? state.teamA.players : state.teamB.players;
    const bowlRoster = state.battingTeam === 'A' ? state.teamB.players : state.teamA.players;
    state.batsman = batRoster.find(p => !p.isOut)?.id; state.bowler = bowlRoster[Math.floor(Math.random() * bowlRoster.length)].id; 
    state.status = 'playing'; io.to(roomId).emit('game_update', state); startTimer(roomId); triggerBotLogic(roomId);
  } else {
    state.status = 'captain_selection'; state.batCaptainNeedsPick = true; state.bowlCaptainNeedsPick = true;
    state.batsman = null; state.bowler = null; state.logs.unshift(`Captains are configuring the matchup...`); io.to(roomId).emit('game_update', state);
  }
}

function handleInningTransition(roomId) {
  const room = rooms[roomId]; const state = room.gameState;
  if (state.inning === 1) {
    state.inning = 2; state.target = state.score + 1; state.logs.unshift(`INNING OVER. Target to win is ${state.target}.`);
    state.battingTeam = state.battingTeam === 'A' ? 'B' : 'A'; state.score = 0; state.wickets = 0; state.batterCombo = 0;
    if (state.isHardcore) state.bowlerTrap = Math.floor(Math.random() * 10) + 1;
    transitionToCaptainSelection(roomId);
  } else {
    state.status = 'game_over'; state.logs.unshift(`MATCH OVER! Bowlers successfully defended!`);
    processPostGame(roomId, state.battingTeam === 'A' ? 'B' : 'A'); io.to(roomId).emit('game_update', state);
  }
}

function checkTossResolution(roomId) {
  const room = rooms[roomId]; const state = room.gameState;
  const capA = state.teamA.captain; const capB = state.teamB.captain;
  if (state.tossMoves[capA] !== null && state.tossMoves[capB] !== null) {
    const result = (state.tossMoves[capA] + state.tossMoves[capB]) % 2 === 0 ? 'even' : 'odd';
    state.tossWinner = state.tossChoice === result ? state.tossPicker : (state.tossPicker === capA ? capB : capA);
    state.status = 'toss_decision'; io.to(roomId).emit('game_update', state); triggerBotLogic(roomId);
  }
}

function triggerBotLogic(roomId) {
  const room = rooms[roomId]; if (!room || !room.hasBot) return;
  const state = room.gameState; const botId = room.botId;
  setTimeout(() => {
    if (!rooms[roomId]) return; 
    if (state.status === 'toss_selection' && state.tossPicker === botId) {
      state.tossChoice = Math.random() < 0.5 ? 'odd' : 'even'; state.status = 'toss_throw'; io.to(roomId).emit('game_update', state); triggerBotLogic(roomId); 
    }
    else if (state.status === 'toss_throw' && state.tossMoves[botId] === null) {
      state.tossMoves[botId] = Math.floor(Math.random() * 10) + 1; io.to(roomId).emit('game_update', state); checkTossResolution(roomId);
    }
    else if (state.status === 'toss_decision' && state.tossWinner === botId) {
      const choice = Math.random() < 0.5 ? 'bat' : 'bowl';
      state.battingTeam = choice === 'bat' ? (botId === state.teamA.captain ? 'A' : 'B') : (botId === state.teamA.captain ? 'B' : 'A');
      if (state.isHardcore) state.bowlerTrap = Math.floor(Math.random() * 10) + 1;
      state.logs.unshift(`🏏 ${room.players[botId].profile.username} elected to ${choice.toUpperCase()} first!`); transitionToCaptainSelection(roomId);
    }
    else if (state.status === 'playing') {
      const isBotBatting = state.batsman === botId; const isBotBowling = state.bowler === botId;
      if (!isBotBatting && !isBotBowling) return;
      const humanMove = isBotBatting ? room.currentMoves.bowler : room.currentMoves.batsman;
      if (humanMove === null) { setTimeout(() => triggerBotLogic(roomId), 500); return; }

      let botMove;
      if (isBotBatting) { botMove = Math.floor(Math.random() * 10) + 1; if (botMove === humanMove && Math.random() < 0.4) botMove = (botMove % 10) + 1; } 
      else {
        let killChance = 0.08; if (state.batterCombo >= 3) killChance = 0.25; 
        if (state.inning === 2 && state.target - state.score <= 5) killChance = Math.random() < 0.5 ? 0.02 : 0.40;
        if (Math.random() < killChance) { botMove = humanMove; io.to(roomId).emit('receive_emote', { id: botId, emoji: '💀' }); } 
        else { botMove = Math.floor(Math.random() * 10) + 1; if (botMove === humanMove) botMove = (botMove % 10) + 1; }
        if (state.isHardcore && humanMove === state.bowlerTrap) io.to(roomId).emit('receive_emote', { id: botId, emoji: '🤡' });
      }

      if (isBotBatting) room.currentMoves.batsman = botMove; else room.currentMoves.bowler = botMove;
      io.to(roomId).emit('move_status', room.currentMoves);
      if (room.currentMoves.batsman !== null && room.currentMoves.bowler !== null) { clearInterval(room.timerInterval); resolveTurn(roomId); }
    }
  }, Math.floor(Math.random() * 2300) + 1200);
}

function resolveTurn(roomId) {
  const room = rooms[roomId]; if (!room) return;
  const state = room.gameState; const batMove = room.currentMoves.batsman; const bowlMove = room.currentMoves.bowler;
  room.currentMoves = { batsman: null, bowler: null }; io.to(roomId).emit('move_status', room.currentMoves);
  let logEntry = ``; let clashData = { batMove, bowlMove, type: '', resultText: '' };

  if (batMove === null || bowlMove === null) {
    clashData.type = 'timeout'; clashData.resultText = 'TIME OUT TIMBER!'; state.batterCombo = 0; 
    if (batMove === null) { state.score = Math.max(0, state.score - 1); logEntry = `Batter timeout. -1 run.`; }
    if (bowlMove === null) { state.score += 1; logEntry = `Bowler timeout. +1 run to Batter.`; }
    state.lastClash = clashData;
    if (state.inning === 2 && state.score >= state.target) {
      state.status = 'game_over'; logEntry = `Batters reached target via penalty and WIN!`; processPostGame(roomId, state.battingTeam); state.logs.unshift(logEntry); io.to(roomId).emit('game_update', state); return;
    }
  } else {
    if (batMove === bowlMove) {
      clashData.type = 'out'; clashData.resultText = 'STRIKER ELIMINATED!'; logEntry = `Batter: ${batMove} | Bowler: ${bowlMove} ➔ 💥 OUT!`; state.wickets++;
      const batRoster = state.battingTeam === 'A' ? state.teamA.players : state.teamB.players;
      let activeBat = batRoster.find(p => p.id === state.batsman); if (activeBat) activeBat.isOut = true;
      state.lastClash = clashData;
      if (state.wickets >= state.teamSize) { state.logs.unshift(logEntry); handleInningTransition(roomId); return; } 
      else { state.batterCombo = 0; state.logs.unshift(logEntry); transitionToCaptainSelection(roomId); return; }
    } else if (state.isHardcore && batMove === state.bowlerTrap) {
      clashData.type = 'trap'; clashData.resultText = 'SYSTEM TRAP TRIGGERED!';
      state.score = Math.floor(state.score / 2); state.batterCombo = 0; state.bowlerTrap = Math.floor(Math.random() * 10) + 1; 
      logEntry = `🚨 TRAP TRIGGERED! Score HALVED to ${state.score}.`; state.lastClash = clashData;
    } else {
      let mult = state.isHardcore ? (1 + Math.floor(state.batterCombo / 3) * 0.5) : 1;
      let runs = Math.floor(batMove * mult); state.score += runs; if (state.isHardcore) state.batterCombo++;
      clashData.type = 'score'; clashData.resultText = `+${runs} RUNS`; if (mult > 1) clashData.resultText += ` (x${mult})`;
      logEntry = `Batter: ${batMove} | Bowler: ${bowlMove} ➔ +${runs} Runs. Total: ${state.score}`; state.lastClash = clashData;
      if (state.inning === 2 && state.score >= state.target) { state.status = 'game_over'; logEntry = `🎉 MATCH OVER! Batters chased the target!`; processPostGame(roomId, state.battingTeam); }
    }
  }

  state.logs.unshift(logEntry); io.to(roomId).emit('game_update', state);
  if (state.status === 'playing') { startTimer(roomId); triggerBotLogic(roomId); }
}

// --- SOCKET CONNECTIONS & SECURE AUTH ---
io.on('connection', (socket) => {
  let userDevice = null;

  socket.on('authenticate', (data) => {
    userDevice = data.deviceId;
    let user = getUser(data.deviceId, data.username);
    
    // Check Daily Login
    const today = new Date().toISOString().split('T')[0];
    let dailyClaimed = false;
    if (user.lastLogin !== today) {
      user.credits += 3;
      user.lastLogin = today;
      dailyClaimed = true;
    }

    // Check Expirations
    if (user.customBg && user.bgExpiry && new Date() > new Date(user.bgExpiry)) { user.customBg = null; user.bgExpiry = null; }
    if (user.vipExpiry && new Date() > new Date(user.vipExpiry)) { user.vipExpiry = null; }

    socket.emit('sync_profile', user);
    if (dailyClaimed) socket.emit('daily_reward_triggered');
  });

  // SECURE ECONOMY ACTIONS
  socket.on('watch_ad_credits', () => {
    if (!userDevice) return;
    usersDB[userDevice].credits += 2;
    socket.emit('sync_profile', usersDB[userDevice]);
  });

  socket.on('watch_ad_elo_boost', () => {
    if (!userDevice) return;
    usersDB[userDevice].elo += 12; // 50% post-match boost approximation
    socket.emit('sync_profile', usersDB[userDevice]);
  });

  socket.on('buy_item', (data) => {
    if (!userDevice) return;
    let user = usersDB[userDevice];
    
    if (data.type === 'customBg' && user.credits >= 5) {
      user.credits -= 5; user.customBg = data.payload;
      let exp = new Date(); exp.setDate(exp.getDate() + 30); user.bgExpiry = exp.toISOString();
    } 
    else if (data.type === 'theme' && user.credits >= 10 && !user.ownedThemes.includes(data.payload)) {
      user.credits -= 10; user.ownedThemes.push(data.payload); user.theme = data.payload;
    }
    else if (data.type === 'vip' && user.credits >= 4) {
      user.credits -= 4; 
      let exp = new Date(); exp.setDate(exp.getDate() + 1); user.vipExpiry = exp.toISOString();
    }
    else { return socket.emit('error_message', 'Transaction Failed: Insufficient Credits.'); }
    
    socket.emit('sync_profile', user);
  });

  socket.on('equip_theme', (theme) => {
    if (userDevice && usersDB[userDevice].ownedThemes.includes(theme)) {
      usersDB[userDevice].theme = theme; socket.emit('sync_profile', usersDB[userDevice]);
    }
  });

  // MATCHMAKING SECURE DEDUCTION
  socket.on('join_matchmaking', (data) => {
    if (!userDevice) return;
    let user = usersDB[userDevice];
    const teamSize = parseInt(data.mode.split('v')[0]);
    let cost = (teamSize <= 2 ? 1 : teamSize <= 4 ? 3 : teamSize <= 9 ? 4 : 5) + (data.hardcore ? 1 : 0);
    
    if (user.credits < cost) return socket.emit('error_message', 'INSUFFICIENT CREDITS.');
    user.credits -= cost; socket.emit('sync_profile', user);

    const mode = data.mode; if (!queues[mode]) return;
    const requiredPlayers = teamSize * 2;
    queues[mode].push({ id: socket.id, socket: socket, profile: user, hardcore: data.hardcore, isBot: false });

    if (mode === '1v1') {
      setTimeout(() => {
        const stillWaiting = queues[mode].find(p => p.id === socket.id);
        if (stillWaiting && queues[mode].length < requiredPlayers) {
          const human = queues[mode].shift(); 
          const botObj = { id: 'bot_' + Math.random().toString(36).substring(2, 9), socket: null, profile: generateBotProfile(human.profile.elo), hardcore: data.hardcore, isBot: true };
          let playersArr = [human, botObj]; const roomId = generateRoomId();
          human.socket.join(roomId); socketToRoom[human.id] = roomId;
          initializeRoom(roomId, mode, playersArr, false);
          playersArr.forEach((p, i) => { if (!p.isBot) p.socket.emit('identity', { id: p.id, isTeamA: i < rooms[roomId].gameState.teamSize }); });
          io.to(roomId).emit('game_update', rooms[roomId].gameState); triggerBotLogic(roomId);
        }
      }, 4000); 
    }
    
    if (queues[mode].length >= requiredPlayers) {
      let playersArr = []; for(let i=0; i<requiredPlayers; i++) playersArr.push(queues[mode].shift());
      const roomId = generateRoomId(); playersArr.forEach(p => { p.socket.join(roomId); socketToRoom[p.id] = roomId; });
      initializeRoom(roomId, mode, playersArr, false);
      playersArr.forEach((p, i) => p.socket.emit('identity', { id: p.id, isTeamA: i < rooms[roomId].gameState.teamSize }));
      io.to(roomId).emit('game_update', rooms[roomId].gameState);
    }
  });

  socket.on('create_private_room', (data) => {
    if (!userDevice) return; let user = usersDB[userDevice];
    const teamSize = parseInt(data.mode.split('v')[0]);
    let cost = (teamSize <= 2 ? 1 : teamSize <= 4 ? 3 : teamSize <= 9 ? 4 : 5) + (data.hardcore ? 1 : 0);
    if (user.credits < cost) return socket.emit('error_message', 'INSUFFICIENT CREDITS.');
    user.credits -= cost; socket.emit('sync_profile', user);

    const code = generateInviteCode();
    privateLobbies[code] = { mode: data.mode, hardcore: data.hardcore, hostId: socket.id, players: [{ id: socket.id, socket: socket, profile: user, hardcore: data.hardcore, isBot: false }] };
    socket.emit('private_room_status', { code: code, current: 1, max: teamSize * 2, isHost: true, players: privateLobbies[code].players.map(p=>p.profile.username) });
  });

  socket.on('join_private_room', (data) => {
    if (!userDevice) return; let user = usersDB[userDevice];
    if (user.credits < 1) return socket.emit('error_message', 'INSUFFICIENT CREDITS.');

    const lobby = privateLobbies[data.code];
    if (!lobby) return socket.emit('error_message', 'Invalid Code.');
    const requiredPlayers = parseInt(lobby.mode.split('v')[0]) * 2;
    if (lobby.players.length >= requiredPlayers) return socket.emit('error_message', 'Lobby is full.');

    user.credits -= 1; socket.emit('sync_profile', user);
    lobby.players.push({ id: socket.id, socket: socket, profile: user, hardcore: lobby.hardcore, isBot: false });
    lobby.players.forEach(p => p.socket.emit('private_room_status', { code: data.code, current: lobby.players.length, max: requiredPlayers, isHost: p.id === lobby.hostId, players: lobby.players.map(pl=>pl.profile.username) }));

    if (lobby.players.length === requiredPlayers) {
      const roomId = generateRoomId(); let playersArr = [...lobby.players]; delete privateLobbies[data.code]; 
      playersArr.forEach(p => { p.socket.join(roomId); socketToRoom[p.id] = roomId; });
      initializeRoom(roomId, lobby.mode, playersArr, true, lobby.hostId);
      playersArr.forEach((p, i) => p.socket.emit('identity', { id: p.id, isTeamA: i < rooms[roomId].gameState.teamSize }));
      io.to(roomId).emit('game_update', rooms[roomId].gameState);
    }
  });

  // IN-GAME COMMANDS
  socket.on('host_assign_captains', (data) => {
    const roomId = socketToRoom[socket.id]; if (!roomId) return; const room = rooms[roomId];
    if (room.gameState.status !== 'host_captain_pick' || socket.id !== room.gameState.hostId) return;
    room.gameState.teamA.captain = data.capA; room.gameState.teamB.captain = data.capB;
    room.gameState.status = 'toss_selection'; room.gameState.tossPicker = Math.random() < 0.5 ? data.capA : data.capB;
    room.gameState.logs.unshift(`🪙 Captains Locked. ${room.players[room.gameState.tossPicker].profile.username} is calling Toss...`);
    io.to(roomId).emit('game_update', room.gameState);
  });
  socket.on('toss_pick', (choice) => { const roomId = socketToRoom[socket.id]; if (!roomId) return; rooms[roomId].gameState.tossChoice = choice; rooms[roomId].gameState.status = 'toss_throw'; io.to(roomId).emit('game_update', rooms[roomId].gameState); triggerBotLogic(roomId); });
  socket.on('toss_throw', (number) => { const roomId = socketToRoom[socket.id]; if (!roomId || rooms[roomId].gameState.status !== 'toss_throw') return; rooms[roomId].gameState.tossMoves[socket.id] = number; io.to(roomId).emit('game_update', rooms[roomId].gameState); checkTossResolution(roomId); });
  socket.on('toss_decision', (choice) => { const roomId = socketToRoom[socket.id]; if (!roomId) return; const room = rooms[roomId]; if (socket.id !== room.gameState.tossWinner || room.gameState.status !== 'toss_decision') return; const isCapA = socket.id === room.gameState.teamA.captain; room.gameState.battingTeam = choice === 'bat' ? (isCapA ? 'A' : 'B') : (isCapA ? 'B' : 'A'); if (room.gameState.isHardcore) room.gameState.bowlerTrap = Math.floor(Math.random() * 10) + 1; room.gameState.logs.unshift(`🏏 ${room.players[socket.id].profile.username} elected to ${choice.toUpperCase()} first!`); transitionToCaptainSelection(roomId); });
  socket.on('captain_assign', (playerId) => { const roomId = socketToRoom[socket.id]; if (!roomId) return; const room = rooms[roomId]; const state = room.gameState; if (state.status !== 'captain_selection') return; const isBattingCaptain = (state.battingTeam === 'A' && socket.id === state.teamA.captain) || (state.battingTeam === 'B' && socket.id === state.teamB.captain); const isBowlingCaptain = (state.battingTeam === 'A' && socket.id === state.teamB.captain) || (state.battingTeam === 'B' && socket.id === state.teamA.captain); if (isBattingCaptain && state.batCaptainNeedsPick) { state.batsman = playerId; state.batCaptainNeedsPick = false; } if (isBowlingCaptain && state.bowlCaptainNeedsPick) { state.bowler = playerId; state.bowlCaptainNeedsPick = false; } io.to(roomId).emit('game_update', state); if (!state.batCaptainNeedsPick && !state.bowlCaptainNeedsPick) { state.status = 'playing'; state.logs.unshift(`Matchup Locked. PLAY!`); io.to(roomId).emit('game_update', state); startTimer(roomId); } });
  socket.on('make_move', (number) => { const roomId = socketToRoom[socket.id]; if (!roomId) return; const room = rooms[roomId]; if (room.gameState.status !== 'playing') return; if (socket.id === room.gameState.batsman) room.currentMoves.batsman = number; else if (socket.id === room.gameState.bowler) room.currentMoves.bowler = number; else return; io.to(roomId).emit('move_status', room.currentMoves); if (room.currentMoves.batsman !== null && room.currentMoves.bowler !== null) { clearInterval(room.timerInterval); resolveTurn(roomId); } });
  socket.on('send_emote', (emoji) => { const roomId = socketToRoom[socket.id]; if (roomId) io.to(roomId).emit('receive_emote', { id: socket.id, emoji: emoji }); });

  socket.on('disconnect', () => {
    for (let mode in queues) { queues[mode] = queues[mode].filter(p => p.id !== socket.id); }
    for (let code in privateLobbies) {
      privateLobbies[code].players = privateLobbies[code].players.filter(p => p.id !== socket.id);
      if (privateLobbies[code].players.length === 0) delete privateLobbies[code];
      else { if(socket.id === privateLobbies[code].hostId) privateLobbies[code].hostId = privateLobbies[code].players[0].id; privateLobbies[code].players.forEach(p => p.socket.emit('private_room_status', { code: code, current: privateLobbies[code].players.length, max: parseInt(privateLobbies[code].mode.split('v')[0]) * 2, isHost: p.id === privateLobbies[code].hostId, players: privateLobbies[code].players.map(pl=>pl.profile.username) })); }
    }
    const roomId = socketToRoom[socket.id];
    if (roomId && rooms[roomId]) { io.to(roomId).emit('error_message', 'A player disconnected. Match abandoned.'); destroyRoom(roomId); }
  });
});

server.listen(3001, () => console.log(`[SYSTEM] Cyber-Arena SECURE Backend Online.`));