import { angleDifference, clamp, trackPoint, trackSurface, wrap } from '../../shared/racing.js';

// Monotonic server counters survive snapshots that omit individual physics ticks.
// Establish a baseline on join/rejoin; never replay past events or count a reset.
export function snapshotEvents(previous, current) {
  if (!previous || !current || current.time < previous.time) return [];
  const events = [];
  for (const [counter,event] of [['collisions','collision'],['pickups','pickup'],['nearMisses','near-miss']]) {
    if (Number.isFinite(current[counter]) && current[counter] > (previous[counter] || 0)) events.push(event);
  }
  if ((current.laps?.length || 0) > (previous.laps?.length || 0)) events.push('lap');
  return events;
}

export function drivingCondition(vehicle, track) {
  if (vehicle.finished) return 'Finish line';
  const surface=trackSurface(track,vehicle.distance,vehicle.lateral);
  const condition=surface==='inside'?'Fast lane · extra pace':surface==='rough'?'Off road · grip reduced':null;
  return vehicle.boost ? `NITRO ACTIVE${condition ? ` · ${surface==='inside'?'fast lane':'off road'}` : ''}` : condition || cornerCue(track,vehicle.distance,vehicle.speed);
}

export function hazardCue(vehicle, track, hazards = [], laps = 1) {
  if (vehicle.finished || vehicle.eliminated) return null;
  const horizon = clamp(vehicle.speed * 2.2, 35, 125), lap = Math.floor(vehicle.distance / track.length);
  let closest;
  for (const hazard of hazards) {
    if (!['barrier', 'oil'].includes(hazard.type) || Math.abs(hazard.lateral - vehicle.lateral) >= 3) continue;
    let crossing = lap * track.length + hazard.distance;
    if (crossing <= vehicle.distance) crossing += track.length;
    const distance = crossing - vehicle.distance;
    if (crossing >= laps * track.length || distance > horizon || closest && distance >= closest.distance) continue;
    const offset = hazard.lateral - vehicle.lateral;
    const side = Math.abs(offset) < .75 ? 'your line' : offset > 0 ? 'left' : 'right';
    closest = { type: hazard.type, distance, side,
      label: `⚠ ${hazard.type === 'oil' ? 'Oil' : 'Barrier'} · ${side} · ${Math.ceil(distance)}m` };
  }
  return closest || null;
}

export function keyLabel(code) {
  const names = { Space:'Space', ArrowUp:'↑', ArrowDown:'↓', ArrowLeft:'←', ArrowRight:'→', ShiftLeft:'Left Shift', ShiftRight:'Right Shift', ControlLeft:'Left Ctrl', ControlRight:'Right Ctrl', AltLeft:'Left Alt', AltRight:'Right Alt', Backquote:'`', Minus:'−', Equal:'=', BracketLeft:'[', BracketRight:']', Backslash:'\\', Semicolon:';', Quote:"'", Comma:',', Period:'.', Slash:'/' };
  return names[code] || String(code || '—').replace(/^(Key|Digit)/,'').replace(/^Numpad/,'Num ');
}

export function lapFeedback(vehicle, track) {
  const distance = Math.max(0,vehicle.distance || 0), finished = Boolean(vehicle.finished);
  const laps = vehicle.laps || [];
  return {
    progress: finished ? 1 : wrap(distance,track.length) / track.length,
    current: finished && laps.length ? laps.at(-1) : Math.max(0,(vehicle.time || 0) - (vehicle.lastLapTime || 0)),
    best: laps.length ? Math.min(...laps) : null,
    gate: finished ? 8 : (vehicle.checkpoint || 0) % 8 + 1,
    gateDistance: finished ? 0 : Math.max(0,((vehicle.checkpoint || 0) + 1) * track.length / 8 - distance)
  };
}

export function cornerCue(track, distance, speed) {
  const ahead = clamp(speed * 1.6,35,110);
  const bend = angleDifference(trackPoint(track,distance + ahead).yaw,trackPoint(track,distance).yaw);
  if (Math.abs(bend) < .13) return '↑ Straight ahead';
  const direction = bend > 0 ? 'left' : 'right', arrow = bend > 0 ? '←' : '→';
  return `${arrow} ${Math.abs(bend) > .5 ? 'Tight' : 'Sweeping'} ${direction}`;
}

// Compare arrival times at the same distance, including the implicit start line.
// Lower-bound search chooses the first arrival when a ghost brakes to a stop.
export function ghostDelta(ghost, time, distance) {
  if (!Array.isArray(ghost) || !ghost.length || !Number.isFinite(time) || !Number.isFinite(distance)) return null;
  if (distance <= 0) return time;
  const last = ghost.at(-1);
  if (!Array.isArray(last) || !Number.isFinite(last[1]) || distance > last[1]) return null;
  let low = 0, high = ghost.length - 1;
  while (low < high) { const mid = low + high >> 1; if (ghost[mid]?.[1] < distance) low = mid + 1; else high = mid; }
  const b = ghost[low], a = low ? ghost[low - 1] : [0,0];
  if (![a?.[0],a?.[1],b?.[0],b?.[1]].every(Number.isFinite) || b[1] < a[1]) return null;
  const fraction = b[1] === a[1] ? 0 : clamp((distance - a[1]) / (b[1] - a[1]),0,1);
  return time - (a[0] + (b[0] - a[0]) * fraction);
}

export function countdownCue(race) {
  if (race.paused || !['countdown','racing'].includes(race.state)) return null;
  const count = race.state === 'countdown' ? Math.max(1,Math.ceil(race.countdown)) : 0;
  if (count === race.lastCountdown) return null;
  const previous = race.lastCountdown; race.lastCountdown = count;
  if (count > 0 && count <= 3) return 'countdown';
  return count === 0 && previous > 0 ? 'go' : null;
}

export function networkCountdown(snapshot, monotonicNow) {
  if (![snapshot?.startAt,snapshot?.now,snapshot?.receivedAt,monotonicNow].every(Number.isFinite)) return 0;
  const elapsed=Math.max(0,monotonicNow-snapshot.receivedAt);
  return Math.max(0,(snapshot.startAt-snapshot.now-elapsed)/1000);
}
