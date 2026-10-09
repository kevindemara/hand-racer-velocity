import test from 'node:test';
import assert from 'node:assert/strict';
import { Group, Vector3 } from 'three';
import { buildTrack, createVehicle } from '../shared/racing.js';
import { surfacePoint, surfacePitch, makeVegetation, makeSky, makeMountains } from '../public/src/scene-details.js';
import { disposeGroup, RacingRenderer } from '../public/src/renderer.js';

test('vehicle pitch follows uphill pavement while shoulder height meets the ground',()=>{
  const track={length:1000,width:14,grip:1,points:[{x:0,y:0,z:0,distance:0},{x:0,y:100,z:1000,distance:1000}]};
  assert.ok(surfacePitch(track,100)<0);
  const road=surfacePoint(track,100,7),shoulder=surfacePoint(track,100,21),ground=surfacePoint(track,100,35);
  assert.ok(shoulder.y<road.y && shoulder.y>ground.y);assert.equal(ground.y,-1);
  assert.equal(surfacePoint(track,400,-10).y,40,'shortcut remains level with pavement');
  const vehicle={...createVehicle(),distance:100},subject={cars:new Map(),world:new Group(),track};RacingRenderer.prototype.vehicle.call(subject,'test',vehicle);
  const car=subject.cars.get('test'),forward=new Vector3(0,0,1).applyEuler(car.rotation);assert.ok(forward.y>0);disposeGroup(subject.world);
});

test('palm and pine instance placements are deterministic and finite',()=>{
  for(const id of ['coast','alpine']){
    const a=makeVegetation(buildTrack(id)),b=makeVegetation(buildTrack(id));
    assert.equal(a.children.length,2);assert.deepEqual(a.children[0].instanceMatrix.array,b.children[0].instanceMatrix.array);
    assert.ok(a.children.every(mesh=>Array.from(mesh.instanceMatrix.array).every(Number.isFinite)));
    assert.equal(a.children[1].count,a.children[0].count*(id==='coast'?8:3));disposeGroup(a);disposeGroup(b);
  }
});

test('each environment has an owned sky dome and only the night city has stars',()=>{
  for(const id of ['coast','city','desert','alpine']){
    const sky=makeSky(buildTrack(id));assert.equal(sky.children[0].material.depthWrite,false);
    assert.equal(sky.children.some(object=>object.isPoints),id==='city');disposeGroup(sky);
  }
});

test('mountain geometry is finite, snowy in alpine and leaves the coast ocean horizon open',()=>{
  for(const id of ['coast','city','desert','alpine']){
    const mountains=makeMountains(buildTrack(id));
    assert.ok(Array.from(mountains.geometry.attributes.position.array).every(Number.isFinite));
    assert.ok(Array.from(mountains.geometry.attributes.normal.array).every(Number.isFinite));
    const color=mountains.geometry.attributes.color;
    if(id==='alpine')assert.ok(color.getX(color.count-1)>color.getX(0),'snow cap is brighter than rock');
    for(let i=0;i<mountains.count;i++)if(id==='coast')assert.ok(mountains.instanceMatrix.array[i*16+14]>0,'all coastal hills are inland');
    const group=new Group();group.add(mountains);disposeGroup(group);
  }
});
