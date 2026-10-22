import { io } from './network.js';
import { personalRecords, recordContext } from './local-records.js';
import { advanceMode, awardChampionship, championshipTracks } from '../../shared/modes.js';
import { RacingRenderer } from './renderer.js';
import { WebcamControls } from './webcam.js';
import { DrivingInput, gamepadAxis } from './input.js';
import { RacingAudio } from './audio.js';
import { performanceRows, setupDescription } from './garage-performance.js';
import { keyLabel, lapFeedback, drivingCondition, hazardCue, ghostDelta, countdownCue, networkCountdown, snapshotEvents } from './race-feedback.js';
import { loadProfile, saveProfile, recordRace, category, cosmetics } from './profile.js';
import { CARS, TRACKS, MODES, DIFFICULTIES, buildTrack, createVehicle, makeHazards, stepVehicle, botInput, trackPoint, trackSurface, formatTime, hash, clamp } from '../../shared/racing.js';

const SOLO = typeof __VELOCITY_SOLO__ !== 'undefined' && __VELOCITY_SOLO__;
const $ = id => document.getElementById(id);
const profile = loadProfile(), settings = profile.settings;
const controls = new DrivingInput(settings), audio = new RacingAudio();
const bindingLabels = {};
let renderer, selectedCar = profile.selection?.car || 'apex', race = null, socket = null, network = null;
let previous = performance.now(), accumulator = 0, sendElapsed = 0, hudElapsed = 0, toastTimer;
let championship = null, ghostCursor = 0, lastMessage = '';
function toast(message) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true; }, 5000); }
function option(select, value, label) { const element = document.createElement('option'); element.value = value; element.textContent = label; select.append(element); }
TRACKS.forEach(track => option($('track-select'), track.id, track.name)); MODES.forEach(mode => option($('mode-select'), mode.id, mode.name));
$('driver-name').value = profile.name;
if (profile.selection) for (const [id, key] of [['track-select','track'], ['mode-select','mode'], ['difficulty','difficulty'], ['laps-select','laps'], ['tuning','tuning']]) $(id).value = profile.selection[key] || $(id).value;
if (!CARS.some(car => car.id === selectedCar)) selectedCar = 'apex';
$('daily').checked = Boolean(profile.selection?.daily);
function config() {
  return { track: $('track-select').value || 'coast', mode: $('mode-select').value || 'circuit', difficulty: $('difficulty').value || 'normal',
    laps: Number($('laps-select').value) || 1, car: selectedCar, tuning: $('tuning').value, daily: $('daily').checked,
    seed: $('daily').checked ? hash(new Date().toISOString().slice(0, 10)) : 1 };
}
function saveSelection() { profile.name = $('driver-name').value.trim().slice(0, 20) || 'Driver'; profile.selection = config(); profile.customization = { paint: $('paint').value, wheels: $('wheel-style').value, stripe: $('stripe').checked, trail: $('trail-style').value }; if (!saveProfile(profile)) toast('Browser storage is unavailable. This session will still work.'); }
function captions() {
  $('track-caption').textContent = TRACKS.find(t => t.id === $('track-select').value)?.subtitle;
  $('mode-caption').textContent = MODES.find(m => m.id === $('mode-select').value)?.description;
  $('laps-select').disabled = ['survival','checkpoint','elimination'].includes($('mode-select').value);
}
function refreshCosmetics() {
  const previousStyle = $('wheel-style').value; $('wheel-style').replaceChildren();
  cosmetics.forEach(c => { option($('wheel-style'), c.id, `${c.name}${profile.xp < c.xp ? ` · ${c.xp} XP` : ''}`); $('wheel-style').lastChild.disabled = profile.xp < c.xp; });
  $('wheel-style').value = cosmetics.find(c => c.id === previousStyle && c.xp <= profile.xp)?.id || 'alloy';
  $('driver-level').textContent = `LEVEL ${1 + Math.floor(profile.xp / 500)} / ${profile.xp} XP`;
}
function revealSelectedCar() {
  const selectedButton = document.querySelector(`.car-option[data-car="${selectedCar}"]`);
  if (!selectedButton) return;
  const picker = $('car-picker'), bounds = picker.getBoundingClientRect(), buttonBounds = selectedButton.getBoundingClientRect();
  const shift = buttonBounds.left < bounds.left ? buttonBounds.left - bounds.left : buttonBounds.right > bounds.right ? buttonBounds.right - bounds.right : 0;
  if (shift) picker.scrollBy({left:shift,behavior:settings.reducedMotion?'instant':'smooth'});
}
window.addEventListener('resize',revealSelectedCar);
function selectCar(id, useDefaultPaint = true) {
  selectedCar = id; const car = CARS.find(c => c.id === id);
  $('car-name').textContent = car.name; $('car-class').textContent = car.class.toUpperCase(); $('car-description').textContent = car.description;
  if (useDefaultPaint) $('paint').value = car.color;
  refreshPerformance();
  document.querySelectorAll('.car-option').forEach(button => { button.classList.toggle('active', button.dataset.car === id); button.setAttribute('aria-pressed', String(button.dataset.car === id)); });
  $('car-position').textContent = `${CARS.findIndex(car => car.id === id) + 1} / ${CARS.length}`;
  revealSelectedCar();
  renderer?.garage(id, $('paint').value, { wheels: $('wheel-style').value, stripe: $('stripe').checked });
}
function refreshPerformance() {
  const panel = $('car-performance'); panel.replaceChildren();
  for (const { label, value, percent } of performanceRows(selectedCar, $('tuning').value)) {
    const row = document.createElement('div'), name = document.createElement('dt'), number = document.createElement('dd'), bar = document.createElement('div'), fill = document.createElement('i');
    name.textContent = label;
    const [numeric,unit] = value.split(' '); number.textContent = numeric;
    if (unit) { const suffix = document.createElement('small'); suffix.textContent = ` ${unit}`; number.append(suffix); }
    bar.className = 'stat-bar'; bar.setAttribute('aria-hidden','true');
    fill.style.width = `${clamp(percent,0,1) * 100}%`; bar.append(fill); row.append(name,number,bar); panel.append(row);
  }
  const notes = $('car-performance-notes'); notes.replaceChildren();
  const setup = document.createElement('p'), basis = document.createElement('p');
  setup.textContent = setupDescription($('tuning').value); basis.textContent = 'Dry road · no nitro. Apex GT durability = 100%.';
  notes.append(setup,basis);
}
for (const car of CARS) {
  const button = document.createElement('button'); button.className = 'car-option'; button.dataset.car = car.id; button.style.setProperty('--car-color', car.color);
  const swatch = document.createElement('span'); swatch.className = 'swatch'; const name = document.createElement('strong'); name.textContent = car.name; const type = document.createElement('small'); type.textContent = car.class;
  button.append(swatch, name, type); button.onclick = () => { selectCar(car.id); saveSelection(); }; $('car-picker').append(button);
}
$('garage-count').textContent = `${CARS.length} machines. ${TRACKS.length} worlds.`;
function cycleCar(direction) { const index = CARS.findIndex(car => car.id === selectedCar); selectCar(CARS[(index + direction + CARS.length) % CARS.length].id); saveSelection(); }
$('previous-car').onclick = () => cycleCar(-1);
$('next-car').onclick = () => cycleCar(1);
const webcam = new WebcamControls($('webcam'), $('hand-overlay'), $('camera-status'), state => {
  $('steering-dot').style.left = `${50 + clamp(state.steer || 0, -1, 1) * 46}%`;
  const progress=Math.round(clamp(state.progress||0,0,1)*100);
  $('calibration-progress').value=progress;$('calibration-label').textContent=`Calibration · ${progress}%`;
  $('calibrate-visible').hidden=Boolean(state.calibrated);$('calibrate-visible').disabled=!state.tracked||!state.points;
  $('calibration-feedback').hidden=Boolean(state.calibrated||state.unavailable);
  $('gesture-feedback').textContent=state.tracked?`${state.gesture} · ${Math.round((state.confidence||0)*100)}% gesture confidence`:'';
  if (state.unavailable) {
    settings.camera = false; syncCameraControls(); $('camera-retry').hidden = false; $('recalibrate').hidden = true; saveProfile(profile);
    if (race && race.state !== 'finished') {
      if (!race.paused) pauseRace('tracking');
      if (race.pauseReason === 'tracking') {
        $('pause-title').textContent = 'Camera needs attention';
        $('pause-copy').textContent = race.multiplayer ? 'The online race keeps running and your car is braking. Retry your camera or continue with keyboard controls.' : 'Your race is waiting. Retry after correcting the camera issue, or continue with keyboard, touch or gamepad controls.';
        $('resume').disabled = false; $('resume').textContent = 'Continue with keyboard';
      }
    }
    toast('Webcam unavailable. Retry camera in the preview, or use keyboard controls.');
  }
  if (!document.hidden && race?.pauseReason === 'tracking' && state.tracked && state.calibrated) resumeRace();
});
function syncCameraControls() {
  $('camera-enabled').checked = $('menu-camera-enabled').checked = Boolean(settings.camera);
  $('race-camera').textContent = settings.camera ? 'Webcam on' : 'Enable webcam';
  $('race-camera').setAttribute('aria-pressed', String(Boolean(settings.camera)));
}
function restoreCameraPanel() { if ([$('pause-dialog'),$('lobby-camera')].includes($('camera-panel').parentElement)) document.body.append($('camera-panel')); }
function setCameraEnabled(enabled) {
  settings.camera = enabled; syncCameraControls(); $('camera-panel').hidden = !enabled;
  $('camera-retry').hidden = true; $('recalibrate').hidden = false;
  if (enabled) { if (!webcam.active) webcam.start(); if (race && !race.multiplayer && (!webcam.state.tracked || !webcam.state.calibrated)) pauseRace('tracking'); }
  else { webcam.stop(); restoreCameraPanel(); if (race?.pauseReason === 'tracking') resumeRace(); }
  saveProfile(profile);
}
function applySettings() {
  renderer?.quality(settings.quality, settings.reducedMotion, settings.reducedFlashes); audio.volume = Number(settings.volume);
  webcam.sensitivity = Number(settings.sensitivity); webcam.mirror = settings.mirror;
  document.body.classList.toggle('high-contrast', settings.highContrast); saveProfile(profile);
  $('sensitivity-value').textContent = Number(settings.sensitivity).toFixed(1);
  $('gamepad-deadzone-value').textContent = `${Math.round(settings.gamepadDeadzone*100)}%`;
  const view=settings.drivingView||'chase';renderer?.setView?.(view);$('driving-view').value=view;
  $('race-view').textContent=`${view[0].toUpperCase()+view.slice(1)} view`;$('race-view').setAttribute('aria-label',`Change driving view (${view})`);
  refreshControlHints();
}
function refreshControlHints() {
  const b = settings.bindings;
  Object.entries(bindingLabels).forEach(([action,label]) => {label.textContent = keyLabel(b[action]);});
  $('control-hint').textContent = `${keyLabel(b.throttle)} accelerate · ${keyLabel(b.left)} / ${keyLabel(b.right)} steer · ${keyLabel(b.brake)} brake · ${keyLabel(b.nitro)} nitro · ${keyLabel(b.drift)} drift. Arrow keys also work.`;
  $('nitro-hint').textContent = `NITRO / ${keyLabel(b.nitro).toUpperCase()}`;
}
const settingElements = { 'camera-enabled':'camera', sensitivity:'sensitivity', 'gamepad-deadzone':'gamepadDeadzone', 'driving-view':'drivingView', mirror:'mirror', assist:'assist', quality:'quality', volume:'volume', 'reduced-motion':'reducedMotion', 'reduced-flashes':'reducedFlashes', 'high-contrast':'highContrast' };
for (const [id, key] of Object.entries(settingElements)) {
  const element = $(id); if (element.type === 'checkbox') element.checked = Boolean(settings[key]); else element.value = settings[key];
  element.oninput = () => {
    settings[key] = element.type === 'checkbox' ? element.checked : element.type === 'range' ? Number(element.value) : element.value;
    $('sensitivity-value').textContent = Number(settings.sensitivity).toFixed(1); applySettings();
    if (key === 'camera') setCameraEnabled(settings.camera);
  };
}
for (const [action, code] of Object.entries(settings.bindings)) {
  const button = document.createElement('button'), key = document.createElement('small'); button.textContent = action.toUpperCase(); key.textContent = keyLabel(code); button.append(key);
  bindingLabels[action] = key;
  button.onclick = () => { refreshControlHints(); key.textContent = 'Press a key…'; controls.bind(action, (_newCode,displaced) => { refreshControlHints(); saveProfile(profile); if(displaced) toast(`Keys swapped with ${displaced}.`); },message => {key.textContent=message;}); }; $('key-bindings').append(button);
}
$('settings-done').onclick = () => { controls.cancelBind?.(); $('settings-dialog').close(); applySettings(); };
$('nav-settings').onclick = () => $('settings-dialog').showModal();
$('nav-garage').onclick = () => { if (race) garage(); };
$('recalibrate').onclick = () => { webcam.calibrate(); if (race && !race.multiplayer) pauseRace('tracking'); };
$('calibrate-visible').onclick = () => { if (!webcam.useCurrentHand()) toast('Show one hand clearly in the preview, then try again.'); };
$('camera-off').onclick = () => setCameraEnabled(false);
$('camera-retry').onclick = () => setCameraEnabled(true);
$('menu-camera-enabled').onchange = () => setCameraEnabled($('menu-camera-enabled').checked);
$('race-camera').onclick = () => setCameraEnabled(!settings.camera);
$('race-view').onclick = () => { const views=['chase','wide','road'];settings.drivingView=views[(views.indexOf(settings.drivingView)+1)%views.length];applySettings(); };
$('track-select').onchange = () => { captions(); saveSelection(); }; $('mode-select').onchange = () => { captions(); saveSelection(); };
for (const id of ['difficulty','laps-select','daily','driver-name']) $(id).onchange = saveSelection;
$('tuning').onchange = () => { refreshPerformance(); saveSelection(); };
for (const id of ['paint','wheel-style','stripe','trail-style']) $(id).oninput = () => { selectCar(selectedCar, false); saveSelection(); };

