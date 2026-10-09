// Hand Racer – Velocity: solo time trials and multiplayer races.

let handposeModel;
let webcam;
let currentGesture = 'None';
let previousGesture = 'None';
let gestureConfidence = 0;
let tiltDirection = null;
let smoothedDx = 0;
let frameCount = 0;

let boostTimer = 0;
let slowTimer = 0;
let raceStarted = false;
let countdownText;
let countdownEvent, goEvent;
let finishLineReached = false;

let car, opponentCar;
let road;
let speedText, gestureText, lapText, tiltText, versusText, waitingText;
let lapCount = 1;
let powerUps, obstacles;
let raceStartTime;
let titleScreen, keys, timerText;
let powerUpCollider, obstacleCollider;
let backgroundMusic, raceMusic, muteButton, flashOverlay;
let isMuted = false;

let username = 'Player';
let socket;
let gameMode = null;
let cameraSession = 0;
let detectionFrame;
let handposeLoading;

const TOTAL_LAPS = 30;
const SOLO_BEST_KEY = 'hand-racer-velocity-solo-best';
const ui = Object.fromEntries([
  'menu', 'username', 'use-camera', 'single-player', 'multiplayer',
  'race-tools', 'back-to-menu', 'control-status', 'results', 'result-title',
  'result-time', 'result-best', 'result-board', 'race-again', 'results-menu'
].map(id => [id, document.getElementById(id)]));

const SMOOTHING_FACTOR = 0.75;
const DX_THRESHOLD = 8;

const config = {
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  parent: 'game-root',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  physics: {
    default: 'arcade',
    arcade: { debug: false }
  },
  scene: { preload, create, update }
};

function preload() {
  this.load.audio('boostSound', 'assets/sfx/boost.mp3');
  this.load.audio('obstacleHitSound', 'assets/sfx/hit.mp3');
  this.load.audio('finishSound', 'assets/sfx/finish.mp3');
  this.load.audio('countdownBeep', 'assets/sfx/beep.mp3');
  this.load.audio('bgMusic', 'assets/sfx/music.mp3');
  this.load.audio('menuMusic', 'assets/sfx/menumusic.mp3');
  this.load.image('car', 'assets/car.png');
  this.load.image('car2', 'assets/car2.png');
  this.load.image('road', 'assets/road.png');
  this.load.image('obstacle', 'assets/obstacle.png');
  this.load.image('power-up', 'assets/power-up.png');
  this.load.image('titlescreen', 'assets/titlescreen.jpg');
}

function create() {
  titleScreen = this.add.image(400, 300, 'titlescreen').setDepth(10);
  backgroundMusic = this.sound.add('menuMusic', { loop: true, volume: 0.5 });
  raceMusic = this.sound.add('bgMusic', { loop: true, volume: 0.5 });
  backgroundMusic.play();

  muteButton = this.add.text(740, 548, '🔊', { fontSize: '32px', fill: '#fff', backgroundColor: '#333' })
    .setPadding(4).setInteractive().setDepth(20)
    .on('pointerdown', () => {
      isMuted = !isMuted;
      this.sound.mute = isMuted;
      muteButton.setText(isMuted ? '🔇' : '🔊');
    });

  flashOverlay = this.add.rectangle(400, 300, 800, 600, 0xffffff, 0).setDepth(30).setAlpha(0);

  keys = this.input.keyboard.addKeys('UP,LEFT,RIGHT,W,A,D,SPACE', false);
  ui['single-player'].onclick = () => startMode(this, 'solo');
  ui.multiplayer.onclick = () => startMode(this, 'multiplayer');
  ui['back-to-menu'].onclick = () => returnToMenu(this);
  ui['results-menu'].onclick = () => returnToMenu(this);
  ui['race-again'].onclick = () => {
    if (gameMode === 'solo') startSoloCountdown(this);
    else if (socket && socket.connected) {
      socket.emit('rematch-request');
      ui['race-again'].disabled = true;
      ui['race-again'].textContent = 'Waiting for opponent…';
    }
  };
  ui.menu.hidden = false;
}

function startMode(scene, mode) {
  username = ui.username.value.trim() || 'Player';
  gameMode = mode;
  ui.menu.hidden = true;
  ui['race-tools'].hidden = false;
  titleScreen.setVisible(false);
  backgroundMusic.stop();
  raceMusic.play();
  initGame.call(scene);
  ui['control-status'].textContent = 'Keyboard: ↑ / W accelerate · ← → / A D steer · Space brake';
  if (ui['use-camera'].checked) initHandpose();
  if (mode === 'solo') startSoloCountdown(scene);
  else connectToServer(scene);
}

