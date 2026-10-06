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
/** The worlds' fields: the values most of each world's course holes have (data/holes.txt). */
export const FIELD: Record<string, Field> = {
  garden: field(22, 0.86),
  island: field(26, 0.87),
  town: field(26, 0.87),
  mountain: field(28, 0.87),
  mines: field(34, 0.87, 0.03),
};
