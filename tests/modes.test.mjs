import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceMode, awardChampionship, championshipTracks } from '../shared/modes.js';
import { createVehicle } from '../shared/racing.js';
const race = mode => ({ config: { mode }, vehicle: createVehicle(), bots: [createVehicle(), createVehicle(), createVehicle()], eliminationLap: 0, checkpointDeadline: 12 });
test('elimination is triggered by the leading driver and cannot eliminate twice for a lap', () => {
  const r = race('elimination'); r.vehicle.distance = 100; r.bots[0].distance = 1500; r.bots[0].laps = [35]; r.bots[1].distance = 80; r.bots[2].distance = 60;
  assert.equal(advanceMode(r, []), null); assert.equal(r.bots[2].eliminated, true);
  advanceMode(r, []); assert.equal(r.bots[1].eliminated, false);
  r.bots[0].laps.push(35); r.vehicle.distance = 50;
  assert.equal(advanceMode(r, []), 'Eliminated'); assert.equal(r.vehicle.eliminated, true);
});
test('survival ends after three hits or succeeds at 90 seconds', () => {
  const r = race('survival'); r.vehicle.collisions = 2; assert.equal(advanceMode(r, []), null);
  r.vehicle.collisions = 3; assert.equal(advanceMode(r, []), 'Out of strikes'); assert.equal(r.vehicle.finished, false);
  r.vehicle.collisions = 0; r.vehicle.time = 90; r.survivalProgress = 90; assert.equal(advanceMode(r, []), 'Survived the run!'); assert.equal(r.vehicle.finished, true);
  const idle = race('survival'); idle.vehicle.time = 13; assert.equal(advanceMode(idle, []), 'Keep moving to survive');
});
test('checkpoint rush awards time but limits banking and ends when late', () => {
  const r = race('checkpoint'); r.vehicle.time = 2; advanceMode(r, ['checkpoint']); assert.equal(r.checkpointDeadline, 16);
  advanceMode(r, ['checkpoint']); assert.equal(r.checkpointDeadline, 17);
  r.vehicle.time = 18; assert.equal(advanceMode(r, []), 'Time ran out');
});
test('championship awards a title only after four rounds with enough points', () => {
  const series = { round: 0, points: 0, results: [] };
  championshipTracks.forEach((track, i) => { series.round = i; assert.equal(awardChampionship(series, track, 2), i === 3); });
  assert.equal(series.points, 36); assert.equal(series.results.length, 4);
  assert.equal(awardChampionship({ round: 3, points: 0, results: [] }, 'city', 4), false);
});
