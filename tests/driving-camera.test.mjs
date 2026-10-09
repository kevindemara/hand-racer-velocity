import test from 'node:test';
import assert from 'node:assert/strict';
import {PerspectiveCamera,Vector3,Group,DirectionalLight} from 'three';
import {buildTrack,createVehicle} from '../shared/racing.js';
import {drivingCamera} from '../public/src/driving-camera.js';
import {surfacePoint} from '../public/src/scene-details.js';
import {RacingRenderer,makeCar,disposeGroup} from '../public/src/renderer.js';

test('three driving views remain finite on every elevation and rough shoulder',()=>{
  for(const id of ['coast','city','desert','alpine'])for(const view of ['chase','wide','road']){
    const track=buildTrack(id);
    for(let i=0;i<40;i++)for(const lateral of [-20,0,20]){
      const vehicle={...createVehicle(),distance:track.length*i/40,lateral,heading:.2},pose=drivingCamera(track,vehicle,view);
      assert.ok([...pose.position,...pose.lookAt,pose.fov,pose.yaw].every(Number.isFinite));
      assert.ok(new Vector3(...pose.position).distanceTo(new Vector3(...pose.lookAt))>5);
      if(view==='road')assert.ok(pose.position[1]>surfacePoint(track,vehicle.distance+2.8*Math.cos(.2),lateral+2.8*Math.sin(.2)).y);
    }
  }
});

test('view distances differ and reduced motion keeps boost camera distance/FOV stable',()=>{
  const track=buildTrack(),vehicle=createVehicle(),chase=drivingCamera(track,vehicle),wide=drivingCamera(track,vehicle,'wide');
  assert.ok(wide.position[1]>chase.position[1]);
  for(const view of ['chase','wide','road']){
    assert.deepEqual(drivingCamera(track,{...vehicle,boost:true},view,true),drivingCamera(track,vehicle,view,true));
    assert.ok(drivingCamera(track,{...vehicle,boost:true},view).fov>drivingCamera(track,vehicle,view).fov);
  }
});

test('view changes snap safely while paused and road view hides only the player model',()=>{
  const track=buildTrack(),player=makeCar('apex'),opponent=makeCar('nova'),world=new Group();world.add(player,opponent);
  const subject={track,world,cars:new Map([['player',player],['opponent',opponent]]),menu:false,camera:new PerspectiveCamera(),sun:new DirectionalLight(),composer:{render(){}},lastView:'chase'};
  RacingRenderer.prototype.setView.call(subject,'road');assert.equal(player.visible,false);assert.equal(opponent.visible,true);
  RacingRenderer.prototype.vehicle.call(subject,'player',createVehicle());assert.equal(player.visible,false,'per-frame pose must preserve first-person visibility');
  RacingRenderer.prototype.render.call(subject,0,createVehicle());assert.deepEqual(subject.camera.position.toArray(),drivingCamera(track,createVehicle(),'road').position);assert.equal(subject.camera.fov,70);
  const moved={...createVehicle(),distance:40};RacingRenderer.prototype.render.call(subject,1/60,moved);assert.deepEqual(subject.camera.position.toArray(),drivingCamera(track,moved,'road').position,'first-person view cannot lag behind a moving car');
  RacingRenderer.prototype.setView.call(subject,'wide');assert.equal(player.visible,true);RacingRenderer.prototype.render.call(subject,0,createVehicle());assert.equal(subject.camera.fov,58);
  RacingRenderer.prototype.setView.call(subject,'invalid');assert.equal(subject.drivingView,'chase');disposeGroup(world);
});

test('chase following retains its intended distance at speed across display frame rates',()=>{
  const track={length:1000,points:[{x:0,y:0,z:0,distance:0},{x:0,y:0,z:1000,distance:1000}]};
  for(const fps of [30,60,120])for(const view of ['chase','wide']){
    const camera=new PerspectiveCamera(),subject={track,camera,drivingView:view,menu:false,sun:new DirectionalLight(),composer:{render(){}}},vehicle={...createVehicle(),speed:60};
    RacingRenderer.prototype.render.call(subject,1/fps,vehicle);
    for(let i=1;i<=fps*5;i++){vehicle.distance=60*i/fps;RacingRenderer.prototype.render.call(subject,1/fps,vehicle);}
    const behind=vehicle.distance-camera.position.z;assert.ok(Math.abs(behind-(view==='wide'?14:9))<.1,`${view} at ${fps} fps lagged ${behind}m`);
  }
});
