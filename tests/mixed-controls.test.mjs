import test from 'node:test';
import assert from 'node:assert/strict';
import { DrivingInput } from '../public/src/input.js';

function setup(state = { tracked: true, calibrated: true, throttle: 1, brake: 0, steer: .4 }) {
  const listeners = {};
  globalThis.window = { addEventListener: (event, callback) => { listeners[event] = callback; } };
  globalThis.document = { querySelectorAll: () => [] };
  let pads = [];
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { getGamepads: () => pads } });
  const input = new DrivingInput({ gamepadDeadzone: .2, bindings: { throttle: 'KeyW', brake: 'Space', left: 'KeyA', right: 'KeyD', nitro: 'ShiftLeft', drift: 'KeyX' } });
  return { input, webcam: { active: true, state }, listeners, setPads: value => { pads = value; } };
}

test('manual steering retains hand acceleration, braking and secondary controls', () => {
  const { input, webcam, listeners } = setup();
  input.keys.add('KeyA'); input.keys.add('ShiftLeft'); input.keys.add('KeyX');
  assert.deepEqual(input.read(webcam), { throttle: 1, brake: 0, steer: -1, nitro: true, drift: true });
  webcam.state.throttle = 0; webcam.state.brake = 1;
  assert.equal(input.read(webcam).brake, 1);
  input.keys.add('KeyD'); assert.equal(input.read(webcam).steer, 0);
  listeners.blur(); assert.equal(input.read(webcam).steer, .4);
  input.touch.right = true; assert.equal(input.read(webcam).steer, 1);
  assert.equal(input.read(webcam).brake, 1);
});

test('manual pedals retain hand steering and replace both camera pedals', () => {
  const { input, webcam } = setup();
  input.keys.add('Space');
  assert.deepEqual(input.read(webcam), { throttle: 0, brake: 1, steer: .4, nitro: false, drift: false });
  input.keys.clear(); webcam.state.throttle = 0; webcam.state.brake = 1;
  input.touch.throttle = true;
  assert.deepEqual(input.read(webcam), { throttle: 1, brake: 0, steer: .4, nitro: false, drift: false });
  input.touch = {}; assert.equal(input.read(webcam).brake, 1);
});

test('controller axes override independently and return to the hand when released or disconnected', () => {
  const { input, webcam, setPads } = setup();
  const pad = { connected: true, axes: [.6], buttons: Array.from({ length: 8 }, () => ({ value: 0, pressed: false })) };
  setPads([pad]);
  assert.ok(Math.abs(input.read(webcam).steer - .5) < 1e-9);
  assert.equal(input.read(webcam).throttle, 1);
  pad.axes[0] = .19; pad.buttons[6].value = .65;
  assert.deepEqual(input.read(webcam), { throttle: 0, brake: .65, steer: .4, nitro: false, drift: false });
  setPads([]); assert.equal(input.read(webcam).throttle, 1); assert.equal(input.read(webcam).steer, .4);
});

test('missing or uncalibrated tracking neutralizes stale hand input while keeping manual recovery', () => {
  for (const state of [undefined, { tracked: false, calibrated: true, throttle: 1, steer: .9 }, { tracked: true, calibrated: false, throttle: 1, steer: -.8 }]) {
    const { input, webcam } = setup(); webcam.state = state;
    assert.deepEqual(input.read(webcam), { throttle: 0, brake: 1, steer: 0, nitro: false, drift: false });
    input.keys.add('KeyA'); assert.equal(input.read(webcam).brake, 1);
    input.keys.add('KeyW'); assert.deepEqual(input.read(webcam), { throttle: 1, brake: 0, steer: -1, nitro: false, drift: false });
    input.keys.clear(); webcam.active = false;
    assert.deepEqual(input.read(webcam), { throttle: 0, brake: 0, steer: 0, nitro: false, drift: false });
  }
});
