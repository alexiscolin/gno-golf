// Talking to the realm.
//
// Two reads, both free: no wallet, no transaction, no block to wait for. The
// chain resolves every shot — nothing here computes anything about a ball
// (the aim's previews run the realm's own code in the page: lib/sim.ts).
// See CLIENT.md for the contract.
//
// This is the one place the chain's JSON is parsed (lib/sim.ts parses the
// wasm's, the same JSON): each read is checked
// against the shape lib/types.ts gives it (the fields the page cannot do
// without), and a reply that is not that shape is refused here, as the realm's
// ("chain"), not left to fail somewhere in the scene.

import { hostOf, isLoopback } from "./network";
import { trackError } from "./analytics";
import type {
  Bests, CourseLeaderboard, Extras, Ghost, HoleLeaderboard, HoleRank, HoleRow, Holes, HoleState, Leaderboard, Mode, Rank, Round, SimulateFrom,
  SimulateRound, Standings, StandingRow, StrokesRow, Vec2, Weather,
} from "./types";

/**
 * The realm's rules the client plays by, copied from gno.land/r/gnogolf/golf/v2
 * (golf.gno, weather.gno): scripts/selfcheck.ts reads them there and fails on
 * any drift. A split or a gas figure that disagrees with the realm sends a
 * commit the chain refuses.
 */
export const RULES = {
  /** golf.gno maxShots: the longest shot list one commit takes */
  maxShots: 12,
  /** golf.gno maxRoundStrokes: the most strokes one round holds */
  maxRoundStrokes: 60,
  /** golf.gno maxPath: the longest path a stroke may return */
  maxPath: 512,
  /** golf.gno maxPower */
  maxPower: 10,
  /** weather.gno PeriodSeconds, in ms: one weather's length */
  periodMs: 300e3,
  /** golf.gno's work model (workBudget, workPerShot, workPerWall, workPerPoint, workPerPiece, workPerUnit, workPerPulseWall, workPerPulsePost) */
  work: { budget: 1.4e9, shot: 10e6, wall: 150e3, point: 1.2e6, piece: 15e3, unit: 1000, pulseWall: 700e3, pulsePost: 200e3 },
  /** physics MaxWork and MaxWorkStep: a stroke's work cap, and the most a stroke passes it by (golf's work.next caps a shot by what is left, less this) */
  maxWork: 1_000_000,
  maxWorkStep: 225_000,
} as const;

/** A realm path NEXT_PUBLIC_REALM may name: gno.land/r/<namespace>/<realm>, or
 *  a game's sub-path, gno.land/r/<namespace>/<game>/<realm>, either with a
 *  version (…/golf/v2) (next.config.mjs holds the same rule). */
export const isRealmPath = (s: string) => /^gno\.land\/r\/[a-z0-9_-]+(\/[a-z0-9_]+){1,2}(\/v[0-9]+)?$/.test(s);
// the hub: the build's (NEXT_PUBLIC_REALM, as gno.land/r/nym-alexiscolin000/gnogolf/golf/v2
// on onyx), else the local chain's (a production build refuses one missing or
// of another shape: next.config.mjs)
const REALM_ENV = process.env.NEXT_PUBLIC_REALM || "";
const REALM = isRealmPath(REALM_ENV) ? REALM_ENV : "gno.land/r/gnogolf/golf/v2";
/** The hub's gnoweb path ("/r/…/golf"). */
export const REALM_PATH = REALM.replace(/^gno\.land/, "");
/** The game's own gnoweb path ("/r/…/gnogolf/") of a realm at `realm` (its version aside). */
const gamePath = (realm: string) => realm.replace(/\/v[0-9]+$/, "").replace(/[^/]+$/, "");
/** The gnoweb path ("/p/…/") of the packages a realm at `realm` imports, beside
 *  it: p/gnogolf/… in the repo tree, p/<ns>/gnogolf/… as stage.sh deploys them. */
