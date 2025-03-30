// server.js – Hand Racer – Velocity Multiplayer Server with Winner Announcement, Countdown, Rematch, Leaderboard

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static('public'));

const rooms = {}; // { roomId: { players: [socket1, socket2], usernames: { id: name }, finished: [], rematchVotes: 0 } }
let leaderboard = []; // [{ name, time }]

// Load leaderboard from file (optional)
const LEADERBOARD_FILE = 'leaderboard.json';
if (fs.existsSync(LEADERBOARD_FILE)) {
  try {
    leaderboard = JSON.parse(fs.readFileSync(LEADERBOARD_FILE));
  } catch (err) {
    console.error('Failed to load leaderboard:', err);
  }
}

io.on('connection', (socket) => {
  console.log('[Socket] New connection:', socket.id);

  socket.on('join-game', ({ username }) => {
    username = sanitize(username);
    let roomToJoin = null;

    // Look for an existing room with only 1 player
    for (const [roomId, room] of Object.entries(rooms)) {
      if (room.players.length === 1) {
        roomToJoin = roomId;
        break;
      }
    }

    if (!roomToJoin) {
      roomToJoin = uuidv4();
      rooms[roomToJoin] = { players: [], usernames: {}, finished: [], rematchVotes: 0 };
    }

    socket.join(roomToJoin);
    rooms[roomToJoin].players.push(socket);
    rooms[roomToJoin].usernames[socket.id] = username;
    socket.roomId = roomToJoin;

    console.log(`[Socket] ${username} joined room ${roomToJoin}`);

    if (rooms[roomToJoin].players.length === 1) {
      socket.emit('waiting');
    } else if (rooms[roomToJoin].players.length === 2) {
      const usernames = rooms[roomToJoin].usernames;
      io.to(roomToJoin).emit('both-ready', usernames);
      startCountdown(roomToJoin);
    }
  });

  socket.on('player-move', (data) => {
    const room = rooms[socket.roomId];
    if (!room) return;

    socket.to(socket.roomId).emit('opponent-update', data);
  });

  socket.on('finish', ({ time }) => {
  const roomId = socket.roomId;
  const room = rooms[roomId];
  if (!room || room.finished.length >= 2) return;

  room.finished.push({ id: socket.id, time: parseFloat(time) });

  const username = room.usernames[socket.id] || 'Player';
  leaderboard.push({ name: username, time: parseFloat(time) });
  leaderboard.sort((a, b) => a.time - b.time);
  leaderboard = leaderboard.slice(0, 10);
  fs.writeFileSync(LEADERBOARD_FILE, JSON.stringify(leaderboard, null, 2));

  if (room.finished.length === 2) {
    const [p1, p2] = room.finished;
    const winner = p1.time < p2.time ? p1 : p2;
    const winnerName = room.usernames[winner.id] || 'Player';
    io.to(roomId).emit('declare-winner', { winnerName, leaderboard }); // ✅ fixed
    console.log(`[Server] Winner declared: ${winnerName}`);
  }
});


  socket.on('rematch-request', () => {
    const room = rooms[socket.roomId];
    if (!room) return;

    room.rematchVotes++;
    if (room.rematchVotes === 2) {
      room.finished = [];
      room.rematchVotes = 0;
      io.to(socket.roomId).emit('rematch-start');
      startCountdown(socket.roomId);
    }
  });

  socket.on('disconnect', () => {
    const room = rooms[socket.roomId];
    if (room) {
      room.players = room.players.filter(s => s.id !== socket.id);
      socket.to(socket.roomId).emit('opponent-disconnected');
      if (room.players.length === 0) {
        delete rooms[socket.roomId];
      }
    }
    console.log('[Socket] Disconnected:', socket.id);
  });
});

function sanitize(name) {
  return name.trim().substring(0, 20).replace(/[^a-zA-Z0-9_\- ]/g, '') || 'Player';
}

function startCountdown(roomId) {
  let count = 3;
  const interval = setInterval(() => {
    if (count === 0) {
      clearInterval(interval);
      io.to(roomId).emit('start-race');
    } else {
      io.to(roomId).emit('countdown', count);
      count--;
    }
  }, 1000);
}

server.listen(PORT, () => {
  console.log(`[Server] Running on http://localhost:${PORT}`);
});
