// lib/chain.ts talks to no real node here: every test answers its own
// fetch, in the shapes Tendermint's abci_query and /status actually send.
// See lib/chain.ts's own comments for what each reply must look like.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  makeChain, errorKind, isAddress, isHoleId, safeEndpoint, pullShot, shotOf, RULES, REALM_PATH, DEFAULT_RPC,
} from "../lib/chain.ts";

// ------------------------------------------------------------ the wire
// What a Tendermint node answers, built by hand: no fixture files, since
// each reply's shape is a one-liner and the tests read better inline.

// an ABCI reply the VM answered cleanly: bytes as base64, UTF-8 underneath
const okReply = (data: string) => ({ result: { response: { ResponseBase: { Data: Buffer.from(data, "utf8").toString("base64") } } } });
// an ABCI reply the VM refused: Error set, Log carries the realm's own sentence (or a Go panic)
const refusedReply = (log: string) => ({ result: { response: { ResponseBase: { Error: {}, Log: log } } } });
// a reply with no ResponseBase at all — the node answered, but not usefully
const noResponseReply = () => ({ result: { response: {} } });
// a JSON-RPC-level error, distinct from a VM refusal
const rpcErrorReply = (message: string) => ({ error: { message } });
// /status's own shape (not an abci_query reply)
const statusReply = (network: string, latestBlockTime: string) => ({ result: { node_info: { network }, sync_info: { latest_block_time: latestBlockTime } } });
// the VM's own print of a typed string result: ("<text>" string)
const vmStr = (text: string) => `(${JSON.stringify(text)} string)`;
// qeval's reply: the realm's JSON object, wrapped as the VM prints a string
const qevalReply = (obj: unknown) => okReply(vmStr(JSON.stringify(obj)));
// qstr's reply: a plain string, wrapped once
const strReply = (text: string) => okReply(vmStr(text));
// a typed non-string print: Period()'s "(300 int64)", IsNameTaken's "(true bool)"
const rawReply = (text: string) => okReply(text);

// path=%22vm/qeval%22&data=0x… → the realm.expr that was actually asked, and
// the plain path for a raw abci() read (auth/gasprice, bank/balances/…)
function decoded(url: string) {
  const u = new URL(url);
  const path = (u.searchParams.get("path") || "").replace(/^"|"$/g, "");
  const hex = (u.searchParams.get("data") || "").replace(/^0x/, "");
  const expr = hex ? Buffer.from(hex, "hex").toString("utf8") : "";
  return { path, expr };
}

type Handler = (url: string, init: { signal?: AbortSignal }) => unknown;
// stands in for fetch: a handler returns the JSON-RPC body, or { __status }
// for a non-ok HTTP reply, or it can throw/reject to fake a dead node
function setFetch(handler: Handler) {
  globalThis.fetch = (async (input: unknown, init?: { signal?: AbortSignal }) => {
    const body = await handler(String(input), init ?? {});
    if (body && typeof body === "object" && "__status" in body) {
      return { ok: false, status: (body as { __status: number }).__status, json: () => Promise.resolve({}) };
    }
    return { ok: true, status: 200, json: () => Promise.resolve(body) };
  }) as typeof fetch;
}

// AbortSignal.reason is typed any; a test always aborts with an Error, but say so plainly
const reasonOf = (signal?: AbortSignal): Error => (signal?.reason instanceof Error ? signal.reason : new Error(String(signal?.reason)));

beforeEach(() => {
  sessionStorage.clear();
  // a test that forgets to mock fetch fails loudly instead of hanging
  setFetch(() => { throw new Error("test forgot to set up fetch"); });
});

const ADDR1 = "g1" + "a".repeat(38);
const ADDR2 = "g1" + "b".repeat(38);

