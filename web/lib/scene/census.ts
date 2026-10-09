// The render census: what drew each of a hole's pieces, reported by
// buildHole when it is asked (its census option). The builder's E12 reads it
// to refuse a piece the scene merged, hid, or drew as the plain form instead
// of its own drawing. Types only: no three.js.

/** A hole's piece: its list and index (in HoleState's walls, posts, zones), and its pulse for a stroke's piece. */
export interface PieceRef {
  set: "wall" | "post" | "zone";
  i: number;
  pulse?: number;
}

/** What drew a piece. */
export type Drawn =
  /** a shared table (POSTS, BARS, MOUTHS), or the course's or zones' own drawing of a skin they declare (DRAWN) */
  | { by: "table"; key: string }
  /** the world's own piece() */
  | { by: "world"; key: string }
  /** a rail: part of a kerb chain, or a lone timber */
  | { by: "kerb" }
  /** four walls read as one bar, then drawn by its own drawing, or as the plain timber */
  | { by: "bar"; draw: "table" | "world" | "fallback"; key: string }
  /** read as part of a tram line (a hand-only composition) */
  | { by: "tram" }
  /** the plain form an unknown skin falls back to (CLIENT.md, rule 2) */
  | { by: "fallback" }
  /** not drawn: out in the sea, out of reach, a zone with no area, a timed wall that is not one of a bar's four, or what
   *  stands beside it (the mountain's snow cannon, a serac's tower) with no room for it off the lane, or standing between
   *  the player's camera and the ball or the cup (sight.ts) */
  | { by: "hidden"; why: "sea" | "unreached" | "empty" | "timed" | "room" | "view" };

export type Census = (piece: PieceRef, drawn: Drawn) => void;
