import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rmSync } from 'node:fs';
import { io } from 'socket.io-client';
import { buildTrack, createVehicle, stepVehicle, makeHazards, botInput } from '../shared/racing.js';

test('server verifies replay records, rejects fabricated finishes, and recovers multiplayer', { timeout:30000 }, async () => {
  const reservation=net.createServer(); reservation.listen(0,'127.0.0.1'); await once(reservation,'listening'); const port=reservation.address().port; await new Promise(resolve=>reservation.close(resolve));
  const database = join(tmpdir(), `velocity-test-${randomUUID()}.sqlite`);
  let output = '';
  const start = () => { const child = spawn(globalThis.process.execPath,['server/server.js'],{cwd:new URL('..',import.meta.url),env:{...globalThis.process.env,PORT:String(port),RACING_DB:database,NODE_ENV:'production'},stdio:['ignore','pipe','pipe']}); child.stdout.on('data',d=>output+=d); child.stderr.on('data',d=>output+=d); return child; };
  let process = start();
  const base=`http://127.0.0.1:${port}`, clients=[];
  try {
    let ready=false;
    for(let i=0;i<100;i++) { try { ready=(await fetch(base+'/api/health')).ok;if(ready)break; } catch {} await new Promise(r=>setTimeout(r,50)); }
    assert.ok(ready,output);
    const diagnostics=await fetch(base+'/diagnostics.html');assert.equal(diagnostics.status,200);assert.match(await diagnostics.text(),/Test graphics cleanup/);
    const c={track:'coast',car:'vector',difficulty:'normal',laps:1,mode:'time-trial',tuning:'balanced'};
    const challenge=await (await fetch(base+'/api/challenge?'+new URLSearchParams(c))).json();
    const invalid=await fetch(base+'/api/records',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:challenge.token,name:'Test Driver',frames:Array.from({length:10},()=>[0,0,0,0,0])})});assert.equal(invalid.status,400);
    const track=buildTrack(c.track),v=createVehicle(c.car),hazards=makeHazards(track,c.difficulty),frames=[];
    for(let i=0;i<12000&&!v.finished;i++) {const input=botInput(v,track,c.difficulty,0,hazards);frames.push([input.throttle,input.brake,input.steer,+input.nitro,+input.drift]);stepVehicle(v,input,1/60,track,{hazards,laps:1,difficulty:c.difficulty});}
    assert.ok(v.finished);
    const record=await fetch(base+'/api/records',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:challenge.token,name:'Test Driver',frames})});assert.equal(record.status,200);assert.equal((await record.json()).time,v.time);
    const records=await (await fetch(base+'/api/leaderboard?'+new URLSearchParams(c))).json();assert.equal(records[0].name,'Test Driver');assert.equal(records[0].time,v.time);
    const replayAgain=await fetch(base+'/api/records',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:challenge.token,frames,name:'Duplicate'})});assert.equal(replayAgain.status,400);
    const stopped = once(process, 'exit'); process.kill(); await stopped; process = start();
    let persisted;
    for(let i=0;i<100;i++) { try { const response = await fetch(base+'/api/leaderboard?'+new URLSearchParams(c)); if(response.ok) { persisted = await response.json(); break; } } catch {} await new Promise(r=>setTimeout(r,50)); }
    assert.equal(persisted?.[0]?.name, 'Test Driver'); assert.equal(persisted[0].time, v.time);
    const a=io(base,{transports:['websocket'],reconnection:false});clients.push(a);await once(a,'connect');const joinedA=once(a,'race-joined');a.emit('join-race',{...c,private:true,name:'Alpha'});const [roomA]=await joinedA;
    const b=io(base,{transports:['websocket'],reconnection:false});clients.push(b);await once(b,'connect');const joinedB=once(b,'race-joined');b.emit('join-race',{...c,code:roomA.code,name:'Beta'});const [roomB]=await joinedB;assert.equal(roomA.code,roomB.code);
    a.emit('lobby-ready',true);b.emit('lobby-ready',true);
    const readyState=await new Promise(resolve=>{const handler=s=>{if(s.players.every(p=>p.ready)){a.off('race-state',handler);resolve(s);}};a.on('race-state',handler);});
    assert.equal(readyState.state,'waiting');assert.equal(readyState.hostId,roomA.id);a.emit('lobby-start');
    await new Promise(resolve=>setTimeout(resolve,3200));
    const stateEvent=once(a,'race-state');a.emit('race-input',{throttle:1,distance:999999,time:.01});a.emit('finish',{time:.01});const [state]=await stateEvent;assert.equal(state.state,'racing');assert.match(state.runId,/^[a-f0-9-]{36}$/);assert.equal(state.players.length,2);assert.ok(state.players.every(p=>p.carId==='vector'&&p.distance<20&&!p.finished));
    b.disconnect();const rejoin=io(base,{transports:['websocket'],reconnection:false});clients.push(rejoin);await once(rejoin,'connect');const resumed=once(rejoin,'race-joined');rejoin.emit('resume-race',{code:roomB.code,resume:roomB.resume});const [restored]=await resumed;assert.equal(restored.id,roomB.id);assert.equal(restored.state,'racing');assert.equal(restored.runId,state.runId);
    const leaveState=once(a,'race-state');rejoin.emit('leave-race');let [left]=await leaveState;
    if(left.state!=='abandoned') [left]=await once(a,'race-state');assert.equal(left.state,'abandoned');
  } finally { clients.forEach(client=>client.disconnect());process.kill();await Promise.race([once(process,'exit'),new Promise(resolve=>setTimeout(resolve,3000))]); for (const suffix of ['', '-wal', '-shm']) rmSync(database+suffix, { force:true }); }
});

