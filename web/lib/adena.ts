// Adena, the gno.land browser wallet. The page asks it two things only: who is
// playing, and to sign one round.
//
// A round is recorded as one transaction with two calls: Reset puts the
// player's ball back on the tee, PlayRound replays the shot list from there.
// A round too heavy for one transaction goes in two (or more): the first
// Resets and plays the first strokes, the next continue it (splitRound).
// The chain re-runs every shot itself — the page sends decisions, never
// outcomes — so a recorded score is one nobody can type in.

import { RULES, isAddress } from "./chain";
import type { Mode, Vec2 } from "./types";

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
/** A /vm.m_call message, as DoContract takes it. */
interface Call {
  type: "/vm.m_call";
  value: { caller: string; send: string; pkg_path: string; func: string; args: string[] };
}
/** The part of Adena's injected API this page calls (docs.adena.app). */
export interface Adena {
  AddEstablish(name: string): Promise<AdenaRes>;
  GetAccount(): Promise<AdenaRes<{ address: string; chainId: string }>>;
  GetNetwork?(): Promise<AdenaRes<Network>>;
  SwitchNetwork(chainId: string): Promise<AdenaRes>;
  AddNetwork(n: { chainId: string; chainName: string; rpcUrl: string }): Promise<AdenaRes>;
  DoContract(tx: { messages: Call[]; gasFee: number; gasWanted: number; memo: string; networkInfo?: { chainId: string; rpcUrl: string } }): Promise<AdenaRes<{ hash: string; height: number }>>;
  On?(event: "changedAccount" | "changedNetwork", fn: (...x: unknown[]) => void): void;
}
declare global {
  interface Window {
    adena?: Adena;
  }
}
/** A transaction Adena did not send; cancelled when the player said no. */
export interface SendError extends Error {
  cancelled?: boolean;
}
/** What the work model counts for a round (the engine's snapshot has them):
 *  walls, pieces, the forecast's kind, each stroke's path length. */
interface Work {
  walls?: number;
  pieces?: number;
  kind?: string;
  pts?: readonly number[];
}

const wallet = () => (typeof window !== "undefined" ? window.adena : undefined);

export const hasAdena = () => !!wallet();
export const ADENA_URL = "https://www.adena.app/";

// Adena's status codes worth telling apart (docs.adena.app, "errors")
const CANCELLED = 4000, LOCKED = 2000, BUSY = 1001, NOT_CONNECTED = 1000;

