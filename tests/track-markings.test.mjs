import test from 'node:test';
import assert from 'node:assert/strict';
import { Matrix4, Vector3, Group } from 'three';
import { TRACKS, DIFFICULTIES, buildTrack, makeHazards, insideLaneEdge, trackSurface, trackPoint } from '../shared/racing.js';
import { makeTrackMarkers,roadEdges } from '../public/src/track-markings.js';
import { surfacePoint } from '../public/src/scene-details.js';
import { disposeGroup,RacingRenderer } from '../public/src/renderer.js';

test('hazard details are finite instanced batches on all courses and difficulties with owned disposal',()=>{
  for(const definition of TRACKS)for(const difficulty of Object.keys(DIFFICULTIES)) {
    const track=buildTrack(definition.id),hazards=makeHazards(track,difficulty),group=makeTrackMarkers(track,hazards);
    assert.ok(group.children.length<=10,'reflectors and chevrons do not cost a draw call per hazard');
    const geometries=new Set(),materials=new Set();let released=0;
    for(const part of group.children) {
      assert.equal(part.isInstancedMesh,true);assert.ok(part.count>0);
      assert.ok(Array.from(part.instanceMatrix.array).every(Number.isFinite));assert.ok(Array.from(part.geometry.attributes.position.array).every(Number.isFinite));
      geometries.add(part.geometry);materials.add(part.material);part.addEventListener('dispose',()=>released++);
    }
    let geometryReleases=0,materialReleases=0;
    geometries.forEach(g=>g.addEventListener('dispose',()=>geometryReleases++));materials.forEach(m=>m.addEventListener('dispose',()=>materialReleases++));
    assert.equal(geometries.size,4);disposeGroup(group);assert.equal(released,group.children.length);assert.equal(geometryReleases,geometries.size);assert.equal(materialReleases,materials.size);
  }
});

test('boost chevrons point forward and ground markers follow real pavement elevation',()=>{
  const track={length:1000,width:14,grip:1,points:[{x:0,y:0,z:0,distance:0},{x:0,y:100,z:1000,distance:1000}]};
  const markers=makeTrackMarkers(track,[{type:'boost',distance:100,lateral:0},{type:'oil',distance:200,lateral:0}]);
  const arrows=markers.children.find(p=>p.name==='box:arrow'),matrix=new Matrix4();
  arrows.getMatrixAt(0,matrix);const leftInner=new Vector3(.5,0,0).applyMatrix4(matrix);
  arrows.getMatrixAt(1,matrix);const rightInner=new Vector3(-.5,0,0).applyMatrix4(matrix);
  assert.ok(Math.abs(leftInner.x-rightInner.x)<.04,'paired strokes meet at their tip');
  assert.ok(leftInner.z>99.2,'arrow apex points along +Z driving direction');
  const oil=markers.children.find(p=>p.name==='circle:oil');oil.getMatrixAt(0,matrix);
  const center=new Vector3().setFromMatrixPosition(matrix),point=trackPoint(track,200);
  assert.ok(Math.abs(center.y-point.y-.035)<.001);
  const normal=new Vector3(0,0,1).transformDirection(matrix);assert.ok(normal.y>.99);assert.ok(normal.z<0,'oil follows uphill road instead of cutting through it');
  disposeGroup(markers);
});

test('inside lane entry and rejoin stay continuous across curb, pavement, shoulders and physics',()=>{
  const track=buildTrack('alpine');
  for(const lap of [0,1,3])for(const [progress,edge] of [[.36,-7],[.37,-7],[.375,-10],[.38,-13],[.42,-13],[.48,-13],[.485,-10],[.49,-7],[.5,-7]]) {
    const distance=track.length*(lap+progress),left=insideLaneEdge(track,distance);
    assert.ok(Math.abs(left-edge)<1e-8);assert.ok(Math.abs(roadEdges(track,distance)[0]-left+.1)<1e-8);
    const road=trackPoint(track,distance,left),surface=surfacePoint(track,distance,left);assert.ok(Math.abs(road.y-surface.y)<1e-8);
    const beyond=surfacePoint(track,distance,left-.1);assert.ok(beyond.y<surface.y && surface.y-beyond.y<.2,'no vertical drop at the shortcut edge');
    assert.equal(trackSurface(track,distance,left-.1),'rough');assert.notEqual(trackSurface(track,distance,left+.1),'rough');
  }
  // Verify generated shoulder vertices use the same edge as cars and the curb.
  const subject={world:new Group()};RacingRenderer.prototype.roadFoundation.call(subject,track);
  const positions=subject.world.children[0].geometry.attributes.position;
  for(let i=0;i<=450;i++){const p=trackPoint(track,i/450*track.length,insideLaneEdge(track,i/450*track.length));assert.ok(Math.abs(positions.getX(i*2)-p.x)<.0001);assert.ok(Math.abs(positions.getY(i*2)-(p.y-.03))<.0001);}
  disposeGroup(subject.world);
});
