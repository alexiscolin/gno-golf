// Adena, the gno.land browser wallet. The page asks it two things only: who is
// playing, and to sign one round.
//
// A round is recorded as one transaction with two calls: Reset puts the
// player's ball back on the tee, PlayRound replays the shot list from there.
// A round too heavy for one transaction goes in two (or more): the first
// Resets and plays the first strokes, the next continue it (splitRound).
// The chain re-runs every shot itself — the page sends decisions, never
// outcomes — so a recorded score is one nobody can type in.

const wallet = () => (typeof window !== "undefined" ? window.adena : undefined);

export const hasAdena = () => !!wallet();
export const ADENA_URL = "https://www.adena.app/";

// Adena's status codes worth telling apart (docs.adena.app, "errors")
const CANCELLED = 4000, LOCKED = 2000, BUSY = 1001, NOT_CONNECTED = 1000;

/** What went wrong, in words a player can act on. */
function why(res, fallback) {
  const code = res && res.code;
  if (code === CANCELLED) return "Cancelled in Adena — nothing was sent.";
  if (code === LOCKED) return "Adena is locked. Unlock it and try again.";
  if (code === BUSY) return "An Adena window is already open. Finish or close it first.";
  if (code === NOT_CONNECTED) return "Adena is not connected to this page yet.";
  const chain = res && res.data && (res.data.error?.message || res.data.log || res.data.error);
  return (typeof chain === "string" && chain) || (res && res.message) || fallback;
}

// the same address written the same way: Adena compares RPCs as strings
const norm = (u) => String(u || "").trim().replace(/\/+$/, "");

/**
 * Puts Adena on this page's chain (id and RPC), adding the network if it has
 * never seen it. Adena's approval screen waits — fee and deposit blank, Approve
 * greyed — until its active network is exactly networkInfo's, so this runs
 * before every signature. Adena refuses a second network on an RPC it already
 * knows: one left from an older chain on this node (same address, another
 * chain id) has to be removed in Adena by hand, and the error says how.
 */
