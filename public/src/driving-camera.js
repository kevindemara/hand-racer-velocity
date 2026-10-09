import {surfacePoint} from './scene-details.js';

export function drivingCamera(track,vehicle,view='chase',reducedMotion=false) {
  const p=surfacePoint(track,vehicle.distance,vehicle.lateral),hood=view==='road',wide=view==='wide';
  const yaw=p.yaw+(vehicle.heading||0)*(hood?1:.7),boost=vehicle.boost&&!reducedMotion;
  if(hood){
    const near=surfacePoint(track,vehicle.distance+2.8*Math.cos(vehicle.heading||0),vehicle.lateral+2.8*Math.sin(vehicle.heading||0));
    const ahead=surfacePoint(track,vehicle.distance+35*Math.cos(vehicle.heading||0),vehicle.lateral+35*Math.sin(vehicle.heading||0));
    return {position:[p.x+Math.sin(yaw)*2.8,near.y+1.15,p.z+Math.cos(yaw)*2.8],lookAt:[p.x+Math.sin(yaw)*35,ahead.y+.75,p.z+Math.cos(yaw)*35],fov:boost?78:70,yaw};
  }
  const distance=(wide?14:9)+(boost?2:0);
  return {position:[p.x-Math.sin(yaw)*distance,p.y+(wide?6.5:4.5),p.z-Math.cos(yaw)*distance],lookAt:[p.x+Math.sin(yaw)*10,p.y+1.2,p.z+Math.cos(yaw)*10],fov:(wide?58:54)+(boost?12:0),yaw};
}
