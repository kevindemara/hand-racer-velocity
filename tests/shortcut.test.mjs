import test from 'node:test';
import assert from 'node:assert/strict';
import { createVehicle, buildTrack, stepVehicle } from '../shared/racing.js';
test('signed inside lane increases pace only within the shortcut section', () => {
  const track = buildTrack(), distance = track.length * .42;
  const inside = { ...createVehicle(), distance, lateral: -10, speed: 50 }, outside = { ...createVehicle(), distance, lateral: 10, speed: 50 };
  stepVehicle(inside, { throttle: 1 }, 1/60, track); stepVehicle(outside, { throttle: 1 }, 1/60, track);
  assert.ok(inside.distance - distance > (outside.distance - distance) * 1.2);
  inside.distance = track.length * .6; inside.speed = 50; stepVehicle(inside, { throttle: 1 }, 1/60, track); assert.ok(inside.speed < 40);
});
test('finish stops the car and cannot advance its timer or emit another finish', () => {
  const track = buildTrack(), vehicle = { ...createVehicle(), distance: track.length - .1, speed: 40 };
  const first = stepVehicle(vehicle, { throttle: 1, nitro: true }, 1/60, track); assert.ok(first.includes('finish')); assert.equal(vehicle.speed, 0); assert.equal(vehicle.boost, false);
  const time = vehicle.time; assert.deepEqual(stepVehicle(vehicle, { throttle: 1 }, 1/60, track), []); assert.equal(vehicle.time, time);
});
