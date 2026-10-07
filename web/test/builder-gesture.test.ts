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
import { makeGesture, type Target } from "../lib/builder/gesture.ts";
import { makeSession } from "../lib/builder/session.ts";
import { frame } from "../lib/builder/gg1.ts";
import { loadPalette, type PaletteEntry } from "../lib/builder/palette.ts";
import { canonicalHex, proofKey } from "../lib/builder/proof.ts";
import { FLAT, TILT, toBoard, toPlane, toScreen, fromPlane, matrixOf, relook, type Look, type View } from "../lib/builder/view.ts";
import { FIELD } from "../lib/builder/rules.ts";
import type { Draft, V } from "../lib/builder/draft.ts";

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

/** One pointer's moves on a board looked at through look: board points shown at whole pixels (where a pointer can be), read back through the lens. */
async function play(world: string, look: Look) {
  const palette = await loadPalette(world), o = { host, palette }, full = { ...o, census };
  const ed = editor({ ...lane(world, [], 40, 24), slug: "lens" }), v: View = { x: -2, y: -3, k: 24 };
  const at = (p: V): V => { const px = toScreen(v, look, p); return toBoard(v, look, [Math.round(px[0]), Math.round(px[1])]); };
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

void test("the same pointer edits on a board flat, turned and tilted: the same drafts, byte for byte, in every Builder world", async () => {
  for (const world of Object.keys(FIELD)) {
    const flat = await play(world, FLAT);
    assert.equal(new Set(flat).size > 5, true, `${world}: the edits change the hole`);
    for (const look of LOOKS.slice(1)) assert.deepEqual(await play(world, look), flat, `${world}: turned ${look.turns}, tilted ${look.tilt.toFixed(2)}`);
  }
});