// ------------------------------------------------------------ replies, in the shapes checks.* expects
const HOLES_REPLY = { version: 1, play: "garden/1", successor: "", holes: [{ id: "garden/1" }, { id: "garden/2" }] };
const STATE_REPLY = { version: 1, hole: "garden/1", board: { w: 10, h: 10 }, start: [0, 0], cup: [5, 5], walls: [], posts: [], zones: [] };
const SIM_FROM_REPLY = { version: 1, path: [[0, 0], [1, 1]], rest: [1, 1], air: "n", cause: "x", holed: true, bounces: 1 };
const SIM_ROUND_REPLY = { version: 1, strokes: 3, period: 7, path: [[0, 0], [2, 2]], rest: [2, 2], air: "n", cause: "x", holed: false, bounces: 0 };
const WEATHER_REPLY = { version: 1, zones: [] };
const EXTRAS_REPLY = { version: 1, walls: [], posts: [], zones: [] };
const BOARD_REPLY = { mode: "assisted", holes: 4, rows: [{ player: ADDR1, strokes: 12, holes: 4 }] };
const BESTS_REPLY = { hole: "garden/1", mode: "assisted", par: 3, rows: [{ player: ADDR1, strokes: 3 }] };
const HOLE_BOARD_REPLY = { hole: "garden/1", mode: "assisted", par: 3, players: 9, finished: 8, offset: 0, next: 0, rows: [{ player: ADDR1, strokes: 3 }] };
const RECORDS_REPLY = { rows: [{ player: ADDR1, strokes: 3 }], next: "" };
const PLAYERS_REPLY = { rows: [{ player: ADDR1, strokes: 3, holes: 1 }], next: "" };
const COURSE_BOARD_REPLY = { mode: "assisted", holes: 4, players: 20, offset: 0, next: 0, rows: [{ player: ADDR1, strokes: 12, holes: 4 }] };
const HOLE_RANK_REPLY = { mode: "assisted", hole: "garden/1", player: ADDR1, rank: 1, of: 9, strokes: 3 };
const RANK_REPLY = { mode: "assisted", player: ADDR1, rank: 2, of: 20, holes: 4, strokes: 12 };
const ROUND_REPLY = {
  version: 1, player: ADDR1, shots: "0.0000,1.0000", air: "n", cause: "x", done: true, mode: "assisted", strokes: 2, period: 7,
  path: [[0, 0]], rest: [0, 0], ball: [0, 0],
};

// ------------------------------------------------------------ pure helpers, no network
test("errorKind reads a ChainError's tag, undefined for anything else", () => {
  const tagged = Object.assign(new Error("x"), { kind: "down" as const });
  assert.equal(errorKind(tagged), "down");
  assert.equal(errorKind(new Error("plain")), undefined);
  assert.equal(errorKind("not an error"), undefined);
});

test("isAddress accepts only a lowercase g1-bech32 address", () => {
  assert.equal(isAddress(ADDR1), true);
  assert.equal(isAddress(ADDR1.toUpperCase()), false);
  assert.equal(isAddress(ADDR1.slice(0, -1)), false); // one char short
  assert.equal(isAddress(123), false);
});

test("isHoleId accepts a realm path, a course slot (and its version), a community hole", () => {
  assert.equal(isHoleId("gno.land/r/gnogolf/golf"), true); // a package path
  assert.equal(isHoleId("garden/1"), true); // a course slot
  assert.equal(isHoleId("garden/1/v2"), true); // an archived version of it
  assert.equal(isHoleId(`${ADDR1}/my-hole`), true); // a community hole
  assert.equal(isHoleId("garden/0"), false); // slots start at 1
  assert.equal(isHoleId("garden"), false); // no slot number at all
  assert.equal(isHoleId(""), false);
});

test("safeEndpoint keeps a local http(s) override, or gno.land's own https, and falls back otherwise", () => {
  assert.equal(safeEndpoint(null, DEFAULT_RPC), DEFAULT_RPC);
  assert.equal(safeEndpoint(undefined, DEFAULT_RPC), DEFAULT_RPC);
  assert.equal(safeEndpoint("http://127.0.0.1:36657", DEFAULT_RPC), "http://127.0.0.1:36657");
  assert.equal(safeEndpoint("https://rpc.gno.land/", DEFAULT_RPC), "https://rpc.gno.land"); // trailing slash stripped
  assert.equal(safeEndpoint("http://rpc.gno.land", DEFAULT_RPC), DEFAULT_RPC); // gno.land, but not https
  assert.equal(safeEndpoint("https://evil.example.com", DEFAULT_RPC), DEFAULT_RPC); // not allowlisted
  assert.equal(safeEndpoint("not a url", DEFAULT_RPC), DEFAULT_RPC);
  // a public build on a public address keeps its own chain, whatever the link says
  assert.equal(safeEndpoint("https://rpc.gno.land", DEFAULT_RPC, true), DEFAULT_RPC);
  assert.equal(safeEndpoint("http://127.0.0.1:36657", DEFAULT_RPC, true), DEFAULT_RPC);
});

test("pullShot rounds power to maxPower and wraps the angle into [0, 360)", () => {
  const rest = pullShot(0, 800, 600, 0);
  assert.equal(rest.deg, 0);
  assert.equal(rest.power, 0);
  const full = pullShot(10000, 800, 600, 0); // any pull past the full-power radius clamps
  assert.equal(full.power, RULES.maxPower);
  const wrapped = pullShot(0, 800, 600, -Math.PI / 180); // -1 degree wraps to 359
  assert.equal(wrapped.deg, 359);
});

