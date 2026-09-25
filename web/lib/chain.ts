// Talking to the realm.
//
// Two reads, both free: no wallet, no transaction, no block to wait for. The
// chain resolves every shot — nothing here computes anything about a ball.
// See CLIENT.md for the contract.
//
// This is the one place the realm's JSON is parsed: each read is checked
// against the shape lib/types.ts gives it (the fields the page cannot do
// without), and a reply that is not that shape is refused here, as the realm's
// ("chain"), not left to fail somewhere in the scene.

import type {
  Bests, Extras, HoleLeaderboard, HoleRow, Holes, HoleState, Leaderboard, Mode, Rank, Round, SimulateFrom,
  SimulateRound, Standings, Vec2, Weather,
} from "./types";

/**
 * The realm's rules the client plays by, copied from gno.land/r/gnogolf/golf
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
  /** golf.gno's work model (workBudget, workPerShot, workPerWall, workPerPoint, workPerPiece) */
  work: { budget: 1.4e9, shot: 10e6, wall: 150e3, point: 1.2e6, piece: 15e3 },
  /** golf.gno's measured gas of the forecast in a commit, at most (the rain on the lane holes) */
  forecastGas: 170e6,
} as const;

// the hub: the build's (NEXT_PUBLIC_REALM, as gno.land/r/nym-golfer000/golf on
// pearl), else the local chain's
const REALM_ENV = process.env.NEXT_PUBLIC_REALM || "";
const REALM = /^gno\.land\/r\/[a-z0-9_-]+\/golf$/.test(REALM_ENV) ? REALM_ENV : "gno.land/r/gnogolf/golf";
/** The hub's gnoweb path ("/r/…/golf"). */
export const REALM_PATH = REALM.replace(/^gno\.land/, "");
const HOLES_TTL = 10 * 60e3; // a hole registered meanwhile shows within ten minutes, or in a new tab