function newRace(c, practice = false) {
  const track = buildTrack(c.track, c.seed), vehicle = createVehicle(c.car, c.tuning);
  const bots = c.mode === 'time-trial' || practice ? [] : ['nova','vanta','ion'].map((car, i) => ({ ...createVehicle(car), id: `bot-${i}`, name: ['Mika / smooth','Jules / aggressive','Ren / tactical'][i], lateral: [-3, 3, -1.5][i], distance: -8 - i * 5 }));
  const duration = c.mode === 'survival' ? 90 : Infinity;
  return { config: c, track, vehicle, bots, hazards: makeHazards(track, c.difficulty), state: 'countdown', countdown: 3,
    practice, tutorialStep: 0, tutorialDone: new Set(), duration, checkpointDeadline: 12, eliminationLap: 0, frames: [], ghost: [],
    bestGhost: profile.ghosts[category(c)], ghostTime: 0, messageTime: 0, pauseReason: null, token: null, submitted: false };
}
async function startSolo(practice = false, championshipNext = false) {
  saveSelection(); if (!championshipNext) championship = null;
  const c = config();
  if (c.mode === 'elimination') c.laps = 3;
  if (c.mode === 'survival' || c.mode === 'checkpoint') c.laps = 30;
  if (c.mode === 'championship' && !championship) championship = { round: 0, points: 0, results: [], order: championshipTracks };
  if (championship) c.track = championship.order[championship.round];
  if (practice) { c.mode = 'time-trial'; c.laps = 1; c.difficulty = 'easy'; }
  leaveNetwork(); race = newRace(c, practice); ghostCursor = 0; accumulator = 0;
  showRace(); renderer.trackWorld(race.track, race.hazards); renderer.vehicle('player', race.vehicle, $('paint').value, { wheels: $('wheel-style').value, stripe: $('stripe').checked });
  audio.start();
  if (settings.camera) { $('camera-panel').hidden = false; if (!webcam.active) webcam.start(); if (!webcam.state.calibrated) pauseRace('tracking'); }
  if (!SOLO && !practice && ['circuit','time-trial','championship'].includes(c.mode)) {
    const thisRace = race;
    try { const response = await fetch('/api/challenge?' + new URLSearchParams(c)); const challenge = await response.json(); if (race === thisRace) thisRace.token = challenge.token; }
    catch { toast('Playing locally. Verified records need the server connection.'); }
  }
}
function showRace() {
  restoreCameraPanel(); syncCameraControls();
  $('garage').hidden = true; $('race-ui').hidden = false; $('results-dialog').close(); $('pause-dialog').close();
  $('race-track').textContent = TRACKS.find(t => t.id === race.config.track)?.name;
  $('race-mode').textContent = race.practice ? 'PRACTICE RUN' : race.multiplayer ? `MULTIPLAYER / ${network?.code || ''}` : MODES.find(m => m.id === race.config.mode)?.name.toUpperCase();
  $('pause-button').textContent = race.multiplayer ? 'Brake hold' : 'Pause';
  $('pause-restart').hidden = Boolean(race.multiplayer);
  if (!SOLO) $('share-room').hidden = !race.multiplayer;
  updateLobby();
}
function pauseRace(reason = 'manual') {
  if (!race || race.state === 'finished' || race.paused && !['tracking','background'].includes(reason)) return;
  race.paused = true; race.pauseReason = reason;
  $('pause-title').textContent = reason === 'tracking' ? 'Get your hands ready' : race.multiplayer ? 'Brake hold' : 'Race paused';
  $('pause-copy').textContent = reason === 'tracking' ? 'Hold an open palm steady in the preview. The race starts automatically when your hand is ready. Close your fist to accelerate and tilt to steer. Use keyboard only if you want to turn the webcam off.' : race.multiplayer ? 'The online race keeps running. Your car will brake until you resume.' : reason === 'background' ? 'Your race is waiting while you are away. Resume when you are ready; webcam controls reconnect if needed.' : 'Take a breath. Your race will wait.';
  $('resume').disabled = reason === 'tracking' && webcam.active && (!webcam.state.tracked || !webcam.state.calibrated);
  $('resume').textContent = $('resume').disabled ? 'Waiting for your hand…' : 'Resume race';
  if (reason === 'tracking') { $('pause-dialog').insertBefore($('camera-panel'), $('resume')); $('camera-panel').hidden = false; }
  if (!$('pause-dialog').open) $('pause-dialog').showModal(); audio.update(null);
}
function resumeRace() {
  if (!race) return;
  if (settings.camera && (!webcam.active || !webcam.state.tracked || !webcam.state.calibrated)) {
    if (!webcam.active) webcam.start();
    if (settings.camera) { pauseRace('tracking'); return; }
  }
  restoreCameraPanel(); $('resume').disabled = false; $('resume').textContent = 'Resume race';
  race.paused = false; race.pauseReason = null; accumulator = 0; $('pause-dialog').close(); audio.start();
}
$('pause-restart').onclick = () => { if (race && !race.multiplayer) { const practice = race.practice; controls.keys.clear(); controls.touch = {}; startSolo(practice,Boolean(championship)); } };
function roomSession(value) { if (SOLO) return null; try { if (value === null) sessionStorage.removeItem('velocity-room'); else if (value) sessionStorage.setItem('velocity-room',JSON.stringify(value)); else return JSON.parse(sessionStorage.getItem('velocity-room')); } catch { return null; } }
function leaveNetwork() { if (SOLO) return; if (socket) { socket.emit('leave-race'); socket.disconnect(); socket = null; } network = null; roomSession(null); $('resume-room').hidden = true; }
function garage() {
  restoreCameraPanel();
  leaveNetwork(); race = null; championship = null; webcam.stop(); $('camera-panel').hidden = true; $('pause-dialog').close(); $('results-dialog').close(); $('race-ui').hidden = true; $('garage').hidden = false;
  controls.keys.clear(); audio.update(null); refreshCosmetics(); selectCar(selectedCar, false);
}
function flash(message, duration = 2) { if (!race) return; race.message = message; race.messageTime = duration; }
function position() {
  if (!race) return 1;
  return 1 + race.bots.filter(bot => !bot.eliminated && (bot.finished ? !race.vehicle.finished || bot.time < race.vehicle.time : bot.distance > race.vehicle.distance)).length;
}
async function finish(reason = '') {
  if (!race || race.state === 'finished') return;
  const completed = race; race.state = 'finished'; race.vehicle.speed = 0; race.paused = false; $('pause-dialog').close();
  if (!race.multiplayer && race.vehicle.finished) race.ghost.push([race.vehicle.time, race.vehicle.distance, race.vehicle.lateral, race.vehicle.heading, 0]);
  const rank = race.multiplayer ? network.players.filter(p => p.finished && p.time < race.vehicle.time).length + 1 : position();
  const onlineResultId = race.multiplayer && network.runId ? `${network.runId}:${network.id}` : null;
  const result = race.practice ? { saved: true } : recordRace(profile, race.vehicle, race.config, rank, race.ghost, onlineResultId);
  if (championship) {
    if (awardChampionship(championship, race.config.track, rank)) { profile.championshipWins++; if (!profile.achievements.includes('champion')) profile.achievements.push('champion'); saveProfile(profile); }
  }
  $('result-title').textContent = race.practice ? 'Practice complete' : reason || (race.vehicle.finished ? rank === 1 ? 'Beautiful driving.' : `Finished ${rank}${rank === 2 ? 'nd' : rank === 3 ? 'rd' : 'th'}` : 'Run complete');
  $('result-subtitle').textContent = championship ? `Championship round ${championship.round + 1} / 4 · ${championship.points} points` : `${TRACKS.find(t => t.id === race.config.track).name} / ${CARS.find(c => c.id === race.config.car).name}`;
  $('result-time').textContent = formatTime(race.vehicle.time);
  $('result-best').textContent = result.best ? `New personal best${result.previous ? ` · ${(result.previous - race.vehicle.time).toFixed(2)}s faster` : ''}` : profile.bests[category(race.config)] ? `Personal best ${formatTime(profile.bests[category(race.config)])}` : 'Keep finding your line.';
  $('result-stats').replaceChildren();
  for (const [value, label] of [[Math.round(race.vehicle.score),'SCORE'],[race.vehicle.collisions,'COLLISIONS'],[race.vehicle.nearMisses,'NEAR MISSES'],[Math.round(race.vehicle.boosts),'BOOST SECONDS'],[race.vehicle.laps.length,'LAPS'],[1 + Math.floor(profile.xp / 500),'DRIVER LEVEL']]) stat($('result-stats'), value, label);
  $('lap-splits').replaceChildren(); race.vehicle.laps.forEach((time, i) => recordRow($('lap-splits'), `Lap ${i + 1}`, formatTime(time)));
  $('record-status').textContent = result.saved === false ? 'Browser storage unavailable. Results were not saved.' : result.skipped ? 'Race ended before driving. No progress awarded.' : result.alreadyRecorded ? 'Recovered results · progress already saved on this device.' : race.practice ? 'Practice runs do not affect your records.' : result.ghostSaved === false && !race.multiplayer ? 'Progress saved. The new ghost could not be stored; previous replays were kept.' : 'Progress saved on this device.';
  $('race-again').textContent = race.multiplayer ? 'Request rematch' : championship && championship.round < 3 ? 'Next round' : 'Race again'; $('race-again').disabled = false;
  $('results-dialog').showModal(); audio.effect('finish'); audio.update(null);
  if (!SOLO && !race.multiplayer && race.token && race.vehicle.finished && !race.practice && race.frames.length <= 85000) {
    $('record-status').textContent = 'Verifying the racing line…';
    try {
      const response = await fetch('/api/records', { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ token: race.token, frames: race.frames, name: profile.name }) });
      const data = await response.json(); if (race === completed) $('record-status').textContent = response.ok ? 'Server verified · saved to this event’s leaderboard.' : `${data.error} Personal best remains local.`;
    } catch { if (race === completed) $('record-status').textContent = 'Offline: personal best saved locally. Global record was not published.'; }
  }
}
function stat(parent, value, label) { const container = document.createElement('div'), strong = document.createElement('strong'), caption = document.createElement('span'); strong.textContent = value; caption.textContent = label; container.append(strong,caption); parent.append(container); }
function recordRow(parent, left, right) { const row = document.createElement('div'); row.className = 'record-row'; const a = document.createElement('span'), b = document.createElement('span'); a.textContent = left; b.textContent = right; row.append(a,b); parent.append(row); }

