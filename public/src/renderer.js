import * as THREE from 'three';
import { assetUrl } from './asset-url.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CARS, trackPoint, insideLaneEdge, random, hash, wrap } from '../../shared/racing.js';
import { makeSky, makeVegetation, makeMountains, surfacePoint, surfacePitch } from './scene-details.js';
import { drivingCamera } from './driving-camera.js';
import { makeNightDetails, updateNightLights } from './night-scenery.js';
import { updateCarBody, updateCarWheels } from './car-motion.js';
import { makeTrackMarkers, roadEdges } from './track-markings.js';

const material = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: .5, metalness: .15, ...extra });
function mesh(geometry, mat, x = 0, y = 0, z = 0) {
  const object = new THREE.Mesh(geometry, mat); object.position.set(x, y, z); object.castShadow = true; object.receiveShadow = true; return object;
}
const box = (x, y, z, mat, px = 0, py = 0, pz = 0) => mesh(new THREE.BoxGeometry(x, y, z), mat, px, py, pz);
function loft(rings) {
  const positions = [], indices = [];
  rings.forEach(({ z, w, bottom, top }) => {
    for (const [x, y] of [[-.8 * w, bottom], [-w, bottom + .12], [-w, top - .1], [-.8 * w, top], [.8 * w, top], [w, top - .1], [w, bottom + .12], [.8 * w, bottom]]) positions.push(x, y, z);
  });
  for (let r = 0; r < rings.length - 1; r++) for (let i = 0; i < 8; i++) {
    const a = r * 8 + i, b = r * 8 + (i + 1) % 8, c = a + 8, d = b + 8;
    indices.push(a, c, b, b, c, d);
  }
  for (let i = 1; i < 7; i++) { indices.push(0, i + 1, i); const n = (rings.length - 1) * 8; indices.push(n, n + i, n + i + 1); }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setIndex(indices); geometry.computeVertexNormals(); return geometry;
}
export function makeCar(carId, color, { ghost = false, wheels = 'alloy', stripe = false } = {}) {
  const definition = CARS.find(c => c.id === carId) || CARS[0], group = new THREE.Group();
  const truck = definition.shape === 'truck', prototype = definition.shape === 'prototype', muscle = definition.shape === 'muscle', hatch = definition.shape === 'hatch', electric = definition.shape === 'electric';
  const roadster = definition.shape === 'roadster', supercar = definition.shape === 'supercar', retro = definition.shape === 'retro', buggy = definition.shape === 'buggy';
  const formula = definition.shape === 'formula';
  const length = formula ? 2.65 : buggy ? 1.75 : roadster ? 1.95 : supercar ? 2.4 : prototype ? 2.55 : muscle ? 2.4 : hatch ? 1.9 : electric ? 2.15 : 2.2;
  const width = formula ? 1.17 : supercar ? 1.2 : buggy ? 1.14 : prototype ? 1.18 : truck ? 1.12 : electric ? 1.1 : 1.02;
  const height = buggy ? .72 : truck ? .98 : supercar || prototype ? .62 : electric ? .86 : .79;
  const paint = new THREE.MeshPhysicalMaterial({ color: color || definition.color, roughness: .24, metalness: .62, clearcoat: 1, clearcoatRoughness: .15, transparent: ghost, opacity: ghost ? .28 : 1 });
  const carbon = material('#17232b', { roughness: .4, metalness: .7, transparent: ghost, opacity: ghost ? .3 : 1 });
  const glass = material('#142333', { roughness: .07, metalness: .85, transparent: ghost, opacity: ghost ? .25 : 1 });
  const brakeLights = [];
  if (formula) {
    // A narrow monocoque leaves all four tires exposed.
    group.add(mesh(loft([
      {z:-2.1,w:.32,bottom:.27,top:.68}, {z:-.8,w:.49,bottom:.24,top:1.02},
      {z:.35,w:.43,bottom:.24,top:.78}, {z:1.4,w:.23,bottom:.31,top:.62},
      {z:2.5,w:.12,bottom:.33,top:.45}
    ]),paint));
    group.add(box(1.66,.08,2.8,carbon,0,.24,-.3));
    for(const side of [-1,1]) {
      group.add(box(.42,.43,1.55,paint,side*.65,.55,-.55));
      group.add(box(.32,.27,.05,carbon,side*.65,.62,.25));
      group.add(box(.065,.34,.065,carbon,side*.43,.99,.17));
      group.add(box(.08,.49,.1,carbon,side*.52,.86,-2.08));
      // Suspension wishbones connect the chassis to each wheel hub.
      for(const axle of [-1,1]) for(const offset of [-.16,.16]) {
        const link=box(.91,.045,.045,carbon,side*.76,.44,axle*length*.67+offset);
        link.rotation.y=side*offset*1.5;group.add(link);
      }
      group.add(box(.05,.32,.56,paint,side*1.09,.44,2.32));
      group.add(box(.05,.43,.58,paint,side*1.08,1.22,-2.1));
    }
    group.add(box(.93,.065,.075,carbon,0,1.16,.17));
    group.add(box(.55,.16,.66,carbon,0,.8,-.08));
    const helmet=mesh(new THREE.SphereGeometry(.22,20,12),material('#f6e8ae'),0,1.09,-.12);group.add(helmet);
    group.add(box(.31,.1,.06,glass,0,1.1,.074));
    group.add(box(.15,.36,.28,paint,0,1.25,-.65));
    group.add(box(2.15,.065,.55,carbon,0,.31,2.32));
    group.add(box(2.14,.08,.56,paint,0,1.37,-2.1));
    group.add(box(2.14,.04,.36,carbon,0,1.24,-2.1));
    const rear=box(.16,.13,.06,material('#f54b49',{emissive:'#ff2924',emissiveIntensity:.65}),0,.48,-2.29);
    brakeLights.push(rear);group.add(rear);
    if(stripe)group.add(box(.07,.015,1.04,material('#f2eddf'),0,.53,1.7));
  } else {
  group.add(mesh(loft([
    { z: -length, w: width * .84, bottom: .28, top: height * .83 },
    { z: -length * .62, w: width, bottom: .25, top: height },
    { z: length * .48, w: width, bottom: .25, top: height },
    { z: length, w: width * .82, bottom: .32, top: height * .72 }
  ]), paint));
  group.add(box(width * 2.05, .16, length * 1.9, carbon, 0, .25, 0));
  const roofHeight = truck ? 1.72 : supercar ? 1.08 : prototype ? 1.12 : hatch ? 1.53 : electric ? 1.45 : 1.36;
  const cabin = mesh(loft([
    { z: -length * (hatch ? .7 : .55), w: width * .72, bottom: height - .05, top: height + .06 },
    { z: -length * .27, w: width * .64, bottom: height - .05, top: roofHeight },
    { z: length * .2, w: width * .58, bottom: height - .05, top: roofHeight * .96 },
    { z: length * .55, w: width * .7, bottom: height - .05, top: height + .06 }
  ]), glass);
  if (!roadster && !buggy) group.add(cabin); else cabin.geometry.dispose();
  const roof = box(width * 1.22, .05, length * .46, paint, 0, roofHeight * .98 + .025, -length * .035);
  roof.rotation.x = Math.atan(roofHeight * .04 / (length * .47));
  if (!roadster && !buggy) group.add(roof);
  else {
    roof.geometry.dispose();
    // Open cabin, bucket seats, windshield and rollover protection.
    const windshield = box(width * 1.45, .5, .045, glass, 0, height + .35, length * .39); windshield.rotation.x = -.24; group.add(windshield);
    group.add(box(width * 1.5, .045, .07, carbon, 0, height + .6, length * .33));
    for (const side of [-1,1]) {
      const seat = box(.53, .54, .23, carbon, side * .45, height + .23, -.35); seat.rotation.x = .12; group.add(seat);
      group.add(box(.5, .12, .55, carbon, side * .45, height + .02, 0));
      group.add(box(.07, buggy ? 1.15 : .65, .07, carbon, side * width * .7, height + (buggy ? .45 : .2), -length * .35));
    }
    group.add(box(width * 1.47, .075, .075, carbon, 0, height + (buggy ? 1.02 : .52), -length * .35));
    if (buggy) for (const side of [-1,1]) {
      group.add(box(.07, .07, length * .95, carbon, side * width * .7, height + 1.02, 0));
      const pillar = box(.07, 1.0, .07, carbon, side * width * .7, height + .57, length * .35); pillar.rotation.x = -.15; group.add(pillar);
    }
  }
  if (supercar) for (const side of [-1,1]) {
    group.add(box(.12, .3, .75, carbon, side * width, .58, -length * .32));
    for (let i=0;i<4;i++) group.add(box(.4, .025, .055, carbon, side * .5, height + .03, -length * .7 + i * .13));
  }
  if (retro) for (const side of [-1,1]) {
    const lamp = mesh(new THREE.CylinderGeometry(.2,.2,.09,24), material('#fff0bc',{emissive:'#ffe7a1',emissiveIntensity:1.5}), side * width * .63,height * .7,length + .06); lamp.rotation.x = Math.PI / 2; group.add(lamp);
    group.add(box(.3,.08,.07,material('#eaad59'),side * width * .64,.35,length + .045));
  }
  for (const side of [-1, 1]) {
    group.add(box(.07, .14, length * 1.35, paint, side * width * .73, height + .06, -.1));
    group.add(box(.27, .12, .2, carbon, side * width * 1.06, height + .15, length * .36));
    group.add(box(.06, .035, .24, carbon, side * width, height * .83, -.2));
    group.add(box(width * .54, .13, .06, material('#e1f6ff', { emissive: '#b9e7ff', emissiveIntensity: 2.2 }), side * width * .53, height * .67, length + .015));
    const brakeLight = box(width * .58, .1, .07, material('#f54b49', { emissive: '#ff2924', emissiveIntensity: .65 }), side * width * .5, height * .72, -length - .015);
    brakeLights.push(brakeLight); group.add(brakeLight);
    group.add(box(.11, .025, length * .95, material(color || definition.color, { emissive: color || definition.color, emissiveIntensity: .8 }), side * width, .2, 0));
  }
  group.add(box(width, .2, .07, carbon, 0, .43, length + .035));
  if (electric) group.add(box(width * 1.65, .045, .07, material('#e1f6ff', { emissive: '#b9e7ff', emissiveIntensity: 1.4 }), 0, height * .67, length + .03));
  if (!truck && !electric && !roadster && !buggy && !retro) {
    group.add(box(.07, prototype ? .35 : .2, .11, carbon, -width * .65, height + .13, -length * .81));
    group.add(box(.07, prototype ? .35 : .2, .11, carbon, width * .65, height + .13, -length * .81));
    group.add(box(width * 2.05, .07, .42, carbon, 0, height + (prototype ? .33 : .21), -length * .86));
  }
  if (stripe) group.add(box(.23, .015, length * .75, material('#f2eddf'), 0, height + .013, length * .57));
  }
  const wheelGroups = [];
  for (const side of [-1, 1]) for (const axle of [-1, 1]) {
    const radius = truck || buggy ? .51 : formula && axle < 0 ? .44 : .41;
    const tireWidth = formula ? .46 : buggy ? .43 : .32;
    const wheel = new THREE.Group(); wheel.position.set(side * width, radius+.02, axle * length * (formula ? .67 : .61));
    const tire = mesh(new THREE.CylinderGeometry(radius,radius,tireWidth,24), material('#14171a', { roughness: .93, metalness: 0 })); tire.rotation.z = Math.PI / 2;
    const rim = mesh(new THREE.CylinderGeometry(.28, .28, tireWidth+.02, 16), material(wheels === 'gold' ? '#cfaa63' : wheels === 'black' ? '#222831' : '#a9b8c1', { metalness: .9, roughness: .22 })); rim.rotation.z = Math.PI / 2;
    const spin = new THREE.Group(); spin.add(tire, rim); wheel.add(spin);
    wheel.userData = { radius, front:axle>0, spin };
    for (let i = 0; i < 5; i++) {
      const spoke = box(tireWidth+.04, .04, .4, carbon); spoke.rotation.x = i * Math.PI / 5; spin.add(spoke);
    }
    group.add(wheel); wheelGroups.push(wheel);
  }
  const flames = [];
  for (const x of [-.5, .5]) {
    group.add(mesh(new THREE.CylinderGeometry(.12, .12, .23, 12), carbon, x, .38, -length));
    const flame = mesh(new THREE.ConeGeometry(.2, 1.2, 10), new THREE.MeshBasicMaterial({ color: '#70daff', transparent: true, opacity: .85 }), x, .4, -length - .6);
    flame.rotation.x = -Math.PI / 2; flame.visible = false; flames.push(flame); group.add(flame);
  }
  const bodyRig=new THREE.Group();
  for(const part of [...group.children])if(!wheelGroups.includes(part))bodyRig.add(part);
  group.add(bodyRig);
  group.userData = { wheelGroups, flames, brakeLights, bodyRig, suspensionFactor:truck||buggy?1.25:prototype||formula ? .65 : 1,length, width, paint, ghost };
  if (ghost) group.traverse(object => { if (object.isMesh) { object.castShadow = false; object.material.transparent = true; object.material.opacity = .22; object.material.depthWrite = false; } });
  return group;
}
export function disposeGroup(group) {
  const geometries = new Set(), materials = new Set(), textures = new Set();
  group.traverse(object => {
    // Instance matrix/color buffers are owned by the mesh, not its geometry.
    if (object.isInstancedMesh) object.dispose();
    if (object.geometry) geometries.add(object.geometry);
    if (object.material) for (const mat of Array.isArray(object.material) ? object.material : [object.material]) materials.add(mat);
  });
  geometries.forEach(geometry=>geometry.dispose());
  materials.forEach(mat=>{if(mat.map?.isCanvasTexture)textures.add(mat.map);mat.dispose();});
  textures.forEach(texture=>texture.dispose());
}
export class RacingRenderer {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap; this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = .85;
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color('#172432');
    this.camera = new THREE.PerspectiveCamera(48, 1, .1, 1400);
    const pmrem = new THREE.PMREMGenerator(this.renderer); const environment = new RoomEnvironment();
    this.environment = pmrem.fromScene(environment, .04); this.scene.environment = this.environment.texture; environment.dispose(); pmrem.dispose();
    this.hemisphere = new THREE.HemisphereLight('#d7eaff', '#3d3332', 2.5); this.scene.add(this.hemisphere);
    this.sun = new THREE.DirectionalLight('#ffe1c5', 3.2); this.sun.position.set(70, 100, 30); this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048); this.sun.shadow.camera.left = -55; this.sun.shadow.camera.right = 55; this.sun.shadow.camera.top = 55; this.sun.shadow.camera.bottom = -55;
    this.sun.shadow.bias = -.0003; this.scene.add(this.sun, this.sun.target);
    this.composer = new EffectComposer(this.renderer); this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(800, 600), .24, .45, 1.4); this.composer.addPass(this.bloom); this.composer.addPass(new OutputPass());
    this.world = new THREE.Group(); this.scene.add(this.world); this.cars = new Map(); this.menu = true;
    this.texture = new THREE.TextureLoader().load(assetUrl('assets/generated/asphalt.png')); this.texture.wrapS = this.texture.wrapT = THREE.RepeatWrapping; this.texture.colorSpace = THREE.SRGBColorSpace; this.texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    this.resizeObserver = new ResizeObserver(() => this.resize()); this.resizeObserver.observe(canvas.parentElement); this.resize();
  }
  resize() {
    const parent = this.renderer.domElement.parentElement, w = Math.max(1, parent.clientWidth), h = Math.max(1, parent.clientHeight);
    this.renderer.setSize(w, h, false); this.composer.setSize(w, h); this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    if (this.menu) this.frameGarage(w,h);
  }
  frameGarage(w = this.renderer.domElement.parentElement.clientWidth, h = this.renderer.domElement.parentElement.clientHeight) {
    this.camera.clearViewOffset(); this.camera.position.set(7.4,3.8,8);
    this.camera.aspect = w / h; this.camera.fov = 48; this.camera.zoom = 1;
    if (w > 900) { this.camera.lookAt(-2,.6,0); this.camera.updateProjectionMatrix(); return; }
    // Fit the rotating car's full envelope in the preview above the measurements.
    // A fixed virtual height keeps the car in that slot on tall/short viewports.
    this.camera.aspect = w / 700;
    this.camera.lookAt(0,-.6,0); this.camera.updateProjectionMatrix(); this.camera.updateMatrixWorld();
    const envelope = this.previewBounds || { radius:3.8,minY:0,maxY:2.8 }, point = new THREE.Vector3();
    const bounds = () => {
      let left=Infinity,right=-Infinity,top=Infinity,bottom=-Infinity;
      for (let sample=0;sample<64;sample++) for (const y of [envelope.minY,envelope.maxY]) {
        const angle=sample/64*Math.PI*2;
        point.set(Math.cos(angle)*envelope.radius,y,Math.sin(angle)*envelope.radius).project(this.camera);
        const px=(point.x+1)*w/2,py=(1-point.y)*350;
        left=Math.min(left,px);right=Math.max(right,px);top=Math.min(top,py);bottom=Math.max(bottom,py);
      }
      return {left,right,top,bottom};
    };
    const original=bounds();
    this.camera.zoom=Math.min(1,Math.max(1,w-40)/(original.right-original.left),145/(original.bottom-original.top));
    this.camera.updateProjectionMatrix(); const fitted=bounds(),centerY=w>560?287.5:307.5;
    this.garageOffset={w,h,x:(fitted.left+fitted.right)/2-w/2,y:(fitted.top+fitted.bottom)/2-centerY};this.garageScroll=0;
    this.camera.setViewOffset(w,700,this.garageOffset.x,this.garageOffset.y,w,h);
  }
  quality(level, reducedMotion = false, reducedFlashes = false) {
    this.qualityLevel=level;
    this.reducedMotion = reducedMotion; this.reducedFlashes = reducedFlashes; this.renderer.setPixelRatio(Math.min(devicePixelRatio, level === 'low' ? 1 : level === 'high' ? 2 : 1.5));
    this.renderer.shadowMap.enabled = level !== 'low'; this.bloom.enabled = level !== 'low' && !reducedFlashes; this.resize();
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
  }
  clear() { this.world.removeFromParent(); disposeGroup(this.world); this.world = new THREE.Group(); this.scene.add(this.world); this.cars.clear(); this.displayCar=this.rain=this.particles=this.headlight=this.night=null;this.particlePositions=this.particleVelocity=this.particleLife=null;this.lastView=null; }
  setView(view) {
    this.drivingView=['chase','wide','road'].includes(view)?view:'chase';
    const player=this.cars.get('player');if(player)player.visible=!player.userData.eliminated&&this.drivingView!=='road';
  }
  garage(carId, color, cosmetic = {}) {
    this.clear(); this.menu = true; this.scene.environmentIntensity = 1; this.headlight = null; this.scene.fog = new THREE.Fog('#172432', 30, 100); this.scene.background.set('#172432'); this.hemisphere.intensity = 2.4; this.sun.intensity = 3.2;
    this.hemisphere.color.set('#d7eaff'); this.hemisphere.groundColor.set('#3d3332'); this.camera.fov=48;this.camera.updateProjectionMatrix();
    this.sun.color.set('#ffe1c5');
    const floor = mesh(new THREE.PlaneGeometry(200, 200), material('#243643', { roughness: .35, metalness: .45 })); floor.rotation.x = -Math.PI / 2; this.world.add(floor);
    this.world.add(mesh(new THREE.CylinderGeometry(5.5, 5.8, .28, 80), material('#1a2a34', { metalness: .65, roughness: .4 }), 0, -.06, 0));
    const ring = mesh(new THREE.TorusGeometry(5.5, .025, 8, 128), new THREE.MeshBasicMaterial({ color: '#77aabf' }), 0, .09, 0); ring.rotation.x = Math.PI / 2; this.world.add(ring);
    const grid = new THREE.GridHelper(120, 60, '#496370', '#304754'); grid.position.y = -.15; this.world.add(grid);
    this.displayCar = makeCar(carId, color, cosmetic);
    const bounds=new THREE.Box3().setFromObject(this.displayCar);
    this.previewBounds={radius:Math.hypot(Math.max(Math.abs(bounds.min.x),Math.abs(bounds.max.x)),Math.max(Math.abs(bounds.min.z),Math.abs(bounds.max.z))),minY:bounds.min.y+.16,maxY:bounds.max.y+.16};
    this.displayCar.position.y = .16; this.displayCar.rotation.y = -.6; this.world.add(this.displayCar);
    for (let i = 0; i < 5; i++) this.world.add(box(.08, 5, .08, material('#b4cedc', { emissive: '#a3bed0', emissiveIntensity: 1 }), -15 + i * 7, 2.4, -18));
    this.frameGarage(); this.sun.position.set(-8, 12, 7); this.sun.target.position.set(0, 0, 0);
  }
  trackWorld(track, hazards) {
    this.clear(); this.menu = false; this.track = track; this.scene.background.set(track.sky); this.scene.fog = new THREE.Fog(track.fog, 180, 850);
    this.world.add(makeSky(track));
    if (this.camera.view?.enabled) this.camera.aspect=this.camera.view.width/this.camera.view.height;
    this.camera.clearViewOffset();this.camera.zoom=1;this.camera.fov=54;this.camera.updateProjectionMatrix();
    this.scene.environmentIntensity = track.theme === 'city' ? .22 : .5;
    this.hemisphere.color.set(track.sky); this.hemisphere.groundColor.set(track.ground); this.hemisphere.intensity = track.theme === 'city' ? .65 : 1.45; this.sun.intensity = track.theme === 'city' ? .2 : 2.2;
    this.sun.color.set(track.theme==='city'?'#b7c8f0':'#ffe1c5');
    if(track.theme==='city')this.hemisphere.color.set('#7b9cb8');
    this.headlight = null;
    if (track.theme === 'city') { this.headlight = new THREE.SpotLight('#d4eaff', 900, 60, .55, .65, 2); this.world.add(this.headlight, this.headlight.target); }
    const ground = mesh(new THREE.PlaneGeometry(3000, 3000), material(track.ground, { roughness: .98, metalness: 0 }), 0, -1, 0); ground.rotation.x = -Math.PI / 2; this.world.add(ground);
    this.roadStrip(track, -7, 7, material(track.theme === 'city' ? '#adb4c3' : '#aeb4b4', { map: this.texture, roughness: track.theme === 'city' ? .25 : .86, metalness: track.theme === 'city' ? .3 : .03 }));
    this.roadStrip(track, d=>insideLaneEdge(track,d), -7, material('#626d6e', { map: this.texture, roughness: .8 }), .37, .49);
    for (const fraction of [.375, .48]) {
      const p = trackPoint(track, track.length * fraction, -15), sign = new THREE.Group(); sign.position.set(p.x, p.y, p.z); sign.rotation.y = p.yaw + Math.PI;
      const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 160;
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#172432'; ctx.fillRect(0, 0, 512, 160); ctx.fillStyle = '#67d7ba'; ctx.font = 'bold 44px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(fraction < .4 ? 'FAST LANE →' : '← REJOIN', 256, 65); ctx.font = '28px sans-serif'; ctx.fillStyle = '#eef1e9'; ctx.fillText('SHORTCUT / +13% PACE', 256, 118);
      const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
      sign.add(box(.18, 4, .18, material('#526b77'), 0, 2, 0), mesh(new THREE.PlaneGeometry(7, 2.2), new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }), 0, 3.8, .12)); this.world.add(sign);
    }
    this.roadFoundation(track);
    const start = trackPoint(track,-9); this.camera.position.set(start.x,start.y+4.5,start.z);
    const dummy = new THREE.Object3D(), segments = 320;
    const curb = new THREE.InstancedMesh(new THREE.BoxGeometry(.6, .18, track.length / segments * 1.02), material('#fff'), segments * 2);
    const markers = new THREE.InstancedMesh(new THREE.BoxGeometry(.13, .025, 2.7), material('#d9ddd4', { roughness: .9 }), segments);
    for (let i = 0; i < segments; i++) {
      const d = i / segments * track.length, p = trackPoint(track, d);
      const edges=roadEdges(track,d);
      for (let j = 0; j < 2; j++) { const edge = trackPoint(track, d, edges[j]); dummy.position.set(edge.x, edge.y + .02, edge.z); dummy.rotation.set(0, edge.yaw, 0); dummy.updateMatrix(); curb.setMatrixAt(i * 2 + j, dummy.matrix); curb.setColorAt(i * 2 + j, new THREE.Color(i % 2 ? '#eeeeeb' : edges[j]<-8?'#67d7ba':track.accent)); }
      dummy.position.set(p.x, p.y + .03, p.z); dummy.rotation.set(0, p.yaw, 0); dummy.updateMatrix(); markers.setMatrixAt(i, dummy.matrix);
    }
    curb.receiveShadow = true; this.world.add(curb, markers);
    // Eight visible checkpoint arches establish a real loop and racing line.
    for (let i = 0; i < 8; i++) {
      const p = trackPoint(track, i / 8 * track.length), gate = new THREE.Group(); gate.position.set(p.x, p.y, p.z); gate.rotation.y = p.yaw;
      const frame = material(i === 0 ? '#f4e7ce' : '#526b77', { metalness: .5 });
      gate.add(box(.3, 6.5, .35, frame, -7.5, 3.25, 0), box(.3, 6.5, .35, frame, 7.5, 3.25, 0), box(15.3, .55, .45, frame, 0, 6.25, 0));
      gate.add(box(14, .08, .08, material(track.accent, { emissive: track.accent, emissiveIntensity: 1.4 }), 0, 5.95, .3));
      this.world.add(gate);
      if (!i) for (let j = 0; j < 28; j++) { const stripe = box(.5, .02, .9, material(j % 2 ? '#172432' : '#f4eee1'), -6.75 + j % 14, .04, Math.floor(j / 14) * .9); gate.add(stripe); }
    }
    this.world.add(makeTrackMarkers(track,hazards));
    this.scenery(track);
    if (track.theme === 'city') {
      this.night=makeNightDetails(track);this.world.add(this.night.group);
      const rng = random(track.seed); const positions = new Float32Array(1800);
      for (let i = 0; i < 600; i++) { positions[i * 3] = (rng() - .5) * 140; positions[i * 3 + 1] = rng() * 50; positions[i * 3 + 2] = (rng() - .5) * 140; }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(positions, 3)); this.rain = new THREE.Points(geo, new THREE.PointsMaterial({ color: '#c1d9e9', size: .12, transparent: true, opacity: .6 })); this.world.add(this.rain);
    } else this.rain = null;
    this.particlePositions = new Float32Array(360); this.particleLife = new Float32Array(120); this.particleVelocity = new Float32Array(360); this.particleIndex = 0;
    const particleGeometry = new THREE.BufferGeometry(); particleGeometry.setAttribute('position',new THREE.BufferAttribute(this.particlePositions,3));
    this.particles = new THREE.Points(particleGeometry,new THREE.PointsMaterial({color:'#b7c8ca',size:.22,transparent:true,opacity:.42,depthWrite:false})); this.world.add(this.particles);
  }
  roadFoundation(track) {
    const positions=[], indices=[];
    for(const side of [-7,7]) {
      const base=positions.length/3;
      for(let i=0;i<=450;i++) {
        const distance=i/450*track.length,p=trackPoint(track,distance,side<0?insideLaneEdge(track,distance):side), outer=trackPoint(track,distance,side>0?35:-35); positions.push(p.x,p.y-.03,p.z,outer.x,-1,outer.z);
        if(i<450) { const a=base+i*2; indices.push(a,a+1,a+2,a+1,a+3,a+2); }
      }
    }
    const geometry=new THREE.BufferGeometry(); geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();
    this.world.add(mesh(geometry,material(track.ground,{roughness:1,side:THREE.DoubleSide})));
  }
  emitParticles(vehicle, type='dust', trail='none') {
    if(!this.particles || this.reducedMotion || this.reducedFlashes && type === 'collision') return;
    const p=surfacePoint(this.track,vehicle.distance-2,vehicle.lateral), count=type==='collision'?28:3;
    this.particles.material.color.set(type==='collision'?'#edbd77':trail==='ember'?'#f17c4a':trail==='ice'?'#87c8f2':'#b7c8ca');
    for(let i=0;i<count;i++) {
      const n=this.particleIndex++%120; this.particleLife[n]=type==='collision'?.7:.45;
      this.particlePositions.set([p.x+(Math.random()-.5)*1.6,p.y+.3,p.z+(Math.random()-.5)*1.6],n*3);
      this.particleVelocity.set([(Math.random()-.5)*4,Math.random()*2,(Math.random()-.5)*4],n*3);
    }
  }
  roadStrip(track, left, right, mat, from = 0, to = 1) {
    const positions = [], uv = [], indices = [], count = Math.ceil(900 * (to - from));
    for (let i = 0; i <= count; i++) {
      const distance = (from + (to - from) * i / count) * track.length;
      for (const value of [left, right]) { const side=typeof value==='function'?value(distance):value,p = trackPoint(track, distance, side); positions.push(p.x, p.y, p.z); uv.push(side / 7, distance / 6); }
      if (i < count) { const a = i * 2; indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geometry.setIndex(indices); geometry.computeVertexNormals();
    const road = mesh(geometry, mat); road.castShadow = false; this.world.add(road);
  }
  scenery(track) {
    const rng = random(hash(track.id)), dummy = new THREE.Object3D();
    if(track.theme==='coast'||track.theme==='alpine')this.world.add(makeVegetation(track));
    else {
    const count = track.theme === 'city' ? 140 : 230;
    const geo = track.theme === 'city' ? new THREE.BoxGeometry(1, 1, 1) : track.theme === 'desert' ? new THREE.DodecahedronGeometry(1, 0) : new THREE.ConeGeometry(1, 1, 7);
    const mat = material(track.theme === 'city' ? '#384451' : track.theme === 'desert' ? '#956e54' : '#466c59', { roughness: .9 });
    const objects = new THREE.InstancedMesh(geo, mat, count);
    const windows = track.theme === 'city' ? new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, .12), material('#789fb5', { emissive: '#689ba8', emissiveIntensity: 1.8 }), count * 24) : null;
    for (let i = 0; i < count; i++) {
      const d = rng() * track.length, side = (rng() > .5 ? 1 : -1) * (18 + rng() * 105), p = trackPoint(track, d, side);
      const tall = track.theme === 'city' ? 12 + rng() * 65 : track.theme === 'desert' ? 7 + rng() * 24 : 8 + rng() * 18;
      const width = track.theme === 'city' ? 9 + rng() * 15 : track.theme === 'desert' ? tall * .7 : tall * .35;
      const yaw = rng() * 6;
      dummy.position.set(p.x, tall / 2 - 1, p.z); dummy.scale.set(width, tall, width); dummy.rotation.set(0, yaw, 0); dummy.updateMatrix(); objects.setMatrixAt(i, dummy.matrix);
      if (windows) for (let j = 0; j < 24; j++) { const x = ((j % 4) / 3 - .5) * width * .7, z = width / 2 + .1;
        dummy.position.set(p.x + Math.cos(yaw) * x + Math.sin(yaw) * z, tall * (.12 + Math.floor(j / 4) * .14), p.z - Math.sin(yaw) * x + Math.cos(yaw) * z); dummy.scale.set(width * .12, .7, 1); dummy.rotation.set(0, yaw, 0); dummy.updateMatrix(); windows.setMatrixAt(i * 24 + j, dummy.matrix);
      }
      if (track.theme === 'city' && i % 5 === 0) {
        this.world.add(box(width + .1, .5, width + .1, material(track.accent, { emissive: track.accent, emissiveIntensity: 1.1 }), p.x, tall * .65, p.z));
      }
    }
    objects.castShadow = true; objects.receiveShadow = true; this.world.add(objects); if (windows) this.world.add(windows);
    }
    this.world.add(makeMountains(track));
    if (track.theme === 'coast') {
      const ocean = mesh(new THREE.PlaneGeometry(2500, 700), material('#79a9b5', { roughness: .2, metalness: .5 }), 0, -.75, -520); ocean.rotation.x = -Math.PI / 2; this.world.add(ocean);
    }
  }
  vehicle(id, vehicle, color, options = {}) {
    if (!this.cars.has(id)) { const car = makeCar(vehicle.carId, color, options); this.cars.set(id, car); this.world.add(car); }
    const car = this.cars.get(id), p = surfacePoint(this.track, vehicle.distance, vehicle.lateral);
    car.position.set(p.x, p.y + .06, p.z); car.rotation.order='YXZ';car.rotation.set(surfacePitch(this.track,vehicle.distance,vehicle.lateral,vehicle.heading),p.yaw + vehicle.heading,0);
    const now=performance.now(), delta=options.animate===false?0:Math.min(.1,(now-(car.userData.poseTime||now))/1000);car.userData.poseTime=now;
    updateCarBody(car,vehicle,p.yaw+vehicle.heading,delta,this.reducedMotion);
    updateCarWheels(car,vehicle,delta);
    car.userData.flames.forEach(flame => { flame.visible = vehicle.boost && !this.reducedFlashes; flame.scale.y = this.reducedMotion ? 1 : .85 + Math.sin(performance.now() * .04) * .15; });
    car.userData.brakeLights.forEach(light => {light.material.emissiveIntensity = vehicle.braking ? 2.5 : .65;});
    car.userData.eliminated=Boolean(vehicle.eliminated);car.visible=!vehicle.eliminated&&(id!=='player'||this.drivingView!=='road');return p;
  }
  pruneVehicles(activeIds) {
    const active=new Set(activeIds);
    for(const [id,car] of this.cars) if(!active.has(id)){car.removeFromParent();disposeGroup(car);this.cars.delete(id);}
  }
  dispose() {
    this.resizeObserver.disconnect();disposeGroup(this.world);this.world.removeFromParent();this.cars.clear();
    this.texture.dispose();this.environment.dispose();this.scene.environment=null;
    this.composer.passes.forEach(pass=>pass.dispose?.());this.composer.dispose();this.renderer.dispose();
  }
  render(dt, focus) {
    if (this.menu) {
      if (this.camera.view?.enabled && this.garageScroll !== window.scrollY) {
        this.garageScroll=window.scrollY;const offset=this.garageOffset;
        this.camera.setViewOffset(offset.w,700,offset.x,offset.y+this.garageScroll,offset.w,offset.h);
      }
      if (!this.reducedMotion) this.displayCar.rotation.y += dt * .08;
    } else if (focus) {
      const p = surfacePoint(this.track,focus.distance,focus.lateral), view=this.drivingView||'chase',pose=drivingCamera(this.track,focus,view,this.reducedMotion),yaw=pose.yaw;
      const target = new THREE.Vector3(...pose.position),changed=view!==this.lastView;
      if(!changed&&view!=='road'&&dt>0){
        // Cancel translation lag from exponential following while retaining smooth
        // turns/height changes. This keeps a fast car at the chosen viewing distance.
        const lead=dt/Math.expm1(dt*6),heading=focus.heading||0;
        const future=surfacePoint(this.track,focus.distance+Math.cos(heading)*focus.speed*lead,focus.lateral+Math.sin(heading)*focus.speed*lead);
        target.add(new THREE.Vector3(future.x-p.x,future.y-p.y,future.z-p.z));
      }
      if(changed||view==='road'){this.camera.position.copy(target);if(changed)this.camera.fov=pose.fov;this.lastView=view;}else this.camera.position.lerp(target,1-Math.exp(-dt*6));
      this.camera.lookAt(...pose.lookAt);
      this.camera.fov = THREE.MathUtils.lerp(this.camera.fov,pose.fov,dt*3);this.camera.updateProjectionMatrix();
      this.sun.position.set(p.x - 35, p.y + 70, p.z + 30); this.sun.target.position.set(p.x, p.y, p.z);
      if (this.headlight) { this.headlight.position.set(p.x + Math.sin(yaw) * 2, p.y + 1, p.z + Math.cos(yaw) * 2); this.headlight.target.position.set(p.x + Math.sin(yaw) * 25, p.y + .1, p.z + Math.cos(yaw) * 25); }
      if(this.night)updateNightLights(this.night,focus.distance,this.track.length,this.qualityLevel!=='low');
      if (this.rain) { this.rain.position.set(p.x, p.y, p.z); const a = this.rain.geometry.attributes.position; for (let i = 0; i < a.count; i++) a.setY(i, wrap(a.getY(i) - dt * 30, 50)); a.needsUpdate = true; }
      if(this.particles) {
        for(let i=0;i<120;i++) { this.particleLife[i]-=dt; if(this.particleLife[i]>0) { for(let k=0;k<3;k++) this.particlePositions[i*3+k]+=this.particleVelocity[i*3+k]*dt; } else this.particlePositions[i*3+1]=-100; }
        this.particles.geometry.attributes.position.needsUpdate=true;
      }
    }
    this.composer.render();
  }
}
