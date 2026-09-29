// Adena, the gno.land browser wallet. The page asks it two things only: who is
// playing, and to sign one round.
//
// A round is recorded as one call, PlayRound, which replays the shot list
// from the tee: a holed round is not kept on the chain (its best is), so a new
// one starts there. A round too heavy for one transaction goes in two (or
// more): the first plays the first strokes, the next continue it
// (splitRound). Only a round of the player's left under way on the chain
// needs a Reset first, in the same transaction. The chain re-runs every shot
// itself — the page sends decisions, never outcomes — so a recorded score is
// one nobody can type in.

import { RULES, isAddress, nameShape, errorKind, type Chain } from "./chain";
import { trackError } from "./analytics";
import type { HoleState, Mode, Vec2, Zone } from "./types";

/** An Adena answer: its status, and a code, a type or a message when it failed. */
interface AdenaRes<T = unknown> {
  status: string;
  type?: string;
  code?: number;
  message?: string;
  data?: T;
}
interface Network {
  chainId: string;
  rpcUrl?: string;
  rpc_url?: string;
}
// a network's RPC, under either of the names Adena gives it
const rpcOf = (n: Network) => n.rpcUrl || n.rpc_url;
/** A /vm.m_call message, as DoContract takes it. */
interface Call {
  type: "/vm.m_call";
  value: { caller: string; send: string; pkg_path: string; func: string; args: string[] };
}
/** A /bank.MsgSend message: coins from the player's account to another. */
interface Send {
  type: "/bank.MsgSend";
  value: { from_address: string; to_address: string; amount: string };
}
/** The part of Adena's injected API this page calls (docs.adena.app). */
export interface Adena {
  AddEstablish(name: string): Promise<AdenaRes>;
  GetAccount(): Promise<AdenaRes<{ address: string; chainId: string }>>;
  GetNetwork?(): Promise<AdenaRes<Network>>;
  SwitchNetwork(chainId: string): Promise<AdenaRes>;
  AddNetwork(n: { chainId: string; chainName: string; rpcUrl: string }): Promise<AdenaRes>;
  DoContract(tx: { messages: (Call | Send)[]; gasFee: number; gasWanted: number; memo: string; networkInfo?: { chainId: string; rpcUrl: string } }): Promise<AdenaRes<{ hash: string; height: number }>>;
  On?(event: "changedAccount" | "changedNetwork", fn: (...x: unknown[]) => void): void;
}
declare global {
  interface Window {
    adena?: Adena;
  }
}
/** A transaction Adena did not send; cancelled when the player said no.
 *  maybe: Adena failed without a reason that says nothing went (no refusal
 *  in the chain's words, not locked, busy or unconnected: a timeout, say),
 *  so it may have landed all the same; hash: the transaction's, when Adena
 *  gives it, by which the chain can tell. */
export interface SendError extends Error {
  cancelled?: boolean;
  maybe?: boolean;
  hash?: string;
}
/** What the work model counts for a round (the engine's snapshot has them):
 *  walls, pieces, the forecast's kind, each stroke's path length. */
interface Work {
  walls?: number;
  pieces?: number;
  kind?: string;
  pts?: readonly number[];
  /** each stroke's work (Shot.Work, the realm's SimulateFrom "work") */
  works?: readonly number[];
  /** what the realm says a commit spends before its shots (Weather() "gas"; 0 or none: not said) */
  fixed?: number;
  /** each shot's share of setting the hole's pulses up (newWork's setup: per pulse wall and post) */
  setup?: number;
}

const wallet = () => (typeof window !== "undefined" ? window.adena : undefined);

export const hasAdena = () => !!wallet();

// Adena's status codes worth telling apart (docs.adena.app, "errors")
const CANCELLED = 4000, LOCKED = 2000, BUSY = 1001, NOT_CONNECTED = 1000;

/** What went wrong, in words a player can act on (and told analytics, with Adena's code). */
function why(res: AdenaRes | null | undefined, fallback: string) {
  const said = words(res, fallback);
  trackError("adena", said, { code: res && res.code, type: res && res.type, what: fallback });
  return said;
}
// Adena's codes for a transaction that never left it
const UNSENT = [CANCELLED, LOCKED, BUSY, NOT_CONNECTED];
function words(res: AdenaRes | null | undefined, fallback: string) {
  const code = res && res.code;
  if (code === CANCELLED) return "Cancelled in Adena — nothing was sent.";
  if (code === LOCKED) return "Adena is locked. Unlock it and try again.";
  if (code === BUSY) return "An Adena window is already open. Finish or close it first.";
  if (code === NOT_CONNECTED) return "Adena is not connected to this page yet.";
  return refusal(res) || (res && res.message) || fallback;
}
/** A refused transaction: the chain's own words, where Adena passes them on ("" for none). */
function refusal(res: AdenaRes | null | undefined) {
  const d = res && (res.data as { error?: { message?: string } | string; log?: string } | undefined);
  // (typeof null is "object": an error of null falls through to the log)
  const chain = d && ((d.error && typeof d.error === "object" && d.error.message) || d.log || d.error);
  return typeof chain === "string" ? chain : "";
}

