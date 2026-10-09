// The gnomes' signatures (r/gnogolf/gnomes, ADR-007), built on the wallet
// layer's own (lib/adena.ts: send, gnokeyCall, gnokeyOn): one call each, the
// realm's own function, Buy(ids) or Equip(id), and the same call as a gnokey
// line. Loaded with the shop: the game's first load carries none of it.
import { send, gnokeyCall, gnokeyOn, PKG_PATH, PRICE, type GnokeyAt } from "../adena";
import { isAddress } from "../chain";

// Each signature alone, the realm's own function: Buy(ids), Equip(id). What
// each asks: the most it took on a local chain of the onyx toolchain
// (docs/superpowers/e2e/2026-10-06-gnomes-local.md: a Buy of one 31.0M gas,
// two 36.0M, five 55.4M; an Equip 10.8M), with room; the bytes it stores,
// bounded by the realm's goldens (a first buy 3,850, z_storage_buy) or,
// unmeasured, generously (an equip's row): the bill says "at most", and Adena
// charges what it simulates.
export const GNOME_TX = {
  buy: { gas: (n: number) => 40e6 + 10e6 * (n - 1), bytes: (n: number) => 3900 * n },
  equip: { gas: 25e6, bytes: 600 },
} as const;
/** One of the gnomes' calls: its function and arguments, the ugnot sent with it, its gas and bytes. */
export interface GnomeCall { func: "Buy" | "Equip"; args: string[]; send: number; gas: number; bytes: number }
const NOTHING = "Nothing to sign.";
const gnomeNo = (id: number) => {
  if (!Number.isSafeInteger(id) || id < 1) throw new Error(NOTHING);
  return String(id);
};
const ugnotOf = (n: number) => {
  if (!Number.isSafeInteger(n) || n < 1) throw new Error(NOTHING);
  return n;
};
/** The gnomes' calls, checked: an id a whole number, a list 1 to 5 of them once each, coins a whole ugnot amount. */
export const gnomeCall = {
  buy: (ids: readonly number[], total: number): GnomeCall => {
    if (!ids.length || ids.length > 5 || new Set(ids).size !== ids.length) throw new Error(NOTHING);
    return { func: "Buy", args: [ids.map(gnomeNo).join(",")], send: ugnotOf(total), gas: GNOME_TX.buy.gas(ids.length), bytes: GNOME_TX.buy.bytes(ids.length) };
  },
  /** null takes it off: everyone sees the best again */
  equip: (id: number | null): GnomeCall => ({ func: "Equip", args: [id === null ? "" : gnomeNo(id)], send: 0, ...GNOME_TX.equip }),
};
const FAILED: Record<GnomeCall["func"], string> = { Buy: "The gnome was not bought.", Equip: "Nothing was changed." };
/** Signs one of the gnomes' calls from the connected account (realm: the gnomes' path). Resolves with the tx (hash, height). */
export function sendGnome(c: GnomeCall, { address, realm, price = PRICE, chainId, rpc }: { address: string; realm: string; price?: number; chainId?: string | null; rpc: string }) {
  if (!isAddress(address) || !PKG_PATH.test(realm)) return Promise.reject(new Error(NOTHING));
  return send([{ type: "/vm.m_call", value: { caller: address, send: c.send ? `${c.send}ugnot` : "", pkg_path: realm, func: c.func, args: c.args } }], c.gas, price, chainId, rpc, FAILED[c.func], "gnogolf gnomes");
}
/** The same call as one gnokey line, for the player's own key; "" for a realm path not one. */
export function gnokeyGnome(c: GnomeCall, { realm, price = PRICE, chainId, rpc }: GnokeyAt & { realm: string }) {
  if (!PKG_PATH.test(realm)) return "";
  // (an id list is digits and commas; Equip's empty id is quoted for the shell)
  return gnokeyCall(realm, c.func, c.args.map((a) => a || "''"), c.gas, price, gnokeyOn(chainId, rpc), c.send);
}
