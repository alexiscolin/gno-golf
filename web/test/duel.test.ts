// Ghost duels (ADR-004): the best raced, the ghost's pace, and the result in words.
import { test } from "node:test";
import assert from "node:assert/strict";
import { raceLeft, duelResult, duelShare, skyWord, ghostSpeed, pickGhost, shotsOf, levelFrom, levelPick, pickOne, bestOf, showcases, inTurn, mapView, mapFit, mapZone, vsBest, pathD, railRuns, type Duel } from "../lib/duel.ts";
import type { Ghost } from "../lib/types.ts";

const ghost = (strokes: number, mode: Ghost["mode"] = "assisted"): Ghost => ({ version: 1, hole: "garden/1/v1", mode, player: "g1x", strokes, period: 7, shots: "0.0000,1.0000,0;12.5000,6.2000,3" });
const duel = (strokes: number, self = false): Duel => ({ ghost: ghost(strokes), name: "ace", self });

test("pickGhost races the rival's best in the player's mode, else their other one", () => {
  const a = ghost(3), p = ghost(2, "pro");
  assert.equal(pickGhost("assisted", { assisted: a, pro: p }), a);
  assert.equal(pickGhost("pro", { assisted: a, pro: p }), p);
  assert.equal(pickGhost("pro", { assisted: a, pro: null }), a);
  assert.equal(pickGhost("assisted", { assisted: null, pro: null }), null);
});

test("shotsOf splits a ghost's round into its strokes", () => {
  assert.deepEqual(shotsOf(ghost(2)), ["0.0000,1.0000,0", "12.5000,6.2000,3"]);
});

test("a ghost's stroke plays twice as fast, and never longer than 2 s", () => {
  assert.equal(ghostSpeed(1000), 1.25);
  assert.equal(ghostSpeed(3000), 1.25);
  assert.equal(ghostSpeed(9000), 3);
});

test("the result reads a win, a loss by one in words, a tie, an ace matched", () => {
  assert.deepEqual(duelResult(2, duel(3), "Birdie"), { result: "win", title: "You win!", line: "You beat ace by one · 2 to their 3 · Birdie" });
  assert.deepEqual(duelResult(4, duel(3), "Bogey"), { result: "loss", title: "You lose", line: "ace wins by one · 4 to their 3 · Bogey" });
  assert.equal(duelResult(5, duel(3), "Bogey").line, "ace wins by 2 · 5 to their 3 · Bogey");
  assert.deepEqual(duelResult(3, duel(3), "Par"), { result: "tie", title: "Tie!", line: "Tied with ace · 3 strokes each · Par" });
  assert.deepEqual(duelResult(1, duel(1), "Ace"), { result: "tie", title: "Ace for ace!", line: "Tied with ace · 1 stroke each · Ace" });
});

test("racing your own best reads as such", () => {
  assert.equal(duelResult(2, duel(3, true), "Birdie").title, "New best!");
  assert.equal(duelResult(4, duel(3, true), "Bogey").title, "Your best stands");
  assert.equal(duelResult(3, duel(3, true), "Par").title, "Tied your best");
});

test("the share text dares back once saved, and passes the rival's dare on before", () => {
  assert.match(duelShare("win", duel(3), "The Mill", 2, true), /^⚔ Beat ace on The Mill, 2 to 3\. My ghost is waiting\. Free to play/);
  assert.match(duelShare("loss", duel(3), "The Mill", 4, true), /beat me by one on The Mill/);
  assert.match(duelShare("tie", duel(3), "The Mill", 3, true), /both holed The Mill in 3\. Settle it\./);
  assert.match(duelShare("loss", duel(3), "The Mill", 4, false), /^⚔ ace beat me on The Mill, 3 to my 4\. Can you beat 3\? Free to play, no wallet needed\./);
  assert.match(duelShare("tie", duel(3), "The Mill", 3, false), /^⚔ Tied ace on The Mill at 3\. Can you beat it\?/);
});

test("racing your own best says so in the line and the share", () => {
  assert.equal(duelResult(2, duel(3, true), "Birdie").line, "Better by one · 2 to your 3 · Birdie");
  assert.equal(duelResult(5, duel(4, true), "Double bogey").line, "Short by one · 5 to your 4 · Double bogey");
  assert.equal(duelResult(1, duel(1, true), "Ace").title, "You matched your ace!");
  assert.match(duelShare("win", duel(3, true), "The Mill", 2, true), /^⚔ The Mill in 2, raced against my own ghost\./);
  assert.match(duelShare("win", duel(3, true), "The Mill", 2, false), /^⚔ Can you beat my 3 on The Mill\?/);
});