test("shotOf writes angle,power to four decimals, and an optional tick", () => {
  assert.equal(shotOf(45, 5), "45.0000,5.0000");
  assert.equal(shotOf(45, 5, 3), "45.0000,5.0000,3");
  assert.equal(shotOf(45, 5, null), "45.0000,5.0000"); // no tick when null
});

test("RULES mirrors golf.gno's own constants (a regression guard for scripts/selfcheck.ts's drift check)", () => {
  assert.equal(RULES.maxShots, 12);
  assert.equal(RULES.maxRoundStrokes, 60);
  assert.equal(RULES.work.budget, 1.4e9);
});

test("REALM_PATH is the hub's gnoweb path (NEXT_PUBLIC_REALM is unset here, so the default realm)", () => {
  assert.equal(REALM_PATH, "/r/gnogolf/golf");
});

// ------------------------------------------------------------ makeChain: params, clock, links
test("gasPrice divides price by gas", async () => {
  const chain = makeChain();
  setFetch((url) => {
    assert.equal(decoded(url).path, "auth/gasprice");
    return okReply(JSON.stringify({ price: "1000ugnot", gas: 1000000 }));
  });
  assert.equal(await chain.gasPrice(), 0.001);
});

test("an unreadable gas price is the chain's answer refused, tagged like every other", async () => {
  const chain = makeChain();
  setFetch(() => okReply("not json"));
  await assert.rejects(chain.gasPrice(), (e) => {
    assert.equal(errorKind(e), "chain");
    assert.match((e as Error).message, /gas price could not be read/);
    return true;
  });
});

test("storagePrice parses the vm param", async () => {
  const chain = makeChain();
  setFetch((url) => {
    assert.equal(decoded(url).path, "params/vm:p:storage_price");
    return okReply(JSON.stringify("100ugnot"));
  });
  assert.equal(await chain.storagePrice(), 100);
});

test("storagePrice defaults to 100 when the reply doesn't match, instead of throwing", async () => {
  const chain = makeChain();
  setFetch(() => okReply(JSON.stringify("garbage")));
  assert.equal(await chain.storagePrice(), 100);
});

test("balance reads ugnot out of the coin string", async () => {
  const chain = makeChain();
  setFetch((url) => {
    assert.equal(decoded(url).path, `bank/balances/${encodeURIComponent(ADDR1)}`);
    return okReply(JSON.stringify(["1000000ugnot"]));
  });
  assert.equal(await chain.balance(ADDR1), 1000000);
});

test("balance is 0 for an account the chain has never seen (an empty reply, not an error)", async () => {
  const chain = makeChain();
  setFetch(() => okReply(""));
  assert.equal(await chain.balance(ADDR1), 0);
});

test("balance is null, not a thrown error, when the reply can't be read", async () => {
  const chain = makeChain();
  setFetch(() => okReply("not json"));
  assert.equal(await chain.balance(ADDR1), null);
});

test("chainId, now and sync follow the node's clock skew", async () => {
  const chain = makeChain();
  const blockTime = new Date(Date.now() + 5000).toISOString(); // five seconds ahead of this device
  setFetch((url) => {
    assert.ok(url.endsWith("/status"));
    return statusReply("dev", blockTime);
  });
  assert.equal(await chain.chainId(), "dev");
  const before = Date.now();
  const skew = await chain.sync();
  assert.ok(skew > 4000 && skew < 6000, `skew ${skew} should be roughly 5000`);
  assert.ok(Math.abs(chain.now() - (before + 5000)) < 1000);
});

test("roundURL links a named player's round on a hole, # for a bad hole id or address", () => {
  const chain = makeChain();
  assert.equal(chain.roundURL("garden/1", ADDR1), new URL(`${REALM_PATH}:garden/1/${ADDR1}`, chain.web + "/").href);
  assert.equal(chain.roundURL("not a hole!", ADDR1), "#");
  assert.equal(chain.userURL(ADDR1), new URL(`/u/${ADDR1}`, chain.web + "/").href);
  assert.equal(chain.userURL("javascript:alert(1)"), "#");
  assert.equal(chain.roundURL("garden/1", "not-an-address"), "#");
});

test("sourceURL: a package hole's gnoweb source, a data hole's data page, # otherwise", () => {
  const chain = makeChain();
  assert.equal(chain.sourceURL("gno.land/r/gnogolf/golf"), new URL("/r/gnogolf/golf$source", chain.web + "/").href);
  assert.equal(chain.sourceURL("garden/1"), new URL(`${REALM_PATH}:garden/1/data`, chain.web + "/").href);
  assert.equal(chain.sourceURL("not a hole"), "#");
  assert.equal(chain.sourceURL(null), "#");
});

