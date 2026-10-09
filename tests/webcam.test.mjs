import test from 'node:test';
import assert from 'node:assert/strict';
import { WebcamControls, cameraErrorMessage } from '../public/src/webcam.js';
globalThis.cancelAnimationFrame = () => {};
const setup = onState => {
  const video = { srcObject: null, play: async () => {}, cancelVideoFrameCallback() {} };
  const canvas = { width: 320, height: 240, getContext: () => ({ clearRect() {} }) }, status = {};
  return { controls: new WebcamControls(video, canvas, status, onState), video, status };
};
const navigatorMock = value => Object.defineProperty(globalThis, 'navigator', { configurable: true, value });
test('camera denial releases the controller and reports keyboard fallback', async () => {
  navigatorMock({ mediaDevices: { getUserMedia: async () => { throw Error('NotAllowedError'); } } });
  let state; const { controls, video, status } = setup(s => state = s); await controls.start();
  assert.equal(controls.active, false); assert.equal(video.srcObject, null); assert.equal(state.unavailable, true); assert.match(status.textContent, /permissions/);
});
test('late permission resolution after leaving stops every webcam track', async () => {
  let resolve; navigatorMock({ mediaDevices: { getUserMedia: () => new Promise(r => resolve = r) } });
  let stopped = 0; const stream = { getTracks: () => [{ stop: () => stopped++ }, { stop: () => stopped++ }] };
  const { controls, video } = setup(() => {}); const pending = controls.start(); controls.stop(); resolve(stream); await pending;
  assert.equal(stopped, 2); assert.equal(video.srcObject, null); assert.equal(controls.active, false);
});
test('fresh video frames have at most one inference in flight and stop cleans the worker', async () => {
  let stopped = false, terminated = false, callback, now = 100, worker;
  navigatorMock({ mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{ stop: () => stopped = true }] }) } });
  globalThis.location = { origin: 'http://localhost:3000' }; globalThis.createImageBitmap = async () => ({ close() {} });
  const originalPerformance = globalThis.performance; globalThis.performance = { now: () => now };
  globalThis.Worker = class { constructor() { worker = this; this.frames = []; } postMessage(data) { if(data.type === 'frame') this.frames.push(data); } terminate() { terminated = true; } };
  const { controls, video } = setup(() => {}); video.currentTime = 1; video.videoWidth = 640; video.videoHeight = 480; video.requestVideoFrameCallback = f => { callback = f; return 1; };
  try {
    await controls.start(); worker.onmessage({ data: { type: 'ready' } });
    await callback(); assert.equal(worker.frames.length, 1); now = 200; video.currentTime = 2; await callback(); assert.equal(worker.frames.length, 1);
    worker.onmessage({ data: { type: 'result', result: { landmarks: [] }, timestamp: 100 } }); await callback(); assert.equal(worker.frames.length, 2);
    controls.stop(); assert.equal(stopped, true); assert.equal(terminated, true); assert.equal(video.srcObject, null);
  } finally { controls.stop(); globalThis.performance = originalPerformance; }
});
test('video-frame polling still captures a fresh frame when compositor callbacks stop', async () => {
  let worker, resolveFrame;
  const frame = new Promise(resolve => resolveFrame = resolve);
  navigatorMock({ mediaDevices:{ getUserMedia:async () => ({getTracks:()=>[{stop(){}}]}) } });
  globalThis.location = {origin:'http://localhost:3000'}; globalThis.createImageBitmap = async () => ({close(){}});
  globalThis.Worker = class { constructor(){worker=this;} postMessage(data){if(data.type==='frame')resolveFrame(data);} terminate(){} };
  const {controls,video} = setup(() => {}); video.currentTime = 1; video.requestVideoFrameCallback = () => 1;
  let deadline;
  try {
    await controls.start(); worker.onmessage({data:{type:'ready'}});
    const captured = await Promise.race([frame,new Promise((_,reject)=>deadline=setTimeout(()=>reject(Error('no frame captured')),1000))]);
    assert.equal(captured.type,'frame'); assert.equal(controls.busy,true);
  } finally {clearTimeout(deadline);controls.stop();}
});

