// The gnome shop's door into the game's first load: its flag, the base of
// the menu panel's line, the signal of what players wear, and the pick a
// player plays in this browser. Nothing of the shop itself: that is a chunk
// of its own (components/gnomes/Door.tsx fetches it, the flag on), so a build
// without the flag carries this file and the region gate alone
// (test/bundle.test.ts).

/** The shop is on (NEXT_PUBLIC_GNOMES=1); off, the game is exactly as before it. */
export const SHOP = process.env.NEXT_PUBLIC_GNOMES === "1";

/** The menu's shop panel's line, before the sale is read (Promo.tsx shopLine adds its lowest price). */
export const SHOP_LINE = "Collect gnomes, play as them";

const listeners = new Set<() => void>();
let version = 0;
/** Says what someone wears was learnt (wear.ts meet). */
export const told = () => (version++, listeners.forEach((f) => f()));
/** Called whenever what someone wears is learnt (a face, a ghost to redraw); returns its unsubscribe. */
export const onWear = (fn: () => void) => (listeners.add(fn), () => void listeners.delete(fn));
/** A number that moves with every change: React's useSyncExternalStore snapshot. */
export const wearVersion = () => version;

const PICK = (addr: string) => `gnogolf.wear.${addr}`;
/** The gnome this account picked to play in this browser (a skin id), null for none. */
export function pickOf(addr: string) {
  try { return localStorage.getItem(PICK(addr)); } catch { return null; }
}
/** Keeps (or forgets, null) the gnome this account plays in this browser. */
export function pick(addr: string, id: string | null) {
  try { id ? localStorage.setItem(PICK(addr), id) : localStorage.removeItem(PICK(addr)); } catch { /* a private window: for this visit only */ }
}
