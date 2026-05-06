require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const http = require('http');           // NEW: Core Node HTTP module
const { Server } = require('socket.io'); // NEW: The Socket engine

const app = express();
// Security Override: Allow Vercel frontend to talk to this server
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type, Authorization');
    next();
});
const cors = require('cors');
app.use(cors());
const server = http.createServer(app);  // NEW: Wrap Express in HTTP
const io = new Server(server, {         // NEW: Initialize Socket.io
  cors: { origin: "*" }                 // Allows your future React frontend to connect securely
});

// Middleware
app.use(express.json());

// Route Integration (REST API)
const authRoutes = require('./routes/auth');
app.use('/api/auth', authRoutes);
const gameRoutes = require('./routes/game');
app.use('/api/game', gameRoutes);

// The Live "Game Brain" (RAM Memory)
const liveMatches = {};

io.on('connection', (socket) => {
  console.log('⚡ Player connected:', socket.id);

  socket.on('join_live_room', (roomCode, username) => {
    socket.join(roomCode);
    
    // 1. If room doesn't exist in memory, create the Game State and assign Host to Batting
    if (!liveMatches[roomCode]) {
      liveMatches[roomCode] = {
        p1: { id: socket.id, username: username, role: 'batting', score: 0 },
        p2: null,
        targetScore: 0,
        innings: 1,
        currentMoves: {} // Stores the numbers 1-6 they throw
      };
      console.log(`--> [${roomCode}] Arena created. ${username} is ready.`);
    } 
    // 2. If Host is waiting, attach Guest as Bowler and START MATCH
    else if (!liveMatches[roomCode].p2) {
      liveMatches[roomCode].p2 = { id: socket.id, username: username, role: 'bowling', score: 0 };
      console.log(`--> [${roomCode}] ${username} entered. MATCH STARTING!`);
      io.to(roomCode).emit('match_start', liveMatches[roomCode]); // Alert both players!
    }
  });

  // 3. The Core Hand Cricket Logic
  socket.on('play_move', (roomCode, numberThrown) => {
    const match = liveMatches[roomCode];
    if (!match) return;

    // Lock in the player's number (1 through 6)
    match.currentMoves[socket.id] = numberThrown;

    // Check if BOTH players have locked in their numbers
    if (Object.keys(match.currentMoves).length === 2) {
      const p1Move = match.currentMoves[match.p1.id];
      const p2Move = match.currentMoves[match.p2.id];
      
      let resultMsg = "";

      // RULE 1: If numbers match -> WICKET!
      if (p1Move === p2Move) {
        resultMsg = `💥 WICKET! Both players threw a ${p1Move}!`;
        
        if (match.innings === 1) {
          // Switch roles for Innings 2
          match.innings = 2;
          match.targetScore = match.p1.score + 1;
          match.p1.role = 'bowling';
          match.p2.role = 'batting';
          resultMsg += ` Target for ${match.p2.username} is ${match.targetScore}.`;
        } else {
          // Game Over (Innings 2 Wicket)
          resultMsg += ` 🏆 GAME OVER! ${match.p1.username} defended the target and WINS!`;
          io.to(roomCode).emit('game_over', { winner: match.p1.username, matchData: match });
          delete liveMatches[roomCode]; // Wipe from memory to save server space
          return;
        }
      } 
      // RULE 2: If numbers DO NOT match -> RUNS SCORED!
      else {
        const batsman = match.p1.role === 'batting' ? match.p1 : match.p2;
        const batsmanMove = match.p1.role === 'batting' ? p1Move : p2Move;
        batsman.score += batsmanMove;
        
        resultMsg = `🏏 ${batsman.username} hits a ${batsmanMove}! Score: ${batsman.score}`;

        // Check if Innings 2 batsman reached the target score
        if (match.innings === 2 && batsman.score >= match.targetScore) {
           resultMsg = `🏆 GAME OVER! ${batsman.username} chased the target and WINS!`;
           io.to(roomCode).emit('game_over', { winner: batsman.username, matchData: match });
           delete liveMatches[roomCode];
           return;
        }
      }

      // Clear the hands for the next ball
      match.currentMoves = {};

      // Broadcast the result of the ball to both screens instantly
      io.to(roomCode).emit('ball_result', { message: resultMsg, p1Move, p2Move, state: match });
    }
  });

  socket.on('disconnect', () => {
    console.log('❌ Player disconnected:', socket.id);
  });
});

// Database connection protocol
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log("Database connection established.");
  })
  .catch((err) => console.error("Database connection failed:", err));

// NEW: Use server.listen instead of app.listen to activate WebSockets
server.listen(3000, () => {
  console.log("Server executing on port 3000 (Live WebSockets Active)");
});