export const DEFAULT_RPC = "http://127.0.0.1:26757";
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
const strokesRow = (r: unknown) => isObj(r) && typeof r.player === "string" && nums(r, "strokes");
const standingRow = (r: unknown) => strokesRow(r) && nums(r as Obj, "holes");
const checks = {
  holes: (v: unknown): v is HoleRow[] => Array.isArray(v) && v.every(holeRow),
  // Holes(): { version, play, successor, holes }
  holesReply: (v: unknown): v is Holes => isObj(v) && strs(v, "play", "successor") && Array.isArray(v.holes) && v.holes.every(holeRow),
  state: (v: unknown): v is HoleState =>
    isObj(v) && typeof v.hole === "string" && isObj(v.board) && isVec(v.start) && isVec(v.cup) && arrays(v, "walls", "posts", "zones"),
  simFrom,
  simRound: (v: unknown): v is SimulateRound => isObj(v) && Number.isInteger(v.strokes) && nums(v, "period") && simFrom(v),
  weather: (v: unknown): v is Weather => isObj(v) && Array.isArray(v.zones),
  extras: (v: unknown): v is Extras => isObj(v) && arrays(v, "walls", "posts", "zones"),
  leaderboard: (v: unknown): v is Leaderboard => board(v, standingRow, "holes"),
  bests: (v: unknown): v is Bests => board(v, strokesRow, "par") && typeof v.hole === "string",
  standings: (v: unknown): v is Standings => board(v, standingRow, "holes"),
  holeLeaderboard: (v: unknown): v is HoleLeaderboard => board(v, strokesRow, "par", "players", "finished", "offset", "next") && typeof v.hole === "string",
  rank: (v: unknown): v is Rank => isObj(v) && isMode(v.mode) && typeof v.player === "string" && nums(v, "rank", "of", "holes", "strokes"),
  round: (v: unknown): v is Round | null =>
    v === null || (isObj(v) && isPath(v.path) && isVec(v.rest) && isVec(v.ball) && strs(v, "player", "shots", "air", "cause") && typeof v.done === "boolean" && isMode(v.mode) && Number.isInteger(v.strokes) && nums(v, "period")),
};
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
      if (body.error) throw new Error(body.error.data || body.error.message);
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
      await new Promise((r) => setTimeout(r, 400));
      return once(url, ms, signal);
    }
  }

  /** A raw ABCI query; returns the decoded data string. */
  const abci = (path: string) => query(`${rpc}/abci_query?path=%22${path}%22`);

  // an expression evaluated in a realm, read-only: the VM's typed result as it printed it
  const vm = (realm: string, expr: string, ms?: number, signal?: AbortSignal | null) =>
    query(`${rpc}/abci_query?path=%22vm/qeval%22&data=0x${hexOf(`${realm}.${expr}`)}`, ms, signal);
  // a string result — ("…" string) — unwrapped; an answer that is not one is the chain's to answer for
  const unquote = (raw: string, expr: string) => {
    try {
      return String(JSON.parse(raw.slice(raw.indexOf("(") + 1, raw.lastIndexOf(" string)"))));
    } catch {
      throw refused(`The chain's answer to ${expr.slice(0, expr.indexOf("("))} is not a string.`);
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
      throw refused(`The chain's answer to ${expr.slice(0, expr.indexOf("("))} is not JSON.`);
    }
    // every object the realm returns says its version: a newer realm may have
    // moved a field this page reads
    if (isObj(v) && Number(v.version) > VERSION && !warned) {
      warned = true;
      console.warn(`gnogolf: the realm speaks version ${String(v.version)}, this page ${VERSION}`);
    }
    if (!ok(v)) throw refused(bad || `The chain's answer to ${expr.slice(0, expr.indexOf("("))} is not one this page can read.`);
    return v;
  }
  // a mode is sent exactly: the realm refuses any other word
  const m = (mode: string): Mode => (mode === "pro" ? "pro" : "assisted");

  // Params that do not move within a session (the chain id, the gas and
  // storage prices) are read once per ttl, not once a hole: the answer is kept,
  // a failure is not.
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

  return {
    rpc,
    web,
    realm: REALM,
    /** The node's current gas price, as ugnot per gas: { gas, price } → price / gas. */
    gasPrice: memo(async () => {
      const r = await abci("auth/gasprice");
      const j = JSON.parse(r) as { price: unknown; gas: unknown };
      return Number(String(j.price).replace(/[^0-9.]/g, "")) / Number(j.gas);
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
    /** One hole's geometry, skins, weather and wear (HoleState: State without the rounds, which the page never reads). */
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
    /**
     * One commit of a round under way, read-only: what the next PlayRoundAt
     * (or PlayRoundPro) of these shots would do from the exact ball ("rest")
     * at stroke number stroke, refused as that commit would be. SimulateRound's JSON.
     */
    simulateCommit: (hole: string, ball: Vec2, stroke: number, shots: readonly string[], period: number, ms?: number, signal?: AbortSignal | null) =>
      qeval(`SimulateCommit(${s(hole)}, ${fx(ball[0])}, ${fx(ball[1])}, ${stroke | 0}, ${s(shots.join(";"))}, ${period | 0})`, checks.simRound, ms, signal, NO_PATH),
    /** The weather's five minutes on the chain (block time / 300), and its forecast for a hole. */
    // an int64, not a string: its own unwrapping
    period: async () => {
      const raw = await vm(REALM, "Period()");
      const n = Number((raw.match(/^\((-?\d+) int64\)/) || [])[1]);
      if (!Number.isFinite(n)) throw new Error("The chain's period is not a number.");
      return n;
    },
    weather: (hole: string, period: number) => qeval(`Weather(${s(hole)}, ${period | 0})`, checks.weather),
    /** What a timed hole adds at one stroke of a round (0 = first shot). */
    extras: (hole: string, stroke: number) => qeval(`Extras(${s(hole)}, ${Math.max(0, stroke | 0)})`, checks.extras),
    /** The course-wide ranking of recorded rounds. */
    leaderboard: (mode = "assisted") => qeval(`Leaderboard(${s(m(mode))})`, checks.leaderboard),
    /** The best rounds of these players (at most 50) on a hole: { hole, mode, par, rows: [{ player, strokes }] }. */
    bests: (hole: string, mode: string, players: readonly string[]) =>
      qeval(`Bests(${s(hole)}, ${s(m(mode))}, ${s(players.slice(0, 50).join(","))})`, checks.bests),
    /** These players across the course: { mode, holes, rows: [{ player, holes, strokes }] }. */
    standings: (mode: string, players: readonly string[]) =>
      qeval(`Standings(${s(m(mode))}, ${s(players.slice(0, 50).join(","))})`, checks.standings),
    /** A player's place in a mode's course ranking: { rank (0: not ranked), of, holes, strokes }. */
    rank: (mode: string, player: string) => qeval(`Rank(${s(m(mode))}, address(${s(player)}))`, checks.rank),
    /** A gno.land name's address, or "" (r/sys/users). */
    resolveName: (name: string) =>
      /^[a-z0-9._-]{1,64}$/i.test(name)
        ? qstr("gno.land/r/sys/users", `func() string { d, _ := ResolveName(${s(name)}); if d == nil { return "" }; return d.Addr().String() }()`)
        : Promise.resolve(""),
    /** An address's gno.land name, or "". */
    nameOf: (addr: string) =>
      isAddress(addr)
        ? qstr("gno.land/r/sys/users", `func() string { d := ResolveAddress(address(${s(addr)})); if d == nil { return "" }; return d.Name() }()`)
        : Promise.resolve(""),
    /** A page of a hole's board: { hole, mode, par, players (named), finished (everyone), offset, rows: [{ player, strokes }], next (the next page's offset, 0 at the end) }. */
    holeLeaderboard: (hole: string, offset = 0, limit = 10, mode = "assisted") =>
      qeval(`HoleLeaderboard(${s(hole)}, ${s(m(mode))}, ${offset | 0}, ${limit | 0})`, checks.holeLeaderboard),
    /** One player's round on a hole ({ shots, strokes, done, period, rest, path… }), or null: none, or Reset since. */
    round: (hole: string, player: string) => qeval(`Round(${s(hole)}, address(${s(player)}))`, checks.round),
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
export function safeEndpoint(given: string | null | undefined, fallback: string) {
  if (!given) return fallback;
  try {
    const u = new URL(given);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
    const ok = local ? /^https?:$/.test(u.protocol) : u.protocol === "https:" && allowedHost(u.hostname);
    if (ok) return u.origin + u.pathname.replace(/\/$/, "");
  } catch {}
  return fallback;
}
const hostOf = (x: string) => {
  try {
    return new URL(x).hostname;
  } catch {
    return "";
  }
};
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
/** Whether s is a gno.land address (g1…, bech32, lower case). */
export const isAddress = (s: unknown) => typeof s === "string" && ADDR.test(s);

const PULL_SHARE = 0.24; // a pull this share of the viewport's short side is full power
/**
 * The pull, as a shot: the same pull always gives the same numbers. Its length
 * is measured in CSS pixels against the viewport's short side, so neither the
 * pixel density nor the browser's zoom changes it, and nothing depends on the
 * frame rate. Angle and power are rounded here, once, to what the chain is
 * sent: the preview and the shot use exactly these.
 */
export function pullShot(px: number, vw: number, vh: number, angleRad: number, maxPower: number = RULES.maxPower) {
  const full = Math.max(120, Math.min(vw, vh) * PULL_SHARE);
  const power = Math.round(Math.min(px / full, 1) * maxPower * 100) / 100;
  let deg = (angleRad * 180) / Math.PI;
  // in [0, 360): 359.996 rounds to 0, as the chain records it, not to 360
  deg = (Math.round((((deg % 360) + 360) % 360) * 100) / 100) % 360;
  return { deg, power };
}

/** One shot as the realm parses it. The same string goes to SimulateRound and
 *  to PlayRound, so the preview and the record decide the same shot. */
export const shotOf = (angleDeg: number, power: number, tick?: number | null) => `${f(angleDeg)},${f(power)}` + (tick == null ? "" : `,${tick | 0}`);
