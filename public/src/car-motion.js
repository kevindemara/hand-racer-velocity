import {angleDifference,clamp} from '../../shared/racing.js';

export function updateCarWheels(car,vehicle,dt) {
  if (!(dt>0)) return;
  // Keep steering around the upright axle separate from rolling around the hub.
  const steering = -(vehicle.steering || 0) * (.42 / (1 + Math.max(0,vehicle.speed) / 75));
  const weight=1-Math.exp(-dt*14);
  for (const wheel of car.userData.wheelGroups) {
    wheel.userData.spin.rotation.x += Math.max(0,vehicle.speed)*dt / wheel.userData.radius;
    wheel.rotation.y += ((wheel.userData.front ? steering : 0)-wheel.rotation.y)*weight;
  }
}

export function updateCarBody(car,vehicle,yaw,dt,reducedMotion=false) {
  const data=car.userData,body=data.bodyRig;
  const previous=data.motion || {speed:vehicle.speed,yaw};
  if(reducedMotion||vehicle.finished){body.rotation.x=body.rotation.z=0;data.motion={speed:vehicle.speed,yaw};return;}
  if(dt>0){
    const acceleration=(vehicle.speed-previous.speed)/dt,turnRate=angleDifference(yaw,previous.yaw)/dt;
    const factor=data.suspensionFactor||1,weight=1-Math.exp(-dt*10);
    const pitch=clamp(-acceleration*.0012*factor,-.035,.04);
    const roll=clamp(turnRate*vehicle.speed*.004*factor,-.11,.11);
    body.rotation.x+=(pitch-body.rotation.x)*weight;body.rotation.z+=(roll-body.rotation.z)*weight;
  }
  data.motion={speed:vehicle.speed,yaw};
}
