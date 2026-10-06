// The takedown list (lib/takedown.ts, the site's /takedown.json): community
// holes the site no longer shows, whatever the chain lists.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readTakedown, takenDown } from "../lib/takedown.ts";

const A = "g1hvuayx9ll7dal54kr0f6t89j8867z8lf5vtxgv";

void test("takedown: aliases of this chain only, every version of each", () => {
  const s = readTakedown(JSON.stringify({ chain: "onyx-1", holes: [`${A}/rude`, "not an alias", 3, `${A}/Bad_Slug`, `nope/rude`] }), "onyx-1");
  assert.deepEqual([...s], [`${A}/rude`]);
  assert.equal(takenDown(s, `${A}/rude/v2`), true);
  assert.equal(takenDown(s, `${A}/rude`), true, "the alias itself");
  assert.equal(takenDown(s, `${A}/other/v1`), false);
  assert.equal(takenDown(s, "garden/3/v1"), false, "a course hole never");
});

void test("takedown: another chain's list, a list too big or not JSON, takes nothing down", () => {
  assert.equal(readTakedown(JSON.stringify({ chain: "dev", holes: [`${A}/rude`] }), "onyx-1").size, 0);
  assert.equal(readTakedown(JSON.stringify({ chain: "", holes: [`${A}/rude`] }), "onyx-1").size, 1, "no chain said: read (a local list)");
  for (const t of ["", "not json", "null", "[]", JSON.stringify({ holes: "x" }), "x".repeat((1 << 20) + 1)]) assert.equal(readTakedown(t, "onyx-1").size, 0, t.slice(0, 12));
});
