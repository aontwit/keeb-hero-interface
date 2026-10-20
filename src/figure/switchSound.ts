import type { SwitchSpec } from '../content';

/**
 * Three switch voices, synthesised: no samples to load, and each voice is built
 * from the part that actually makes the noise.
 *
 * - every switch: the bottom-out, a low thock (a damped sine plus a lowpassed
 *   noise burst — the cap hitting the housing, ringing through the plate)
 * - brown: a soft tactile tick a few ms before the bottom-out, the bump
 * - blue: a bright click jacket snap on the way down AND on the way up
 * - release: the stem slamming back into the top housing, quieter and higher
 *
 * ponytail: one shared noise buffer and short-lived nodes per hit; the browser
 * collects them. Pool them if anyone ever holds down twenty keys at once.
 */
type Id = SwitchSpec['id'];

let ctx: AudioContext | null = null;
let noise: AudioBuffer | null = null;
let master: GainNode | null = null;

function audio() {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(ctx.destination);
    noise = ctx.createBuffer(1, ctx.sampleRate * 0.25, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') void ctx.resume(); // autoplay policy: first gesture wakes it
  return ctx;
}

const jitter = (v: number, by = 0.08) => v * (1 + (Math.random() * 2 - 1) * by);

/** Filtered noise burst: `type` filter at `freq`, `dur` seconds of exponential decay. */
function burst(t: number, type: BiquadFilterType, freq: number, q: number, dur: number, level: number) {
  const c = ctx!;
  const src = c.createBufferSource();
  src.buffer = noise;
  src.playbackRate.value = jitter(1, 0.15);
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.value = jitter(freq);
  f.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(level, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(master!);
  src.start(t, Math.random() * 0.2);
  src.stop(t + dur + 0.02);
}

/** Damped sine: the body of the thock. */
function tone(t: number, freq: number, dur: number, level: number) {
  const c = ctx!;
  const o = c.createOscillator();
  o.frequency.setValueAtTime(jitter(freq), t);
  o.frequency.exponentialRampToValueAtTime(freq * 0.6, t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(level, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master!);
  o.start(t);
  o.stop(t + dur + 0.02);
}

const thock = (t: number, level = 1) => {
  tone(t, 210, 0.07, 0.5 * level);
  burst(t, 'lowpass', 1400, 0.7, 0.05, 0.9 * level);
  burst(t, 'bandpass', 3200, 1.2, 0.018, 0.25 * level); // plate ping
};
const click = (t: number, level = 1) => {
  burst(t, 'highpass', 3800, 0.9, 0.012, 1.1 * level);
  burst(t, 'bandpass', 6200, 3, 0.02, 0.6 * level);
};

export function playSwitch(id: Id, down: boolean) {
  const c = audio();
  const t = c.currentTime + 0.002;
  if (down) {
    if (id === 'blue') click(t);
    if (id === 'brown') burst(t, 'bandpass', 2100, 2, 0.014, 0.35);
    thock(t + (id === 'red' ? 0 : 0.018), id === 'red' ? 1 : 0.85);
  } else {
    if (id === 'blue') click(t, 0.55);
    burst(t + 0.004, 'bandpass', 2600, 1.4, 0.03, 0.35);
    tone(t + 0.004, 320, 0.04, 0.18);
  }
}
