// lib/adena.ts: the Adena wallet layer. Adena itself is faked by setting
// globalThis.window = { adena: <fake> } — adena.ts's wallet() reads exactly
// that. Every fake call is logged (name + args) so a test can assert on what
// was actually asked of Adena, not just on the final result.
import { test } from "node:test";
import assert from "node:assert/strict";
import { RULES } from "../lib/chain.ts";
import {
  type Adena,
  type SendError,
  hasAdena,
  connect,
  onOurNode,
  current,
  onWalletChange,
  commitsOf,
  gasOf,
  chainSplit,
  recordRound,
  registerName,
  claimRounds,
  gnokeyPlan,
  depositBytes,
  shortOf,
  costOf,
} from "../lib/adena.ts";
import type { SimulateRound, Vec2 } from "../lib/types.ts";

// a well-formed gno.land address (g1 + 38 [0-9a-z]): the one real check
// connect()/current() run on Adena's answer
const ADDR = "g1" + "a".repeat(38);
const REALM = "gno.land/r/x/golf";
const RPC = "http://127.0.0.1:26657";
const CHAIN = "chain-a";

function setWindow(win: { adena?: Adena } | undefined) {
  (globalThis as unknown as { window?: { adena?: Adena } }).window = win;
}

// ---------------------------------------------------------------- fakeAdena
type Res = { status: string; type?: string; code?: number; message?: string; data?: unknown };
type Call = { name: string; args: unknown[] };

/** A fake Adena. `script[Method]`, if given, replies for that method's call
 *  number i (0-based, thrown values reject); otherwise a plain success. Every
 *  call — including ones script doesn't cover — is pushed to `calls`. */
function fakeAdena(script: {
  AddEstablish?: (i: number) => Res;
  GetAccount?: (i: number) => Res;
  GetNetwork?: (i: number) => Res;
  SwitchNetwork?: (i: number) => Res;
  AddNetwork?: (i: number) => Res;
  DoContract?: (i: number) => Res;
  hasGetNetwork?: boolean;
  hasOn?: boolean;
} = {}) {
  const calls: Call[] = [];
  const counts: Record<string, number> = {};
  const call = (name: string, args: unknown[], fn: ((i: number) => Res) | undefined, fallback: Res): Promise<Res> => {
    calls.push({ name, args });
    const i = counts[name] || 0;
    counts[name] = i + 1;
    return Promise.resolve(fn ? fn(i) : fallback);
  };
  const raw = {
    AddEstablish: (name: string) => call("AddEstablish", [name], script.AddEstablish, { status: "success" }),
    GetAccount: () => call("GetAccount", [], script.GetAccount, { status: "success", data: { address: ADDR, chainId: CHAIN } }),
    SwitchNetwork: (chainId: string) => call("SwitchNetwork", [chainId], script.SwitchNetwork, { status: "success" }),
    AddNetwork: (n: { chainId: string; chainName: string; rpcUrl: string }) => call("AddNetwork", [n], script.AddNetwork, { status: "success" }),
    DoContract: (tx: { messages: unknown[]; gasFee: number; gasWanted: number; memo: string; networkInfo?: unknown }) =>
      call("DoContract", [tx], script.DoContract, { status: "success", data: { hash: "0xabc", height: 1 } }),
    ...(script.GetNetwork || script.hasGetNetwork ? { GetNetwork: () => call("GetNetwork", [], script.GetNetwork, { status: "success" }) } : {}),
    ...(script.hasOn
      ? { On: (event: "changedAccount" | "changedNetwork", fn: (...x: unknown[]) => void) => void calls.push({ name: "On", args: [event, fn] }) }
      : {}),
  };
  return { a: raw as unknown as Adena, calls };
}

// ------------------------------------------------------------------ hasAdena
test("hasAdena: true only with a window.adena", () => {
  setWindow(undefined);
  assert.equal(hasAdena(), false);
  setWindow({});
  assert.equal(hasAdena(), false);
  setWindow({ adena: fakeAdena().a });
  assert.equal(hasAdena(), true);
});

// -------------------------------------------------------------------- current
test("current: null with no wallet, no account, or a throw; the account otherwise", async () => {
  setWindow(undefined);
  assert.equal(await current(), null);

  setWindow({ adena: fakeAdena({ GetAccount: () => ({ status: "failure" }) }).a });
  assert.equal(await current(), null);

  setWindow({
    adena: fakeAdena({
      GetAccount: () => {
        throw new Error("boom");
      },
    }).a,
  });
  assert.equal(await current(), null);

  // a success with no address (or an empty one) is no account either
  setWindow({ adena: fakeAdena({ GetAccount: () => ({ status: "success", data: { address: "", chainId: CHAIN } }) }).a });
  assert.equal(await current(), null);

  setWindow({ adena: fakeAdena({ GetAccount: () => ({ status: "success", data: { address: ADDR, chainId: CHAIN } }) }).a });
  assert.deepEqual(await current(), { address: ADDR, chainId: CHAIN });
});

