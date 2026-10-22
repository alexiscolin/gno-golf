// The board's pointer edits (lib/builder/gesture.ts) through its lens
// (lib/builder/view.ts): the same edits, made with the pointer on a board
// looked at flat, turned or tilted, make the very same drafts, byte for byte
// (their canonical bytes and proof keys), in every Builder world: a piece
// placed from the palette, dragged, sized and turned by a handle, a tunnel's
// way out moved, the tee moved, a piece dropped on the bin, undone and redone.
import { test } from "node:test";
import assert from "node:assert/strict";
import { host, lane } from "./builder-fixture.ts";
import "./scene-harness.ts";
import { alongAxis, makeGesture, type Target } from "../lib/builder/gesture.ts";
import { makeSession } from "../lib/builder/session.ts";
import { frame } from "../lib/builder/gg1.ts";
import { loadPalette, type PaletteEntry } from "../lib/builder/palette.ts";
import { canonicalHex, proofKey } from "../lib/builder/proof.ts";
import { FLAT, TILT, toBoard, toPlane, toScreen, fromPlane, matrixOf, relook, type Look, type View } from "../lib/builder/view.ts";
import { FIELD } from "../lib/builder/rules.ts";
import { parseDraft, type Draft, type V } from "../lib/builder/draft.ts";
import { placePiece } from "../lib/builder/edit.ts";
import { QUARTER } from "../lib/builder/handles.ts";
import { validate } from "../lib/builder/pipeline.ts";

const { census } = await import("../lib/builder/drawn.ts");
const LOOKS: Look[] = [FLAT, { turns: 1, tilt: 0 }, { turns: 2, tilt: TILT }, { turns: 3, tilt: TILT }];
const near = (a: readonly number[], b: readonly number[], eps = 1e-9) => Math.abs(a[0] - b[0]) < eps && Math.abs(a[1] - b[1]) < eps;

void test("the lens: a board point to the board's pixels and back, through any look; its matrix the same map; a new look keeps the middle", () => {
  const v: View = { x: -3, y: 2, k: 17 };
  for (const look of LOOKS) {
    for (const p of [[0, 0], [12.5, 3.25], [-4, 9]] as V[]) {
      assert.ok(near(fromPlane(toPlane(p, look), look), p), `${look.turns} ${p.join()}`);
      const s = toScreen(v, look, p), m = matrixOf(v, look);
      assert.ok(near(toBoard(v, look, s), p, 1e-9));
      assert.ok(near([m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]], s, 1e-9), "the overlay's matrix");
    }
  }
  const size = { w: 800, h: 500 }, mid = toBoard(v, FLAT, [400, 250]), turned = relook(v, FLAT, LOOKS[3], size);
  assert.ok(near(toBoard(turned, LOOKS[3], [400, 250]), mid, 1e-9), "the board's middle stays in the middle");
  assert.ok(near(toScreen(v, { turns: 1, tilt: 0 }, [1, 0]), [v.x * -v.k, (1 - v.y) * v.k]), "a quarter turn: east goes down the screen (clockwise)");
});

/** The editor as far as the board's edits go: its session, and the board's callbacks on it. */
function editor(first: Draft) {
  const s = makeSession(first);
  let selected: string | null = null, armed: PaletteEntry | null = null;
  const g = makeGesture({
    onPreview: (d) => s.preview(d), onCommit: () => s.commit(), onCancel: () => s.cancel(), onSet: (d) => s.set(frame(d)),
    onSelect: (id) => (selected = id), onDisarm: () => (armed = null), onBin: (id) => s.set(frame({ ...s.now(), pieces: s.now().pieces.filter((p) => p.id !== id) })),
  });
  return { s, g, sel: () => selected, arm: (e: PaletteEntry | null) => (armed = e), armed: () => armed };
}

const THREE = await import("three");
const { orthoFor } = await import("../lib/builder/camera3d.ts");
/** Where a point of the scene shows on the board (its pixels), through cam. */
function shownAt(cam: InstanceType<typeof THREE.Camera>, p: InstanceType<typeof THREE.Vector3>, size: { w: number; h: number }): [number, number] {
  const q = p.clone().project(cam);
  return [((q.x + 1) / 2) * size.w, ((1 - q.y) / 2) * size.h];
}
const SIZE = { w: 1000, h: 640 };

/**
 * One pointer's moves on a board looked at through look: each board point
 * where it shows at a whole pixel (where a pointer can be), read back as the
 * board reads the pointer (the lens). On the 3D board (three), where the
 * scene's camera shows it, and the ground under that pixel by a ray too.
 */
