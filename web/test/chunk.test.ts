// lib/chunk.ts: a screen's code fetched once. A prefetch (each screen with a
// door to it) starts the fetch at most once, never again after it failed; the
// screen itself (opened) asks again after a failure, and has it at once after.
import { test } from "node:test";
import assert from "node:assert/strict";
import { chunk } from "../lib/chunk.ts";

void test("chunk: one fetch for prefetches and loads; after a failure prefetch stops, load retries; then the value at once", async () => {
  let calls = 0, fail = true;
  const c = chunk(() => (calls++, fail ? Promise.reject(new Error("offline")) : Promise.resolve("mod")));
  c.prefetch();
  c.prefetch();
  assert.equal(calls, 1, "one fetch for both");
  await new Promise((r) => setTimeout(r));
  c.prefetch();
  c.prefetch();
  assert.equal(calls, 1, "no fetch again on a screen change after a failure");
  await assert.rejects(c.load(), /offline/);
  assert.equal(calls, 2, "opening the screen asks again");
  fail = false;
  const [a, b] = await Promise.all([c.load(), c.load()]);
  assert.deepEqual([a, b, calls], ["mod", "mod", 3], "one fetch for two loads");
  assert.equal(c.value(), "mod");
  c.prefetch();
  assert.equal(await c.load(), "mod");
  assert.equal(calls, 3);
});
