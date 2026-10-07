// One name per piece (the game-design review's quick win 5): a piece is
// called what its palette tile calls it, on the board, in the inspector and
// in every sentence the checks say ("the wall", not "the plain rail"; "the
// lagoon water"). The tiles by what a piece does live here, plain data on
// the bindings (no scene), so the checks, the worker and the palette
// (tiles.ts) name alike.
import { BINDINGS, KIND, type Binding } from "./bindings";
import { entryParts } from "./gg1";
import { kicks } from "./rules";
import type { Draft } from "./draft";
import type { Kind } from "../scene/worlds";

/** What naming reads of an entry: its kind, its skin, how it plays. */
export type Named = Pick<Binding, "clocks" | "scale"> & { kind: string; skin: string };

/** The palette's groups under "More", in order. */
export const GROUPS = ["Walls", "Obstacles", "Ground", "Traps", "Moving pieces"] as const;
export type Group = (typeof GROUPS)[number];


// the mountain's drops: a hazard as a pond is, but what they look like is a fall, not water
const DROPS = new Set(["cliff", "serac", "crevasse"]);

/**
 * The tiles by what a piece does, the first that takes an entry its tile: a
 * bar that moves from the start (a clock's hand), a rail, a bar, a post
 * that kicks, any post, a surface by its grip (faster than grass, much
 * slower, about as grass), a hill, a hazard (a drop or water), a tunnel.
 * An entry none takes gets a tile of its own (a new kind shows without a change here).
 */
export const TILES: readonly { key: string; name: string; does: string; group: Group; takes: (e: Named) => boolean }[] = [
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


/** An entry's tile name and its look ("" when its skin says no more than the tile: the plain one, "water" in Water). */
function partsOf(e: Named): { tile: string; look: string } {
  const t = TILES.find((x) => x.takes(e));
  if (!t) return { tile: e.skin ? e.kind : `plain ${e.kind}`, look: e.skin };
  const look = e.skin && !t.name.toLowerCase().includes(e.skin) ? e.skin : "";
  return { tile: t.name, look };
}

/** An entry as the board and the inspector name it: its look, then its tile's name ("Lagoon water", "Wall"). */
export function entryName(e: Named): string {
  const { tile, look } = partsOf(e), s = look ? `${look} ${tile.toLowerCase()}` : tile;
  return s[0].toUpperCase() + s.slice(1);
}

/** An entry by its id, as naming reads it: its kind and skin, with their binding (none: the plain form). */
const namedOf = (id: string): Named => {
  const { kind, skin } = entryParts(id), k = Object.hasOwn(KIND, kind) ? KIND[kind as Kind] : null;
  const own = k && Object.hasOwn(BINDINGS[kind as Kind], skin) ? BINDINGS[kind as Kind][skin] : {};
  return { clocks: ["fixed"], ...k, ...own, kind, skin };
};

/** A piece's name in a sentence: "the wall", "the plank barrier", "the lagoon water". */
export const pieceName = (p: Pick<Draft["pieces"][number], "entry">) => `the ${entryName(namedOf(p.entry)).toLowerCase()}`;
