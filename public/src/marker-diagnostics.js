import { RacingRenderer } from './renderer.js';
import { TRACKS, buildTrack, makeHazards, createVehicle } from '../../shared/racing.js';

const course=document.getElementById('marker-course'),choice=document.getElementById('marker-choice'),status=document.getElementById('marker-status');
for(const track of TRACKS){const option=document.createElement('option');option.value=track.id;option.textContent=track.name;course.append(option);}
let renderer,vehicle,frame;
document.getElementById('inspect-markers').onclick=()=>{
  try {
    renderer?.dispose();renderer=null;
    document.getElementById('marker-preview').hidden=false;
    const track=buildTrack(course.value),hazards=makeHazards(track),hazard=hazards.find(h=>h.type===choice.value);
    const distance=hazard?.distance || track.length*.39,lateral=hazard?.lateral ?? -10;
    renderer=new RacingRenderer(document.getElementById('marker-canvas'));renderer.quality('medium',false,false);renderer.drivingView='road';
    renderer.trackWorld(track,hazards);vehicle={...createVehicle('nova'),distance:distance-16,lateral};renderer.vehicle('player',vehicle,undefined,{animate:false});
    status.textContent=`${track.name} / ${choice.selectedOptions[0].textContent} · static road view, 16m before the marking`;
  }catch(error){status.textContent=`Preview failed: ${error.message}`;renderer?.dispose();renderer=null;}
};
function draw(){frame=requestAnimationFrame(draw);if(renderer)renderer.render(0,vehicle);}draw();
window.addEventListener('pagehide',()=>{cancelAnimationFrame(frame);renderer?.dispose();renderer=null;});
