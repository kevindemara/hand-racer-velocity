import test from 'node:test';
import assert from 'node:assert/strict';
import { CARS, TRACKS, buildTrack, trackPoint, createVehicle, makeHazards, stepVehicle, botInput, normalizeInput, hash } from '../shared/racing.js';
import { GestureFilter, palmAngle } from '../shared/gestures.js';
import { PerspectiveCamera, Vector3 } from 'three';

test('positive steering moves right in the actual chase-camera view', () => {
  const track={length:1000,width:14,grip:1,points:[{x:0,y:0,z:0,distance:0},{x:0,y:0,z:1000,distance:1000}]};
  const camera=new PerspectiveCamera(54,16/9,.1,1400);camera.position.set(0,4.5,-9);camera.lookAt(0,1.2,10);camera.updateMatrixWorld();
  for(const steer of [-1,1]) {
    const v={...createVehicle(),speed:30};for(let i=0;i<20;i++)stepVehicle(v,{throttle:1,steer},1/60,track,{assist:false});
    const p=trackPoint(track,v.distance,v.lateral),projected=new Vector3(p.x,p.y,p.z).project(camera);
    assert.ok(projected.x*steer>0,`steer ${steer} should move to its corresponding screen side`);
  }
});

test('all garage cars and four courses are distinct; circuit seam is continuous', () => {
  assert.equal(new Set(CARS.map(c => c.shape)).size,CARS.length); assert.equal(new Set(CARS.map(c=>c.id)).size,CARS.length); assert.equal(TRACKS.length,4);
  for (const def of TRACKS) {
    const track = buildTrack(def.id,1), start = trackPoint(track,0), end = trackPoint(track,track.length - .001);
    assert.ok(track.length > 900); assert.ok(Math.hypot(start.x-end.x,start.z-end.z) < .01);
    assert.ok(track.points.every(p => p.y >= 1 - .0001));
  }
});
test('daily seed creates identical hazards for every participant', () => {
  const seed = hash('2026-10-09'); const a = buildTrack('city',seed), b = buildTrack('city',seed);
  assert.deepEqual(a,b); assert.deepEqual(makeHazards(a),makeHazards(b)); assert.notDeepEqual(makeHazards(a),makeHazards(buildTrack('city',seed+1)));
});
test('acceleration, brakes, nitro and rough surfaces affect driving', () => {
  const track = buildTrack(), v = createVehicle();
  for (let i=0;i<180;i++) stepVehicle(v,{...botInput(v,track),throttle:1},1/60,track);
  assert.ok(v.speed > 40); const speed = v.speed;
  for (let i=0;i<30;i++) stepVehicle(v,{brake:1},1/60,track);
  assert.ok(v.speed < speed); v.nitro=1; stepVehicle(v,{throttle:1,nitro:true},1/60,track); assert.ok(v.nitro < 1 && v.boost);
  v.lateral=20; v.speed=70; stepVehicle(v,{throttle:1},1/60,track,{assist:false}); assert.ok(v.speed < 50);
});
test('physics ignores submitted positions and nonfinite control values', () => {
  assert.deepEqual(normalizeInput({steer:Infinity,throttle:999,brake:NaN,distance:100000}),{steer:1,throttle:1,brake:0,nitro:false,drift:false});
  const v = createVehicle(); stepVehicle(v,{distance:100000,time:1,throttle:0},1/60,buildTrack()); assert.equal(v.distance,0); assert.equal(v.finished,false);
});
test('bots can complete every environment without getting stuck', () => {
  for (const definition of TRACKS) {
    const track = buildTrack(definition.id), v = createVehicle('nova'), hazards = makeHazards(track,'easy');
    for (let i=0;i<18000 && !v.finished;i++) stepVehicle(v,botInput(v,track,'easy',0,hazards),1/60,track,{difficulty:'easy',hazards});
    assert.ok(v.finished,definition.id); assert.equal(v.laps.length,1); assert.equal(v.checkpoint,8);
  }
});
test('hazards repeat every lap; replaying inputs produces identical verified finish', () => {
  const track=buildTrack('coast'), hazards=makeHazards(track), original=createVehicle('nova'), replay=createVehicle('nova'), frames=[];
  for (let i=0;i<18000 && !original.finished;i++) {
    const input=botInput(original,track,'normal',0,hazards); frames.push(input); stepVehicle(original,input,1/60,track,{hazards,laps:3});
  }
  for (const input of frames) stepVehicle(replay,input,1/60,track,{hazards,laps:3});
  assert.ok(replay.finished); assert.deepEqual(replay,original); assert.equal(replay.laps.length,3); assert.equal(replay.checkpoint,24);
});
test('nitro duration depends on elapsed time rather than frame rate', () => {
  const track=buildTrack(), a=createVehicle(), b=createVehicle();
  for(let i=0;i<120;i++) stepVehicle(a,{throttle:1,nitro:true},1/60,track);
  for(let i=0;i<60;i++) stepVehicle(b,{throttle:1,nitro:true},1/30,track);
  assert.ok(Math.abs(a.nitro-b.nitro)<.00001); assert.ok(Math.abs(a.boosts-b.boosts)<.00001);
});
function hand(angle=0,scale=1) {
  const points=Array.from({length:21},()=>({x:.5,y:.5,z:0}));
  points[5]={x:.5+Math.cos(angle)*.1*scale,y:.5+Math.sin(angle)*.1*scale}; points[17]={x:.5-Math.cos(angle)*.1*scale,y:.5-Math.sin(angle)*.1*scale};
  return points;
}
const detection=(angle=0,gesture='Open_Palm',score=.95)=>({landmarks:[hand(angle)],gestures:[[{categoryName:gesture,score}]],handedness:[[{categoryName:'Right',score:.99}]]});
function calibratedFilter() { const filter=new GestureFilter(); for(let i=0;i<24;i++) filter.update(detection(),40*(i+1)); return filter; }
test('palm orientation is independent of camera distance', () => {
  assert.ok(Math.abs(palmAngle(hand(.3,.6))-palmAngle(hand(.3,1.5)))<.00001);
});
test('calibration requires a stable confident open palm before driving', () => {
  const filter=new GestureFilter(); for(let i=0;i<30;i++) filter.update(detection(0,'Closed_Fist'),40*(i+1)); assert.equal(filter.neutral,null);
  for(let i=0;i<24;i++) filter.update(detection(.25),1300+40*i); assert.ok(Math.abs(filter.neutral-.25)<.00001);
});
test('gesture hysteresis rejects low-confidence flicker, then releases on tracking loss', () => {
  const filter=calibratedFilter(); filter.update(detection(0,'Closed_Fist'),1000); const accepted=filter.update(detection(0,'Closed_Fist'),1120); assert.equal(accepted.throttle,1);
  const noise=filter.update(detection(0,'Open_Palm',.6),1160); assert.equal(noise.throttle,1);
  const lost=filter.update({landmarks:[]},1600); assert.equal(lost.tracked,false); assert.equal(lost.throttle,0); assert.equal(lost.steer,0);
});
test('steering is smoothed and mirror direction is configurable', () => {
  const a=calibratedFilter(), b=calibratedFilter(); let right,left;
  for(let i=0;i<10;i++) { right=a.update(detection(.3,'Closed_Fist'),1000+i*40); left=b.update(detection(.3,'Closed_Fist'),1000+i*40,{mirror:false}); }
  assert.ok(right.steer>.4 && right.steer<.6); assert.ok(left.steer<-.4);
});
