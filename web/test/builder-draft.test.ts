// The builder's Draft (lib/builder/draft.ts): what the editor works on, read
// back from a file or the browser only once it is whole and on the grid;
// its history; its persistence.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DRAFTS_KEY, MAX_PIECES, emptyDraft, exportDraft, history, loadDrafts, onGrid, parseDraft, saveDrafts, type Draft } from "../lib/builder/draft.ts";

const base = (): Draft => ({
  ...emptyDraft("garden"),
  slug: "mole-run",
  title: "Mole Run",
  tee: [3, 5],
  pin: [20, 5],
  pieces: [
    { id: "p1", entry: "*/rail/", geometry: { t: "rail", a: [1.5, 1.5], b: [22.5, 1.5] }, params: {}, clock: { k: "fixed" } },
    { id: "p2", entry: "*/post/rock", geometry: { t: "post", c: [10, 5], r: 0.75 }, params: { bounce: 0.6 }, clock: { k: "stroke", pulse: 0 } },
    { id: "p3", entry: "*/bar/plank", geometry: { t: "bar", a: [12, 3], b: [14, 3], thick: 0.5 }, params: {}, clock: { k: "substep", every: 40, on: 20, phase: 0 } },
    { id: "p4", entry: "*/hazard/water", geometry: { t: "round", min: [15, 6], max: [18, 9] }, params: {}, clock: { k: "fixed" } },
  ],
  pulses: [{ every: 3, on: 1, phase: 0 }],
});
const why = (d: unknown) => {
  const r = parseDraft(JSON.stringify(d));
  return typeof r === "string" ? r : "ok";
};

void test("onGrid: multiples of a quarter, finite", () => {
  assert.ok(onGrid(1.25) && onGrid(0) && onGrid(-3.75));
  assert.ok(!onGrid(0.3) && !onGrid(Number.NaN) && !onGrid(Number.POSITIVE_INFINITY));
});

void test("a whole draft reads back as it was written", () => {
  const d = base();
  assert.deepEqual(parseDraft(exportDraft(d)), d);
  assert.deepEqual(parseDraft(JSON.stringify(emptyDraft("island"))), emptyDraft("island"));
});

void test("anything else is refused, with why", () => {
  assert.equal(why("x"), "The file is not a draft.");
  assert.equal(parseDraft("{"), "The file is not a draft.");
  assert.equal(why({ ...base(), v: 2 }), "This draft is from another version of the Builder.");
  assert.equal(why({ ...base(), world: "moon" }), "No world is called moon.");
  assert.equal(why({ ...base(), slug: "A" }), "The hole's short name is 1 to 32 lower-case letters, digits and dashes.");
  assert.equal(why({ ...base(), title: "x".repeat(41) }), "The name is at most 40 characters.");
  assert.equal(why({ ...base(), note: "x".repeat(141) }), "The line for players is at most 140 characters.");
  assert.equal(why({ ...base(), par: 20 }), "Par is a whole number from 0 to 19.");
  assert.equal(why({ ...base(), tee: [0.3, 5] }), "The tee is off the grid.");
  const off = base();
  off.pieces[0] = { ...off.pieces[0], geometry: { t: "rail", a: [1.5, 1.3], b: [22.5, 1.5] } };
  assert.equal(why(off), "Piece p1 is off the grid.");
  const unknown = base();
  unknown.pieces[1] = { ...unknown.pieces[1], entry: 3 as unknown as string };
  assert.equal(why(unknown), "Piece p2 has no palette entry.");
  const many = base();
  many.pieces = Array.from({ length: MAX_PIECES + 1 }, (_, i) => ({ ...base().pieces[1], id: `p${i}`, clock: { k: "fixed" } as const }));
  assert.equal(why(many), `A draft holds at most ${MAX_PIECES} pieces.`);
  const twice = base();
  twice.pieces[1] = { ...twice.pieces[1], id: "p1" };
  assert.equal(why(twice), "Two pieces are called p1.");
  const pulse = base();
  pulse.pieces[1] = { ...pulse.pieces[1], clock: { k: "stroke", pulse: 4 } };
  assert.equal(why(pulse), "Piece p2 comes and goes with a pulse the draft does not have.");
  const shape = base();
  shape.pieces[3] = { ...shape.pieces[3], geometry: { t: "spiral" } as unknown as Draft["pieces"][number]["geometry"] };
  assert.equal(why(shape), "Piece p4 has no shape the Builder knows.");
  const nan = base();
  nan.pieces[1] = { ...nan.pieces[1], params: { bounce: "high" as unknown as number } };
  assert.equal(why(nan), "Piece p2 has a setting that is not a number.");
});

