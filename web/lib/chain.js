// Talking to the realm.
//
// Two reads, both free: no wallet, no transaction, no block to wait for. The
// chain resolves every shot — nothing here computes anything about a ball.
// See CLIENT.md for the contract.

const REALM = "gno.land/r/gnogolf/golf";
const HOLES_TTL = 10 * 60e3; // a hole registered meanwhile shows within ten minutes, or in a new tab

export const DEFAULT_RPC = "http://127.0.0.1:26757";
export const DEFAULT_WEB = "http://127.0.0.1:8888";

// Gno wants a float where the signature says float64; an integer literal would
// be an untyped int, so every number goes out with a decimal point.
const f = (n) => Number(n).toFixed(4);
const s = (v) => JSON.stringify(String(v));
// an exact float, as the realm gave it (its shortest round-trip form), with the
// decimal point a float64 argument wants
const fx = (n) => {
  const t = String(Number(n));
  if (!Number.isFinite(Number(n))) throw new Error("A ball must be on the board.");
  return /[.e]/.test(t) ? t : t + ".0";
};
const hexOf = (str) => [...new TextEncoder().encode(str)].map((b) => b.toString(16).padStart(2, "0")).join("");
// the JSON shape this page reads (every realm object carries "version")
const VERSION = 1;
let warned = false;
/** The realm's own sentence in a VM panic log ("golf: …"), or null. */
function refusal(log) {
  const m = String(log || "").match(/panic: ([^\n]+)/) || String(log || "").match(/(golf: [^"\n]+)/);
  return m ? m[1].replace(/\s+$/, "") : null;
}

export function makeChain({ rpc = DEFAULT_RPC, web = DEFAULT_WEB } = {}) {
  // Every request gives up after its time (a node that hangs must not hang
  // the game), is checked at each level, and its bytes read as UTF-8.
  const TIMEOUT = 8000;
  const utf8 = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64 || ""), (c) => c.charCodeAt(0)));
  // signal: the caller's, to cancel a request it no longer wants (a stale
  // aim preview). The timeout is a timer of its own, not AbortSignal.timeout,
  // which older Safari lacks.
  // An error is tagged with its kind: "down" when the node did not answer
  // (refused, timed out, a proxy's HTML page), "chain" when it answered with a
  // refusal — whose text is the realm's own sentence, not the VM's trace.
  const down = (e) => Object.assign(e instanceof Error ? e : new Error(String(e)), { kind: "down" });
  async function once(url, ms, signal) {
    const c = new AbortController(), t = setTimeout(() => c.abort(new DOMException("signal timed out", "TimeoutError")), ms);
    const stop = () => c.abort(signal.reason);
    if (signal) signal.aborted ? stop() : signal.addEventListener("abort", stop, { once: true });
    try {
      let body;
      try {
        const res = await fetch(url, { signal: c.signal });
        if (!res.ok) throw new Error(`RPC ${res.status}`);
        body = await res.json();
      } catch (e) {
        throw signal && signal.aborted ? e : down(e);
      }
      if (body.error) throw new Error(body.error.data || body.error.message);
      const r = body.result && body.result.response && body.result.response.ResponseBase;
      if (!r) throw down(new Error("The node's answer had no response in it."));
      if (r.Error) throw Object.assign(new Error(refusal(r.Log) || JSON.stringify(r.Error)), { kind: "chain", log: r.Log });
      return utf8(r.Data);
    } finally {
      clearTimeout(t);
      if (signal) signal.removeEventListener("abort", stop);
    }
  }
  // reads change nothing: one that the network dropped is asked once more
  async function query(url, ms = TIMEOUT, signal = null) {
    try {
      return await once(url, ms, signal);
    } catch (e) {
      if (e.kind !== "down" || (signal && signal.aborted)) throw e;
      await new Promise((r) => setTimeout(r, 400));
      return once(url, ms, signal);
    }
  }

  /** A raw ABCI query; returns the decoded data string. */
  const abci = (path) => query(`${rpc}/abci_query?path=%22${path}%22`);

  // a string answer from any realm (r/sys/users): ("…" string), unwrapped once
  async function qstr(realm, expr, ms) {
    const raw = await query(`${rpc}/abci_query?path=%22vm/qeval%22&data=0x${hexOf(`${realm}.${expr}`)}`, ms);
    return JSON.parse(raw.slice(raw.indexOf("(") + 1, raw.lastIndexOf(" string)")));
  }

  async function qeval(expr, ms, signal) {
    const hex = hexOf(`${REALM}.${expr}`);
    // the reply is a Gno typed result — ("<json>" string) — so it unwraps twice
    const raw = await query(`${rpc}/abci_query?path=%22vm/qeval%22&data=0x${hex}`, ms, signal);
    const inner = raw.slice(raw.indexOf("(") + 1, raw.lastIndexOf(" string)"));
    const v = JSON.parse(JSON.parse(inner));
    // every object the realm returns says its version: a newer realm may have
    // moved a field this page reads
    if (v && v.version > VERSION && !warned) (warned = true), console.warn(`gnogolf: the realm speaks version ${v.version}, this page ${VERSION}`);
    return v;
  }
  // a mode is sent exactly: the realm refuses any other word
  const m = (mode) => (mode === "pro" ? "pro" : "assisted");

  // Params that do not move within a session (the chain id, the gas and
  // storage prices) are read once per ttl, not once a hole: the answer is kept,
  // a failure is not.
  const memo = (fn, ttl) => {
    let at = 0, p = null;
    return () => {
      if (!p || performance.now() - at > ttl) {
        at = performance.now();
        p = fn().catch((e) => ((p = null), Promise.reject(e)));
      }
      return p;
    };
  };
  // The chain's clock: the node's last block time against this device's, from
  // /status (re-read once a minute at most). The chain judges a period by the
  // block a transaction lands in, never by the device.
  let skew = 0;
  const status = memo(async () => {
    const c = new AbortController(), t = setTimeout(() => c.abort(), 4000);
    try {
      const res = await fetch(`${rpc}/status`, { signal: c.signal });
      if (!res.ok) throw new Error(`RPC ${res.status}`);
      const r = (await res.json()).result;
      const bt = Date.parse(r.sync_info && r.sync_info.latest_block_time);
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
      const j = JSON.parse(r);
      return Number(String(j.price).replace(/[^0-9.]/g, "")) / Number(j.gas);
    }, PARAMS_TTL),
    /** How much ugnot an address holds here; 0 for an account the chain has never seen. */
    // null when the node cannot say: an RPC outage is not an empty account
    balance: async (addr) => {
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
    roundURL: (hole, player) =>
      PKG.test(String(hole)) && ADDR.test(String(player)) ? new URL(`${REALM.replace(/^gno\.land/, "")}:${hole}/${player}`, web + "/").href : "#",
    /** gnoweb link to a realm's source: a player can read a hole before trusting it. */
    // links built from what the chain says, checked first: a realm path, an address
    sourceURL: (pkgPath) => (PKG.test(String(pkgPath)) ? new URL(String(pkgPath).replace(/^gno\.land/, "") + "$source", web + "/").href : "#"),
    /** Every registered hole: id, name, official (one of the course's), world, order, par, plays, best, next (archived for). */
    // kept for the tab (sessionStorage, HOLES_TTL): a reload or a Retry does
    // not pay the list again (163M of query gas); fresh=true reads it anyway
    holes: async (fresh = false) => {
      const key = `gnogolf.holes|${rpc}`;
      try {
        const c = !fresh && JSON.parse(sessionStorage.getItem(key) || "null");
        if (c && Date.now() - c.at < HOLES_TTL && Array.isArray(c.list) && c.list.length) return c.list;
      } catch {}
      const list = await qeval("Holes()");
      try {
        sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), list }));
      } catch {}
      return list;
    },
    /** One hole's geometry, skins, wear and rounds in flight. */
    state: (hole) => qeval(`State(${s(hole)})`),
    /**
     * One stroke, read-only, from an exact ball: what PlayRoundAt would play
     * for stroke `stroke` (0 = the first) of a round in `period`. ball is the
     * "rest" of the previous answer, exactly as it came; shot is shotOf's.
     * { holed, bounces, path, air, cause, rest }.
     */
    simulateFrom: (hole, ball, shot, stroke, period, ms, signal) =>
      qeval(`SimulateFrom(${s(hole)}, ${fx(ball[0])}, ${fx(ball[1])}, ${s(shot)}, ${stroke | 0}, ${period | 0})`, ms, signal),
    /**
     * A round replayed from the tee, read-only: the last shot's path and the
     * stroke count, exactly what PlayRound would record for the same list.
     * shots is ["angle,power", …] as made by shotOf.
     */
    simulateRound: (hole, shots, period, ms, signal) =>
      period == null
        ? qeval(`SimulateRound(${s(hole)}, ${s(shots.join(";"))})`, ms, signal)
        : qeval(`SimulateRoundAt(${s(hole)}, ${s(shots.join(";"))}, ${period | 0})`, ms, signal),
    /** The weather's five minutes on the chain (block time / 300), and its forecast for a hole. */
    // an int64, not a string: its own unwrapping
    period: async () => {
      const raw = await query(`${rpc}/abci_query?path=%22vm/qeval%22&data=0x${hexOf(`${REALM}.Period()`)}`);
      const n = Number((raw.match(/^\((-?\d+) int64\)/) || [])[1]);
      if (!Number.isFinite(n)) throw new Error("The chain's period is not a number.");
      return n;
    },
    weather: (hole, period) => qeval(`Weather(${s(hole)}, ${period | 0})`),
    /** What a timed hole adds at one stroke of a round (0 = first shot). */
    extras: (hole, stroke) => qeval(`Extras(${s(hole)}, ${Math.max(0, stroke | 0)})`),
    /** The course-wide ranking of recorded rounds. */
    leaderboard: (mode = "assisted") => qeval(`Leaderboard(${s(m(mode))})`),
    /** The best rounds of these players (at most 50) on a hole: { hole, mode, par, rows: [{ player, strokes }] }. */
    bests: (hole, mode, players) => qeval(`Bests(${s(hole)}, ${s(m(mode))}, ${s(players.slice(0, 50).join(","))})`),
    /** These players across the course: { mode, holes, rows: [{ player, holes, strokes }] }. */
    standings: (mode, players) => qeval(`Standings(${s(m(mode))}, ${s(players.slice(0, 50).join(","))})`),
    /** A page of every course standing in a mode, named or not, by address: { rows: [{ player, holes, strokes }], next ("" at the end) }. */
    players: (mode, after = "", limit = 100) => qeval(`Players(${s(m(mode))}, ${s(after)}, ${limit | 0})`),
    /** A gno.land name's address, or "" (r/sys/users). */
    resolveName: (name) =>
      /^[a-z0-9._-]{1,64}$/i.test(name)
        ? qstr("gno.land/r/sys/users", `func() string { d, _ := ResolveName(${s(name)}); if d == nil { return "" }; return d.Addr().String() }()`)
        : Promise.resolve(""),
    /** An address's gno.land name, or "". */
    nameOf: (addr) =>
      /^g1[0-9a-z]{38}$/.test(addr)
        ? qstr("gno.land/r/sys/users", `func() string { d := ResolveAddress(address(${s(addr)})); if d == nil { return "" }; return d.Name() }()`)
        : Promise.resolve(""),
    /** A page of a hole's board: { hole, mode, par, players (named, what to page through), finished (everyone), offset, rows: [{ player, strokes }] }. */
    holeLeaderboard: (hole, offset = 0, limit = 10, mode = "assisted") => qeval(`HoleLeaderboard(${s(hole)}, ${s(m(mode))}, ${offset | 0}, ${limit | 0})`),
    /** One player's round on a hole ({ shots, strokes, done, period, rest, path… }), or null: none, or Reset since. */
    round: (hole, player) => qeval(`Round(${s(hole)}, address(${s(player)}))`),
  };
}