test("a mixed race is said in the share text", () => {
  assert.match(duelShare("win", duel(3), "The Mill", 2, true, true), /\(mixed aim, not a record\) #gnoland/);
  assert.doesNotMatch(duelShare("win", duel(3), "The Mill", 2, true), /mixed/);
});

test("a weather is said in words, and nothing a node could slip in", () => {
  assert.equal(skyWord("storm"), "a storm");
  assert.equal(skyWord(""), "clear skies");
  assert.equal(skyWord("constructor"), "clear skies");
});

test("a win that can't be saved still says it was won, with the rival's link", () => {
  assert.match(duelShare("win", duel(3), "The Mill", 2, false), /^⚔ Beat ace's 3 with 2 on The Mill\. Can you\?/);
  assert.match(duelShare("loss", duel(3, true), "The Mill", 4, false), /^⚔ Can you beat my 3 on The Mill\?/, "my own ghost, not saved: the plain dare");
});

const row = (...ps: string[]) => ps.map((player) => ({ player }));

test("a rival at your level is read from a page around your place, or the board's middle", () => {
  assert.equal(levelFrom(7, 40), 4); // places 5..9
  assert.equal(levelFrom(1, 40), 0);
  assert.equal(levelFrom(0, 40), 18); // around the 20th
  assert.equal(levelFrom(0, 3), 0);
});

test("your level: the one just above you, else below; never you nor a pick already made", () => {
  assert.equal(levelPick(row("a", "b", "me", "d"), "me")?.player, "b");
  assert.equal(levelPick(row("me", "b", "c"), "me")?.player, "b"); // the first: the one below
  assert.equal(levelPick(row("champ", "me", "c"), "me", ["champ"])?.player, "c");
  assert.equal(levelPick(row("a", "b", "c", "d", "e"), null)?.player, "c"); // no place: the middle
  assert.equal(levelPick(row("a", "b", "c"), "zz", ["b"])?.player, "a");
  assert.equal(levelPick(row("me"), "me"), null);
});

test("a surprise: one at random, you and the picks left out, each player once", () => {
  assert.equal(pickOne(row("a", "b", "c", "b"), ["a"], 0)?.player, "b");
  assert.equal(pickOne(row("a", "b", "c", "b"), ["a"], 0.99)?.player, "c");
  assert.equal(pickOne(row("me"), ["me", null], 0.5), null);
});

test("the hole shown off: an ace first, else the best against par, in the aim mode's best else the other", () => {
  const holes = [{ id: "h1", par: 3 }, { id: "h2", par: 4 }, { id: "h3", par: 2 }];
  const b = (e: [string, number, number][]) => new Map(e.map(([id, pro, assisted]) => [id, { pro, assisted }]));
  assert.deepEqual(showcases(b([["h1", 0, 2], ["h2", 0, 3]]), holes, "pro")[0], { id: "h1", mode: "assisted", strokes: 2, par: 3 }); // two birdies: the first
  assert.deepEqual(showcases(b([["h2", 2, 0], ["h3", 0, 1]]), holes, "pro").map((t) => t.id), ["h3", "h2"]); // the ace, then the eagle
  assert.deepEqual(showcases(b([["h1", 4, 2]]), holes, "pro"), [{ id: "h1", mode: "pro", strokes: 4, par: 3 }]); // the aim mode's, worse as it is
  assert.deepEqual(showcases(b([]), holes, "pro"), []);
  assert.deepEqual(showcases(b([["gone", 1, 1]]), holes, "pro"), []); // a hole no longer on the course
  assert.equal(showcases(b([["h1", 2, 2], ["h2", 3, 3], ["h3", 1, 1]]), holes, "pro", 2).length, 2); // n at most
});

test("a hole's map: its middle in the window's, the tee to the left or the foot, the path one line", () => {
  const wide = mapView([[5, 5], [35, 5], [20, 7]], { start: [5, 5], cup: [35, 5] });
  assert.deepEqual(wide.at([20, 6]), [60, 60]); // the middle of what happens
  assert.ok(wide.at([5, 5])[0] < 60 && wide.at([35, 5])[0] > 60);
  assert.ok(Math.hypot(wide.at([5, 5])[0] - 60, wide.at([5, 5])[1] - 60) < 56); // inside the ring
  const back = mapView([[5, 5], [35, 5]], { start: [35, 5], cup: [5, 5] });
  assert.ok(back.at([35, 5])[0] < 60); // turned: the tee still on the left
  const tall = mapView([[5, 5], [5, 35]], { start: [5, 5], cup: [5, 35] });
  assert.ok(tall.at([5, 5])[1] > 60 && tall.at([5, 35])[1] < 60); // the tee at the foot
  assert.equal(mapView([[0, 0], [1, 0]], { start: [0, 0], cup: [1, 0] }).k, 8); // a short one, not blown up
  assert.equal(pathD([[0, 0], [1, 0], [9, 0]], (p) => [p[0] * 2, p[1]]), "M0 0L1 0Q2 0 10 0L18 0");
});

test("a map frames the hole's shape too: its rails' ends, a rail-less lane's outline", () => {
  const z = (outside: boolean) => ({ kind: "hazard" as const, min: [0, 0] as const, max: [9, 9] as const, vec: [0, 0] as const, scale: 1, round: false, skin: "sea", outside, poly: [[1, 1], [8, 1], [4, 8]] as const });
  const fit = mapFit({ start: [2, 2], cup: [6, 2], walls: [{ a: [0, 0], b: [0, 9], skin: "" }], zones: [z(true), z(false)] }, [[3, 2]]);
  assert.deepEqual(fit, [[2, 2], [6, 2], [3, 2], [0, 0], [0, 9], [1, 1], [8, 1], [4, 8]]); // (a zone inside the lane: not its shape)
});

test("a map's zones by what they do: water, a drop, sand, ice, a slope, what passes over or under; the rest left out", () => {
  const k = (kind: "surface" | "slope" | "tunnel" | "hazard" | "loop", skin: string, air = false) => mapZone({ kind, skin, air });
  assert.deepEqual([k("hazard", "water"), k("hazard", "sea"), k("hazard", "canal"), k("hazard", "crevasse"), k("hazard", "roof")], ["pond", "pond", "pond", "drop", "drop"]);
  assert.deepEqual([k("surface", "sand"), k("surface", "wetsand"), k("surface", "ice"), k("surface", "plank bridge"), k("surface", "flowerbed")], ["sand", "sand", "ice", "over", null]);
  assert.deepEqual([k("slope", "mound"), k("slope", "gust", true), k("tunnel", "tunnel"), k("loop", "castle tube")], ["slope", null, "over", "over"]);
});

test("your score against their best: none yet, over by the gap, level, beaten", () => {
  assert.deepEqual(vsBest(undefined, 3), { kind: "none", gap: 0 });
  assert.deepEqual(vsBest(5, 3), { kind: "over", gap: 2 });
  assert.deepEqual(vsBest(3, 3), { kind: "tie", gap: 0 });
  assert.deepEqual(vsBest(2, 3), { kind: "won", gap: 1 });
});

test("a map's lines: rails joined end to end into runs, their corners rounded, a loop closed", () => {
  const w = (a: [number, number], b: [number, number]) => ({ a, b });
  const runs = railRuns([w([0, 0], [1, 0]), w([5, 5], [6, 5]), w([1, 1], [1, 0]), w([0, 1], [0, 0])]);
  assert.deepEqual(runs, [[[0, 1], [0, 0], [1, 0], [1, 1]], [[5, 5], [6, 5]]]); // (a wall the other way round, joined all the same)
  const id = (p: [number, number]) => p;
  assert.equal(pathD([[0, 0], [10, 0]], id), "M0 0L10 0");
  assert.equal(pathD([[0, 0], [10, 0], [10, 10]], id), "M0 0L5 0Q10 0 10 5L10 10"); // the corner bent through the sides' middles
  assert.equal(pathD([[0, 0], [10, 0], [10, 10], [0, 0]], id), "M5 0Q10 0 10 5Q10 10 5 5Q0 0 5 0"); // a loop: no corner left
});

test("the best raced on a hole: the aim mode's, else the other, else none", () => {
  assert.deepEqual(bestOf({ pro: 3, assisted: 2 }, "pro"), { mode: "pro", strokes: 3 });
  assert.deepEqual(bestOf({ pro: 0, assisted: 2 }, "pro"), { mode: "assisted", strokes: 2 });
  assert.equal(bestOf({ pro: 0, assisted: 0 }, "assisted"), null);
  assert.equal(bestOf(undefined, "pro"), null);
});

test("calls in turn: n at once, the rest in order, a failed one handing its place on", async () => {
  const turn = inTurn(2), log: string[] = [];
  let at = 0, most = 0;
  const call = (id: string, fail = false) => turn(async () => {
    most = Math.max(most, ++at);
    await new Promise((r) => setTimeout(r, 5));
    at--, log.push(id);
    if (fail) throw new Error(id);
    return id;
  });
  const all = await Promise.allSettled([call("a", true), call("b"), call("c"), call("d")]);
  assert.equal(most, 2);
  assert.deepEqual(log, ["a", "b", "c", "d"]);
  assert.deepEqual(all.map((r) => r.status), ["rejected", "fulfilled", "fulfilled", "fulfilled"]);
  assert.equal(await turn(() => Promise.resolve("e")), "e"); // its places all given back
});

test("a duel's next stroke called out: strokes left to win, the last one, the tie, out of reach", () => {
  assert.deepEqual([1, 2, 3, 4, 5].map((n) => raceLeft(n, 4)), ["3 strokes left to win", "2 strokes left to win", "Last one to win!", "Hole it to tie", "Out of reach"]);
  assert.equal(raceLeft(1, 1), "Hole it to tie", "an ace: tie it at best");
});
