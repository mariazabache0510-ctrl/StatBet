/**
 * Efectos de sonido sintetizados con Web Audio (sin archivos que descargar).
 * El navegador exige un gesto del usuario antes de sonar: se «desbloquea» en el primer toque.
 */
let ctx = null;
let muted = localStorage.getItem('statbet:muted') === '1';

export function unlockAudio() {
  try {
    ctx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
  } catch {
    ctx = null;
  }
}

export const isMuted = () => muted;

export function setMuted(v) {
  muted = v;
  localStorage.setItem('statbet:muted', v ? '1' : '0');
}

function tone(freq, start, dur, { type = 'sine', gain = 0.16 } = {}) {
  if (!ctx || muted) return;
  const t = ctx.currentTime + start;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

/** «Clic» de ficha: ruido breve filtrado. */
function clack(start = 0, gain = 0.12) {
  if (!ctx || muted) return;
  const t = ctx.currentTime + start;
  const len = Math.floor(ctx.sampleRate * 0.04);
  const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 3200;
  const g = ctx.createGain();
  g.gain.value = gain;
  src.connect(filter).connect(g).connect(ctx.destination);
  src.start(t);
}

export const sfx = {
  tap: () => tone(700, 0, 0.05, { type: 'triangle', gain: 0.06 }),
  chip: () => clack(0, 0.14),
  chips: (n = 4) => {
    for (let i = 0; i < n; i++) clack(i * 0.055, 0.1 + Math.random() * 0.05);
  },
  bet: () => {
    clack(0, 0.16);
    clack(0.07, 0.12);
    tone(880, 0.05, 0.12, { type: 'triangle', gain: 0.07 });
  },
  win: () => {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.08, 0.24, { type: 'triangle', gain: 0.14 }));
    for (let i = 0; i < 6; i++) clack(0.3 + i * 0.05, 0.1);
  },
  lose: () => {
    tone(330, 0, 0.22, { type: 'sawtooth', gain: 0.07 });
    tone(247, 0.16, 0.34, { type: 'sawtooth', gain: 0.07 });
  },
  neutral: () => tone(587, 0, 0.16, { type: 'triangle', gain: 0.1 }),
  open: () => [392, 523, 659].forEach((f, i) => tone(f, i * 0.09, 0.2, { type: 'square', gain: 0.05 })),
  close: () => [659, 523].forEach((f, i) => tone(f, i * 0.1, 0.18, { type: 'square', gain: 0.05 })),
  tick: () => tone(1250, 0, 0.035, { type: 'square', gain: 0.04 }),
  reveal: () => {
    for (let i = 0; i < 10; i++) tone(110 + (i % 2) * 30, i * 0.07, 0.06, { type: 'square', gain: 0.05 });
    tone(880, 0.75, 0.4, { type: 'triangle', gain: 0.14 });
  },
  fanfare: () => [523, 523, 523, 698, 880, 1047].forEach((f, i) => tone(f, i * 0.14, i === 5 ? 0.8 : 0.16, { type: 'triangle', gain: 0.16 })),
};

export function vibrate(pattern) {
  if (!muted && navigator.vibrate) navigator.vibrate(pattern);
}
