import { test } from "node:test";
import assert from "node:assert/strict";
import { readFlags, stale, hidden, whyHidden, screen, HIDE_AT } from "../lib/flags.ts";
import { PLAYS_LIKE_A_PROGRAM } from "../lib/botproof.ts";

const A = "g1" + "a".repeat(38), B = "g1" + "b".repeat(38), C = "g1" + "c".repeat(38);
const NOW = Date.parse("2026-10-02T12:00:00Z");
const file = (o: object) => JSON.stringify({ updated: "2026-10-02T06:00:00Z", chain: "onyx-1", ...o });

test("flags: a list read as written, its age in hours", () => {
  const f = readFlags(file({ flags: { [A]: { score: 1, said: ["the very same shots as an earlier record"], proof: true, reasons: ["detail"] }, [B]: { score: 0.2, said: [] } } }), "onyx-1", NOW);
  assert.deepEqual(f.flags[A], { score: 1, said: ["the very same shots as an earlier record"], proof: true }, "the detail is the report's, not the board's");
  assert.deepEqual(f.flags[B], { score: 0.2, said: [] });
  assert.equal(f.hours, 6);
  assert.equal(stale(f.hours), false);
});

test("flags: what does not belong is dropped, a list too big or not JSON read as none", () => {
  const f = readFlags(file({ flags: { nope: { score: 1 }, [A]: { score: 2 }, [B]: { score: "1" }, [C]: { score: 0.6, said: "x" } } }), "onyx-1", NOW);
  assert.deepEqual(Object.keys(f.flags), [C], "an address only, a score in 0..1 only");
  assert.deepEqual(f.flags[C].said, [], "said a string, not a list: none (whyHidden's own words then)");
  const long = readFlags(file({ flags: { [A]: { score: 1, said: ["x".repeat(500), "b", "c", "d"] } } }), "onyx-1", NOW);
  assert.equal(long.flags[A].said.length, 3);
  assert.equal(long.flags[A].said[0].length, 120);
  for (const t of ["", "not json", "null", "[]", "x".repeat((1 << 20) + 1)]) assert.deepEqual(Object.keys(readFlags(t, "onyx-1", NOW).flags), [], JSON.stringify(t.slice(0, 10)));
});

test("flags: another chain's list hides nobody; an unknown or old date is stale", () => {
  const other = readFlags(file({ flags: { [A]: { score: 1 } } }), "test12", NOW);
  assert.deepEqual(other.flags, {});
  assert.equal(stale(readFlags(JSON.stringify({ updated: "", flags: {} }), "x", NOW).hours), true, "never ran");
  assert.equal(stale(readFlags(JSON.stringify({ updated: "2026-09-30T00:00:00Z", flags: {} }), "x", NOW).hours), true, "two runs missed and more");
  assert.equal(stale(readFlags(JSON.stringify({ updated: "2026-10-02T11:00:00Z", flags: {} }), "x", NOW).hours), false);
  assert.equal(stale(NaN), true);
  assert.deepEqual(Object.keys(readFlags(JSON.stringify({ flags: { [A]: { score: 1 } } }), "onyx-1", NOW).flags), [A], "no chain said: read (a local list)");
});

test("flags: hidden from HIDE_AT, said in the list's words or the check's own", () => {
  assert.equal(hidden({ score: HIDE_AT, said: [] }), true);
  assert.equal(hidden({ score: 0.4999, said: [] }), false);
  assert.equal(hidden(undefined), false);
  assert.equal(hidden(false), false);
  assert.equal(whyHidden({ score: 1, said: ["a", "b"] }), "a; b");
  assert.equal(whyHidden({ score: 1, said: [] }), PLAYS_LIKE_A_PROGRAM);
});

test("flags: the hidden rows counted out unless all are shown", () => {
  const flags = { [A]: { score: 1, said: [] }, [B]: { score: 0.9, said: [] }, [C]: { score: 0.4, said: [] } };
  const rows = [{ player: A }, { player: B }, { player: C }];
  assert.deepEqual(screen(rows, flags, false), { rows: [{ player: C }], hidden: 2 });
  assert.deepEqual(screen(rows, flags, true), { rows, hidden: 0 });
});
