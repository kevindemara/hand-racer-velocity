import test from 'node:test';
import assert from 'node:assert/strict';
import { createVehicle } from '../shared/racing.js';
globalThis.matchMedia = () => ({ matches: false });
const storage = new Map();
globalThis.localStorage = { getItem: k => storage.get(k) || null, setItem: (k, v) => storage.set(k, v) };
const { loadProfile, saveProfile, recordRace, category } = await import('../public/src/profile.js');

test('abandoned idle races do not award XP, count attempts or overwrite saved progress', () => {
  storage.clear(); const p=loadProfile(), c={track:'coast',car:'apex',mode:'circuit',difficulty:'normal',seed:7,laps:1,tuning:'balanced'};
  p.xp=879;saveProfile(p);const before=JSON.stringify(p),saved=storage.get('velocity-3d-profile-v1');
  for (const time of [0,180]) {
    const result=recordRace(p,{...createVehicle(),time},c,1,[],'idle-run:driver');
    assert.equal(result.skipped,true);assert.equal(JSON.stringify(p),before);assert.equal(storage.get('velocity-3d-profile-v1'),saved);
  }
  // A driver interrupted after covering real track distance retains participation credit.
  recordRace(p,{...createVehicle(),time:20,distance:200},c,2,[],'partial-run:driver');
  assert.equal(p.races,1);assert.equal(p.distance,200);assert.equal(p.wins,0);assert.equal(p.xp,929);assert.equal(p.history[0].complete,false);
});
test('profile persists settings, cosmetics, achievements and only replaces ghosts with a faster finish', () => {
  storage.clear(); const p = loadProfile(), c = { track: 'coast', car: 'apex', mode: 'time-trial', difficulty: 'normal', seed: 1, laps: 1, tuning: 'balanced' };
  p.settings.reducedFlashes = true; p.settings.bindings.throttle = 'KeyQ'; p.customization = { paint: '#112233', stripe: true, trail: 'ice' };
  const v = { ...createVehicle(), finished: true, time: 40, distance: 1200, nearMisses: 10 }; const ghost = [[0, 0, 0, 0, 0], [40, 1200, 0, 0, 0]];
  const result = recordRace(p, v, c, 1, ghost); assert.ok(result.best); assert.ok(result.saved);
  recordRace(p, { ...v, time: 50 }, c, 2, []); assert.deepEqual(p.ghosts[category(c)], ghost); assert.equal(p.bests[category(c)], 40);
  recordRace(p, { ...v, finished: false, time: 20 }, c, 4, []); assert.equal(p.bests[category(c)], 40);
  const loaded = loadProfile(); assert.equal(loaded.settings.reducedFlashes, true); assert.equal(loaded.settings.bindings.throttle, 'KeyQ'); assert.equal(loaded.customization.trail, 'ice'); assert.equal(loaded.wins, 1); assert.ok(loaded.achievements.includes('clean-racer')); assert.ok(loaded.achievements.includes('close-call'));
  const original = localStorage.setItem; localStorage.setItem = () => { throw Error('blocked'); }; assert.equal(saveProfile(p), false); localStorage.setItem = original;
});
test('touch, blur, gamepad and tracking loss never leave throttle stuck', async () => {
  const listeners = {}, buttons = Object.fromEntries(['throttle', 'left', 'nitro'].map(action => [action, { dataset: { drive: action }, handlers: {}, addEventListener(e, f) { this.handlers[e] = f; }, setPointerCapture() {} }]));
  globalThis.window = { addEventListener: (e, f) => { listeners[e] = f; } }; globalThis.document = { querySelectorAll: () => Object.values(buttons) };
  let pads = []; Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { getGamepads: () => pads } });
  const { DrivingInput } = await import('../public/src/input.js'); const input = new DrivingInput(loadProfile().settings);
  const event = { preventDefault() {}, pointerId: 1 }; buttons.throttle.handlers.pointerdown(event); assert.equal(input.read().throttle, 1); buttons.throttle.handlers.pointercancel(); assert.equal(input.read().throttle, 0);
  buttons.throttle.handlers.pointerdown(event); listeners.blur(); assert.equal(input.read().throttle, 0);
  pads = [{ connected: true, axes: [.65], buttons: Array.from({ length: 8 }, (_, i) => ({ value: i === 7 ? .7 : 0 })) }]; assert.equal(input.read().throttle, .7); assert.ok(Math.abs(input.read().steer-(.65-.12)/.88)<1e-9); pads = [];
  assert.equal(input.read({ active: true, state: { tracked: false } }).brake, 1);
  listeners.keydown({ code: 'KeyQ', target: { tagName: 'DIV' }, preventDefault() {} }); assert.equal(input.read().throttle, 1); listeners.keyup({ code: 'KeyQ' }); assert.equal(input.read().throttle, 0);
});

