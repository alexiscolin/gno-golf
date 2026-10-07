// The editor's keys (lib/builder/keys.ts): what a key press asks for, and the
// keys as the board's key line and the glossary say them (one list).
import { test } from "node:test";
import assert from "node:assert/strict";
import { KEYS, keyAction } from "../lib/builder/keys.ts";

const press = (key: string, o: { meta?: boolean; ctrl?: boolean; alt?: boolean } = {}) => keyAction({ key, metaKey: !!o.meta, ctrlKey: !!o.ctrl, altKey: !!o.alt });

void test("keyAction: 1 to 5 pick the palette's first five, F frames the hole, T tests; with a modifier, none", () => {
  assert.deepEqual([1, 2, 3, 4, 5].map((n) => press(String(n))), [0, 1, 2, 3, 4].map((n) => ({ t: "arm", n })));
  assert.equal(press("6"), null);
  assert.deepEqual(press("f"), { t: "frame" });
  assert.deepEqual(press("F"), { t: "frame" });
  assert.deepEqual(press("t"), { t: "test" });
  assert.equal(press("t", { meta: true }), null, "⌘T: the browser's");
  assert.equal(press("1", { ctrl: true }), null);
  assert.equal(press("f", { alt: true }), null);
});

void test("KEYS: each key once, in a few words for the key line and a sentence for the glossary", () => {
  const keys = KEYS.map((k) => k.key);
  assert.equal(new Set(keys).size, keys.length);
  for (const k of ["1–5", "Space", "F", "T", "Esc"]) assert.ok(keys.includes(k), k);
  for (const k of KEYS) assert.ok(k.short.split(" ").length <= 2 && k.long.length > k.short.length, k.key);
});
