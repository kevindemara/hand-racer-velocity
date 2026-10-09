export function gamepadAxis(value, deadzone = .12) {
  if (!Number.isFinite(value)) return 0;
  const threshold = Number.isFinite(deadzone) ? Math.max(0,Math.min(.5,deadzone)) : .12;
  const magnitude = Math.min(1,Math.abs(value));
  return magnitude <= threshold ? 0 : Math.sign(value)*(magnitude-threshold)/(1-threshold);
}
const triggerValue = button => Number.isFinite(button?.value) ? Math.max(0,Math.min(1,button.value)) : button?.pressed ? 1 : 0;
export class DrivingInput {
  constructor(settings) {
    this.settings = settings; this.keys = new Set(); this.touch = {}; this.rebind = null;
    window.addEventListener('keydown', event => {
      if (this.rebind) {
        event.preventDefault(); event.stopImmediatePropagation?.();
        const pending = this.rebind;
        if (event.code === 'Escape') { this.rebind = null; pending.done(this.settings.bindings[pending.action]); return; }
        if (event.repeat) return;
        const reserved = {ArrowUp:'throttle',ArrowDown:'brake',ArrowLeft:'left',ArrowRight:'right'};
        if (event.code === 'Tab' || reserved[event.code] && reserved[event.code] !== pending.action) { pending.status?.('Choose another key'); return; }
        const displaced = Object.keys(this.settings.bindings).find(action => action !== pending.action && this.settings.bindings[action] === event.code);
        if (displaced) this.settings.bindings[displaced] = this.settings.bindings[pending.action];
        this.settings.bindings[pending.action] = event.code; this.rebind = null; this.keys.clear(); this.touch = {}; pending.done(event.code,displaced);
        return;
      }
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(event.target.tagName)) return;
      this.keys.add(event.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code) || Object.values(this.settings.bindings).includes(event.code)) event.preventDefault();
    });
    window.addEventListener('keyup', event => this.keys.delete(event.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.touch = {}; });
    document.querySelectorAll('[data-drive]').forEach(button => {
      const action = button.dataset.drive;
      button.addEventListener('pointerdown', event => { event.preventDefault(); button.setPointerCapture(event.pointerId); this.touch[action] = true; });
      for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(event, () => { this.touch[action] = false; });
    });
  }
  read(webcam) {
    const b = this.settings.bindings, down = action => this.keys.has(b[action]) || this.touch[action];
    const brakeAlias = this.keys.has('KeyS') && !Object.entries(b).some(([action,code]) => action !== 'brake' && code === 'KeyS');
    const right = Boolean(down('right') || this.keys.has('ArrowRight')), left = Boolean(down('left') || this.keys.has('ArrowLeft'));
    let manualSteering = right || left;
    const keyboard = { throttle: down('throttle') || this.keys.has('ArrowUp') ? 1 : 0, brake: down('brake') || this.keys.has('ArrowDown') || brakeAlias ? 1 : 0,
      steer: Number(right) - Number(left),
      nitro: Boolean(down('nitro')), drift: Boolean(down('drift')) };
    const pad = this.gamepad();
    if (pad) {
      const steer = gamepadAxis(pad.axes?.[0],this.settings.gamepadDeadzone);
      if (steer) { keyboard.steer = steer; manualSteering = true; }
      keyboard.throttle = Math.max(keyboard.throttle,triggerValue(pad.buttons?.[7]),pad.buttons?.[0]?.pressed?1:0);
      keyboard.brake = Math.max(keyboard.brake,triggerValue(pad.buttons?.[6]),pad.buttons?.[1]?.pressed?1:0);
      keyboard.nitro ||= Boolean(pad.buttons?.[4]?.pressed); keyboard.drift ||= Boolean(pad.buttons?.[5]?.pressed);
    }
    if (webcam?.active) {
      const hand = webcam.state, ready = hand?.tracked && hand.calibrated;
      // Pedals override together, so a manual brake cannot fight hand acceleration.
      if (!keyboard.throttle && !keyboard.brake) {
        keyboard.throttle = ready ? hand.throttle || 0 : 0;
        keyboard.brake = ready ? hand.brake || 0 : 1;
      }
      if (!manualSteering) keyboard.steer = ready ? hand.steer || 0 : 0;
    }
    return keyboard;
  }
  gamepad() { try { return Array.from(navigator.getGamepads?.() || []).find(p=>p?.connected); } catch { return undefined; } }
  bind(action, done, status) { this.rebind = { action, done, status }; }
  cancelBind() { if (this.rebind) { const pending=this.rebind;this.rebind=null;pending.done(this.settings.bindings[pending.action]); } }
}
