const { io } = require("socket.io-client");

console.log("Initializing Hand Cricket Robot Battle...");

const host = io("http://localhost:3000");
let guest;

host.on("connect", () => {
  host.emit("join_live_room", "ARENA-X", "Host-Batman");
});

// Exactly 1 second later, Guest joins
setTimeout(() => {
  guest = io("http://localhost:3000");
  guest.on("connect", () => {
    guest.emit("join_live_room", "ARENA-X", "Guest-Joker");
  });

  // When the match starts, both bots immediately throw their numbers
  guest.on("match_start", () => {
    console.log("\n[SYSTEM] Both players locked in. Match Starting!");
    console.log("Host throws a 4. Guest throws a 2.");
    
    // Simulate hitting buttons on a screen
    host.emit("play_move", "ARENA-X", 4);
    guest.emit("play_move", "ARENA-X", 2);
  });

  // Listen for the result from the server
  guest.on("ball_result", (data) => {
    console.log(`\n[UMPIRE]: ${data.message}`);
    
    // Now simulate the second ball where they throw the SAME number (Wicket)
    console.log("\nHost throws a 6. Guest throws a 6.");
    host.emit("play_move", "ARENA-X", 6);
    guest.emit("play_move", "ARENA-X", 6);
  });

}, 1000);