// --------------------------------------------------------------- onWalletChange
test("onWalletChange: a no-op unsub with no wallet or no On; otherwise dispatches to every subscriber until unsubscribed", () => {
  setWindow(undefined);
  assert.equal(typeof onWalletChange(() => {}), "function");
  onWalletChange(() => {})(); // does not throw

  setWindow({ adena: fakeAdena().a }); // no On on this one
  assert.equal(typeof onWalletChange(() => {}), "function");

  const { a, calls } = fakeAdena({ hasOn: true });
  setWindow({ adena: a });
  const seen1: unknown[] = [];
  const seen2: unknown[] = [];
  const un1 = onWalletChange((...x) => seen1.push(x));
  onWalletChange((...x) => seen2.push(x));
  // Adena is told of exactly the two events this page follows
  assert.deepEqual(
    calls.map((c) => c.name),
    ["On", "On"],
  );
  assert.deepEqual(
    calls.map((c) => c.args[0]),
    ["changedAccount", "changedNetwork"],
  );
  const dispatch = calls[0].args[1] as (...x: unknown[]) => void;
  dispatch("acct-1");
  assert.equal(seen1.length, 1);
  assert.equal(seen2.length, 1);
  un1();
  dispatch("acct-2");
  assert.equal(seen1.length, 1); // unsubscribed: not called again
  assert.equal(seen2.length, 2);
});

// --------------------------------------------------------------- onOurNode
test("onOurNode: null with no wallet, no GetNetwork or no rpc; true/false by port (localhost normalised)", async () => {
  setWindow(undefined);
  assert.equal(await onOurNode(RPC), null);

  setWindow({ adena: fakeAdena().a }); // no GetNetwork
  assert.equal(await onOurNode(RPC), null);

  setWindow({ adena: fakeAdena({ hasGetNetwork: true, GetNetwork: () => ({ status: "success", data: { chainId: CHAIN, rpcUrl: RPC } }) }).a });
  assert.equal(await onOurNode(null), null);
  assert.equal(await onOurNode(RPC), true);

  // "localhost" and its default port both normalise the same as "127.0.0.1:26657"
  setWindow({ adena: fakeAdena({ hasGetNetwork: true, GetNetwork: () => ({ status: "success", data: { chainId: CHAIN, rpcUrl: "http://localhost:26657" } }) }).a });
  assert.equal(await onOurNode(RPC), true);

  setWindow({ adena: fakeAdena({ hasGetNetwork: true, GetNetwork: () => ({ status: "success", data: { chainId: CHAIN, rpcUrl: "http://127.0.0.1:9999" } }) }).a });
  assert.equal(await onOurNode(RPC), false);

  // a URL port() cannot parse falls back to the raw string (never matches a real rpc)
  setWindow({ adena: fakeAdena({ hasGetNetwork: true, GetNetwork: () => ({ status: "success", data: { chainId: CHAIN, rpcUrl: "not a url" } }) }).a });
  assert.equal(await onOurNode(RPC), false);

  setWindow({
    adena: fakeAdena({
      hasGetNetwork: true,
      GetNetwork: () => {
        throw new Error("down");
      },
    }).a,
  });
  assert.equal(await onOurNode(RPC), null);
});

// ------------------------------------------------------ ensureNetwork (via recordRound)
// ensureNetwork is not exported; recordRound always runs it first, so every
// SwitchNetwork/AddNetwork/GetNetwork path and message is reachable through it.
const roundArgs = (over: Record<string, unknown> = {}) => ({
  address: ADDR, realm: REALM, hole: "garden/7", shots: ["1,1"], chainId: CHAIN, rpc: RPC, ...over,
});