// ------------------------------------------------------------ holes(): the sessionStorage cache
test("holes() fetches and caches the list under a per-rpc, per-realm key", async () => {
  const chain = makeChain();
  let calls = 0;
  setFetch(() => { calls++; return qevalReply(HOLES_REPLY); });
  const list = await chain.holes();
  assert.equal(calls, 1);
  assert.deepEqual(list.map((h) => h.id), ["garden/1", "garden/2"]);
  const key = `gnogolf.holes|${chain.rpc}|${chain.realm}`;
  const cached = JSON.parse(sessionStorage.getItem(key) as string) as { list: unknown[] };
  assert.equal(cached.list.length, 2);
});

test("holes() reuses a fresh cache without touching the network", async () => {
  const chain = makeChain();
  const key = `gnogolf.holes|${chain.rpc}|${chain.realm}`;
  sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), list: [{ id: "garden/1" }] }));
  setFetch(() => { throw new Error("should not be called"); });
  assert.deepEqual(await chain.holes(), [{ id: "garden/1" }]);
});

test("holes() ignores an expired cache and re-fetches", async () => {
  const chain = makeChain();
  const key = `gnogolf.holes|${chain.rpc}|${chain.realm}`;
  sessionStorage.setItem(key, JSON.stringify({ at: Date.now() - 11 * 60e3, list: [{ id: "stale" }] })); // past HOLES_TTL
  setFetch(() => qevalReply(HOLES_REPLY));
  assert.equal((await chain.holes()).length, 2);
});

test("holes() ignores a corrupted cache entry and re-fetches", async () => {
  const chain = makeChain();
  sessionStorage.setItem(`gnogolf.holes|${chain.rpc}|${chain.realm}`, "{not json");
  setFetch(() => qevalReply(HOLES_REPLY));
  assert.equal((await chain.holes()).length, 2);
});

test("holes() ignores a cached empty list — a hole registered meanwhile must still show", async () => {
  const chain = makeChain();
  sessionStorage.setItem(`gnogolf.holes|${chain.rpc}|${chain.realm}`, JSON.stringify({ at: Date.now(), list: [] }));
  setFetch(() => qevalReply(HOLES_REPLY));
  assert.equal((await chain.holes()).length, 2);
});

test("holes(true) bypasses a valid cache", async () => {
  const chain = makeChain();
  const key = `gnogolf.holes|${chain.rpc}|${chain.realm}`;
  sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), list: [{ id: "garden/1" }] }));
  let calls = 0;
  setFetch(() => { calls++; return qevalReply(HOLES_REPLY); });
  const list = await chain.holes(true);
  assert.equal(calls, 1);
  assert.equal(list.length, 2);
});

// ------------------------------------------------------------ reads validated by checks.*
test("state reads one hole's geometry", async () => {
  const chain = makeChain();
  setFetch((url) => {
    assert.ok(decoded(url).expr.includes('HoleState("garden/1")'));
    return qevalReply(STATE_REPLY);
  });
  assert.equal((await chain.state("garden/1")).hole, "garden/1");
});

test("state refuses a reply missing a required field", async () => {
  const chain = makeChain();
  setFetch(() => qevalReply({ ...STATE_REPLY, cup: undefined }));
  await assert.rejects(chain.state("garden/1"), (e) => errorKind(e) === "chain");
});

test("simulateFrom returns one stroke's flight", async () => {
  const chain = makeChain();
  setFetch(() => qevalReply(SIM_FROM_REPLY));
  assert.equal((await chain.simulateFrom("garden/1", [0, 0], "0,1", 0, 1)).holed, true);
});

test("simulateFrom refuses an empty path with the engine's own sentence, not a generic one", async () => {
  const chain = makeChain();
  setFetch(() => qevalReply({ ...SIM_FROM_REPLY, path: [] }));
  await assert.rejects(chain.simulateFrom("garden/1", [0, 0], "0,1", 0, 1), /answered without a path/);
});

test("simulateFrom rejects with the caller's own reason when its signal aborts first (not wrapped as 'down')", async () => {
  const chain = makeChain();
  setFetch((_url, init) => new Promise((_resolve, reject) => {
    init.signal?.addEventListener("abort", () => reject(reasonOf(init.signal)));
  }));
  const ac = new AbortController();
  const p = chain.simulateFrom("garden/1", [0, 0], "0,1", 0, 1, 5000, ac.signal);
  setTimeout(() => ac.abort(new Error("stale preview")), 10);
  await assert.rejects(p, (e) => {
    assert.equal((e as Error).message, "stale preview");
    assert.equal(errorKind(e), undefined); // the caller's own reason, not a ChainError
    return true;
  });
});

