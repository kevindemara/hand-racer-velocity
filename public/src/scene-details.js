import * as THREE from 'three';
import { trackPoint, insideLaneEdge, random, hash } from '../../shared/racing.js';

export function surfacePoint(track,distance,lateral=0) {
  const point=trackPoint(track,distance,lateral);
  const edge=lateral<0?-insideLaneEdge(track,distance):track.width/2;
  if(Math.abs(lateral)>edge)point.y=Math.max(-1,(point.y+1)*(35-Math.abs(lateral))/(35-edge)-1);
  return point;
}

export function surfacePitch(track,distance,lateral=0,heading=0) {
  const front=surfacePoint(track,distance+2*Math.cos(heading),lateral+2*Math.sin(heading));
  const rear=surfacePoint(track,distance-2*Math.cos(heading),lateral-2*Math.sin(heading));
  return -Math.atan2(front.y-rear.y,Math.hypot(front.x-rear.x,front.z-rear.z));
}

export function makeSky(track) {
  const group=new THREE.Group(),top={coast:'#648fad',city:'#070d20',desert:'#a37370',alpine:'#5d83a2'}[track.theme] || track.sky;
  const shader=new THREE.ShaderMaterial({
    uniforms:{zenith:{value:new THREE.Color(top)},horizon:{value:new THREE.Color(track.fog)}},side:THREE.BackSide,depthWrite:false,
    vertexShader:'varying vec3 skyPosition; void main(){vec4 world=modelMatrix*vec4(position,1.0);skyPosition=world.xyz;gl_Position=projectionMatrix*viewMatrix*world;}',
    fragmentShader:'uniform vec3 zenith;uniform vec3 horizon;varying vec3 skyPosition;void main(){float height=normalize(skyPosition-cameraPosition).y;gl_FragColor=vec4(mix(horizon,zenith,smoothstep(-0.08,0.75,height)),1.0);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}'
  });
  const sky=new THREE.Mesh(new THREE.SphereGeometry(1000,24,16),shader);sky.renderOrder=-10;sky.frustumCulled=false;group.add(sky);
  const night=track.theme==='city';
  const disc=new THREE.Mesh(new THREE.SphereGeometry(night?17:13,16,12),new THREE.MeshBasicMaterial({color:night?'#d9e3ed':'#ffe7bf',fog:false,toneMapped:false}));
  disc.position.set(night?360:-430,night?280:320,-650);group.add(disc);
  if(night){
    const rng=random(hash('velocity-stars')),positions=[];
    for(let i=0;i<180;i++){const yaw=rng()*Math.PI*2,y=.25+rng()*.75,radius=Math.sqrt(1-y*y);positions.push(Math.sin(yaw)*radius*960,y*960,Math.cos(yaw)*radius*960);}
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    group.add(new THREE.Points(geometry,new THREE.PointsMaterial({color:'#bacbd9',size:1.5,sizeAttenuation:false,transparent:true,opacity:.5,fog:false,depthWrite:false})));
  }
  return group;
}

function palmLeaf() {
  const vertices=[],indices=[],steps=8;
  for(let i=0;i<=steps;i++){const t=i/steps,width=Math.sin(t*Math.PI)*.13;vertices.push(-width,t*(1-t)*.35-t*t*.1,t,width,t*(1-t)*.35-t*t*.1,t);if(i<steps){const a=i*2;indices.push(a,a+2,a+1,a+1,a+2,a+3);}}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}

