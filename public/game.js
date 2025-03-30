// game.js – Hand Racer – Velocity (Multiplayer Lobby, Countdown, Rematch, Winner, Leaderboard)

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
let countdownTimer = 3;
let finishLineReached = false;

let car, opponentCar;
let road;
let speedText, gestureText, lapText, tiltText, winnerText, leaderboardText, versusText, waitingText;
let lapCount = 1;
let powerUps, obstacles;
let raceStartTime;
let restartButton, rematchButton;
let titleScreen, startButton, usernameInput, multiplayerButton;
let backgroundMusic, raceMusic, muteButton, flashOverlay;
let isMuted = false;

let username = 'Player';
let socket;

const SMOOTHING_FACTOR = 0.75;
const DX_THRESHOLD = 8;

const config = {
  type: Phaser.AUTO,
  width: 800,
  height: 600,
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

  usernameInput = document.createElement('input');
  usernameInput.placeholder = 'Enter username';
  usernameInput.style.position = 'absolute';
  usernameInput.style.top = '65%';
  usernameInput.style.left = '50%';
  usernameInput.style.transform = 'translate(-50%, -50%)';
  usernameInput.style.fontSize = '20px';
  usernameInput.style.padding = '10px';
  document.body.appendChild(usernameInput);

  multiplayerButton = this.add.text(320, 460, 'Multiplayer', {
    fontSize: '32px', fill: '#fff', backgroundColor: '#00BFFF'
  }).setPadding(12).setInteractive().setDepth(11)
    .on('pointerdown', () => {
      username = usernameInput.value || 'Player';
      usernameInput.style.display = 'none';
      titleScreen.setVisible(false);
      multiplayerButton.setVisible(false);
      backgroundMusic.stop();
      raceMusic.play();
      connectToServer(this);
    });
}

function connectToServer(scene) {
  socket = io();
  socket.emit('join-game', { username });

  socket.on('waiting', () => {
    if (waitingText) waitingText.destroy();
    waitingText = scene.add.text(300, 280, 'Waiting for opponent...', { fontSize: '28px', fill: '#fff' });
  });

  socket.on('both-ready', (usernames) => {
    if (waitingText) waitingText.destroy();
    const opponentName = Object.entries(usernames).find(([id, name]) => id !== socket.id)[1];
    versusText = scene.add.text(280, 240, `${username} vs ${opponentName}`, { fontSize: '24px', fill: '#fff' });
  });

  socket.on('countdown', (count) => {
    if (!countdownText) {
      countdownText = scene.add.text(360, 260, '', { fontSize: '64px', fill: '#fff' }).setDepth(10);
    }
    countdownText.setText(count);
  });

  socket.on('start-race', () => {
    if (countdownText) countdownText.setText('GO!');
    scene.time.delayedCall(1000, () => countdownText.setText(''));
    raceStarted = true;
    raceStartTime = scene.time.now;
    setupRace.call(scene);
  });

  socket.on('opponent-update', (data) => {
    if (!opponentCar) {
      opponentCar = scene.add.image(data.x, data.y, 'car2').setAlpha(0.6);
    } else {
      opponentCar.setPosition(data.x, data.y);
    }
  });

  socket.on('declare-winner', ({ winnerName, leaderboard }) => {
    finishLineReached = true;
    car.setVelocity(0);
    if (winnerText) winnerText.destroy();
    winnerText = scene.add.text(200, 260, `Winner: ${winnerName}`, { fontSize: '36px', fill: '#00ff00' });

    let board = '🏁 Leaderboard 🏁\n';
    leaderboard.forEach((entry, index) => {
      board += `${index + 1}. ${entry.name} - ${entry.time}s\n`;
    });
    leaderboardText = scene.add.text(200, 320, board, { fontSize: '20px', fill: '#fff' });

    rematchButton = scene.add.text(300, 540, 'Rematch', {
      fontSize: '32px', fill: '#fff', backgroundColor: '#EB0497'
    }).setPadding(10).setInteractive()
      .on('pointerdown', () => {
        socket.emit('rematch-request');
        rematchButton.setVisible(false);
      });
  });

  socket.on('rematch-start', () => {
    if (winnerText) winnerText.destroy();
    if (leaderboardText) leaderboardText.destroy();
    if (rematchButton) rematchButton.destroy();
    if (versusText) versusText.destroy();
    if (waitingText) waitingText.destroy();
    finishLineReached = false;
    raceStarted = false;
    lapCount = 1;
    car.setPosition(400, 500);
    car.setVelocity(0);
    road.tilePositionY = 0;
    setupRace.call(scene);
  });

  initGame.call(scene);
}

function initGame() {
  road = this.add.tileSprite(400, 300, 800, 600, 'road');
  car = this.physics.add.image(400, 500, 'car');
  car.setCollideWorldBounds(false);
  car.setSize(64, 64);

  this.physics.world.setBounds(0, 0, 800, 600);
  initHandpose();
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

  this.physics.add.overlap(car, powerUps, collectPowerUp, null, this);
  this.physics.add.collider(car, obstacles, hitObstacle, null, this);

  speedText = this.add.text(16, 16, 'Speed: 0', { fontSize: '20px', fill: '#fff' });
  gestureText = this.add.text(16, 40, 'Gesture: None', { fontSize: '20px', fill: '#fff' });
  lapText = this.add.text(16, 64, 'Lap: 1', { fontSize: '20px', fill: '#fff' });
  tiltText = this.add.text(16, 88, 'Tilt: None', { fontSize: '20px', fill: '#fff' });
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
  if (currentGesture === 'Fist') speed = -200;
  else if (currentGesture === 'None') speed = -100;
  else speed = 0;
  if (boostTimer > 0) speed = -400;
  else if (slowTimer > 0) speed = -100;

  const moving = currentGesture === 'Fist' || currentGesture === 'None';
  if (moving) {
    car.setVelocityY(speed);
    switch (tiltDirection) {
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
    lapText.setText('Lap: ' + lapCount);
    car.setY(600);
    if (lapCount > 30 && socket) {
      finishLineReached = true;
      car.setVelocity(0);
      const totalTime = ((time - raceStartTime) / 1000).toFixed(2);
      socket.emit('finish', { time: totalTime });
    }
  }

  if (car.x < 0) car.setX(0);
  if (car.x > 800) car.setX(800);

  if (boostTimer > 0) boostTimer--;
  if (slowTimer > 0) slowTimer--;

  speedText.setText('Speed: ' + Math.abs(car.body.velocity.y));
  gestureText.setText('Gesture: ' + currentGesture);
  tiltText.setText('Tilt: ' + (tiltDirection || 'None'));

  if (socket) {
    socket.emit('player-move', { x: car.x, y: car.y });
  }
}

async function initHandpose() {
  webcam = document.getElementById('webcam');
  const stream = await navigator.mediaDevices.getUserMedia({ video: true });
  webcam.srcObject = stream;
  handposeModel = await handpose.load();
  detectHands();
}

async function detectHands() {
  frameCount++;
  if (frameCount % 3 !== 0) {
    requestAnimationFrame(detectHands);
    return;
  }

  const predictions = await handposeModel.estimateHands(webcam);
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
  requestAnimationFrame(detectHands);
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
