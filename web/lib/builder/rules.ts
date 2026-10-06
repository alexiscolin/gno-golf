// The chain's rules the hole builder's palette is bound by: the skins that
// are physics, not looks, and each world's field. scripts/selfcheck.ts reads
// the physics' own back (step.gno, course.gno) and fails on any drift.

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

/** A world in a sentence: the Builder's, and the game's others. */
const IN_WORDS: Record<string, string> = { garden: "the Garden", island: "the Island", town: "Mushroom Town", mountain: "the Mountain", mines: "the Crystal Mines" };
/** Whether a world is one of the game's (the Builder's, or one it leaves to the game). */
export const gameWorld = (w: string) => Object.hasOwn(IN_WORDS, w);
const said = (w: string) => (gameWorld(w) ? IN_WORDS[w] : w);
/** Why a hole of another world never opens in the Builder (it stays playable in the game). */
export const notABuilderWorld = (world: string) => {
  const ws = Object.keys(FIELD).map(said);
  return `The Builder makes holes in ${ws.slice(0, -1).join(", ")} and ${ws.at(-1)}: this one is in ${said(world)}, and stays playable in the game.`;
};
