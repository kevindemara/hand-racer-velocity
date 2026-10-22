import { GestureFilter } from '../../shared/gestures.js';
import { assetUrl } from './asset-url.js';
const connections = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[0,17],[17,18],[18,19],[19,20]];
export function cameraErrorMessage(error) {
  if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') return 'Camera access was blocked. Allow camera access for this site, then retry.';
  if (error?.name === 'NotFoundError') return 'No camera was found. Connect a webcam, then retry.';
  if (error?.name === 'NotReadableError' || error?.name === 'AbortError') return 'The camera could not start. Close other apps using it, then retry.';
  return 'Camera unavailable. Check permissions and your webcam connection, then retry.';
}
export class WebcamControls {
  constructor(video, canvas, status, onState) {
    this.video = video; this.canvas = canvas; this.status = status; this.onState = onState;
    this.filter = new GestureFilter(); this.session = 0; this.sensitivity = 1; this.mirror = true;
    this.state = { tracked: false, calibrated: false, throttle: 0, brake: 0, steer: 0 }; this.busy = false;
  }
  async start() {
    this.stop(); const session = ++this.session; this.active = true; this.status.textContent = 'Waiting for camera permission…';
    this.onState(this.state);
    this.timeout = setTimeout(() => { if (session === this.session) this.fail('Camera startup timed out. Check the camera permission prompt, then retry.'); }, 30000);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30, max: 30 } }, audio: false });
      if (session !== this.session) { stream.getTracks().forEach(track => track.stop()); return; }
      this.status.textContent='Starting camera…';
      this.video.srcObject = stream;
      this.cameraTracks = stream.getVideoTracks?.() || stream.getTracks();
      this.trackEnded = () => { if (session === this.session) this.fail('Camera disconnected. Reconnect it, then retry.'); };
      this.cameraTracks.forEach(track => track.addEventListener?.('ended', this.trackEnded));
      await this.video.play();
      if (session !== this.session) return;
      clearTimeout(this.timeout);
      this.status.textContent = 'Loading gesture model…';
      this.worker = new Worker(assetUrl('vendor/gesture-worker.js'));
      this.worker.onmessage = ({ data }) => {
        if (session !== this.session) return;
        if (data.type === 'ready') { this.ready = true; clearTimeout(this.timeout); this.lastResultTime = performance.now(); this.status.textContent = 'Hold an open palm level to calibrate'; this.schedule(session); }
        else if (data.type === 'result') {
          this.busy = false; this.captureFailures = 0; this.lastResultTime = performance.now(); clearTimeout(this.frameTimeout);
          this.state = this.filter.update(data.result, data.timestamp, { sensitivity: this.sensitivity, mirror: this.mirror, aspect: this.video.videoHeight / this.video.videoWidth || .75 });
          this.status.textContent = this.state.hint || this.state.gesture;
          this.draw(this.state.points); this.onState(this.state);
        } else if (data.type === 'error') { console.warn('Gesture worker:', data.message); this.fail('Gesture model unavailable. Keyboard controls still work.'); }
      };
      this.worker.onerror = () => { if (session === this.session) this.fail('Gesture worker failed. Use keyboard controls.'); };
      this.worker.postMessage({ type: 'init', origin: location.origin, baseUrl: new URL(assetUrl(''), location.href || location.origin).href });
      this.timeout = setTimeout(() => { if (session === this.session && !this.ready) this.fail('Gesture model timed out. Use keyboard controls.'); }, 20000);
    } catch (error) { if (session === this.session) this.fail(cameraErrorMessage(error)); }
  }
  schedule(session) {
    let handled = false;
    const callback = async (_time, metadata) => {
      if (handled) return; handled = true; clearTimeout(this.frameFallback);
      if (this.videoFrame !== undefined) this.video.cancelVideoFrameCallback?.(this.videoFrame);
      if (session !== this.session || !this.ready) return;
      const timestamp = performance.now();
      if (timestamp - this.lastResultTime > 700 && this.state.tracked) {
        this.state = this.filter.update({ landmarks: [] }, timestamp);
        this.status.textContent = 'Waiting for fresh camera frames…'; this.draw(); this.onState(this.state);
      }
      // One frame in flight; target 25Hz independently of monitor refresh rate.
      if (!this.busy && timestamp - (this.lastFrame || 0) >= 40 && (metadata || this.video.currentTime !== this.lastVideoTime)) {
        this.busy = true; this.lastFrame = timestamp; this.lastVideoTime = this.video.currentTime;
        this.frameTimeout = setTimeout(() => { if (session === this.session && this.busy) this.fail('Tracking stalled. Keyboard controls still work.'); }, 3000);
        let bitmap;
        try {
          bitmap = await createImageBitmap(this.video);
          if (session !== this.session) { bitmap.close(); return; }
          this.worker.postMessage({ type: 'frame', bitmap, timestamp }, [bitmap]);
        } catch {
          bitmap?.close();
          if (session !== this.session) return;
          this.busy = false; clearTimeout(this.frameTimeout);
          this.captureFailures++;
          if (this.captureFailures >= 3) { this.fail('Camera frames could not be read. Reconnect your webcam, then retry.'); return; }
        }
      }
      this.schedule(session);
    };
    if (this.video.requestVideoFrameCallback) {
      this.videoFrame = this.video.requestVideoFrameCallback(callback);
      // A covered preview may stop compositor callbacks even while video advances.
      this.frameFallback = setTimeout(() => callback(), 120);
    }
    else this.animationFrame = requestAnimationFrame(callback);
  }
  draw(points) {
    const ctx = this.canvas.getContext('2d'), w = this.canvas.width, h = this.canvas.height; ctx.clearRect(0, 0, w, h);
    if (!points) return;
    ctx.strokeStyle = '#67d7ba'; ctx.lineWidth = 2;
    for (const [a,b] of connections) { ctx.beginPath(); ctx.moveTo(points[a].x * w, points[a].y * h); ctx.lineTo(points[b].x * w, points[b].y * h); ctx.stroke(); }
    ctx.fillStyle = '#fff'; points.forEach(p => { ctx.beginPath(); ctx.arc(p.x * w, p.y * h, 3, 0, Math.PI * 2); ctx.fill(); });
  }
  calibrate() {
    this.filter.resetCalibration();
    this.state = { tracked: false, calibrated: false, throttle: 0, brake: 1, steer: 0 };
    this.draw(); this.onState(this.state); this.status.textContent = 'Hold an open palm level to calibrate';
  }
  useCurrentHand() {
    if (!this.active || !this.state.points || !this.filter.useVisibleHand(performance.now())) return false;
    this.state = { ...this.state, calibrated:true, progress:1, steer:0, throttle:0, brake:0,
      gesture:'Ready', hint:'Ready · fist accelerates; open palm brakes' };
    this.status.textContent = this.state.hint; this.onState(this.state); return true;
  }
  fail(message) { this.stop(); this.status.textContent = message; this.onState({ tracked: false, calibrated: false, unavailable: true }); }
  stop() {
    this.session++; this.active = this.ready = this.busy = false; clearTimeout(this.timeout); clearTimeout(this.frameTimeout); clearTimeout(this.frameFallback);
    this.video.cancelVideoFrameCallback?.(this.videoFrame); cancelAnimationFrame(this.animationFrame);
    this.worker?.terminate(); this.worker = null;
    this.cameraTracks?.forEach(track => track.removeEventListener?.('ended', this.trackEnded)); this.cameraTracks = null;
    this.video.srcObject?.getTracks().forEach(track => track.stop()); this.video.srcObject = null;
    this.filter = new GestureFilter(); this.state = { tracked: false, calibrated: false, throttle: 0, brake: 0, steer: 0 }; this.draw();
    this.lastFrame = this.lastVideoTime = this.lastResultTime = 0;
    this.captureFailures = 0;
  }
}
