// lib/sim/sources.ts: a wasm build's sources against the realm's, as the chain keeps them; the realm's store and
// its reads (state.gno) left out, the rules (physics, course, the realm's data, golf and weather) compared.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sameSources } from "../lib/sim/sources.ts";
import { sha256 } from "../lib/sha.ts";

const realm = "gno.land/r/nym-x/gnogolf/golf/v2";
const files: Record<string, string> = {
  "gno.land/p/gnogolf/physics/step.gno": "package physics // step",
  "gno.land/r/gnogolf/golf/v2/golf.gno": 'package golf\nimport "gno.land/p/gnogolf/physics"',
  "gno.land/r/gnogolf/golf/v2/state.gno": "package golf // the store",
};
const chainOf = (on: Record<string, string>) => ({ realm, file: async (p: string) => on[p] ?? "" });
// the files as stage.sh deploys them: under the realm's namespace, its imports rewritten
const deployed = (over: Record<string, string> = {}) =>
  Object.fromEntries(Object.entries({ ...files, ...over }).map(([p, t]) => [
    p.replace("gno.land/r/gnogolf/golf/v2/", realm + "/").replace("gno.land/p/gnogolf/", "gno.land/p/nym-x/gnogolf/"),
    t.replaceAll("gno.land/p/gnogolf/", "gno.land/p/nym-x/gnogolf/"),
  ]));
const sums = async () => Object.fromEntries(await Promise.all(Object.entries(files).map(async ([p, t]) => [p, await sha256(t)])));

void test("sameSources: the same rules; a read added to the store since (state.gno) changes nothing; a rule's file does", async () => {
  const src = await sums();
  assert.equal(await sameSources(chainOf(deployed()), src, "t1"), true);
  assert.equal(await sameSources(chainOf(deployed({ "gno.land/r/gnogolf/golf/v2/state.gno": "package golf // the store, a read less" })), src, "t2"), true);
  assert.equal(await sameSources(chainOf(deployed({ "gno.land/r/gnogolf/golf/v2/golf.gno": "package golf // other rules" })), src, "t3"), false);
});
