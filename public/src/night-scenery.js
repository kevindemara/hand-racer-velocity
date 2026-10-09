import * as THREE from 'three';
import {random,hash,trackPoint,wrap} from '../../shared/racing.js';
import {surfacePoint,surfacePitch} from './scene-details.js';

export function nearbyLampIndices(distance,length,count) {
  const index=Math.floor(wrap(distance,length)/length*count);
  return [-1,0,1,2].map(offset=>wrap(index+offset,count));
}

export function makeNightDetails(track) {
  const group=new THREE.Group(),count=48,dummy=new THREE.Object3D(),lamps=[],lights=[];
  dummy.rotation.order='YXZ';
  const steel=new THREE.MeshStandardMaterial({color:'#647383',metalness:.65,roughness:.4});
  const posts=new THREE.InstancedMesh(new THREE.CylinderGeometry(.075,.11,6,8),steel,count);
  const arms=new THREE.InstancedMesh(new THREE.BoxGeometry(1.8,.1,.1),steel,count);
  const heads=new THREE.InstancedMesh(new THREE.BoxGeometry(.65,.12,.45),new THREE.MeshStandardMaterial({color:'#fff0d2',emissive:'#ffd9a0',emissiveIntensity:3,roughness:.3}),count);
  const canvas=document.createElement('canvas');canvas.width=canvas.height=128;const ctx=canvas.getContext('2d');
  const fade=ctx.createRadialGradient(64,64,0,64,64,64);fade.addColorStop(0,'rgba(255,255,255,.8)');fade.addColorStop(.45,'rgba(255,255,255,.3)');fade.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=fade;ctx.fillRect(0,0,128,128);
  const texture=new THREE.CanvasTexture(canvas),pools=new THREE.InstancedMesh(new THREE.PlaneGeometry(10,19),new THREE.MeshBasicMaterial({color:'#ffe1b5',map:texture,transparent:true,opacity:.13,blending:THREE.AdditiveBlending,depthWrite:false}),count);
  for(let i=0;i<count;i++){
    const distance=i/count*track.length,side=i%2?-1:1,p=surfacePoint(track,distance,side*9.5),inward=-side;
    dummy.position.set(p.x,p.y+3,p.z);dummy.rotation.set(0,p.yaw,0);dummy.scale.set(1,1,1);dummy.updateMatrix();posts.setMatrixAt(i,dummy.matrix);
    dummy.position.set(p.x+Math.cos(p.yaw)*inward*.7,p.y+5.95,p.z-Math.sin(p.yaw)*inward*.7);dummy.updateMatrix();arms.setMatrixAt(i,dummy.matrix);
    dummy.position.set(p.x+Math.cos(p.yaw)*inward*1.45,p.y+5.9,p.z-Math.sin(p.yaw)*inward*1.45);dummy.updateMatrix();heads.setMatrixAt(i,dummy.matrix);
    lamps.push({position:dummy.position.clone(),distance});
    const patch=trackPoint(track,distance,side*3.7);dummy.position.set(patch.x,patch.y+.045,patch.z);dummy.rotation.set(-Math.PI/2+surfacePitch(track,distance),p.yaw,0);dummy.updateMatrix();pools.setMatrixAt(i,dummy.matrix);
  }
  group.add(posts,arms,heads,pools);
  for(let i=0;i<4;i++){const light=new THREE.PointLight('#ffe2ba',180,35,2);lights.push(light);group.add(light);}
  const rng=random(hash(`${track.id}:puddles`)),puddles=new THREE.InstancedMesh(new THREE.CircleGeometry(1,24),new THREE.MeshPhysicalMaterial({color:'#718194',roughness:.065,metalness:.5,clearcoat:1,clearcoatRoughness:.06,transparent:true,opacity:.42,depthWrite:false}),72);
  for(let i=0;i<puddles.count;i++){
    const distance=(.04+rng()*.92)*track.length,lateral=(rng()>.5?1:-1)*(1.2+rng()*4.5),p=trackPoint(track,distance,lateral);
    dummy.position.set(p.x,p.y+.016,p.z);dummy.rotation.set(-Math.PI/2+surfacePitch(track,distance),p.yaw,0);dummy.scale.set(.5+rng()*1.2,1.2+rng()*2.8,1);dummy.updateMatrix();puddles.setMatrixAt(i,dummy.matrix);
  }
  group.add(puddles);
  return {group,lamps,lights};
}

export function updateNightLights(details,distance,length,enabled=true) {
  const indices=nearbyLampIndices(distance,length,details.lamps.length);
  details.lights.forEach((light,index)=>{light.visible=enabled;light.position.copy(details.lamps[indices[index]].position);light.position.y-=.15;});
}