test('recovered online results cannot award progress twice; a rematch is a new run',()=>{
  storage.clear();let p=loadProfile();const c={track:'coast',car:'vector',mode:'circuit',difficulty:'normal',seed:1,laps:1,tuning:'balanced'};
  const v={...createVehicle('vector'),finished:true,time:40,distance:1200};
  assert.equal(recordRace(p,v,c,1,[],'run-one:driver').saved,true);const xp=p.xp;
  p=loadProfile();const result=recordRace(p,v,c,1,[],'run-one:driver');assert.equal(result.alreadyRecorded,true);assert.equal(p.xp,xp);assert.equal(p.races,1);assert.equal(p.wins,1);assert.equal(p.history.length,1);
  recordRace(p,v,c,1,[],'run-two:driver');assert.equal(p.races,2);assert.equal(p.xp,xp*2);
});

test('rebinding swaps duplicate keys, reserves navigation and cancels without driving', async () => {
  const listeners={};globalThis.window={addEventListener:(event,callback)=>{listeners[event]=callback;}};globalThis.document={querySelectorAll:()=>[]};
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{getGamepads:()=>[]}});
  const {DrivingInput}=await import('../public/src/input.js');const settings=loadProfile().settings,input=new DrivingInput(settings);
  const press=code=>listeners.keydown({code,target:{tagName:'BUTTON'},preventDefault(){},stopImmediatePropagation(){}});
  const previous=settings.bindings.throttle;let displaced,message;
  input.bind('throttle',(_code,other)=>{displaced=other;});press(settings.bindings.brake);
  assert.equal(displaced,'brake');assert.equal(settings.bindings.throttle,'Space');assert.equal(settings.bindings.brake,previous);assert.equal(input.read().throttle,0);
  input.bind('nitro',()=>{},text=>message=text);press('ArrowLeft');assert.equal(message,'Choose another key');assert.equal(input.rebind.action,'nitro');press('Tab');assert.equal(input.rebind.action,'nitro');
  const saved=settings.bindings.nitro;press('Escape');assert.equal(input.rebind,null);assert.equal(settings.bindings.nitro,saved);assert.equal(input.keys.size,0);
  input.bind('nitro',()=>{});input.cancelBind();assert.equal(input.rebind,null);assert.equal(settings.bindings.nitro,saved);
});

test('S can be remapped without triggering its legacy brake alias', async () => {
  const listeners={};globalThis.window={addEventListener:(event,callback)=>{listeners[event]=callback;}};globalThis.document={querySelectorAll:()=>[]};
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{getGamepads:()=>[]}});
  const {DrivingInput}=await import('../public/src/input.js');const settings=loadProfile().settings;settings.bindings.throttle='KeyS';const input=new DrivingInput(settings);
  listeners.keydown({code:'KeyS',target:{tagName:'DIV'},preventDefault(){}});
  assert.equal(input.read().throttle,1);assert.equal(input.read().brake,0);
});
