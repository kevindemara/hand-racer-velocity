import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTrack, createVehicle, formatTime } from '../shared/racing.js';
import { keyLabel, lapFeedback, cornerCue, ghostDelta, countdownCue, networkCountdown, snapshotEvents, drivingCondition, hazardCue } from '../public/src/race-feedback.js';

test('obstacle warnings choose the nearest threat on the driver’s line and describe actual screen sides', () => {
  const track=buildTrack(),v={...createVehicle(),distance:100,speed:40,lateral:0};
  const hazards=[{type:'oil',distance:170,lateral:2},{type:'barrier',distance:145,lateral:-1.2},{type:'boost',distance:110,lateral:0},{type:'barrier',distance:120,lateral:4}];
  const cue=hazardCue(v,track,hazards);
  assert.equal(cue.type,'barrier');assert.equal(cue.distance,45);assert.equal(cue.side,'right');assert.match(cue.label,/Barrier.*right.*45m/);
  v.lateral=2;assert.equal(hazardCue(v,track,hazards).side,'left');
  assert.equal(hazardCue({...v,lateral:2},track,[hazards[0]]).side,'your line');
  assert.equal(hazardCue({...v,lateral:10},track,hazards),null);
});

test('hazard look-ahead gives faster cars more notice and clears passed or finished-lap obstacles', () => {
  const track=buildTrack(),v={...createVehicle(),distance:100,speed:0};
  const hazard={type:'barrier',distance:190,lateral:0};
  assert.equal(hazardCue(v,track,[hazard]),null);
  v.speed=60;assert.equal(hazardCue(v,track,[hazard]).distance,90);
  v.distance=190;assert.equal(hazardCue(v,track,[hazard]),null);
  v.distance=track.length-20;
  const afterSeam={type:'oil',distance:25,lateral:0};
  assert.equal(hazardCue(v,track,[afterSeam],1),null);
  assert.ok(Math.abs(hazardCue(v,track,[afterSeam],2).distance-45)<1e-9);
  v.distance+=track.length;assert.equal(hazardCue(v,track,[afterSeam],2),null);
  v.finished=true;assert.equal(hazardCue(v,track,[afterSeam],3),null);
  v.finished=false;v.eliminated=true;assert.equal(hazardCue(v,track,[afterSeam],3),null);
});

test('online effects detect missed physics ticks once without replaying join, duplicate or reset counters', () => {
  const a={...createVehicle(),time:10}, b={...a,time:10.1,collisions:2,pickups:1,nearMisses:3,laps:[9]};
  assert.deepEqual(snapshotEvents(null,b),[]);assert.deepEqual(snapshotEvents(a,b),['collision','pickup','near-miss','lap']);
  assert.deepEqual(snapshotEvents(b,{...b,time:10.2}),[]);assert.deepEqual(snapshotEvents(b,createVehicle()),[]);
  assert.deepEqual(snapshotEvents(b,{...b,time:11,score:999}),[],'drift score is not a pickup');
  assert.deepEqual(snapshotEvents({...a,pickups:undefined},{...a,time:11,pickups:1}),['pickup']);
});

test('driving hints match fast-lane physics, rough ground and nitro through multiple laps', () => {
  const track=buildTrack(),v={...createVehicle(),distance:track.length*.42,lateral:-10,speed:40};
  assert.equal(drivingCondition(v,track),'Fast lane · extra pace');
  v.distance+=track.length*3;assert.equal(drivingCondition(v,track),'Fast lane · extra pace');
  v.boost=true;assert.equal(drivingCondition(v,track),'NITRO ACTIVE · fast lane');
  v.lateral=10;assert.equal(drivingCondition(v,track),'NITRO ACTIVE · off road');
  v.boost=false;assert.equal(drivingCondition(v,track),'Off road · grip reduced');
  v.distance=track.length*.6;v.lateral=-10;assert.equal(drivingCondition(v,track),'Off road · grip reduced');
  v.lateral=0;assert.match(drivingCondition(v,track),/Straight|Sweeping|Tight/);
  v.finished=true;assert.equal(drivingCondition(v,track),'Finish line');
});

