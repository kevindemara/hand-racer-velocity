import express from 'express';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { createServer as createViteServer } from 'vite';
import { buildTrack, CARS, TRACKS, DIFFICULTIES, createVehicle, startingGrid, stepVehicle, makeHazards, normalizeInput, hash } from '../shared/racing.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
mkdirSync(path.join(root, 'server/data'), { recursive: true });
const db = new DatabaseSync(process.env.RACING_DB || path.join(root, 'server/data/racing.sqlite'));
db.exec(`PRAGMA journal_mode=WAL;
  CREATE TABLE IF NOT EXISTS records(id INTEGER PRIMARY KEY, name TEXT, track TEXT, mode TEXT, difficulty TEXT, laps INTEGER, seed INTEGER, car TEXT, time REAL, score INTEGER, created TEXT DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS ratings(player TEXT PRIMARY KEY, rating INTEGER DEFAULT 1000, races INTEGER DEFAULT 0);
  CREATE INDEX IF NOT EXISTS record_category ON records(track, mode, difficulty, laps, seed, time);`);
const app = express(), server = http.createServer(app);
const io = new Server(server, { connectionStateRecovery: { maxDisconnectionDuration: 20000 }, maxHttpBufferSize: 25000 });
app.use(express.json({ limit: '3mb' }));
const rooms = new Map(), challenges = new Map();
const cleanName = name => String(name || 'Driver').replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, 20) || 'Driver';
function config(raw = {}) {
  return { track: TRACKS.some(t => t.id === raw.track) ? raw.track : 'coast',
    car: CARS.some(c => c.id === raw.car) ? raw.car : 'apex', difficulty: Object.hasOwn(DIFFICULTIES, raw.difficulty) ? raw.difficulty : 'normal',
    laps: [1, 3, 5, 30].includes(Number(raw.laps)) ? Number(raw.laps) : 1,
    mode: ['circuit', 'time-trial', 'elimination', 'survival', 'checkpoint', 'championship'].includes(raw.mode) ? raw.mode : 'circuit',
    tuning: ['balanced', 'grip', 'speed'].includes(raw.tuning) ? raw.tuning : 'balanced',
    seed: raw.daily && raw.daily !== 'false' ? hash(new Date().toISOString().slice(0, 10)) : 1 };
}
app.get('/api/health', (_req, res) => res.json({ ok: true, renderer: 'three', database: 'sqlite', rooms: rooms.size }));
app.get('/api/leaderboard', (req, res) => {
  const c = config(req.query);
  res.json(db.prepare('SELECT name,car,time,score,created FROM records WHERE track=? AND mode=? AND difficulty=? AND laps=? AND seed=? ORDER BY time ASC LIMIT 20')
    .all(c.track, c.mode, c.difficulty, c.laps, c.seed));
});
app.get('/api/challenge', (req, res) => {
  const c = config(req.query), token = randomUUID();
  challenges.set(token, { config: c, created: Date.now() }); res.json({ token, config: c });
});
app.post('/api/records', (req, res) => {
  const { token, frames, name } = req.body || {}, challenge = challenges.get(token);
  if (!challenge || Date.now() - challenge.created > 3600000) return res.status(400).json({ error: 'Race session expired.' });
  if (!Array.isArray(frames) || frames.length < 10 || frames.length > 85000 || frames.some(f => !Array.isArray(f) || f.length !== 5 || f.some(n => typeof n !== 'number' || !Number.isFinite(n)))) return res.status(400).json({ error: 'Invalid race replay.' });
  const c = challenge.config;
  if (!['circuit', 'time-trial', 'championship'].includes(c.mode)) return res.status(400).json({ error: 'This event uses local scoring.' });
  const track = buildTrack(c.track, c.seed), vehicle = createVehicle(c.car, c.tuning), hazards = makeHazards(track, c.difficulty);
  for (const f of frames) {
    stepVehicle(vehicle, { throttle: f[0], brake: f[1], steer: f[2], nitro: f[3], drift: f[4] }, 1 / 60, track, { difficulty: c.difficulty, hazards, laps: c.laps });
    if (vehicle.finished) break;
  }
  if (!vehicle.finished) return res.status(400).json({ error: 'Checkpoints and finish could not be verified.' });
  challenges.delete(token); saveRecord(cleanName(name), c, vehicle); res.json({ verified: true, time: vehicle.time });
});
function saveRecord(name, c, v) {
  db.prepare('INSERT INTO records(name,track,mode,difficulty,laps,seed,car,time,score) VALUES(?,?,?,?,?,?,?,?,?)')
    .run(name, c.track, c.mode, c.difficulty, c.laps, c.seed, v.carId, v.time, Math.round(v.score));
}
function rating(player) { return db.prepare('SELECT rating FROM ratings WHERE player=?').get(player)?.rating || 1000; }
function snapshot(room) {
  return { code: room.code, runId: room.runId, private:room.private, hostId:room.hostId, config: room.config, state: room.state, startAt: room.startAt, now: Date.now(),
    players: [...room.players.values()].map(p => ({ id: p.id, name: p.name, color: p.color, online: p.online, ready:p.ready, ...p.vehicle })) };
}
function send(room) { io.to(room.code).emit('race-state', snapshot(room)); }
function arrangeGrid(room) {
  const positions=startingGrid(room.players.size);
  [...room.players.values()].forEach((player,index)=>{player.vehicle.lateral=positions[index];});
}
function start(room) {
  room.runId = randomUUID(); room.startAt = Date.now() + 3000; room.state = 'countdown'; room.votes.clear();
  for (const p of room.players.values()) { p.vehicle = createVehicle(p.car, p.tuning); p.input = normalizeInput(); }
  arrangeGrid(room);
  send(room);
}
function removePlayer(room, player) {
  room.players.delete(player.id);
  if(room.state==='waiting')arrangeGrid(room);
  if (room.hostId === player.id) room.hostId = room.players.keys().next().value;
  if (player.socket) io.sockets.sockets.get(player.socket)?.leave(room.code);
  if (!room.players.size) rooms.delete(room.code);
  else { if (room.state === 'racing' || room.state === 'countdown') room.state = 'abandoned'; send(room); }
}
io.on('connection', socket => {
  const error = message => socket.emit('race-error', message);
  socket.on('join-race', (raw = {}) => {
    if (socket.data.room) return error('Leave your current room first.');
    const c = config(raw), id = randomUUID(), resume = randomUUID();
    const playerKey = String(raw.playerKey || socket.id).slice(0, 80), skill = rating(playerKey);
    let room;
    const code = String(raw.code || '').trim().toUpperCase();
    if (code) {
      room = rooms.get(code);
      if (!room || room.players.size >= 4 || room.state !== 'waiting') return error('Room unavailable. Check the code or create a new room.');
    } else if (!raw.private) {
      room = [...rooms.values()].find(r => !r.private && r.state === 'waiting' && r.players.size < 4 && [...r.players.values()].every(p=>p.online) && r.config.track === c.track && r.config.laps === c.laps && r.config.difficulty === c.difficulty && Math.abs(r.rating - skill) <= 300);
    }
    if (!room) {
      let newCode; do { newCode = randomUUID().slice(0, 6).toUpperCase(); } while (rooms.has(newCode));
      room = { code: newCode, private: Boolean(raw.private), config: { ...c, mode: 'circuit' }, track: buildTrack(c.track, c.seed),
        hazards: makeHazards(buildTrack(c.track, c.seed), c.difficulty), players: new Map(), rating: skill, state: 'waiting', startAt: 0, votes: new Set(), created: Date.now() };
      rooms.set(room.code, room);
    }
    const player = { id, resume, playerKey, name: cleanName(raw.name), car: c.car, tuning: c.tuning,
      color: /^#[\da-f]{6}$/i.test(raw.color) ? raw.color : CARS.find(v => v.id === c.car).color,
      online: true, ready:false, socket: socket.id, input: normalizeInput(), vehicle: createVehicle(c.car, c.tuning), lastInput: 0 };
    room.players.set(id, player); socket.join(room.code); socket.data.room = room.code; socket.data.player = id;
    arrangeGrid(room);
    room.hostId ||= id;
    socket.emit('race-joined', { id, resume, ...snapshot(room) }); send(room);
    if (!room.private && room.players.size >= 2 && [...room.players.values()].every(p=>p.online)) start(room);
  });
  socket.on('lobby-ready', ready => {
    const room=rooms.get(socket.data.room), player=room?.players.get(socket.data.player);
    if (!room?.private || room.state!=='waiting' || !player || player.socket!==socket.id || typeof ready!=='boolean') return;
    player.ready=ready;send(room);
  });
  socket.on('lobby-start', () => {
    const room=rooms.get(socket.data.room);
    if (!room?.private || room.state!=='waiting') return;
    if (room.hostId!==socket.data.player) return socket.emit('lobby-error','Only the host can start this room.');
    if (room.players.size<2) return socket.emit('lobby-error','Invite at least one other driver before starting.');
    if (![...room.players.values()].every(p=>p.online&&p.ready)) return socket.emit('lobby-error','Every driver must be connected and ready.');
    start(room);
  });
  socket.on('race-input', raw => {
    const room = rooms.get(socket.data.room), player = room?.players.get(socket.data.player);
    if (!player || player.socket !== socket.id || room.state !== 'racing' || !raw || typeof raw !== 'object') return;
    if (Date.now() - player.lastInput < 10) return;
    player.input = normalizeInput(raw); player.lastInput = Date.now();
  });
  socket.on('resume-race', ({ code, resume } = {}) => {
    const room = rooms.get(String(code || '')), player = [...(room?.players.values() || [])].find(p => p.resume === resume);
    if (!player) return error('Reconnect window expired. Return to the garage to race again.');
    const previousSocket = io.sockets.sockets.get(player.socket);
    if (previousSocket && previousSocket.id !== socket.id) { previousSocket.data.room = previousSocket.data.player = null; previousSocket.leave(room.code); previousSocket.emit('race-error', 'Race recovered in another window.'); }
    player.online = true; player.socket = socket.id; socket.join(room.code); socket.data.room = room.code; socket.data.player = player.id;
    socket.emit('race-joined', { id: player.id, resume: player.resume, ...snapshot(room) }); send(room);
    if (!room.private && room.state==='waiting' && room.players.size>=2 && [...room.players.values()].every(p=>p.online)) start(room);
  });
  socket.on('rematch', () => {
    const room = rooms.get(socket.data.room);
    if (!room || room.state !== 'finished') return;
    room.votes.add(socket.data.player); io.to(room.code).emit('rematch-votes', room.votes.size);
    if (room.votes.size === room.players.size && [...room.players.values()].every(p => p.online)) start(room);
  });
  socket.on('leave-race', () => {
    const room = rooms.get(socket.data.room), player = room?.players.get(socket.data.player);
    if (player) removePlayer(room, player); socket.data.room = socket.data.player = null;
  });
  socket.on('disconnect', () => {
    const room = rooms.get(socket.data.room), player = room?.players.get(socket.data.player);
    if (player) { player.online = false; player.ready=false; player.disconnectedAt = Date.now(); player.input = { throttle: 0, brake: 1, steer: 0 }; send(room); }
  });
});
let previous = performance.now(), accumulator = 0, broadcast = 0;
const tick = setInterval(() => {
  const now = performance.now(); accumulator += Math.min(.15, (now - previous) / 1000); previous = now;
  while (accumulator >= 1 / 60) {
    accumulator -= 1 / 60;
    for (const room of rooms.values()) {
      if (room.state === 'countdown' && Date.now() >= room.startAt) room.state = 'racing';
      for (const p of room.players.values()) {
        if (!p.online && Date.now() - p.disconnectedAt > 20000) { removePlayer(room, p); continue; }
        if (room.state !== 'racing') continue;
        const safeInput = Date.now() - p.lastInput > 1000 ? { throttle: 0, brake: 1 } : p.input;
        const wasFinished = p.vehicle.finished;
        stepVehicle(p.vehicle, safeInput, 1 / 60, room.track, { difficulty: room.config.difficulty, hazards: room.hazards, laps: room.config.laps });
        if (!wasFinished && p.vehicle.finished) saveRecord(p.name, room.config, p.vehicle);
      }
      if (room.state === 'racing' && room.players.size && [...room.players.values()].every(p => p.vehicle.finished)) {
        room.state = 'finished';
        const ordered = [...room.players.values()].sort((a, b) => a.vehicle.time - b.vehicle.time);
        ordered.forEach((p, i) => db.prepare('INSERT INTO ratings(player,rating,races) VALUES(?,?,1) ON CONFLICT(player) DO UPDATE SET rating=MAX(100,rating+?), races=races+1')
          .run(p.playerKey, 1000 + (i === 0 ? 20 : -10), i === 0 ? 20 : -10)); send(room);
      }
    }
  }
  if (++broadcast % 3 === 0) for (const room of rooms.values()) send(room);
}, 1000 / 60);
const maintenance = setInterval(() => {
  for (const [token, challenge] of challenges) if (Date.now() - challenge.created > 3600000) challenges.delete(token);
  for (const room of rooms.values()) if (Date.now() - room.created > 7200000) { io.to(room.code).emit('race-error', 'Room expired. Create a new race.'); rooms.delete(room.code); }
}, 60000);
const production = process.env.NODE_ENV === 'production' && existsSync(path.join(root, 'dist/index.html'));
app.use('/assets', express.static(path.join(root, 'public/assets')));
app.use('/vendor', express.static(path.join(root, 'public/vendor')));
if (production) app.use(express.static(path.join(root, 'dist')));
else { const vite = await createViteServer({ configFile: path.join(root, 'vite.config.js'), server: { middlewareMode: true }, appType: 'spa' }); app.use(vite.middlewares); }
app.use((error, _req, res, _next) => { console.error(error.message); res.status(500).json({ error: 'Request could not be completed.' }); });
const port = Number(process.env.PORT || 3000);
server.listen(port, () => console.log(`Velocity 3D ready: http://localhost:${port}`));
function shutdown() { clearInterval(tick); clearInterval(maintenance); io.close(); server.close(() => { db.close(); process.exit(0); }); }
process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
