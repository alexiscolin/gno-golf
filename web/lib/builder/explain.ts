// The chain's refusals in plain words (the builder's design, "Error
// messages"): each L2 refusal is shown so, with the realm's own sentence
// under it, for an author to search. An unknown sentence is shown as it is.
import { LIMITS } from "./gg1";
import type { Issue } from "./checks";

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

/**
 * A check's sentence in the player's words (the GUI spec's B1): what is
 * wrong, named by its pieces, and what to do, without the place in numbers
 * (Show me frames it) or the rule's code (a tooltip, for us). A sentence of
 * no known shape is kept, its numbers dropped.
 */
export function plainOf(i: Pick<Issue, "rule" | "text">): string {
  const t = i.text.replace(/ at \(-?[\d.]+, -?[\d.]+\)/g, "").replace(/ \(-?[\d.]+, -?[\d.]+\)/g, "");
  const m = (re: RegExp) => re.exec(t);
  let r: RegExpExecArray | null;
  if ((r = m(/^The tee touches (.+)$/))) return `The tee is on ${r[1]}: move the tee or ${r[1]}.`;
  if ((r = m(/^The cup touches (.+)$/))) return `The cup is inside ${r[1]}: move the cup or ${r[1]}.`;
  if ((r = m(/^The cup cannot be reached from the tee: the gap between (.+) and (.+) is ([\d.]+) wide, narrower than the ball .*$/))) return `The ball can't get between ${r[1]} and ${r[2]} (${r[3]} wide): widen the gap.`;
  if (/^The cup cannot be reached from the tee$/.test(t)) return "The ball can't get from the tee to the cup: open a way through.";
  if ((r = m(/^The gap between (.+) and (.+) is ([\d.]+) wide, and the way to the cup goes through it: at least ([\d.]+), .*$/))) return `The way to the cup squeezes between ${r[1]} and ${r[2]} (${r[3]} wide): widen it to at least ${r[4]}.`;
  if (i.rule === "E13" && (r = m(/^(.+) (overlaps|stands on|crosses|lies over|stands in) (.+)$/))) return `${r[1]} ${r[2]} ${r[3]}: move one of them.`;
  if ((r = m(/^(.+) is outside the lane: no ball reaches it$/))) return `${r[1]} is outside the lane, where no ball goes: move it in or remove it.`;
  if ((r = m(/^(.+) is ([\d.]+) from (.+): at least ([\d.]+), or the kerb swallows it$/))) return `${r[1]} is too close to ${r[3]} (${r[2]}): leave at least ${r[4]} between them.`;
  if ((r = m(/^(.+) stands in the (.+) round the lane: the world draws over it$/))) return `${r[1]} stands in the ${r[2]} round the lane, drawn over: move it into the lane.`;
  if ((r = m(/^The hole is ([\d.]+) across: at most ([\d.]+) between its outermost pieces$/))) return `The hole is too big (${r[1]} across): bring its outermost pieces within ${r[2]}.`;
  if ((r = m(/^(.+) comes out, off the board once the hole is fitted$/))) return `${r[1]} comes out off the board: bring its way out inside the hole.`;
  if ((r = m(/^(.+)'s point lies off the board once the hole is fitted$/))) return `${r[1]} has a point off the board: bring it inside the hole.`;
  if ((r = m(/^(.+) comes out, in a zone that moves the ball on$/))) return `${r[1]} comes out where the ball is pushed on: move its way out.`;
  if ((r = m(/^(.+)'s (.+) is (-?[\d.]+): (-?[\d.]+) to (-?[\d.]+)$/))) return `${r[1]}'s ${r[2]} is ${r[3]}: make it ${r[4]} to ${r[5]}.`;
  if ((r = m(/^(.+) is on for (\d+) of (\d+) (\w+): (\d+) to (\d+)$/))) return `${r[1]} is on ${r[2]} of ${r[3]} ${r[4]}: make it ${r[5]} to ${r[6]}.`;
  return /[.!?]$/.test(t) ? t : `${t}.`;
}