function raceEffects(events) {
  if (!race || race.paused) return;
  for (const event of events) {
    if (['collision','pickup','near-miss'].includes(event)) {
      audio.effect(event); if (event==='collision') renderer.emitParticles(race.vehicle,'collision');
      flash(event==='collision'?'Impact · keep your line':event==='pickup'?'Nitro replenished':`Near miss ×${Math.min(5,race.vehicle.combo)}`,1);
    }
    if (event==='lap') flash(`Lap ${race.vehicle.laps.length} · ${formatTime(race.vehicle.laps.at(-1))}`,2);
  }
}

function updateSolo(dt, input) {
  if (!race || race.state === 'finished' || race.paused) return;
  if (race.state === 'countdown') { race.countdown -= dt; if (race.countdown <= 0) { race.state = 'racing'; flash('GO', .7); } return; }
  const events = stepVehicle(race.vehicle, input, dt, race.track, { difficulty: race.config.difficulty, assist: settings.assist, hazards: race.hazards, laps: race.config.laps });
  // Global records require the standard assistance setting used in server replay.
  if (!settings.assist) race.token = null;
  race.frames.push([input.throttle, input.brake, input.steer, Number(input.nitro), Number(input.drift)]);
  if (race.frames.length % 6 === 0) race.ghost.push([race.vehicle.time, race.vehicle.distance, race.vehicle.lateral, race.vehicle.heading, race.vehicle.speed]);
  race.bots.forEach((bot, i) => stepVehicle(bot, botInput(bot, race.track, race.config.difficulty, i, race.hazards), dt, race.track, { difficulty: race.config.difficulty, hazards: race.hazards, laps: race.config.laps }));
  raceEffects(events);
  if (race.practice) {
    if (input.throttle > .5) race.tutorialDone.add('accelerate'); if (Math.abs(input.steer) > .4) race.tutorialDone.add('steer'); if (input.brake) race.tutorialDone.add('brake'); if (input.nitro) race.tutorialDone.add('nitro');
    const b = settings.bindings;
    const steps = [['accelerate',`Press ${keyLabel(b.throttle)} / ↑ or close your fist to accelerate`],['steer',`Use ${keyLabel(b.left)} / ${keyLabel(b.right)}, arrows or tilt your hand to steer`],['brake',`Press ${keyLabel(b.brake)} or open your palm to brake`],['nitro',`Hold ${keyLabel(b.nitro)} to spend nitro on a straight`]];
    const next = steps.find(([id]) => !race.tutorialDone.has(id)); race.tutorialText = next ? `PRACTICE ${race.tutorialDone.size+1} / 4 · ${next[1]}` : 'READY · Follow the circuit to the finish.';
  }
  const outcome = advanceMode(race, events, dt); if (outcome) finish(outcome === 'Finished' ? '' : outcome);
}
function updateHUD() {
  if (!race) return;
  updateLobby();
  const v = race.vehicle; $('speed').textContent = Math.round(v.speed * 3.6); $('race-time').textContent = formatTime(v.time);
  $('race-lap').textContent = race.config.mode === 'survival' ? `STRIKES ${Math.max(0,3 - v.collisions)} / 3 · ${Math.max(0,Math.ceil(90 - (race.survivalProgress || 0)))}s MOVING` : race.config.mode === 'checkpoint' ? `GATE ${v.checkpoint} · ${Math.max(0,Math.ceil(race.checkpointDeadline - v.time))}s` : `LAP ${Math.min(race.config.laps, 1 + v.laps.length)} / ${race.config.laps}`;
  const nitro=Math.round(clamp(v.nitro,0,1)*100);
  $('nitro-meter').firstElementChild.style.width = `${nitro}%`; $('nitro-meter').setAttribute('aria-valuenow',String(nitro));
  $('nitro-meter').classList.toggle('boosting',Boolean(v.boost)); $('nitro-meter').classList.toggle('low',nitro<20);
  $('nitro-hint').textContent = `NITRO ${nitro}% / ${keyLabel(settings.bindings.nitro).toUpperCase()}`;
  $('race-score').textContent = `${Math.round(v.score)} PTS / ${v.nearMisses} NEAR / ${v.collisions} HITS`;
  const lap = lapFeedback(v,race.track);
  $('lap-progress-fill').style.width = `${lap.progress * 100}%`; $('lap-progress').setAttribute('aria-valuenow',String(Math.round(lap.progress * 100)));
  $('current-lap').textContent = formatTime(lap.current); $('best-lap').textContent = lap.best === null ? '—' : formatTime(lap.best);
  $('race-gate').textContent = v.finished ? 'FINISH LINE' : `GATE ${lap.gate} / 8 · ${Math.ceil(lap.gateDistance)}m`;
  const hazard = race.state === 'racing' ? hazardCue(v,race.track,race.hazards,race.config.laps) : null;
  $('race-condition').textContent = race.multiplayer && network?.state === 'waiting' ? `Room ${network.code} · share the code or invite link` : hazard?.label || drivingCondition(v,race.track);
  $('race-condition').classList.toggle('hazard-warning',Boolean(hazard));
  $('race-split').textContent = v.laps.length ? `LAST LAP ${formatTime(v.laps.at(-1))}` : race.multiplayer ? 'Server-controlled racing' : settings.assist ? 'Steering assistance on' : 'Unassisted · local records';
  if (race.config.mode === 'time-trial' && race.bestGhost?.length) {
    const gap = ghostDelta(race.bestGhost,v.time,v.distance);
    $('race-split').textContent = gap === null ? 'Beyond the ghost replay' : `GHOST ${Math.abs(gap).toFixed(2)}s ${gap > .005 ? 'BEHIND' : gap < -.005 ? 'AHEAD' : 'EVEN'}`;
    $('race-split').classList.toggle('ahead',gap !== null && gap < -.005); $('race-split').classList.toggle('behind',gap !== null && gap > .005);
  } else { $('race-split').classList.toggle('ahead',false); $('race-split').classList.toggle('behind',false); }
  let message = race.state === 'countdown' ? String(Math.max(1,Math.ceil(race.countdown))) : race.messageTime > 0 ? race.message : race.practice ? race.tutorialText || '' : '';
  if (race.multiplayer && network?.state === 'waiting') message = network.private ? '' : `ROOM ${network.code}\nWaiting for another driver`;
  $('race-message').classList.toggle('tutorial-hint',Boolean(race.practice && race.state === 'racing' && race.messageTime <= 0));
  if (message !== lastMessage) { $('race-message').textContent = message; lastMessage = message; }
  const ordered = race.multiplayer ? network.players : [{ ...v, name: profile.name, id: 'player' }, ...race.bots];
  $('standings').replaceChildren(); ordered.filter(p => !p.eliminated).sort((a,b) => (b.finished ? 1 : 0) - (a.finished ? 1 : 0) || (a.finished && b.finished ? a.time - b.time : b.distance - a.distance)).forEach((p,i) => {
    const row = document.createElement('div'); row.className = `standing${p.id === (race.multiplayer ? network.id : 'player') ? ' player' : ''}`;
    const name = document.createElement('span'), rank = document.createElement('span'); name.textContent = p.name; rank.textContent = `${i + 1}${p.online === false ? ' ↻' : ''}`; row.append(rank,name); $('standings').append(row);
  });
  drawMap(ordered);
}
function updateLobby() {
  if (SOLO) return;
  const waiting=Boolean(race?.multiplayer&&network?.private&&network.state==='waiting');
  $('race-lobby').hidden=!waiting;$('race-ui').classList.toggle('lobby-waiting',waiting);
  if (!waiting) { if ($('camera-panel').parentElement===$('lobby-camera')) restoreCameraPanel();return; }
  if (settings.camera && ![$('pause-dialog'),$('lobby-camera')].includes($('camera-panel').parentElement)) $('lobby-camera').append($('camera-panel'));
  const players=network.players,own=players.find(p=>p.id===network.id),host=network.hostId===network.id;
  const ready=players.length>=2&&players.every(p=>p.online&&p.ready);
  $('lobby-code').textContent=network.code;$('lobby-count').textContent=`${players.length} / 4 DRIVERS`;
  $('lobby-course').textContent=`${race.track.name} · ${DIFFICULTIES[race.config.difficulty].label} · ${race.config.laps} lap${race.config.laps===1?'':'s'}`;
  const signature=JSON.stringify([network.hostId,network.id,players.map(p=>[p.id,p.name,p.carId,p.online,p.ready])]);
  if(signature!==network.lobbySignature) {
    network.lobbySignature=signature;$('lobby-drivers').replaceChildren();
    for(let i=0;i<4;i++) {
    const p=players[i],row=document.createElement('div');row.className=`lobby-driver${p?.ready?' ready':''}${p?'':' empty'}`;
    const number=document.createElement('span'),name=document.createElement('strong'),detail=document.createElement('small');
    number.textContent=String(i+1).padStart(2,'0');name.textContent=p?`${p.name}${p.id===network.id?' · you':''}`:'Open grid slot';
    detail.textContent=p?`${CARS.find(c=>c.id===p.carId)?.name||p.carId} · ${p.online?(p.ready?'READY':'NOT READY'):'RECONNECTING'}${p.id===network.hostId?' · HOST':''}`:'Invite another driver';
    row.append(number,name,detail);$('lobby-drivers').append(row);
    }
  }
  $('lobby-ready').textContent=own?.ready?'Not ready':'Ready to race';$('lobby-ready').setAttribute('aria-pressed',String(Boolean(own?.ready)));$('lobby-ready').disabled=!socket?.connected;
  $('lobby-start').hidden=!host;$('lobby-start').disabled=!ready;
  $('lobby-status').textContent=players.length<2?'Invite another driver. The host starts when everyone is ready.':ready?host?'Grid ready. Start when your crew is here.':'Grid ready. Waiting for the host to start.':'Waiting for every driver to be connected and ready.';
}
function drawMap(vehicles) {
  const ctx = $('minimap').getContext('2d'), w = 180, h = 150; ctx.clearRect(0,0,w,h);
  const track = race.track, scale = .25, convert = p => [90 + p.x * scale, 75 + p.z * scale];
  ctx.strokeStyle = '#9ab0bb'; ctx.lineWidth = 3; ctx.beginPath(); track.points.forEach((p,i) => { const [x,y] = convert(p); if (i) ctx.lineTo(x,y); else ctx.moveTo(x,y); }); ctx.stroke();
  for (const v of vehicles) { const [x,y] = convert(trackPoint(track,v.distance,v.lateral)); ctx.fillStyle = v.id === 'player' || v.id === network?.id ? '#f17c4a' : '#67d7ba'; ctx.beginPath(); ctx.arc(x,y,4,0,Math.PI*2); ctx.fill(); }
}
function renderVehicles(dt) {
  if (!race) return;
  const animate = !race.paused && race.state !== 'finished';
  renderer.vehicle('player', race.vehicle, $('paint').value, { wheels: $('wheel-style').value, stripe: $('stripe').checked, animate });
  for (const bot of race.bots) renderer.vehicle(bot.id, bot, CARS.find(c => c.id === bot.carId)?.color,{animate});
  if (race.multiplayer && network) for (const player of network.players) {
    if (player.id === network.id) continue;
    const displayed = network.displayed.get(player.id) || { ...player };
    const smooth = 1 - Math.exp(-dt * 12); for (const key of ['distance','lateral','heading','speed']) displayed[key] += (player[key] - displayed[key]) * smooth;
    displayed.boost = player.boost; displayed.braking = player.braking; displayed.steering=player.steering; network.displayed.set(player.id,displayed); renderer.vehicle(player.id,displayed,player.color);
  }
  if (!race.multiplayer && race.bestGhost?.length && race.config.mode === 'time-trial') {
    while (ghostCursor + 1 < race.bestGhost.length && race.bestGhost[ghostCursor + 1][0] <= race.vehicle.time) ghostCursor++;
    const a = race.bestGhost[ghostCursor], b = race.bestGhost[Math.min(ghostCursor + 1, race.bestGhost.length - 1)];
    const t = clamp((race.vehicle.time - a[0]) / (b[0] - a[0] || 1), 0, 1), [,distance,lateral,heading,speed] = a.map((value,i) => value + (b[i] - value) * t);
    renderer.vehicle('ghost',{carId:race.config.car,distance,lateral,heading,speed,boost:false},'#a5eee0',{ghost:true,animate});
  }
  renderer.pruneVehicles(['player',...race.bots.map(bot=>bot.id),...(network?.players.filter(player=>player.id!==network.id).map(player=>player.id)||[]),...(!race.multiplayer&&race.bestGhost?.length&&race.config.mode==='time-trial'?['ghost']:[])]);
}
function loop(now) {
  requestAnimationFrame(loop); const dt = Math.min(.1,(now - previous) / 1000); previous = now;
  if ($('settings-dialog').open) {
    const pad = controls.gamepad(), message = pad ? `${pad.id || 'Controller'} connected${pad.mapping === 'standard' ? '' : ' · button layout may vary'}` : 'Connect a controller and press a button to detect it.';
    if ($('controller-status').textContent !== message) $('controller-status').textContent = message;
    $('controller-steering').value = gamepadAxis(pad?.axes?.[0],settings.gamepadDeadzone);
  }
  if (race && race.state !== 'finished') {
    const input = controls.read(webcam);
    if (!race.paused && webcam.active && race.state === 'racing' && !race.multiplayer && (!webcam.state.tracked || !webcam.state.calibrated) && !input.throttle && !input.steer) pauseRace('tracking');
    if (race.multiplayer) {
      sendElapsed += dt;
      if (socket?.connected && sendElapsed >= .05) { sendElapsed = 0; socket.emit('race-input',race.paused ? { throttle:0,brake:1,steer:0 } : input); }
      if (network?.state === 'countdown') race.countdown = networkCountdown(network,performance.now());
    } else {
      if (!race.paused) { accumulator += dt; while (accumulator >= 1 / 60) { updateSolo(1 / 60,input); accumulator -= 1 / 60; } }
    }
    const cue = countdownCue(race); if (cue) audio.effect(cue);
    race.messageTime = Math.max(0,race.messageTime - dt); audio.update(race.paused || race.state === 'finished' ? null : race.vehicle,input);
    if(!race.paused && race.vehicle.speed>15 && (input.drift || trackSurface(race.track,race.vehicle.distance,race.vehicle.lateral)==='rough')) renderer.emitParticles(race.vehicle);
    if (!race.paused && race.vehicle.boost && $('trail-style').value !== 'none') renderer.emitParticles(race.vehicle, 'trail', $('trail-style').value);
  }
  if (race) { renderVehicles(dt); hudElapsed += dt; if (hudElapsed >= .1) { updateHUD(); hudElapsed = 0; } }
  renderer.render(race?.paused?0:dt,race?.vehicle);
}