/** What went wrong, in words a player can act on. */
function why(res: AdenaRes | null | undefined, fallback: string) {
  const code = res && res.code;
  if (code === CANCELLED) return "Cancelled in Adena — nothing was sent.";
  if (code === LOCKED) return "Adena is locked. Unlock it and try again.";
  if (code === BUSY) return "An Adena window is already open. Finish or close it first.";
  if (code === NOT_CONNECTED) return "Adena is not connected to this page yet.";
  // a refused transaction: the chain's own words, where Adena passes them on
  const d = res && (res.data as { error?: { message?: string } | string; log?: string } | undefined);
  const chain = d && ((typeof d.error === "object" && d.error.message) || d.log || d.error);
  return (typeof chain === "string" && chain) || (res && res.message) || fallback;
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
async function ensureNetwork(a: Adena, { chainId, rpc, name = "Gnogolf chain" }: { chainId?: string | null; rpc: string; name?: string }) {
  if (!chainId) return;
  const active = async () => {
    try {
      const n = await a.GetNetwork?.();
      return n && n.data ? { id: n.data.chainId, rpc: norm(n.data.rpcUrl || n.data.rpc_url) } : null;
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
export async function connect({ chainId, rpc, name = "Gnogolf chain" }: { chainId?: string | null; rpc: string; name?: string }) {
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
    const url = n && n.data && (n.data.rpcUrl || n.data.rpc_url);
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
// point of its path, 1.2M and 15K per piece on the board. c: { walls, pieces,
// pts: [path length per stroke] }, as the engine's snapshot gives them: walls
// are the hole's and its pulses', pieces every wall, post and zone of the
// hole, its pulses and the forecast, each polygon edge one more.
// (a stroke whose length is not known counts as the longest path the realm takes)
const WORK = RULES.work;
const workOf = (c: Work, i: number) => WORK.shot + (c.walls || 0) * WORK.wall + ((c.pts || [])[i] ?? RULES.maxPath) * (WORK.point + (c.pieces || 0) * WORK.piece);

/**
 * The commits a round is recorded in: [[from, to), …], cut where the chain
 * would cut them, starting at stroke start. Its work.next refuses a shot,
 * after the first of a commit, once spent + the heaviest so far passes the
 * budget; the list is 12 at most. The same sums, so no commit of the split is
 * one the chain refuses.
 */
export function commitsOf(c: Work, n = (c.pts || []).length, start = 0) {
  const parts: [number, number][] = [];
  let from = start, spent = 0, most = 0;
  for (let i = start; i < n; i++) {
    if (i > from && (i - from >= RULES.maxShots || spent + most > WORK.budget)) (parts.push([from, i]), (from = i), (spent = most = 0));
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
// Gas asked for one commit, calibrated on gno_call simulate=true:
// the work model already bounds the shots
// (1.2x-1.6x their measured gas); the Reset and the call cost ~30M; the
// forecast is ~7M, except rain (up to 170M measured on the lane holes, as
// golf.gno's budget says) and a storm (~140M measured: the puddles).
// Adena simulates every tx with 2e9 gas at most: the ask stays under it.
const MAX_GAS = 1_900_000_000;
const PER_CALL = 30e6;
const FORECAST: Record<string, number> = { rain: RULES.forecastGas, storm: 150e6 };
/** The gas one commit of these strokes should need. c: { walls, pieces, kind (the forecast's), pts }. */
export function gasOf(c: Work, from = 0, to = (c.pts || []).length) {
  let g = PER_CALL + (FORECAST[c.kind || ""] || 0);
  for (let i = from; i < to; i++) g += workOf(c, i);
  return Math.min(Math.ceil(g), MAX_GAS);
}

/**
 * The commits a round is recorded in, each checked by the chain before Adena
 * opens. Each is cut by the realm's work model (commitsOf), then asked of the
 * chain — check(list, from, ball) resolves with the chain's answer for that
 * commit (its "rest" is where the next one starts) — so every commit is one
 * the chain has already accepted as a read. If the chain cuts sooner than the
 * model, its "commit the first N" wins and the rest is split again from
 * there. Any other refusal throws, in words: nothing goes to Adena then.
 */
export async function splitRound(shots: readonly string[], check: (list: string[], from: number, ball: Vec2 | null | undefined) => Promise<{ rest?: Vec2 } | null | undefined>, c: Work = {}) {
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
    out.push([from, to]);
    ball = r && r.rest;
    from = to;
  }
  return out;
}

/**
 * Signs one commit of this round: Reset + PlayRound… for the first (reset),
 * PlayRound… alone for the next ones, which continue the round where the
 * chain has it. Resolves with the tx (hash, height).
 */
export async function recordRound({ address, realm, hole, shots, gas, period, reset = true, mode = "assisted", price = 0.001, chainId, rpc }: {
  address: string; realm: string; hole: string; shots: readonly string[]; gas?: number; period?: number | null; reset?: boolean; mode?: Mode; price?: number; chainId?: string | null; rpc: string;
}) {
  const a = wallet();
  if (!a) throw new Error("Adena is not installed in this browser.");
  await ensureNetwork(a, { chainId, rpc });
  const gasWanted = Math.min(gas || MAX_GAS, MAX_GAS);
  const gasFee = feeFor(gasWanted, price);
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
  const res = await a.DoContract({
    // in the weather the round was played in (its period): the chain takes
    // the current one or the one before
    messages: [
      ...(reset ? [call("Reset", [hole])] : []),
      // a pro round goes on the pro board (the mode is the one it was played in)
      mode === "pro"
        ? call("PlayRoundPro", [hole, shots.join(";"), periodArg(period)])
        : period == null
          ? call("PlayRound", [hole, shots.join(";")])
          : call("PlayRoundAt", [hole, shots.join(";"), String(period)]),
    ],
    // a starting point: Adena simulates the tx and sets the final fee itself
    gasFee,
    gasWanted,
    memo: "gnogolf",
    // this exact chain: id and RPC (Adena's own "dev" is another node)
    ...(chainId && rpc ? { networkInfo: { chainId, rpcUrl: norm(rpc) } } : {}),
  });
  if (res.status !== "success") {
    const e: SendError = new Error(why(res, "The transaction was not sent."));
    e.cancelled = res.code === CANCELLED;
    throw e;
  }
  return res.data ?? null;
}

// The same save for gnokey, Adena's messages in one `maketx run` per commit:
// a tiny script that Resets (first commit only) and plays the shots, so the
// transaction is as atomic as Adena's. RUN_EXTRA: what a script's own
// package costs over a call (an empty run is ~19M).
const RUN_EXTRA = 20e6;
/** A holed round as gnokeyPlan reads it: the engine's snapshot. */
interface SaveRound extends Work {
  id: string | null;
  name?: string;
  shots?: readonly string[];
  period?: number | null;
  roundMode?: Mode | null;
}
/**
 * [{ file, script, command }] per commit, for the player to run with their
 * own key (<your-key-name>). s: the engine's snapshot of a holed round
 * (id, shots, period, roundMode, and the work model's walls, pieces, kind, pts).
 */
export function gnokeyPlan(s: SaveRound, { realm, price = 0.001, chainId, rpc }: { realm: string; price?: number; chainId?: string | null; rpc: string }) {
  const shots = s.shots || [], mode = s.roundMode || "assisted";
  if (!shots.length) return [];
  if (mode === "pro" && s.period == null) return []; // a pro round has its period, or it cannot be saved
  // the player pastes this into a shell: nothing the chain or the page's link
  // says goes in unchecked
  if (s.period != null && !Number.isSafeInteger(s.period)) return [];
  if (!/^[\w./-]{1,128}$/.test(String(s.id))) return [];
  const title = String(s.name || s.id).replace(/[^\x20-\x7e]/g, "").slice(0, 60);
  const chain = chainId && /^[\w.-]{1,64}$/.test(chainId) ? chainId : "<chain-id>";
  const remote = /^https?:\/\/[\w.:[\]-]+(\/[\w./-]*)?$/.test(norm(rpc)) ? norm(rpc) : "<rpc-url>";
  const q = JSON.stringify; // a Go string literal, for these ASCII ids and shots
  const parts = commitsOf(s, shots.length);
  return parts.map(([from, to], k) => {
    const list = q(shots.slice(from, to).join(";")), hole = q(s.id);
    const play =
      mode === "pro" ? `golf.PlayRoundPro(cross(cur), ${hole}, ${list}, ${s.period})`
        : s.period == null ? `golf.PlayRound(cross(cur), ${hole}, ${list})`
          : `golf.PlayRoundAt(cross(cur), ${hole}, ${list}, ${s.period})`;
    const file = parts.length > 1 ? `gnogolf-save-${k + 1}.gno` : "gnogolf-save.gno";
    const script = [
      `// Gnogolf: ${title}, ${parts.length > 1 ? `part ${k + 1} of ${parts.length}, ` : ""}strokes ${from + 1}-${to} (${mode})`,
      "package main",
      "",
      `import "${realm}"`,
      "",
      "func main(cur realm) {",
      ...(k === 0 ? [`\tgolf.Reset(cross(cur), ${hole})`] : []),
      `\tprintln(${play})`,
      "}",
      "",
    ].join("\n");
    const gas = Math.min(gasOf(s, from, to) + RUN_EXTRA, MAX_GAS);
    const command = `gnokey maketx run -gas-fee ${feeFor(gas, price)}ugnot -gas-wanted ${gas} -broadcast -chainid ${chain} -remote ${remote} <your-key-name> ${file}`;
    return { file, script, command };
  });
}

// The storage a save writes, in bytes (measured): a first finish
// on a hole writes the round, the best and the board entry (~6.6 KB), and a
// player's first course finish ~2.5 KB more for the ranking; a replay of a
// hole already saved replaces what is there (~0).
export const depositBytes = (first: boolean) => (first ? 9100 : 300);

/** How much GNOT an account lacks to save a round (gas and deposit), 0 if it has enough; null if unknown. */
export const shortOf = (gas: number, price: number, deposit: number, balance: number | null | undefined) =>
  balance == null ? null : Math.max(0, feeFor(gas, price) + deposit - balance) / 1e6;

/** What a round's gas costs, in GNOT, shown before anyone signs: the gas at
 *  today's price (the ask adds half again for a rising price; Adena charges
 *  what it simulates). */
export const costOf = (gas: number, price = 0.001) => ((gas * price) / 1e6).toFixed(3);
