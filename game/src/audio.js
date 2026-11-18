// Sound, 100% synthesised with WebAudio — no audio files anywhere.
// Engine hum, sirens, gunshots, crashes and mission jingles are all
// oscillators and filtered noise. Every method is a no-op until the first
// user gesture unlocks the AudioContext, and headless Node never loads
// this module at all.

export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenTimer = 0;
  let sirenHigh = false;
  let muted = false;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      return true;
    } catch {
      return false;
    }
  }

  function tone(freq, dur, type, vol, when = 0, slideTo = null) {
    if (!ctx) return;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function noise(dur, vol, filterFreq) {
    if (!ctx) return;
    const len = Math.floor(ctx.sampleRate * dur);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.value = vol;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start();
  }

  return {
    unlock() {
      ensure();
    },
    setMuted(m) {
      muted = m;
      if (master) master.gain.value = m ? 0 : 0.5;
    },
    isMuted() {
      return muted;
    },
    // Continuous engine hum follows the car's speed (0..1).
    engine(speed01, inCar) {
      if (!ensure()) return;
      if (!inCar || speed01 <= 0.02) {
        if (engineGain) engineGain.gain.value = 0;
        return;
      }
      if (!engineOsc) {
        engineOsc = ctx.createOscillator();
        engineOsc.type = 'sawtooth';
        engineGain = ctx.createGain();
        engineGain.gain.value = 0;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 320;
        engineOsc.connect(filter);
        filter.connect(engineGain);
        engineGain.connect(master);
        engineOsc.start();
      }
      engineOsc.frequency.value = 55 + speed01 * 130;
      engineGain.gain.value = 0.05 + speed01 * 0.05;
    },
    // Two-tone siren while any patrol car is near.
    siren(active, dt) {
      if (!ensure()) return;
      if (!active) {
        if (sirenGain) sirenGain.gain.value = 0;
        return;
      }
      if (!sirenOsc) {
        sirenOsc = ctx.createOscillator();
        sirenOsc.type = 'triangle';
        sirenGain = ctx.createGain();
        sirenGain.gain.value = 0;
        sirenOsc.connect(sirenGain);
        sirenGain.connect(master);
        sirenOsc.start();
      }
      sirenTimer += dt;
      if (sirenTimer > 0.42) {
        sirenTimer = 0;
        sirenHigh = !sirenHigh;
        sirenOsc.frequency.value = sirenHigh ? 880 : 660;
      }
      sirenGain.gain.value = 0.045;
    },
    shot() {
      if (!ensure()) return;
      noise(0.12, 0.5, 2600);
      tone(180, 0.08, 'square', 0.12, 0, 60);
    },
    crash(mag = 300) {
      if (!ensure()) return;
      const v = Math.min(0.7, mag / 600);
      noise(0.25, v, 500);
      tone(90, 0.2, 'sine', v * 0.8, 0, 40);
    },
    steal() {
      if (!ensure()) return;
      tone(520, 0.09, 'square', 0.1);
      tone(780, 0.12, 'square', 0.1, 0.09);
    },
    jingle(win = true) {
      if (!ensure()) return;
      const notes = win ? [523, 659, 784, 1047] : [392, 330, 262];
      notes.forEach((f, i) => tone(f, 0.22, 'triangle', 0.16, i * 0.13));
    },
    click() {
      if (!ensure()) return;
      tone(660, 0.06, 'sine', 0.12);
    },
    busted() {
      if (!ensure()) return;
      tone(220, 0.5, 'sawtooth', 0.14, 0, 110);
      tone(165, 0.6, 'sawtooth', 0.12, 0.25, 82);
    },
  };
}
