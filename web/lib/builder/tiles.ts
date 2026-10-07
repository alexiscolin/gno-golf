// The palette as the author reads it (the GUI spec's B3): its entries put
// together by what they do, one tile each, with what it does in two or three
// words and its looks to choose from (a pond: a lagoon, a tidepool, a
// fountain or a canal; each look still its own entry, as the chain stores
// it). The five a first hole needs first (palette.ts commonOf), the rest by
// group under "More". Each look has its picture, drawn by the game's own
// meshes offline (media/builder/tiles.mjs) and served as a file.
import { kicks } from "./rules";
import { commonOf, type PaletteEntry } from "./palette";

/** The palette's groups under "More", in order. */
export const GROUPS = ["Walls", "Obstacles", "Ground", "Traps", "Moving pieces"] as const;
export type Group = (typeof GROUPS)[number];

/** One tile: what it is and does, and its looks (the first its own unless chosen otherwise). */
export interface Tile {
  key: string;
  name: string;
  /** what it does to the ball, two or three words */
  does: string;
  group: Group;
  looks: readonly PaletteEntry[];
}

// the mountain's drops: a hazard as a pond is, but what they look like is a fall, not water
const DROPS = new Set(["cliff", "serac", "crevasse"]);

/**
 * The tiles by what a piece does, the first that takes an entry its tile: a
 * bar that moves from the start (a clock's hand), a rail, a bar, a post
 * that kicks, any post, a surface by its grip (faster than grass, much
 * slower, about as grass), a hill, a hazard (a drop or water), a tunnel.
 * An entry none takes gets a tile of its own (a new kind shows without a change here).
 */
const TILES: readonly (Omit<Tile, "looks"> & { takes: (e: PaletteEntry) => boolean })[] = [
  { key: "timed", name: "Moving bar", does: "comes and goes", group: "Moving pieces", takes: (e) => e.kind === "bar" && e.clocks[0] !== "fixed" },
  { key: "wall", name: "Wall", does: "edges the lane", group: "Walls", takes: (e) => e.kind === "rail" },
  { key: "barrier", name: "Barrier", does: "blocks the way", group: "Walls", takes: (e) => e.kind === "bar" },
  { key: "bumper", name: "Bumper", does: "bounces hard", group: "Obstacles", takes: (e) => e.kind === "post" && kicks(e.skin) },
  { key: "obstacle", name: "Obstacle", does: "in the way", group: "Obstacles", takes: (e) => e.kind === "post" },
  { key: "ice", name: "Ice", does: "speeds it up", group: "Ground", takes: (e) => e.kind === "surface" && !!e.scale && e.scale.min > 1 },
  { key: "sand", name: "Sand", does: "slows the ball", group: "Ground", takes: (e) => e.kind === "surface" && !!e.scale && e.scale.def < 0.8 },
  { key: "floor", name: "Floor", does: "rolls like grass", group: "Ground", takes: (e) => e.kind === "surface" },
  { key: "slope", name: "Slope", does: "pushes the ball", group: "Ground", takes: (e) => e.kind === "slope" },
  { key: "drop", name: "Drop", does: "sends it back", group: "Traps", takes: (e) => e.kind === "hazard" && DROPS.has(e.skin) },
  { key: "water", name: "Water", does: "sends it back", group: "Traps", takes: (e) => e.kind === "hazard" },
  { key: "tunnel", name: "Tunnel", does: "pops out further", group: "Traps", takes: (e) => e.kind === "tunnel" },
];

/** A look's name in the chooser: its skin, or Plain. */
export const lookName = (e: PaletteEntry) => (e.skin ? e.skin[0].toUpperCase() + e.skin.slice(1) : "Plain");

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
  for (const e of palette) if (!all.some((t) => t.looks.includes(e))) all.push({ key: e.id, name: e.label, does: "", group: "Obstacles", looks: [e] });
  const first: Tile[] = [];
  for (const { name, entry } of commonOf(palette)) {
    const t = all.find((x) => x.looks.includes(entry))!;
    if (first.includes(t)) continue;
    first.push({ ...t, name, looks: [entry, ...t.looks.filter((e) => e !== entry)] });
  }
  const rest = all.filter((t) => !first.some((f) => f.key === t.key));
  return { first, more: GROUPS.map((group) => ({ group, tiles: rest.filter((t) => t.group === group) })).filter((g) => g.tiles.length) };
}
