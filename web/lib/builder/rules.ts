// The chain's rules the hole builder's palette is bound by: the skins that
// are physics, not looks, and each world's field. scripts/selfcheck.ts reads
// the physics' own back (step.gno, course.gno) and fails on any drift.

import { cap, CUPS, theWorld, worldName } from "../card";
import { CLIMATES } from "../sky";

/** A sentence or a name with its first letter up, a world's name alone and in a sentence (card.ts): as the game says them. */
export { cap, theWorld, worldName };
/** A weather's name in a sentence ("" is clear). */
export const weatherName = (kind: string) => (kind ? cap(kind) : "Clear");
/** Weathers in a sentence: "Clear, Wind and Rain". */
export const weathersSaid = (kinds: readonly string[]) => listed(kinds.map(weatherName));
/** A board point in a sentence, "13.5, 6.5" (xy), "(13.5, 6.5)" (pt): to two places at most. */
export const xy = (v: readonly number[]) => `${+v[0].toFixed(2)}, ${+v[1].toFixed(2)}`;
export const pt = (v: readonly number[]) => `(${xy(v)})`;
/** Things in a sentence: "the tee", "the tee and the cup", "the Garden, the Island and the Mountain". */
export const listed = (xs: readonly string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}` : (xs[0] ?? ""));

/** physics.Kicks: a piece whose skin holds one of these may play a bounce above 1. */
export const KICKS = ["bumper", "pinball", "mushroom"] as const;
export const kicks = (skin: string) => KICKS.some((k) => skin.includes(k));
/** physics.MaxBounce: the most a passive piece plays, whatever its Bounce. */
export const MAX_BOUNCE = 0.75;
/** physics.MinRamp: the gentlest hill (|Vec|) that launches a ball off its crest. */
export const MIN_RAMP = 0.12;
/** physics.MaxMove: a zone a fast ball cannot step over is at least this deep along its way. */
export const MAX_MOVE = 1.5;
/** course.Decode: a hole's par (Strokes) is at most this. */
export const MAX_PAR = 19;
/** golf's minShotWork: the work a commit's first shot may do in its dearest weather, four fifths of physics.MaxWork. */
export const MIN_SHOT_WORK = 800_000;
/** The weathers a hole is proven in: every kind of its world's climate but fog (which only hides the far end); "" is clear. The mines take the garden's, as the chain does. */
export function required(world: string): string[] {
  return (Object.hasOwn(CLIMATES, world) ? CLIMATES[world] : CLIMATES.garden).map(([, k]) => k as string).filter((k) => k !== "fog");
}
/** The weather's skins (course.WithWeather, and the puddles it lays): never a piece's. */
export const WEATHER = ["wind", "rain", "fog", "storm", "snow", "puddle"] as const;

/** A world's field, not editable: so a community hole plays like the cup it borrows. */
export interface Field {
  substeps: number;
  friction: number;
  bounce: number;
  ballR: number;
  cupR: number;
  shelter: number;
}
const field = (substeps: number, friction: number, shelter = 0): Field => ({ substeps, friction, bounce: 0.85, ballR: 0.5, cupR: 1.2, shelter });
/**
 * The Builder's worlds, each with its field: the values most of its course
 * holes have (data/holes.txt). The classic four only: the Crystal Mines (their
 * rides, their dark, their void) are too much for a builder and stay the
 * game's alone. Every list of the Builder's worlds is this one's keys.
 */
export const FIELD: Record<string, Field> = {
  garden: field(22, 0.86),
  island: field(26, 0.87),
  town: field(26, 0.87),
  mountain: field(28, 0.87),
};

/** Whether a world is one of the game's (the Builder's, or one it leaves to the game). */
export const gameWorld = (w: string) => (CUPS as readonly string[]).includes(w);
const said = (w: string) => (gameWorld(w) ? theWorld(w) : w);
/** Why a hole of another world never opens in the Builder (it stays playable in the game). */
export const notABuilderWorld = (world: string) => {
  return `The Builder makes holes in ${listed(Object.keys(FIELD).map(said))}: this one is in ${said(world)}, and stays playable in the game.`;
};