function clearRace() {
  raceStarted = false;
  finishLineReached = false;
  lapCount = 1;
  boostTimer = 0;
  slowTimer = 0;
  if (countdownEvent) countdownEvent.remove(false);
  if (goEvent) goEvent.remove(false);
  countdownEvent = goEvent = null;
  if (powerUpCollider) powerUpCollider.destroy();
  if (obstacleCollider) obstacleCollider.destroy();
  powerUpCollider = obstacleCollider = null;
  if (powerUps) powerUps.destroy(true);
  if (obstacles) obstacles.destroy(true);
  powerUps = obstacles = null;
  for (const item of [speedText, gestureText, lapText, tiltText, timerText, countdownText, versusText, waitingText, opponentCar]) {
    if (item) item.destroy();
  }
  speedText = gestureText = lapText = tiltText = timerText = countdownText = versusText = waitingText = opponentCar = null;
  if (car) car.setPosition(400, 500).setVelocity(0);
  if (road) road.tilePositionY = 0;
  ui.results.hidden = true;
  ui['race-again'].disabled = false;
}

function showCountdown(scene, count) {
  if (!countdownText) countdownText = scene.add.text(400, 260, '', {
    fontSize: '64px', fill: '#fff', stroke: '#061326', strokeThickness: 6
  }).setOrigin(0.5).setDepth(10);
  countdownText.setText(String(count));
}

function startSoloCountdown(scene) {
  clearRace();
  showCountdown(scene, 3);
  let count = 3;
  countdownEvent = scene.time.addEvent({ delay: 1000, repeat: 2, callback: () => {
    count--;
    if (count > 0) showCountdown(scene, count);
    else startRace(scene);
  } });
}

function startRace(scene) {
  showCountdown(scene, 'GO!');
  goEvent = scene.time.delayedCall(1000, () => {
    if (countdownText) countdownText.setText('');
  });
  raceStarted = true;
  raceStartTime = scene.time.now;
  setupRace.call(scene);
}

function returnToMenu(scene) {
  clearRace();
  if (socket) socket.disconnect();
  socket = null;
  gameMode = null;
  if (car) car.destroy();
  if (road) road.destroy();
  car = road = null;
  stopCamera();
  raceMusic.stop();
  backgroundMusic.play();
  titleScreen.setVisible(true);
  ui['race-tools'].hidden = true;
  ui.menu.hidden = false;
}

function showResults(title, totalTime, board = '') {
  raceStarted = false;
  finishLineReached = true;
  car.setVelocity(0);
  // Freeze the race behind the result panel.
  if (powerUps) powerUps.setVelocityY(0);
  if (obstacles) obstacles.setVelocityY(0);
  ui['result-title'].textContent = title;
  ui['result-time'].textContent = totalTime ? `${totalTime}s` : '';
  ui['result-best'].textContent = '';
  ui['result-board'].textContent = board;
  ui['race-again'].textContent = gameMode === 'solo' ? 'Race again' : 'Rematch';
  ui['race-again'].disabled = false;
  ui.results.hidden = false;
}

function finishSolo(totalTime) {
  showResults('Time trial complete', totalTime);
  try {
    const stored = Number(localStorage.getItem(SOLO_BEST_KEY));
    const previousBest = Number.isFinite(stored) && stored > 0 ? stored : Infinity;
    const newBest = Number(totalTime) < previousBest;
    const best = Math.min(Number(totalTime), previousBest);
    if (newBest) localStorage.setItem(SOLO_BEST_KEY, String(best));
    ui['result-best'].textContent = `${newBest ? 'New personal best! ' : ''}Best: ${best.toFixed(2)}s`;
  } catch {
    ui['result-best'].textContent = 'Personal best could not be saved in this browser.';
  }
}

function connectToServer(scene) {
  socket = io();

  socket.on('waiting', () => {
    if (waitingText) waitingText.destroy();
    waitingText = scene.add.text(400, 280, 'Waiting for opponent...', { fontSize: '28px', fill: '#fff' }).setOrigin(0.5);
  });

  socket.on('both-ready', (usernames) => {
    if (waitingText) waitingText.destroy();
    waitingText = null;
    const opponentName = Object.entries(usernames).find(([id, name]) => id !== socket.id)[1];
    versusText = scene.add.text(280, 240, `${username} vs ${opponentName}`, { fontSize: '24px', fill: '#fff' });
  });

  socket.on('countdown', (count) => {
    if (!finishLineReached) showCountdown(scene, count);
  });

  socket.on('start-race', () => {
    if (!finishLineReached) startRace(scene);
  });

  socket.on('opponent-update', (data) => {
    if (!opponentCar) {
      opponentCar = scene.add.image(data.x, data.y, 'car2').setAlpha(0.6);
    } else {
      opponentCar.setPosition(data.x, data.y);
    }
  });

  socket.on('declare-winner', ({ winnerName, leaderboard }) => {
    const board = 'Leaderboard\n' + leaderboard.map((entry, index) =>
      `${index + 1}. ${entry.name} - ${entry.time}s`).join('\n');
    showResults(`Winner: ${winnerName}`, null, board);
  });

  socket.on('rematch-start', () => {
    clearRace();
  });

  socket.on('opponent-disconnected', () => {
    showResults('Opponent disconnected', null, 'Return to the menu to find another race.');
    ui['race-again'].disabled = true;
  });
  socket.on('connect_error', () => {
    ui['control-status'].textContent = 'Cannot reach multiplayer. Retry from the menu or play solo.';
  });
  socket.emit('join-game', { username });
}