export const pkgsPath = (realm: string) => gamePath(realm).replace(/^\/r\//, "/p/");
/** The gnoweb path of the realm that keeps the records, beside the rules: …/gnogolf/store. */
export const storePath = (realm: string) => gamePath(realm) + "store";
const HOLES_TTL = 10 * 60e3; // a hole registered meanwhile shows within ten minutes, or in a new tab

/** A pause of ms: between two reads of the chain, a retry, a beat. */
export const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export const DEFAULT_RPC = "http://127.0.0.1:26657";
export const DEFAULT_WEB = "http://127.0.0.1:8888";

/** An error from a read, tagged: "down" the node did not answer, "chain" it refused (log: the VM's). */
interface ChainError extends Error {
  kind?: "down" | "chain";
  log?: string;
}
/** The kind a thrown value was tagged with, if any. */
export const errorKind = (e: unknown): ChainError["kind"] => (e instanceof Error ? (e as ChainError).kind : undefined);

// Gno wants a float where the signature says float64; an integer literal would
// be an untyped int, so every number goes out with a decimal point.
const f = (n: number) => Number(n).toFixed(4);
const s = (v: unknown) => JSON.stringify(String(v));
// an exact float, as the realm gave it (its shortest round-trip form), with the
// decimal point a float64 argument wants
const fx = (n: number) => {
  const t = String(Number(n));
  if (!Number.isFinite(Number(n))) throw new Error("A ball must be on the board.");
  return /[.e]/.test(t) ? t : t + ".0";
};
const hexOf = (str: string) => [...new TextEncoder().encode(str)].map((b) => b.toString(16).padStart(2, "0")).join("");
// the VM quotes its strings the Go way: a rune past U+FFFF it deems not
// printable comes as \UXXXXXXXX, which JSON lacks (a \\ before a U is not one)
const goJSON = (q: string) => q.replace(/\\(U[0-9a-fA-F]{8}|[\s\S])/g, (m, e: string) => (e.length > 1 ? String.fromCodePoint(parseInt(e.slice(1), 16)) : m));
// the JSON shape this page reads (every realm object carries "version")
const VERSION = 1;
let warned = false;
/** The realm's own sentence in a VM panic log ("golf: …"), or null. */
function refusal(log: string | undefined) {
  const m = String(log || "").match(/panic: ([^\n]+)/) || String(log || "").match(/(golf: [^"\n]+)/);
  return m ? m[1].replace(/\s+$/, "") : null;
}

// ------------------------------------------------------------ the checks
// Small and structural: what the page reads without looking twice. Anything
// deeper (a skin's name, a zone's numbers) the scene already treats as data.

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const isVec = (p: unknown): p is Vec2 => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]);
const arrays = (v: Obj, ...keys: string[]) => keys.every((k) => Array.isArray(v[k]));
const nums = (v: Obj, ...keys: string[]) => keys.every((k) => Number.isFinite(v[k]));
const strs = (v: Obj, ...keys: string[]) => keys.every((k) => typeof v[k] === "string");
const isMode = (m: unknown): m is Mode => m === "assisted" || m === "pro";
const holeRow = (h: unknown) => isObj(h) && typeof h.id === "string";
// a path is points of two finite numbers
const isPath = (p: unknown): p is Vec2[] => Array.isArray(p) && p.every(isVec);
// a stroke's flight: its path (at least one point, or it is not one), one air
// flag and one cause letter per point, and where it rests exactly
const isFlight = (v: Obj) => isPath(v.path) && v.path.length > 0 && isVec(v.rest) && strs(v, "air", "cause");
const simFrom = (v: unknown): v is SimulateFrom => isObj(v) && isFlight(v) && typeof v.holed === "boolean" && nums(v, "bounces");
// a board: its rows (each checked by row), its mode and the numbers it says
const board = (v: unknown, row: (r: unknown) => boolean, ...keys: string[]): v is Obj => isObj(v) && isMode(v.mode) && Array.isArray(v.rows) && v.rows.every(row) && nums(v, ...keys);
const strokesRow = (r: unknown) => isObj(r) && typeof r.player === "string" && (r.name === undefined || typeof r.name === "string") && nums(r, "strokes");
const standingRow = (r: unknown) => strokesRow(r) && nums(r as Obj, "holes", "par");
const checks = {
  holes: (v: unknown): v is HoleRow[] => Array.isArray(v) && v.every(holeRow),
  // Holes(): { version, play, successor, holes }
  holesReply: (v: unknown): v is Holes => isObj(v) && strs(v, "play", "successor") && Array.isArray(v.holes) && v.holes.every(holeRow),
  state: (v: unknown): v is HoleState =>
    isObj(v) && typeof v.hole === "string" && isObj(v.board) && isVec(v.start) && isVec(v.cup) && arrays(v, "walls", "posts", "zones") &&
    (v.work === undefined || (isObj(v.work) && nums(v.work, "walls", "pieces", "setup"))),
  simFrom,
  simRound: (v: unknown): v is SimulateRound => isObj(v) && Number.isInteger(v.strokes) && nums(v, "period") && simFrom(v),
  weather: (v: unknown): v is Weather => isObj(v) && Array.isArray(v.zones),
  extras: (v: unknown): v is Extras => isObj(v) && arrays(v, "walls", "posts", "zones"),
  leaderboard: (v: unknown): v is Leaderboard => board(v, standingRow, "holes"),
  bests: (v: unknown): v is Bests => board(v, strokesRow, "par") && typeof v.hole === "string",
  standings: (v: unknown): v is Standings => board(v, standingRow, "holes"),
  holeLeaderboard: (v: unknown): v is HoleLeaderboard => board(v, strokesRow, "par", "players", "finished", "offset", "next") && typeof v.hole === "string",
  records: (v: unknown): v is { rows: StrokesRow[]; next: string } => isObj(v) && Array.isArray(v.rows) && v.rows.every(strokesRow) && typeof v.next === "string",
  players: (v: unknown): v is { rows: StandingRow[]; next: string } => isObj(v) && Array.isArray(v.rows) && v.rows.every(standingRow) && typeof v.next === "string",
  courseLeaderboard: (v: unknown): v is CourseLeaderboard => board(v, standingRow, "holes", "players", "offset", "next"),
  holeRank: (v: unknown): v is HoleRank => isObj(v) && isMode(v.mode) && typeof v.hole === "string" && typeof v.player === "string" && nums(v, "rank", "of", "strokes"),
  rank: (v: unknown): v is Rank => isObj(v) && isMode(v.mode) && typeof v.player === "string" && nums(v, "rank", "of", "holes", "strokes", "par"),
  // a best of 1 to 60 strokes, one shot a stroke
  ghost: (v: unknown): v is Ghost | null =>
    v === null || (isObj(v) && isMode(v.mode) && strs(v, "hole", "player", "shots") && nums(v, "period") && Number.isInteger(v.strokes) &&
      (v.strokes as number) > 0 && (v.strokes as number) <= RULES.maxRoundStrokes && (v.shots as string).split(";").length === v.strokes),
  round: (v: unknown): v is Round | null =>
    v === null || (isObj(v) && isPath(v.path) && isVec(v.rest) && isVec(v.ball) && strs(v, "player", "shots", "air", "cause") && isMode(v.mode) && Number.isInteger(v.strokes) && nums(v, "period")),
};
// a gno.land name as r/sys/users writes them
const isName = (n: string) => /^[a-z0-9._-]{1,64}$/i.test(n);
/** What a name a registrar takes is made of (its own rules come after, ValidateNymFormat): what nameProblem asks first, and a gnokey paste takes. */
export const nameShape = (n: string) => /^[a-z0-9_-]{1,64}$/.test(n);
// what a refused stroke says, as the engine always said it
const NO_PATH = "The chain answered without a path for that shot.";

export function makeChain({ rpc = DEFAULT_RPC, web = DEFAULT_WEB }: { rpc?: string; web?: string } = {}) {
  // Every request gives up after its time (a node that hangs must not hang
  // the game), is checked at each level, and its bytes read as UTF-8.
  const TIMEOUT = 8000;
  const utf8 = (b64: string) => new TextDecoder().decode(Uint8Array.from(atob(b64 || ""), (c) => c.charCodeAt(0)));
  // signal: the caller's, to cancel a request it no longer wants (a stale
  // aim preview). The timeout is a timer of its own, not AbortSignal.timeout,
  // which older Safari lacks.
  // An error is tagged with its kind: "down" when the node did not answer
  // (refused, timed out, a proxy's HTML page), "chain" when it answered with a
  // refusal — whose text is the realm's own sentence, not the VM's trace.
  const down = (e: unknown): ChainError => Object.assign(e instanceof Error ? e : new Error(String(e)), { kind: "down" as const });
  const refused = (message: string, log?: string): ChainError => Object.assign(new Error(message), { kind: "chain" as const, log });
  interface AbciReply {
    error?: { data?: string; message?: string };
    result?: { response?: { ResponseBase?: { Error?: unknown; Log?: string; Data?: string } } };
  }
  async function once(url: string, ms: number, signal: AbortSignal | null) {
    const c = new AbortController(), t = setTimeout(() => c.abort(new DOMException("signal timed out", "TimeoutError")), ms);
    const stop = () => c.abort(signal?.reason);
    if (signal) {
      if (signal.aborted) stop();
      else signal.addEventListener("abort", stop, { once: true });
    }
    try {
      let body: AbciReply;
      try {
        const res = await fetch(url, { signal: c.signal });
        if (!res.ok) throw new Error(`RPC ${res.status}`);
        body = (await res.json()) as AbciReply;
      } catch (e) {
        throw signal && signal.aborted ? e : down(e);
      }
      if (body.error) throw down(new Error(body.error.data || body.error.message)); // the node refused the request itself
      const r = body.result && body.result.response && body.result.response.ResponseBase;
      if (!r) throw down(new Error("The node's answer had no response in it."));
      if (r.Error) throw refused(refusal(r.Log) || JSON.stringify(r.Error), r.Log);
      return utf8(r.Data || "");
    } finally {
      clearTimeout(t);
      if (signal) signal.removeEventListener("abort", stop);
    }
  }
  // reads change nothing: one that the network dropped is asked once more
  async function query(url: string, ms = TIMEOUT, signal: AbortSignal | null = null) {
    try {
      return await once(url, ms, signal);
    } catch (e) {
      if (errorKind(e) !== "down" || (signal && signal.aborted)) throw e;
      await wait(400);
      return once(url, ms, signal);
    }
  }

  /** A raw ABCI query; returns the decoded data string. */
  const abci = (path: string) => query(`${rpc}/abci_query?path=%22${path}%22`);

  // an expression evaluated in a realm, read-only: the VM's typed result as it
  // printed it; a failure told analytics (the function, the node's host, how long)
  const vm = (realm: string, expr: string, ms?: number, signal?: AbortSignal | null) => {
    const t0 = performance.now();
    return query(`${rpc}/abci_query?path=%22vm/qeval%22&data=0x${hexOf(`${realm}.${expr}`)}`, ms, signal).catch((e: unknown) => {
      if (!(signal && signal.aborted)) trackError("rpc", e, { fn: fnOf(expr), host: hostOf(rpc), ms: Math.round(performance.now() - t0), kind: errorKind(e) });
      throw e;
    });
  };
  // the function an expression calls, as a refusal names it
  const fnOf = (expr: string) => expr.slice(0, expr.indexOf("("));
  // a string result — ("…" string), an empty one ( string) — unwrapped; an answer that is not one is the chain's to answer for
  const unquote = (raw: string, expr: string) => {
    if (raw.trim() === "( string)") return "";
    try {
      return String(JSON.parse(goJSON(raw.slice(raw.indexOf("(") + 1, raw.lastIndexOf(" string)")))));
    } catch {
      throw refused(`The chain's answer to ${fnOf(expr)} is not a string.`);
    }
  };

  // a string answer from any realm (r/sys/users)
  const qstr = async (realm: string, expr: string, ms?: number) => unquote(await vm(realm, expr, ms), expr);

  // a realm read, checked: T when the answer has T's shape, refused otherwise
  async function qeval<T>(expr: string, ok: (v: unknown) => v is T, ms?: number, signal?: AbortSignal | null, bad?: string): Promise<T> {
    // the reply is a Gno typed result — ("<json>" string) — so it unwraps twice
    const json = unquote(await vm(REALM, expr, ms, signal), expr);
    let v: unknown;
    try {
      v = JSON.parse(json);
    } catch {
      throw refused(`The chain's answer to ${fnOf(expr)} is not JSON.`);
    }
    // every object the realm returns says its version: a newer realm may have
    // moved a field this page reads
    if (isObj(v) && Number(v.version) > VERSION && !warned) {
      warned = true;
      console.warn(`gnogolf: the realm speaks version ${String(v.version)}, this page ${VERSION}`);
    }
    if (!ok(v)) throw refused(bad || `The chain's answer to ${fnOf(expr)} is not one this page can read.`);
    return v;
  }
  // a mode is sent exactly: the realm refuses any other word
  const m = (mode: string): Mode => (mode === "pro" ? "pro" : "assisted");

  // Params that do not move within a session (the chain id, the gas and
  // storage prices) are read once per ttl, not once a hole: the answer is kept,
  // a failure is not.
  // Extras(hole, stroke), per hole version and stroke (chain.extras)
  const extrasRead = new Map<string, Promise<Extras>>();
  const memo = <T>(fn: () => Promise<T>, ttl: number) => {
    let at = 0, p: Promise<T> | null = null;
    return (): Promise<T> => {
      if (!p || performance.now() - at > ttl) {
        at = performance.now();
        p = fn().catch((e: unknown) => ((p = null), Promise.reject(e instanceof Error ? e : new Error(String(e)))));
      }
      return p;
    };
  };
  // The chain's clock: the node's last block time against this device's, from
  // /status (re-read once a minute at most). The chain judges a period by the
  // block a transaction lands in, never by the device.
  interface Status {
    node_info: { network: string };
    sync_info?: { latest_block_time?: string };
  }
  let skew = 0;
  const status = memo(async () => {
    const c = new AbortController(), t = setTimeout(() => c.abort(), 4000);
    try {
      const res = await fetch(`${rpc}/status`, { signal: c.signal });
      if (!res.ok) throw new Error(`RPC ${res.status}`);
      const r = ((await res.json()) as { result: Status }).result;
      const bt = Date.parse((r.sync_info && r.sync_info.latest_block_time) || "");
      if (Number.isFinite(bt)) skew = bt - Date.now();
      return r;
    } catch (e) {
      throw down(e);
    } finally {
      clearTimeout(t);
    }
  }, 60e3);
  const PARAMS_TTL = 10 * 60e3;

  // whether the chain runs pkg: a package it doesn't know is its answer
  // (false); a node not answering is thrown, not kept
  const has = async (pkg: string) => {
    try {
      await vm(pkg, "IsPaused()");
      return true;
    } catch (e) {
      if (errorKind(e) === "chain") return false;
      throw e;
    }
  };
  /** The name registrar this chain runs, "" if none: onyx, mainnet and a local gno have r/sys/namereg/v0 (pearl had v1). */
  const nameReg = memo(async () => {
    for (const v of ["gno.land/r/sys/namereg/v0", "gno.land/r/sys/namereg/v1"]) if (await has(v)) return v;
    return "";
  }, 3600e3);
  return {
    rpc,
    web,
    realm: REALM,
    /** The node's current gas price, as ugnot per gas: { gas, price } → price / gas. */
    gasPrice: memo(async () => {
      const r = await abci("auth/gasprice");
      let j: { price?: unknown; gas?: unknown } = {};
      try {
        j = JSON.parse(r) as typeof j;
      } catch {}
      const p = Number(String(j.price).replace(/[^0-9.]/g, "")) / Number(j.gas);
      if (!Number.isFinite(p) || p <= 0) throw refused("The chain's gas price could not be read.");
      return p;
    }, PARAMS_TTL),
    /** How much ugnot an address holds here; 0 for an account the chain has never seen. */
    // null when the node cannot say: an RPC outage is not an empty account
    balance: async (addr: string): Promise<number | null> => {
      try {
        const r = await abci(`bank/balances/${encodeURIComponent(addr)}`);
        if (!r) return 0; // the chain has never seen this account
        const m = String(JSON.parse(r)).match(/(\d+)ugnot/);
        return m ? Number(m[1]) : 0;
      } catch {
        return null;
      }
    },
    /** The chain id the node reports — what a wallet must be switched to. */
    chainId: async () => (await status()).node_info.network,
    /** Now on the chain's clock (ms): the device's, set by the last block time read. */
    now: () => Date.now() + skew,
    /** Reads /status again if its last read is a minute old: the clock follows. */
    sync: () => status().then(() => skew),
    /** What the chain charges per byte a transaction stores, in ugnot (vm params). */
    storagePrice: memo(async () => {
      const m = String(JSON.parse(await abci("params/vm:p:storage_price"))).match(/^(\d+)ugnot$/);
      return m ? Number(m[1]) : 100;
    }, PARAMS_TTL),
    /** gnoweb page of one player's round on a hole. */
    roundURL: (hole: string, player: string) =>
      isHoleId(hole) && isAddress(player) ? new URL(`${REALM_PATH}:${hole}/${player}`, web + "/").href : "#",
    /** gnoweb board: a hole's best rounds, or the course's (the hub's), at the mode's table. */
    boardURL: (hole: string | null, mode: Mode) =>
      new URL(`${REALM_PATH}${isHoleId(hole) ? `:${hole}` : ""}#${mode === "assisted" ? "assisted" : "pro"}`, web + "/").href,
    /** gnoweb page of an address (its /u/ profile), # for anything else. */
    userURL: (addr: string) => (isAddress(addr) ? new URL(`/u/${addr}`, web + "/").href : "#"),
    /** gnoweb form of a realm's function (its $help page, at func): the call made in a browser, without Adena; # for anything else. */
    helpURL: (pkg: string, func: string) =>
      /^gno\.land\/r\/[\w/.-]+$/.test(pkg) && /^[A-Z]\w*$/.test(func) ? new URL(`${pkg.replace(/^gno\.land/, "")}$help&func=${func}`, web + "/").href : "#",
    /** gnoweb link to what a hole is made of: a realm hole's source, a data
     *  hole's data page. A player can read a hole before trusting it. */
    // links built from what the chain says, checked first: a hole id, an address
    sourceURL: (id: string | null) =>
      PKG.test(String(id))
        ? new URL(String(id).replace(/^gno\.land/, "") + "$source", web + "/").href
        : isHoleId(id)
          ? new URL(`${REALM_PATH}:${id}/data`, web + "/").href
          : "#",
    /** Every registered hole: id, name, official (one of the course's), world, order, par, plays, best, next (archived for). */
    // kept for the tab (sessionStorage, HOLES_TTL): a reload or a Retry does
    // not pay the list again (163M of query gas); fresh=true reads it anyway
    holes: async (fresh = false): Promise<HoleRow[]> => {
      const key = `gnogolf.holes|${rpc}|${REALM}`;
      try {
        const c = !fresh && (JSON.parse(sessionStorage.getItem(key) || "null") as { at?: number; list?: unknown } | null);
        if (c && Date.now() - Number(c.at) < HOLES_TTL && checks.holes(c.list) && c.list.length) return c.list;
      } catch {}
      const list = [...(await qeval("Holes()", checks.holesReply)).holes];
      try {
        sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), list }));
      } catch {}
      return list;
    },
    /** One hole's geometry, skins, weather and wear (HoleState: everything to draw the hole and aim). */
    state: (hole: string) => qeval(`HoleState(${s(hole)})`, checks.state),
    /**
     * One stroke, read-only, from an exact ball: what PlayRoundAt would play
     * for stroke `stroke` (0 = the first) of a round in `period`. ball is the
     * "rest" of the previous answer, exactly as it came; shot is shotOf's.
     * { holed, bounces, path, air, cause, rest }.
     */
    simulateFrom: (hole: string, ball: Vec2, shot: string, stroke: number, period: number, ms?: number, signal?: AbortSignal | null) =>
      qeval(`SimulateFrom(${s(hole)}, ${fx(ball[0])}, ${fx(ball[1])}, ${s(shot)}, ${stroke | 0}, ${period | 0})`, checks.simFrom, ms, signal, NO_PATH),
    /**
     * A round replayed from the tee, read-only: the last shot's path and the
     * stroke count, exactly what PlayRound would record for the same list.
     * shots is ["angle,power", …] as made by shotOf.
     */
    simulateRound: (hole: string, shots: readonly string[], period: number | null | undefined, ms?: number, signal?: AbortSignal | null) =>
      period == null
        ? qeval(`SimulateRound(${s(hole)}, ${s(shots.join(";"))})`, checks.simRound, ms, signal, NO_PATH)
        : qeval(`SimulateRoundAt(${s(hole)}, ${s(shots.join(";"))}, ${period | 0})`, checks.simRound, ms, signal, NO_PATH),
    /** A recorded round replayed in its own weather, however old (the previews above take the current one only): for checking a record. */
    replayRound: (hole: string, shots: readonly string[], period: number, ms?: number) =>
      qeval(`SimulateRoundIn(${s(hole)}, ${s(shots.join(";"))}, ${period | 0})`, checks.simRound, ms, null, NO_PATH),
    /**
     * One commit of a round under way, read-only: what the next PlayRoundAt
     * (or PlayRoundPro) of these shots would do from the exact ball ("rest")
     * at stroke number stroke, refused as that commit would be. SimulateRound's JSON.
     */
    simulateCommit: (hole: string, ball: Vec2, stroke: number, shots: readonly string[], period: number, ms?: number, signal?: AbortSignal | null) =>
      qeval(`SimulateCommit(${s(hole)}, ${fx(ball[0])}, ${fx(ball[1])}, ${stroke | 0}, ${s(shots.join(";"))}, ${period | 0})`, checks.simRound, ms, signal, NO_PATH),
    /** A version's data (GG1) in hex, as it was published: what the local preview plays (lib/sim). */
    holeData: async (hole: string) => {
      const hex = await qstr(REALM, `HoleData(${s(hole)})`);
      if (!/^([0-9a-f]{2})+$/.test(hex)) throw refused("The chain's hole data is not hex.");
      return hex;
    },
    /** A deployed package's file, as the node keeps it (vm/qfile). */
    file: (path: string) => query(`${rpc}/abci_query?path=%22vm/qfile%22&data=0x${hexOf(path)}`),
    /** The weather's five minutes on the chain (block time / 300), and its forecast for a hole. */
    // an int64, not a string: its own unwrapping
    period: async () => {
      const raw = await vm(REALM, "Period()");
      const n = Number((raw.match(/^\((-?\d+) int64\)/) || [])[1]);
      if (!Number.isFinite(n)) throw refused("The chain's period is not a number.");
      return n;
    },
    weather: (hole: string, period: number) => qeval(`Weather(${s(hole)}, ${period | 0})`, checks.weather),
    /** The golf realm's owner (its maker), as the chain has it: where a tip goes. */
    owner: async () => {
      const raw = await vm(REALM, "Owner()");
      const a = (raw.match(/^\("([^"]+)" \.uverse\.address\)$/) || [])[1];
      if (!a || !isAddress(a)) throw refused("The chain's owner is not an address.");
      return a;
    },
    /** What a timed hole adds at one stroke of a round (0 = first shot): read
     *  once per hole version and stroke (Extras is a pure function of the two:
     *  the look-ahead and the next stroke ask the same), a failure not kept. */
    extras: (hole: string, stroke: number) => {
      const n = Math.max(0, stroke | 0), k = `${hole}#${n}`;
      let p = extrasRead.get(k);
      if (!p) {
        if (extrasRead.size >= 512) extrasRead.clear(); // (a long session: from scratch, never unbounded)
        p = qeval(`Extras(${s(hole)}, ${n})`, checks.extras).catch((e: unknown) => (extrasRead.delete(k), Promise.reject(e instanceof Error ? e : new Error(String(e)))));
        extrasRead.set(k, p);
      }
      return p;
    },
    /** The course-wide ranking of recorded rounds. */
    leaderboard: (mode = "assisted") => qeval(`Leaderboard(${s(m(mode))})`, checks.leaderboard),
    /** The best rounds of these players (at most 50) on a hole: { hole, mode, par, rows: [{ player, strokes }] }. */
    bests: (hole: string, mode: string, players: readonly string[]) =>
      qeval(`Bests(${s(hole)}, ${s(m(mode))}, ${s(players.slice(0, 50).join(","))})`, checks.bests),
    /** These players across the course: { mode, holes, rows: [{ player, holes, strokes, par }] }. */
    standings: (mode: string, players: readonly string[]) =>
      qeval(`Standings(${s(m(mode))}, ${s(players.slice(0, 50).join(","))})`, checks.standings),
    /** A player's place in a mode's course ranking: { rank (0: not ranked), of, holes, strokes, par }. */
    rank: (mode: string, player: string) => qeval(`Rank(${s(m(mode))}, address(${s(player)}))`, checks.rank),
    /** Of these holes (the first 100: one read's room, the course is 90), a player's bests on those they have one on, in either mode: their ghosts. One read. */
    bestsOf: async (holes: readonly string[], player: string): Promise<ReadonlyMap<string, { pro: number; assisted: number }>> => {
      const got = new Map<string, { pro: number; assisted: number }>();
      if (!isAddress(player)) return got;
      const ids = holes.slice(0, 100), who = `address(${s(player)})`;
      // a line "<id> <pro> <assisted>" a hole (the realm's strconv is not in reach here: n writes the digits)
      const out = await qstr(REALM, `func() (s string) { n := func(v int) (t string) { for { t = string(rune(48+v%10)) + t; v /= 10; if v == 0 { return } } }; for _, h := range []string{${ids.map(s).join(", ")}} { p, a := BestOf(h, "pro", ${who}), BestOf(h, "assisted", ${who}); if p+a > 0 { s += h + " " + n(p) + " " + n(a) + "\\n" } }; return }()`);
      const best = (v: string) => (/^(0|[1-9]\d?)$/.test(v) && Number(v) <= RULES.maxRoundStrokes ? Number(v) : NaN); // (0: none in that mode)
      for (const line of out.split("\n")) {
        const [id, pro, assisted, ...rest] = line.split(" "), b = { pro: best(pro), assisted: best(assisted) };
        if (ids.includes(id) && !rest.length && b.pro >= 0 && b.assisted >= 0 && b.pro + b.assisted > 0) got.set(id, b); // (only the holes asked)
      }
      return got;
    },
    /** These players' records on a hole in a mode (the first 50), as the realm keeps them: strokes, the block
     *  it was saved at, its weather's period, its shots ("a,p,t;…"). One read: a board's page, the bot check's hole. */
    recordsOf: async (hole: string, mode: string, players: readonly string[]): Promise<ReadonlyMap<string, Kept>> => {
      const got = new Map<string, Kept>(), ps = players.filter(isAddress).slice(0, 50);
      if (!ps.length) return got;
      const out = await qstr(REALM, `func() (s string) { e, m := readHole(${s(hole)}), modeOf(${s(m(mode))}); for _, p := range []string{${ps.map(s).join(", ")}} { if v, ok := e.bests(m).Get(p); ok { s += p + " " + v + "\\n" } }; return }()`);
      for (const [p, k] of keptLines(out)) if (ps.includes(p)) got.set(p, k); // (only the players asked)
      return got;
    },
    /** A page of a hole's board in a mode with each row's record (recordsOf's), in its order: one
     *  read of up to 300 (the bot check's; a name deleted since stays). next: the next page's offset, 0 at the end. */
    boardRecords: async (hole: string, mode: string, offset = 0, limit = 300) => {
      const n = Math.max(1, Math.min(300, limit | 0)), at = Math.max(0, offset | 0);
      const out = await qstr(REALM, `func() (s string) { e, m := readHole(${s(hole)}), modeOf(${s(m(mode))}); e.board(m).IterateByOffset(${at}, ${n}, func(_, p string) bool { if r, ok := e.bests(m).Get(p); ok { s += p + " " + r + "\\n" } else { s += p + "\\n" }; return false }); return }()`);
      const lines = out.split("\n").filter(Boolean);
      return { rows: keptLines(out), next: lines.length === n ? at + n : 0 };
    },
    /** A gno.land name's address, or "" (r/sys/users). */
    resolveName: (name: string) =>
      isName(name)
        ? qstr("gno.land/r/sys/users", `func() string { d, _ := ResolveName(${s(name)}); if d == nil { return "" }; return d.Addr().String() }()`).then((a) => (isAddress(a) ? a : ""))
        : Promise.resolve(""),
    /** An address's gno.land name, or "". */
    nameOf: (addr: string) =>
      isAddress(addr)
        ? qstr("gno.land/r/sys/users", `func() string { d := ResolveAddress(address(${s(addr)})); if d == nil { return "" }; return d.Name() }()`).then((n) => (isName(n) ? n : "")) // (nothing a lying node could dress up)
        : Promise.resolve(""),
    /** A page of every player's best on a hole, named or not, by address: { rows: [{ player, strokes }], next ("" at the end) }. */
    records: (hole: string, mode: string, after = "", limit = 100) =>
      qeval(`Records(${s(hole)}, ${s(m(mode))}, ${s(after)}, ${limit | 0})`, checks.records),
    /** A page of every course standing, named or not, by address: { rows: [{ player, holes, strokes, par, height }], next ("" at the end) }. */
    players: (mode: string, after = "", limit = 100) => qeval(`Players(${s(m(mode))}, ${s(after)}, ${limit | 0})`, checks.players),
    nameReg,
    /** Why a name cannot be taken here ("" if it can): the registrar's own format rules, then whether it is taken. */
    nameProblem: async (name: string) => {
      const reg = await nameReg();
      if (!reg) return "This chain has no name registrar.";
      if (!nameShape(name)) return "Lowercase letters, digits and dashes only.";
      const bad = await qstr(reg, `func() string { if e := ValidateNymFormat(${s(name)}); e != nil { return e.Error() }; return "" }()`);
      if (bad) return bad.replace(/^namereg: /, "");
      if ((await vm("gno.land/r/sys/users", `IsNameTaken(${s(name)})`)).startsWith("(true")) return "That name is taken.";
      // the registrar also refuses a lookalike of a name taken (l/i/1, 0/o, dashes)
      return (await vm("gno.land/r/sys/users", `IsCanonicalTaken(${s(name)})`)).includes("(true bool)") ? "Too close to a name already taken." : "";
    },
    /** Many addresses' gno.land names in one read, "" for none, in order. */
    namesOf: async (addrs: readonly string[]) => {
      const ok = addrs.filter(isAddress).slice(0, 100); // checked before they go in the expression
      if (!ok.length) return [];
      const list = ok.map((a) => `address(${s(a)})`).join(", ");
      const out = await qstr("gno.land/r/sys/users", `func() string { o := ""; for _, a := range []address{${list}} { if d := ResolveAddress(a); d != nil { o += d.Name() }; o += "," }; return o }()`);
      const names = out.split(",");
      return ok.map((a, i) => ({ player: a, name: names[i] || "" }));
    },
    /** A page of the course ranking (most holes, then the best score against par): { mode, holes, players, offset, rows: [{ player, holes, strokes, par }], next (0 at the end) }. */
    courseLeaderboard: (offset = 0, limit = 10, mode = "assisted") =>
      qeval(`CourseLeaderboard(${s(m(mode))}, ${offset | 0}, ${limit | 0})`, checks.courseLeaderboard),
    /** A player's place on a hole's board: { rank (0: not on it), of, strokes }. */
    holeRank: (hole: string, mode: string, player: string) => qeval(`HoleRank(${s(hole)}, ${s(m(mode))}, address(${s(player)}))`, checks.holeRank),
    /** A player's best on a hole in a mode with its period and shots, or null: the ghost a duel races, replayed with replayRound then simulateFrom. */
    ghost: (hole: string, mode: string, player: string) =>
      isAddress(player)
        ? qeval(`Ghost(${s(hole)}, ${s(m(mode))}, address(${s(player)}))`, checks.ghost).then((g) => (g && g.player === player && g.mode === m(mode) && (g.hole === hole || g.hole.startsWith(hole + "/")) ? g : null)) // (the one asked for, or none)
        : Promise.resolve(null),
    /** A page of a hole's board: { hole, mode, par, players (named), finished (everyone), offset, rows: [{ player, strokes }], next (the next page's offset, 0 at the end) }. */
    holeLeaderboard: (hole: string, offset = 0, limit = 10, mode = "assisted") =>
      qeval(`HoleLeaderboard(${s(hole)}, ${s(m(mode))}, ${offset | 0}, ${limit | 0})`, checks.holeLeaderboard),
    /** One player's round under way on a hole ({ shots, strokes, period, rest, path… }), or null: none, holed (not kept: its best is) or Reset. */
    round: (hole: string, player: string) => qeval(`Round(${s(hole)}, address(${s(player)}))`, checks.round),
    /**
     * What a transaction's calls returned, as the node printed them (a call's
     * result, `("holed in 3 strokes" string)`, one after the other), from its
     * hash as a wallet gives it (base64, or hex); null when the node has no
     * such transaction, refused (errorKind "chain", its log) when it failed:
     * nothing of it was kept. A holed round is not kept: this is how a save knows.
     */
    txResult: async (hash: string) => {
      let hex = "";
      try {
        hex = /^(0x)?[0-9a-f]{64}$/i.test(hash) ? hash.replace(/^0x/i, "") : [...atob(hash)].map((c) => c.charCodeAt(0).toString(16).padStart(2, "0")).join("");
      } catch {}
      if (hex.length !== 64) throw refused("Not a transaction hash.");
      const c = new AbortController(), t = setTimeout(() => c.abort(), TIMEOUT);
      let r;
      try {
        const res = await fetch(`${rpc}/tx?hash=0x${hex}`, { signal: c.signal });
        if (!res.ok) throw new Error(`RPC ${res.status}`);
        const body = (await res.json()) as { error?: unknown; result?: { tx_result?: { ResponseBase?: { Error?: unknown; Log?: string; Data?: string } } } };
        r = body.result && body.result.tx_result && body.result.tx_result.ResponseBase;
      } catch (e) {
        throw down(e);
      } finally {
        clearTimeout(t);
      }
      // (the realm's own sentence for the player; the VM's whole log kept on the error)
      if (r && r.Error) throw refused(refusal(r.Log) || "The transaction failed.", r.Log);
      return r ? utf8(r.Data || "") : null;
    },
  };
}
export type Chain = ReturnType<typeof makeChain>;

