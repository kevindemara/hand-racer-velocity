import test from 'node:test';
import assert from 'node:assert/strict';
import {buildTrack,createVehicle,stepVehicle,botInput,makeHazards} from '../shared/racing.js';
import {compactGhost,ghostTolerance} from '../public/src/ghost-recording.js';
import {ghostDelta} from '../public/src/race-feedback.js';
globalThis.matchMedia=()=>({matches:false});
const storage=new Map(),key='velocity-3d-profile-v1';
globalThis.localStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)};
const {loadProfile,recordRace,category}=await import('../public/src/profile.js');

test('endurance recordings retain their finish beyond the old 20,000-sample cutoff',()=>{
  const frames=Array.from({length:25001},(_,i)=>[i*.1,i*4,0,0,40]),before=JSON.stringify(frames),compact=compactGhost(frames);
  assert.deepEqual(compact[0],frames[0]);assert.deepEqual(compact.at(-1),frames.at(-1));assert.ok(compact.length<250);
  assert.equal(JSON.stringify(frames),before,'input recording is never mutated');
  assert.ok(JSON.stringify(compact).length<before.length*.02);
});

test('compressed actual course replays stay within interpolation error limits',()=>{
  for(const id of ['coast','city','desert','alpine']){
    const track=buildTrack(id),vehicle=createVehicle(),hazards=makeHazards(track,'easy'),frames=[[0,0,0,0,0]];
    for(let i=0;i<60000&&!vehicle.finished;i++){
      stepVehicle(vehicle,botInput(vehicle,track,i/60,0,'easy',hazards),1/60,track,{difficulty:'easy',assist:true,hazards,laps:3});
      if(i%6===0)frames.push([vehicle.time,vehicle.distance,vehicle.lateral,vehicle.heading,vehicle.speed]);
    }
    assert.ok(vehicle.finished);frames.push([vehicle.time,vehicle.distance,vehicle.lateral,vehicle.heading,vehicle.speed]);
    const compact=compactGhost(frames);let cursor=0;
    for(const frame of frames){
      while(cursor+1<compact.length-1&&compact[cursor+1][0]<=frame[0])cursor++;
      const a=compact[cursor],b=compact[Math.min(cursor+1,compact.length-1)],t=b[0]===a[0]?0:(frame[0]-a[0])/(b[0]-a[0]);
      for(let field=1;field<5;field++)assert.ok(Math.abs(frame[field]-(a[field]+(b[field]-a[field])*t))<=ghostTolerance[field]+[0,.045,.002,.001,.015][field],`${id}: field ${field} exceeds error budget`);
    }
    assert.ok(JSON.stringify(compact).length<JSON.stringify(frames).length*.65,`${id}: meaningful storage reduction`);
    assert.deepEqual(compact.at(-1),frames.at(-1));
  }
});

test('compression preserves first arrival and delayed departure through a stop',()=>{
  const frames=[[0,0,0,0,10],[1,10,0,0,0],[2,10,0,0,0],[3,10,0,0,0],[4,20,0,0,10]],compact=compactGhost(frames);
  assert.equal(ghostDelta(compact,1,10),0);assert.equal(ghostDelta(compact,3.5,15),0);
});

test('a new ghost quota failure preserves old replays while still saving progress',()=>{
  storage.clear();const p=loadProfile(),config={track:'coast',mode:'time-trial',difficulty:'normal',laps:1,seed:1,car:'apex',tuning:'balanced'},old=[[0,0,0,0,0],[40,1200,0,0,0]],other=[[0,0,0,0,0],[30,1300,0,0,0]];
  p.bests[category(config)]=40;p.ghosts[category(config)]=old;p.ghosts.other=other;
  const original=localStorage.setItem;
  localStorage.setItem=(k,value)=>{const saved=JSON.parse(value);if(saved.ghosts[category(config)]?.at(-1)?.[0]===35)throw Error('quota');storage.set(k,value);};
  const result=recordRace(p,{...createVehicle(),time:35,distance:1200,finished:true},config,1,[[0,0,0,0,0],[35,1200,0,0,0]]);
  localStorage.setItem=original;
  assert.equal(result.best,true);assert.equal(result.saved,true);assert.equal(result.ghostSaved,false);assert.equal(p.xp,250);
  assert.deepEqual(p.ghosts[category(config)],old);assert.deepEqual(p.ghosts.other,other);
  const saved=JSON.parse(storage.get(key));assert.equal(saved.bests[category(config)],35);assert.deepEqual(saved.ghosts.other,other);
});
