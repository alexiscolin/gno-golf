// lib/retry.ts: an image that could not be fetched (the site restarting, the
// network gone a moment) asked again a few times, later each time, then let be.
import { test } from "node:test";
import assert from "node:assert/strict";
import { retryIn } from "../lib/retry.ts";

void test("retryIn: twice, later each time, then never", () => {
  assert.deepEqual([0, 1, 2, 3].map((n) => retryIn(n)), [1500, 3000, null, null]);
  assert.deepEqual([0, 1].map((n) => retryIn(n, 1, 100)), [100, null]);
});