/**
 * An RPC or gnoweb address from the page's own link (?rpc=, ?web=) is taken
 * only from an allowlist: this machine (http or https), the build's own
 * hosts, gno.land's (*.gno.land, https) and any listed in
 * NEXT_PUBLIC_ALLOWED_HOSTS (comma-separated host names, https). Anything else
 * falls back: a link must not point the game, Adena and every "read its code"
 * link at a look-alike node.
 */
export function safeEndpoint(given: string | null | undefined, fallback: string, pinned = pinnedPage()) {
  if (!given || pinned) return fallback;
  try {
    const u = new URL(given);
    const local = isLoopback(u.hostname);
    const ok = local ? /^https?:$/.test(u.protocol) : u.protocol === "https:" && allowedHost(u.hostname);
    if (ok) return u.origin + u.pathname.replace(/\/$/, "");
  } catch {}
  return fallback;
}
/** A built site on a public address plays its own chain only: a shared link's
 *  ?rpc= could otherwise send the wallet to a look-alike realm on another
 *  gno.land chain. The overrides are for dev builds and this machine. */
const pinnedPage = () => process.env.NODE_ENV === "production" && typeof location !== "undefined" && !isLoopback(location.hostname);
function allowedHost(h: string, extra = process.env.NEXT_PUBLIC_ALLOWED_HOSTS || "") {
  const list = [hostOf(process.env.NEXT_PUBLIC_RPC || ""), hostOf(process.env.NEXT_PUBLIC_WEB || ""), ...extra.split(",").map((x) => x.trim())].filter(Boolean);
  return h === "gno.land" || h.endsWith(".gno.land") || list.includes(h);
}