// the same address written the same way: Adena compares RPCs as strings
const norm = (u: string | null | undefined) => String(u || "").trim().replace(/\/+$/, "");

/**
 * Puts Adena on this page's chain (id and RPC), adding the network if it has
 * never seen it. Adena's approval screen waits — fee and deposit blank, Approve
 * greyed — until its active network is exactly networkInfo's, so this runs
 * before every signature. Adena refuses a second network on an RPC it already
 * knows: one left from an older chain on this node (same address, another
 * chain id) has to be removed in Adena by hand, and the error says how.
 */
async function ensureNetwork(a: Adena, { chainId, rpc, name = `gno.land (${chainId})` }: { chainId?: string | null; rpc: string; name?: string }) {
  // no chain id, no signature: Adena would sign on whatever network it has on
  if (!chainId) throw new Error("The chain's id is not known yet (is the node up?). Try again in a moment.");
  const active = async () => {
    try {
      const n = await a.GetNetwork?.();
      return n && n.data ? { id: n.data.chainId, rpc: norm(rpcOf(n.data)) } : null;
    } catch {
      return null;
    }
  };
  let now = await active();
  if (now && now.id === chainId && (!now.rpc || now.rpc === norm(rpc))) return;
  let r = await a.SwitchNetwork(chainId);
  if (r.status !== "success") {
    const add = await a.AddNetwork({ chainId, chainName: name, rpcUrl: norm(rpc) });
    if (add.status !== "success" && add.type !== "NETWORK_ALREADY_EXISTS") throw new Error(why(add, "Adena did not add the network."));
    r = await a.SwitchNetwork(chainId);
    if (r.status !== "success")
      throw new Error(
        `Adena already has a network on ${norm(rpc)} under another chain id (left from before this chain was restarted), so it cannot add “${chainId}”. ` +
          `In Adena: Settings → Change Network → remove the custom network on ${norm(rpc)}, then save again — the game adds the right one.`
      );
  }
  now = await active();
  if (now && now.rpc && now.rpc !== norm(rpc))
    throw new Error(`Adena switched to “${chainId}” but on ${now.rpc}, not ${norm(rpc)}. Edit that network's RPC in Adena to ${norm(rpc)}.`);
}

/** Connects, and moves Adena onto the chain this page plays on. */
export async function connect({ chainId, rpc, name }: { chainId?: string | null; rpc: string; name?: string }) {
  const a = wallet();
  if (!a) throw new Error("Adena is not installed in this browser.");

  const est = await a.AddEstablish("Gnogolf");
  if (est.status !== "success" && est.type !== "ALREADY_CONNECTED") throw new Error(why(est, "Adena did not connect."));
  const acc = await a.GetAccount();
  if (acc.status !== "success") throw new Error(why(acc, "Adena did not share an account."));
  // a success without an account is no account
  const data = acc.data;
  if (!data || !isAddress(data.address)) throw new Error(why(acc, "Adena did not share an account."));
  const { address } = data;
  let on = data.chainId;

  if (chainId && on !== chainId) {
    await ensureNetwork(a, { chainId, rpc, name });
    on = chainId;
  }
  return { address, chainId: on, rpcOk: await onOurNode(rpc) };
}

// Adena simulates on networkInfo's RPC, but only once its active network is
// that very network (same chain id, same RPC string): this tells whether it is.
const port = (u: string) => {
  try {
    const x = new URL(u);
    return `${x.hostname.replace("localhost", "127.0.0.1")}:${x.port || (x.protocol === "https:" ? 443 : 80)}`;
  } catch {
    return String(u);
  }
};
/** true when Adena's active network is this page's node, false when it is another, null when it cannot say. */
export async function onOurNode(rpc: string | null | undefined) {
  const a = wallet();
  if (!a || !a.GetNetwork || !rpc) return null;
  try {
    const n = await a.GetNetwork();
    const url = n && n.data && rpcOf(n.data);
    return url ? port(url) === port(rpc) : null;
  } catch {
    return null;
  }
}

/** The account Adena already shares with this page, or null — no popup: a
 *  page Adena has not established with gets an error, and stays anonymous. */
