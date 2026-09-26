import { test } from "node:test";
import assert from "node:assert/strict";
import type { Feel } from "../lib/feel.ts";

// lib/feel.ts only builds real sound when `window` and `AudioContext` exist
// (see its `audio()`), and wires a few browser event listeners at import
// time. These are the minimal fakes needed to exercise that logic — not to
// check what the fakes "sound" like.
const calls = { osc: 0, gain: 0, filter: 0, bufSrc: 0 };
class Param {
  value = 0;
  setValueAtTime(v: number) { this.value = v; return this; }
  exponentialRampToValueAtTime(v: number) { this.value = v; return this; }
  setTargetAtTime(v: number) { this.value = v; return this; }
}
const linkable = () => ({ connect: (dest: unknown) => dest, disconnect() {}, start() {}, stop() {} });
class FakeAudioContext {
  sampleRate = 44100;
  currentTime = 0;
  state: "suspended" | "running" = "suspended";
  destination = {};
  createOscillator() { calls.osc++; return { type: "sine", frequency: new Param(), ...linkable() }; }
  createGain() { calls.gain++; return { gain: new Param(), ...linkable() }; }
  createBiquadFilter() { calls.filter++; return { type: "", Q: new Param(), frequency: new Param(), ...linkable() }; }
  createBuffer(_ch: number, len: number) { return { getChannelData: () => new Float32Array(len) }; }
  createBufferSource() { calls.bufSrc++; return { buffer: null, loop: false, ...linkable() }; }
  resume() { this.state = "running"; return Promise.resolve(); }
  suspend() { this.state = "suspended"; return Promise.resolve(); }
}

const winHandlers: Record<string, () => void> = {};
const docHandlers: Record<string, () => void> = {};
const fakeDoc = { hidden: false, addEventListener: (t: string, fn: () => void) => (docHandlers[t] = fn) };
(globalThis as Record<string, unknown>).document = fakeDoc;
(globalThis as Record<string, unknown>).window = globalThis;
(globalThis as Record<string, unknown>).addEventListener = (t: string, fn: () => void) => (winHandlers[t] = fn);
// real requestIdleCallback never fires synchronously; feel.ts relies on that
// to have finished initializing its own module-scope `audio` by the time
// this runs, so queue it rather than calling it inline
(globalThis as Record<string, unknown>).requestIdleCallback = (fn: () => void) => queueMicrotask(fn);
(globalThis as Record<string, unknown>).AudioContext = FakeAudioContext;
(navigator as unknown as Record<string, unknown>).vibrate = () => true;

// Imported once: feel.ts keeps its prefs/ctx as module-level singleton state,
// so every test below runs in sequence against the same instance (node:test
// runs top-level tests in one file sequentially).
const { feel, setFeel, buzz, sound, ambience, hush, setSilent } = await import("../lib/feel.ts");

test("feel: defaults to sound and vibration on, and returns a fresh copy", () => {
  const f = feel();
  assert.deepEqual(f, { sound: true, vibe: true });
  f.sound = false;
  assert.equal(feel().sound, true, "mutating the returned object must not leak back");
});

test("setFeel: updates the pref and persists it to localStorage", () => {
  setFeel("vibe", false);
  assert.equal(feel().vibe, false);
  assert.equal((JSON.parse(localStorage.getItem("gnogolf.feel")!) as Feel).vibe, false);
  setFeel("vibe", true);
  assert.equal(feel().vibe, true);
});

test("setFeel('sound', false/true) gates whether a sound actually plays", () => {
  setFeel("sound", false);
  const before = calls.osc;
  sound("blip");
  assert.equal(calls.osc, before, "sound off: no oscillator made");
  setFeel("sound", true);
  sound("blip");
  assert.equal(calls.osc, before + 1, "sound back on: plays again");
});

