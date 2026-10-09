import test from 'node:test';
import assert from 'node:assert/strict';
import {buildTrack} from '../shared/racing.js';
import {makeNightDetails,nearbyLampIndices,updateNightLights} from '../public/src/night-scenery.js';
import {disposeGroup} from '../public/src/renderer.js';
globalThis.document={createElement:()=>({getContext:()=>({createRadialGradient:()=>({addColorStop(){}}),fillRect(){}})})};

test('nearest street lights wrap at the course seam without allocating more lights',()=>{
  assert.deepEqual(nearbyLampIndices(0,1200,48),[47,0,1,2]);
  assert.deepEqual(nearbyLampIndices(1200,1200,48),[47,0,1,2]);
  assert.deepEqual(nearbyLampIndices(-1,1200,48),[46,47,0,1]);
  const track=buildTrack('city'),details=makeNightDetails(track);assert.equal(details.lights.length,4);
  updateNightLights(details,track.length,track.length);assert.deepEqual(details.lights[0].position.toArray(),[details.lamps[47].position.x,details.lamps[47].position.y-.15,details.lamps[47].position.z]);
  updateNightLights(details,400,track.length,false);assert.ok(details.lights.every(light=>!light.visible));disposeGroup(details.group);
});

test('night details use finite deterministic instances and release the owned pool texture',()=>{
  const track=buildTrack('city'),a=makeNightDetails(track),b=makeNightDetails(track),instances=a.group.children.filter(object=>object.isInstancedMesh);
  assert.equal(instances.length,5);assert.ok(instances.every(mesh=>Array.from(mesh.instanceMatrix.array).every(Number.isFinite)));
  assert.deepEqual(instances[4].instanceMatrix.array,b.group.children.filter(object=>object.isInstancedMesh)[4].instanceMatrix.array);
  const texture=instances[3].material.map;let disposed=0;texture.addEventListener('dispose',()=>disposed++);disposeGroup(a.group);assert.equal(disposed,1);disposeGroup(b.group);
});
