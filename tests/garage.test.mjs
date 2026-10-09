import test from 'node:test';
import assert from 'node:assert/strict';
import { Box3, Group, Vector3 } from 'three';
import { makeCar, RacingRenderer } from '../public/src/renderer.js';
import { CARS, TRACKS, createVehicle, startingGrid, buildTrack, stepVehicle, botInput, makeHazards } from '../shared/racing.js';

test('every garage model has finite geometry, four wheels and a distinct body', () => {
  const signatures = new Set();
  for (const definition of CARS) {
    const car=makeCar(definition.id,definition.color,{stripe:true,wheels:'gold'});
    assert.equal(car.userData.wheelGroups.length,4);
    const bounds=new Box3().setFromObject(car);
    assert.ok(bounds.min.toArray().every(Number.isFinite)); assert.ok(bounds.max.toArray().every(Number.isFinite));
    const size=bounds.max.clone().sub(bounds.min);
    assert.ok(size.x>1 && size.x<5 && size.y>1 && size.y<3 && size.z>3 && size.z<8,definition.id);
    let vertices=0; const materials=new Set();
    car.traverse(object=>{if(object.geometry){vertices+=object.geometry.attributes.position.count;object.geometry.dispose();}if(object.material)materials.add(object.material);});
    signatures.add([car.children.length,vertices,car.userData.length,car.userData.width].join(':'));
    materials.forEach(material=>material.dispose());
  }
  assert.equal(signatures.size,CARS.length,'each car has a distinct geometry signature');
});

test('new cars can complete every course through the same authoritative driving rules', () => {
  for(const car of CARS.slice(6)) for(const course of TRACKS) {
    const track=buildTrack(course.id),vehicle=createVehicle(car.id),hazards=makeHazards(track,'normal');
    for(let i=0;i<12000&&!vehicle.finished;i++) stepVehicle(vehicle,botInput(vehicle,track,'normal',0,hazards),1/60,track,{difficulty:'normal',hazards,laps:1});
    assert.ok(vehicle.finished,`${car.id} on ${course.id}`); assert.equal(vehicle.checkpoint,8); assert.equal(vehicle.laps.length,1);
    assert.ok(Number.isFinite(vehicle.time) && vehicle.time>10 && vehicle.time<200);
  }
});

test('brake lights respond to authoritative brake state and release when braking ends', () => {
  const vehicle=createVehicle('nomad'),track=buildTrack(),renderer={cars:new Map(),world:new Group(),track};
  vehicle.braking=true; RacingRenderer.prototype.vehicle.call(renderer,'test',vehicle);
  const car=renderer.cars.get('test'); assert.equal(car.userData.brakeLights.length,2);
  assert.ok(car.userData.brakeLights.every(light=>light.material.emissiveIntensity===2.5));
  vehicle.braking=false; RacingRenderer.prototype.vehicle.call(renderer,'test',vehicle);
  assert.ok(car.userData.brakeLights.every(light=>light.material.emissiveIntensity===.65));
  const materials=new Set();car.traverse(object=>{object.geometry?.dispose();if(object.material)materials.add(object.material);});materials.forEach(material=>material.dispose());
});

test('starting grids keep every garage model on the road with clearance between cars',()=>{
  const bounds=CARS.map(definition=>{
    const car=makeCar(definition.id),box=new Box3().setFromObject(car);
    const materials=new Set();car.traverse(object=>{object.geometry?.dispose();if(object.material)materials.add(object.material);});materials.forEach(material=>material.dispose());return box;
  });
  for(let count=1;count<=4;count++) {
    const positions=startingGrid(count);assert.equal(positions.length,count);
    for(const original of bounds) for(const lateral of positions) {
      const placed=original.clone().translate(new Vector3(lateral,0,0));assert.ok(placed.min.x>=-7&&placed.max.x<=7,'car stays on the road');
    }
    for(let i=0;i<count-1;i++)for(const left of bounds)for(const right of bounds) {
      const a=left.clone().translate(new Vector3(positions[i],0,0)),b=right.clone().translate(new Vector3(positions[i+1],0,0));
      assert.ok(b.min.x-a.max.x>.3,'adjacent cars retain a visible gap');
    }
  }
});
