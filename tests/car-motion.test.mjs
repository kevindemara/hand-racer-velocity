import test from 'node:test';
import assert from 'node:assert/strict';
import {makeCar,disposeGroup} from '../public/src/renderer.js';
import {updateCarBody,updateCarWheels} from '../public/src/car-motion.js';
import {CARS,createVehicle,buildTrack,stepVehicle} from '../shared/racing.js';
import {Vector3,Quaternion} from 'three';

test('steering pivots remain upright through wheel spin and only front axles steer from authoritative input',()=>{
  for(const definition of CARS) {
    const car=makeCar(definition.id),vehicle=createVehicle(definition.id);
    stepVehicle(vehicle,{throttle:1,steer:1},1/60,buildTrack());assert.equal(vehicle.steering,1);
    vehicle.speed=40;
    for(let i=0;i<180;i++)updateCarWheels(car,vehicle,1/60);
    car.updateMatrixWorld(true);
    for(const wheel of car.userData.wheelGroups) {
      const axle=new Vector3(1,0,0).applyQuaternion(wheel.userData.spin.getWorldQuaternion(new Quaternion()));
      assert.ok(Math.abs(axle.y)<1e-9,`${definition.id} hub stays horizontal while turning and spinning`);
      assert.ok(Math.abs(wheel.userData.spin.rotation.x*wheel.userData.radius-120)<1e-8,'tire rotation covers its driven distance');
      assert.equal(wheel.rotation.x,0);
      if(wheel.userData.front)assert.ok(wheel.rotation.y<-.2,'right input turns both front wheels right');else assert.equal(wheel.rotation.y,0);
    }
    const before=car.userData.wheelGroups.map(w=>[w.rotation.y,w.userData.spin.rotation.x]);updateCarWheels(car,{speed:60,steering:-1},0);
    assert.deepEqual(car.userData.wheelGroups.map(w=>[w.rotation.y,w.userData.spin.rotation.x]),before,'pause freezes wheels');disposeGroup(car);
  }
});

test('wheel spin and steering have consistent travel at 30, 60 and 120 fps and settle after release',()=>{
  const poses=[];
  for(const fps of [30,60,120]) {
    const car=makeCar('vector');for(let i=0;i<fps*2;i++)updateCarWheels(car,{speed:60,steering:-1},1/fps);
    poses.push(car.userData.wheelGroups.map(w=>[w.rotation.y,w.userData.spin.rotation.x]));
    for(let i=0;i<fps;i++)updateCarWheels(car,{speed:0,steering:0},1/fps);
    assert.ok(car.userData.wheelGroups.every(w=>Math.abs(w.rotation.y)<.00001));disposeGroup(car);
  }
  for(let i=1;i<poses.length;i++)for(let wheel=0;wheel<4;wheel++)for(let axis=0;axis<2;axis++)assert.ok(Math.abs(poses[0][wheel][axis]-poses[i][wheel][axis])<1e-8);
});

test('car body responds to acceleration, braking and cornering while wheels retain their placement',()=>{
  const car=makeCar('nomad'),wheels=car.userData.wheelGroups.map(wheel=>wheel.position.toArray());
  updateCarBody(car,{speed:10},0,.05);updateCarBody(car,{speed:11},.01,.05);
  assert.ok(car.userData.bodyRig.rotation.x<0,'acceleration lifts the nose');assert.ok(car.userData.bodyRig.rotation.z>0,'corner force rolls the body');
  updateCarBody(car,{speed:2},.02,.1);assert.ok(car.userData.bodyRig.rotation.x>0,'braking lowers the nose');
  assert.deepEqual(car.userData.wheelGroups.map(wheel=>wheel.position.toArray()),wheels);assert.ok(car.userData.wheelGroups.every(wheel=>wheel.parent===car));
  const frozen=car.userData.bodyRig.rotation.toArray();updateCarBody(car,{speed:2},.02,0);assert.deepEqual(car.userData.bodyRig.rotation.toArray(),frozen);
  updateCarBody(car,{speed:2},.02,.1,true);assert.equal(car.userData.bodyRig.rotation.x,0);assert.equal(car.userData.bodyRig.rotation.z,0);
  updateCarBody(car,{speed:0,finished:true},.02,.1);assert.equal(car.userData.bodyRig.rotation.x,0);disposeGroup(car);
});

test('car motion is frame-rate consistent and yaw crossing the seam cannot create a lean spike',()=>{
  const poses=[];
  for(const fps of [30,60,120]){
    const car=makeCar('apex');updateCarBody(car,{speed:0},0,0);
    for(let i=1;i<=fps*3;i++){const time=i/fps;updateCarBody(car,{speed:time*12},time*.2,1/fps);}
    poses.push([car.userData.bodyRig.rotation.x,car.userData.bodyRig.rotation.z]);disposeGroup(car);
  }
  assert.ok(Math.abs(poses[0][0]-poses[2][0])<.001);assert.ok(Math.abs(poses[0][1]-poses[2][1])<.001);
  const car=makeCar('apex');updateCarBody(car,{speed:30},Math.PI-.001,0);updateCarBody(car,{speed:30},-Math.PI+.001,1/60);assert.ok(Math.abs(car.userData.bodyRig.rotation.z)<.01);disposeGroup(car);
});