async function ensureNetwork(a, { chainId, rpc, name = "Gnogolf chain" }) {
  if (!chainId) return;
  const active = async () => {
    try {
      const n = await a.GetNetwork();
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
export async function connect({ chainId, rpc, name = "Gnogolf chain" }) {
  const a = wallet();
  if (!a) throw new Error("Adena is not installed in this browser.");

  const est = await a.AddEstablish("Gnogolf");
  if (est.status !== "success" && est.type !== "ALREADY_CONNECTED") throw new Error(why(est, "Adena did not connect."));
  const acc = await a.GetAccount();
  if (acc.status !== "success") throw new Error(why(acc, "Adena did not share an account."));
  let { address, chainId: on } = acc.data;

  if (chainId && on !== chainId) {
    await ensureNetwork(a, { chainId, rpc, name });
    on = chainId;
  }
  return { address, chainId: on, rpcOk: await onOurNode(rpc) };
}

// Adena simulates on networkInfo's RPC, but only once its active network is
// that very network (same chain id, same RPC string): this tells whether it is.
const port = (u) => {
  try {
    const x = new URL(u);
    return `${x.hostname.replace("localhost", "127.0.0.1")}:${x.port || (x.protocol === "https:" ? 443 : 80)}`;
  } catch {
    return String(u);
  }
};
/** true when Adena's active network is this page's node, false when it is another, null when it cannot say. */
export async function onOurNode(rpc) {
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
const listeners = new Set();
let listening = false;
export function onWalletChange(fn) {
  const a = wallet();
  if (!a || !a.On) return () => {};
  if (!listening) {
    listening = true;
    const all = (...x) => listeners.forEach((f) => f(...x));
    a.On("changedAccount", all);
    a.On("changedNetwork", all);
  }
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Gas, by the realm's own model of a commit's work (golf.gno, work): per
// shot 10M, plus 150K per wall, plus, per point of its path, 1.2M and 15K per
// piece of any kind (walls, posts, zones, the weather's). That model is fitted
// to bound every measured shot by 1.25× at least; the call itself, the Reset
// and the forecast add up to ~170M. Zones are cheap next to walls: counted by
// path point, not as walls (the old estimate refused rounds that fit).
// what is asked of the account: the gas at the price, with half again for a
// price that rises between the reading and the block
const feeFor = (gasWanted, price) => Math.ceil(gasWanted * price * 1.5);
// Adena simulates every tx with 2e9 gas at most: the ask stays under it.
// Whether a round fits one commit is the chain's to say (SimulateRound's
// "commit the first N"), not this estimate's: see splitRound.
const MAX_GAS = 1_900_000_000;
const PER_CALL = 170e6;
/** The gas one commit of these strokes should need. c: { walls, others, pts: [path length per stroke] }. */
export function gasOf(c, from = 0, to = (c.pts || []).length) {
  let g = PER_CALL;
  const pieces = (c.walls || 0) + (c.others || 0);
  for (let i = from; i < to; i++) g += 10e6 + 150e3 * (c.walls || 0) + ((c.pts || [])[i] || 60) * (1.2e6 + 15e3 * pieces);
  return Math.min(Math.ceil(g), MAX_GAS);
}

/**
 * The commits a round is recorded in: [[from, to), …]. The chain refuses a
 * list too heavy for one transaction with "commit the first N, then the
 * rest"; asked first (check: SimulateRoundAt of the whole list), so that the
 * split is known before Adena opens. The rest is cut the same way, N at a
 * time. Throws, in words, when the chain refuses the round for any other
 * reason: nothing goes to Adena then.
 */
export async function splitRound(shots, check) {
  let n = shots.length;
  try {
    await check(shots);
  } catch (e) {
    const m = String(e.message || e).match(/commit the first (\d+)/);
    if (!m) throw e;
    n = Number(m[1]);
    if (!(n >= 1)) throw new Error("Even one shot of this round is more than one transaction can replay. It cannot be saved.");
  }
  const parts = [];
  for (let i = 0; i < shots.length; i += n) parts.push([i, Math.min(shots.length, i + n)]);
  return parts;
}

/**
 * Signs one commit of this round: Reset + PlayRound… for the first (reset),
 * PlayRound… alone for the next ones, which continue the round where the
 * chain has it. Resolves with the tx (hash, height).
 */
export async function recordRound({ address, realm, hole, shots, gas, period, reset = true, mode = "assisted", price = 0.001, chainId, rpc }) {
  const a = wallet();
  if (!a) throw new Error("Adena is not installed in this browser.");
  await ensureNetwork(a, { chainId, rpc });
  const gasWanted = Math.min(gas || MAX_GAS, MAX_GAS);
  const gasFee = feeFor(gasWanted, price);
  // no balance gate here: Adena itself says when an account cannot pay, and
  // the page warns beforehand (shortOf) without keeping the wallet shut
  const call = (func, args) => ({
    type: "/vm.m_call",
    value: { caller: address, send: "", pkg_path: realm, func, args },
  });
  const res = await a.DoContract({
    // in the weather the round was played in (its period): the chain takes
    // the current one or the one before
    messages: [
      ...(reset ? [call("Reset", [hole])] : []),
      // a pro round goes on the pro board (the mode is the one it was played in)
      mode === "pro"
        ? call("PlayRoundPro", [hole, shots.join(";"), String(period ?? 0)])
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
    const e = new Error(why(res, "The transaction was not sent."));
    e.cancelled = res.code === CANCELLED;
    throw e;
  }
  return res.data;
}

// The storage a save writes, in bytes (fix-hub.md, measured): a first finish
// on a hole writes the round, the best and the board entry (~6.6 KB), and a
// player's first course finish ~2.5 KB more for the ranking; a replay of a
// hole already saved replaces what is there (~0).
export const depositBytes = (first) => (first ? 9100 : 300);

/** How much GNOT an account lacks to save a round (gas and deposit), 0 if it has enough; null if unknown. */
export const shortOf = (gas, price, deposit, balance) =>
  balance == null ? null : Math.max(0, feeFor(gas, price) + deposit - balance) / 1e6;

/** What a round's gas costs, in GNOT, shown before anyone signs. */
export const costOf = (gas, price = 0.001) => (feeFor(gas, price) / 1e6).toFixed(3);

// the self-check: the chain's "first N" cuts the round N at a time; any other refusal stops it
