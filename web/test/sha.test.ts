// lib/sha.ts: the digest in script, for a page that is not a secure context,
// is SHA-256 itself: every length round the padding's edges, and big data.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { sha256, sha256Bytes } from "../lib/sha.ts";

const node = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");

void test("sha256Bytes is SHA-256: the known answers, every length to 300 bytes, 1 MB", () => {
  assert.equal(hex(sha256Bytes(new Uint8Array())), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  assert.equal(hex(sha256Bytes(new TextEncoder().encode("abc"))), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  for (let n = 0; n <= 300; n++) {
    const b = randomBytes(n);
    assert.equal(hex(sha256Bytes(b)), node(b), `${n} bytes`);
  }
  const big = randomBytes(1 << 20);
  assert.equal(hex(sha256Bytes(big)), node(big));
});

void test("sha256 gives the same answer with crypto.subtle and without it", async () => {
  const data = "a hole's data, ünïcode included";
  const withSubtle = await sha256(data);
  const saved = Object.getOwnPropertyDescriptor(globalThis, "crypto")!;
  Object.defineProperty(globalThis, "crypto", { value: {}, configurable: true });
  try {
    assert.equal(await sha256(data), withSubtle);
  } finally {
    Object.defineProperty(globalThis, "crypto", saved);
  }
  assert.equal(withSubtle, createHash("sha256").update(data).digest("hex"));
});
