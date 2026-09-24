// Adena, the gno.land browser wallet. The page asks it two things only: who is
// playing, and to sign one round.
//
// A round is recorded as one transaction with two calls: Reset puts the
// player's ball back on the tee, PlayRound replays the shot list from there.
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
export async function ensureNetwork(a, { chainId, rpc, name = "Gnogolf chain" }) {
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

// Gas, as measured on the holes as built: ~20M for the call itself, then per
// replayed shot ~5M plus ~4.5M for every wall or post the ball is tested
// against (the Corridor, 24 walls, is ~120M a shot). Asked with a third of
// headroom: the fee is paid on what is asked, so asking blindly high costs
// the player real money.
// what is asked of the account: the gas at the price, with half again for a
// price that rises between the reading and the block
const feeFor = (gasWanted, price) => Math.ceil(gasWanted * price * 1.5);
// Adena simulates every tx with 2e9 gas at most: a round asking more would fail
// there, so the ask stays under it (MAX_GAS) and a round over it is refused
// before Adena opens
export const MAX_GAS = 1_900_000_000;
const need = (shots, pieces) => Math.ceil((20e6 + shots * (5e6 + 4.5e6 * pieces)) * 1.35);
const gasFor = (shots, pieces = 8) => Math.min(need(shots, pieces), MAX_GAS);

/** Signs Reset + PlayRound for this round. Resolves with the tx (hash, height). */
export async function recordRound({ address, realm, hole, shots, pieces, period, price = 0.001, chainId, rpc }) {
  const a = wallet();
  if (!a) throw new Error("Adena is not installed in this browser.");
  if (need(shots.length, pieces) > MAX_GAS * 1.35)
    throw new Error(`This round is too long to record in one transaction (${shots.length} strokes on a hole this busy). Play it again in fewer strokes.`);
  await ensureNetwork(a, { chainId, rpc });
  const gasWanted = gasFor(shots.length, pieces);
  const gasFee = feeFor(gasWanted, price);
  // no balance gate here: Adena itself says when an account cannot pay, and
  // the page warns beforehand (shortOf) without keeping the wallet shut
  const call = (func, args) => ({
    type: "/vm.m_call",
    value: { caller: address, send: "", pkg_path: realm, func, args },
  });
  const res = await a.DoContract({
    // in the weather the round was played in (its quarter hour): the chain
    // takes the current one or the one before
    messages: [
      call("Reset", [hole]),
      period == null ? call("PlayRound", [hole, shots.join(";")]) : call("PlayRoundAt", [hole, shots.join(";"), String(period)]),
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

/** How much GNOT an account lacks to record a round, 0 if it has enough; null if unknown. */
export const shortOf = (shots, pieces, price, balance) =>
  balance == null ? null : Math.max(0, feeFor(gasFor(shots, pieces), price) - balance) / 1e6;

/** What a round costs to record, in GNOT, shown before anyone signs. */
export const costOf = (shots, pieces, price = 0.001) => (feeFor(gasFor(shots, pieces), price) / 1e6).toFixed(3);
