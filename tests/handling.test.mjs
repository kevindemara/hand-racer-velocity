import test from 'node:test';
import assert from 'node:assert/strict';
import { CARS, TRACKS, buildTrack, createVehicle, stepVehicle, botInput, makeHazards, trackSurface, steeringGain } from '../shared/racing.js';

const straight = { length: 1000, width: 14, grip: 1, points: [{ x: 0, y: 0, z: 0, distance: 0 }, { x: 0, y: 0, z: 1000, distance: 1000 }] };

test('short full-steer corrections remain within a lane at every car’s racing speed', () => {
  for (const car of CARS) for (const sign of [-1, 1]) {
    const vehicle = { ...createVehicle(car.id), speed: car.speed };
    for (let frame = 0; frame < 18; frame++) stepVehicle(vehicle, { throttle: 1, steer: sign }, 1 / 60, straight, { assist: false });
    assert.ok(Math.abs(vehicle.lateral) > 2 && Math.abs(vehicle.lateral) < straight.width / 4, `${car.id} can correct a lane without crossing half the road in 300ms`);
    assert.ok(vehicle.lateral * sign < 0);
    assert.equal(vehicle.steering, sign, 'the authoritative wheel command retains its direction');
  }
});

test('low-speed maneuvering retains full response; racing and boost speeds reduce steering progressively', () => {
  for (const speed of [0, 6, 12, 18]) assert.equal(steeringGain(speed), 1);
  const gains = [18, 30, 60, 74, 99, 140].map(steeringGain);
  for (let index = 1; index < gains.length; index++) assert.ok(gains[index] <= gains[index - 1]);
  assert.ok(gains.every(value => value >= .45 && value <= 1));
  for (const speed of [0, 12, 60, 99]) {
    const vehicle = { ...createVehicle('vector'), speed };
    stepVehicle(vehicle, { steer: 1 }, 1 / 60, straight, { assist: false });
    if (!speed) assert.equal(vehicle.heading, 0); else assert.ok(vehicle.heading < 0);
  }
});

test('high-speed steering has consistent direction and comparable response across display frame rates', () => {
  const runs = [30, 60, 120].map(fps => {
    const vehicle = { ...createVehicle('vector'), speed: 74 };
    for (let frame = 0; frame < fps * .3; frame++) stepVehicle(vehicle, { throttle: 1, steer: 1 }, 1 / fps, straight, { assist: false });
    return vehicle;
  });
  assert.ok(Math.max(...runs.map(v => v.heading)) - Math.min(...runs.map(v => v.heading)) < .004);
  assert.ok(Math.max(...runs.map(v => v.lateral)) - Math.min(...runs.map(v => v.lateral)) < .3);
});

test('all eleven cars finish every course and difficulty with speed-sensitive steering', () => {
  for (const course of TRACKS) for (const difficulty of ['easy', 'normal', 'hard']) for (const car of CARS) {
    const track = buildTrack(course.id), hazards = makeHazards(track, difficulty), vehicle = createVehicle(car.id);
    let rough = 0, frames = 0;
    while (frames < 18000 && !vehicle.finished) {
      if (trackSurface(track, vehicle.distance, vehicle.lateral) === 'rough') rough++;
      stepVehicle(vehicle, botInput(vehicle, track, difficulty, 0, hazards), 1 / 60, track, { difficulty, hazards });
      frames++;
    }
    assert.ok(vehicle.finished, `${course.id}/${difficulty}/${car.id}`);
    assert.ok(rough / frames < .02, `${course.id}/${difficulty}/${car.id}: bots maintain the road without prolonged shoulder driving (${(100 * rough / frames).toFixed(1)}%)`);
  }
});
