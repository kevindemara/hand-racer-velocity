const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

// Exercise the actual game lifecycle without needing a GPU, webcam or real timers.
function harness({ storageBlocked = false, cameraRequest } = {}) {
  const elements = new Map();
  const storage = new Map();
  const events = [];
  const sockets = [];
  const colliders = [];
  const groups = [];
  function element(id) {
    if (!elements.has(id)) elements.set(id, {
      hidden: true, value: '', checked: false, textContent: '', disabled: false,
      srcObject: null, play: async () => {}
    });
    return elements.get(id);
  }
  function object(x = 0, y = 0) {
    const value = {
      x, y, body: { velocity: { x: 0, y: 0 } }, destroyed: false,
      setPosition(x, y) { this.x = x; this.y = y; return this; },
      setX(x) { this.x = x; return this; }, setY(y) { this.y = y; return this; },
      setVelocity(x, y = x) { this.body.velocity = { x, y }; return this; },
      setVelocityX(x) { this.body.velocity.x = x; return this; },
      setVelocityY(y) { this.body.velocity.y = y; return this; },
      setText(text) { this.text = text; return this; },
      setVisible(visible) { this.visible = visible; return this; },
      destroy() { this.destroyed = true; }
    };
    // These render/body configuration calls have no bearing on the lifecycle.
    for (const method of ['setDepth', 'setOrigin', 'setPadding', 'setInteractive',
      'setAlpha', 'setSize', 'setCollideWorldBounds', 'setScale', 'setImmovable', 'on']) {
      value[method] = function () { return this; };
    }
    return value;
  }
  const scene = {
    add: { image: object, rectangle: object, text: object, tileSprite: object },
    input: { keyboard: { addKeys: () => Object.fromEntries(
      ['UP', 'LEFT', 'RIGHT', 'W', 'A', 'D', 'SPACE'].map(key => [key, { isDown: false }])) } },
    sound: { add: () => ({ play() {}, stop() {} }), play() {} },
    time: {
      now: 0,
      addEvent(options) {
        const event = { ...options, removed: false, remove() { this.removed = true; } };
        events.push(event);
        return event;
      },
      delayedCall(delay, callback) { return this.addEvent({ delay, callback }); }
    },
    physics: {
      world: { setBounds() {} },
      add: {
        image: object,
        group() {
          const children = [];
          const group = {
            create(x, y) { const child = object(x, y); children.push(child); return child; },
            setVelocityY(y) { children.forEach(child => child.setVelocityY(y)); },
            clear() { children.length = 0; },
            destroy() { this.destroyed = true; }, destroyed: false
          };
          groups.push(group);
          return group;
        },
        overlap() { const collider = { destroy() { this.destroyed = true; } }; colliders.push(collider); return collider; },
        collider() { return this.overlap(); }
      }
    }
  };
  const context = vm.createContext({
    document: { getElementById: element },
    window: { addEventListener() {} },
    localStorage: {
      getItem(key) { if (storageBlocked) throw new Error('blocked'); return storage.get(key) ?? null; },
      setItem(key, value) { if (storageBlocked) throw new Error('blocked'); storage.set(key, value); }
    },
    navigator: { mediaDevices: { getUserMedia: cameraRequest || (() => Promise.reject(new Error('denied'))) } },
    handpose: { load: async () => ({ estimateHands: async () => [] }) },
    requestAnimationFrame: () => 1, cancelAnimationFrame() {},
    Phaser: { AUTO: 0, Scale: { FIT: 0, CENTER_BOTH: 0 },
      Math: { Between: (min, max) => (min + max) / 2 }, Game: class {} },
    io() {
      const socket = {
        id: 'local-driver', connected: true, handlers: {}, sent: [],
        on(event, callback) { this.handlers[event] = callback; },
        emit(event, data) { this.sent.push({ event, data }); },
        disconnect() { this.connected = false; }
      };
      sockets.push(socket);
      return socket;
    },
    scene
  });
  vm.runInContext(fs.readFileSync(require.resolve('../public/game.js'), 'utf8'), context);
  const run = code => vm.runInContext(code, context);
  run('create.call(scene)');
  function countdown() {
    const event = events.findLast(event => event.repeat === 2 && !event.removed);
    for (let i = 0; i < 3; i++) { scene.time.now += 1000; event.callback(); }
  }
  function laps(count, startTime = 4000, interval = 1000) {
    for (let i = 0; i < count; i++) {
      context.tick = startTime + i * interval;
      run('car.y = -1; update(tick)');
    }
  }
  return { run, element, storage, countdown, laps, events, sockets, colliders, groups, scene };
}

test('solo counts down, finishes exactly 30 laps and never joins multiplayer', () => {
  const h = harness();
  h.element('single-player').onclick();
  assert.equal(h.run('raceStarted'), false);
  assert.equal(h.run('countdownText.text'), '3');
  h.countdown();
  assert.equal(h.run('raceStarted'), true);
  h.laps(29);
  assert.equal(h.element('results').hidden, true);
  h.laps(1, 33000);
  assert.equal(h.element('result-title').textContent, 'Time trial complete');
  assert.equal(h.element('result-time').textContent, '30.00s');
  assert.equal(h.storage.get('hand-racer-velocity-solo-best'), '30');
  assert.equal(h.run('car.body.velocity.y'), 0);
  assert.equal(h.sockets.length, 0);
});

