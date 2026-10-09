import { CARS, TRACKS, MODES, DIFFICULTIES, clamp } from '../../shared/racing.js';
import { compactGhost } from './ghost-recording.js';
const KEY = 'velocity-3d-profile-v1';
let recoveryCopy = null;
export const defaultSettings = { sensitivity: 1, mirror: true, assist: true, reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
  reducedFlashes: false, highContrast: false, quality: 'medium', volume: .35, camera: false, gamepadDeadzone: .12, drivingView:'chase',
  bindings: { throttle: 'KeyW', brake: 'Space', left: 'KeyA', right: 'KeyD', nitro: 'ShiftLeft', drift: 'KeyX' } };
export function loadProfile() {
  const base = { id: crypto.randomUUID(), name: 'Driver', xp: 0, races: 0, wins: 0, collisions: 0, nearMisses: 0, distance: 0,
    championshipWins: 0, achievements: [], settings: structuredClone(defaultSettings), bests: {}, ghosts: {}, history: [], onlineResults: [] };
  recoveryCopy = null;
  let raw;
  try {
    raw = localStorage.getItem(KEY);
    if (!raw) return base;
    const saved = JSON.parse(raw);
    if (!isObject(saved)) { recoveryCopy = raw; return base; }
    const profile = { ...base, ...saved };
    profile.id = typeof saved.id === 'string' && saved.id.length ? saved.id : base.id;
    profile.name = typeof saved.name === 'string' && saved.name.trim() ? saved.name.trim().slice(0,20) : base.name;
    for (const field of ['xp','races','wins','collisions','nearMisses','distance','championshipWins']) {
      profile[field] = Number.isFinite(saved[field]) && saved[field] >= 0 ? saved[field] : base[field];
    }
    profile.settings = normalizeSettings(saved.settings);
    profile.achievements = Array.isArray(saved.achievements) ? [...new Set(saved.achievements.filter(a => typeof a === 'string'))] : [];
    profile.history = Array.isArray(saved.history) ? saved.history.filter(run => isObject(run) && Number.isFinite(run.time) && run.time >= 0).slice(0,20) : [];
    profile.onlineResults = Array.isArray(saved.onlineResults) ? [...new Set(saved.onlineResults.filter(id => typeof id === 'string' && id.length <= 80))].slice(-128) : [];
    profile.bests = Object.fromEntries(Object.entries(isObject(saved.bests) ? saved.bests : {}).filter(([,time]) => Number.isFinite(time) && time > 0));
    profile.ghosts = Object.fromEntries(Object.entries(isObject(saved.ghosts) ? saved.ghosts : {}).filter(([,frames]) => validGhost(frames)));
    if (saved.selection !== undefined) profile.selection = normalizeSelection(saved.selection);
    if (saved.customization !== undefined) {
      const c = isObject(saved.customization) ? saved.customization : {};
      profile.customization = { ...c, paint: /^#[0-9a-f]{6}$/i.test(c.paint) ? c.paint : undefined, stripe: c.stripe === true,
        wheels: ['alloy','black','gold'].includes(c.wheels) ? c.wheels : 'alloy', trail: ['none','ember','ice'].includes(c.trail) ? c.trail : 'none' };
    }
    // Preserve the original bytes before an automatically repaired profile is saved.
    // Compare only fields present in old profiles; newly added defaults are a migration.
    if (Object.keys(saved).some(key => JSON.stringify(saved[key]) !== JSON.stringify(profile[key]))) recoveryCopy = raw;
    return profile;
  } catch { if (raw) recoveryCopy = raw; return base; }
}
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export function normalizeSettings(value) {
  const settings = structuredClone(defaultSettings), saved = isObject(value) ? value : {};
  for (const key of ['mirror','assist','reducedMotion','reducedFlashes','highContrast','camera']) if (typeof saved[key] === 'boolean') settings[key] = saved[key];
  for (const [key,min,max] of [['sensitivity',.4,2.5],['volume',0,1],['gamepadDeadzone',.04,.3]]) if (Number.isFinite(saved[key])) settings[key] = clamp(saved[key],min,max);
  if (['low','medium','high'].includes(saved.quality)) settings.quality = saved.quality;
  if (['chase','wide','road'].includes(saved.drivingView)) settings.drivingView=saved.drivingView;
  const bindings = isObject(saved.bindings) ? saved.bindings : {}, used = new Set(), accepted = {};
  const arrows = { ArrowUp:'throttle', ArrowDown:'brake', ArrowLeft:'left', ArrowRight:'right' };
  for (const action of Object.keys(settings.bindings)) {
    const code = bindings[action];
    if (typeof code === 'string' && /^[A-Za-z][A-Za-z0-9]{0,30}$/.test(code) && !['Escape','Tab'].includes(code) && (!arrows[code] || arrows[code] === action) && !used.has(code)) { accepted[action] = code; used.add(code); }
  }
  for (const action of Object.keys(settings.bindings)) {
    if (!accepted[action]) { const code = !used.has(settings.bindings[action]) ? settings.bindings[action] : Object.values(defaultSettings.bindings).find(candidate => !used.has(candidate)); accepted[action] = code; used.add(code); }
  }
  settings.bindings = accepted;
  return settings;
}
function normalizeSelection(value) {
  const s = isObject(value) ? value : {}, choice = (key,values,fallback) => values.includes(s[key]) ? s[key] : fallback;
  return { ...s, car: choice('car',CARS.map(c=>c.id),'apex'), track: choice('track',TRACKS.map(t=>t.id),'coast'),
    mode: choice('mode',MODES.map(m=>m.id),'circuit'), difficulty: choice('difficulty',Object.keys(DIFFICULTIES),'normal'),
    laps: choice('laps',[1,3,5,30],1), tuning: choice('tuning',['balanced','grip','speed'],'balanced'), daily: s.daily === true };
}
export function validGhost(frames) {
  if (!Array.isArray(frames) || !frames.length) return false;
  let time = -1, distance = -1;
  return frames.every(frame => {
    if (!Array.isArray(frame) || frame.length < 5 || !frame.slice(0,5).every(Number.isFinite) || frame[0] < time || frame[1] < distance || frame[0] < 0 || frame[1] < 0) return false;
    time = frame[0]; distance = frame[1]; return true;
  });
}
export function saveProfile(profile) {
  try {
    if (recoveryCopy) {
      if (!localStorage.getItem(`${KEY}-recovery`)) localStorage.setItem(`${KEY}-recovery`, recoveryCopy);
      recoveryCopy = null;
    }
    localStorage.setItem(KEY, JSON.stringify(profile)); return true;
  } catch { return false; }
}
export function category(config) { return [config.track, config.mode, config.difficulty, config.laps, config.seed, config.car, config.tuning].join(':'); }
export function recordRace(profile, vehicle, config, position, ghost, onlineResultId = null) {
  if (onlineResultId && profile.onlineResults?.includes(onlineResultId)) return { best:false, earned:[], saved:true, alreadyRecorded:true };
  const key = category(config), previous = profile.bests[key], complete = vehicle.finished && !vehicle.eliminated;
  // Waiting/countdown exits and idle abandoned races are not racing attempts.
  // Keep existing progress untouched; actual partial driving still earns credit.
  if (!complete && vehicle.distance <= 0 && vehicle.score <= 0) return { best:false, earned:[], saved:true, skipped:true };
  const best = complete && (!previous || vehicle.time < previous);
  profile.races++; profile.wins += position === 1 && complete ? 1 : 0; profile.collisions += vehicle.collisions;
  profile.nearMisses += vehicle.nearMisses; profile.distance += vehicle.distance;
  profile.xp += Math.round(50 + vehicle.score / 10 + (complete ? 100 : 0) + (position === 1 && complete ? 100 : 0));
  const previousGhost = profile.ghosts[key];
  let ghostSaved = true;
  if (best) {
    profile.bests[key] = vehicle.time;
    if (validGhost(ghost)) profile.ghosts[key] = compactGhost(ghost);
    else ghostSaved = false;
  }
  const earned = [];
  for (const [id, condition] of [['first-finish', complete], ['clean-racer', complete && vehicle.collisions === 0], ['close-call', profile.nearMisses >= 10], ['race-veteran', profile.races >= 10], ['champion', profile.championshipWins > 0]]) {
    if (condition && !profile.achievements.includes(id)) { profile.achievements.push(id); earned.push(id); }
  }
  profile.history.unshift({ track: config.track, mode: config.mode, car: config.car, time: vehicle.time, position, complete, date: new Date().toISOString() }); profile.history.length = Math.min(20, profile.history.length);
  if (onlineResultId) profile.onlineResults = [...(profile.onlineResults || []), onlineResultId].slice(-128);
  let saved = saveProfile(profile);
  if (!saved && best && ghostSaved) {
    // If the new replay exhausts storage, retain every old ghost and try to save
    // the smaller progress update. Never evict another category's racing data.
    if (previousGhost) profile.ghosts[key] = previousGhost; else delete profile.ghosts[key];
    ghostSaved = false;
    saved = saveProfile(profile);
  }
  return { best, previous, earned, saved, ghostSaved };
}
export const cosmetics = [
  { id: 'alloy', name: 'Alloy wheels', xp: 0 }, { id: 'black', name: 'Carbon wheels', xp: 500 }, { id: 'gold', name: 'Gold wheels', xp: 1500 }
];
