export class RacingAudio {
  constructor(Context = globalThis.AudioContext || globalThis.webkitAudioContext) { this.volume = .35; this.Context = Context; this.nodes = new Set(); this.sources = new Set(); }
  own(node, source = false) { this.nodes.add(node); if (source) this.sources.add(node); return node; }
  start() {
    try {
      if (this.context?.state === 'closed') this.dispose();
      if (!this.context) {
        if (!this.Context) return false;
        this.context = new this.Context(); this.master = this.own(this.context.createGain()); this.master.gain.value = 0; this.master.connect(this.context.destination);
        this.engine = this.own(this.context.createOscillator(),true); this.engine.type = 'sawtooth';
        this.filter = this.own(this.context.createBiquadFilter()); this.filter.type = 'lowpass'; this.filter.frequency.value = 700;
        this.engine.connect(this.filter); this.filter.connect(this.master); this.engine.frequency.value = 35; this.engine.start();
        const buffer = this.context.createBuffer(1, this.context.sampleRate * 2, this.context.sampleRate);
        const samples = buffer.getChannelData(0); for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
        this.tires = this.own(this.context.createBufferSource(),true); this.tires.buffer = buffer; this.tires.loop = true;
        const tireFilter = this.own(this.context.createBiquadFilter()); tireFilter.type = 'bandpass'; tireFilter.frequency.value = 1800; tireFilter.Q.value = .7;
        this.tireGain = this.own(this.context.createGain()); this.tireGain.gain.value = 0;
        this.tires.connect(tireFilter); tireFilter.connect(this.tireGain); this.tireGain.connect(this.context.destination); this.tires.start();
      }
      this.master.gain.value = this.tireGain.gain.value = 0;
      const context = this.context;
      Promise.resolve(context.resume()).catch(() => { if (this.context === context) this.dispose(); });
      return true;
    } catch { this.dispose(); return false; }
  }
  update(vehicle, input) {
    if (!this.context || this.context.state === 'closed') return;
    try {
      this.master.gain.setTargetAtTime(this.volume * (vehicle ? .045 : 0), this.context.currentTime, .15);
      this.tireGain.gain.setTargetAtTime(vehicle && vehicle.speed > 15 && (input?.drift || Math.abs(vehicle.heading) > .3) ? this.volume * .04 : 0, this.context.currentTime, .08);
      if (vehicle) { this.engine.frequency.setTargetAtTime(35 + vehicle.speed * 3.5 + (input?.throttle || 0) * 10, this.context.currentTime, .06); this.filter.frequency.setTargetAtTime(250 + vehicle.speed * 18, this.context.currentTime, .08); }
    } catch { this.dispose(); }
  }
  effect(type) {
    if (!this.context || this.context.state !== 'running' || !this.volume) return;
    try {
      const oscillator = this.own(this.context.createOscillator(),true), gain = this.own(this.context.createGain()), now = this.context.currentTime;
      oscillator.type = type === 'collision' ? 'square' : 'sine'; oscillator.frequency.setValueAtTime(type === 'collision' ? 110 : type === 'pickup' ? 600 : type === 'countdown' ? 440 : type === 'go' ? 830 : 900, now);
      oscillator.frequency.exponentialRampToValueAtTime(type === 'collision' ? 40 : type === 'countdown' ? 440 : type === 'go' ? 1660 : 1300, now + .13);
      gain.gain.setValueAtTime(this.volume * .12, now); gain.gain.exponentialRampToValueAtTime(.001, now + .2);
      oscillator.connect(gain); gain.connect(this.context.destination); oscillator.start(); oscillator.stop(now + .2);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); this.nodes.delete(oscillator); this.nodes.delete(gain); this.sources.delete(oscillator); };
    } catch { this.dispose(); }
  }
  dispose() {
    const context = this.context; this.context = null;
    for (const source of this.sources) { try { source.stop(); } catch {} }
    for (const node of this.nodes) { try { node.disconnect(); } catch {} }
    this.sources.clear(); this.nodes.clear();
    this.master = this.engine = this.filter = this.tires = this.tireGain = null;
    if (context && context.state !== 'closed') { try { Promise.resolve(context.close()).catch(() => {}); } catch {} }
  }
}