test("a stroke read that the node never answers times out and is tagged 'down'", async () => {
  const chain = makeChain();
  setFetch((_url, init) => new Promise((_resolve, reject) => {
    init.signal?.addEventListener("abort", () => reject(reasonOf(init.signal)));
  }));
  // ms is small; the node hangs, so the internal timeout fires it — twice, since query() retries a "down" once
  await assert.rejects(chain.simulateFrom("garden/1", [0, 0], "0,1", 0, 1, 30), (e) => errorKind(e) === "down");
});

test("simulateRound: no period asks SimulateRound, a period asks SimulateRoundAt", async () => {
  const chain = makeChain();
  const seen: string[] = [];
  setFetch((url) => { seen.push(decoded(url).expr); return qevalReply(SIM_ROUND_REPLY); });
  await chain.simulateRound("garden/1", ["0,1"], null);
  await chain.simulateRound("garden/1", ["0,1"], 3);
  assert.ok(seen[0].includes("SimulateRound(") && !seen[0].includes("SimulateRoundAt("));
  assert.ok(seen[1].includes("SimulateRoundAt("));
});

test("replayRound reads a recorded round replayed in its own weather", async () => {
  const chain = makeChain();
  setFetch((url) => {
    assert.ok(decoded(url).expr.includes("SimulateRoundIn("));
    return qevalReply(SIM_ROUND_REPLY);
  });
  assert.equal((await chain.replayRound("garden/1", ["0,1"], 3)).strokes, 3);
});

test("simulateCommit previews the next commit from an exact ball", async () => {
  const chain = makeChain();
  setFetch((url) => {
    assert.ok(decoded(url).expr.includes("SimulateCommit("));
    return qevalReply(SIM_ROUND_REPLY);
  });
  assert.equal((await chain.simulateCommit("garden/1", [1, 1], 2, ["0,1"], 3)).period, 7);
});

test("period reads the chain's int64 clock tick, and rejects a reply that isn't one", async () => {
  const chain = makeChain();
  setFetch((url) => { assert.equal(decoded(url).expr, "gno.land/r/gnogolf/golf.Period()"); return rawReply("(42 int64)"); });
  assert.equal(await chain.period(), 42);

  setFetch(() => rawReply("(oops)"));
  await assert.rejects(chain.period(), (e) => {
    assert.match((e as Error).message, /period is not a number/);
    assert.equal(errorKind(e), "chain"); // refused, like the qeval family's shape failures
    return true;
  });
});

test("weather reads one hole's forecast for a period", async () => {
  const chain = makeChain();
  setFetch(() => qevalReply(WEATHER_REPLY));
  assert.deepEqual((await chain.weather("garden/1", 3)).zones, []);
});

test("extras clamps a negative stroke to 0 before asking", async () => {
  const chain = makeChain();
  setFetch((url) => {
    assert.ok(decoded(url).expr.includes('Extras("garden/1", 0)'));
    return qevalReply(EXTRAS_REPLY);
  });
  await chain.extras("garden/1", -1);
});

// ------------------------------------------------------------ boards, and the mode guard
test("leaderboard defaults to assisted mode, and normalizes anything that isn't 'pro'", async () => {
  const chain = makeChain();
  setFetch((url) => { assert.ok(decoded(url).expr.includes('Leaderboard("assisted")')); return qevalReply(BOARD_REPLY); });
  assert.equal((await chain.leaderboard()).rows[0].player, ADDR1);
  await chain.leaderboard("nonsense-mode"); // still "assisted": the handler above would throw on anything else
});

test("leaderboard sends 'pro' through unchanged", async () => {
  const chain = makeChain();
  setFetch((url) => { assert.ok(decoded(url).expr.includes('Leaderboard("pro")')); return qevalReply({ ...BOARD_REPLY, mode: "pro" }); });
  await chain.leaderboard("pro");
});

test("bests truncates a player list to 50 names before sending it", async () => {
  const chain = makeChain();
  const many = Array.from({ length: 60 }, (_, i) => `p${i}`);
  setFetch((url) => {
    const m = decoded(url).expr.match(/Bests\("garden\/1", "assisted", "([^"]*)"\)/);
    assert.ok(m);
    const sent = m[1].split(",");
    assert.equal(sent.length, 50);
    assert.equal(sent[0], "p0");
    assert.ok(!sent.includes("p50")); // the 51st and on are dropped
    return qevalReply(BESTS_REPLY);
  });
  await chain.bests("garden/1", "assisted", many);
});

