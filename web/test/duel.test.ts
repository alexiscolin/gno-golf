// Ghost duels (ADR-004): the best raced, the ghost's pace, and the result in words.
import { test } from "node:test";
import assert from "node:assert/strict";
import { duelResult, duelShare, ghostSpeed, pickGhost, shotsOf, type Duel } from "../lib/duel.ts";
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
  assert.equal(ghostSpeed(1000), 2);
  assert.equal(ghostSpeed(4000), 2);
  assert.equal(ghostSpeed(9000), 4.5);
});

test("the result reads a win, a loss by one in words, a tie, an ace matched", () => {
  assert.deepEqual(duelResult(2, duel(3), "Birdie"), { result: "win", title: "You beat ace!", line: "2 to their 3 · Birdie" });
  assert.equal(duelResult(4, duel(3), "Bogey").title, "ace wins by one");
  assert.equal(duelResult(5, duel(3), "Bogey").title, "ace wins by 2");
  assert.deepEqual(duelResult(3, duel(3), "Par"), { result: "tie", title: "Tied with ace", line: "3 strokes each · Par" });
  assert.deepEqual(duelResult(1, duel(1), "Ace"), { result: "tie", title: "You matched ace's ace!", line: "1 stroke each · Ace" });
});

test("racing your own best reads as such", () => {
  assert.equal(duelResult(2, duel(3, true), "Birdie").title, "You beat your best!");
  assert.equal(duelResult(4, duel(3, true), "Bogey").title, "Your best still stands, by one");
  assert.equal(duelResult(3, duel(3, true), "Par").title, "You tied your best");
});

test("the share text dares back once saved, and passes the rival's dare on before", () => {
  assert.match(duelShare("win", duel(3), "The Mill", 2, true), /^⚔ Beat ace on The Mill, 2 to 3\. My ghost is waiting\. Free to play/);
  assert.match(duelShare("loss", duel(3), "The Mill", 4, true), /beat me by one on The Mill/);
  assert.match(duelShare("tie", duel(3), "The Mill", 3, true), /both holed The Mill in 3\. Settle it\./);
  assert.match(duelShare("win", duel(3), "The Mill", 2, false), /^⚔ Can you beat ace's 3 on The Mill\? Free to play, no wallet needed\./);
});