// a realm or package path as the chain names it, and nothing else
const PKG = /^gno\.land\/[rp]\/[\w/.-]+$/;
const ADDR = /^g1[0-9a-z]{38}$/;
// a data hole: a course slot "garden/7" or its version "garden/7/v2", a
// community hole "<address>/<slug>" or its version
const DATA = /^([a-z]{1,16}\/[1-9]\d{0,2}|g1[0-9a-z]{38}\/[a-z0-9-]{1,32})(\/v[1-9]\d*)?$/;
/** Whether s names a hole: a realm's path, or a data hole's id or alias. */
export const isHoleId = (s: unknown) => PKG.test(String(s)) || DATA.test(String(s));
/** A best as the realm keeps it (recordsOf). */
export interface Kept { strokes: number; height: number; period: number; shots: string }
// a kept best's shots: "angle,power,tick" (%.4f, %.4f, %d) joined by ";", 1 to 60
const SHOTS = /^-?\d{1,3}\.\d{4},\d{1,2}\.\d{4},-?\d{1,4}(;-?\d{1,3}\.\d{4},\d{1,2}\.\d{4},-?\d{1,4}){0,59}$/;
/** recordsOf's lines, "<player> <strokes> <height> <period> <shots>", each field as the realm writes it
 *  (golf.gno bestOf), a best's shots as many as its strokes; any other line dropped. */
