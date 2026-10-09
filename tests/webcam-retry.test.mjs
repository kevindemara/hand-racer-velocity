import test from 'node:test';
import assert from 'node:assert/strict';
import { WebcamControls } from '../public/src/webcam.js';

function fixture(){
  const workers=[],streams=[],states=[];
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{mediaDevices:{getUserMedia:async()=>{const track={stops:0,stop(){this.stops++;}},stream={getTracks:()=>[track]};streams.push({stream,track});return stream;}}}});
  globalThis.location={origin:'http://localhost:3000'};globalThis.cancelAnimationFrame=()=>{};
  globalThis.Worker=class{constructor(){workers.push(this);}postMessage(data){if(data.type==='frame'){this.frames=(this.frames||0)+1;if(this.rejectFrames)throw Error('transfer failed');}}terminate(){this.terminated=true;}};
  const video={play:async()=>{},srcObject:null,currentTime:1,videoWidth:640,videoHeight:480,cancelVideoFrameCallback(){},requestVideoFrameCallback(callback){this.callback=callback;return 1;}};
  const status={},canvas={width:320,height:240,getContext:()=>({clearRect(){}})},controls=new WebcamControls(video,canvas,status,state=>states.push(state));
  return {controls,video,status,workers,streams,states};
}

test('old worker errors/results cannot stop or recalibrate a newly started camera session',async()=>{
  const a=fixture();try{
    await a.controls.start();const old=a.workers[0];await a.controls.start();const current=a.workers[1];
    old.onerror();old.onmessage({data:{type:'error',message:'late failure'}});old.onmessage({data:{type:'result',result:{landmarks:[]},timestamp:100}});
    assert.equal(a.controls.active,true);assert.equal(a.controls.worker,current);assert.equal(current.terminated,undefined);assert.equal(a.streams[1].track.stops,0);
    assert.equal(a.states.some(state=>state.unavailable),false);assert.equal(a.status.textContent,'Loading gesture model…');
    current.onerror();assert.equal(a.controls.active,false);assert.equal(current.terminated,true);assert.equal(a.streams[1].track.stops,1);assert.equal(a.states.at(-1).unavailable,true);
  }finally{a.controls.stop();}
});

test('failed frame transfers close owned bitmaps and recover through the existing retry limit',async()=>{
  const a=fixture(),originalPerformance=globalThis.performance;let now=100,closed=0;
  globalThis.performance={now:()=>now};globalThis.createImageBitmap=async()=>({close(){closed++;}});
  try{
    await a.controls.start();a.workers[0].rejectFrames=true;a.workers[0].onmessage({data:{type:'ready'}});
    for(let i=0;i<3;i++){now+=100;a.video.currentTime++;await a.video.callback();}
    assert.equal(closed,3);assert.equal(a.controls.active,false);assert.equal(a.states.at(-1).unavailable,true);assert.equal(a.streams[0].track.stops,1);
  }finally{a.controls.stop();globalThis.performance=originalPerformance;}
});

test('a capture rejected after restart cannot release the new session’s in-flight frame or watchdog',async()=>{
  const a=fixture(),originalPerformance=globalThis.performance,originalClearTimeout=globalThis.clearTimeout,cleared=new Set();let now=100,rejectOld,captures=0;
  globalThis.performance={now:()=>now};globalThis.createImageBitmap=()=>{captures++;return captures===1?new Promise((_resolve,reject)=>{rejectOld=reject;}):Promise.resolve({close(){}});};
  globalThis.clearTimeout=handle=>{cleared.add(handle);return originalClearTimeout(handle);};
  try{
    await a.controls.start();a.workers[0].onmessage({data:{type:'ready'}});const oldCapture=a.video.callback();
    await a.controls.start();now=300;a.workers[1].onmessage({data:{type:'ready'}});await a.video.callback();
    const watchdog=a.controls.frameTimeout;assert.equal(a.controls.busy,true);assert.equal(a.workers[1].frames,1);
    rejectOld(Error('old capture failed'));await oldCapture;
    assert.equal(a.controls.active,true);assert.equal(a.controls.busy,true);assert.equal(a.controls.frameTimeout,watchdog);assert.equal(cleared.has(watchdog),false);
    assert.equal(a.controls.captureFailures,0);assert.equal(a.workers[1].terminated,undefined);assert.equal(a.streams[1].track.stops,0);
  }finally{a.controls.stop();globalThis.performance=originalPerformance;globalThis.clearTimeout=originalClearTimeout;}
});
