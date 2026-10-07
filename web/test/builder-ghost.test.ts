// The board's ghost (lib/builder/edit.ts ghostAt, the place Board.tsx drops
// the armed entry at): under any pointer, on the grid with every point of it
// (a tunnel's way out too), so every palette entry of every Builder world can
// be dropped onto a starter, refused only for a rule of the hole, never for
// being off the grid.
import { test } from "node:test";
import assert from "node:assert/strict";
import { host } from "./builder-fixture.ts";
import { canPlace, ghostAt, middleOf } from "../lib/builder/edit.ts";
import { loadPalette } from "../lib/builder/palette.ts";
import { plainOf } from "../lib/builder/explain.ts";
import { FIELD } from "../lib/builder/rules.ts";
import { STARTERS } from "../lib/builder/starters.ts";
import type { V } from "../lib/builder/draft.ts";
import "./scene-harness.ts";

const { census } = await import("../lib/builder/drawn.ts");
const OFF_GRID = /off the grid/;

void test("ghostAt: the armed piece centred under the pointer, every point of it on the grid (a tunnel's way out too)", async () => {
  const garden = await loadPalette("garden");
  for (const id of ["*/tunnel/cave", "*/post/rock", "*/rail/", "*/hazard/water"]) {
    const e = garden.find((x) => x.id === id)!, p = ghostAt(e, "g", [10.37, 6.13], 0.5);
    const pts: V[] = [...(p.params.to ? [p.params.to] : [])];
    const g = p.geometry;
    pts.push(...(g.t === "rail" || g.t === "bar" ? [g.a, g.b] : g.t === "post" ? [g.c] : g.t === "poly" ? g.pts : [g.min, g.max]));
    assert.ok(pts.every((v) => v.every((x) => x * 2 === Math.round(x * 2))), `${id}: ${JSON.stringify(pts)}`);
    const m = middleOf(p);
    assert.ok(Math.abs(m[0] - 10.37) <= 0.5 && Math.abs(m[1] - 6.13) <= 0.5, `${id}: centred under the pointer, ${m.join()}`);
  }
});

void test("Every palette entry of every Builder world drops onto a starter through the board's ghost: never refused for the grid", async () => {
  for (const world of Object.keys(FIELD)) {
    const palette = await loadPalette(world), quick = { host, palette }, full = { ...quick, census }, d = STARTERS[world].straight;
    // pointers off the grid along the lane, from near the tee on (a tunnel comes out 8 further)
    const along: V[] = [];
    for (const f of [0.2, 0.35, 0.5, 0.65, 0.8]) for (const side of [0, -2.6, 2.6]) {
      along.push([d.tee[0] + (d.pin[0] - d.tee[0]) * f + 0.13, d.tee[1] + (d.pin[1] - d.tee[1]) * f + side + 0.37]);
    }
    const stuck: string[] = [];
    for (const e of palette) {
      let placed = false, why = "";
      for (const at of along) {
        // (as the board: the ghost's checks without the census as it moves, the drop's with it)
        const p = ghostAt(e, "g1", at, 0.5), q = canPlace(d, p, quick), is = q.length ? q : canPlace(d, p, full);
        for (const i of is) assert.doesNotMatch(plainOf(i), OFF_GRID, `${world} ${e.id} at ${at.join()}: ${plainOf(i)}`);
        if (!is.length) { placed = true; break; }
        why ||= plainOf(is[0]);
      }
      if (!placed) stuck.push(`${e.id}: ${why}`);
    }
    // what may still be refused everywhere is refused by a rule of the hole, said (none in a straight starter)
    assert.deepEqual(stuck, [], `${world}: entries placed nowhere on the straight starter`);
  }
});