test("standings reads several players across the course", async () => {
  const chain = makeChain();
  setFetch((url) => { assert.ok(decoded(url).expr.includes("Standings(")); return qevalReply(BOARD_REPLY); });
  assert.equal((await chain.standings("assisted", [ADDR1])).holes, 4);
});

test("rank reads one player's course placing", async () => {
  const chain = makeChain();
  setFetch((url) => {
    assert.ok(decoded(url).expr.includes(`Rank("assisted", address("${ADDR1}"))`));
    return qevalReply(RANK_REPLY);
  });
  assert.equal((await chain.rank("assisted", ADDR1)).rank, 2);
});

test("courseLeaderboard pages the whole course's ranking", async () => {
  const chain = makeChain();
  setFetch(() => qevalReply(COURSE_BOARD_REPLY));
  assert.equal((await chain.courseLeaderboard()).players, 20);
});

test("holeRank reads one player's place on a hole", async () => {
  const chain = makeChain();
  setFetch(() => qevalReply(HOLE_RANK_REPLY));
  assert.equal((await chain.holeRank("garden/1", "assisted", ADDR1)).rank, 1);
});

test("ghost reads a best with its round, null for none, and never asks for a bad address", async () => {
  const chain = makeChain();
  const asked: string[] = [];
  const GHOST = { version: 1, hole: "garden/1", mode: "pro", player: ADDR1, strokes: 2, period: 5912345, shots: "12.5000,6.2000,0;0.0000,1.0000,0" };
  let reply: unknown = GHOST;
  setFetch((url) => (asked.push(decoded(url).expr), qevalReply(reply)));
  assert.deepEqual(await chain.ghost("garden/1", "pro", ADDR1), GHOST);
  assert.match(asked[0], /Ghost\("garden\/1", "pro", address\("g1/);
  reply = null;
  assert.equal(await chain.ghost("garden/1", "pro", ADDR1), null);
  reply = { ...GHOST, strokes: 0 };
  await assert.rejects(chain.ghost("garden/1", "pro", ADDR1), "a best of 0 strokes is no best");
  reply = { ...GHOST, strokes: 1 };
  await assert.rejects(chain.ghost("garden/1", "pro", ADDR1), "one shot a stroke");
  reply = { ...GHOST, mode: "assisted" };
  assert.equal(await chain.ghost("garden/1", "pro", ADDR1), null, "not the mode asked for: none");
  assert.equal(await chain.ghost("garden/1", "pro", 'g1") + x'), null);
  assert.equal(asked.length, 5, "a bad address is never asked");
});

test("owner reads the realm's owner as an address, and refuses anything else", async () => {
  const chain = makeChain();
  setFetch(() => rawReply(`("${ADDR1}" .uverse.address)`));
  assert.equal(await chain.owner(), ADDR1);
  setFetch(() => rawReply(`("not an address" .uverse.address)`));
  await assert.rejects(chain.owner());
});

test("holeLeaderboard pages one hole's board", async () => {
  const chain = makeChain();
  setFetch(() => qevalReply(HOLE_BOARD_REPLY));
  assert.equal((await chain.holeLeaderboard("garden/1")).finished, 8);
});

test("records pages one hole's best-by-player list", async () => {
  const chain = makeChain();
  setFetch((url) => { assert.ok(decoded(url).expr.includes('Records("garden/1", "assisted", "", 100)')); return qevalReply(RECORDS_REPLY); });
  assert.equal((await chain.records("garden/1", "assisted")).rows[0].strokes, 3);
});

test("players pages the whole course's standings", async () => {
  const chain = makeChain();
  setFetch((url) => { assert.ok(decoded(url).expr.includes('Players("assisted", "", 100)')); return qevalReply(PLAYERS_REPLY); });
  assert.equal((await chain.players("assisted")).rows[0].holes, 1);
});

test("round reads a player's round, is null when there is none, refuses a malformed one", async () => {
  const chain = makeChain();
  setFetch(() => qevalReply(ROUND_REPLY));
  assert.equal((await chain.round("garden/1", ADDR1)).done, true);

  setFetch(() => qevalReply(null));
  assert.equal(await chain.round("garden/1", ADDR1), null); // none, or Reset since

  setFetch(() => qevalReply({ ...ROUND_REPLY, mode: undefined }));
  await assert.rejects(chain.round("garden/1", ADDR1), (e) => errorKind(e) === "chain");
});

// ------------------------------------------------------------ names: resolveName, nameOf, namesOf, nameReg, nameProblem
test("resolveName short-circuits an invalid name, no network call", async () => {
  const chain = makeChain();
  setFetch(() => { throw new Error("should not be called"); });
  assert.equal(await chain.resolveName("bad name!"), "");
});

test("resolveName resolves a registered name to its address, '' for none", async () => {
  const chain = makeChain();
  setFetch((url) => { assert.ok(decoded(url).expr.includes("gno.land/r/sys/users.func()")); return strReply(ADDR1); });
  assert.equal(await chain.resolveName("nesquimo"), ADDR1);

  setFetch(() => strReply(""));
  assert.equal(await chain.resolveName("nobody"), "");
});

test("ghostHoles: one read, only the holes asked; none for a bad address, no network call", async () => {
  const chain = makeChain();
  setFetch(() => { throw new Error("should not be called"); });
  assert.equal((await chain.ghostHoles(["garden/1/v1"], "not-an-address")).size, 0);
  setFetch((url) => { assert.ok(decoded(url).expr.includes(`BestOf(h, "pro", address("${ADDR1}"))`)); return strReply("garden/1/v1\nnot/asked\n"); });
  assert.deepEqual([...(await chain.ghostHoles(["garden/1/v1", "garden/2/v1"], ADDR1))], ["garden/1/v1"]);
});

test("nameOf short-circuits an invalid address, no network call; resolves a valid one", async () => {
  const chain = makeChain();
  setFetch(() => { throw new Error("should not be called"); });
  assert.equal(await chain.nameOf("not-an-address"), "");

  setFetch(() => strReply("nesquimo"));
  assert.equal(await chain.nameOf(ADDR1), "nesquimo");
});

test("namesOf returns [] without a network call when every address is invalid", async () => {
  const chain = makeChain();
  setFetch(() => { throw new Error("should not be called"); });
  assert.deepEqual(await chain.namesOf(["not-an-address"]), []);
});

test("namesOf resolves many addresses in one read, in order, '' for the unresolved", async () => {
  const chain = makeChain();
  setFetch((url) => {
    const { expr } = decoded(url);
    assert.ok(expr.includes(`address("${ADDR1}")`) && expr.includes(`address("${ADDR2}")`));
    return strReply("alice,,"); // ADDR1 resolves, ADDR2 doesn't; the invalid third address never went in
  });
  assert.deepEqual(await chain.namesOf([ADDR1, ADDR2, "not-an-address"]), [
    { player: ADDR1, name: "alice" },
    { player: ADDR2, name: "" },
  ]);
});

test("namesOf truncates to 100 addresses", async () => {
  const chain = makeChain();
  const many = Array.from({ length: 120 }, () => ADDR1);
  setFetch((url) => {
    const count = (decoded(url).expr.match(/address\(/g) || []).length;
    assert.equal(count, 100);
    return strReply("a,".repeat(100));
  });
  assert.equal((await chain.namesOf(many)).length, 100);
});

test("nameReg picks v1 when this chain runs it", async () => {
  const chain = makeChain();
  setFetch((url) => { assert.ok(decoded(url).expr.startsWith("gno.land/r/sys/namereg/v1.IsPaused()")); return rawReply("(false bool)"); });
  assert.equal(await chain.nameReg(), "gno.land/r/sys/namereg/v1");
});

test("nameReg falls back to v0 when v1 isn't there, '' when neither is", async () => {
  const chain = makeChain();
  setFetch((url) => (decoded(url).expr.startsWith("gno.land/r/sys/namereg/v1") ? refusedReply("panic: unknown realm") : rawReply("(false bool)")));
  assert.equal(await chain.nameReg(), "gno.land/r/sys/namereg/v0");

  setFetch(() => refusedReply("panic: unknown realm"));
  assert.equal(await makeChain().nameReg(), "");
});

// one handler for every network call nameProblem makes, tunable per test
function nameProblemFetch({ reg = "gno.land/r/sys/namereg/v1", validate = "", taken = false, canonical = false } = {}): Handler {
  return (url) => {
    const { expr } = decoded(url);
    if (expr.includes(".IsPaused()")) return expr.startsWith(reg) ? rawReply("(false bool)") : refusedReply("panic: unknown realm");
    if (expr.includes("ValidateNymFormat")) return strReply(validate);
    if (expr.includes("IsNameTaken")) return rawReply(taken ? "(true bool)" : "(false bool)");
    if (expr.includes("IsCanonicalTaken")) return rawReply(canonical ? "(true bool)" : "(false bool)");
    throw new Error("unmocked nameProblem call: " + expr);
  };
}

test("nameProblem: no registrar on this chain", async () => {
  const chain = makeChain();
  setFetch(() => refusedReply("panic: unknown realm")); // both namereg candidates fail
  assert.equal(await chain.nameProblem("nesquimo"), "This chain has no name registrar.");
});

test("nameProblem: the page's own format guard, before the registrar's", async () => {
  const chain = makeChain();
  setFetch(nameProblemFetch());
  assert.equal(await chain.nameProblem("Bad Name!"), "Lowercase letters, digits and dashes only.");
});

test("nameProblem: the registrar's own format rule, its 'namereg: ' prefix stripped", async () => {
  const chain = makeChain();
  setFetch(nameProblemFetch({ validate: "namereg: too short" }));
  assert.equal(await chain.nameProblem("ab"), "too short");
});

test("nameProblem: a name already taken, or a lookalike of one, or free", async () => {
  const chain = makeChain();
  setFetch(nameProblemFetch({ taken: true }));
  assert.equal(await chain.nameProblem("nesquimo"), "That name is taken.");

  setFetch(nameProblemFetch({ canonical: true }));
  assert.equal(await chain.nameProblem("nesqu1mo"), "Too close to a name already taken.");

  setFetch(nameProblemFetch());
  assert.equal(await chain.nameProblem("nesquimo"), "");
});

// ------------------------------------------------------------ the reply pipeline itself: refusal, unquote, down/retry
test("a VM panic's own sentence is what the page shows, not the Go trace", async () => {
  const chain = makeChain();
  setFetch(() => refusedReply("panic: golf: too many shots in one commit\ngoroutine 1 [running]:\n..."));
  await assert.rejects(chain.state("garden/1"), (e) => {
    assert.equal(errorKind(e), "chain");
    assert.equal((e as Error).message, "golf: too many shots in one commit");
    return true;
  });
});

test("a refusal without the realm's own sentence falls back to the VM's raw Error", async () => {
  const chain = makeChain();
  setFetch(() => refusedReply("")); // no "panic:", no "golf:" sentence in the log
  await assert.rejects(chain.state("garden/1"), (e) => {
    assert.equal(errorKind(e), "chain");
    assert.equal((e as Error).message, "{}");
    return true;
  });
});

test("a reply with no ResponseBase at all is 'down', not 'chain'", async () => {
  const chain = makeChain();
  setFetch(() => noResponseReply());
  await assert.rejects(chain.state("garden/1"), (e) => errorKind(e) === "down");
});

test("a JSON-RPC-level error is the node refusing the request: tagged down", async () => {
  const chain = makeChain();
  setFetch(() => rpcErrorReply("bad request"));
  await assert.rejects(chain.state("garden/1"), (e) => {
    assert.equal(errorKind(e), "down");
    assert.equal((e as Error).message, "bad request");
    return true;
  });
});

test("unquote refuses a reply that isn't a quoted string", async () => {
  const chain = makeChain();
  setFetch(() => rawReply("(5 int64)")); // resolveName expects a string-typed print
  await assert.rejects(chain.resolveName("nesquimo"), (e) => errorKind(e) === "chain" && /is not a string/.test((e as Error).message));
});

test("an empty string, as the VM prints it — ( string) — reads as \"\"", async () => {
  const chain = makeChain();
  setFetch(() => rawReply("( string)"));
  assert.equal(await chain.resolveName("nobody"), "");
  assert.equal((await chain.ghostHoles(["garden/1/v1"], ADDR1)).size, 0);
});

test("qeval refuses a string reply whose contents aren't JSON", async () => {
  const chain = makeChain();
  setFetch(() => strReply("not-json-at-all"));
  await assert.rejects(chain.state("garden/1"), (e) => errorKind(e) === "chain" && /is not JSON/.test((e as Error).message));
});

test("a not-ok HTTP reply is retried once, then succeeds", async () => {
  const chain = makeChain();
  let calls = 0;
  setFetch(() => { calls++; return calls === 1 ? { __status: 500 } : qevalReply(HOLES_REPLY); });
  const list = await chain.holes(true);
  assert.equal(calls, 2);
  assert.equal(list.length, 2);
});

test("a chain refusal is never retried, only 'down' is", async () => {
  const chain = makeChain();
  let calls = 0;
  setFetch(() => { calls++; return refusedReply("panic: golf: nope"); });
  await assert.rejects(chain.state("garden/1"));
  assert.equal(calls, 1);
});

test("a newer realm version warns once, then stays quiet", async () => {
  const chain = makeChain();
  setFetch(() => qevalReply({ ...WEATHER_REPLY, version: 2 }));
  const seen: unknown[][] = [];
  const orig = console.warn;
  console.warn = (...a: unknown[]) => { seen.push(a); };
  try {
    await chain.weather("garden/1", 1);
    await chain.weather("garden/1", 1);
  } finally {
    console.warn = orig;
  }
  assert.equal(seen.length, 1);
  assert.match(String(seen[0][0]), /version 2/);
});
