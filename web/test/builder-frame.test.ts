// F (the hole framed, lib/builder/view.ts frameView): as it always was on a
// window of 1440 by 900 and smaller; on a bigger one, the room past that
// shows the world round the lane (at most ROOM units a side), the lane never
// drawn smaller than a 1440 by 900 window draws it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { boxIn, FLAT, FRAME_REF, frameView, islandIn } from "../lib/builder/view.ts";

type P = readonly [number, number];
// the dogleg starter's extent (its tee, cup and pieces, 3 round: Board.tsx extent), and a long straight one
const HOLES: [P, P][] = [[[-1.5, -1.5], [27.5, 25.5]], [[-1.5, 3], [45, 15]]];
// the board each window gives (clientWidth by clientHeight, measured: 1280 and 1440 wide, 1920 and 2560)
const BOARDS = { w1280: { w: 678, h: 614 }, w1440: FRAME_REF, w1920: { w: 1262, h: 894 }, w2560: { w: 1902, h: 1254 } };
/** What F gave before: the extent fitted, the dock's 56 off the height. */
const before = ([lo, hi]: [P, P], s: { w: number; h: number }) => Math.max(3, Math.min(90, Math.min(s.w / (hi[0] - lo[0]), (s.h - 56) / (hi[1] - lo[1]))));

void test("frameView: on a 1440 by 900 window and smaller, the hole framed exactly as before", () => {
  for (const ext of HOLES)
    for (const s of [BOARDS.w1280, BOARDS.w1440]) {
      const v = frameView(ext[0], ext[1], s);
      assert.equal(v.k, before(ext, s));
      assert.ok(Math.abs(v.x + s.w / 2 / v.k - (ext[0][0] + ext[1][0]) / 2) < 1e-9, "centred as before");
    }
});

void test("frameView: on a bigger window, the lane no smaller than on a 1440 by 900 one, and the world shown round it", () => {
  for (const ext of HOLES)
    for (const s of [BOARDS.w1920, BOARDS.w2560]) {
      const v = frameView(ext[0], ext[1], s), ref = before(ext, FRAME_REF);
      assert.ok(v.k >= ref - 1e-9, `${s.w}x${s.h}: ${v.k} px a unit, under the 1440's ${ref}`);
      // the room past the extent on the side that limits it (board units), at least 2
      const room = Math.min((s.w / v.k - (ext[1][0] - ext[0][0])) / 2, ((s.h - 56) / v.k - (ext[1][1] - ext[0][1])) / 2);
      assert.ok(room >= 2, `${s.w}x${s.h}: ${room.toFixed(2)} units of the world round the hole`);
      assert.ok(v.k <= before(ext, s) + 1e-9, "never closer than the hole filling the board");
    }
});

// F on the 3D board's island (islandIn: ISLAND round the board, lib/scene/camera.ts islandBox): the sight inside it
// where it fits, the island in its middle where the sight is the larger, the hole always in sight, each quarter turn.
void test("frameView: the board kept on the island to its foot, never bare ground past one edge with the scenery cut at the other", () => {
  const AROUND = { x: 7, front: 4, back: 10 }, board = { w: 26, h: 44 }; // a tall hole: the owner's
  const ext: [P, P] = [[0, 0], [26, 44]];
  for (const s of [BOARDS.w1440, BOARDS.w1920, BOARDS.w2560])
    for (const turns of [0, 1, 2, 3]) {
      const look = { ...FLAT, turns }, [lo, hi] = boxIn([ext[0], ext[1], [0, 44], [26, 0]], look), isl = islandIn(board, look, AROUND);
      const v = frameView(lo, hi, s, isl), plain = frameView(lo, hi, s);
      assert.equal(v.k, plain.k, "the same scale as without the island");
      // the sight: above the dock (the hole in it); the board: to its foot (the island round it)
      const sight = [[v.x, v.y], [v.x + s.w / v.k, v.y + (s.h - 56) / v.k]], all = [[v.x, v.y], [v.x + s.w / v.k, v.y + s.h / v.k]];
      for (const i of [0, 1]) {
        assert.ok(sight[0][i] <= lo[i] + 1e-9 && sight[1][i] >= hi[i] - 1e-9, `${s.w} turn ${turns}: the hole in sight`);
        const span = all[1][i] - all[0][i], room = isl[1][i] - isl[0][i];
        if (span <= room) assert.ok(all[0][i] >= isl[0][i] - 1e-9 && all[1][i] <= isl[1][i] + 1e-9, `${s.w} turn ${turns} axis ${i}: inside the island`);
        else assert.ok(Math.abs(all[0][i] + all[1][i] - isl[0][i] - isl[1][i]) < 1e-9, `${s.w} turn ${turns} axis ${i}: the island in the middle`);
      }
    }
});
