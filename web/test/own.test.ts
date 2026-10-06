// own (lib/own.ts): a table looked up by a string from the chain answers its
// own keys only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { own } from "../lib/own.ts";

void test("own: a table's own keys only, never Object.prototype's", () => {
  const t = { palm: 1 };
  for (const k of ["constructor", "toString", "__proto__", "hasOwnProperty", "valueOf"]) assert.equal(own(t, k), undefined, k);
  assert.equal(own(t, "palm"), 1);
  assert.equal(own(t, ""), undefined);
});
