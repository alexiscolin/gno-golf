// The community's holes as the Builder lists them (the GUI spec's B5 and B6):
// an author's own, and everyone else's, each at its latest version, never a
// course hole, never one the site took down (takedown.ts).
import { GNOKEY_ADDR_KEY } from "../adena";
import { buildRpc, buildWeb, isAddress, isVersion, safeEndpoint, shortAddr } from "../chain";
import { worldName } from "./rules";
import { takenDown } from "../takedown";
import type { HoleRow } from "../types";

/** The address a community hole's id starts with ("<address>/<slug>/v<n>"), null for a course hole. */
export const authorOf = (id: string): string | null => {
  const a = id.split("/")[0];
  return isAddress(a) ? a : null;
};

/** A community hole's line under its name: its world, par and author (short), on every list and card. */
export const holeByline = ({ author, world, par }: { author: string; world: string; par: number }) => `${worldName(world)} · par ${par} · by ${shortAddr(author)}`;

/** The holes to list: me's own (none when no address is known) and the rest of the community's. */
export function listHoles(rows: readonly HoleRow[], me: string | null, taken: ReadonlySet<string>) {
  const live = rows.filter((h) => !h.official && !h.next && authorOf(h.id) && !takenDown(taken, h.id));
  return { mine: me ? live.filter((h) => authorOf(h.id) === me) : [], community: live.filter((h) => !me || authorOf(h.id) !== me) };
}

/** The game's link to play a hole: its alias, so it opens the latest version (keep: the page's own node, "rpc=…&web=…", passed on). */
export const playLink = (h: HoleRow, keep = "") => `/?hole=${encodeURIComponent(h.slot || h.id)}${keep && `&${keep}`}`;
/** The game's cups screen, where every community hole is judged and listed (keep: as playLink's). */
export const cupsLink = (keep = "") => `/?screen=cups${keep && `&${keep}`}`;
/** The Builder's page, from the game (keep: as playLink's). */
export const buildLink = (keep = "") => `/build/${keep && `?${keep}`}`;
/** The Builder's page opening a community hole's version as a new draft of the player's (keep: as playLink's). */
export const remixLink = (id: string, keep = "") => `/build/?remix=${encodeURIComponent(id)}${keep && `&${keep}`}`;
/** The community hole's version a Builder's address asks to remix (?remix=), null if none or not one. */
export function remixId(search: string): string | null {
  const id = new URLSearchParams(search).get("remix") || "";
  return isVersion(id) && authorOf(id) ? id : null;
}

/** The node the Builder reads (and its gnoweb): the page's ?rpc= and ?web= as the game takes them, else the build's. */
export function endpoints(search: string) {
  const p = new URLSearchParams(search);
  const rpc = safeEndpoint(p.get("rpc"), buildRpc()), web = safeEndpoint(p.get("web"), buildWeb());
  const keep = new URLSearchParams([...(p.has("rpc") ? [["rpc", rpc]] : []), ...(p.has("web") ? [["web", web]] : [])]).toString();
  return { rpc, web, keep };
}

/** The author's address as this browser knows it: the one the Builder last used, else the save flow's gnokey address. */
export function knownAuthor(): string | null {
  try {
    for (const k of [AUTHOR_KEY, GNOKEY_ADDR_KEY]) {
      const a = (localStorage.getItem(k) || "").trim();
      if (isAddress(a)) return a;
    }
  } catch {}
  return null;
}
/** Where the Builder keeps the author's address. */
export const AUTHOR_KEY = "gnogolf.builder.author";