function keptLines(out: string): [string, Kept][] {
  const got: [string, Kept][] = [];
  for (const line of out.split("\n")) {
    const [p, strokes, height, period, shots, ...rest] = line.split(" ");
    if (isAddress(p) && !rest.length && /^[1-9]\d?$/.test(strokes) && +strokes <= RULES.maxRoundStrokes && /^\d+$/.test(height) && /^-?\d+$/.test(period) && SHOTS.test(shots || "") && shots.split(";").length === +strokes)
      got.push([p, { strokes: +strokes, height: +height, period: +period, shots }]);
  }
  return got;
}
/** Whether s is a gno.land address (g1…, bech32, lower case). */
export const isAddress = (s: unknown) => typeof s === "string" && ADDR.test(s);

const PULL_SHARE = 0.24; // a pull this share of the viewport's short side is full power
/** How far a pull goes to full power on a vw × vh screen (px). */
export const pullFull = (vw: number, vh: number) => Math.max(120, Math.min(vw, vh) * PULL_SHARE);
/**
 * The pull, as a shot: the same pull always gives the same numbers. Its length
 * is measured in CSS pixels against the viewport's short side, so neither the
 * pixel density nor the browser's zoom changes it, and nothing depends on the
 * frame rate. Angle and power are rounded here, once, to what the chain is
 * sent: the preview and the shot use exactly these.
 */
