// The palette as the author reads it (the GUI spec's B3): its entries put
// together by what they do, one tile each, with what it does in two or three
// words and its looks to choose from (a pond: a lagoon, a tidepool, a
// fountain or a canal; each look still its own entry, as the chain stores
// it). The five a first hole needs first (palette.ts commonOf), the rest by
// group under "More". Each look has its picture, drawn by the game's own
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

/**
 * A palette as tiles: the first ones (commonOf, each its common entry as its
 * first look, named as the GUI spec names it) and the rest by group, each
 * tile's looks the world's own first and the plain one last.
 */
export function tilesOf(palette: readonly PaletteEntry[]): { first: Tile[]; more: { group: Group; tiles: Tile[] }[] } {
  const all: Tile[] = [];
  const order = (e: PaletteEntry) => (e.world !== "*" ? 0 : e.skin ? 1 : 2);
  for (const def of TILES) {
    const looks = palette.filter((e) => def.takes(e) && !all.some((t) => t.looks.includes(e)));
    if (looks.length) all.push({ key: def.key, name: def.name, does: def.does, group: def.group, looks: [...looks].sort((a, b) => order(a) - order(b)) });
  }
  for (const e of palette) if (!all.some((t) => t.looks.includes(e))) all.push({ key: e.id, name: entryName(e), does: "", group: "Obstacles", looks: [e] });
  const first: Tile[] = [];
  for (const { name, entry } of commonOf(palette)) {
    const t = all.find((x) => x.looks.includes(entry))!;
    if (first.includes(t)) continue;
    first.push({ ...t, name, looks: [entry, ...t.looks.filter((e) => e !== entry)] });
  }
  const rest = all.filter((t) => !first.some((f) => f.key === t.key));
  return { first, more: GROUPS.map((group) => ({ group, tiles: rest.filter((t) => t.group === group) })).filter((g) => g.tiles.length) };
}
