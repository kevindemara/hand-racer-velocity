import { clamp, angleDifference } from './racing.js';
export function palmAngle(points, handedness = 'Right', aspect = 1) {
  if (!points?.[17] || !points?.[5]) return null;
  // Across-palm direction, oriented consistently for left and right hands.
  const dx = points[5].x - points[17].x, dy = (points[5].y - points[17].y) * aspect;
  if (Math.hypot(dx, dy) < .025) return null;
  return Math.atan2(dy * (handedness === 'Left' ? -1 : 1), dx * (handedness === 'Left' ? -1 : 1));
}
export class GestureFilter {
  constructor() { this.neutral = null; this.controlSide = null; this.calibration = []; this.angle = 0; this.gesture = 'None'; this.candidate = 'None'; this.candidateSince = 0; this.lastTime = null; this.lastSeen = 0; this.lastCalibrationFrame = 0; }
  resetCalibration() { this.neutral = null; this.controlSide = null; this.calibrationSide = null; this.calibration = []; this.angle = 0; this.gesture = this.candidate = 'None'; this.visibleHand = null; this.lastCalibrationFrame = 0; }
  useVisibleHand(now) {
    const hand = this.visibleHand;
    if (!hand || now - this.lastSeen > 350 || !Number.isFinite(hand.angle)) return false;
    this.neutral = hand.angle; this.controlSide = hand.side; this.angle = 0;
    this.gesture = this.candidate = 'None'; this.candidateSince = now;
    return true;
  }
  update(result, now, { sensitivity = 1, mirror = true, aspect = 1 } = {}) {
    const dt = this.lastTime === null ? .033 : clamp((now - this.lastTime) / 1000, .001, .2); this.lastTime = now;
    const hands = result?.landmarks || [];
    const categories = result?.gestures || [];
    let best = -1, score = -1;
    for (let i = 0; i < hands.length; i++) {
      if (this.controlSide && result.handedness?.[i]?.[0]?.categoryName !== this.controlSide) continue;
      const confidence = categories[i]?.[0]?.score || 0;
      if (confidence > score) { score = confidence; best = i; }
    }
    // Landmarks establish hand presence; uncertain classification isn't hand loss.
    if (best < 0) {
      if (now - this.lastSeen > 350) { this.gesture = 'None'; this.candidate = 'None'; this.angle = 0; if (this.neutral === null) this.calibration = []; }
      return { tracked: now - this.lastSeen <= 350 && this.lastSeen > 0, calibrated: this.neutral !== null, steer: 0, throttle: 0, brake: 0, confidence: 0, gesture: 'Hand lost', progress: this.calibration.length / 24, hint: this.controlSide ? `Show your calibrated ${this.controlSide.toLowerCase()} hand` : 'Keep one open hand inside the preview' };
    }
    const points = hands[best], side = result.handedness?.[best]?.[0]?.categoryName || 'Right';
    const angle = palmAngle(points, side, aspect);
    if (angle === null) return { tracked: false, calibrated: false, steer: 0, throttle: 0, brake: 0, gesture: 'Turn palm toward camera', confidence: score, progress: 0, hint:'Face your palm toward the camera; keep fingers visible' };
    this.lastSeen = now;
    this.visibleHand = { angle, side };
    const category = categories[best]?.[0]?.categoryName || 'None';
    if (this.neutral === null) {
      const moved=this.calibration.length>0&&Math.abs(angleDifference(angle,this.calibration[0]))>.12;
      if (side !== this.calibrationSide || moved) this.calibration = [];
      this.calibrationSide = side;
      // Landmark detection and gesture confidence are separate. A recognized
      // open palm can have a moderate score even with clearly visible fingers.
      if (category === 'Open_Palm' && score >= .55) { this.calibration.push(angle); this.lastCalibrationFrame = now; }
      else if (category === 'Closed_Fist' || now - this.lastCalibrationFrame > 200) this.calibration = [];
      if (this.calibration.length >= 24) {
        this.neutral = Math.atan2(this.calibration.reduce((sum, a) => sum + Math.sin(a), 0), this.calibration.reduce((sum, a) => sum + Math.cos(a), 0));
        this.controlSide = side;
        // Carry the observed open palm into driving, where the lower retain
        // threshold applies. Otherwise a 55–75% palm calibrates but cannot brake.
        this.gesture = this.candidate = 'Open_Palm'; this.candidateSince = now;
      }
      const hint=category!=='Open_Palm'?'Open your hand fully to calibrate':score<.55?'Keep fingers visible, or use your current hand position':moved?'Hold your palm still; calibration restarted':this.neutral===null?'Hold your open palm level and still':'Ready · fist accelerates; open palm brakes';
      return { tracked: true, calibrated: this.neutral !== null, steer: 0, throttle: 0, brake: 1, confidence: score, gesture: 'Hold an open palm level', progress: Math.min(1,this.calibration.length / 24), points, hint };
    }
    // High confidence to enter a gesture; a lower threshold retains it.
    const accepted = score < .55 ? 'None' : score >= (category === this.gesture ? .55 : .75) ? category : this.gesture;
    if (accepted !== this.candidate) { this.candidate = accepted; this.candidateSince = now; }
    if (now - this.candidateSince >= 100) this.gesture = this.candidate;
    let target = angleDifference(angle, this.neutral) * (mirror ? 1 : -1) * sensitivity / .55;
    target = Math.abs(target) < .08 ? 0 : clamp(target, -1, 1);
    this.angle += (target - this.angle) * (1 - Math.exp(-dt / .065));
    return { tracked: true, calibrated: true, steer: this.angle, throttle: this.gesture === 'Closed_Fist' ? 1 : 0,
      brake: this.gesture === 'Open_Palm' ? 1 : 0, confidence: score, gesture: this.gesture.replaceAll('_', ' '), progress: 1, points,
      hint:this.gesture==='Closed_Fist'?'Accelerating · tilt to steer':this.gesture==='Open_Palm'?'Braking · tilt to steer':'Hand seen · make a fist to drive or open your palm to brake' };
  }
}
