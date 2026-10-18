// The editor's keys (lib/builder/keys.ts): what a key press asks for, and the
// keys as the board's key line and the glossary say them (one list).
import { test } from "node:test";
import assert from "node:assert/strict";
import { KEY_LINE, KEYS, keyAction, markSeen, playKey, seen, showOnce, shownOnce } from "../lib/builder/keys.ts";

const press = (key: string, o: { meta?: boolean; ctrl?: boolean; alt?: boolean } = {}) => keyAction({ key, metaKey: !!o.meta, ctrlKey: !!o.ctrl, altKey: !!o.alt });

void test("keyAction: 1 to 5 pick the palette's first five, F frames the hole, T plays, P shows the player's view; with a modifier, none", () => {
  assert.deepEqual([1, 2, 3, 4, 5].map((n) => press(String(n))), [0, 1, 2, 3, 4].map((n) => ({ t: "arm", n })));
  assert.equal(press("6"), null);
  assert.deepEqual(press("f"), { t: "frame" });
  assert.deepEqual(press("F"), { t: "frame" });
  assert.deepEqual(press("t"), { t: "play" });
  assert.deepEqual(press("p"), { t: "view" });
  assert.equal(press("t", { meta: true }), null, "⌘T: the browser's");
  assert.equal(press("1", { ctrl: true }), null);
  assert.equal(press("f", { alt: true }), null);
});

void test("keyAction: V tilts the 3D board and back, Q turns it a quarter (with Shift, the other way)", () => {
  assert.deepEqual(press("v"), { t: "tilt" });
  assert.deepEqual(press("q"), { t: "turn", by: 1 });
  assert.deepEqual(keyAction({ key: "Q", metaKey: false, ctrlKey: false, altKey: false, shiftKey: true }), { t: "turn", by: -1 });
  assert.equal(press("q", { meta: true }), null);
});

void test("KEYS: each key once, in a few words for the key line and a sentence for the glossary", () => {
  const keys = KEYS.map((k) => k.key);
  assert.equal(new Set(keys).size, keys.length);
  for (const k of ["1–5", "Space", "F", "T", "P", "Esc", "⇧ drag", "V", "Q"]) assert.ok(keys.includes(k), k);
  for (const k of KEYS) assert.ok(k.short.split(" ").length <= 2 && k.long.length > k.short.length, k.key);
});

void test("? shows every key (the hints and the glossary); the board's key line the few most used and ?, every key in the glossary", () => {
  assert.deepEqual(press("?"), { t: "help" });
  assert.equal(press("?", { meta: true }), null);
  assert.deepEqual(KEY_LINE.map((k) => k.key), ["1–5", "R", "modZ", "T", "?"]);
  assert.ok(KEY_LINE.every((k) => KEYS.includes(k)), "the line's keys, the glossary's too");
});

void test("playKey: in play, R or Backspace plays again from the tee, V swaps the overview, Escape goes back to Build; with a modifier, none", () => {
  const k = (key: string, meta = false) => playKey({ key, metaKey: meta, ctrlKey: false, altKey: false });
  assert.deepEqual([k("r"), k("R"), k("Backspace"), k("v"), k("Escape")], ["restart", "restart", "restart", "view", "leave"]);
  assert.equal(k("r", true), null, "⌘R: the browser's");
  assert.equal(k("x"), null);
});

void test("seen, markSeen: a help shown on a browser's first visit only, kept apart for each; a browser that keeps nothing shows it each time", () => {
  localStorage.clear();
  assert.equal(seen("keys"), false, "the first visit");
  markSeen("keys");
  assert.equal(seen("keys"), true, "after it");
  assert.equal(seen("drag"), false, "each help its own");
  const real = globalThis.localStorage;
  Object.defineProperty(globalThis, "localStorage", { get: () => { throw new Error("blocked"); }, configurable: true });
  try {
    markSeen("drag");
    assert.equal(seen("keys"), false);
  } finally {
    Object.defineProperty(globalThis, "localStorage", { value: real, configurable: true, writable: true });
  }
});

void test("showOnce, shownOnce: a help is marked seen when it is shown (not when its place mounts), and stays for the rest of the visit", () => {
  localStorage.clear();
  assert.equal(showOnce("drag"), true, "a first visit");
  assert.equal(seen("drag"), false, "asked, not yet shown: not seen");
  shownOnce("drag");
  assert.equal(seen("drag"), true, "shown: not on the next visit");
  assert.equal(showOnce("drag"), true, "this visit: still shown (an editor opened again)");
  markSeen("keys");
  assert.equal(showOnce("keys"), false, "seen on an earlier visit, never shown on this one: not shown");
});