test('startup timeout releases late permission streams and reports an actionable reason', async () => {
  let resolve, timeout;
  navigatorMock({mediaDevices:{getUserMedia:()=>new Promise(r=>resolve=r)}});
  const originalSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = callback => {timeout=callback;return 0;};
  let state, stopped=0; const {controls,status,video}=setup(s=>state=s);
  try {
    const pending=controls.start(); timeout();
    assert.equal(controls.active,false); assert.equal(state.unavailable,true); assert.match(status.textContent,/permission prompt/);
    resolve({getTracks:()=>[{stop(){stopped++;}}]}); await pending;
    assert.equal(stopped,1); assert.equal(video.srcObject,null);
  } finally {globalThis.setTimeout=originalSetTimeout;controls.stop();}
});

test('camera unplugging releases its worker and stale input; recalibration neutralizes acceleration', async () => {
  let ended, removed=false, terminated=false, stopped=false;
  const track={addEventListener(_event,callback){ended=callback;},removeEventListener(){removed=true;},stop(){stopped=true;}};
  navigatorMock({mediaDevices:{getUserMedia:async()=>({getTracks:()=>[track],getVideoTracks:()=>[track]})}});
  globalThis.location={origin:'http://localhost:3000'};
  globalThis.Worker=class{postMessage(){}terminate(){terminated=true;}};
  let state; const {controls,status}=setup(s=>state=s);
  try {
    await controls.start(); controls.state={tracked:true,calibrated:true,throttle:1,steer:.8}; controls.calibrate();
    assert.equal(state.throttle,0); assert.equal(state.steer,0); assert.equal(state.brake,1); assert.equal(state.calibrated,false);
    ended(); assert.equal(controls.active,false); assert.equal(terminated,true); assert.equal(removed,true); assert.equal(stopped,true); assert.equal(state.unavailable,true);
    assert.match(status.textContent,/disconnected/);
  } finally {controls.stop();}
});

test('repeated bitmap capture failures stop tracking instead of silently looping', async () => {
  let worker, callback, now=100, state;
  navigatorMock({mediaDevices:{getUserMedia:async()=>({getTracks:()=>[{stop(){}}]})}});
  globalThis.location={origin:'http://localhost:3000'}; globalThis.createImageBitmap=async()=>{throw Error('capture failed');};
  globalThis.Worker=class{constructor(){worker=this;}postMessage(){}terminate(){}};
  const originalPerformance=globalThis.performance; globalThis.performance={now:()=>now};
  const {controls,video,status}=setup(s=>state=s); video.requestVideoFrameCallback=f=>{callback=f;return 1;};
  try {
    await controls.start(); worker.onmessage({data:{type:'ready'}});
    for(let i=0;i<3;i++){video.currentTime=i+1;now+=100;await callback();}
    assert.equal(controls.active,false); assert.equal(state.unavailable,true); assert.match(status.textContent,/frames could not be read/);
  } finally {controls.stop();globalThis.performance=originalPerformance;}
});

test('camera errors distinguish permission, missing device and device contention', () => {
  assert.match(cameraErrorMessage({name:'NotAllowedError'}),/Allow camera access/);
  assert.match(cameraErrorMessage({name:'NotFoundError'}),/No camera/);
  assert.match(cameraErrorMessage({name:'NotReadableError'}),/other apps/);
});

test('current-hand fallback uses a fresh detected hand and emits neutral calibrated controls',()=>{
  let state;const {controls}=setup(s=>state=s),now=performance.now();
  const points=Array.from({length:21},(_,i)=>({x:i===5?.6:.5,y:.5}));
  controls.active=true;controls.state=controls.filter.update({landmarks:[points],gestures:[[]],handedness:[[{categoryName:'Right'}]]},now);
  assert.equal(controls.useCurrentHand(),true);assert.equal(state.calibrated,true);assert.equal(state.throttle,0);assert.equal(state.steer,0);assert.equal(state.brake,0);assert.equal(state.progress,1);
  controls.filter.lastSeen=now-1000;assert.equal(controls.useCurrentHand(),false);controls.stop();assert.equal(controls.useCurrentHand(),false);
});