function initGame() {
  road = this.add.tileSprite(400, 300, 800, 600, 'road');
  car = this.physics.add.image(400, 500, 'car');
  car.setCollideWorldBounds(false);
  car.setSize(64, 64);

  this.physics.world.setBounds(0, 0, 800, 600);
}

function setupRace() {
  if (powerUps) powerUps.clear(true, true);
  if (obstacles) obstacles.clear(true, true);
  if (speedText) speedText.destroy();
  if (gestureText) gestureText.destroy();
  if (lapText) lapText.destroy();
  if (tiltText) tiltText.destroy();

  powerUps = this.physics.add.group();
  for (let i = 0; i < 15; i++) {
    const x = Phaser.Math.Between(100, 700);
    const y = -(i * 500 + 300);
    const p = powerUps.create(x, y, 'power-up');
    p.setScale(0.5);
    p.setVelocityY(100);
  }

  obstacles = this.physics.add.group();
  for (let i = 0; i < 15; i++) {
    const x = Phaser.Math.Between(100, 700);
    const y = -(i * 450 + 600);
    const o = obstacles.create(x, y, 'obstacle');
    o.setVelocityY(100);
    o.setImmovable(true);
  }

  powerUpCollider = this.physics.add.overlap(car, powerUps, collectPowerUp, null, this);
  obstacleCollider = this.physics.add.collider(car, obstacles, hitObstacle, null, this);

  speedText = this.add.text(16, 16, 'Speed: 0', { fontSize: '20px', fill: '#fff' });
  gestureText = this.add.text(16, 40, 'Gesture: None', { fontSize: '20px', fill: '#fff' });
  lapText = this.add.text(16, 64, `Lap: 1 / ${TOTAL_LAPS}`, { fontSize: '20px', fill: '#fff' });
  tiltText = this.add.text(16, 88, 'Tilt: None', { fontSize: '20px', fill: '#fff' });
  timerText = this.add.text(784, 16, 'Time: 0.00s', { fontSize: '20px', fill: '#fff' }).setOrigin(1, 0);
}

function flashScreen(scene, color = 0xffffff, duration = 100) {
  if (!flashOverlay) return;
  flashOverlay.setFillStyle(color, 1);
  flashOverlay.setAlpha(1);
  scene.tweens.add({ targets: flashOverlay, alpha: 0, duration, ease: 'Linear' });
}

function collectPowerUp(player, powerUp) {
  powerUp.disableBody(true, true);
  boostTimer = 200;
  player.scene.sound.play('boostSound');
  flashScreen(player.scene, 0x00ff00);
}

function hitObstacle(player, obstacle) {
  if (boostTimer === 0) {
    slowTimer = 100;
    obstacle.disableBody(true, true);
    player.scene.sound.play('obstacleHitSound');
    flashScreen(player.scene, 0xff0000);
  }
}

function update(time) {
  if (!raceStarted || finishLineReached) return;

  let speed;
  const accelerating = keys.UP.isDown || keys.W.isDown;
  const braking = keys.SPACE.isDown;
  const steeringLeft = keys.LEFT.isDown || keys.A.isDown;
  const steeringRight = keys.RIGHT.isDown || keys.D.isDown;
  if (accelerating || currentGesture === 'Fist') speed = -200;
  else if (currentGesture === 'None') speed = -100;
  else speed = 0;
  if (boostTimer > 0) speed = -400;
  else if (slowTimer > 0) speed = -100;
  if (braking) speed = 0;

  const moving = !braking && (accelerating || currentGesture === 'Fist' || currentGesture === 'None');
  const steering = steeringLeft ? 'left' : steeringRight ? 'right' : tiltDirection;
  if (moving) {
    car.setVelocityY(speed);
    switch (steering) {
      case 'left': car.setVelocityX(-150); break;
      case 'right': car.setVelocityX(150); break;
      default: car.setVelocityX(0); break;
    }
    road.tilePositionY -= 4;
  } else {
    car.setVelocityY(0);
    car.setVelocityX(0);
  }

  if (car.y < 0) {
    lapCount++;
    lapText.setText(`Lap: ${Math.min(lapCount, TOTAL_LAPS)} / ${TOTAL_LAPS}`);
    car.setY(600);
    if (lapCount > TOTAL_LAPS) {
      finishLineReached = true;
      car.setVelocity(0);
      const totalTime = ((time - raceStartTime) / 1000).toFixed(2);
      timerText.setText(`Time: ${totalTime}s`);
      if (gameMode === 'solo') finishSolo(totalTime);
      else if (socket) {
        socket.emit('finish', { time: totalTime });
        showResults('Race finished', totalTime, 'Waiting for your opponent to finish…');
        ui['race-again'].disabled = true;
      }
      return;
    }
  }

  if (car.x < 0) car.setX(0);
  if (car.x > 800) car.setX(800);

  if (boostTimer > 0) boostTimer--;
  if (slowTimer > 0) slowTimer--;

  speedText.setText('Speed: ' + Math.abs(car.body.velocity.y));
  gestureText.setText('Gesture: ' + currentGesture);
  tiltText.setText('Tilt: ' + (steering || 'None'));
  timerText.setText(`Time: ${((time - raceStartTime) / 1000).toFixed(2)}s`);

  if (socket) {
    socket.emit('player-move', { x: car.x, y: car.y });
  }
}