export function pullShot(px: number, vw: number, vh: number, angleRad: number, maxPower: number = RULES.maxPower) {
  const full = pullFull(vw, vh);
  const power = Math.round(Math.min(px / full, 1) * maxPower * 100) / 100;
  let deg = (angleRad * 180) / Math.PI;
  // in [0, 360): 359.996 rounds to 0, as the chain records it, not to 360
  deg = (Math.round((((deg % 360) + 360) % 360) * 100) / 100) % 360;
  return { deg, power };
}

/** One shot as the realm parses it. The same string goes to SimulateRound and
 *  to PlayRound, so the preview and the record decide the same shot. */
export const shotOf = (angleDeg: number, power: number, tick?: number | null) => `${f(angleDeg)},${f(power)}` + (tick == null ? "" : `,${tick | 0}`);
/** A round's shots as the realm stores them ("%.4f,%.4f,%d": a shot sent with no tick is kept
 *  at tick 0), from a list of shotOf's or the chain's ";"-joined string: compared, the page's
 *  round and the chain's both go through it. */
export const roundShots = (shots: string | readonly string[]) =>
  (typeof shots === "string" ? shots.split(";") : shots)
    .map((x) => {
      const [a, p, t] = x.split(",");
      return shotOf(Number(a), Number(p), Number(t) || 0);
    })
    .join(";");
