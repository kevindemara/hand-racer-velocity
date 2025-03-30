# 🏎️ Hand Racer – Velocity

**Hand Racer – Velocity** is a browser-based multiplayer racing game that uses **hand gesture recognition** powered by TensorFlow.js. Control your car with just your webcam! Compete in real-time against friends in 1v1 lobbies, race to the finish, and aim for the leaderboard.

---

## 🚀 Features

- ✋ **Hand Gesture Controls** (Open, Fist, Tilt)
- 🧠 Powered by **TensorFlow.js (Handpose Model)**
- 🎮 **Multiplayer Lobby System**
- 🧍 Username Entry & Display
- ⏳ Pre-Race **Countdown**
- 🔄 **Rematch** functionality
- 🏁 **Leaderboard** with persistent results
- 🎵 Background Music & SFX
- 💻 Deployed with **Render**

---

## 🎮 How to Play

1. Open the game in your browser.
2. Enter your **username**.
3. Click **Multiplayer**.
4. Wait for an opponent or auto-match.
5. Use **hand gestures** to control your car:
   - ✊ Fist: Accelerate
   - 🖐️ Open: Glide
   - ⬅️➡️ Tilt hand: Steer left/right

First to complete **30 laps** wins the race!

---

## 🛠️ Tech Stack

- [Phaser 3](https://phaser.io/)
- [TensorFlow.js Handpose](https://www.npmjs.com/package/@tensorflow-models/handpose)
- [Socket.io](https://socket.io/)
- Node.js (Express Server)
- Render (Free Hosting)

---

## 🧑‍💻 Local Development

### 1. Clone the Repo

```bash
git clone https://github.com/kevindemara/hand-racer-velocity.git
cd hand-racer-velocity


2. Install Dependencies
bash
npm install

3. Run Locally
bash
node server/server.js
Then open: http://localhost:3000

☁️ Deployment (Render)
Create a new Web Service on Render.

Connect your GitHub repository.

Add a render.yaml (already included).
Done! The game will be hosted on a free tier, ready to play.

📂 Project Structure
pgsql

/public
  |- index.html
  |- game.js
  |- client.js
  |- assets/
    |- car.png, car2.png, etc.

server/
  |- server.js

render.yaml
README.md
package.json

📸 Screenshots
Coming soon.

✨ Credits
Developed Kevin DeMara


📃 License
MIT License.
Feel free to fork, improve, and contribute!