export async function current() {
  const a = wallet();
  if (!a) return null;
  try {
    const acc = await a.GetAccount();
    return acc.status === "success" && acc.data && acc.data.address ? { address: acc.data.address, chainId: acc.data.chainId } : null;
  } catch {
    return null;
  }
}

/** Follows the account and network chosen in Adena. */
// Adena has no way to take a listener back: one pair is registered for the
// page, and each subscriber is added to and removed from a set of its own
const listeners = new Set<(...x: unknown[]) => void>();
let listening = false;
export function onWalletChange(fn: (...x: unknown[]) => void) {
  const a = wallet();
  if (!a || !a.On) return () => {};
  if (!listening) {
    listening = true;
    const all = (...x: unknown[]) => listeners.forEach((f) => f(...x));
    a.On("changedAccount", all);
    a.On("changedNetwork", all);
  }
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

// A commit's work, by the realm's own model (golf.gno, work: newWork, next,
// add), computed here exactly: per shot 10M, plus 150K per wall, plus, per
// point of its path, 1.2M and 15K per piece on the board, plus its pulses'
// set-up (700K per pulse wall, 200K per pulse post: setup). c: { walls, pieces,
// pts: [path length per stroke] }, as the engine's snapshot gives them: walls
// are the hole's and its pulses', pieces every wall, post and zone of the
// hole, its pulses and the forecast, each polygon edge one more.
// (a stroke whose length is not known counts as the longest path the realm takes)
// The realm also counts a shot by the work its physics did (Shot.Work, which
// SimulateFrom says) and takes the larger, as here. A round kept from before
// it said so has no work: the realm may then cut sooner, with "commit the
// first N", and splitRound follows it.
const WORK = RULES.work;
// zones as the work model counts them: one piece each, and one per polygon edge
const piecesOf = (zs: readonly { poly?: readonly unknown[] }[]) => zs.reduce((n, z) => n + 1 + ((z.poly && z.poly.length) || 0), 0);
/** The board's walls, pieces and set-up as the work model counts them (s: the hole, none
 *  before it loads): as HoleState says them, else (a realm before it said them) the hole's
 *  own and its pulses' seen so far in the strokes' extras (seen); the forecast's zones on top. */
export function boardWork(s: HoleState | null, seen: { walls: number; posts: number; pieces: number }, weather: readonly Zone[] = []) {
  if (!s) return { walls: 0, pieces: 0, setup: 0 };
  const w = s.work || {
    walls: s.walls.length + seen.walls,
    pieces: s.walls.length + s.posts.length + piecesOf(s.zones) + seen.pieces,
    setup: seen.walls * WORK.pulseWall + seen.posts * WORK.pulsePost,
  };
  return { walls: w.walls, pieces: w.pieces + piecesOf(weather), setup: w.setup };
}
// what every shot of a commit costs before its own: the shot and the walls
const baseOf = (c: Work) => WORK.shot + (c.walls || 0) * WORK.wall;
const workOf = (c: Work, i: number) => {
  const base = baseOf(c);
  return Math.max(base + ((c.pts || [])[i] ?? RULES.maxPath) * (WORK.point + (c.pieces || 0) * WORK.piece), base + ((c.works || [])[i] || 0) * WORK.unit) + (c.setup || 0);
};

/**
 * The commits a round is recorded in: [[from, to), …], cut where the chain
 * would cut them, starting at stroke start. Its work.next refuses a shot,
 * after the first of a commit, once spent + the heaviest so far passes the
 * budget, or once the shot's own work passes what is left of the budget (less
 * its fixed gas and MaxWorkStep, in work units: the shot's cap); the list is
 * 12 at most. The same sums, so no commit of the split is one the chain refuses.
 */
export function commitsOf(c: Work, n = (c.pts || []).length, start = 0) {
  const parts: [number, number][] = [];
  const base = baseOf(c);
  let from = start, spent = 0, most = 0;
  for (let i = start; i < n; i++) {
    const cap = Math.min(RULES.maxWork, Math.trunc((WORK.budget - (c.fixed || 0) - spent - base) / WORK.unit) - RULES.maxWorkStep - Math.trunc((c.setup || 0) / WORK.unit));
    const over = cap < 1 || (cap < RULES.maxWork && ((c.works || [])[i] || 0) > cap);
    if (i > from && (i - from >= RULES.maxShots || spent + most > WORK.budget || over)) (parts.push([from, i]), (from = i), (spent = most = 0));
    const w = workOf(c, i);
    spent += w;
    most = Math.max(most, w);
  }
  if (n > from) parts.push([from, n]);
  return parts;
}

// what is asked of the account: the gas at the price, with half again for a
// price that rises between the reading and the block
const feeFor = (gasWanted: number, price: number) => Math.ceil(gasWanted * price * 1.5);
// the price asked when the chain's is not given: ugnot a gas
export const PRICE = 0.001;
// Gas asked for one commit, calibrated on gno_call simulate=true
// (docs/reviews/fix-sync-client.md): the work model already bounds the shots
// (1.2x-1.6x their measured gas); the call costs ~30M (a Reset with it too);
// what the commit spends before its shots (decoding the hole, drawing the
// forecast) is the realm's own figure (Weather() "gas"). A round without it: the forecast's
// most, rain and a storm on the heaviest course holes (town/14, island/14:
// 193M and 204M), the rest ~7M.
// Adena simulates every tx with 2e9 gas at most: the ask stays under it.
const MAX_GAS = 1_900_000_000;
const PER_CALL = 30e6;
const FORECAST: Record<string, number> = { rain: 200e6, storm: 210e6 };
/** The gas one commit of these strokes should need. c: { walls, pieces, kind (the forecast's), pts, works, fixed }. */
export function gasOf(c: Work, from = 0, to = (c.pts || []).length) {
  let g = PER_CALL + (c.fixed || FORECAST[c.kind || ""] || 0);
  for (let i = from; i < to; i++) g += workOf(c, i);
  return Math.min(Math.ceil(g), MAX_GAS);
}
/** The gas a round of n strokes should need in all: each of its commits pays its own call and fixed gas. */
export const roundGas = (c: Work, n: number) => commitsOf(c, n).reduce((g, [from, to]) => g + gasOf(c, from, to), 0);

/** Why a round the chain replays otherwise cannot be saved: where its replay ended (strokes, holed or not). */
export const replayDiffers = (strokes: number | null, holed: boolean) =>
  `The chain's replay ended differently (${strokes ?? "?"} strokes, ${holed ? "holed" : "not holed"}): this hole moves between shots. Play it again to save.`;

/**
 * The commits a round is recorded in, each checked by the chain before Adena
 * opens. Each is cut by the realm's work model (commitsOf), then asked of the
 * chain — check(list, from, ball) resolves with the chain's answer for that
 * commit (its "rest" is where the next one starts) — so every commit is one
 * the chain has already accepted as a read. If the chain cuts sooner than the
 * model, its "commit the first N" wins and the rest is split again from
 * there. Every commit must play all its shots, and only the last hole the
 * round: one holed sooner is not kept, so the next would start a new round
 * from the tee. Any other refusal throws, in words: nothing goes to Adena then.
 */
async function splitRound(shots: readonly string[], check: (list: string[], from: number, ball: Vec2 | null | undefined) => Promise<{ rest?: Vec2; holed?: boolean; strokes?: number } | null | undefined>, c: Work = {}) {
  const out: [number, number][] = [];
  for (let from = 0, ball: Vec2 | null | undefined = null; from < shots.length; ) {
    let to = commitsOf(c, shots.length, from)[0][1], r;
    try {
      r = await check(shots.slice(from, to), from, ball);
    } catch (e) {
      const m = (e instanceof Error ? e.message : String(e)).match(/commit the first (\d+)/);
      if (!m) throw e;
      const n = Number(m[1]);
      if (!(n >= 1 && n < to - from)) throw new Error("Even one shot of this round is more than one transaction can replay. It cannot be saved.");
      to = from + n;
      r = await check(shots.slice(from, to), from, ball);
    }
    // (strokes counts from the tee: a commit's shots end at stroke to, unless holed sooner)
    if (!r || r.strokes !== to || !!r.holed !== (to === shots.length)) throw new Error(replayDiffers(r ? r.strokes ?? null : null, !!(r && r.holed)));
    out.push([from, to]);
    ball = r && r.rest;
    from = to;
  }
  return out;
}

/**
 * A round's commits as the chain itself cuts them (splitRound), each one asked
 * of it: from the tee a SimulateRound(At), every next one a SimulateCommit from
 * where the one before leaves the ball. What Adena and gnokey both send.
 * ms: each read's time limit.
 */
export function chainSplit(chain: Pick<Chain, "simulateRound" | "simulateCommit">, s: SaveRound & { id: string }, period: number, ms = 8000) {
  const hole = s.id, shots = s.shots || [];
  return splitRound(shots, (list, from, ball) => (from && ball ? chain.simulateCommit(hole, ball, from, list, period, ms) : chain.simulateRound(hole, list, s.period, ms)), s);
}

// a chain without a registrar (chain.nameReg() ""): nothing is sent to an empty package path
const NO_REGISTRAR = "This chain has no name registrar: no name can be taken here.";

/**
 * Signs one commit of this round: PlayRound… from the tee for the first, or
 * where the chain has the round for the next ones. reset: a Reset first, in
 * the same transaction, for a first commit over a round of the player's left
 * under way (a holed one is not kept, and needs none). named: a gno.land name
 * taken in the same signature, before the round (Register), so it is ranked
 * as it lands, and the rounds saved before it after (Claim). Resolves with
 * the tx (hash, height).
 */
export async function recordRound({ address, realm, hole, shots, gas, period, reset = false, mode = "assisted", price = PRICE, chainId, rpc, named }: {
  address: string; realm: string; hole: string; shots: readonly string[]; gas?: number; period?: number | null; reset?: boolean; mode?: Mode; price?: number; chainId?: string | null; rpc: string;
  named?: { registrar: string; name: string } | null;
}) {
  if (named && !named.registrar) throw new Error(NO_REGISTRAR);
  // no balance gate here: Adena itself says when an account cannot pay, and
  // the page warns beforehand (shortOf) without keeping the wallet shut
  const call = (func: string, args: string[]): Call => ({
    type: "/vm.m_call",
    value: { caller: address, send: "", pkg_path: realm, func, args },
  });
  // a pro round always has its period (State gives one): never a 0 the chain refuses
  const periodArg = (p: number | null | undefined) => {
    if (p == null) throw new Error("This round has no weather period, so it cannot be saved. Play it again.");
    return String(p);
  };
  // the period the chain checked (as a whole number) is the one signed
  if (period != null && !Number.isSafeInteger(period)) throw new Error("This round's weather period is not one the chain knows. Play it again.");
  // in the weather the round was played in (its period): the chain takes
  // the current one or the one before
  return send(
    [
      ...(named ? [{ type: "/vm.m_call", value: { caller: address, send: "", pkg_path: named.registrar, func: "Register", args: [named.name] } } as Call] : []),
      ...(reset ? [call("Reset", [hole])] : []),
      // a pro round goes on the pro board (the mode is the one it was played in)
      mode === "pro"
        ? call("PlayRoundPro", [hole, shots.join(";"), periodArg(period)])
        : period == null
          ? call("PlayRound", [hole, shots.join(";")])
          : call("PlayRoundAt", [hole, shots.join(";"), String(period)]),
      ...(named ? [call("Claim", [])] : []),
    ],
    Math.min((gas || MAX_GAS) + (named ? NAME_GAS : 0), MAX_GAS),
    price, chainId, rpc, "The transaction was not sent.",
  );
}

/** One transaction from the connected account: Adena simulates it and sets the final fee (gasWanted, at price: a starting point). */
async function send(messages: (Call | Send)[], gasWanted: number, price: number, chainId: string | null | undefined, rpc: string, failed: string, memo = "gnogolf") {
  const a = wallet();
  if (!a) throw new Error("Adena is not installed in this browser.");
  await ensureNetwork(a, { chainId, rpc });
  const res = await a.DoContract({
    messages,
    gasFee: feeFor(gasWanted, price),
    gasWanted,
    memo,
    // this exact chain: id and RPC (Adena's own "dev" is another node)
    ...(chainId && rpc ? { networkInfo: { chainId, rpcUrl: norm(rpc) } } : {}),
  });
  if (res.status !== "success") {
    const e: SendError = new Error(why(res, failed));
    e.cancelled = res.code === CANCELLED;
    e.maybe = !UNSENT.some((c) => c === res.code) && !refusal(res);
    const hash = res.data && (res.data as { hash?: unknown }).hash;
    if (typeof hash === "string" && hash) e.hash = hash;
    throw e;
  }
  return res.data ?? null;
}

/** One transaction of plain calls from the connected account. */
const calls = (address: string, list: readonly (readonly [string, string, string[]])[], gasWanted: number, price: number, chainId: string | null | undefined, rpc: string, failed: string) =>
  send(list.map(([pkg_path, func, args]): Call => ({ type: "/vm.m_call", value: { caller: address, send: "", pkg_path, func, args } })), gasWanted, price, chainId, rpc, failed);

// a bank send is a few hundred thousand gas: asked with room, Adena sets the final fee
const TIP_GAS = 2_000_000;
export const TIPS = [1, 5, 10] as const; // the GNOT a tip can be
/** A tip: GNOT sent from the player's account to the game's maker (the realm's
 *  owner, read on the chain), confirmed in Adena like any send. No contract. */
export async function sendTip({ from, to, gnot, price, chainId, rpc }: { from: string; to: string; gnot: number; price: number; chainId?: string | null; rpc: string }) {
  if (!isAddress(from) || !isAddress(to) || !TIPS.some((t) => t === gnot)) throw new Error("Nothing to send.");
  return send([{ type: "/bank.MsgSend", value: { from_address: from, to_address: to, amount: `${gnot * 1e6}ugnot` } }], TIP_GAS, price, chainId, rpc, "The tip was not sent.", "gnogolf tip");
}

// golf's Claim reads the course's holes once (74 slots, two modes): measured
// well under this (54.6M on an onyx gnodev); Register was 28M to 29.5M there
const CLAIM_GAS = 90_000_000, REGISTER_GAS = 60_000_000;
/** What a name taken with a save adds to its gas: Register and Claim's. */
export const NAME_GAS = REGISTER_GAS + CLAIM_GAS;
/**
 * The bytes a name taken with a save stores: Register's (5,216 measured with
 * a Claim of 2 bests, docs/design/deploy-v1-rehearsal.md, less that Claim's
 * 1,588), and Claim's, which seats the player's unranked bests of each mode:
 * 580 and 504 a best (golf filetests: 0, 1,084, 1,588, 2,596, 4,612 bytes for
 * 0, 1, 2, 4, 8). holes: the player's bests per mode (Rank() "holes"), this
 * save's counted in.
 */
export const nameBytes = (holes: readonly number[]) => 3628 + holes.reduce((b, n) => b + (n > 0 ? 580 + 504 * n : 0), 0);

/**
 * Takes a gno.land name for the connected account, and ranks at once the
 * rounds it saved without one (golf's Claim): one transaction, two calls.
 * Register is free on onyx and mainnet (nothing is sent with it), and only
 * a direct call registers, which a message of this transaction is.
 */
export const registerName = ({ address, registrar, realm, name, price = PRICE, chainId, rpc }: {
  address: string; registrar: string; realm: string; name: string; price?: number; chainId?: string | null; rpc: string;
}) =>
  registrar
    ? calls(address, [[registrar, "Register", [name]], [realm, "Claim", []]], NAME_GAS, price, chainId, rpc, "The name was not registered.")
    : Promise.reject(new Error(NO_REGISTRAR));

/** Ranks the rounds a player saved before they had a name (golf's Claim). */
export const claimRounds = ({ address, realm, price = PRICE, chainId, rpc }: { address: string; realm: string; price?: number; chainId?: string | null; rpc: string }) =>
  calls(address, [[realm, "Claim", []]], CLAIM_GAS, price, chainId, rpc, "Your rounds were not ranked.");

// Decoding a hole's data is in each commit's gas too, in the realm's figure
// (fixed). Without it, a community hole may be as large as the format allows
// (golf.gno decodeBase + decodePerByte a byte: 115M for the largest one
// publishable), so gnokey (which, unlike Adena, does not simulate first) asks
// that much more for one.
const DECODE_MAX = 115e6;
/** A holed round as gnokeyPlan reads it: the engine's snapshot. */
interface SaveRound extends Work {
  id: string | null;
  /** one of the course's holes (false: a community hole, of any size) */
  official?: boolean;
  name?: string;
  shots?: readonly string[];
  period?: number | null;
  roundMode?: Mode | null;
}
// A gnokey paste's parts. Nothing the chain or the page's link says goes in
// unchecked: a package path is one of a realm's characters, the chain's id and
// RPC are theirs or a placeholder, and an argument is checked (or quoted) by
// the plan it is in.
const PKG_PATH = /^gno\.land\/r\/[\w/.-]+$/;
/** The end of every command: sent to this chain (its id and RPC, a placeholder for anything else), signed by <your-key-name>. */
function gnokeyOn(chainId: string | null | undefined, rpc: string) {
  const chain = chainId && /^[\w.-]{1,64}$/.test(chainId) ? chainId : "<chain-id>";
  const remote = /^https?:\/\/[\w.:[\]-]+(\/[\w./-]*)?$/.test(norm(rpc)) ? norm(rpc) : "<rpc-url>";
  return `-broadcast -chainid ${chain} -remote ${remote} <your-key-name>`;
}
/** One plain `gnokey maketx call`, at gas (its fee as Adena's ask, feeFor), on: gnokeyOn's. */
const gnokeyCall = (pkg: string, func: string, args: readonly string[], gas: number, price: number, on: string) =>
  `gnokey maketx call -pkgpath ${pkg} -func ${func}${args.map((a) => ` -args ${a}`).join("")} -gas-fee ${feeFor(gas, price)}ugnot -gas-wanted ${gas} ${on}`;

/**
 * The same save for gnokey: one plain `gnokey maketx call` per commit, the
 * call Adena would send (PlayRoundAt, PlayRoundPro, or PlayRound with no
 * period), for the player to run with their own key (<your-key-name>). It
 * starts with a Reset of its own (nothing is sent with it; with no round of
 * the player's under way it only pays its gas): a round they left unfinished
 * (a paste whose second part failed, a shot from gnoweb) would otherwise go
 * on from where it lies, or be refused in its own weather, and a paste run
 * again starts afresh from the tee. The page cannot ask the chain first: it
 * does not know the key's address. s: the engine's snapshot of a holed round
 * (id, shots, period, roundMode, and the work model's walls, pieces, kind, pts).
 */
export function gnokeyPlan(s: SaveRound, { realm, price = PRICE, chainId, rpc, parts: checked }: { realm: string; price?: number; chainId?: string | null; rpc: string; parts?: readonly (readonly [number, number])[] | null }) {
  const shots = s.shots || [], mode = s.roundMode || "assisted";
  if (!shots.length) return [];
  if (mode === "pro" && s.period == null) return []; // a pro round has its period, or it cannot be saved
  // the player pastes this into a shell: nothing the chain or the page's link
  // says goes in unchecked (a shot is digits, a sign, dots and commas)
  if (s.period != null && !Number.isSafeInteger(s.period)) return [];
  if (!/^[\w./-]{1,128}$/.test(String(s.id)) || !PKG_PATH.test(realm) || !shots.every((x) => /^[\d.,-]+$/.test(x))) return [];
  const on = gnokeyOn(chainId, rpc);
  const call = (func: string, args: readonly string[], gas: number) => gnokeyCall(realm, func, args, gas, price, on);
  // the chain's own cut when it was asked (chainSplit); the work model's otherwise
  const parts = checked && checked.length ? checked : commitsOf(s, shots.length);
  const plays = parts.map(([from, to]) => {
    // the shots are quoted: ";" ends a shell command
    const hole = String(s.id), list = `'${shots.slice(from, to).join(";")}'`, at = String(s.period);
    const gas = Math.min(gasOf(s, from, to) + (s.official === false && !s.fixed ? DECODE_MAX : 0), MAX_GAS);
    return mode === "pro" ? call("PlayRoundPro", [hole, list, at], gas)
      : s.period == null ? call("PlayRound", [hole, list], gas)
        : call("PlayRoundAt", [hole, list, at], gas);
  });
  return [call("Reset", [String(s.id)], PER_CALL), ...plays];
}

/**
 * gnokeyPlan's commands as one paste for bash or zsh, the key name (who)
 * quoted in: a subshell that stops at the first that fails. Each goes through
 * send, which prints gnokey's output as it comes (the password prompt too)
 * and sends it again a block later, the password asked again, when the node
 * refused it for the account's sequence before the one before had landed
 * ("signature verification failed", as scripts/publishdata.sh does).
 */
export function gnokeyPaste(plan: readonly string[], who: string) {
  const send = [
    "send() {",
    "  for try in 1 2 3; do",
    '    out=$("$@" 2>&1 | tee /dev/stderr)',
    "    if printf '%s\n' \"$out\" | grep -q '^OK!'; then return 0; fi",
    "    printf '%s\n' \"$out\" | grep -q 'signature verification failed' || return 1",
    '    echo "Gnogolf: the node had not taken the one before yet: sent again in a block (your password again)" >&2',
    "    sleep 6",
    "  done",
    "  return 1",
    "}",
  ].join("\n");
  const body = plan
    .map((command, k) => `echo "Gnogolf: transaction ${k + 1} of ${plan.length}"\nsend ${command.replace("<your-key-name>", () => who)}`)
    .join("\n\n");
  return `(\nset -e\n${send}\n\n${body}\n)`;
}

/** Where a gnokey paste goes: this chain (its id and RPC), at its gas price. */
interface GnokeyAt { price?: number; chainId?: string | null; rpc: string }
/**
 * A name taken with gnokey, as registerName does with Adena: Register, then
 * golf's Claim, which ranks the rounds saved before it. Two transactions
 * (gnokey sends one call each), each at its own gas; Register must be a direct
 * call, which a `maketx call` is. name: whole ("nym-…"), as the name form
 * checked it; [] for none of the registrar's shape, or no registrar.
 */
export function gnokeyName({ registrar, realm, name, price = PRICE, chainId, rpc }: GnokeyAt & { registrar: string; realm: string; name: string }) {
  if (!PKG_PATH.test(registrar) || !PKG_PATH.test(realm) || !nameShape(name)) return [];
  const on = gnokeyOn(chainId, rpc);
  return [gnokeyCall(registrar, "Register", [`'${name}'`], REGISTER_GAS, price, on), gnokeyCall(realm, "Claim", [], CLAIM_GAS, price, on)];
}
/** The rounds saved before a name ranked with gnokey, as claimRounds does with Adena (golf's Claim). */
export const gnokeyClaim = ({ realm, price = PRICE, chainId, rpc }: GnokeyAt & { realm: string }) =>
  PKG_PATH.test(realm) ? [gnokeyCall(realm, "Claim", [], CLAIM_GAS, price, gnokeyOn(chainId, rpc))] : [];
/** A tip with gnokey, as sendTip does with Adena: one plain send of gnot (one of TIPS) to the realm's owner (to, read on the chain). */
export const gnokeyTip = ({ to, gnot, price = PRICE, chainId, rpc }: GnokeyAt & { to: string; gnot: number }) =>
  isAddress(to) && TIPS.some((t) => t === gnot)
    ? [`gnokey maketx send -send ${gnot * 1e6}ugnot -to ${to} -gas-fee ${feeFor(TIP_GAS, price)}ugnot -gas-wanted ${TIP_GAS} ${gnokeyOn(chainId, rpc)}`]
    : [];

/** The strokes a save's result says its round was holed in (PlayRound's
 *  "holed in N strokes", in a transaction's result), null if it says none. */
export const holedIn = (result: string | null | undefined) => {
  const m = String(result || "").match(/holed in (\d+) strokes/);
  return m ? Number(m[1]) : null;
};

/** A transaction's result by its hash (its Data, "" for none), or null while
 *  the chain cannot say (its RPC down, the transaction not found yet); one
 *  that failed on the chain throws its log (errorKind "chain"). */
export const resultOf = (chain: Pick<Chain, "txResult">, hash: string) =>
  chain.txResult(hash).catch((e: unknown) => {
    if (errorKind(e) === "chain") throw e;
    return null;
  });

/**
 * What a save's last commit did, as the chain says it, for a round of
 * strokes: { holed, left } (the strokes it was holed in, or left under way
 * after), undefined while the chain cannot say (its RPC down, the transaction
 * not found yet): never a save without that evidence. First its result, by
 * its hash (a holed round is not kept); a transaction that failed on the
 * chain throws its log (errorKind "chain"). Else, once Adena said it went
 * (sent), the round the chain shows: one still under way is the replay ending
 * otherwise, none is the round holed (not before: it may be one never sent).
 */
export async function readBack(chain: Pick<Chain, "txResult" | "round">, { hole, player, strokes, hash, sent }: { hole: string; player: string; strokes: number; hash?: string; sent: boolean }) {
  if (hash) {
    const result = await resultOf(chain, hash);
    if (result != null) return { holed: holedIn(result), left: Number((result.match(/after (\d+) strokes/) || [])[1]) || null };
  }
  if (!sent) return undefined;
  const now = await chain.round(hole, player).catch(() => undefined);
  return now === undefined ? undefined : now && now.strokes >= strokes ? { holed: null, left: now.strokes } : { holed: strokes, left: null };
}

// The storage a save writes, in bytes, measured on an onyx gnodev from the
// final realm (a holed round is not kept: only its best and rows): a named
// player's first finish on a hole wrote 1,040 bytes, and 512 more for the
// hole's wear if it is the hole's first play; their first finish in a mode,
// which also writes their course standing and ranking rows, 2,891 to 2,927;
// a replay writes nothing, or a few bytes for an improving best. A first
// best also keeps its shots, the ghost a duel races (Ghost): about 30 bytes
// and 23 a stroke more. Asked with about a tenth more; the chain charges what
// is really written.
export const depositBytes = (first: boolean, firstOnCourse = false, strokes = 0) => (!first ? 300 : (firstOnCourse ? 3200 : 1750) + 30 + 23 * strokes);

/** How much GNOT an account lacks to save a round (gas and deposit), 0 if it has enough; null if unknown. */
export const shortOf = (gas: number, price: number, deposit: number, balance: number | null | undefined) =>
  balance == null ? null : Math.max(0, feeFor(gas, price) + deposit - balance) / 1e6;

/** What a round's gas costs, in GNOT, shown before anyone signs: the gas at
 *  today's price (the ask adds half again for a rising price; Adena charges
 *  what it simulates). */
export const costOf = (gas: number, price = PRICE) => ((gas * price) / 1e6).toFixed(3);
