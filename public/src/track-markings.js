import * as THREE from 'three';
import { trackPoint, insideLaneEdge } from '../../shared/racing.js';
import { surfacePitch } from './scene-details.js';

export function roadEdges(track,distance) {
  return [insideLaneEdge(track,distance)-.1,track.width/2+.1];
}

// Batch identical parts across every hazard: clearer details without one draw call
// per reflector/stripe. All materials/geometries belong to this returned group.
export function makeTrackMarkers(track,hazards) {
  const group=new THREE.Group(),batches=new Map(),geometries=new Map(),materials=new Map();
  group.name='track-markers';
  const palette={
    barrier:['#e9c4a0',{roughness:.88}], ink:['#27343f',{roughness:.8}],
    reflector:['#fff1d0',{emissive:'#fff1d0',emissiveIntensity:.55}],
    amber:['#ffc36c',{emissive:'#ffc36c',emissiveIntensity:.75}],
    boost:['#18755e',{emissive:'#0d7964',emissiveIntensity:.35}],
    arrow:['#e2fff5',{emissive:'#c9fff2',emissiveIntensity:.65}],
    oil:['#23212d',{roughness:.035,metalness:.8}],
    lane:['#8ce6ca',{emissive:'#67d7ba',emissiveIntensity:.4}]
  };
  const geometry=kind=>{
    if(!geometries.has(kind)) {
      let value;
      if(kind==='circle')value=new THREE.CircleGeometry(1.6,32);
      else if(kind==='ring')value=new THREE.TorusGeometry(1.6,.035,5,32);
      else if(kind==='triangle') {
        value=new THREE.BufferGeometry();value.setAttribute('position',new THREE.Float32BufferAttribute([-.65,0,-.4,0,0,.65,.65,0,-.4],3));value.computeVertexNormals();
      } else value=new THREE.BoxGeometry(1,1,1);
      geometries.set(kind,value);
    }
    return geometries.get(kind);
  };
  const material=key=>{
    if(!materials.has(key)){const [color,extra]=palette[key];materials.set(key,new THREE.MeshStandardMaterial({color,roughness:.5,...extra}));}
    return materials.get(key);
  };
  const root=new THREE.Object3D(),part=new THREE.Object3D();
  const place=(distance,lateral)=>{
    const p=trackPoint(track,distance,lateral);root.position.set(p.x,p.y,p.z);root.rotation.order='YXZ';root.rotation.set(surfacePitch(track,distance,lateral),p.yaw,0);root.updateMatrix();
  };
  const add=(kind,color,scale,position,rotation=[0,0,0])=>{
    const key=`${kind}:${color}`;
    if(!batches.has(key))batches.set(key,{kind,color,matrices:[]});
    part.scale.set(...scale);part.position.set(...position);part.rotation.set(...rotation);part.updateMatrix();
    batches.get(key).matrices.push(root.matrix.clone().multiply(part.matrix));
  };
  const arrow=(color,z=0,y=.075)=>{
    for(const side of [-1,1])add('box',color,[.78,.025,.16],[side*.27,y,z],[0,side*Math.PI/4,0]);
  };
  for(const hazard of hazards) {
    place(hazard.distance,hazard.lateral);
    if(hazard.type==='boost') {
      add('box','ink',[2.4,.035,3.7],[0,.025,0]);add('box','boost',[2.2,.045,3.5],[0,.05,0]);
      for(const z of [-.8,0,.8])arrow('arrow',z,.09);
      for(const side of [-1,1])add('box','arrow',[.045,.02,3.1],[side*1.05,.09,0]);
    } else if(hazard.type==='oil') {
      add('circle','oil',[1,1,1],[0,.035,0],[-Math.PI/2,0,0]);
      add('ring','amber',[1,1,1],[0,.045,0],[-Math.PI/2,0,0]);
      add('triangle','amber',[1,1,1],[0,.04,-2.6]);
      add('box','ink',[.08,.025,.36],[0,.065,-2.47]);add('box','ink',[.09,.025,.09],[0,.065,-2.77]);
    } else {
      add('box','ink',[2.05,.12,.75],[0,.06,0]);add('box','barrier',[1.9,.85,.65],[0,.43,0]);
      for(const face of [-1,1]) {
        add('box','reflector',[1.84,.18,.025],[0,.62,face*.337]);
        for(const x of [-.6,0,.6])add('box','ink',[.2,.8,.025],[x,.43,face*.36],[0,0,-.22]);
        for(const x of [-.82,.82])add('box','amber',[.12,.12,.025],[x,.77,face*.355]);
      }
    }
  }
  // Painted guidance marks the faster route without resembling a nitro pad.
  for(const fraction of [.39,.425,.465]){place(track.length*fraction,-10);arrow('lane',0,.06);}
  for(const [key,batch] of batches) {
    const instances=new THREE.InstancedMesh(geometry(batch.kind),material(batch.color),batch.matrices.length);instances.name=key;
    batch.matrices.forEach((matrix,i)=>instances.setMatrixAt(i,matrix));instances.instanceMatrix.needsUpdate=true;
    instances.castShadow=['barrier','ink'].includes(batch.color) && batch.kind==='box';instances.receiveShadow=true;group.add(instances);
  }
  return group;
}