async function play(world: string, look: Look, three = false) {
  const palette = await loadPalette(world), o = { host, palette }, full = { ...o, census };
  const ed = editor({ ...lane(world, [], 40, 24), slug: "lens" }), v: View = { x: -2, y: -3, k: 24 };
  const cam = orthoFor(new THREE.OrthographicCamera(), v, look, SIZE), ray = new THREE.Raycaster(), ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const at = (p: V): V => {
    const px = three ? shownAt(cam, new THREE.Vector3(p[0], 0, p[1]), SIZE) : toScreen(v, look, p), q: V = [Math.round(px[0]), Math.round(px[1])], b = toBoard(v, look, q);
    if (three) {
      ray.setFromCamera(new THREE.Vector2((q[0] / SIZE.w) * 2 - 1, 1 - (q[1] / SIZE.h) * 2), cam);
      const hit = ray.ray.intersectPlane(ground, new THREE.Vector3())!;
      assert.ok(near([hit.x, hit.z], b, 1e-6), "the pointer's ray meets the ground where the lens says");
    }
    return b;
  };
  const env = () => ({ draft: ed.s.now(), quick: o, full, armed: ed.armed(), selected: ed.sel(), step: 0.5 });
  const drag = (target: Target, from: V, to: V, bin = false) => {
    ed.g.down(env(), at(from), target);
    for (let k = 1; k <= 4; k++) ed.g.move(env(), at([from[0] + ((to[0] - from[0]) * k) / 4, from[1] + ((to[1] - from[1]) * k) / 4]));
    return ed.g.up(env(), at(to), { bin });
  };
  const place = (e: PaletteEntry, p: V) => (ed.arm(e), ed.g.down(env(), at(p), null), ed.g.move(env(), at(p)), ed.g.up(env(), at(p)));
  const of = (kind: string) => palette.find((e) => e.kind === kind && e.world === world) ?? palette.find((e) => e.kind === kind && e.skin)!;
  const keys: string[] = [];
  const kept = async () => keys.push(`${canonicalHex(ed.s.kept(), host)} ${await proofKey(ed.s.kept(), host)}`);
  place(of("post"), [10.1, 8.1]); await kept();
  const post = ed.sel()!;
  drag({ t: "piece", id: post }, [10.1, 8.1], [14.1, 6.1]); await kept();
  drag({ t: "handle", key: "r" }, [14.1 + 0.8, 6.1], [14.1 + 1.6, 6.1]); await kept();
  place(of("bar"), [24.1, 14.1]); await kept();
  drag({ t: "handle", key: "b" }, [26.1, 14.1], [26.1, 18.1]); await kept(); // (turned by its end)
  place(of("tunnel"), [8.1, 16.1]); await kept();
  const tunnel = ed.s.kept().pieces.find((p) => p.id === ed.sel())!;
  drag({ t: "handle", key: "to" }, tunnel.params.to!, [30.1, 4.1]); await kept();
  drag({ t: "end", which: "tee" }, ed.s.kept().tee, [ed.s.kept().tee[0] + 1.1, ed.s.kept().tee[1] + 0.1]); await kept();
  drag({ t: "piece", id: post }, [14.1, 6.1], [15.1, 6.1], true); await kept(); // (on the bin)
  ed.s.undo(); await kept();
  ed.s.redo(); await kept();
  return keys;
}

void test("the same pointer edits on the 2D board and on the 3D one, flat, turned and tilted: the same drafts, byte for byte, in every Builder world", async () => {
  for (const world of Object.keys(FIELD)) {
    const flat = await play(world, FLAT);
    assert.equal(new Set(flat).size > 5, true, `${world}: the edits change the hole`);
    for (const look of LOOKS) assert.deepEqual(await play(world, look, true), flat, `${world}, in 3D: turned ${look.turns}, tilted ${look.tilt.toFixed(2)}`);
  }
});

