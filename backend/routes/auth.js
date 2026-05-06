const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const router = express.Router();

// Registration Endpoint
router.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;

    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists." });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = new User({
      username,
      password: hashedPassword
    });

    await newUser.save();
    res.status(201).json({ message: "User registered successfully.", userId: newUser._id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server execution error." });
  }
});

// Login Endpoint
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    // 1. Verify user exists
    const user = await User.findOne({ username });
    if (!user) return res.status(400).json({ message: "Invalid credentials." });

    // 2. Cryptographically compare passwords
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: "Invalid credentials." });

    // 3. Generate JWT (Digital Passport) valid for 7 days
    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // 4. Return token and core player data
    res.json({ 
      token, 
      userId: user._id, 
      username: user.username, 
      coins: user.coins, 
      elo: user.eloScore,
      credits: user.credits
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server execution error." });
  }
});

module.exports = router;