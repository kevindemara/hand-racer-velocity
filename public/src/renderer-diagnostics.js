import { RacingRenderer } from './renderer.js';
import { TRACKS, buildTrack, makeHazards, createVehicle } from '../../shared/racing.js';

const button=document.getElementById('run-graphics'),status=document.getElementById('graphics-status');
const nextFrame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
button.onclick=async()=>{
  button.disabled=true;document.getElementById('graphics-preview').hidden=false;
  let renderer;
  try {
    renderer=new RacingRenderer(document.getElementById('graphics-canvas'));renderer.quality('medium',true,false);
    // Warm the shared asphalt texture before taking the retained-resource baseline.
    const loadDeadline=performance.now()+10000;
    while(!renderer.texture.image){if(performance.now()>loadDeadline)throw Error('Asphalt texture did not load');await nextFrame();}
    const warm=buildTrack();renderer.trackWorld(warm,makeHazards(warm));renderer.vehicle('test',createVehicle());renderer.render(1/60,createVehicle());
    renderer.garage('apex');renderer.render(1/60);await nextFrame();
    const baseline={...renderer.renderer.info.memory};let built=0,disposed=0;
    for(let i=0;i<12;i++){
      status.textContent=`Checking environment ${i+1} / 12…`;
      const track=buildTrack(TRACKS[i%TRACKS.length].id),vehicle=createVehicle();
      renderer.trackWorld(track,makeHazards(track));renderer.vehicle('test',vehicle);
      renderer.world.traverse(object=>{if(object.isInstancedMesh){built++;object.addEventListener('dispose',()=>disposed++);}});
      renderer.render(1/60,vehicle);await nextFrame();renderer.garage('apex');renderer.render(1/60);await nextFrame();
    }
    const retained={...renderer.renderer.info.memory};
    const pass=retained.geometries<=baseline.geometries && retained.textures<=baseline.textures && built===disposed;
    status.textContent=`${pass?'PASS':'FAIL'}: 12 environment/garage cycles\nGeometries: ${baseline.geometries} → ${retained.geometries}\nTextures: ${baseline.textures} → ${retained.textures}\nInstanced meshes disposed: ${disposed} / ${built}`;
  }catch(error){status.textContent=`FAIL: ${error.message}`;console.error(error);}
  finally{renderer?.dispose();button.disabled=false;}
};