export function makeVegetation(track) {
  const palms=track.theme==='coast',count=palms?110:170,group=new THREE.Group(),rng=random(hash(`${track.id}:vegetation`)),dummy=new THREE.Object3D();
  const trunks=new THREE.InstancedMesh(new THREE.CylinderGeometry(.11,.16,1,7),new THREE.MeshStandardMaterial({color:palms?'#8a7762':'#75685f',roughness:.95}),count);
  const foliage=new THREE.InstancedMesh(palms?palmLeaf():new THREE.ConeGeometry(1,1,9),new THREE.MeshStandardMaterial({color:'#fff',roughness:.95,side:palms?THREE.DoubleSide:THREE.FrontSide}),count*(palms?8:3));
  for(let i=0;i<count;i++){
    const distance=rng()*track.length,lateral=(rng()>.5?1:-1)*(24+rng()*95),point=surfacePoint(track,distance,lateral),height=(palms?11:12)+rng()*(palms?7:14),yaw=rng()*Math.PI*2;
    dummy.position.set(point.x,point.y+height*(palms?.5:.425),point.z);dummy.rotation.set(0,yaw,0);dummy.scale.set(palms?1.1:1.7,height*(palms?1:.85),palms?1.1:1.7);dummy.updateMatrix();trunks.setMatrixAt(i,dummy.matrix);
    const tint=new THREE.Color(palms?'#477650':'#315c48').offsetHSL((rng()-.5)*.025,0,(rng()-.5)*.055);
    for(let layer=0;layer<(palms?8:3);layer++){
      if(palms){const spread=4.8+rng()*2;dummy.position.set(point.x,point.y+height,point.z);dummy.rotation.set(0,yaw+layer*Math.PI/4,0);dummy.scale.set(spread,spread,spread);}
      else{const widths=[.23,.19,.14],heights=[.6,.5,.42],centers=[.45,.62,.8];dummy.position.set(point.x,point.y+height*centers[layer],point.z);dummy.rotation.set(0,yaw,0);dummy.scale.set(height*widths[layer],height*heights[layer],height*widths[layer]);}
      dummy.updateMatrix();const index=i*(palms?8:3)+layer;foliage.setMatrixAt(index,dummy.matrix);foliage.setColorAt(index,tint);
    }
  }
  trunks.castShadow=foliage.castShadow=true;trunks.receiveShadow=foliage.receiveShadow=true;group.add(trunks,foliage);return group;
}

export function makeMountains(track) {
  const rng=random(hash(`${track.id}:mountains`)),positions=[],colors=[],indices=[],sides=14;
  const rings=[{y:0,r:1},{y:.25,r:.78},{y:.55,r:.43},{y:.8,r:.2},{y:1,r:.025}];
  const base=new THREE.Color(track.theme==='desert'?'#a67c63':track.theme==='coast'?'#687f70':'#71838c');
  const snow=new THREE.Color('#e3e9e8'),alpine=track.theme==='alpine';
  for(let layer=0;layer<rings.length;layer++)for(let side=0;side<sides;side++){
    const angle=side/sides*Math.PI*2,ring=rings[layer],radius=ring.r*(.86+rng()*.28),height=ring.y+(layer>0&&layer<4?(rng()-.5)*.08:0);
    positions.push(Math.sin(angle)*radius+ring.y*.12,height,Math.cos(angle)*radius);
    const color=base.clone().lerp(snow,alpine?THREE.MathUtils.smoothstep(height,.62,.87):0).multiplyScalar(.94+rng()*.12);colors.push(color.r,color.g,color.b);
    if(layer<rings.length-1){const a=layer*sides+side,b=layer*sides+(side+1)%sides,c=a+sides,d=b+sides;indices.push(a,b,c,b,d,c);}
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setIndex(indices);geometry.computeVertexNormals();
  const count=track.theme==='coast'?16:28,mountains=new THREE.InstancedMesh(geometry,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,metalness:0}),count),dummy=new THREE.Object3D();
  for(let i=0;i<count;i++){
    // Low inland hills leave the ocean side of the coastal horizon open.
    const angle=track.theme==='coast'?-Math.PI*.48+i/(count-1)*Math.PI*.96:i/count*Math.PI*2;
    const height=track.theme==='coast'?35+rng()*50:track.theme==='city'?45+rng()*65:80+rng()*130;
    dummy.position.set(Math.sin(angle)*680,-1,Math.cos(angle)*640);dummy.scale.set(85+rng()*85,height,80+rng()*90);dummy.rotation.y=angle+rng()*.4;dummy.updateMatrix();mountains.setMatrixAt(i,dummy.matrix);
  }
  return mountains;
}
