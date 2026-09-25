// What a shot sounds and feels like: small synthesized sounds (no files to
// load) and a light vibration where the phone allows it. Both can be switched
// off in the menu; the choice is kept in this browser.

const KEY = "gnogolf.feel";
const prefs = (() => {
  try {
    return { sound: true, vibe: true, ...JSON.parse(localStorage.getItem(KEY) || "{}") };
  } catch {
    return { sound: true, vibe: true };
  }
})();

export const feel = () => ({ ...prefs });
export function setFeel(k, v) {
  prefs[k] = v;
  if (k === "sound") ambience(v ? mood : {});
  try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch {}
}

export function buzz(p) {
  if (!prefs.vibe) return;
  try { navigator.vibrate && navigator.vibrate(p); } catch {}
}

// one context, made on the first sound: browsers only allow it after a gesture,
// and every sound here follows one
let ctx = null;
// When the game may make a sound at all: its tab shown AND focused, never in
// a demo (a scripted pull is no player's), and — away from a hole (the
// title, the cups, the picker) — only right after the player's own click.
// Leaving the tab or the window suspends the audio and drops every pending
// sound; coming back resumes it (after a gesture, if the browser wants one)
// and the weather fades in again.
let gestureAt = 0, silent = false;
const present = () => typeof document !== "undefined" && !document.hidden && (document.hasFocus ? document.hasFocus() : true);
const audible = () => prefs.sound && !silent && present() && (!hushed || performance.now() - gestureAt < 1500);
/** A demo or a recording plays silent. */
export const setSilent = (on) => ((silent = !!on), ambience(mood));
if (typeof window !== "undefined") {
  const touched = () => {
    gestureAt = performance.now();
    if (ctx && ctx.state === "suspended" && present()) ctx.resume().catch(() => {}); // a gesture's own: never deduped
  };
  window.addEventListener("pointerdown", touched, true);
  window.addEventListener("keydown", touched, true);
  const away = () => {
    clearTimeout(gusts);
    if (bed) bed.g.gain.value = 0;
    if (ctx && ctx.state === "running") ctx.suspend().catch(() => {});
  };
  const back = () => {
    if (!present()) return;
    if (ctx && ctx.state === "suspended" && performance.now() - gestureAt < 60 * 60e3) ctx.resume().catch(() => {});
    ambience(mood); // the weather fades back in
  };
  // Making the context costs ~90 ms, once: made here in idle time, not by the
  // first creak of the first pull (a stall mid-drag). It starts suspended;
  // the first gesture resumes it (touched).
  const early = () => prefs.sound && !ctx && audio();
  if (window.requestIdleCallback) window.requestIdleCallback(early, { timeout: 4000 });
  else setTimeout(early, 1500);
  window.addEventListener("blur", away);
  window.addEventListener("focus", back);
  document.addEventListener("visibilitychange", () => (document.hidden ? away() : back()));
}
const audio = () => {
  if (!ctx) {
    const A = typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext);
    if (!A) return null;
    ctx = new A();
  }
  if (ctx.state === "suspended" && present()) resume(); // no gesture yet: the next one will do
  return ctx;
};
// one resume asked at a time by the sounds: a context the browser keeps
// suspended (no gesture yet) is not asked again by every creak of a pull (the
// gesture and focus handlers ask on their own)
let resuming = null;
const resume = () => (resuming = resuming || ctx.resume().catch(() => {}).finally(() => (resuming = null)));