async function initHandpose() {
  const session = ++cameraSession;
  ui['control-status'].textContent = 'Starting webcam gestures… Keyboard controls are ready.';
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    if (session !== cameraSession) {
      stream.getTracks().forEach(track => track.stop());
      return;
    }
    webcam = document.getElementById('webcam');
    webcam.srcObject = stream;
    await webcam.play();
    if (!handposeModel) {
      if (!handposeLoading) handposeLoading = handpose.load().catch(error => {
        handposeLoading = null;
        throw error;
      });
      handposeModel = await handposeLoading;
    }
    if (session !== cameraSession) return;
    ui['control-status'].textContent = 'Webcam gestures ready · Keyboard controls also available';
    detectHands(session);
  } catch {
    if (session !== cameraSession) return;
    stopCamera();
    ui['control-status'].textContent = 'Webcam unavailable. Use ↑ / W, ← → / A D and Space.';
  }
}

function stopCamera() {
  cameraSession++;
  cancelAnimationFrame(detectionFrame);
  if (webcam && webcam.srcObject) {
    webcam.srcObject.getTracks().forEach(track => track.stop());
    webcam.srcObject = null;
  }
  currentGesture = previousGesture = 'None';
  gestureConfidence = frameCount = smoothedDx = 0;
  tiltDirection = null;
}

async function detectHands(session) {
  if (session !== cameraSession) return;
  frameCount++;
  if (frameCount % 3 !== 0) {
    detectionFrame = requestAnimationFrame(() => detectHands(session));
    return;
  }

  let predictions;
  try {
    predictions = await handposeModel.estimateHands(webcam);
  } catch {
    if (session !== cameraSession) return;
    stopCamera();
    ui['control-status'].textContent = 'Gesture tracking stopped. Keyboard controls are ready.';
    return;
  }
  if (session !== cameraSession) return;
  if (predictions.length > 0) {
    const interpreted = interpretGestureTwoHands(predictions);
    if (interpreted === previousGesture) gestureConfidence++;
    else gestureConfidence = 0;
    previousGesture = interpreted;
    if (gestureConfidence > 1) currentGesture = interpreted;
    tiltDirection = detectTiltSmooth(predictions[0].landmarks);
  } else {
    currentGesture = 'None';
    tiltDirection = null;
  }
  detectionFrame = requestAnimationFrame(() => detectHands(session));
}

function interpretGestureTwoHands(hands) {
  const getDistance = (a, b) => Math.sqrt((a[0] - b[0])**2 + (a[1] - b[1])**2);
  if (hands.length === 1) {
    const hand = hands[0].landmarks;
    const d = getDistance(hand[4], hand[8]);
    if (d < 40) return 'Fist';
    if (d > 100) return 'Open';
    return 'None';
  }
  if (hands.length >= 2) {
    const isFist = hand => getDistance(hand[4], hand[8]) < 40;
    const isOpen = hand => getDistance(hand[4], hand[8]) > 100;
    const h1 = hands[0].landmarks, h2 = hands[1].landmarks;
    if (isFist(h1) && isFist(h2)) return 'Fist';
    if (isOpen(h1) && isOpen(h2)) return 'Open';
  }
  return 'None';
}

function detectTiltSmooth(landmarks) {
  const dx = landmarks[5][0] - landmarks[0][0];
  smoothedDx = SMOOTHING_FACTOR * smoothedDx + (1 - SMOOTHING_FACTOR) * dx;
  if (smoothedDx > DX_THRESHOLD) return 'left';
  if (smoothedDx < -DX_THRESHOLD) return 'right';
  return null;
}

const game = new Phaser.Game(config);
window.addEventListener('pagehide', stopCamera);