test("ensureNetwork: no chainId, no signature (Adena would sign on its own network)", async () => {
  const { a, calls } = fakeAdena();
  setWindow({ adena: a });
  await assert.rejects(recordRound(roundArgs({ chainId: null })), /chain's id is not known/);
  assert.deepEqual(calls.map((c) => c.name), []);
});

test("ensureNetwork: already on the right network (with or without an rpc in the reply) never switches", async () => {
  for (const data of [{ chainId: CHAIN, rpcUrl: RPC }, { chainId: CHAIN }]) {
    const { a, calls } = fakeAdena({ hasGetNetwork: true, GetNetwork: () => ({ status: "success", data }) });
    setWindow({ adena: a });
    await recordRound(roundArgs());
    assert.equal(calls.filter((c) => c.name === "GetNetwork").length, 1);
    assert.equal(calls.filter((c) => c.name === "SwitchNetwork").length, 0);
    assert.equal(calls.filter((c) => c.name === "AddNetwork").length, 0);
  }
});

test("ensureNetwork: GetNetwork throwing is treated as 'cannot say', not a match — proceeds to switch", async () => {
  const { a, calls } = fakeAdena({
    hasGetNetwork: true,
    GetNetwork: (i) => {
      if (i === 0) throw new Error("no network yet");
      return { status: "success", data: { chainId: CHAIN, rpcUrl: RPC } };
    },
    SwitchNetwork: () => ({ status: "success" }),
  });
  setWindow({ adena: a });
  await recordRound(roundArgs());
  assert.deepEqual(calls.map((c) => c.name), ["GetNetwork", "SwitchNetwork", "GetNetwork", "DoContract"]);
});

test("ensureNetwork: switch fails, AddNetwork answers NETWORK_ALREADY_EXISTS, the retried switch succeeds", async () => {
  const { a, calls } = fakeAdena({
    hasGetNetwork: true,
    GetNetwork: (i) => (i === 0 ? { status: "success", data: { chainId: "other", rpcUrl: RPC } } : { status: "success", data: { chainId: CHAIN, rpcUrl: RPC } }),
    SwitchNetwork: (i) => (i === 0 ? { status: "failure" } : { status: "success" }),
    AddNetwork: () => ({ status: "failure", type: "NETWORK_ALREADY_EXISTS" }),
  });
  setWindow({ adena: a });
  await recordRound(roundArgs());
  assert.deepEqual(calls.map((c) => c.name), ["GetNetwork", "SwitchNetwork", "AddNetwork", "SwitchNetwork", "GetNetwork", "DoContract"]);
});

test("ensureNetwork: AddNetwork refused for another reason throws its own message", async () => {
  const { a } = fakeAdena({
    hasGetNetwork: true,
    GetNetwork: () => ({ status: "success", data: { chainId: "other", rpcUrl: RPC } }),
    SwitchNetwork: () => ({ status: "failure" }),
    AddNetwork: () => ({ status: "failure", message: "disk full" }),
  });
  setWindow({ adena: a });
  await assert.rejects(() => recordRound(roundArgs()), /disk full/);
});

test("ensureNetwork: the retried switch still failing names the RPC to remove in Adena", async () => {
  const { a } = fakeAdena({
    hasGetNetwork: true,
    GetNetwork: () => ({ status: "success", data: { chainId: "other", rpcUrl: RPC } }),
    SwitchNetwork: () => ({ status: "failure" }),
    AddNetwork: () => ({ status: "success" }),
  });
  setWindow({ adena: a });
  await assert.rejects(() => recordRound(roundArgs()), (e: unknown) => {
    assert.ok(e instanceof Error);
    assert.match(e.message, /already has a network on/);
    assert.match(e.message, new RegExp(RPC.replace(/[/.]/g, "\\$&")));
    assert.match(e.message, /chain-a/);
    return true;
  });
});

test("ensureNetwork: switched, but to the wrong RPC under the right chain id", async () => {
  const { a } = fakeAdena({
    hasGetNetwork: true,
    GetNetwork: (i) => (i === 0 ? { status: "success", data: { chainId: "other", rpcUrl: RPC } } : { status: "success", data: { chainId: CHAIN, rpcUrl: "http://elsewhere:9999" } }),
    SwitchNetwork: () => ({ status: "success" }),
  });
  setWindow({ adena: a });
  await assert.rejects(() => recordRound(roundArgs()), (e: unknown) => {
    assert.ok(e instanceof Error);
    assert.match(e.message, /Adena switched to/);
    assert.match(e.message, /http:\/\/elsewhere:9999/);
    return true;
  });
});

// ------------------------------------------------------------------- connect
test("connect: not installed", async () => {
  setWindow(undefined);
  await assert.rejects(() => connect({ chainId: CHAIN, rpc: RPC }), /not installed/);
});

test("connect: AddEstablish refused (and ALREADY_CONNECTED is not a refusal)", async () => {
  setWindow({ adena: fakeAdena({ AddEstablish: () => ({ status: "failure", code: 4000 }) }).a });
  await assert.rejects(() => connect({ chainId: CHAIN, rpc: RPC }), /Cancelled in Adena/);

  const { a } = fakeAdena({ AddEstablish: () => ({ status: "failure", type: "ALREADY_CONNECTED" }) });
  setWindow({ adena: a });
  const r = await connect({ chainId: CHAIN, rpc: RPC });
  assert.equal(r.address, ADDR);
});

test("connect: GetAccount refused, or a success with no usable address", async () => {
  setWindow({ adena: fakeAdena({ GetAccount: () => ({ status: "failure", message: "nope" }) }).a });
  await assert.rejects(() => connect({ chainId: CHAIN, rpc: RPC }), /nope/);

  setWindow({ adena: fakeAdena({ GetAccount: () => ({ status: "success" }) }).a });
  await assert.rejects(() => connect({ chainId: CHAIN, rpc: RPC }), /did not share an account/);

  setWindow({ adena: fakeAdena({ GetAccount: () => ({ status: "success", data: { address: "not-an-address", chainId: CHAIN } }) }).a });
  await assert.rejects(() => connect({ chainId: CHAIN, rpc: RPC }), /did not share an account/);
});

test("connect: already on the requested chain skips ensureNetwork entirely", async () => {
  const { a, calls } = fakeAdena({ GetAccount: () => ({ status: "success", data: { address: ADDR, chainId: CHAIN } }) });
  setWindow({ adena: a });
  const r = await connect({ chainId: CHAIN, rpc: RPC });
  assert.deepEqual(r, { address: ADDR, chainId: CHAIN, rpcOk: null }); // no GetNetwork on this fake: rpcOk unknown
  assert.deepEqual(calls.map((c) => c.name), ["AddEstablish", "GetAccount"]);
});

test("connect: a different chain runs ensureNetwork and reports the switched-to id, plus rpcOk", async () => {
  const { a, calls } = fakeAdena({
    GetAccount: () => ({ status: "success", data: { address: ADDR, chainId: "other" } }),
    hasGetNetwork: true,
    GetNetwork: (i) => (i === 0 ? { status: "success", data: { chainId: "other", rpcUrl: RPC } } : { status: "success", data: { chainId: CHAIN, rpcUrl: RPC } }),
    SwitchNetwork: () => ({ status: "success" }),
  });
  setWindow({ adena: a });
  const r = await connect({ chainId: CHAIN, rpc: RPC });
  assert.equal(r.chainId, CHAIN);
  assert.equal(r.rpcOk, true);
  assert.ok(calls.some((c) => c.name === "SwitchNetwork"));
});

// -------------------------------------------------------------- commitsOf/gasOf
test("commitsOf: a light round fits in one commit", () => {
  assert.deepEqual(commitsOf({ pts: [10, 10, 10], walls: 0, pieces: 0 }), [[0, 3]]);
});

test("commitsOf: no shots is no commits", () => {
  assert.deepEqual(commitsOf({}), []);
});

test("commitsOf: a `start` picks up mid-round", () => {
  assert.deepEqual(commitsOf({ pts: [10, 10, 10, 10, 10] }, 5, 3), [[3, 5]]);
});

test("commitsOf: 12 shots is the most one commit holds, however light", () => {
  // work per shot here (pts: 1) is ~11.2M, far under the 1.4e9 budget: only
  // RULES.maxShots forces the cut
  const c = { pts: Array.from({ length: 13 }, () => 1) };
  assert.deepEqual(commitsOf(c), [[0, 12], [12, 13]]);
});

test("commitsOf: the work budget cuts sooner than maxShots for heavy (unknown-length) strokes", () => {
  // pts omitted: each stroke counts as RULES.maxPath (512), the heaviest a
  // stroke can be — 10M + 512*1.2M = 624.4M per shot, so a third shot always
  // pushes spent+most past the 1.4e9 budget
  assert.deepEqual(commitsOf({}, 5), [[0, 2], [2, 4], [4, 5]]);
});

test("gasOf: PER_CALL alone for an empty range; the forecast and the shots add on top, capped at MAX_GAS", () => {
  assert.equal(gasOf({}), 30_000_000);
  // without the realm's own figure, the forecast's most (adena.ts FORECAST: rain 200M, a storm 210M)
  assert.equal(gasOf({ kind: "rain", pts: [100] }, 0, 1), 30_000_000 + 200_000_000 + 10_000_000 + 100 * 1_200_000);
  assert.equal(gasOf({ kind: "storm", pts: [100] }, 0, 1), 30_000_000 + 210_000_000 + 10_000_000 + 100 * 1_200_000);
  // with it (Weather() "gas"), that figure, whatever the kind
  assert.equal(gasOf({ kind: "storm", fixed: 15_728_000, pts: [100] }, 0, 1), 30_000_000 + 15_728_000 + 10_000_000 + 100 * 1_200_000);
  assert.equal(gasOf({ walls: 1000, pieces: 1000, pts: [2000] }, 0, 1), 1_900_000_000);
});

test("gasOf: a shot is counted by its path or by its physics' work (Shot.Work), the larger, as the realm does", () => {
  const path = 10_000_000 + 100 * 1_200_000;
  assert.equal(gasOf({ pts: [100], works: [50_000] }, 0, 1), 30_000_000 + path); // the path's is larger
  assert.equal(gasOf({ pts: [100], works: [637_500] }, 0, 1), 30_000_000 + 10_000_000 + 637_500 * RULES.work.unit); // the work's
});

// ------------------------------------------------------------------ chainSplit
const simRes = (rest: Vec2, strokes: number, period: number): SimulateRound => ({
  version: 1, path: [rest], air: "", cause: "", rest, holed: false, bounces: 0, strokes, period,
});

function fakeChain(script: {
  simulateRound?: (i: number, shots: readonly string[]) => SimulateRound;
  simulateCommit?: (i: number, shots: readonly string[], from: number, ball: Vec2) => SimulateRound;
}) {
  const calls: Call[] = [];
  let rI = 0, cI = 0;
  return {
    calls,
    simulateRound: (hole: string, shots: readonly string[], period: number | null | undefined, ms?: number): Promise<SimulateRound> => {
      calls.push({ name: "simulateRound", args: [hole, shots, period, ms] });
      if (!script.simulateRound) return Promise.reject(new Error("simulateRound not stubbed"));
      return Promise.resolve(script.simulateRound(rI++, shots));
    },
    simulateCommit: (hole: string, ball: Vec2, stroke: number, shots: readonly string[], period: number, ms?: number): Promise<SimulateRound> => {
      calls.push({ name: "simulateCommit", args: [hole, ball, stroke, shots, period, ms] });
      if (!script.simulateCommit) return Promise.reject(new Error("simulateCommit not stubbed"));
      return Promise.resolve(script.simulateCommit(cI++, shots, stroke, ball));
    },
  };
}

test("chainSplit: a chain refusal ('commit the first N') retries smaller, then continues by SimulateCommit", async () => {
  const chain = fakeChain({
    simulateRound: (i, shots) => {
      if (i === 0) throw new Error("golf: commit the first 2 shots only");
      return simRes([1, 1], shots.length, 7);
    },
    simulateCommit: (_i, shots) => simRes([2, 2], shots.length, 7),
  });
  const parts = await chainSplit(chain, { id: "garden/7", shots: ["1,1", "2,2", "3,3"], pts: [10, 10, 10] }, 7);
  assert.deepEqual(parts, [[0, 2], [2, 3]]);
  assert.deepEqual(chain.calls.map((c) => c.name), ["simulateRound", "simulateRound", "simulateCommit"]);
  // the tee read goes in s.period (here: unset), the continuing SimulateCommit
  // in chainSplit's own `period` argument — worth knowing if a caller ever
  // passes the two out of step (see report)
  assert.equal(chain.calls[0].args[2], undefined);
  assert.equal(chain.calls[2].args[4], 7);
});

test("chainSplit: a refusal naming fewer than one shot cannot be honoured", async () => {
  const chain = fakeChain({
    simulateRound: () => {
      throw new Error("golf: commit the first 0");
    },
  });
  await assert.rejects(
    () => chainSplit(chain, { id: "beach/2", shots: ["1,1", "2,2", "3,3"], pts: [10, 10, 10] }, 1),
    /Even one shot of this round is more than one transaction can replay/,
  );
});

test("chainSplit: any other refusal is not retried", async () => {
  const chain = fakeChain({
    simulateRound: () => {
      throw new Error("RPC down");
    },
  });
  await assert.rejects(() => chainSplit(chain, { id: "beach/2", shots: ["1,1"], pts: [10] }, 1), /RPC down$/);
});

// ------------------------------------------------------------------ recordRound
test("recordRound: not installed", async () => {
  setWindow(undefined);
  await assert.rejects(() => recordRound(roundArgs()), /not installed/);
});

test("recordRound: Reset + PlayRound for a fresh, period-less, assisted round", async () => {
  const { a, calls } = fakeAdena();
  setWindow({ adena: a });
  await recordRound(roundArgs({ shots: ["1,1", "2,2"] }));
  const tx = calls.find((c) => c.name === "DoContract")!.args[0] as { messages: { value: { func: string; args: string[] } }[]; gasFee: number; gasWanted: number; networkInfo?: unknown };
  assert.deepEqual(
    tx.messages.map((m) => m.value.func),
    ["Reset", "PlayRound"],
  );
  assert.deepEqual(tx.messages[1].value.args, ["garden/7", "1,1;2,2"]);
  assert.deepEqual(tx.networkInfo, { chainId: CHAIN, rpcUrl: RPC }); // the network the tx is signed for
  assert.equal(tx.gasWanted, 1_900_000_000); // no gas given: MAX_GAS
  assert.equal(tx.gasFee, Math.ceil(1_900_000_000 * 0.001 * 1.5));
});

test("recordRound: a name taken in the same signature, Register first and Claim last, their gas added", async () => {
  const { a, calls } = fakeAdena();
  setWindow({ adena: a });
  await recordRound(roundArgs({ shots: ["1,1"], gas: 100_000_000, named: { registrar: "gno.land/r/sys/namereg/v1", name: "nym-golfer482" } }));
  const tx = calls.find((c) => c.name === "DoContract")!.args[0] as { messages: { value: { pkg_path: string; func: string; args: string[] } }[]; gasWanted: number };
  assert.deepEqual(tx.messages.map((m) => [m.value.pkg_path, m.value.func]), [["gno.land/r/sys/namereg/v1", "Register"], [REALM, "Reset"], [REALM, "PlayRound"], [REALM, "Claim"]]);
  assert.deepEqual(tx.messages[0].value.args, ["nym-golfer482"]);
  assert.equal(tx.gasWanted, 100_000_000 + 60_000_000 + 90_000_000);
});

test("recordRound: reset=false continues a round with PlayRound alone", async () => {
  const { a, calls } = fakeAdena();
  setWindow({ adena: a });
  await recordRound(roundArgs({ reset: false }));
  const tx = calls.find((c) => c.name === "DoContract")!.args[0] as { messages: { value: { func: string } }[] };
  assert.deepEqual(tx.messages.map((m) => m.value.func), ["PlayRound"]);
});

test("recordRound: a period sends PlayRoundAt", async () => {
  const { a, calls } = fakeAdena();
  setWindow({ adena: a });
  await recordRound(roundArgs({ period: 5 }));
  const tx = calls.find((c) => c.name === "DoContract")!.args[0] as { messages: { value: { func: string; args: string[] } }[] };
  assert.deepEqual(tx.messages[1].value, { caller: ADDR, send: "", pkg_path: REALM, func: "PlayRoundAt", args: ["garden/7", "1,1", "5"] });
});

test("recordRound: mode=pro sends PlayRoundPro, and networkInfo is pinned when chainId+rpc are given", async () => {
  const { a, calls } = fakeAdena();
  setWindow({ adena: a });
  await recordRound(roundArgs({ mode: "pro", period: 3 }));
  const tx = calls.find((c) => c.name === "DoContract")!.args[0] as { messages: { value: { func: string; args: string[] } }[]; networkInfo?: { chainId: string; rpcUrl: string } };
  assert.deepEqual(tx.messages[1].value.args, ["garden/7", "1,1", "3"]);
  assert.equal(tx.messages[1].value.func, "PlayRoundPro");
  assert.deepEqual(tx.networkInfo, { chainId: CHAIN, rpcUrl: RPC });
});

test("recordRound: a pro round without a period cannot be saved, and nothing is sent", async () => {
  const { a, calls } = fakeAdena();
  setWindow({ adena: a });
  await assert.rejects(() => recordRound(roundArgs({ mode: "pro", period: null })), /no weather period/);
  assert.equal(calls.some((c) => c.name === "DoContract"), false);
});

test("recordRound: gas is capped at MAX_GAS, and the fee follows it", async () => {
  const { a, calls } = fakeAdena();
  setWindow({ adena: a });
  await recordRound(roundArgs({ gas: 5_000_000_000 }));
  const tx = calls.find((c) => c.name === "DoContract")!.args[0] as { gasWanted: number; gasFee: number };
  assert.equal(tx.gasWanted, 1_900_000_000);
  assert.equal(tx.gasFee, Math.ceil(1_900_000_000 * 0.001 * 1.5));
});

test("recordRound: an ordinary gas figure and price set the fee (gas * price * 1.5, rounded up)", async () => {
  const { a, calls } = fakeAdena();
  setWindow({ adena: a });
  await recordRound(roundArgs({ gas: 1000, price: 0.001 }));
  const tx = calls.find((c) => c.name === "DoContract")!.args[0] as { gasWanted: number; gasFee: number };
  assert.equal(tx.gasWanted, 1000);
  assert.equal(tx.gasFee, 2); // ceil(1000 * 0.001 * 1.5) = ceil(1.5)
});

test("recordRound: cancelled in Adena is flagged; a refused (chain) error is not", async () => {
  const cancelled = fakeAdena({ DoContract: () => ({ status: "failure", code: 4000 }) });
  setWindow({ adena: cancelled.a });
  await assert.rejects(() => recordRound(roundArgs()), (e: unknown) => {
    assert.ok(e instanceof Error);
    assert.match(e.message, /Cancelled in Adena — nothing was sent\./);
    assert.equal((e as SendError).cancelled, true);
    return true;
  });

  const refused = fakeAdena({ DoContract: () => ({ status: "failure", data: { error: { message: "golf: hole not found" } } }) });
  setWindow({ adena: refused.a });
  await assert.rejects(() => recordRound(roundArgs()), (e: unknown) => {
    assert.ok(e instanceof Error);
    assert.match(e.message, /golf: hole not found/);
    assert.equal((e as SendError).cancelled, false);
    return true;
  });
});

// -------------------------------------------------------------------- why()
// why() is not exported; every one of its branches is reachable through a
// failed DoContract (recordRound is used as the vehicle here).
test("why(): every status code and refusal shape reads out in words", async () => {
  const cases: { res: Res; expect: RegExp }[] = [
    { res: { status: "failure", code: 2000 }, expect: /Adena is locked\. Unlock it and try again\./ },
    { res: { status: "failure", code: 1001 }, expect: /already open/ },
    { res: { status: "failure", code: 1000 }, expect: /not connected to this page yet/ },
    { res: { status: "failure", data: { error: "golf: too far" } }, expect: /golf: too far$/ },
    { res: { status: "failure", data: { log: "panic: golf: bad hole" } }, expect: /panic: golf: bad hole$/ },
    { res: { status: "failure", message: "custom message" }, expect: /custom message$/ },
    { res: { status: "failure" }, expect: /The transaction was not sent\.$/ },
  ];
  for (const { res, expect } of cases) {
    const { a } = fakeAdena({ DoContract: () => res });
    setWindow({ adena: a });
    await assert.rejects(() => recordRound(roundArgs()), expect, JSON.stringify(res));
  }
});

test("why(): an error of null falls back to the chain's log, not a TypeError", async () => {
  // typeof null is "object": why() must not read .message on it
  const { a } = fakeAdena({ DoContract: () => ({ status: "failure", data: { error: null, log: "chain boom" } }) });
  setWindow({ adena: a });
  await assert.rejects(() => recordRound(roundArgs()), (e: Error) => e.message === "chain boom");
});

// ------------------------------------------------------ calls(), registerName, claimRounds
test("registerName: Register then Claim in one transaction, gas = REGISTER_GAS + CLAIM_GAS", async () => {
  const { a, calls } = fakeAdena();
  setWindow({ adena: a });
  await registerName({ address: ADDR, registrar: "gno.land/r/sys/namereg/v1", realm: REALM, name: "nym", rpc: RPC, chainId: CHAIN });
  const tx = calls.find((c) => c.name === "DoContract")!.args[0] as { messages: { value: { pkg_path: string; func: string; args: string[] } }[]; gasWanted: number };
  assert.deepEqual(
    tx.messages.map((m) => [m.value.pkg_path, m.value.func, m.value.args]),
    [["gno.land/r/sys/namereg/v1", "Register", ["nym"]], [REALM, "Claim", []]],
  );
  assert.equal(tx.gasWanted, 60_000_000 + 90_000_000);
});

test("registerName: refused names the default failure", async () => {
  const { a } = fakeAdena({ DoContract: () => ({ status: "failure" }) });
  setWindow({ adena: a });
  await assert.rejects(
    () => registerName({ address: ADDR, registrar: "gno.land/r/sys/namereg/v1", realm: REALM, name: "nym", rpc: RPC, chainId: CHAIN }),
    /The name was not registered\./,
  );
});

test("claimRounds: Claim alone, gas = CLAIM_GAS, and runs ensureNetwork like any other call()", async () => {
  const { a, calls } = fakeAdena({ hasGetNetwork: true, GetNetwork: () => ({ status: "success", data: { chainId: CHAIN, rpcUrl: RPC } }) });
  setWindow({ adena: a });
  await claimRounds({ address: ADDR, realm: REALM, rpc: RPC, chainId: CHAIN });
  const tx = calls.find((c) => c.name === "DoContract")!.args[0] as { messages: { value: { pkg_path: string; func: string; args: string[] } }[]; gasWanted: number };
  assert.deepEqual(tx.messages.map((m) => [m.value.pkg_path, m.value.func, m.value.args]), [[REALM, "Claim", []]]);
  assert.equal(tx.gasWanted, 90_000_000);
  assert.ok(calls.some((c) => c.name === "GetNetwork"));
});

test("claimRounds: refused names its own default failure, and cancellation is flagged", async () => {
  const { a } = fakeAdena({ DoContract: () => ({ status: "failure" }) });
  setWindow({ adena: a });
  await assert.rejects(() => claimRounds({ address: ADDR, realm: REALM, rpc: RPC, chainId: CHAIN }), (e: unknown) => {
    assert.ok(e instanceof Error);
    assert.match(e.message, /Your rounds were not ranked\./);
    assert.equal((e as SendError).cancelled, false);
    return true;
  });

  const cancelled = fakeAdena({ DoContract: () => ({ status: "failure", code: 4000 }) });
  setWindow({ adena: cancelled.a });
  await assert.rejects(() => claimRounds({ address: ADDR, realm: REALM, rpc: RPC, chainId: CHAIN }), (e: unknown) => {
    assert.equal((e as SendError).cancelled, true);
    return true;
  });
});

// -------------------------------------------------------------------- gnokeyPlan
test("gnokeyPlan: an empty, period-less-pro, or badly-shaped round is nothing to run", () => {
  assert.deepEqual(gnokeyPlan({ id: "garden/7", shots: [] }, { realm: REALM, rpc: RPC, chainId: CHAIN }), []);
  assert.deepEqual(gnokeyPlan({ id: "beach/2", shots: ["1,1"], period: null, roundMode: "pro" }, { realm: REALM, rpc: RPC, chainId: CHAIN }), []);
  assert.deepEqual(gnokeyPlan({ id: "garden/7", shots: ["1,1"], period: 1.5 }, { realm: REALM, rpc: RPC, chainId: CHAIN }), []);
  assert.deepEqual(gnokeyPlan({ id: "garden/7", shots: ["1,1"], period: Number.MAX_SAFE_INTEGER + 1 }, { realm: REALM, rpc: RPC, chainId: CHAIN }), []);
  assert.deepEqual(gnokeyPlan({ id: "bad id!", shots: ["1,1"], period: 1 }, { realm: REALM, rpc: RPC, chainId: CHAIN }), []);
});

test("gnokeyPlan: one commit — Reset + PlayRoundAt, the gas/fee command, and no 'part' numbering", () => {
  const plan = gnokeyPlan(
    { id: "garden/7", name: "My Round", shots: ["1,1", "2,2"], period: 5, roundMode: "assisted", pts: [10, 10], walls: 0, pieces: 0, official: true },
    { realm: REALM, price: 0.001, chainId: CHAIN, rpc: RPC },
  );
  assert.equal(plan.length, 1);
  const [{ file, script, command }] = plan;
  assert.equal(file, "gnogolf-save.gno");
  assert.ok(script.includes(`import "${REALM}"`));
  assert.ok(script.includes('golf.Reset(cross(cur), "garden/7")'));
  assert.ok(script.includes('println(golf.PlayRoundAt(cross(cur), "garden/7", "1,1;2,2", 5))'));
  assert.ok(!script.includes("part "));
  // gasOf(30M PER_CALL + 2*22M shots) + RUN_EXTRA(20M) = 94M, official: no DECODE_MAX
  assert.equal(command, `gnokey maketx run -gas-fee 141000ugnot -gas-wanted 94000000 -broadcast -chainid ${CHAIN} -remote ${RPC} <your-key-name> gnogolf-save.gno`);
});

test("gnokeyPlan: several commits are numbered, only the first Resets, and only the last omits a trailing arg", () => {
  const plan = gnokeyPlan(
    { id: "garden/7", shots: ["1,1", "2,2", "3,3"], period: 5, roundMode: "assisted" }, // pts omitted: heaviest possible, forces a 2-way split
    { realm: REALM, price: 0.001, chainId: CHAIN, rpc: RPC },
  );
  assert.equal(plan.length, 2);
  assert.equal(plan[0].file, "gnogolf-save-1.gno");
  assert.equal(plan[1].file, "gnogolf-save-2.gno");
  assert.ok(plan[0].script.includes("part 1 of 2"));
  assert.ok(plan[0].script.includes("golf.Reset(cross(cur)"));
  assert.ok(plan[1].script.includes("part 2 of 2"));
  assert.ok(!plan[1].script.includes("golf.Reset(cross(cur)"));
  assert.match(plan[0].command, /-gas-wanted 1298800000 /);
  assert.match(plan[1].command, /-gas-wanted 674400000 /);
});

test("gnokeyPlan: an explicit `parts` overrides the natural commitsOf split", () => {
  const plan = gnokeyPlan(
    { id: "garden/7", shots: ["1,1", "2,2", "3,3"], period: 5, pts: [10, 10, 10] }, // would naturally be one commit
    { realm: REALM, price: 0.001, chainId: CHAIN, rpc: RPC, parts: [[0, 1], [1, 3]] },
  );
  assert.equal(plan.length, 2);
  assert.ok(plan[0].script.includes("strokes 1-1"));
  assert.ok(plan[1].script.includes("strokes 2-3"));
});

test("gnokeyPlan: mode=pro with a period plays PlayRoundPro; period=null and mode=assisted plays PlayRound with no extra arg", () => {
  const pro = gnokeyPlan({ id: "beach/2", shots: ["1,1"], period: 9, roundMode: "pro", pts: [10] }, { realm: REALM, chainId: CHAIN, rpc: RPC });
  assert.ok(pro[0].script.includes('golf.PlayRoundPro(cross(cur), "beach/2", "1,1", 9)'));

  const noPeriod = gnokeyPlan({ id: "beach/2", shots: ["1,1"], period: null, roundMode: "assisted", pts: [10] }, { realm: REALM, chainId: CHAIN, rpc: RPC });
  assert.ok(noPeriod[0].script.includes('golf.PlayRound(cross(cur), "beach/2", "1,1")'));
});

test("gnokeyPlan: a community hole (official: false) asks DECODE_MAX more gas than the same round official", () => {
  const s = { id: "garden/7", shots: ["1,1", "2,2"], period: 5, pts: [10, 10] };
  const off = gnokeyPlan({ ...s, official: true }, { realm: REALM, price: 0.001, chainId: CHAIN, rpc: RPC });
  const comm = gnokeyPlan({ ...s, official: false }, { realm: REALM, price: 0.001, chainId: CHAIN, rpc: RPC });
  const gasOfCmd = (c: string) => Number(/-gas-wanted (\d+)/.exec(c)![1]);
  assert.equal(gasOfCmd(comm[0].command) - gasOfCmd(off[0].command), 115_000_000);
  // the realm's own figure said (Weather() "gas"): it holds the decoding already
  const said = gnokeyPlan({ ...s, official: false, fixed: 40_000_000 }, { realm: REALM, price: 0.001, chainId: CHAIN, rpc: RPC });
  assert.equal(gasOfCmd(said[0].command) - gasOfCmd(off[0].command), 40_000_000);
});

test("gnokeyPlan: an invalid chain id or rpc falls back to a placeholder in the command", () => {
  const plan = gnokeyPlan({ id: "garden/7", shots: ["1,1"], period: 1, pts: [10] }, { realm: REALM, chainId: "bad id!", rpc: "not-a-url" });
  assert.match(plan[0].command, /-chainid <chain-id> -remote <rpc-url>/);
});

test("gnokeyPlan: the title strips non-ASCII and is cut to 60 characters", () => {
  const name = "café \u{1F3CC} " + "x".repeat(60);
  const plan = gnokeyPlan({ id: "garden/7", name, shots: ["1,1"], period: 1, pts: [10] }, { realm: REALM, chainId: CHAIN, rpc: RPC });
  const title = name.replace(/[^\x20-\x7e]/g, "").slice(0, 60); // mirrors lib/adena.ts:414
  assert.ok(plan[0].script.startsWith(`// Gnogolf: ${title},`));
});

// ------------------------------------------------------- depositBytes/shortOf/costOf
test("depositBytes: later saves are cheap; a first finish is dearer still on the whole course", () => {
  assert.equal(depositBytes(false), 300);
  assert.equal(depositBytes(true), 3600);
  assert.equal(depositBytes(true, true), 6000);
});

test("shortOf: null balance is unknown; enough balance is 0 short; otherwise the gap in GNOT", () => {
  assert.equal(shortOf(1000, 0.001, 3600, null), null);
  assert.equal(shortOf(1000, 0.001, 3600, undefined), null);
  assert.equal(shortOf(1000, 0.001, 3600, 1_000_000), 0); // fee(2) + deposit(3600) well under a whole GNOT
  assert.equal(shortOf(1000, 0.001, 3600, 1000), (2 + 3600 - 1000) / 1e6);
});

test("costOf: gas at today's price, in GNOT to three decimals", () => {
  assert.equal(costOf(1_000_000_000, 0.001), "1.000");
  assert.equal(costOf(1_000_000_000), "1.000"); // default price 0.001
  assert.equal(costOf(500_000_000, 0.002), "1.000");
});
