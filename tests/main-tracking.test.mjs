import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import * as racing from '../shared/racing.js';
import * as modes from '../shared/modes.js';
import * as feedback from '../public/src/race-feedback.js';
import * as garage from '../public/src/garage-performance.js';
import { personalRecords, recordContext } from '../public/src/local-records.js';

function app({ solo = false, invite = false } = {}) {
  class Element {
    constructor(id = '') { this.id = id; this.children = []; this.style = { setProperty() {} }; this.classList = { toggle() {} }; this.value = ''; this.type = ''; this.dataset = {}; }
    append(...nodes) { this.appendCalls=(this.appendCalls||0)+1;for (const node of nodes) { node.parentElement?.children.splice(node.parentElement.children.indexOf(node), 1); this.children.push(node); node.parentElement = this; } }
    insertBefore(node, before) { this.append(node); this.children.pop(); this.children.splice(Math.max(0,this.children.indexOf(before)),0,node); }
    replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
    get lastChild() { return this.children.at(-1); }
    setAttribute() {}
    addEventListener() {}
    showModal() { this.open = true; }
    close() { this.open = false; }
  }
  let html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  if (solo) html = html.replace(/<!-- full-only:start -->[\s\S]*?<!-- full-only:end -->/g, '');
  const elements = Object.fromEntries([...html.matchAll(/id="([^"]+)"/g)].map(m => [m[1], new Element(m[1])]));
  const body = new Element('body'); body.append(...Object.values(elements));
  Object.entries({ 'track-select':'coast', 'mode-select':'circuit', difficulty:'normal', 'laps-select':'1', tuning:'balanced', 'wheel-style':'alloy', 'trail-style':'none', paint:'#f17c4a' }).forEach(([id,value]) => elements[id].value = value);
  for (const id of ['camera-enabled','menu-camera-enabled','mirror','assist','reduced-motion','reduced-flashes','high-contrast']) elements[id].type = 'checkbox';
  const settings = { camera:true, sensitivity:1, mirror:true, assist:true, quality:'medium', volume:.35, bindings:{} };
  const profile = { name:'Fixture', id:'fixture', xp:0, settings, ghosts:{}, bests:{} };
  const events = { document:{}, window:{} };
  class Webcam {
    constructor(_v,_c,_s,cb) { this.onState = cb; this.active = false; this.state = {}; this.stops = 0; }
    start() { this.starts=(this.starts||0)+1;this.active = true; this.state = { tracked:false, calibrated:false };this.onState(this.state); }
    stop() { this.active = false; this.stops++; }
    emit(state) { this.state = state; this.onState(state); }
    useCurrentHand() { if (!this.state.tracked || !this.state.points) return false; this.emit({...this.state,calibrated:true,progress:1,throttle:0,steer:0});return true; }
  }
  const sounds=[],particles=[];
  class Renderer { garage() {} quality() {} trackWorld() {} vehicle() {} render() {} pruneVehicles() {} emitParticles(_v,type){particles.push(type);} dispose(){this.disposes=(this.disposes||0)+1;} }
  const requests = [];
  const context = vm.createContext({ ...racing, ...modes, ...feedback, ...garage, personalRecords, recordContext, __VELOCITY_SOLO__:solo, console, performance, URL, URLSearchParams,
    document: { body, hidden:false, getElementById: id => elements[id], createElement: () => new Element(), querySelectorAll: () => [], querySelector: () => null, addEventListener(event,callback){events.document[event]=callback;} },
    window: { addEventListener(event,callback){events.window[event]=callback;} }, location:{href:'http://localhost:3000/'+(invite?'?room=ABCDEF':'')}, sessionStorage:{removeItem(){},getItem(){return null}},
    DrivingInput:class { constructor(){this.keys = new Set();} read(){return {throttle:0,brake:1,steer:0};} }, RacingRenderer:Renderer, WebcamControls:Webcam, RacingAudio:class {start(){this.starts=(this.starts||0)+1;}update(vehicle){(this.updates||=[]).push(vehicle);}effect(type){sounds.push(type);}dispose(){this.disposes=(this.disposes||0)+1;}},
    loadProfile:() => profile, saveProfile:() => true, cosmetics:[{id:'alloy',name:'Alloy',xp:0}], category:() => 'fixture',
    recordRace:()=>({saved:true}), requestAnimationFrame() {}, setTimeout:() => 1, clearTimeout() {}, fetch:async url => { requests.push(url); return {json:async () => ({token:'test'})}; }
  });
  const source = readFileSync(new URL('../public/src/main.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'');
  vm.runInContext(source+'\nglobalThis.app = { startSolo, resumeRace, pauseRace, webcam, controls, audio, settings, updateLobby, acceptSnapshot, frame(delta=1){loop(previous+delta);}, setLobby(details){race=newRace(config());race.multiplayer=true;network=details;socket={connected:true};}, get renderer(){return renderer;}, get race(){return race;} };',context);
  return { ...context.app, elements, body, sounds, particles, events, requests, profile, document:context.document, controller:context.app };
}

test('Solo app starts with online DOM removed, ignores old invite links, races AI, shows records and restarts without API calls', async () => {
  const a=app({solo:true,invite:true});a.settings.camera=false;
  assert.equal(a.elements['quick-match'],undefined);assert.equal(a.elements['room-code'],undefined);
  assert.equal(a.elements.loading.hidden,true);
  await a.startSolo();assert.equal(a.controller.race.bots.length,3);
  a.controller.race.state='racing';a.controller.frame(20);
  assert.ok(a.controller.race.bots.some(bot=>bot.speed>0));
  Object.assign(a.controller.race.vehicle,{distance:a.controller.race.track.length-.1,speed:50,time:20});a.controller.frame(20);
  assert.equal(a.elements['results-dialog'].open,true);
  await a.elements['nav-leaderboard'].onclick();assert.equal(a.elements['records-dialog'].open,true);
  a.elements['records-close'].onclick();await a.elements['race-again'].onclick();
  assert.equal(a.controller.race.state,'countdown');assert.deepEqual(a.requests,[]);
});

test('Full app still requests server challenges', async () => {
  const a=app();a.settings.camera=false;await a.startSolo();
  assert.equal(a.requests.length,1);assert.match(a.requests[0],/^\/api\/challenge\?/);
  assert.ok(a.elements['quick-match'].onclick);
});

test('online authoritative snapshots trigger player feedback once and suppress old rejoin or paused effects', () => {
  const a=app(), own={...racing.createVehicle(),id:'you',time:12,collisions:3,pickups:2,nearMisses:4};
  a.setLobby({id:'you',state:'waiting',players:[],displayed:new Map()});
  const snapshot=p=>({players:[p],state:'racing',now:100,startAt:0,runId:'run'});
  a.acceptSnapshot(snapshot(own));assert.deepEqual(a.sounds,[]);assert.deepEqual(a.particles,[]);
  const hit={...own,time:13,collisions:4};a.acceptSnapshot(snapshot(hit));a.acceptSnapshot(snapshot(hit));
  assert.deepEqual(a.sounds,['collision']);assert.deepEqual(a.particles,['collision']);assert.equal(a.controller.race.message,'Impact · keep your line');
  a.acceptSnapshot(snapshot({...hit,time:14,pickups:3}));assert.deepEqual(a.sounds,['collision','pickup']);assert.equal(a.controller.race.message,'Nitro replenished');
  a.controller.race.paused=true;a.acceptSnapshot(snapshot({...hit,time:15,pickups:3,collisions:5}));assert.deepEqual(a.sounds,['collision','pickup']);
  a.controller.race.paused=false;a.acceptSnapshot(snapshot({...hit,time:16,pickups:3,collisions:5}));assert.deepEqual(a.sounds,['collision','pickup']);
});
test('starting a webcam race preserves tracking through calibration, Resume and hand-loss recovery', async () => {
  const a = app(); await a.startSolo(); const baseline = a.webcam.stops;
  assert.equal(a.controller.race.paused,true); assert.equal(a.elements['camera-panel'].parentElement,a.elements['pause-dialog']);
  assert.equal(a.elements['calibration-feedback'].hidden,false);assert.equal(a.elements['calibration-progress'].value,0);
  a.resumeRace(); assert.equal(a.settings.camera,true); assert.equal(a.webcam.active,true); assert.equal(a.webcam.stops,baseline); assert.equal(a.controller.race.paused,true);
  a.webcam.emit({tracked:true,calibrated:true,steer:0}); assert.equal(a.controller.race.paused,false); assert.equal(a.elements['camera-panel'].parentElement,a.body); assert.equal(a.elements['camera-panel'].hidden,false);
  assert.equal(a.elements['calibration-feedback'].hidden,true);
  a.webcam.state = {tracked:false,calibrated:true}; a.pauseRace('tracking'); a.resumeRace(); assert.equal(a.webcam.stops,baseline); assert.equal(a.controller.race.paused,true);
  a.webcam.emit({tracked:true,calibrated:true,steer:.5}); assert.equal(a.controller.race.paused,false); assert.equal(a.settings.camera,true);
});
test('only an explicit Use keyboard action disables the camera while waiting', async () => {
  const a = app(); await a.startSolo(); a.elements['camera-off'].onclick();
  assert.equal(a.settings.camera,false); assert.equal(a.webcam.active,false); assert.equal(a.controller.race.paused,false); assert.equal(a.elements['camera-panel'].hidden,true); assert.equal(a.elements['camera-panel'].parentElement,a.body);
  assert.equal(a.elements['menu-camera-enabled'].checked,false); assert.equal(a.elements['race-camera'].textContent,'Enable webcam');
});

test('camera failure offers retry and retry returns the race to calibration safely', async () => {
  const a=app(); await a.startSolo(); a.webcam.active=false; a.webcam.emit({unavailable:true,tracked:false,calibrated:false});
  assert.equal(a.settings.camera,false); assert.equal(a.elements['camera-retry'].hidden,false); assert.equal(a.elements.recalibrate.hidden,true); assert.equal(a.controller.race.paused,true);
  assert.equal(a.elements.resume.disabled,false); assert.equal(a.elements['pause-title'].textContent,'Camera needs attention');
  a.elements['camera-retry'].onclick();
  assert.equal(a.settings.camera,true); assert.equal(a.webcam.active,true); assert.equal(a.elements['camera-retry'].hidden,true); assert.equal(a.elements.recalibrate.hidden,false);
  assert.equal(a.controller.race.paused,true); assert.equal(a.elements['camera-panel'].parentElement,a.elements['pause-dialog']);
  assert.equal(a.elements.resume.disabled,true); assert.equal(a.elements['pause-title'].textContent,'Get your hands ready');
});

test('restarting a solo run clears old progress while retaining camera calibration', async () => {
  const a=app(); await a.startSolo(); a.webcam.emit({tracked:true,calibrated:true,steer:0});
  const firstRace=a.controller.race; firstRace.vehicle.distance=500; firstRace.vehicle.collisions=2; firstRace.frames.push([1,0,0,0,0]); a.pauseRace();
  a.elements['pause-restart'].onclick();
  assert.notEqual(a.controller.race,firstRace); assert.equal(a.controller.race.vehicle.distance,0); assert.equal(a.controller.race.vehicle.collisions,0); assert.equal(a.controller.race.frames.length,0);
  assert.equal(a.controller.race.state,'countdown'); assert.equal(a.controller.race.paused,undefined); assert.equal(a.webcam.active,true); assert.equal(a.webcam.state.calibrated,true);
});

test('restart retains practice mode and cannot reset a multiplayer race', async () => {
  const a=app(); a.settings.camera=false; await a.startSolo(true); a.pauseRace(); a.elements['pause-restart'].onclick();
  assert.equal(a.controller.race.practice,true); assert.equal(a.controller.race.config.mode,'time-trial'); assert.equal(a.controller.race.bots.length,0);
  const online=a.controller.race; online.multiplayer=true; a.elements['pause-restart'].onclick(); assert.equal(a.controller.race,online);
});

test('visible-hand calibration fallback resumes the paused race without disabling the webcam',async()=>{
  const a=app();await a.startSolo();assert.equal(a.elements['calibrate-visible'].disabled,true);
  a.webcam.emit({tracked:true,calibrated:false,confidence:.605654,points:[{x:.5,y:.5}],gesture:'Hold an open palm level'});
  assert.equal(a.elements['calibrate-visible'].disabled,false);assert.equal(a.elements['calibrate-visible'].hidden,false);
  assert.match(a.elements['gesture-feedback'].textContent,/61% gesture confidence/);
  a.elements['calibrate-visible'].onclick();assert.equal(a.controller.race.paused,false);assert.equal(a.webcam.active,true);assert.equal(a.settings.camera,true);assert.equal(a.webcam.state.throttle,0);
  assert.equal(a.elements['calibrate-visible'].hidden,true);assert.equal(a.elements['camera-panel'].parentElement,a.body);
});

test('lobby updates preserve the live video node and stable roster until room data changes',()=>{
  const a=app(),details={private:true,state:'waiting',code:'ABC123',id:'host',hostId:'host',players:[{id:'host',name:'Host',carId:'vector',online:true,ready:false}]};
  a.controller.setLobby(details);a.controller.updateLobby();assert.equal(a.elements['camera-panel'].parentElement,a.elements['lobby-camera']);
  const moves=a.elements['lobby-camera'].appendCalls,rows=a.elements['lobby-drivers'].children;
  for(let i=0;i<10;i++)a.controller.updateLobby();assert.equal(a.elements['lobby-camera'].appendCalls,moves);assert.equal(a.elements['lobby-drivers'].children,rows);
  assert.equal(a.elements['lobby-start'].disabled,true);assert.equal(a.elements['lobby-start'].hidden,false);
  details.players.push({id:'guest',name:'Guest',carId:'apex',online:true,ready:true});details.players[0].ready=true;a.controller.updateLobby();assert.notEqual(a.elements['lobby-drivers'].children,rows);assert.equal(a.elements['lobby-start'].disabled,false);
  details.state='countdown';a.controller.updateLobby();assert.equal(a.elements['race-lobby'].hidden,true);assert.equal(a.elements['camera-panel'].parentElement,a.body);
});

test('background solo clears held controls and waits for explicit resume without advancing progress', async () => {
  const a=app();a.settings.camera=false;await a.startSolo(true);
  a.controller.race.state='racing';Object.assign(a.controller.race.vehicle,{distance:200,time:12});
  a.controls.keys.add('KeyW');a.controls.touch={throttle:true};
  a.document.hidden=true;a.events.document.visibilitychange();
  assert.equal(a.controller.race.paused,true);assert.equal(a.controller.race.pauseReason,'background');
  assert.equal(a.controls.keys.size,0);assert.deepEqual({...a.controls.touch},{});assert.match(a.elements['pause-copy'].textContent,/while you are away/);
  a.document.hidden=false;a.events.document.visibilitychange();assert.equal(a.controller.race.paused,true);
  a.resumeRace();assert.equal(a.controller.race.paused,false);assert.equal(a.controller.race.vehicle.distance,200);assert.equal(a.controller.race.vehicle.time,12);
});

test('background online racing enters brake hold while waiting lobbies and finished runs stay usable', () => {
  const a=app();a.settings.camera=false;
  const room={id:'you',state:'waiting',players:[]};a.controller.setLobby(room);a.document.hidden=true;a.events.document.visibilitychange();
  assert.equal(a.controller.race.paused,undefined);assert.equal(a.elements['pause-dialog'].open,undefined);
  room.state='racing';a.controller.race.state='racing';a.events.document.visibilitychange();
  assert.equal(a.controller.race.paused,true);assert.equal(a.controller.race.pauseReason,'background');
  assert.equal(a.elements['pause-title'].textContent,'Brake hold');assert.match(a.elements['pause-copy'].textContent,/online race keeps running/i);
  a.resumeRace();assert.equal(a.controller.race.paused,false);
  room.state='finished';a.controller.race.state='finished';a.events.document.visibilitychange();assert.equal(a.controller.race.paused,false);
});

test('cached page return restores fresh webcam setup on Resume without losing the run or disabling camera controls', async () => {
  const a=app();await a.startSolo();a.webcam.emit({tracked:true,calibrated:true,steer:0});
  a.controller.race.state='racing';Object.assign(a.controller.race.vehicle,{distance:240,time:15});
  const run=a.controller.race,starts=a.webcam.starts;
  a.events.window.pagehide({persisted:true});
  assert.equal(a.webcam.active,false);assert.equal(a.settings.camera,true);assert.equal(run.paused,true);
  assert.equal(a.controller.renderer.disposes,undefined,'cached renderer is retained');
  assert.equal(a.audio.disposes,undefined,'cached sound context is retained');
  a.resumeRace();assert.equal(a.webcam.starts,starts+1);assert.equal(a.webcam.active,true);
  assert.equal(run.paused,true);assert.equal(run.pauseReason,'tracking');assert.equal(a.elements.resume.disabled,true);
  assert.equal(a.elements['camera-panel'].parentElement,a.elements['pause-dialog']);
  a.webcam.emit({tracked:true,calibrated:true,steer:0});
  assert.equal(a.controller.race,run);assert.equal(run.paused,false);assert.equal(run.vehicle.distance,240);assert.equal(run.vehicle.time,15);
  assert.equal(a.settings.camera,true);
  assert.equal(a.audio.starts,3,'initial start, initial calibration and returned calibration retry sound');
});

test('hand updates do not resume an away pause; manual Resume waits for fresh tracking when needed', async () => {
  const a=app();await a.startSolo();a.webcam.emit({tracked:true,calibrated:true,steer:0});
  a.controller.race.state='racing';a.document.hidden=true;a.events.document.visibilitychange();
  a.webcam.emit({tracked:true,calibrated:true,steer:.4});assert.equal(a.controller.race.paused,true);
  a.webcam.emit({tracked:false,calibrated:true});a.document.hidden=false;a.resumeRace();
  assert.equal(a.controller.race.paused,true);assert.equal(a.controller.race.pauseReason,'tracking');
  assert.equal(a.elements.resume.disabled,true);assert.equal(a.elements['camera-panel'].parentElement,a.elements['pause-dialog']);
  a.webcam.emit({tracked:true,calibrated:true,steer:0});assert.equal(a.controller.race.paused,false);
  a.pauseRace();a.webcam.emit({tracked:false,calibrated:false});a.resumeRace();
  assert.equal(a.controller.race.paused,true);assert.equal(a.controller.race.pauseReason,'tracking');
});

test('leaving a page releases webcam/graphics while a cached page retains graphics for return', async () => {
  const a=app();a.settings.camera=false;await a.startSolo(true);a.controller.race.state='racing';
  a.events.window.pagehide({persisted:false});
  assert.equal(a.controller.race.paused,true);assert.equal(a.webcam.active,false);assert.equal(a.controller.renderer.disposes,1);
  assert.equal(a.audio.disposes,1);
});

test('calibration completed in a hidden tab waits for explicit visible Resume', async () => {
  const a=app();await a.startSolo();a.document.hidden=true;a.events.document.visibilitychange();
  a.webcam.emit({tracked:true,calibrated:true,steer:0});
  assert.equal(a.controller.race.paused,true);assert.equal(a.controller.race.pauseReason,'background');
  assert.equal(a.elements.resume.disabled,false);
  a.document.hidden=false;a.events.document.visibilitychange();assert.equal(a.controller.race.paused,true);
  a.resumeRace();assert.equal(a.controller.race.paused,false);assert.equal(a.settings.camera,true);
});

test('live frames cannot replace an away or manual pause with automatic hand-loss recovery',async()=>{
  const a=app();await a.startSolo();a.webcam.emit({tracked:true,calibrated:true,steer:0});a.controller.race.state='racing';
  a.document.hidden=true;a.events.document.visibilitychange();a.webcam.emit({tracked:false,calibrated:true});
  a.controller.frame();assert.equal(a.controller.race.pauseReason,'background');
  a.document.hidden=false;a.controller.frame();a.webcam.emit({tracked:true,calibrated:true,steer:0});
  assert.equal(a.controller.race.paused,true);assert.equal(a.controller.race.pauseReason,'background');
  a.resumeRace();a.pauseRace();a.webcam.emit({tracked:false,calibrated:true});a.controller.frame();
  assert.equal(a.controller.race.pauseReason,'manual');assert.equal(a.controller.race.paused,true);
});

test('the frame that completes a practice run cannot turn its engine sound back on over results',async()=>{
  const a=app();a.settings.camera=false;await a.startSolo(true);
  a.controller.race.state='racing';a.controller.race.countdown=0;
  Object.assign(a.controller.race.vehicle,{distance:a.controller.race.track.length-.1,speed:50,time:19.99});a.controller.frame(20);
  assert.equal(a.controller.race.state,'finished');assert.equal(a.elements['results-dialog'].open,true);
  assert.equal(a.audio.updates.at(-1),null);assert.ok(a.sounds.includes('finish'));
  const updates=a.audio.updates.length;a.controller.frame(20);assert.equal(a.audio.updates.length,updates);
});