test('replay clears hazards, colliders, boosts and lap state, preserving faster bests', () => {
  const h = harness();
  h.element('single-player').onclick();
  h.countdown();
  h.laps(30);
  h.run('boostTimer = 100; slowTimer = 100; car.x = 700');
  h.element('race-again').onclick();
  assert.equal(h.run('lapCount'), 1);
  assert.equal(h.run('boostTimer + slowTimer'), 0);
  assert.equal(h.run('car.x'), 400);
  assert.equal(h.element('results').hidden, true);
  assert.ok(h.colliders.every(collider => collider.destroyed));
  assert.ok(h.groups.every(group => group.destroyed));
  h.countdown();
  h.laps(30, 20000);
  assert.equal(h.storage.get('hand-racer-velocity-solo-best'), '30');
  assert.equal(h.element('result-best').textContent, 'Best: 30.00s');
  h.element('race-again').onclick();
  h.countdown();
  h.laps(30, h.scene.time.now + 1000, 300);
  assert.equal(h.storage.get('hand-racer-velocity-solo-best'), '9.7');
  assert.match(h.element('result-best').textContent, /New personal best/);
});

test('blocked browser storage does not prevent results or replay', () => {
  const h = harness({ storageBlocked: true });
  h.element('single-player').onclick();
  h.countdown();
  h.laps(30);
  assert.equal(h.element('results').hidden, false);
  assert.match(h.element('result-best').textContent, /could not be saved/);
  h.element('race-again').onclick();
  h.countdown();
  assert.equal(h.run('raceStarted'), true);
});

test('menu cancels countdowns and allows switching modes', () => {
  const h = harness();
  h.element('single-player').onclick();
  h.element('back-to-menu').onclick();
  assert.ok(h.events.every(event => event.removed));
  assert.equal(h.element('menu').hidden, false);
  assert.equal(h.run('car'), null);
  h.element('multiplayer').onclick();
  assert.equal(h.sockets[0].sent[0].event, 'join-game');
  h.element('back-to-menu').onclick();
  assert.equal(h.sockets[0].connected, false);
  h.element('single-player').onclick();
  h.countdown();
  assert.equal(h.run('gameMode'), 'solo');
  assert.equal(h.sockets.length, 1);
});

test('keyboard acceleration, steering and braking work without gesture tracking', () => {
  const h = harness();
  h.element('single-player').onclick();
  h.countdown();
  h.run('keys.W.isDown = true; keys.A.isDown = true; update(4000)');
  assert.equal(h.run('car.body.velocity.y'), -200);
  assert.equal(h.run('car.body.velocity.x'), -150);
  h.run('keys.SPACE.isDown = true; update(4016)');
  assert.equal(h.run('car.body.velocity.x + car.body.velocity.y'), 0);
});

test('multiplayer finish submits once and rematch waits for server countdown', () => {
  const h = harness();
  h.element('multiplayer').onclick();
  const socket = h.sockets[0];
  socket.handlers.waiting();
  socket.handlers['both-ready']({ 'local-driver': 'Player', opponent: 'Other' });
  socket.handlers.countdown(3);
  h.scene.time.now = 3000;
  socket.handlers['start-race']();
  h.laps(30);
  h.run('update(40000)');
  assert.equal(socket.sent.filter(message => message.event === 'finish').length, 1);
  assert.equal(h.element('race-again').disabled, true);
  assert.equal(h.storage.size, 0);
  socket.handlers['declare-winner']({ winnerName: 'Player', leaderboard: [{ name: 'Player', time: 30 }] });
  h.element('race-again').onclick();
  assert.equal(socket.sent.at(-1).event, 'rematch-request');
  socket.handlers['rematch-start']();
  assert.equal(h.run('raceStarted'), false);
  assert.equal(h.run('lapCount'), 1);
  socket.handlers.countdown(3);
  socket.handlers['start-race']();
  assert.equal(h.run('raceStarted'), true);
});

test('camera denial falls back to keyboard controls without breaking solo', async () => {
  const h = harness();
  h.element('use-camera').checked = true;
  h.element('single-player').onclick();
  await new Promise(resolve => setImmediate(resolve));
  assert.match(h.element('control-status').textContent, /Webcam unavailable/);
  h.countdown();
  assert.equal(h.run('raceStarted'), true);
});

test('opponent leaving during countdown does not start an abandoned race', () => {
  const h = harness();
  h.element('multiplayer').onclick();
  const socket = h.sockets[0];
  socket.handlers.countdown(3);
  socket.handlers['opponent-disconnected']();
  socket.handlers.countdown(2);
  socket.handlers['start-race']();
  assert.equal(h.run('raceStarted'), false);
  assert.equal(h.element('result-title').textContent, 'Opponent disconnected');
  assert.equal(h.element('race-again').disabled, true);
});

test('camera permission resolving after menu exit releases the unused stream', async () => {
  let resolveCamera;
  let stopped = false;
  const h = harness({ cameraRequest: () => new Promise(resolve => { resolveCamera = resolve; }) });
  h.element('use-camera').checked = true;
  h.element('single-player').onclick();
  h.element('back-to-menu').onclick();
  resolveCamera({ getTracks: () => [{ stop() { stopped = true; } }] });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(stopped, true);
  assert.equal(h.element('webcam').srcObject, null);
});
