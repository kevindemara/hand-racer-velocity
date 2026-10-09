import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.matchMedia = () => ({matches:false});
const storage = new Map(), key = 'velocity-3d-profile-v1';
globalThis.localStorage = {getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)};
const {loadProfile,saveProfile,normalizeSettings,validGhost} = await import('../public/src/profile.js');

test('damaged profile fields recover independently and preserve original saved bytes',()=>{
  storage.clear();
  const ghost=[[0,0,0,0,0],[30,1200,1,.1,25]], raw=JSON.stringify({id:'existing-driver',name:'Kevin',xp:879,races:null,wins:'many',distance:2300,
    achievements:{bad:true},history:[null,{track:'coast',time:30,complete:true}],bests:{valid:30,bad:'fast'},ghosts:{valid:ghost,bad:[[1,'broken']]},
    settings:{sensitivity:99,volume:-2,quality:'ultra',camera:'yes',bindings:{throttle:'KeyQ',brake:'KeyQ',left:'ArrowRight',right:'Escape',nitro:'Tab'}},
    selection:{car:'nomad',track:'missing',mode:'missing',difficulty:'missing',laps:99,tuning:'missing'},customization:{paint:'red',wheels:'gold',stripe:true,trail:'ice'},futureField:{keep:true}});
  storage.set(key,raw);const p=loadProfile();
  assert.equal(p.id,'existing-driver');assert.equal(p.xp,879);assert.equal(p.distance,2300);assert.equal(p.races,0);assert.equal(p.wins,0);
  assert.deepEqual(p.achievements,[]);assert.equal(p.history.length,1);assert.deepEqual(p.bests,{valid:30});assert.deepEqual(p.ghosts.valid,ghost);assert.equal(p.ghosts.bad,undefined);
  assert.equal(p.settings.sensitivity,2.5);assert.equal(p.settings.volume,0);assert.equal(p.settings.quality,'medium');assert.equal(p.settings.camera,false);
  assert.equal(p.settings.bindings.throttle,'KeyQ');assert.equal(new Set(Object.values(p.settings.bindings)).size,6);
  assert.equal(p.selection.car,'nomad');assert.equal(p.selection.track,'coast');assert.equal(p.selection.laps,1);assert.equal(p.customization.trail,'ice');assert.deepEqual(p.futureField,{keep:true});
  assert.equal(storage.get(key),raw,'loading does not mutate storage');assert.ok(saveProfile(p));assert.equal(storage.get(`${key}-recovery`),raw);assert.equal(loadProfile().xp,879);
});

test('unparseable and non-object profiles recover without erasing an earlier recovery copy',()=>{
  for(const raw of ['{broken','null','[]','42']){
    storage.clear();storage.set(key,raw);const p=loadProfile();assert.equal(p.xp,0);assert.ok(saveProfile(p));assert.equal(storage.get(`${key}-recovery`),raw);
    storage.set(key,'{another broken profile');assert.ok(saveProfile(loadProfile()));assert.equal(storage.get(`${key}-recovery`),raw);
  }
});

test('a failed recovery backup never overwrites the original profile',()=>{
  storage.clear();storage.set(key,'{broken');const p=loadProfile(), original=localStorage.setItem;
  localStorage.setItem=()=>{throw Error('quota');};assert.equal(saveProfile(p),false);assert.equal(storage.get(key),'{broken');
  localStorage.setItem=original;assert.ok(saveProfile(p));assert.equal(storage.get(`${key}-recovery`),'{broken');
});

test('valid custom settings survive while ghosts reject nonfinite or reversed frames',()=>{
  const s=normalizeSettings({volume:.6,sensitivity:1.7,quality:'high',mirror:false,bindings:{throttle:'Space',brake:'KeyW',left:'KeyJ',right:'KeyL',nitro:'KeyN',drift:'KeyZ'}});
  assert.equal(s.bindings.throttle,'Space');assert.equal(s.bindings.brake,'KeyW');assert.equal(s.bindings.left,'KeyJ');assert.equal(s.mirror,false);
  assert.ok(validGhost([[0,0,0,0,0],[5,25,0,0,5],[5,25,0,0,0]]));
  for(const frames of [null,[],[[1,0,0,0,NaN]],[[2,30,0,0,5],[1,31,0,0,5]],[[1,30,0,0,5],[2,20,0,0,5]]])assert.equal(validGhost(frames),false);
});
