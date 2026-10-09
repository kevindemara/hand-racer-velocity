import test from 'node:test';
import assert from 'node:assert/strict';
import { Group, Mesh, InstancedMesh, BoxGeometry, MeshStandardMaterial, CanvasTexture, Texture } from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RacingRenderer, disposeGroup, makeCar } from '../public/src/renderer.js';

test('world cleanup releases instance buffers and each shared geometry/material/owned texture once',()=>{
  const group=new Group(),geometry=new BoxGeometry(),owned=new CanvasTexture({}),external=new Texture();
  const material=new MeshStandardMaterial({map:owned}),other=new MeshStandardMaterial({map:external});
  const instances=new InstancedMesh(geometry,material,5);group.add(instances,new Mesh(geometry,material),new Mesh(geometry,other));
  const counts={instance:0,geometry:0,material:0,owned:0,external:0};
  for(const [object,key] of [[instances,'instance'],[geometry,'geometry'],[material,'material'],[owned,'owned'],[external,'external']])object.addEventListener('dispose',()=>counts[key]++);
  disposeGroup(group);assert.deepEqual(counts,{instance:1,geometry:1,material:1,owned:1,external:0});external.dispose();
});

test('graphics quality changes the real composer backing resolution with the renderer',()=>{
  let ratio=1.5;const original=globalThis.devicePixelRatio;globalThis.devicePixelRatio=2;
  const renderer={getPixelRatio:()=>ratio,setPixelRatio:value=>ratio=value,getSize:target=>target.set(800,600),shadowMap:{}};
  const composer=new EffectComposer(renderer),subject={renderer,composer,bloom:{},resize(){}};
  try {
    RacingRenderer.prototype.quality.call(subject,'low');assert.equal(composer.renderTarget1.width,800);assert.equal(renderer.shadowMap.enabled,false);
    RacingRenderer.prototype.quality.call(subject,'high');assert.equal(composer.renderTarget1.width,1600);assert.equal(renderer.shadowMap.enabled,true);
    RacingRenderer.prototype.quality.call(subject,'medium');assert.equal(composer.renderTarget1.width,1200);
  }finally{composer.dispose();if(original===undefined)delete globalThis.devicePixelRatio;else globalThis.devicePixelRatio=original;}
});

test('departed network cars release their meshes while active cars remain attached',()=>{
  const active=makeCar('apex'),departed=makeCar('nova'),world=new Group();world.add(active,departed);
  const subject={world,cars:new Map([['active',active],['departed',departed]])};let released=0;
  departed.userData.bodyRig.children[0].geometry.addEventListener('dispose',()=>released++);
  RacingRenderer.prototype.pruneVehicles.call(subject,['active']);assert.equal(subject.cars.size,1);assert.equal(world.children.length,1);assert.equal(released,1);assert.equal(active.parent,world);
  disposeGroup(world);
});
