import test from 'node:test';
import assert from 'node:assert/strict';
import { createVehicle, buildTrack, stepVehicle } from '../shared/racing.js';
import { GestureFilter, palmAngle } from '../shared/gestures.js';
test('pickup counters follow actual recurring boost-pad crossings rather than score changes', () => {
  const track=buildTrack(), v={...createVehicle(),speed:30,nitro:.2};
  const pad={type:'boost',distance:.1,lateral:0};
  assert.ok(stepVehicle(v,{throttle:1},1/60,track,{hazards:[pad],laps:3}).includes('pickup'));assert.equal(v.pickups,1);
  stepVehicle(v,{throttle:1},1/60,track,{hazards:[pad],laps:3});assert.equal(v.pickups,1);
  v.distance=track.length;v.speed=30;assert.ok(stepVehicle(v,{throttle:1},1/60,track,{hazards:[pad],laps:3}).includes('pickup'));assert.equal(v.pickups,2);
});
test('close passes increase combos, collisions reset them, and drifting earns points', () => {
  const track = buildTrack(), v = createVehicle(); v.speed = 30;
  const hazard = { type: 'barrier', distance: .1, lateral: 2.2 };
  assert.ok(stepVehicle(v, { throttle: 1 }, 1/60, track, { hazards: [hazard] }).includes('near-miss')); assert.equal(v.score, 75); assert.equal(v.combo, 1);
  hazard.distance = v.distance + .1;
  stepVehicle(v, { throttle: 1 }, 1/60, track, { hazards: [hazard] }); assert.equal(v.score, 225);
  hazard.distance = v.distance + .1; hazard.lateral = v.lateral;
  stepVehicle(v, { throttle: 1 }, 1/60, track, { hazards: [hazard] }); assert.equal(v.combo, 0); assert.equal(v.collisions, 1);
  v.speed = 35; v.heading = .3; const score = v.score;
  stepVehicle(v, { throttle: 1, drift: true }, 1/60, track); assert.ok(v.score > score);
});
const points = angle => Array.from({ length: 21 }, (_, i) => i === 5 ? { x: .5 + Math.cos(angle) * .1, y: .5 + Math.sin(angle) * .1 } : { x: .5, y: .5 });
const hand = (angle=0, side='Right') => ({ landmarks: [points(angle)], gestures: [[{ categoryName: 'Open_Palm', score: .9 }]], handedness: [[{ categoryName: side }]] });
test('calibrated hand identity cannot jump to a higher-confidence other hand', () => {
  const filter = new GestureFilter(); for (let i = 0; i < 24; i++) filter.update(hand(), i*40+1);
  const both = hand(.1); both.landmarks.push(points(-.5)); both.gestures.push([{ categoryName: 'Closed_Fist', score: .99 }]); both.handedness.push([{ categoryName: 'Left' }]);
  for (let i = 0; i < 10; i++) filter.update(both, 1000+i*40);
  assert.equal(filter.gesture, 'Open_Palm'); assert.ok(filter.angle > 0);
  assert.equal(filter.update(hand(0,'Left'),2000).tracked, false);
  filter.resetCalibration(); assert.equal(filter.controlSide, null);
});
test('palm tilt corrects rectangular video coordinates and moving calibration restarts', () => {
  const p = points(Math.PI/4); assert.ok(Math.abs(palmAngle(p,'Right',.75)-Math.atan(.75))<.0001);
  const filter = new GestureFilter(); for (let i=0;i<20;i++) filter.update(hand(),i*40+1);
  const state = filter.update(hand(.5),900); assert.equal(state.calibrated,false); assert.equal(filter.calibration.length,1);
});
test('an uncertain gesture keeps landmark steering alive and releases stale acceleration', () => {
  const filter = new GestureFilter(); for (let i = 0; i < 24; i++) filter.update(hand(),i*40+1);
  const fist = hand(); fist.gestures[0][0].categoryName = 'Closed_Fist'; filter.update(fist,1000); assert.equal(filter.update(fist,1120).throttle,1);
  const transition = hand(.3); transition.gestures = [[]]; filter.update(transition,1160);
  const state = filter.update(transition,1280); assert.equal(state.tracked,true); assert.equal(state.calibrated,true); assert.equal(state.throttle,0); assert.ok(state.steer > .1); assert.ok(state.points);
});

test('calibration guidance explains the actual blocker and completes without unsafe throttle',()=>{
  const filter=new GestureFilter(),closed=hand();closed.gestures[0][0].categoryName='Closed_Fist';
  let state=filter.update(closed,1);assert.match(state.hint,/Open your hand/);assert.equal(state.progress,0);assert.equal(state.throttle,0);
  const dim=hand();dim.gestures[0][0].score=.4;state=filter.update(dim,40);assert.match(state.hint,/Keep fingers visible/);assert.equal(state.progress,0);
  for(let i=0;i<15;i++)state=filter.update(hand(),80+i*40);assert.ok(state.progress>0&&state.progress<1);
  state=filter.update(hand(.5),700);assert.match(state.hint,/restarted/);assert.equal(state.progress,1/24);
  for(let i=0;i<24;i++)state=filter.update(hand(.5),740+i*40);assert.equal(state.calibrated,true);assert.equal(state.progress,1);assert.equal(state.throttle,0);
  state=filter.update({landmarks:[]},2400);assert.match(state.hint,/calibrated right hand/);assert.equal(state.tracked,false);assert.equal(state.throttle,0);
});

test('moderate open-palm scores calibrate and brief confidence dips retain progress',()=>{
  const filter=new GestureFilter(),visible=hand();visible.gestures[0][0].score=.605654;
  let state;
  for(let i=0;i<28;i++) {
    const result=structuredClone(visible);if(i===6||i===15)result.gestures[0][0].score=.48;
    state=filter.update(result,1+i*40);assert.equal(state.throttle,0);
  }
  assert.equal(state.calibrated,true);assert.equal(state.progress,1);
  state=filter.update(visible,1200);assert.equal(state.brake,1);assert.equal(state.throttle,0);
  const fist=structuredClone(visible);fist.gestures[0][0]={categoryName:'Closed_Fist',score:.95};
  assert.equal(filter.update(fist,1240).throttle,0);assert.equal(filter.update(fist,1360).throttle,1);
  const interrupted=new GestureFilter();for(let i=0;i<10;i++)interrupted.update(visible,1+i*40);
  const dim=structuredClone(visible);dim.gestures[0][0].score=.4;state=interrupted.update(dim,800);assert.equal(state.progress,0);
});

test('explicit hand capture sets a neutral position without throttle and rejects stale hands',()=>{
  const filter=new GestureFilter(),visible=hand(.3);visible.gestures=[[]];
  filter.update(visible,1000);assert.equal(filter.useVisibleHand(1001),true);assert.ok(Math.abs(filter.neutral-.3)<.00001);
  assert.equal(filter.controlSide,'Right');assert.equal(filter.gesture,'None');assert.equal(filter.update(visible,1040).throttle,0);
  filter.resetCalibration();assert.equal(filter.useVisibleHand(1050),false);
  filter.update(visible,1100);assert.equal(filter.useVisibleHand(1500),false);assert.equal(filter.neutral,null);
});
