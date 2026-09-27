import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { CAM_ORDER, savedCam, saveCam, hadGnome, savedGnome, earned, remember, stillsOnly } from "../lib/prefs.ts";
import { GNOMES } from "../lib/scene/gnome.ts";

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  delete (globalThis as Record<string, unknown>).matchMedia;
  delete (navigator as unknown as Record<string, unknown>).connection;
});
afterEach(() => {
  delete (globalThis as Record<string, unknown>).matchMedia;
  delete (navigator as unknown as Record<string, unknown>).connection;
});

// ---- camera ----

test("CAM_ORDER starts with classic", () => {
  assert.equal(CAM_ORDER[0], "classic");
});

test("savedCam: classic when nothing was picked yet", () => {
  assert.equal(savedCam(), "classic");
});

test("saveCam/savedCam: round-trips through sessionStorage, not localStorage", () => {
  saveCam("third");
  assert.equal(savedCam(), "third");
  assert.equal(localStorage.getItem("gnogolf.cam.session"), null);
});

test("savedCam: an unknown session value falls back to classic", () => {
  sessionStorage.setItem("gnogolf.cam.session", "bogus");
  assert.equal(savedCam(), "classic");
});

test("savedCam: forgets the old, lasting localStorage choice", () => {
  localStorage.setItem("gnogolf.cam", "far");
  savedCam();
  assert.equal(localStorage.getItem("gnogolf.cam"), null);
});

test("savedCam: a storage that throws falls back to classic", () => {
  sessionStorage.getItem = () => { throw new Error("boom"); };
  try {
    assert.equal(savedCam(), "classic");
  } finally {
    delete (sessionStorage as unknown as Record<string, unknown>).getItem;
  }
});

test("saveCam: swallows a storage that throws", () => {
  sessionStorage.setItem = () => { throw new Error("quota"); };
  try {
    assert.doesNotThrow(() => saveCam("far"));
  } finally {
    delete (sessionStorage as unknown as Record<string, unknown>).setItem;
  }
});

// ---- gnome ----

test("hadGnome: false before any pick, true after", () => {
  assert.equal(hadGnome(), false);
  localStorage.setItem("gnogolf.gnome", "classic");
  assert.equal(hadGnome(), true);
});

test("hadGnome: a storage that throws reads as false", () => {
  localStorage.getItem = () => { throw new Error("boom"); };
  try {
    assert.equal(hadGnome(), false);
  } finally {
    delete (localStorage as unknown as Record<string, unknown>).getItem;
  }
});

test("savedGnome: the first gnome when nothing was picked", () => {
  assert.equal(savedGnome(), GNOMES[0].id);
});

test("savedGnome: an unlock-free pick is returned as-is", () => {
  const free = GNOMES.find((g) => !g.unlock && g.id !== GNOMES[0].id)!;
  assert.ok(free, "there is a second unlock-free gnome to pick, distinct from index 0");
  localStorage.setItem("gnogolf.gnome", free.id);
  assert.equal(savedGnome(), free.id);
});

test("savedGnome: a gated pick not yet earned falls back to the first gnome", () => {
  const gated = GNOMES.find((g) => g.unlock)!;
  localStorage.setItem("gnogolf.gnome", gated.id);
  assert.equal(savedGnome(), GNOMES[0].id);
});

test("savedGnome: a gated pick that was earned is kept", () => {
  const gated = GNOMES.find((g) => g.unlock)!;
  localStorage.setItem("gnogolf.gnome", gated.id);
  localStorage.setItem("gnogolf.earned", JSON.stringify([gated.id]));
  assert.equal(savedGnome(), gated.id);
});

test("savedGnome: an unknown id falls back to the first gnome", () => {
  localStorage.setItem("gnogolf.gnome", "not-a-real-gnome");
  assert.equal(savedGnome(), GNOMES[0].id);
});

test("savedGnome: a storage that throws falls back to the first gnome", () => {
  localStorage.getItem = () => { throw new Error("boom"); };
  try {
    assert.equal(savedGnome(), GNOMES[0].id);
  } finally {
    delete (localStorage as unknown as Record<string, unknown>).getItem;
  }
});

// ---- earned ----

test("earned: empty when nothing was stored", () => {
  assert.deepEqual(earned(), []);
});

test("earned: a stored array is returned", () => {
  localStorage.setItem("gnogolf.earned", JSON.stringify(["wizard", "king"]));
  assert.deepEqual(earned(), ["wizard", "king"]);
});

test("earned: a hand-edited non-array is ignored", () => {
  localStorage.setItem("gnogolf.earned", JSON.stringify({ wizard: true }));
  assert.deepEqual(earned(), []);
});

test("earned: corrupt JSON is ignored", () => {
  localStorage.setItem("gnogolf.earned", "{not json");
  assert.deepEqual(earned(), []);
});

test("remember: adds a gnome and does not duplicate it", () => {
  remember("wizard");
  remember("wizard");
  assert.deepEqual(earned(), ["wizard"]);
  remember("king");
  assert.deepEqual(earned(), ["wizard", "king"]);
});

test("remember: swallows a storage that throws", () => {
  localStorage.setItem = () => { throw new Error("quota"); };
  try {
    assert.doesNotThrow(() => remember("wizard"));
  } finally {
    delete (localStorage as unknown as Record<string, unknown>).setItem;
  }
});

// ---- stillsOnly ----

test("stillsOnly: true when the OS asks for reduced motion", () => {
  (globalThis as Record<string, unknown>).matchMedia = () => ({ matches: true });
  assert.equal(stillsOnly(), true);
});

test("stillsOnly: true on a data-saver connection", () => {
  (globalThis as Record<string, unknown>).matchMedia = () => ({ matches: false });
  (navigator as unknown as Record<string, unknown>).connection = { saveData: true };
  assert.equal(stillsOnly(), true);
});

test("stillsOnly: true on a 2g-class connection", () => {
  (globalThis as Record<string, unknown>).matchMedia = () => ({ matches: false });
  (navigator as unknown as Record<string, unknown>).connection = { effectiveType: "slow-2g" };
  assert.equal(stillsOnly(), true);
});

test("stillsOnly: false with a fine connection and no stored preference", () => {
  (globalThis as Record<string, unknown>).matchMedia = () => ({ matches: false });
  (navigator as unknown as Record<string, unknown>).connection = { effectiveType: "4g" };
  assert.equal(stillsOnly(), false);
});

test("stillsOnly: true when gnogolf.gfx is low", () => {
  (globalThis as Record<string, unknown>).matchMedia = () => ({ matches: false });
  localStorage.setItem("gnogolf.gfx", "low");
  assert.equal(stillsOnly(), true);
});

test("stillsOnly: true when gfx is auto but the engine measured the device as slow", () => {
  (globalThis as Record<string, unknown>).matchMedia = () => ({ matches: false });
  localStorage.setItem("gnogolf.gfx.slow", "low");
  assert.equal(stillsOnly(), true);
});

test("stillsOnly: gnogolf.gfx=high overrides a measured-slow device", () => {
  (globalThis as Record<string, unknown>).matchMedia = () => ({ matches: false });
  localStorage.setItem("gnogolf.gfx", "high");
  localStorage.setItem("gnogolf.gfx.slow", "low");
  assert.equal(stillsOnly(), false);
});

test("stillsOnly: no matchMedia to ask (lib/device.ts) says no reduced motion; the rest decides", () => {
  // matchMedia left undefined by beforeEach
  assert.equal(stillsOnly(), false);
});
