// The chain's refusals in plain words (the builder's design, "Error
// messages"): each L2 refusal is shown so, with the realm's own sentence
// under it, for an author to search. An unknown sentence is shown as it is.
import { LIMITS } from "./gg1";

const COUNTS: Record<string, keyof typeof LIMITS> = { walls: "walls", posts: "posts", zones: "zones", "polygon points": "polyTotal", pulses: "pulses", skins: "skins" };

/** A refusal's plain words; counts filled in where the hole is known (counts: what it has, by GG1's names). */
export function explain(sentence: string, counts: Partial<Record<keyof typeof LIMITS, number>> = {}): string {
  const s = sentence.replace(/^panic: /, "");
  const many = /^golf: course: too many (walls|posts|zones|polygon points|pulses|skins)$/.exec(s);
  if (many) {
    const k = COUNTS[many[1]], n = counts[k];
    return `Too many ${many[1]}${n !== undefined ? `: ${n} of ${LIMITS[k]}` : ` (at most ${LIMITS[k]})`}.${k === "walls" ? " A bar is four walls." : ""}`;
  }
  if (/^golf: course: a .*timing is out of bounds$/.test(s)) return "A timed piece's cycle is outside 1 to 4096.";
  if (s.startsWith("golf: this data is already ")) return "This is exactly the version already published.";
  const plain: Record<string, string> = {
    "golf: a slug is 1 to 32 of a-z, 0-9 and -": "The hole's short name is 1 to 32 lower-case letters, digits and dashes.",
    "golf: the data is too long": "This hole is over 32 KB of data. Remove pieces, or polygon points.",
    "golf: course: the board is 1 to 96 a side": "The hole is wider or longer than 93 between its outermost pieces. Bring them in.",
    "golf: course: a point lies off the board": "A piece lies outside the board after fitting (a polygon point, or a tunnel's destination). Move it inside the hole's outer pieces.",
    "golf: course: a zone's box lies far off the board": "A zone lies outside the board after fitting. Move it inside the hole's outer pieces.",
    "golf: course: a polygon has 3 to 64 points": "A shape has fewer than 3 or more than 64 points.",
    "golf: course: a post's radius is above 0 and at most 8": "A round piece's radius is outside 0 to 8.",
    "golf: course: a zone's scale is 0 to 8": "A surface's grip is outside 0 to 8.",
    "golf: course: a slope pushes at most G·MaxSin (0.95)": "This slope is steeper than the physics allows (72°).",
    "golf: course: the stored wall lengths are not the walls' own": "The walls' stored lengths do not match. (Cannot happen after fit, which writes them with the chain's code: report it.)",
    "golf: the data is not as course.Encode writes it": "The data is not in its one canonical form. (Cannot happen after fit: report it.)",
    "golf: one shot on this hole could cost more than a transaction can replay": "One shot here could cost more than a transaction can replay. Fewer walls, or fewer pieces in pulses.",
    "golf: in its dearest weather, a commit on this hole would leave too little room for a shot": "In its heaviest weather (rain or a storm), this hole leaves a shot too little room. Each fixed wall costs the rain's puddle tries: edge the lane with a hazard or with timed pieces instead of rails.",
    "golf: a community hole's name and note carry no web address": "The name or the note looks like a web address. Write \"St. Andrews\", not \"St.Andrews\".",
    "golf: publishing community holes is not open yet": "Publishing is not open yet. Your draft is kept.",
  };
  return Object.hasOwn(plain, s) ? plain[s] : s;
}