function tone(a, { type = "sine", f0, f1 = f0, at = 0, dur, gain = 0.2 }) {
  const t = a.currentTime + at, o = a.createOscillator(), g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(a, { at = 0, dur, f0, f1 = f0, q = 1, gain = 0.2 }) {
  const t = a.currentTime + at, n = Math.ceil(a.sampleRate * dur);
  const buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource(), bp = a.createBiquadFilter(), g = a.createGain();
  src.buffer = buf;
  bp.type = "bandpass";
  bp.Q.value = q;
  bp.frequency.setValueAtTime(f0, t);
  bp.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(bp).connect(g).connect(a.destination);
  src.start(t);
}

const SOUNDS = {
  // the putter on the ball: a dry tock
  putt: (a, k = 1) => (noise(a, { dur: 0.04, f0: 2400, q: 3, gain: 0.25 * k }), tone(a, { f0: 900, f1: 380, dur: 0.07, gain: 0.18 * k })),
  // off a timber rail
  knock: (a, k = 1) => tone(a, { type: "triangle", f0: 260, f1: 150, dur: 0.09, gain: 0.16 * k }),
  // off a mushroom: boing
  boing: (a) => tone(a, { type: "triangle", f0: 320, f1: 720, dur: 0.16, gain: 0.14 }),
  // into the water: a plunk (a drop's pitch rises as its cavity closes), a
  // short wash, then a few bubbles coming up
  splash: (a) => {
    tone(a, { f0: 260, f1: 900, dur: 0.07, gain: 0.22 });
    noise(a, { at: 0.02, dur: 0.25, f0: 1200, f1: 500, q: 0.9, gain: 0.12 });
    for (let i = 0; i < 6; i++) {
      const f = 500 + Math.random() * 700;
      tone(a, { f0: f, f1: f * 1.8, at: 0.18 + i * 0.07 + Math.random() * 0.05, dur: 0.04, gain: 0.05 });
    }
  },
  // the elastic pulled a notch further: a rubbery creak that rises with it
  stretch: (a, k = 0.5) => tone(a, { type: "triangle", f0: 160 + k * 420, f1: 200 + k * 480, dur: 0.05, gain: 0.05 + k * 0.04 }),
  // rolling over a surface, once a step, as loud as the ball is fast: sand
  // crunches (two grains of noise), ice hisses, water splishes, flowers rustle
  sand: (a, k = 1) => (noise(a, { dur: 0.1, f0: 1100, f1: 500, q: 1.1, gain: 0.34 * k }), noise(a, { at: 0.04, dur: 0.06, f0: 2400, f1: 1400, q: 2, gain: 0.16 * k })),
  ice: (a, k = 1) => (noise(a, { dur: 0.16, f0: 7000, f1: 5200, q: 3, gain: 0.2 * k }), tone(a, { type: "sine", f0: 2600 + k * 900, f1: 2300, dur: 0.12, gain: 0.025 * k })),
  puddle: (a, k = 1) => (noise(a, { dur: 0.12, f0: 1300, f1: 2800, q: 1.8, gain: 0.26 * k }), tone(a, { f0: 600, f1: 1200, dur: 0.06, gain: 0.07 * k })),
  flowers: (a, k = 1) => noise(a, { dur: 0.12, f0: 2600, f1: 1500, q: 0.9, gain: 0.18 * k }),
  // landing in the scenery: a dull thud
  thud: (a) => (tone(a, { f0: 140, f1: 55, dur: 0.18, gain: 0.3 }), noise(a, { dur: 0.08, f0: 400, q: 1, gain: 0.15 })),
  whoosh: (a) => noise(a, { dur: 0.5, f0: 300, f1: 1600, q: 1.5, gain: 0.18 }),
  // the confetti going off: a party-popper crack and a fizz of paper
  pop: (a) => {
    noise(a, { dur: 0.06, f0: 3000, q: 0.8, gain: 0.35 });
    tone(a, { type: "square", f0: 180, f1: 60, dur: 0.08, gain: 0.08 });
    noise(a, { at: 0.05, dur: 0.6, f0: 5000, f1: 7000, q: 0.5, gain: 0.05 });
  },
  // a success: a bright fanfare after the pop
  win: (a, aces = 0) => {
    const notes = aces ? [523, 659, 784, 1047, 1319] : [392, 523, 659, 784];
    notes.forEach((f, i) => tone(a, { type: "triangle", f0: f, at: 0.25 + i * 0.1, dur: i === notes.length - 1 ? 0.5 : 0.16, gain: 0.11 }));
    tone(a, { type: "sine", f0: notes[0] / 2, at: 0.25, dur: 0.7, gain: 0.07 });
  },
  // the menus: a wooden tick to choose, a blip to flick through, a chime to go
  select: (a) => (tone(a, { type: "triangle", f0: 660, f1: 520, dur: 0.07, gain: 0.12 }), noise(a, { dur: 0.03, f0: 2600, q: 3, gain: 0.08 })),
  blip: (a) => tone(a, { type: "sine", f0: 880, f1: 990, dur: 0.05, gain: 0.08 }),
  start: (a) => [523, 784, 1047].forEach((f, i) => tone(a, { type: "triangle", f0: f, at: i * 0.07, dur: i === 2 ? 0.35 : 0.1, gain: 0.1 })),
  // into the cup: the plop of the ball dropping (the fanfare comes with the confetti)
  cup: (a) => (tone(a, { f0: 520, f1: 180, dur: 0.12, gain: 0.22 }), tone(a, { type: "triangle", f0: 140, f1: 90, at: 0.08, dur: 0.1, gain: 0.1 })),
};

// The weather's own sound, underneath the rest and quiet: a rain bed that
// fades in and out, a gust of wind now and then (harder in a gale), the odd
// soft whoosh of snow. Nothing plays in a hidden tab.
let mood = {}, bed = null, gusts = null, hushed = false;
/** Off the course (title, cup and gnome screens) the weather is silent; back on
 *  it, the hole's weather plays again. */
// ?camlog: every sound asked for, played or not (a test counts them)
const soundLog = typeof location !== "undefined" && /[?&]camlog/.test(location.search) ? [] : null;
if (soundLog && typeof window !== "undefined") window.__soundLog = soundLog;
export function hush(off) {
  hushed = !!off;
  ambience(mood);
}
export function ambience(w = {}) {
  mood = w;
  const on = prefs.sound && !silent && present() && !hushed;
  const a = on ? audio() : ctx;
  if (!a) return;
  // the rain bed: looped noise through a band-pass, its gain ramped
  if (!bed && on && (w.rain || w.storm)) {
    const n = a.sampleRate * 2, buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const src = a.createBufferSource(), bp = a.createBiquadFilter(), g = a.createGain();
    src.buffer = buf;
    src.loop = true;
    bp.type = "bandpass";
    bp.frequency.value = 1400;
    bp.Q.value = 0.4;
    g.gain.value = 0;
    src.connect(bp).connect(g).connect(a.destination);
    src.start();
    bed = { src, g };
  }
  if (bed) {
    const wet = on && (w.rain || w.storm);
    bed.g.gain.setTargetAtTime(wet ? (w.storm ? 0.09 : 0.06) : 0, a.currentTime, 0.8);
    // dry again: once it has faded, the loop is stopped for good (a new one
    // starts with the next rain)
    clearTimeout(bed.stop);
    if (!wet) {
      const b = bed;
      b.stop = setTimeout(() => {
        try { b.src.stop(); b.src.disconnect(); } catch {}
        if (bed === b) bed = null;
      }, 4000);
    }
  }
  // gusts and snow: a timer that stops when neither blows
  clearTimeout(gusts);
  const s = w.wind ? Math.hypot(w.wind[0], w.wind[1]) : 0;
  if (on && (s || w.snow)) {
    const next = () => {
      gusts = setTimeout(() => {
        if (!present() || hushed || silent) return; // gone meanwhile: no gust into an empty room
        if (w.snow && !s) noise(a, { dur: 1.6, f0: 500, f1: 900, q: 0.8, gain: 0.02 });
        else noise(a, { dur: 1.4 + Math.random(), f0: 250, f1: 700 + s * 4000, q: 0.9, gain: Math.min(0.12, 0.03 + s * 0.9) });
        next();
      }, (w.snow && !s ? 7000 : 5000 - Math.min(3000, s * 30000)) * (0.6 + Math.random() * 0.8));
    };
    next();
  }
}

export function sound(name, k) {
  if (soundLog) soundLog.push([name, audible() ? 1 : 0, Math.round(performance.now())]);
  if (!audible()) return;
  const a = audio();
  if (!a || !SOUNDS[name]) return;
  try { SOUNDS[name](a, k); } catch {}
}