test("buzz: vibrates only while the vibe pref is on", () => {
  setFeel("vibe", true);
  let seen: VibratePattern | undefined;
  (navigator as unknown as Record<string, unknown>).vibrate = (p: VibratePattern) => ((seen = p), true);
  buzz([10, 20]);
  assert.deepEqual(seen, [10, 20]);

  seen = undefined;
  setFeel("vibe", false);
  buzz([10, 20]);
  assert.equal(seen, undefined, "vibe off: navigator.vibrate not called");
  setFeel("vibe", true);
});

test("buzz: swallows a throwing navigator.vibrate", () => {
  (navigator as unknown as Record<string, unknown>).vibrate = () => { throw new Error("no permission"); };
  assert.doesNotThrow(() => buzz([5]));
});

test("buzz: a no-op when the platform has no navigator.vibrate", () => {
  delete (navigator as unknown as Record<string, unknown>).vibrate;
  assert.doesNotThrow(() => buzz([5]));
  (navigator as unknown as Record<string, unknown>).vibrate = () => true;
});

test("setSilent: mutes sound outright, independent of the sound pref", () => {
  setFeel("sound", true);
  setSilent(true);
  const before = calls.osc;
  sound("blip");
  assert.equal(calls.osc, before, "silent: muted even though sound pref is on");
  setSilent(false);
  sound("blip");
  assert.equal(calls.osc, before + 1, "unsilenced: audible again");
});

test("hush: mutes ambient sound outside the gesture grace window", () => {
  hush(true);
  const base = performance.now();
  const restore = performance.now.bind(performance);
  performance.now = () => base + 10_000; // long past any gesture
  const before = calls.osc;
  try {
    sound("blip");
    assert.equal(calls.osc, before, "hushed and no recent gesture: muted");
  } finally {
    performance.now = restore;
  }
  hush(false);
});

test("hush: still lets a sound through right after a gesture (menu clicks off-course)", () => {
  winHandlers.pointerdown(); // marks a fresh gesture
  hush(true);
  const before = calls.osc;
  sound("blip");
  assert.equal(calls.osc, before + 1, "grace window right after the click: still audible");
  hush(false);
});

test("sound: every named sound plays without throwing, an unknown name is a no-op", () => {
  const names = [
    "putt", "knock", "boing", "splash", "stretch", "sand", "ice", "puddle", "flowers", "thud", "whoosh", "pop", "win",
    "select", "blip", "start", "cup",
  ];
  for (const name of names) assert.doesNotThrow(() => sound(name), name);
  const before = { ...calls };
  sound("not-a-real-sound");
  assert.deepEqual(calls, before, "unknown sound: nothing created");
});

test("ambience: a rain bed ramps in, and stops cleanly once it's dry again", () => {
  assert.doesNotThrow(() => ambience({ rain: true }));
  assert.doesNotThrow(() => ambience({ storm: true })); // louder branch, bed already exists
  assert.doesNotThrow(() => ambience({})); // dry again: schedules the loop's stop (fires ~4s later, harmless)
});

test("ambience: gusts are scheduled under wind or snow, and cleared on the next call", () => {
  assert.doesNotThrow(() => ambience({ wind: [3, 4] }));
  assert.doesNotThrow(() => ambience({ snow: true }));
  ambience({}); // clears the pending gust timer (no dangling timer left behind)
});

test("ambience/sound: nothing plays once the tab is hidden, resumes when visible again", () => {
  const before = calls.osc;
  fakeDoc.hidden = true;
  docHandlers.visibilitychange(); // away()
  sound("blip");
  assert.equal(calls.osc, before, "hidden tab: muted");

  fakeDoc.hidden = false;
  winHandlers.pointerdown(); // a fresh gesture, so resume() is willing to run
  docHandlers.visibilitychange(); // back()
  sound("blip");
  assert.equal(calls.osc, before + 1, "visible again: audible");
});

test("window blur/focus mirror hidden/visible for the ambient bed", () => {
  assert.doesNotThrow(() => winHandlers.blur());
  assert.doesNotThrow(() => winHandlers.keydown());
  assert.doesNotThrow(() => winHandlers.focus());
});
