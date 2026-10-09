export const CARS = [
  { id: 'apex', name: 'Apex GT', class: 'Grand touring', shape: 'coupe', speed: 60, acceleration: 18, grip: 8.6, durability: 1, color: '#f17c4a', description: 'Balanced grip. Built for the racing line.' },
  { id: 'nova', name: 'Nova RS', class: 'Rally sport', shape: 'hatch', speed: 54, acceleration: 21, grip: 11, durability: 1.2, color: '#67d7ba', description: 'Quick off the line. Forgiving through corners.' },
  { id: 'vanta', name: 'Vanta XR', class: 'Muscle', shape: 'muscle', speed: 66, acceleration: 15, grip: 6.8, durability: 1.15, color: '#ba8bff', description: 'Long straights. Big power. A loose rear end.' },
  { id: 'ion', name: 'Ion E', class: 'Electric', shape: 'electric', speed: 61, acceleration: 25, grip: 8, durability: .95, color: '#87c8f2', description: 'Instant torque with a planted stance.' },
  { id: 'trail', name: 'Trail RX', class: 'Off-road', shape: 'truck', speed: 51, acceleration: 17, grip: 12, durability: 1.5, color: '#e6be65', description: 'Shrugs off rough surfaces and collisions.' },
  { id: 'stratos', name: 'Stratos R', class: 'Prototype', shape: 'prototype', speed: 72, acceleration: 20, grip: 7.2, durability: .8, color: '#f3f0e8', description: 'Low weight. High speed. Precision required.' },
  { id: 'solstice', name: 'Solstice S', class: 'Roadster', shape: 'roadster', speed: 58, acceleration: 22, grip: 9.8, durability: .8, color: '#ffb08f', description: 'Open cockpit. Light on its feet. Protect your momentum.' },
  { id: 'caldera', name: 'Caldera SP', class: 'Supercar', shape: 'supercar', speed: 70, acceleration: 19, grip: 8, durability: .85, color: '#ef5864', description: 'Wide stance and serious speed. Smooth inputs win.' },
  { id: 'tempo', name: 'Tempo 86', class: 'Classic sport', shape: 'retro', speed: 56, acceleration: 16, grip: 9.3, durability: 1.3, color: '#91afd9', description: 'Round lamps. Square shoulders. Reliable through the bends.' },
  { id: 'nomad', name: 'Nomad BX', class: 'Dune buggy', shape: 'buggy', speed: 49, acceleration: 23, grip: 11.4, durability: 1.45, color: '#dfd87b', description: 'Exposed cage. Big tires. Built for the rough route.' },
  { id: 'vector', name: 'Vector F1', class: 'Open wheel', shape: 'formula', speed: 74, acceleration: 24, grip: 10.2, durability: .65, color: '#ed424d', description: 'Single seat. Exposed wheels. Fast and precise, but fragile on contact.' }
];
export const TRACKS = [
  { id: 'coast', name: 'Golden Coast', subtitle: 'Ocean air. Long sweeping turns.', theme: 'coast', radius: 205, aspect: .8, bend: 20, elevation: 5, grip: 1, sky: '#a2bccc', fog: '#b5c7ce', ground: '#7d9680', accent: '#ee986b' },
  { id: 'city', name: 'Midnight District', subtitle: 'Neon avenues after the rain.', theme: 'city', radius: 178, aspect: .95, bend: 45, elevation: 1, grip: .88, sky: '#14172b', fog: '#242840', ground: '#252b36', accent: '#71ebd4' },
  { id: 'desert', name: 'Red Mesa', subtitle: 'Dust, sandstone and fast straights.', theme: 'desert', radius: 235, aspect: .7, bend: 34, elevation: 8, grip: .94, sky: '#dbc4af', fog: '#dec1a5', ground: '#b78f6f', accent: '#f4be65' },
  { id: 'alpine', name: 'Alpine Run', subtitle: 'Climbs, pine trees and tight bends.', theme: 'alpine', radius: 190, aspect: .85, bend: 42, elevation: 15, grip: .96, sky: '#a6bdcc', fog: '#bacbd7', ground: '#6b8071', accent: '#b4d5e8' }
];
export const MODES = [
  { id: 'circuit', name: 'Circuit race', description: 'Beat three drivers to the finish.' },
  { id: 'time-trial', name: 'Time trial', description: 'A clean run against your best ghost.' },
  { id: 'elimination', name: 'Elimination', description: 'Last place is removed after each lap.' },
  { id: 'survival', name: 'Survival', description: 'Keep moving for 90 seconds. Three strikes.' },
  { id: 'checkpoint', name: 'Checkpoint rush', description: 'Make the next gate before time runs out.' },
  { id: 'championship', name: 'Championship', description: 'Four environments. One title.' }
];
export const DIFFICULTIES = {
  easy: { bot: .64, hazards: .55, assist: .7, label: 'Rookie' },
  normal: { bot: .8, hazards: 1, assist: .4, label: 'Club' },
  hard: { bot: .96, hazards: 1.4, assist: .12, label: 'Pro' }
};
export const TUNING_FACTORS = {
  balanced: { speed: 1, grip: 1 },
  grip: { speed: .96, grip: 1.18 },
  speed: { speed: 1.06, grip: .88 }
};
export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const wrap = (n, length) => ((n % length) + length) % length;
export function hash(value) { let n = 2166136261; for (const c of String(value)) n = Math.imul(n ^ c.charCodeAt(0), 16777619); return n >>> 0; }
export function random(seed) { let n = seed >>> 0; return () => { n += 0x6D2B79F5; let t = Math.imul(n ^ n >>> 15, 1 | n); t ^= t + Math.imul(t ^ t >>> 7, 61 | t); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
export function buildTrack(id = 'coast', seed = 1) {
  const def = TRACKS.find(track => track.id === id) || TRACKS[0];
  const points = [], count = 900, phase = (seed % 9) * .08;
  let length = 0;
  for (let i = 0; i <= count; i++) {
    const a = i / count * Math.PI * 2;
    const radius = def.radius + Math.sin(a * 3 + phase) * def.bend + Math.sin(a * 5) * def.bend * .2;
    const p = { x: Math.sin(a) * radius, y: def.elevation + 1 + Math.sin(a * 2) * def.elevation, z: Math.cos(a) * radius * def.aspect, distance: length };
    if (i) { const prev = points[i - 1]; length += Math.hypot(p.x - prev.x, p.y - prev.y, p.z - prev.z); p.distance = length; }
    points.push(p);
  }
  return { ...def, points, length, width: 14, seed };
}
export function trackPoint(track, distance, lateral = 0) {
  const d = wrap(distance, track.length), points = track.points;
  let low = 0, high = points.length - 1;
  while (low + 1 < high) { const mid = low + high >> 1; if (points[mid].distance <= d) low = mid; else high = mid; }
  const a = points[low], b = points[high], t = (d - a.distance) / (b.distance - a.distance || 1);
  const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz) || 1;
  const nx = dz / len, nz = -dx / len;
  return { x: a.x + (b.x - a.x) * t + nx * lateral, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t + nz * lateral,
    nx, nz, yaw: Math.atan2(dx, dz), progress: d / track.length };
}
export function angleDifference(a, b) { return Math.atan2(Math.sin(a - b), Math.cos(a - b)); }
export function createVehicle(carId = 'apex', tuning = 'balanced') {
  const car = CARS.find(car => car.id === carId) || CARS[0];
  return { carId: car.id, tuning, distance: 0, lateral: 0, heading: 0, speed: 0, nitro: 1, boost: false,
    damage: 0, braking: false, steering: 0, collisions: 0, pickups: 0, boosts: 0, nearMisses: 0, combo: 0, score: 0, checkpoint: 0, laps: [], lastLapTime: 0,
    cooldown: 0, finished: false, eliminated: false, time: 0 };
}
export function startingGrid(count) {
  const size=clamp(Math.round(Number(count)||1),1,4);
  // Four abreast fit on the 14m road. Every car starts at the same distance.
  return Array.from({length:size},(_,index)=>(index-(size-1)/2)*3.2);
}
export function makeHazards(track, difficulty = 'normal') {
  const rng = random(hash(`${track.seed}:${track.id}`)), result = [];
  const count = Math.round(19 * (DIFFICULTIES[difficulty] || DIFFICULTIES.normal).hazards);
  for (let i = 0; i < count; i++) result.push({ id: i, distance: (i + 1) / (count + 1) * track.length,
    lateral: (rng() - .5) * 10, type: i % 4 === 0 ? 'boost' : i % 3 === 0 ? 'oil' : 'barrier' });
  return result;
}
export function normalizeInput(input = {}) {
  return { throttle: clamp(Number(input.throttle) || 0, 0, 1), brake: clamp(Number(input.brake) || 0, 0, 1),
    steer: clamp(Number(input.steer) || 0, -1, 1), nitro: Boolean(input.nitro), drift: Boolean(input.drift) };
}
export function insideLaneEdge(track,distance) {
  const progress=wrap(distance,track.length)/track.length;
  // Short paved entry/rejoin tapers connect the extra lane to the main road.
  const blend=clamp(Math.min((progress-.37)/.01,(.49-progress)/.01),0,1);
  return -track.width/2-6*blend;
}
export function trackSurface(track, distance, lateral) {
  const progress = wrap(distance, track.length) / track.length;
  if (progress > .38 && progress < .48 && lateral < -7 && lateral > -13) return 'inside';
  return lateral < insideLaneEdge(track,distance) || lateral > track.width / 2 ? 'rough' : 'road';
}
export function steeringGain(speed) {
  // Full low-speed response, then progressively gentler corrections at racing speed.
  return Math.max(.45, 1 / (1 + Math.max(0, speed - 18) / 65));
}
export function stepVehicle(v, rawInput, dt, track, { difficulty = 'normal', assist = true, hazards = [], laps = 1 } = {}) {
  if (v.finished || v.eliminated) return [];
  dt = clamp(dt, 0, .1);
  const input = normalizeInput(rawInput), car = CARS.find(c => c.id === v.carId) || CARS[0];
  const diff = DIFFICULTIES[difficulty] || DIFFICULTIES.normal;
  v.braking = input.brake > .05;
  v.steering = input.steer;
  const tuning = Object.hasOwn(TUNING_FACTORS,v.tuning) ? TUNING_FACTORS[v.tuning] : TUNING_FACTORS.balanced;
  const tuningSpeed = tuning.speed, tuningGrip = tuning.grip;
  const pos = trackPoint(track, v.distance), next = trackPoint(track, v.distance + Math.max(1, v.speed * dt));
  const surface = trackSurface(track, v.distance, v.lateral), shortcut = surface === 'inside', offroad = surface === 'rough';
  const grip = car.grip * track.grip * tuningGrip * (offroad ? .6 : 1) * (input.drift ? .5 : 1);
  v.boost = input.nitro && v.nitro > .01 && input.throttle > 0;
  if (v.boost) { v.nitro = Math.max(0, v.nitro - dt * .22); v.boosts += dt; } else v.nitro = Math.min(1, v.nitro + dt * .04);
  const maxSpeed = car.speed * tuningSpeed * (v.boost ? 1.34 : 1) * (offroad ? .55 + car.durability * .07 : 1);
  const acceleration = input.throttle * car.acceleration * (v.boost ? 1.35 : 1) - input.brake * 37 - (1 - input.throttle) * 3 - v.speed * .018;
  v.speed = clamp(v.speed + acceleration * dt, 0, maxSpeed);
  const curve = angleDifference(next.yaw, pos.yaw);
  // Cars face +Z; the chase camera's screen-right axis is negative lateral.
  v.heading -= input.steer * (1.0 + grip * .075) * steeringGain(v.speed) * dt * clamp(v.speed / 12, 0, 1) + curve;
  if (assist) v.heading += curve * diff.assist - v.lateral * diff.assist * dt * .055;
  v.heading *= Math.exp(-dt * (assist ? diff.assist * 5 + .8 : .8) * (input.drift ? .45 : 1));
  v.heading = clamp(v.heading, -.9, .9);
  const old = v.distance;
  v.distance += Math.max(0, Math.cos(v.heading)) * v.speed * dt * (shortcut ? 1.13 : 1);
  v.lateral = clamp(v.lateral + Math.sin(v.heading) * v.speed * dt, -22, 22);
  if (assist && Math.abs(v.lateral) > 5.8 && !shortcut) v.lateral *= Math.exp(-dt * diff.assist * .7);
  v.time += dt;
  if (input.drift && v.speed > 20 && Math.abs(v.heading) > .1) { v.score += dt * 20; v.nitro = Math.min(1,v.nitro + dt * .025); }
  v.cooldown = Math.max(0, v.cooldown - dt);
  const events = [];
  for (const hazard of hazards) {
    const lap = Math.floor(old / track.length), hDistance = lap * track.length + hazard.distance;
    if (old < hDistance && v.distance >= hDistance) {
      const gap = Math.abs(v.lateral - hazard.lateral);
      if (gap < 1.55 && !v.cooldown) {
        if (hazard.type === 'boost') { v.nitro = Math.min(1, v.nitro + .4); v.score += 100; v.pickups++; events.push('pickup'); }
        else { v.speed *= (hazard.type === 'oil' ? .7 : .5) + (car.durability - 1) * .12; v.heading += hazard.type === 'oil' ? .2 : 0; v.collisions++; v.damage += 1 / car.durability; v.combo = 0; v.cooldown = .9; events.push('collision'); }
      } else if (gap >= 1.55 && gap < 3 && hazard.type !== 'boost') { v.nearMisses++; v.combo++; v.score += 75 * Math.min(5, v.combo); v.nitro = Math.min(1, v.nitro + .05); events.push('near-miss'); }
    }
  }
  const checkpoint = Math.floor(v.distance / (track.length / 8));
  if (checkpoint > v.checkpoint) { v.checkpoint = checkpoint; events.push('checkpoint'); }
  if (old >= 0 && Math.floor(v.distance / track.length) > Math.floor(old / track.length)) {
    v.laps.push(v.time - v.lastLapTime); v.lastLapTime = v.time; events.push('lap');
  }
  if (v.distance >= track.length * laps) { v.finished = true; v.speed = 0; v.boost = false; events.push('finish'); }
  return events;
}
export function botInput(v, track, difficulty = 'normal', style = 0, hazards = []) {
  const diff = DIFFICULTIES[difficulty] || DIFFICULTIES.normal;
  const pos = trackPoint(track, v.distance), future = trackPoint(track, v.distance + Math.max(24, v.speed * .5));
  let target = Math.sin(v.distance * .012 + style * 2) * 2.3;
  for (const h of hazards) {
    const d = wrap(h.distance - v.distance, track.length);
    if (d < 40 && h.type !== 'boost') target = h.lateral > 0 ? -3.5 : 3.5;
  }
  const bend = angleDifference(future.yaw, pos.yaw);
  const car = CARS.find(c => c.id === v.carId) || CARS[0];
  return { throttle: v.speed > car.speed * diff.bot * (Math.abs(bend) > .3 ? .8 : 1) ? .05 : 1, brake: 0,
    steer: clamp((-bend * .9 - (target - v.lateral) * .08 + v.heading * 1.5) / steeringGain(v.speed), -1, 1),
    nitro: Math.abs(bend) < .07 && Math.abs(v.heading) < .12 && Math.abs(v.lateral) < 4.8 && v.nitro > .7, drift: false };
}
export function formatTime(seconds) {
  const value = Number(seconds), hundredths = Number.isFinite(value) ? Math.max(0,Math.round(value * 100)) : 0;
  return `${Math.floor(hundredths / 6000)}:${((hundredths % 6000) / 100).toFixed(2).padStart(5,'0')}`;
}
