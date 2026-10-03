import { test } from "node:test";
import assert from "node:assert/strict";
import { holePicks, coursePicks, tagWord, today, saveLine, draw } from "../lib/featured.ts";
import type { SkyKind } from "../lib/card.ts";

// a board's rows in order, their places from 1
const board = (...rs: [string, number][]) => rs.map(([player, strokes], i) => ({ player, strokes, at: i + 1 }));
const info = (o: Record<string, [number, SkyKind?]>) => new Map(Object.entries(o).map(([p, [height, sky]]) => [p, { height, sky }]));

test("today: one number a day", () => {
  assert.equal(today(Date.parse("2026-10-02T00:00:01Z")), today(Date.parse("2026-10-02T23:59:59Z")));
  assert.equal(today(Date.parse("2026-10-03T00:00:00Z")), today(Date.parse("2026-10-02T00:00:00Z")) + 1);
});

test("holePicks: within reach, a hole in one, the best in a hard sky, the latest; one card a player, never you", () => {
  const rows = board(["t1", 1], ["t2", 1], ["t3", 2], ["ace", 1], ["storm", 2], ["b", 3], ["me", 4], ["c", 5]);
  const p = holePicks(rows, info({ storm: [10, "storm"], c: [99], b: [20, "fog"] }), "me", 4, 1, 4);
  assert.deepEqual(p.map((x) => [x.tag, x.row.player]), [["reach", "b"], ["ace", "ace"], ["sky", "storm"], ["fresh", "c"]], "one stroke under yours: 3");
  assert.equal(p[2].sky, "storm");
  assert.ok(!p.some((x) => x.row.player === "me"));
});

test("holePicks: the first three places never get a card of their own", () => {
  const rows = board(["t1", 1], ["t2", 2], ["t3", 2], ["d", 3]);
  const p = holePicks(rows, info({ t1: [99, "storm"] }), null, null, 1, 3);
  assert.ok(!p.some((x) => ["t1", "t2", "t3"].includes(x.row.player)), JSON.stringify(p));
  // the best in a sky being one of them: no card for that sky (another would claim a title not theirs)
  assert.ok(!holePicks(board(["t1", 1], ["t2", 2], ["t3", 2], ["d", 3], ["e", 3]), info({ t1: [1, "storm"], d: [2, "storm"] }), null, null, 1, 5).some((x) => x.tag === "sky"));
  // but the step above yours, wherever it is
  assert.deepEqual(holePicks(rows, new Map(), "me", 2, 1, 1).map((x) => [x.tag, x.row.player]), [["reach", "t1"]]);
});

test("holePicks: no best of yours yet: a first target in the board's middle; fog is no hard sky", () => {
  const rows = board(["a", 1], ["b", 2], ["c", 3], ["d", 4], ["e", 5], ["f", 6], ["g", 7]);
  const p = holePicks(rows, info({ e: [5, "fog"] }), null, null, 1);
  assert.deepEqual([p[0].tag, p[0].row.player], ["start", "d"]);
  assert.ok(!p.some((x) => x.tag === "sky"));
  assert.ok(!holePicks(rows, new Map(), "me", 9, 1).some((x) => x.tag === "start"), "a best of yours: no first target");
  assert.deepEqual(holePicks([], new Map(), "me", 3, 1), []);
});

test("holePicks: the same all day, drawn again the next", () => {
  const rows = board(...Array.from({ length: 40 }, (_, i): [string, number] => [`p${i}`, 3]));
  const pick = (d: number) => holePicks(rows, new Map(), "me", 2, d).map((x) => x.row.player).join();
  assert.equal(pick(5), pick(5));
  assert.ok([6, 7, 8, 9].some((d) => pick(d) !== pick(5)), "another day, another draw");
});

test("coursePicks: the place above yours (within reach on as many holes, else next up), rising, the sharpest", () => {
  const r = (player: string, at: number, holes: number, vs: number) => ({ player, at, holes, strokes: holes * 3 + vs, par: holes * 3 });
  const rows = [r("t1", 1, 90, 20), r("t2", 2, 85, 10), r("t3", 3, 80, 9), r("rise", 4, 5, -2), r("sharp", 5, 40, -30), r("above", 6, 30, 5), r("me", 7, 30, 6)];
  const p = coursePicks(rows, 90, "me", rows[6], rows[5], 1);
  assert.deepEqual(p.map((x) => [x.tag, x.row.player]), [["reach", "above"], ["rising", "rise"], ["sharp", "sharp"]]);
  assert.equal(coursePicks(rows, 90, "me", { holes: 29 }, rows[5], 1)[0].tag, "next", "more holes above: the next one up");
  assert.ok(!coursePicks(rows, 90, null, null, null, 1).some((x) => ["reach", "next"].includes(x.tag)));
  assert.ok(!coursePicks(rows, 90, null, null, null, 1, 4).some((x) => ["t1", "t2", "t3"].includes(x.row.player)), "the podium: no card");
  // today's pick fills the cards the other tags leave
  const few = [r("t1", 1, 90, 0), r("t2", 2, 90, 0), r("t3", 3, 90, 0), r("a", 4, 50, 9), r("b", 5, 50, 9)];
  assert.deepEqual(coursePicks(few, 90, null, null, null, 1).map((x) => x.tag), ["day", "more"], "said apart: two of the same tag tell nothing");
});

test("tagWord: every tag in words, a dozen letters at most", () => {
  assert.equal(tagWord({ tag: "sky", sky: "storm" }), "Storm master");
  for (const tag of ["reach", "next", "start", "ace", "fresh", "rising", "sharp", "day", "more"] as const) assert.ok(tagWord({ tag }).length > 2 && tagWord({ tag }).length <= 12, tag);
  for (const sky of ["storm", "snow", "rain", "wind"] as const) assert.ok(tagWord({ tag: "sky", sky }).length <= 12);
});

test("saveLine: the players passed first, then the best in its weather, a new best, else a first record; the place after", () => {
  assert.equal(saveLine({ pass: ["nym-kim"], best: true, sky: "storm" }, 4), "Pass nym-kim · #4");
  assert.equal(saveLine({ pass: ["nym-kim", "nym-tom", "nym-ana"], best: true, sky: "" }, 2), "Pass nym-kim +2 · #2");
  assert.equal(saveLine({ pass: [], best: true, sky: "storm" }, 3), "Storm master here · #3");
  assert.equal(saveLine({ pass: [], best: true, sky: "" }, 7), "Your new best · #7");
  assert.equal(saveLine({ pass: [], best: false, sky: "" }, 12), "Your first record · #12");
});

test("draw: the numbers the gnoweb hub's draw gives too (featured.gno, hub_test.gno)", () => {
  const a = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5", b = "g1" + "q".repeat(38);
  assert.deepEqual([draw(a, 20363), draw(b, 20363), draw(a, 1)], [1277278921, 4003602704, 3880469319]);
});
