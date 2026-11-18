// Synthesised sound for Solara Bay — every effect is generated with
// WebAudio, no audio files. Safe to import in Node: it only touches
// AudioContext when a browser calls ensureAudio().
let ctx = null;
let master = null;
let muted = false;
let engineOsc = null;
let engineGain = null;
let sirenTimer = null;

export function ensureAudio() {
  if (typeof window === 'undefined') return;
  if (!ctx) {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
    } catch {
      ctx = null;
    }
  }
  if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
}

export function toggleMute() {
  muted = !muted;
  if (master) master.gain.value = muted ? 0 : 0.35;
  return muted;
}

function tone(freq, dur, type = 'sine', vol = 0.2, slideTo = null) {
  if (!ctx || muted) return;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.connect(gain);
  gain.connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function noise(dur, vol = 0.2, filterFreq = 1200) {
  if (!ctx || muted) return;
  const t = ctx.currentTime;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = filterFreq;
  const gain = ctx.createGain();
  gain.gain.value = vol;
  src.connect(filter);
  filter.connect(gain);
  gain.connect(master);
  src.start(t);
}

export function playSfx(name) {
  if (!ctx || muted) return;
  switch (name) {
    case 'shot': noise(0.12, 0.5, 3000); tone(180, 0.08, 'square', 0.25, 60); break;
    case 'crash': noise(0.25, 0.5, 500); tone(90, 0.2, 'sawtooth', 0.2, 40); break;
    case 'steal': tone(520, 0.09, 'square', 0.15); setTimeout(() => tone(760, 0.12, 'square', 0.15), 90); break;
    case 'mission': [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.22, 'triangle', 0.22), i * 110)); break;
    case 'checkpoint': tone(880, 0.15, 'triangle', 0.25); setTimeout(() => tone(1175, 0.2, 'triangle', 0.25), 120); break;
    case 'fail': tone(320, 0.25, 'sawtooth', 0.18, 160); break;
    case 'wanted': tone(700, 0.12, 'square', 0.2, 950); setTimeout(() => tone(700, 0.12, 'square', 0.2, 950), 160); break;
    case 'cooldown': tone(440, 0.3, 'sine', 0.15, 660); break;
    case 'busted': [392, 330, 262].forEach((f, i) => setTimeout(() => tone(f, 0.3, 'sawtooth', 0.18), i * 180)); break;
    case 'wasted': [330, 262, 196, 131].forEach((f, i) => setTimeout(() => tone(f, 0.35, 'sawtooth', 0.18), i * 200)); break;
    case 'win': [523, 659, 784, 1047, 1319].forEach((f, i) => setTimeout(() => tone(f, 0.3, 'triangle', 0.22), i * 130)); break;
    case 'click': tone(660, 0.05, 'square', 0.12); break;
    case 'pickup': tone(980, 0.12, 'sine', 0.2, 1320); break;
    default: break;
  }
}

// A soft two-tone siren loop while wanted > 0, plus a low engine hum while
// driving.
export function updateAmbience(wanted, driving, speed) {
  if (!ctx || muted) {
    if (engineOsc) { try { engineOsc.stop(); } catch {} engineOsc = null; }
    if (sirenTimer) { clearInterval(sirenTimer); sirenTimer = null; }
    return;
  }
  if (wanted > 0 && !sirenTimer) {
    let high = false;
    sirenTimer = setInterval(() => {
      if (muted) return;
      tone(high ? 950 : 700, 0.45, 'sine', 0.05);
      high = !high;
    }, 450);
  } else if (wanted === 0 && sirenTimer) {
    clearInterval(sirenTimer);
    sirenTimer = null;
  }
  if (driving) {
    if (!engineOsc) {
      engineOsc = ctx.createOscillator();
      engineGain = ctx.createGain();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 60;
      engineGain.gain.value = 0.03;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 400;
      engineOsc.connect(filter);
      filter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
    }
    engineOsc.frequency.value = 55 + Math.abs(speed) * 0.16;
    engineGain.gain.value = 0.02 + Math.abs(speed) / 540 * 0.05;
  } else if (engineOsc) {
    try { engineOsc.stop(); } catch {}
    engineOsc = null;
  }
}
