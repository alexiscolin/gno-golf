// What every scene module needs and nothing else: a seeded random, the size of
// the island round the board, and the garden's ground level. Its own module so
// the scene files import it without importing each other (and without cycles).

/** A seeded random in [0, 1): the same string always draws the same scene. */
export const seeded = (str) => {
  let h = 1779033703;
  for (const ch of String(str)) h = Math.imul(h ^ ch.charCodeAt(0), 3432918353);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
};

/** The island's margins around the green, in board units. */
export const ISLAND = { x: 7, front: 4, back: 10, soil: 4 };
/** The ground round the board: a step below the green. */
export const GRASS = -0.6;