function joinMultiplayer({ private: privateRoom = false, code = '', resume = null } = {}) {
  if (SOLO) return;
  saveSelection(); championship = null; leaveNetwork(); const c = { ...config(), mode:'circuit' };
  race = newRace(c); race.multiplayer = true; race.bots = []; race.state = 'waiting';
  network = { code: resume?.code || code, id: null, resume: null, players: [], displayed: new Map(), state:'waiting' };
  showRace(); renderer.trackWorld(race.track,race.hazards); audio.start();
  socket = io({ reconnectionDelay:500, reconnectionAttempts:20 });
  const initial = { ...c, private:privateRoom, code, name:profile.name, color:$('paint').value, playerKey:profile.id };
  socket.on('connect', () => { if (network?.resume) socket.emit('resume-race',{code:network.code,resume:network.resume}); else if (resume) socket.emit('resume-race',resume); else socket.emit('join-race',initial); });
  socket.on('race-joined',data => {
    if (!network) return; network.id = data.id; network.resume = data.resume; network.code = data.code; roomSession({code:data.code,resume:data.resume});
    const own = data.players.find(p => p.id === data.id); if (own) { selectedCar = own.carId; $('paint').value = own.color; }
    race.config = { ...data.config,car:own?.carId || selectedCar,tuning:own?.tuning || c.tuning }; race.track = buildTrack(data.config.track,data.config.seed); race.hazards = makeHazards(race.track,data.config.difficulty);
    renderer.trackWorld(race.track,race.hazards); showRace(); acceptSnapshot(data);
    if (!data.private) { const url = new URL(location.href); url.searchParams.set('room',data.code); toast(`Room ${data.code} · invite: ${url.toString()}`); }
  });
  socket.on('race-state',acceptSnapshot);
  socket.on('race-error',message => { toast(message); garage(); });
  socket.on('lobby-error',toast);
  socket.on('connect_error',() => toast('Server connection unavailable. Retrying…'));
  socket.on('disconnect',() => { if (network) { flash('Connection lost · reconnecting',20); network.state = 'reconnecting'; } });
  socket.on('rematch-votes',votes => { $('record-status').textContent = `${votes} driver(s) ready for rematch`; });
  if (settings.camera) { $('camera-panel').hidden = false; if (!webcam.active) webcam.start(); }
}
function acceptSnapshot(data) {
  if (!network || !race?.multiplayer) return;
  const prior = network.state; Object.assign(network,{players:data.players,private:data.private,hostId:data.hostId,state:data.state,startAt:data.startAt,now:data.now,receivedAt:performance.now(),runId:data.runId,code:data.code});
  if (data.state === 'countdown' && prior === 'finished') { race.state = 'countdown'; race.lastCountdown = null; $('results-dialog').close(); race.paused = false; race.messageTime = 0; network.displayed.clear(); }
  if (data.state === 'countdown') race.state = 'countdown';
  if (data.state === 'racing') race.state = 'racing';
  const own = data.players.find(p => p.id === network.id), previousVehicle=race.vehicle;
  if (own) {
    race.vehicle = { ...own };
    if (prior==='racing' && ['racing','finished'].includes(data.state)) raceEffects(snapshotEvents(previousVehicle,own));
  }
  if (data.state === 'abandoned') { finish('Opponent left the race'); $('race-again').disabled = true; }
  else if (data.state === 'finished' && race.state !== 'finished') finish();
  else if (own?.finished && data.state !== 'finished') flash('Finished · waiting for the other driver',2);
}
$('start-solo').onclick = () => startSolo(); $('tutorial').onclick = () => startSolo(true);
if (!SOLO) {
$('quick-match').onclick = () => joinMultiplayer(); $('create-room').onclick = () => joinMultiplayer({private:true});
$('resume-room').onclick = () => { const saved = roomSession(); if (saved) joinMultiplayer({resume:saved}); };
$('join-room').onclick = () => { const code = $('room-code').value.trim().toUpperCase(); if (code.length === 6) joinMultiplayer({code}); else toast('Enter a six-character room code.'); };
$('lobby-ready').onclick=()=>{const own=network?.players.find(p=>p.id===network.id);if(own)socket?.emit('lobby-ready',!own.ready);};
$('lobby-start').onclick=()=>socket?.emit('lobby-start');
$('share-room').onclick = async () => {
  if (!network) return; const url = new URL(location.href); url.searchParams.set('room', network.code);
  try { await navigator.clipboard.writeText(url.toString()); toast(`Invite copied · room ${network.code}`); }
  catch { toast(`Room ${network.code} · ${url.toString()}`); }
};
}
$('pause-button').onclick = () => pauseRace(); $('race-menu').onclick = garage; $('pause-garage').onclick = garage; $('result-garage').onclick = garage; $('resume').onclick = resumeRace;
$('pause-dialog').addEventListener('cancel',event => { event.preventDefault(); resumeRace(); });
$('race-again').onclick = () => {
  if (race?.multiplayer) { socket.emit('rematch'); $('race-again').disabled = true; $('race-again').textContent = 'Waiting for drivers…'; }
  else if (championship && championship.round < 3) { championship.round++; startSolo(false,true); }
  else startSolo();
};
$('results-dialog').addEventListener('cancel',event => { event.preventDefault(); garage(); });
window.addEventListener('keydown',event => { if (event.code === 'Escape' && race && !$('pause-dialog').open && !$('results-dialog').open) pauseRace(); });
function pauseWhileAway() {
  controls.keys.clear(); controls.touch = {};
  const state = race?.multiplayer ? network?.state : race?.state;
  if (race && ['countdown','racing'].includes(state) && (!race.paused || race.pauseReason === 'tracking')) pauseRace('background');
}
document.addEventListener('visibilitychange',() => { if (document.hidden) pauseWhileAway(); });
window.addEventListener('pagehide',event => { pauseWhileAway(); webcam.stop(); saveProfile(profile); if(!event.persisted) { renderer?.dispose(); audio.dispose?.(); } });
$('nav-leaderboard').onclick = async () => {
  if (SOLO) {
    const c = config();
    if (c.mode === 'elimination') c.laps = 3;
    if (['survival','checkpoint'].includes(c.mode)) c.laps = 30;
    $('records-dialog').showModal(); $('records-list').replaceChildren();
    const context = document.createElement('p'); context.className = 'caption'; context.textContent = recordContext(c); $('records-list').append(context);
    const rows = personalRecords(profile, c);
    if (!rows.length) { const empty = document.createElement('p'); empty.textContent = 'Finish this event to save a personal best. Recent attempts are in your Driver log.'; $('records-list').append(empty); }
    rows.forEach(row => recordRow($('records-list'), row.label, row.value));
    return;
  }
  $('records-dialog').showModal(); $('records-list').textContent = 'Loading verified records…';
  if (!['circuit','time-trial','championship'].includes(config().mode)) { $('records-list').textContent = 'This event uses local scoring. See your Driver log for results.'; return; }
  try { const response = await fetch('/api/leaderboard?' + new URLSearchParams(config())); const rows = await response.json(); $('records-list').replaceChildren(); if (!rows.length) $('records-list').textContent = 'An open grid. Finish a run to set the first record.'; rows.forEach((row,i) => recordRow($('records-list'),`${i + 1}. ${row.name} / ${CARS.find(c => c.id === row.car)?.name || row.car}`,formatTime(row.time))); }
  catch { $('records-list').textContent = 'Records unavailable. Local personal bests remain in your driver log.'; }
};
$('records-close').onclick = () => $('records-dialog').close();
$('nav-profile').onclick = () => {
  $('profile-stats').replaceChildren(); for (const [v,l] of [[profile.races,'RUNS'],[profile.wins,'WINS'],[Math.round(profile.distance / 1000),'KM DRIVEN'],[profile.xp,'XP'],[profile.nearMisses,'NEAR MISSES'],[profile.championshipWins,'TITLES']]) stat($('profile-stats'),v,l);
  $('achievements').replaceChildren(); if (!profile.achievements.length) $('achievements').textContent = 'Finish your first race to begin your collection.';
  profile.achievements.forEach(a => { const node = document.createElement('div'); node.className = 'achievement'; node.textContent = a.replaceAll('-',' ').toUpperCase(); $('achievements').append(node); });
  $('race-history').replaceChildren(); profile.history.forEach(run => recordRow($('race-history'),`${TRACKS.find(t => t.id === run.track)?.name} / ${run.complete ? `P${run.position}` : 'DNF'}`,formatTime(run.time))); $('profile-dialog').showModal();
};
$('profile-close').onclick = () => $('profile-dialog').close();

try {
  renderer = new RacingRenderer($('world')); refreshCosmetics(); captions(); selectCar(selectedCar);
  if (profile.customization) { $('paint').value = profile.customization.paint || $('paint').value; $('stripe').checked = Boolean(profile.customization.stripe); $('trail-style').value = profile.customization.trail || 'none'; $('wheel-style').value = cosmetics.find(c => c.id === profile.customization.wheels && c.xp <= profile.xp)?.id || 'alloy'; selectCar(selectedCar, false); }
  applySettings(); syncCameraControls(); $('loading').hidden = true; requestAnimationFrame(loop);
  if (!SOLO) {
    const invite = new URL(location.href).searchParams.get('room'); if (invite) { $('room-code').value = invite.slice(0,6).toUpperCase(); toast('Invite loaded. Choose your car, then Join.'); }
    if (roomSession()) { $('resume-room').hidden = false; toast('Previous room found. Rejoin within 20 seconds to recover your car.'); }
  }
} catch (error) { $('loading').textContent = `3D graphics could not start: ${error.message}. Enable hardware acceleration in your browser.`; console.error(error); }
