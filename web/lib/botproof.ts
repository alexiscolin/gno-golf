// The bot check's shots: what the game sends, and the words a hidden player reads
// when the list says nothing more. The game rounds angle and power to 0.01 (chain.ts
// pullShot); the chain keeps a shot as sent, and gnoweb's forms take any number typed,
// so a finer shot is a sign, never a proof (the bot check, docs/leaderboards.md).

/** A shot as numbers: angle (degrees), power, tick. */
export interface Shot { a: number; p: number; t: number }

export const parseShot = (s: string): Shot => {
  const [a, p, t] = s.split(",").map(Number);
  return { a, p, t: t | 0 };
};
/** Whether x is a whole number of steps (within float noise). */
export const near = (x: number, step: number) => Math.abs(x / step - Math.round(x / step)) < 1e-6;

/** A shot finer than the game sends (0.01). */
export const forgedShot = ({ a, p }: Shot) => !(near(a, 0.01) && near(p, 0.01));
/** What a hidden player is told when the list gives no words of its own. */
export const PLAYS_LIKE_A_PROGRAM = "rounds that play like a program's";
