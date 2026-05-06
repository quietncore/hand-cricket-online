const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  coins: { type: Number, default: 3 },
  credits: { type: Number, default: 2 },
  eloScore: { type: Number, default: 1000 },
  lastRewardDate: { type: Date, default: null }, 
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', userSchema);