test('lap feedback rolls over at the seam and retains the final completed split', () => {
  const track=buildTrack(),v=createVehicle(); v.distance=track.length*.99;v.time=60;v.checkpoint=7;
  assert.ok(lapFeedback(v,track).progress>.98); assert.ok(lapFeedback(v,track).gateDistance<track.length*.02);
  Object.assign(v,{distance:track.length*1.02,checkpoint:8,time:62,lastLapTime:61,laps:[61]});
  const next=lapFeedback(v,track); assert.ok(next.progress<.03); assert.equal(next.gate,1); assert.equal(next.current,1);assert.equal(next.best,61);
  Object.assign(v,{finished:true,time:118,lastLapTime:118,laps:[61,57]});
  const finished=lapFeedback(v,track);assert.equal(finished.progress,1);assert.equal(finished.current,57);assert.equal(finished.best,57);assert.equal(finished.gateDistance,0);
});

test('online countdown uses server-relative time and local elapsed time rather than client wall clock',()=>{
  for(const serverNow of [100000,1900000000000]) {
    const snapshot={now:serverNow,startAt:serverNow+3000,receivedAt:800};
    assert.equal(networkCountdown(snapshot,800),3);assert.equal(networkCountdown(snapshot,2050),1.75);assert.equal(networkCountdown(snapshot,5000),0);
    assert.equal(networkCountdown(snapshot,799),3);
  }
  assert.equal(networkCountdown({},1000),0);
});

test('ghost gap compares time at equal distance and chooses first arrival through a stopped segment', () => {
  const ghost=[[.5,5],[1,10],[2,10],[4,30]];
  assert.equal(ghostDelta(ghost,.2,2),0); assert.equal(ghostDelta(ghost,2,10),1); assert.equal(ghostDelta(ghost,2,20),-1);
  assert.equal(ghostDelta(ghost,3,20),0); assert.equal(ghostDelta(ghost,5,30),1); assert.equal(ghostDelta(ghost,6,31),null);
  assert.equal(ghostDelta([],0,0),null); assert.equal(ghostDelta([[1,NaN]],1,5),null);
});

test('corner cues follow signed geometry in both directions and cross the circuit seam', () => {
  const radius=200,length=2*Math.PI*radius;
  const track={length,points:Array.from({length:721},(_,i)=>({x:Math.sin(i/720*2*Math.PI)*radius,y:0,z:Math.cos(i/720*2*Math.PI)*radius,distance:i/720*length}))};
  assert.match(cornerCue(track,0,50),/left/); assert.match(cornerCue(track,track.length-10,50),/left/);
  const mirrored={...track,points:track.points.map(p=>({...p,x:-p.x}))}; assert.match(cornerCue(mirrored,0,50),/right/);
  const straight={length:1000,points:[{x:0,y:0,z:0,distance:0},{x:0,y:0,z:1000,distance:1000}]};assert.equal(cornerCue(straight,10,50),'↑ Straight ahead');
});

test('countdown cues play once per number, pause cleanly, and do not sound on a mid-race rejoin', () => {
  const race={state:'countdown',countdown:3};assert.equal(countdownCue(race),'countdown');assert.equal(countdownCue(race),null);
  race.countdown=2;race.paused=true;assert.equal(countdownCue(race),null);race.paused=false;assert.equal(countdownCue(race),'countdown');
  race.countdown=1;assert.equal(countdownCue(race),'countdown');race.state='racing';assert.equal(countdownCue(race),'go');assert.equal(countdownCue(race),null);
  assert.equal(countdownCue({state:'racing'}),null);assert.equal(countdownCue({state:'waiting'}),null);
});

test('time formatting carries rounded seconds into the next minute', () => {
  assert.equal(formatTime(59.999),'1:00.00');assert.equal(formatTime(119.999),'2:00.00');assert.equal(formatTime(61.234),'1:01.23');
  assert.equal(formatTime(-5),'0:00.00');assert.equal(formatTime(Infinity),'0:00.00');
});

test('key labels make remapped hints readable', () => {
  assert.equal(keyLabel('KeyQ'),'Q');assert.equal(keyLabel('ArrowUp'),'↑');assert.equal(keyLabel('ShiftRight'),'Right Shift');assert.equal(keyLabel('Numpad0'),'Num 0');
});