void test("a post whose rim sets the frame (the hole shifted off the board's quarters): the grid the hole's own, the tee's, for every edit", async () => {
  const palette = await loadPalette("island"), o = { host, palette }, full = { ...o, census }, entry = (id: string) => palette.find((e) => e.id === id)!;
  const castle = placePiece(entry("*/post/sandcastle"), "s", [15, 0]); // (the island's sandcastle, r 2.2, may sit on a rail: the hole's low edge its rim)
  const ed = editor({ ...lane("island", [castle]), slug: "rim" }), env = () => ({ draft: ed.s.now(), quick: o, full, armed: ed.armed(), selected: ed.sel(), step: 0.5 });
  assert.notEqual(ed.s.now().tee[1] % QUARTER, 0, "framed by the rim: the tee off the board's quarters");
  const drag = (target: Target, from: V, to: V) => (ed.g.down(env(), from, target), ed.g.move(env(), to), ed.g.up(env(), to));
  ed.arm(entry("*/post/rock"));
  ed.g.down(env(), [15, 10.1], null);
  assert.equal(ed.g.move(env(), [15, 10.1])?.ghost?.why, "", "the ghost green where the hole holds");
  const placed = ed.g.up(env(), [15, 10.1]), id = ed.sel()!;
  assert.deepEqual(placed, { placed: id });
  const rock = () => ed.s.kept().pieces.find((p) => p.id === id)!.geometry as { c: V; r: number };
  assert.deepEqual(drag({ t: "handle", key: "c" }, rock().c, [rock().c[0] + 2.1, rock().c[1] + 1.1]), {}, "its centre dragged by its handle");
  ed.arm(entry("*/rail/"));
  ed.g.down(env(), [22, 6], null), ed.g.up(env(), [22, 6]);
  const rail = () => ed.s.kept().pieces.find((p) => p.id === ed.sel())!.geometry as { a: V; b: V };
  const b = rail().b;
  assert.deepEqual(drag({ t: "handle", key: "b" }, b, [b[0] + 1.1, b[1] + 2.1]), {}, "a rail's end dragged");
  assert.notDeepEqual(rail().b, b);
  const tee = ed.s.kept().tee;
  assert.deepEqual(drag({ t: "end", which: "tee" }, tee, [tee[0] + 1.1, tee[1] + 0.6]), {}, "the tee moved");
  assert.notDeepEqual(ed.s.kept().tee, tee);
  assert.deepEqual(validate(ed.s.kept(), full).issues.filter((i) => i.severity === "error"), []);
  assert.equal(typeof parseDraft(JSON.stringify(ed.s.kept())), "object", "and the draft opens again as kept");
});

void test("the 3D board's camera shows the ground where the lens puts it: the overlay on its pieces, the pointer on the ground it is over", () => {
  const size = { w: 900, h: 560 }, v: View = { x: -1.5, y: 4, k: 21 }, cam = new THREE.OrthographicCamera();
  for (const look of LOOKS) {
    orthoFor(cam, v, look, size);
    for (const p of [[0, 0], [20.25, 7.5], [33, 21.75]] as V[]) {
      const s = shownAt(cam, new THREE.Vector3(p[0], 0, p[1]), size);
      assert.ok(near(s, toScreen(v, look, p), 1e-6), `${look.turns}/${look.tilt.toFixed(2)} ${p.join()}: ${s.join()} for ${toScreen(v, look, p).join()}`);
    }
  }
});

void test("alongAxis: a stroke in straight legs, its wobble left out; it turns once taken two cells across; held until it has gone a cell", () => {
  const g: { from: [number, number]; axis: 0 | 1 | null } = { from: [10, 10], axis: null };
  assert.deepEqual(alongAxis(g, [10.4, 10.3]), [10, 10], "under a cell: where it began");
  assert.deepEqual(alongAxis(g, [14, 11.2]), [14, 10], "along x, its wobble across left out");
  assert.equal(g.axis, 0);
  assert.deepEqual(alongAxis(g, [16, 13]), [16, 13], "three across: turned at x 16, now along y");
  assert.deepEqual([g.from, g.axis], [[16, 10], 1], "the new leg from the corner");
  assert.deepEqual(alongAxis(g, [17.5, 18]), [16, 18], "down the new leg, straight");
});

void test("a piece pressed and let go where it was (a click that selects it), or dragged back to its place: nothing to undo", async () => {
  const palette = await loadPalette("garden"), o = { host, palette }, full = { ...o, census };
  const rock = placePiece(palette.find((e) => e.id === "*/post/rock")!, "r", [15, 10]);
  const ed = editor({ ...lane("garden", [rock]), slug: "click" }), env = () => ({ draft: ed.s.now(), quick: o, full, armed: ed.armed(), selected: ed.sel(), step: 0.5 });
  const at = (ed.s.now().pieces.find((p) => p.id === "r")!.geometry as { c: V }).c;
  assert.equal(ed.s.canUndo(), false);
  ed.g.down(env(), at, { t: "piece", id: "r" }), ed.g.up(env(), at);
  assert.equal(ed.s.canUndo(), false, "a click");
  ed.g.down(env(), at, { t: "piece", id: "r" }), ed.g.move(env(), [at[0] + 2, at[1]]), ed.g.up(env(), at);
  assert.equal(ed.s.canUndo(), false, "dragged away and back");
  ed.g.down(env(), at, { t: "piece", id: "r" }), ed.g.move(env(), [at[0] + 2, at[1]]), ed.g.up(env(), [at[0] + 2, at[1]]);
  assert.equal(ed.s.canUndo(), true, "moved: undone in one step");
});
