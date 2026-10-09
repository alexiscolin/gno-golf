// The builder's Draft (lib/builder/draft.ts): what the editor works on, read
// back from a file or the browser only once it is whole and on the grid;
// its history; its persistence.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DRAFTS_KEY, MAX_PIECES, dropDraft, emptyDraft, exportDraft, history, keptText, loadDrafts, newKey, onGrid, parseDraft, saveDraft, saveOver, type Draft } from "../lib/builder/draft.ts";
import { LIMITS } from "../lib/builder/gg1.ts";

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

void test("onGrid: multiples of a quarter from the tee, finite", () => {
  assert.ok(onGrid(1.25, 0) && onGrid(0, 0) && onGrid(-3.75, 0));
  assert.ok(!onGrid(0.3, 0) && !onGrid(Number.NaN, 0) && !onGrid(Number.POSITIVE_INFINITY, 0));
  assert.ok(onGrid(13.95, 13.7) && onGrid(13.7 - 0.25 * 3, 13.7) && !onGrid(14, 13.7), "a hole framed by a post's rim: its own quarters");
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
  assert.equal(why({ ...base(), tee: [0.3, 5] }), "The cup is off the grid.", "(the grid is the tee's)");
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

void test("a draft holds as many pieces as the palette lets an author place: one wall, post or zone each, at GG1's limits", () => {
  assert.equal(MAX_PIECES, LIMITS.walls + LIMITS.posts + LIMITS.zones);
});

const drafts = () => loadDrafts().map((k) => k.draft);

void test("persistence: saved and loaded as written, oldest first; a store that throws gives none", () => {
  localStorage.clear();
  saveDraft(newKey(), base());
  saveDraft(newKey(), emptyDraft("island"));
  assert.deepEqual(drafts(), [base(), emptyDraft("island")]);
  const get = localStorage.getItem.bind(localStorage);
  localStorage.getItem = () => {
    throw new Error("private window");
  };
  try {
    assert.deepEqual(loadDrafts(), []);
    assert.doesNotThrow(() => saveDraft(newKey(), base()));
  } finally {
    localStorage.getItem = get;
  }
});

void test("persistence: two tabs on one browser never write over each other's drafts", () => {
  localStorage.clear();
  const [k1, k2] = [newKey(), newKey()];
  saveDraft(k1, base());
  saveDraft(k2, emptyDraft("island"));
  const a = loadDrafts(), b = loadDrafts(); // each tab reads the drafts once, as it opens
  const added = newKey();
  assert.ok(saveDraft(added, { ...emptyDraft("garden"), title: "New in A" }), "tab A starts a hole");
  assert.ok(saveDraft(b[0].key, { ...b[0].draft, title: "Moved in B" }), "tab B, which never saw it, edits another");
  dropDraft(b[1].key);
  assert.deepEqual(drafts().map((d) => d.title), ["Moved in B", "New in A"], "A's new hole kept, B's edit kept, B's delete done");
  assert.ok(saveDraft(a[0].key, { ...a[0].draft, title: "Then in A" }));
  assert.deepEqual(drafts().map((d) => d.title), ["Then in A", "New in A"], "the same draft saved twice: the last save is that draft's, the others untouched");
});

void test("persistence: a draft open in two tabs: a save never writes over the other tab's edit, nor brings back its delete", () => {
  localStorage.clear();
  const k = newKey();
  saveDraft(k, base());
  const a = keptText(k), b = keptText(k); // each tab opens it
  const b1 = saveOver(k, { ...base(), title: "Edited in B" }, b);
  assert.ok(b1 && b1 !== "elsewhere", "B's edit kept");
  assert.equal(saveOver(k, { ...base(), title: "Edited in A" }, a), "elsewhere", "A's next save: the draft changed since A read it");
  assert.equal(drafts()[0].title, "Edited in B", "B's edit stands");
  const b2 = saveOver(k, { ...base(), title: "Again in B" }, b1.kept);
  assert.ok(b2 && b2 !== "elsewhere", "B goes on");
  dropDraft(k); // A deletes it from its list
  assert.equal(saveOver(k, { ...base(), title: "After the delete" }, b2.kept), "elsewhere", "deleted in another tab: not written again");
  assert.deepEqual(drafts(), []);
  const fresh = saveOver(newKey(), base(), null);
  assert.ok(fresh && fresh !== "elsewhere", "a new key: nothing there to write over");
});

void test("persistence: a stored draft this Builder cannot read is left out and left as it is, never erased by a save", () => {
  localStorage.clear();
  const odd = newKey();
  localStorage.setItem(odd, JSON.stringify({ ...base(), pieces: "not a list" }));
  const was = localStorage.getItem(odd);
  saveDraft(newKey(), base());
  assert.deepEqual(drafts(), [base()]);
  saveDraft(loadDrafts()[0].key, emptyDraft("island"));
  assert.equal(localStorage.getItem(odd), was);
});

void test("persistence: an earlier Builder's list moves to a key per draft; one it cannot read is kept as it was", () => {
  localStorage.clear();
  const odd = { ...base(), pieces: "not a list" };
  localStorage.setItem(DRAFTS_KEY, JSON.stringify({ v: 1, drafts: [base(), odd, emptyDraft("island")] }));
  assert.deepEqual(drafts(), [base(), emptyDraft("island")]);
  assert.equal(localStorage.getItem(DRAFTS_KEY), null, "moved, so no save of a list writes over another tab's draft");
  const stored = Array.from({ length: localStorage.length }, (_, i) => localStorage.getItem(localStorage.key(i)!));
  assert.ok(stored.includes(JSON.stringify(odd)), "the unread draft, as it was");
  saveDraft(newKey(), base());
  assert.equal(loadDrafts().length, 3, "moved once, not again");
});

void test("persistence: a corrupt list, or another version's, stays as it is: the next save does not erase it", () => {
  for (const raw of ['{"v":1,"drafts":[{"v":1,"wor', JSON.stringify({ v: 9, drafts: [base()] })]) {
    localStorage.clear();
    localStorage.setItem(DRAFTS_KEY, raw);
    assert.deepEqual(loadDrafts(), []);
    saveDraft(newKey(), emptyDraft("garden"));
    loadDrafts();
    assert.equal(localStorage.getItem(DRAFTS_KEY), raw);
  }
});

void test("persistence: a store that refuses a write (quota) still gives every readable draft, and loses none of them", () => {
  localStorage.clear();
  localStorage.setItem(DRAFTS_KEY, JSON.stringify({ v: 1, drafts: [base(), { ...base(), pieces: "not a list" }, emptyDraft("island")] }));
  const set = localStorage.setItem.bind(localStorage);
  localStorage.setItem = () => {
    throw new Error("QuotaExceededError");
  };
  try {
    assert.deepEqual(drafts(), [base(), emptyDraft("island")], "read from the list, though it could not be moved");
    assert.equal(saveDraft(newKey(), base()), false, "the page then says it keeps nothing");
  } finally {
    localStorage.setItem = set;
  }
  assert.notEqual(localStorage.getItem(DRAFTS_KEY), null, "the list kept until every draft is moved");
  assert.deepEqual(drafts(), [base(), emptyDraft("island")]);
  assert.equal(localStorage.getItem(DRAFTS_KEY), null);
});
