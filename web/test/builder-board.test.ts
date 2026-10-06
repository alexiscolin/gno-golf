// The board's edits (lib/builder/handles.ts, edit.ts, session.ts), pure: a
// handle keeps its piece within its entry's ranges and on the grid, a drag
// of a handle or of the tee or the cup stops where the hole would break (as
// a piece's does), the draft stays framed, a drag is one step of history.
import { test } from "node:test";
import assert from "node:assert/strict";
import { host, lane, rail } from "./builder-fixture.ts";
import { build } from "./scene-harness.ts";
import { clampEnd, clampHandle, copyPiece, dropEnd, dropHandle, dropMove, nextId, placePiece, removePiece, snap, toWorld } from "../lib/builder/edit.ts";
import { handlesOf, setHandle, turnPiece } from "../lib/builder/handles.ts";
import { makeSession } from "../lib/builder/session.ts";
import { K_MAX, pinch, zoomAt } from "../lib/builder/view.ts";
import { loadPalette } from "../lib/builder/palette.ts";
import { validate } from "../lib/builder/pipeline.ts";
import type { Draft, Piece } from "../lib/builder/draft.ts";

const garden = await loadPalette("garden");
const { census } = await import("../lib/builder/drawn.ts");
const ctx = { host, palette: garden, census };
const entry = (id: string) => garden.find((e) => e.id === id)!;
const put = (id: string, e: string, at: [number, number], p: Parameters<typeof placePiece>[3] = {}) => placePiece(entry(e), id, at, p);
const errors = (d: Draft) => validate(d, ctx).issues.filter((i) => i.severity === "error");
void build;

void test("snap: to the step asked, half a unit by default, a quarter at the finest", () => {
  assert.deepEqual(snap([3.3, 7.8]), [3.5, 8]);
  assert.deepEqual(snap([3.3, 7.8], 0.25), [3.25, 7.75]);
  assert.deepEqual(snap([-0.2, 0.26], 0.25), [-0.25, 0.25]);
});

void test("handles: a post's centre and radius, a rail's or a bar's ends, a zone's corners, a tunnel's way out", () => {
  assert.deepEqual(handlesOf(put("p", "*/post/rock", [5, 5])).map((h) => h.key), ["c", "r"]);
  assert.deepEqual(handlesOf(put("b", "*/bar/plank", [5, 5])).map((h) => h.key), ["a", "b"]);
  assert.deepEqual(handlesOf(put("t", "*/tunnel/cave", [5, 5])).map((h) => h.key), ["min", "max", "to"]);
  const poly: Piece = { ...put("z", "*/hazard/water", [5, 5]), geometry: { t: "poly", pts: [[5, 5], [9, 5], [5, 9]] } };
  assert.deepEqual(handlesOf(poly).map((h) => h.key), ["p0", "p1", "p2"]);
});

void test("setHandle: within the entry's range and on the grid", () => {
  const rock = put("p", "*/post/rock", [5, 5]);
  assert.equal((setHandle(rock, "r", [50, 5], entry("*/post/rock")).geometry as { r: number }).r, 4.5, "a radius stops at its entry's most");
  assert.equal((setHandle(rock, "r", [5.1, 5], entry("*/post/rock")).geometry as { r: number }).r, 0.3, "and its least");
  assert.deepEqual((setHandle(rock, "c", [7.3, 2.6], entry("*/post/rock")).geometry as { c: number[] }).c, [7.25, 2.5]);
  const plank = put("b", "*/bar/plank", [5, 5]);
  const long = setHandle(plank, "b", [90, 5], entry("*/bar/plank")).geometry as { a: number[]; b: number[] };
  assert.deepEqual(long.b, [45, 5], "a bar's length stops at 40");
  const diag = setHandle(plank, "b", [60, 60], entry("*/bar/plank")).geometry as { a: number[]; b: number[] };
  const len = Math.hypot(diag.b[0] - 5, diag.b[1] - 5);
  assert.ok(len <= 40 && len > 39.5 && diag.b.every((v) => v * 4 === Math.round(v * 4)), `${len}`);
  const pond = put("w", "*/hazard/water", [5, 5]);
  const g = setHandle(pond, "max", [5.5, 200], entry("*/hazard/water")).geometry as { min: number[]; max: number[] };
  assert.deepEqual([g.max[0] - g.min[0], g.max[1] - g.min[1]], [1.5, 80], "each side within 1.5 to 80");
});

void test("turnPiece: a quarter turn about its middle, on the grid", () => {
  const plank = put("b", "*/bar/plank", [5, 5], { size: 4 });
  assert.deepEqual((turnPiece(plank).geometry), { t: "bar", a: [7, 3], b: [7, 7], thick: 0.5 });
  const rock = put("p", "*/post/rock", [5, 5]);
  assert.deepEqual(turnPiece(rock).geometry, rock.geometry, "a round thing: unchanged");
});

void test("nextId, copyPiece, removePiece: a fresh name; a copy where it may go, framed; a removal (proofs kept: their key says whether they still hold)", () => {
  const d = lane("garden", [put("p1", "*/post/rock", [12, 9])]);
  assert.equal(nextId(d), "p2");
  const c = copyPiece(d, "p1", ctx);
  assert.ok(c, "a copy found a place");
  assert.equal(c.pieces.length, d.pieces.length + 1);
  assert.deepEqual(errors(c), []);
  const proved = { ...d, proofs: [{ key: "k", id: "x", kind: "", period: 1, shots: [], commits: [], strokes: 1, maxWork: 1 }] };
  const r = removePiece(proved, "p1");
  assert.deepEqual([r.pieces.some((p) => p.id === "p1"), r.proofs], [false, proved.proofs]);
  assert.equal(copyPiece(d, "nope", ctx), null);
});

