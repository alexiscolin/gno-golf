// The difficulty meter's levels (difficulty.ts), apart from the meter: the
// game's community list says a hole's level without loading the meter,
// whose worker measures it (meter.ts rate).
export const LEVELS = ["Easy", "Medium", "Hard", "Very hard"] as const;
export type Level = 0 | 1 | 2 | 3;
