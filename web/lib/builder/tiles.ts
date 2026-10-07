// The palette as the author reads it (the GUI spec's B3): its entries put
// together by what they do, one tile each, with what it does in two or three
// words and its looks to choose from (a pond: a lagoon, a tidepool, a
// fountain or a canal; each look still its own entry, as the chain stores
// it). The five a first hole needs first (palette.ts commonOf), the rest of
// the world's own by group under "More", another world's under "From other
// worlds". Each look has its picture, drawn by the game's own
// meshes offline (media/builder/tiles.mjs) and served as a file.
import { commonOf, type PaletteEntry } from "./palette";
import { entryName, GROUPS, TILES, type Group } from "./names";

export { GROUPS, type Group };

/** One tile: what it is and does, and its looks (the first its own unless chosen otherwise). */
export interface Tile {
  key: string;
  name: string;
  /** what it does to the ball, two or three words */
  does: string;
  group: Group;
  looks: readonly PaletteEntry[];
}

/** A look's picture (the game's own drawing of it, in its world), as the site serves it. */
export const pictureOf = (world: string, e: Pick<PaletteEntry, "kind" | "skin">) => `/builder/tiles/${world}/${e.kind}-${(e.skin || "plain").replaceAll(" ", "-")}.webp`;

/** Entries as tiles by what they do (TILES, the first that takes one), keyed from: each tile's looks the world's own first and the plain one last. */
function byWhatTheyDo(entries: readonly PaletteEntry[], from = ""): Tile[] {
  const out: Tile[] = [];
  const order = (e: PaletteEntry) => (e.world !== "*" ? 0 : e.skin ? 1 : 2);
  for (const def of TILES) {
    const looks = entries.filter((e) => def.takes(e) && !out.some((t) => t.looks.includes(e)));
    if (looks.length) out.push({ key: from + def.key, name: def.name, does: def.does, group: def.group, looks: [...looks].sort((a, b) => order(a) - order(b)) });
  }
  for (const e of entries) if (!out.some((t) => t.looks.includes(e))) out.push({ key: from + e.id, name: entryName(e), does: "", group: "Obstacles", looks: [e] });
  return out;
}

/**
 * A palette as tiles: the world's own first (commonOf's, each its common
 * entry as its first look, named as the GUI spec names it, then the rest by
 * group), and the pieces it borrows (palette.ts HOME) apart, by what they do,
 * under "From other worlds".
 */
export function tilesOf(palette: readonly PaletteEntry[]): { first: Tile[]; more: { group: Group; tiles: Tile[] }[]; others: Tile[] } {
  const all = byWhatTheyDo(palette.filter((e) => !e.borrowed));
  const first: Tile[] = [];
  for (const { name, entry } of commonOf(palette)) {
    const t = all.find((x) => x.looks.includes(entry))!;
    if (first.includes(t)) continue;
    first.push({ ...t, name, looks: [entry, ...t.looks.filter((e) => e !== entry)] });
  }
  const rest = all.filter((t) => !first.some((f) => f.key === t.key));
  return {
    first,
    more: GROUPS.map((group) => ({ group, tiles: rest.filter((t) => t.group === group) })).filter((g) => g.tiles.length),
    others: byWhatTheyDo(palette.filter((e) => e.borrowed), "other/"),
  };
}

/** The palette's folding sections, each open at first or not: "More pieces" open (every group in sight), "From other worlds" folded. */
export const FOLDS = { more: true, others: false } as const;
export type Fold = keyof typeof FOLDS;
const foldKey = (k: Fold) => `gnogolf.builder.fold.${k}`;

/** Whether a section is open: as the author left it this visit (the tab's session), else as at first. */
export function foldOpen(k: Fold): boolean {
  try {
    const v = sessionStorage.getItem(foldKey(k));
    return v === null ? FOLDS[k] : v === "1";
  } catch {
    return FOLDS[k];
  }
}
/** A section opened or folded, kept for the visit (a browser that keeps nothing: forgotten). */
export function saveFold(k: Fold, open: boolean) {
  try { sessionStorage.setItem(foldKey(k), open ? "1" : "0"); } catch {}
}