void test("clampHandle: a radius dragged into the rail stops short of it", () => {
  const d = lane("garden", [put("p", "*/post/rock", [12, 5])]);
  const to = clampHandle(d, "p", "r", [12, 0], ctx);
  const r = (to.pieces.find((p) => p.id === "p")!.geometry as { r: number }).r;
  const c = (to.pieces.find((p) => p.id === "p")!.geometry as { c: number[] }).c;
  assert.ok(r > 0.8 && c[1] - r > 1.5, `r ${r}`);
  assert.deepEqual(errors(to), []);
});

void test("clampEnd: the cup dragged onto a post stops clear of it; the tee likewise", () => {
  const d = lane("garden", [put("p", "*/post/rock", [20, 9])]);
  const to = clampEnd(d, "pin", [21.5, 10.5], ctx);
  assert.deepEqual(errors({ ...d, pin: to }), []);
  assert.ok(to[0] > 21.5 + 0.8, `${to.join(", ")}`);
  assert.deepEqual(clampEnd(d, "tee", [6, 6], ctx), [6, 6], "a free place: as dragged");
});

void test("dropMove, dropHandle, dropEnd: a release kept where it holds (census and all), clamped short of where it does not, or refused with why", () => {
  const quick = { host, palette: garden };
  const d = lane("garden", [put("p", "*/post/rock", [12, 5])]);
  const free = dropMove(d, "p", [18, 9], quick, ctx);
  assert.ok(!("why" in free) && errors(free).length === 0);
  const onRail = dropMove(d, "p", [13.5, 1.5], quick, ctx);
  assert.ok(!("why" in onRail), "short of the rail");
  assert.ok((onRail.pieces.find((x) => x.id === "p")!.geometry as { c: number[] }).c[1] > 2);
  const r = dropHandle(d, "p", "r", [13.5, 0], quick, ctx);
  assert.ok(!("why" in r) && errors(r).length === 0);
  const tee = dropEnd(d, "tee", [6, 7], quick, ctx);
  assert.ok(!("why" in tee) && errors(tee).length === 0);
  const cup = dropEnd(d, "pin", [13.5, 6.5], quick, ctx);
  assert.ok(!("why" in cup) && errors(cup).length === 0, "the cup dragged onto the post stops clear of it");
});

void test("toWorld: a draft moved to another world only if it holds there, judged with that world's palette", async () => {
  const d = lane("garden", [put("p", "*/post/rock", [12, 5], { size: 2 })]);
  const town = await loadPalette("town");
  const ok = toWorld(d, "town", town, ctx);
  assert.ok(!("why" in ok) && !("refused" in ok) && ok.world === "town");
  const tight = town.map((e) => (e.id === "*/post/rock" ? { ...e, size: { ...e.size, max: 1 } } : e));
  const no = toWorld(d, "town", tight, ctx);
  assert.ok("why" in no && /radius is 2/.test(no.why), JSON.stringify(no));
});

void test("the board's view: a wheel zooms about the pointer, a pinch about the fingers' midpoint (and pans with it)", () => {
  const v = { x: 10, y: 5, k: 20 }, under = (w: typeof v, p: [number, number]) => [w.x + p[0] / w.k, w.y + p[1] / w.k];
  const z = zoomAt(v, [300, 200], 40);
  assert.deepEqual(under(z, [300, 200]), under(v, [300, 200]), "the point under the pointer stays");
  assert.equal(zoomAt(v, [0, 0], 1000).k, K_MAX);
  const spread = pinch(v, [[100, 100], [300, 100]], [[50, 100], [350, 100]]);
  assert.equal(spread.k, 30, "fingers half as far apart again: half as close again");
  assert.deepEqual(under(spread, [200, 100]), under(v, [200, 100]), "the board under the midpoint stays under it, not the corner");
  const moved = pinch(v, [[100, 100], [300, 100]], [[140, 130], [340, 130]]);
  assert.equal(moved.k, 20);
  assert.deepEqual(under(moved, [240, 130]), under(v, [200, 100]), "both fingers moved: the board follows");
});

void test("a session: an edit beside a drag (the name, the slug) is made on the draft as kept, never on the drag's unchecked preview", () => {
  const d = lane("garden", []), s = makeSession(d);
  const dragged = { ...d, pieces: [...d.pieces, rail("x", [3, 0], [3, 20])] }; // across the tee: a drag cut short by a second finger
  s.preview(dragged);
  s.edit((k) => ({ ...k, title: "Named" }));
  assert.equal(s.kept().title, "Named");
  assert.deepEqual(s.kept().pieces, d.pieces, "the preview dropped, not kept");
  assert.equal(s.now(), s.kept());
});

void test("a session: a drag previews as it goes and is one step of history once let go", () => {
  const d = lane("garden", []), s = makeSession(d);
  const a = { ...d, pieces: [...d.pieces, rail("x", [10, 2], [10, 4])] }, b = { ...a, pieces: [...d.pieces, rail("x", [10, 2], [10, 6])] };
  s.preview(a);
  s.preview(b);
  assert.equal(s.now(), b);
  assert.equal(s.kept(), d, "what is kept: never a drag under way");
  s.commit();
  assert.equal(s.now(), b);
  assert.equal(s.undo(), d, "one undo: back before the drag");
  assert.equal(s.redo(), b);
  s.preview(a);
  s.cancel();
  assert.equal(s.now(), b, "a drag let go off the board: nothing");
  s.set(a);
  assert.equal(s.undo(), b, "a click's edit: one step");
});
