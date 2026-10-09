import test from 'node:test';
import assert from 'node:assert/strict';
import { CARS, buildTrack, createVehicle, stepVehicle } from '../shared/racing.js';
import { garagePerformance, performanceRows } from '../public/src/garage-performance.js';

test('garage speed and 0–100 measurements match actual unboosted driving for every car and setup', () => {
  const track = buildTrack('coast');
  for (const car of CARS) for (const tuning of ['balanced', 'grip', 'speed']) {
    const stats = garagePerformance(car.id, tuning), accelerating = createVehicle(car.id, tuning);
    for (let frame = 0; frame < 600 && accelerating.speed < 100 / 3.6; frame++) stepVehicle(accelerating, { throttle: 1 }, 1 / 60, track, { assist: false });
    assert.equal(stats.zeroToHundred, accelerating.time, `${car.id}/${tuning} 0–100 uses actual physics`);
    const atLimit = { ...createVehicle(car.id, tuning), speed: stats.topSpeed / 3.6 + 1 };
    stepVehicle(atLimit, { throttle: 1 }, 1 / 60, track);
    assert.ok(Math.abs(atLimit.speed * 3.6 - stats.topSpeed) < 1e-8, 'displayed top speed is the actual road limit');
    assert.ok(performanceRows(car.id, tuning).every(row => Number.isFinite(row.percent) && row.percent >= 0 && row.percent <= 1));
  }
});

test('setup comparisons expose their speed/grip tradeoff while retaining car durability', () => {
  const balanced = garagePerformance('vector'), grip = garagePerformance('vector', 'grip'), speed = garagePerformance('vector', 'speed');
  assert.ok(grip.grip > balanced.grip && balanced.grip > speed.grip);
  assert.ok(speed.topSpeed > balanced.topSpeed && balanced.topSpeed > grip.topSpeed);
  assert.equal(grip.durability, balanced.durability); assert.equal(speed.durability, balanced.durability);
  assert.equal(balanced.durability, .65); assert.equal(garagePerformance('apex').durability, 1);
  for (const invalid of ['missing', 'toString', 'constructor']) {
    assert.deepEqual(garagePerformance('vector', invalid), balanced);
    const vehicle = createVehicle('vector', invalid); stepVehicle(vehicle, { throttle: 1 }, 1 / 60, buildTrack());
    assert.ok(Number.isFinite(vehicle.speed) && Number.isFinite(vehicle.heading));
  }
});
