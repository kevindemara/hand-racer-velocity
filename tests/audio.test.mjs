import test from 'node:test';
import assert from 'node:assert/strict';
import { RacingAudio } from '../public/src/audio.js';

class Parameter {
  value=0;
  setTargetAtTime(value){this.value=value;}
  setValueAtTime(value){this.value=value;}
  exponentialRampToValueAtTime(value){this.value=value;}
}
class Node {
  gain=new Parameter();frequency=new Parameter();Q=new Parameter();
  connect(){}start(){this.started=true;}stop(){this.stopped=true;}disconnect(){this.disconnected=true;}
}
class Context {
  state='running';sampleRate=100;currentTime=0;destination={};nodes=[];resumes=0;closes=0;
  node(){const node=new Node();this.nodes.push(node);return node;}
  createGain(){return this.node();}createOscillator(){return this.node();}createBiquadFilter(){return this.node();}createBufferSource(){return this.node();}
  createBuffer(){return {getChannelData:()=>new Float32Array(200)};}
  resume(){this.resumes++;this.state='running';return Promise.resolve();}
  close(){this.closes++;this.state='closed';return Promise.resolve();}
}

test('unavailable audio and construction failure leave driving calls usable and a later start can retry',()=>{
  const missing=new RacingAudio(null);assert.equal(missing.start(),false);
  assert.doesNotThrow(()=>{missing.update({speed:20});missing.effect('collision');missing.dispose();});
  let fail=true;
  class Unavailable extends Context {constructor(){super();if(fail)throw Error('device unavailable');}}
  const audio=new RacingAudio(Unavailable);assert.equal(audio.start(),false);assert.equal(audio.context,null);
  fail=false;assert.equal(audio.start(),true);audio.update({speed:20,heading:0},{throttle:1});assert.ok(audio.master.gain.value>0);audio.dispose();
});

test('audio graph failures release partial resources instead of escaping into the race',()=>{
  let created;
  class Broken extends Context {constructor(){super();created=this;}createBuffer(){throw Error('allocation failed');}}
  const audio=new RacingAudio(Broken);assert.equal(audio.start(),false);assert.equal(audio.context,null);
  assert.equal(created.closes,1);assert.ok(created.nodes.every(n=>n.disconnected));assert.equal(created.nodes.filter(n=>n.started).every(n=>n.stopped),true);
  assert.doesNotThrow(()=>{audio.update({speed:20});audio.effect('go');});
});

test('rejected resume is handled and a stale failure cannot close a newly created audio context',async()=>{
  let reject;
  class Blocked extends Context {resume(){return new Promise((_resolve,r)=>{reject=r;});}}
  const audio=new RacingAudio(Blocked);assert.equal(audio.start(),true);const first=audio.context;
  reject(Error('blocked'));await Promise.resolve();assert.equal(audio.context,null);assert.equal(first.closes,1);
  audio.start();const stale=audio.context,lateReject=reject;audio.dispose();audio.Context=Context;audio.start();const current=audio.context;
  lateReject(Error('late block'));await Promise.resolve();assert.equal(audio.context,current);assert.equal(current.closes,0);assert.equal(stale.closes,1);audio.dispose();
});

test('pause silence, Resume and repeated starts reuse one graph; closed contexts can recover',()=>{
  const audio=new RacingAudio(Context);audio.start();const context=audio.context,nodes=context.nodes.length;
  audio.update({speed:30,heading:.4},{throttle:1,drift:true});assert.ok(audio.master.gain.value>0);assert.ok(audio.tireGain.gain.value>0);
  audio.update(null);assert.equal(audio.master.gain.value,0);assert.equal(audio.tireGain.gain.value,0);
  context.state='suspended';audio.effect('go');assert.equal(context.nodes.length,nodes,'no delayed effects queued while suspended');
  audio.start();assert.equal(context.resumes,2);assert.equal(context.nodes.length,nodes);assert.equal(audio.master.gain.value,0);
  context.state='closed';audio.start();assert.notEqual(audio.context,context);assert.ok(context.nodes.every(n=>n.disconnected));audio.dispose();
});

test('finished effects and page departure release every source/node, even when a device closes unexpectedly',()=>{
  const audio=new RacingAudio(Context);audio.start();const context=audio.context;
  audio.effect('finish');const effect=context.nodes.at(-2),gain=context.nodes.at(-1);effect.onended();
  assert.equal(effect.disconnected,true);assert.equal(gain.disconnected,true);assert.equal(audio.nodes.has(effect),false);
  audio.effect('collision');audio.dispose();audio.dispose();assert.equal(context.closes,1);assert.ok(context.nodes.every(n=>n.disconnected));assert.ok(context.nodes.filter(n=>n.started).every(n=>n.stopped));
  audio.start();const fresh=audio.context;audio.master.gain.setTargetAtTime=()=>{throw Error('lost device');};
  assert.doesNotThrow(()=>audio.update({speed:30}));assert.equal(audio.context,null);assert.equal(fresh.closes,1);
});
