const express = require('express');
const router = express.Router();
const auth = require('../middleware/authMiddleware');
const User = require('../models/User');
const Room = require('../models/Room'); // New import

// 1. Create Room Endpoint
router.post('/create-room', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);

    if (user.credits < 2) {
      return res.status(400).json({ message: "Insufficient funds. 2 credits required." });
    }

    user.credits -= 2;
    await user.save();

    const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();

    // NEW: Actually save the room to MongoDB
    const newRoom = new Room({
      roomCode: roomCode,
      host: user._id,
      players: [user._id] // The host is the first player in the room
    });
    await newRoom.save();

    res.json({
      message: "Room created and saved to database!",
      roomCode: roomCode,
      remainingCredits: user.credits
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error during room creation." });
  }
});

// 2. Join Room Endpoint
router.post('/join-room', auth, async (req, res) => {
  try {
    const { roomCode } = req.body;
    
    // Find the specific room in the database
    const room = await Room.findOne({ roomCode: roomCode });
    if (!room) return res.status(404).json({ message: "Room not found or expired." });
    if (room.status !== 'waiting') return res.status(400).json({ message: "Match already started." });

    // Prevent joining the same room twice
    if (room.players.includes(req.user.userId)) {
      return res.status(400).json({ message: "You are already in this room." });
    }

    // Add the new player to the roster and save
    room.players.push(req.user.userId);
    await room.save();

    res.json({ 
      message: "Successfully joined the room!", 
      roomCode: room.roomCode,
      totalPlayers: room.players.length
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error during room join." });
  }
});

// 3. Daily Login Reward Endpoint (Preserved)
router.post('/daily-reward', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (user.lastRewardDate && user.lastRewardDate >= today) {
      return res.status(400).json({ message: "Reward already claimed today. Come back tomorrow!" });
    }

    user.coins += 3;
    user.lastRewardDate = new Date();
    await user.save();

    res.json({ message: "Daily reward claimed!", coinsAdded: 3, newCoinBalance: user.coins });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});
// 4. Ad Reward Endpoint (50% Elo Bonus on Win)
router.post('/win-match-ad', auth, async (req, res) => {
  try {
    const { baseEloGain } = req.body; // The standard points won before the ad
    
    // Validate input
    if (!baseEloGain || baseEloGain <= 0) {
      return res.status(400).json({ message: "Valid base Elo gain required." });
    }

    const user = await User.findById(req.user.userId);

    // Calculate exactly 50% bonus (rounded down to avoid decimals)
    const bonus = Math.floor(baseEloGain * 0.5);
    const totalGain = baseEloGain + bonus;

    // Apply to player profile
    user.eloScore += totalGain;
    await user.save();

    res.json({
      message: "Ad verified. 50% Elo bonus applied.",
      baseGain: baseEloGain,
      bonusAwarded: bonus,
      totalPointsAdded: totalGain,
      newTotalElo: user.eloScore
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error during ad reward processing." });
  }
});

module.exports = router;