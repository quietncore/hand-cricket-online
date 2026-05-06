const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema({
  roomCode: { 
    type: String, 
    required: true, 
    unique: true 
  },
  host: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  players: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User' 
  }],
  status: { 
    type: String, 
    default: 'waiting' // Can change to 'active' or 'finished' later
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
});

module.exports = mongoose.model('Room', roomSchema);