/** One shot as the realm parses it. The same string goes to SimulateRound and
 *  to PlayRound, so the preview and the record decide the same shot. */
/**
 * The pull, as a shot: the same pull always gives the same numbers. Its length
 * is measured in CSS pixels against the viewport's short side, so neither the
 * pixel density nor the browser's zoom changes it, and nothing depends on the
 * frame rate. Angle and power are rounded here, once, to what the chain is
 * sent: the preview and the shot use exactly these.
 */
/**
 * An RPC or gnoweb address from the page's own link (?rpc=, ?web=) is taken
 * only from an allowlist: this machine (http or https), the build's own
 * hosts, gno.land's (*.gno.land, https) and any listed in
 * NEXT_PUBLIC_ALLOWED_HOSTS (comma-separated host names, https). Anything else
 * falls back: a link must not point the game, Adena and every "read its code"
 * link at a look-alike node.
 */
export function safeEndpoint(given, fallback) {
  if (!given) return fallback;
  try {
    const u = new URL(given);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
    const ok = local ? /^https?:$/.test(u.protocol) : u.protocol === "https:" && allowedHost(u.hostname);
    if (ok) return u.origin + u.pathname.replace(/\/$/, "");
  } catch {}
  return fallback;
}
const hostOf = (x) => {
  try {
    return new URL(x).hostname;
  } catch {
    return "";
  }
};
function allowedHost(h, extra = process.env.NEXT_PUBLIC_ALLOWED_HOSTS || "") {
  const list = [hostOf(process.env.NEXT_PUBLIC_RPC || ""), hostOf(process.env.NEXT_PUBLIC_WEB || ""), ...extra.split(",").map((x) => x.trim())].filter(Boolean);
  return h === "gno.land" || h.endsWith(".gno.land") || list.includes(h);
}

// a realm or package path as the chain names it, and nothing else
const PKG = /^gno\.land\/[rp]\/[\w/.-]+$/;
const ADDR = /^g1[0-9a-z]{38}$/;

const PULL_SHARE = 0.24; // a pull this share of the viewport's short side is full power
export function pullShot(px, vw, vh, angleRad, maxPower = 10) {
  const full = Math.max(120, Math.min(vw, vh) * PULL_SHARE);
  const power = Math.round(Math.min(px / full, 1) * maxPower * 100) / 100;
  let deg = (angleRad * 180) / Math.PI;
  // in [0, 360): 359.996 rounds to 0, as the chain records it, not to 360
  deg = (Math.round((((deg % 360) + 360) % 360) * 100) / 100) % 360;
  return { deg, power };
}

export const shotOf = (angleDeg, power, tick) => `${f(angleDeg)},${f(power)}` + (tick == null ? "" : `,${tick | 0}`);
