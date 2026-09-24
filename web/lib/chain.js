// Talking to the realm.
//
// Two reads, both free: no wallet, no transaction, no block to wait for. The
// chain resolves every shot — nothing here computes anything about a ball.
// See CLIENT.md for the contract.

const REALM = "gno.land/r/gnogolf/golf";

export const DEFAULT_RPC = "http://127.0.0.1:26757";
export const DEFAULT_WEB = "http://127.0.0.1:8888";

// Gno wants a float where the signature says float64; an integer literal would
// be an untyped int, so every number goes out with a decimal point.
const f = (n) => Number(n).toFixed(4);
const s = (v) => JSON.stringify(String(v));

export function makeChain({ rpc = DEFAULT_RPC, web = DEFAULT_WEB } = {}) {
  // Every request gives up after its time (a node that hangs must not hang
  // the game), is checked at each level, and its bytes read as UTF-8.
  const TIMEOUT = 8000;
  const utf8 = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64 || ""), (c) => c.charCodeAt(0)));
  async function query(url, ms = TIMEOUT) {
    const res = await fetch(url, { signal: AbortSignal.timeout(ms) });
    if (!res.ok) throw new Error(`RPC ${res.status}`);
    const body = await res.json();
    if (body.error) throw new Error(body.error.data || body.error.message);
    const r = body.result && body.result.response && body.result.response.ResponseBase;
    if (!r) throw new Error("The node's answer had no response in it.");
    if (r.Error) throw new Error(r.Log || JSON.stringify(r.Error));
    return utf8(r.Data);
  }

  /** A raw ABCI query; returns the decoded data string. */
  const abci = (path) => query(`${rpc}/abci_query?path=%22${path}%22`);

  async function qeval(expr, ms) {
    const call = `${REALM}.${expr}`;
    const hex = [...new TextEncoder().encode(call)].map((b) => b.toString(16).padStart(2, "0")).join("");
    // the reply is a Gno typed result — ("<json>" string) — so it unwraps twice
    const raw = await query(`${rpc}/abci_query?path=%22vm/qeval%22&data=0x${hex}`, ms);
    const inner = raw.slice(raw.indexOf("(") + 1, raw.lastIndexOf(" string)"));
    return JSON.parse(JSON.parse(inner));
  }

  return {
    rpc,
    web,
    realm: REALM,
    /** The node's current gas price, as ugnot per gas: { gas, price } → price / gas. */
    gasPrice: async () => {
      const r = await abci("auth/gasprice");
      const j = JSON.parse(r);
      return Number(String(j.price).replace(/[^0-9.]/g, "")) / Number(j.gas);
    },
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
    chainId: async () => (await (await fetch(`${rpc}/status`)).json()).result.node_info.network,
    /** gnoweb page of one player's round on a hole. */
    roundURL: (hole, player) =>
      PKG.test(String(hole)) && ADDR.test(String(player)) ? new URL(`${REALM.replace(/^gno\.land/, "")}:${hole}/${player}`, web + "/").href : "#",
    /** gnoweb link to a realm's source: a player can read a hole before trusting it. */
    // links built from what the chain says, checked first: a realm path, an address
    sourceURL: (pkgPath) => (PKG.test(String(pkgPath)) ? new URL(String(pkgPath).replace(/^gno\.land/, "") + "$source", web + "/").href : "#"),
    /** Every registered hole: id, name, owning realm, plays, best. */
    holes: () => qeval("Holes()"),
    /** One hole's geometry, skins, wear and rounds in flight. */
    state: (hole) => qeval(`State(${s(hole)})`),
    /** What a shot would do. Angle in degrees, 0 = +X, 90 = +Y. Power 0 to 10. */
    /**
     * A round replayed from the tee, read-only: the last shot's path and the
     * stroke count, exactly what PlayRound would record for the same list.
     * shots is ["angle,power", …] as made by shotOf.
     */
    simulateRound: (hole, shots, period, ms) =>
      period == null
        ? qeval(`SimulateRound(${s(hole)}, ${s(shots.join(";"))})`, ms)
        : qeval(`SimulateRoundAt(${s(hole)}, ${s(shots.join(";"))}, ${period | 0})`, ms),
    /** The weather's quarter hour on the chain (block time / 900), and its forecast for a hole. */
    period: () => qeval("Period()"),
    weather: (hole, period) => qeval(`Weather(${s(hole)}, ${period | 0})`),
    /** What a timed hole adds at one stroke of a round (0 = first shot). */
    extras: (hole, stroke) => qeval(`Extras(${s(hole)}, ${Math.max(0, stroke | 0)})`),
    /** The course-wide ranking of recorded rounds. */
    leaderboard: () => qeval("Leaderboard()"),
    /** One player's round on a hole, or null — read back after recording. */
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
 * An RPC or gnoweb address from the page's own link is trusted only if it is
 * the default, the build's, or this machine; anything else must be https. It
 * goes to Adena (networkInfo) and into every code link.
 */
export function safeEndpoint(given, fallback) {
  if (!given) return fallback;
  try {
    const u = new URL(given);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
    if (u.protocol === "https:" || (u.protocol === "http:" && local)) return u.origin + u.pathname.replace(/\/$/, "");
  } catch {}
  return fallback;
}

// a realm or package path as the chain names it, and nothing else
const PKG = /^gno\.land\/[rp]\/[\w/.-]+$/;
const ADDR = /^g1[0-9a-z]{38}$/;

export const PULL_SHARE = 0.24; // a pull this share of the viewport's short side is full power
export function pullShot(px, vw, vh, angleRad, maxPower = 10) {
  const full = Math.max(120, Math.min(vw, vh) * PULL_SHARE);
  const power = Math.round(Math.min(px / full, 1) * maxPower * 100) / 100;
  let deg = (angleRad * 180) / Math.PI;
  deg = Math.round((((deg % 360) + 360) % 360) * 100) / 100;
  return { deg, power };
}
export function demoPull() {
  const a = pullShot(170, 1440, 700, Math.PI / 4), b = pullShot(170, 1440, 700, Math.PI / 4 + 1e-9);
  console.assert(a.deg === b.deg && a.power === b.power && shotOf(a.deg, a.power) === shotOf(b.deg, b.power), "same pull, same shot");
  // zoom 110%: the CSS viewport and the pull shrink together
  const z = pullShot(170 / 1.1, 1440 / 1.1, 700 / 1.1, Math.PI / 4);
  console.assert(Math.abs(z.power - a.power) < 0.011, "zoom does not change the power");
  console.assert(pullShot(9999, 800, 600, 0).power === 10 && pullShot(0, 800, 600, -Math.PI / 2).deg === 270, "caps and wraps");
  return "ok";
}

export const shotOf = (angleDeg, power, tick) => `${f(angleDeg)},${f(power)}` + (tick == null ? "" : `,${tick | 0}`);
