import test from 'node:test';
import assert from 'node:assert/strict';
import { personalRecords, recordContext } from '../public/src/local-records.js';
import { buildTrack, createVehicle, stepVehicle, botInput, makeHazards } from '../shared/racing.js';
globalThis.matchMedia=()=>({matches:false});
const storage=new Map();
globalThis.localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)};
const {loadProfile,recordRace,category}=await import('../public/src/profile.js');
const config={track:'coast',mode:'time-trial',difficulty:'easy',laps:1,seed:1,car:'nova',tuning:'grip'};

test('Solo race simulation saves a complete ghost, best, XP and settings that survive reload into personal records',()=>{
  storage.clear();const profile=loadProfile(),track=buildTrack(config.track,config.seed),hazards=makeHazards(track,config.difficulty),v=createVehicle(config.car,config.tuning),ghost=[];
  profile.settings.quality='low';
  for(let i=0;i<18000&&!v.finished;i++){
    stepVehicle(v,botInput(v,track,config.difficulty,0,hazards),1/60,track,{difficulty:config.difficulty,assist:true,hazards,laps:1});
    if(i%6===0||v.finished)ghost.push([v.time,v.distance,v.lateral,v.heading,v.speed]);
  }
  assert.ok(v.finished);assert.equal(recordRace(profile,v,config,1,ghost).saved,true);
  const restored=loadProfile(),rows=personalRecords(restored,config);
  assert.equal(rows.length,1);assert.equal(rows[0].time,v.time);assert.match(rows[0].label,/Nova RS.*Corner grip/);assert.match(rows[0].value,/ghost saved/);
  assert.equal(restored.settings.quality,'low');assert.ok(restored.xp>0);assert.ok(restored.achievements.includes('first-finish'));
  assert.ok(restored.ghosts[category(config)].at(-1)[1]>=track.length);
  assert.match(recordContext(config),/Golden Coast.*Time trial.*Rookie/);
});

test('personal records isolate seed, course, event, difficulty and distance while comparing cars and setups',()=>{
  const profile={bests:{},ghosts:{}};
  for(const change of [{},{car:'apex',tuning:'speed'},{seed:2},{track:'city'},{mode:'circuit'},{difficulty:'hard'},{laps:3}])profile.bests[category({...config,...change})]=30;
  profile.bests[category({...config,car:'unknown'})]=1;profile.bests[category({...config,tuning:'bad'})]=2;
  const rows=personalRecords(profile,config);assert.equal(rows.length,2);
  assert.ok(rows.some(r=>r.label.includes('Apex GT')));assert.equal(personalRecords(profile,{...config,seed:77}).length,0);
});

test('blocked storage keeps Solo results playable and readable in this session',()=>{
  const previous=globalThis.localStorage;globalThis.localStorage={getItem(){throw Error('blocked');},setItem(){throw Error('quota');}};
  try{const p=loadProfile();const result=recordRace(p,{...createVehicle('nova'),finished:true,time:42,distance:2000},config,1,[]);
    assert.equal(result.saved,false);assert.equal(personalRecords(p,config)[0].time,42);
  }finally{globalThis.localStorage=previous;}
});