void test("a file's draft is rebuilt from its known fields only: nothing else it carries reaches the data", () => {
  const d = base();
  const crafted = { ...d, extra: 1, pieces: d.pieces.map((p, i) => (i === 0 ? { ...p, raw: { wall: { a: [0, 0], b: [9, 9], skin: "gust" } }, sneaky: true } : p)), pulses: d.pulses.map((q) => ({ ...q, walls: [1] })) };
  const r = parseDraft(JSON.stringify(crafted));
  assert.deepEqual(r, d, "raw, and any key a draft does not have, dropped");
  const params = { ...d, pieces: [{ ...d.pieces[1], params: { ...d.pieces[1].params, raw: 1 } }] };
  assert.equal(why(params), "Piece p2 has a setting that is not a number.");
});

void test("a draft's proofs read back whole; one not shaped as the Builder makes them refuses the file", () => {
  const proof = { key: "ab".repeat(32), id: "g1x/mole-run/v1", kind: "wind", period: 5967997, shots: ["0.0000,7.0000"], commits: [[0, 1]] as [number, number][], strokes: 1, maxWork: 11888 };
  const d = { ...base(), proofs: [proof] };
  assert.deepEqual(parseDraft(exportDraft(d)), d);
  for (const bad of [{ ...proof, commits: [[0]] }, { ...proof, shots: [7] }, { ...proof, period: 1.5 }, { ...proof, maxWork: "x" }, "proof"]) {
    assert.equal(why({ ...base(), proofs: [bad] }), "The draft's proofs are not rounds the Builder made.", JSON.stringify(bad));
  }
});

void test("history: 200 steps deep; undo, redo, and a new step drops what was undone", () => {
  const h = history(base());
  for (let i = 0; i < 201; i++) h.push({ ...h.now(), par: (i % 19) + 1 });
  let n = 0;
  while (h.canUndo()) (h.undo(), n++);
  assert.equal(n, 200);
  const d0 = h.now();
  h.push({ ...d0, title: "A" });
  h.push({ ...d0, title: "B" });
  assert.equal(h.undo().title, "A");
  assert.equal(h.redo().title, "B");
  h.undo();
  h.push({ ...d0, title: "C" });
  assert.equal(h.canRedo(), false);
  assert.equal(h.now().title, "C");
});

void test("persistence: saved and loaded as written; a store that throws, or another version's, gives none", () => {
  localStorage.clear();
  saveDrafts([base(), emptyDraft("island")]);
  assert.deepEqual(loadDrafts(), [base(), emptyDraft("island")]);
  localStorage.setItem(DRAFTS_KEY, JSON.stringify({ v: 9, drafts: [base()] }));
  assert.deepEqual(loadDrafts(), []);
  localStorage.setItem(DRAFTS_KEY, JSON.stringify({ v: 1, drafts: [base(), { nope: 1 }] }));
  assert.deepEqual(loadDrafts(), [base()], "a broken draft is left out, the rest kept");
  const get = localStorage.getItem.bind(localStorage);
  localStorage.getItem = () => {
    throw new Error("private window");
  };
  try {
    assert.deepEqual(loadDrafts(), []);
    assert.doesNotThrow(() => saveDrafts([base()]));
  } finally {
    localStorage.getItem = get;
  }
});
