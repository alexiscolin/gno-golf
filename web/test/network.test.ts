import { test } from "node:test";
import assert from "node:assert/strict";
import type * as Network from "../lib/network.ts";

// network.ts reads process.env at import time, so each variant needs its own
// module instance: a cache-busting query string forces a fresh evaluation.
let n = 0;
const load = () => import(`../lib/network.ts?v=${n++}`) as Promise<typeof Network>;

test("no NEXT_PUBLIC_NETWORK: testnet, no OTHER_URL", async () => {
  delete process.env.NEXT_PUBLIC_NETWORK;
  delete process.env.NEXT_PUBLIC_OTHER_URL;
  const { NETWORK, OTHER_URL } = await load();
  assert.equal(NETWORK, "testnet");
  assert.equal(OTHER_URL, "");
});

test("NEXT_PUBLIC_NETWORK=mainnet selects mainnet", async () => {
  process.env.NEXT_PUBLIC_NETWORK = "mainnet";
  const { NETWORK } = await load();
  assert.equal(NETWORK, "mainnet");
});

test("any other NEXT_PUBLIC_NETWORK value falls back to testnet", async () => {
  process.env.NEXT_PUBLIC_NETWORK = "staging";
  const { NETWORK } = await load();
  assert.equal(NETWORK, "testnet");
});

test("NEXT_PUBLIC_OTHER_URL is passed through when set", async () => {
  process.env.NEXT_PUBLIC_OTHER_URL = "https://mainnet.gnogolf.example";
  const { OTHER_URL } = await load();
  assert.equal(OTHER_URL, "https://mainnet.gnogolf.example");
});

test("an empty NEXT_PUBLIC_OTHER_URL is treated as unset", async () => {
  process.env.NEXT_PUBLIC_OTHER_URL = "";
  const { OTHER_URL } = await load();
  assert.equal(OTHER_URL, "");
});

// ---- networkOf ----

test("networkOf: a loopback RPC is always local, whatever NEXT_PUBLIC_NETWORK says", async () => {
  process.env.NEXT_PUBLIC_NETWORK = "mainnet";
  const { networkOf } = await load();
  assert.equal(networkOf("http://localhost:26657"), "local");
  assert.equal(networkOf("http://127.0.0.1:26657"), "local");
  assert.equal(networkOf("http://[::1]:26657"), "local");
  assert.equal(networkOf("http://localhost/rpc"), "local");
});

test("networkOf: a non-loopback host falls through to the build's NETWORK", async () => {
  process.env.NEXT_PUBLIC_NETWORK = "mainnet";
  const mainnet = await load();
  assert.equal(mainnet.networkOf("https://rpc.mainnet.gnogolf.example"), "mainnet");

  process.env.NEXT_PUBLIC_NETWORK = "testnet";
  const testnet = await load();
  assert.equal(testnet.networkOf("https://rpc.testnet.gnogolf.example"), "testnet");
});

test("networkOf: a host that merely starts with 'localhost' is not loopback", async () => {
  process.env.NEXT_PUBLIC_NETWORK = "testnet";
  const { networkOf } = await load();
  assert.equal(networkOf("https://localhost.evil.example/rpc"), "testnet");
});