test('private lobby holds four drivers, restricts host start and transfers hosting without abandoning', {timeout:20000}, async()=>{
  const reservation=net.createServer();reservation.listen(0,'127.0.0.1');await once(reservation,'listening');const port=reservation.address().port;await new Promise(resolve=>reservation.close(resolve));
  const database=join(tmpdir(),`velocity-lobby-${randomUUID()}.sqlite`),clients=[];
  const child=spawn(globalThis.process.execPath,['server/server.js'],{cwd:new URL('..',import.meta.url),env:{...globalThis.process.env,PORT:String(port),RACING_DB:database,NODE_ENV:'production'},stdio:'ignore'});
  const base=`http://127.0.0.1:${port}`;
  const waitState=(client,predicate,action)=>new Promise((resolve,reject)=>{
    const deadline=setTimeout(()=>{client.off('race-state',handler);reject(Error('Expected lobby state did not arrive'));},2500);
    const handler=state=>{if(predicate(state)){clearTimeout(deadline);client.off('race-state',handler);resolve(state);}};
    client.on('race-state',handler);action();
  });
  const connect=async()=>{const client=io(base,{transports:['websocket'],reconnection:false});clients.push(client);await once(client,'connect');return client;};
  try {
    let ready=false;for(let i=0;i<100;i++){try{ready=(await fetch(base+'/api/health')).ok;if(ready)break;}catch{}await new Promise(resolve=>setTimeout(resolve,30));}assert.ok(ready);
    let code,hostId;const drivers=[];
    for(const car of ['trail','vector','solstice','nomad']) {
      const client=await connect(),joined=once(client,'race-joined');client.emit('join-race',{private:true,code,car,name:car});const [room]=await joined;
      code=room.code;hostId ||= room.id;drivers.push({client,id:room.id,resume:room.resume});assert.equal(room.state,'waiting');assert.equal(room.private,true);assert.equal(room.hostId,hostId);
    }
    const fifth=await connect(),fullError=once(fifth,'race-error');fifth.emit('join-race',{code});assert.match((await fullError)[0],/unavailable/);fifth.disconnect();
    const host=drivers[0].client,notReadyError=once(host,'lobby-error');host.emit('lobby-start');assert.match((await notReadyError)[0],/connected and ready/);
    const denied=once(drivers[2].client,'lobby-error');drivers[2].client.emit('lobby-start');assert.match((await denied)[0],/Only the host/);
    const transferred=await waitState(drivers[1].client,s=>s.players.length===3,()=>host.emit('leave-race'));
    assert.equal(transferred.state,'waiting');assert.equal(transferred.hostId,drivers[1].id);
    const newcomer=await connect(),newJoined=once(newcomer,'race-joined');newcomer.emit('join-race',{code,car:'apex'});const [newRoom]=await newJoined;drivers.push({client:newcomer,id:newRoom.id,resume:newRoom.resume});assert.equal(newRoom.players.length,4);assert.equal(newRoom.hostId,drivers[1].id);
    const nextHost=drivers[1].client;
    const allReady=await waitState(nextHost,s=>s.players.every(p=>p.ready),()=>drivers.slice(1).forEach(({client})=>client.emit('lobby-ready',true)));
    assert.equal(allReady.state,'waiting');
    const disconnected=await waitState(nextHost,s=>s.players.some(p=>!p.online),()=>drivers[3].client.disconnect());
    assert.equal(disconnected.players.find(p=>p.id===drivers[3].id).ready,false);
    const blocked=once(nextHost,'lobby-error');nextHost.emit('lobby-start');assert.match((await blocked)[0],/connected and ready/);
    const recovered=await connect(),resumed=once(recovered,'race-joined');recovered.emit('resume-race',{code,resume:drivers[3].resume});const [restored]=await resumed;assert.equal(restored.id,drivers[3].id);assert.equal(restored.players.find(p=>p.id===restored.id).ready,false);
    await waitState(nextHost,s=>s.players.every(p=>p.online&&p.ready),()=>recovered.emit('lobby-ready',true));
    const started=await waitState(nextHost,s=>s.state==='countdown',()=>nextHost.emit('lobby-start'));assert.equal(started.players.length,4);assert.match(started.runId,/^[a-f0-9-]{36}$/);
    assert.equal(new Set(started.players.map(p=>p.lateral)).size,4);assert.ok(started.players.every(p=>p.distance===0&&p.time===0&&p.checkpoint===0&&p.laps.length===0));
  } finally {
    clients.forEach(client=>client.disconnect());const exited=once(child,'exit');child.kill();await exited;
    for(const suffix of ['','-wal','-shm'])rmSync(database+suffix,{force:true});
  }
});
