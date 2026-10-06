// The collection's rules, checked (docs/gnomes/design.md): what a tier may
// wear, no two gnomes alike, none a copy of GNOMES', readable on every
// ground and as a ghost, the counts as the series says. Pure: the catalogue
// in, a report out (scripts/gnomes.ts prints it; the tests hold it to none).
import { EARNED_ONLY, colourName } from "./vocab";
import { PROP_DESIGNS } from "./props";
import { decode, encode, type Traits } from "./codec";
import { darkBody, deltaE, oklab, over } from "./colour";
import { SALE_TIERS, planSeries, type Catalogue } from "./catalogue";
import type { Tier } from "./vocab";

/** What the lanes are made of, where a gnome must read (course.ts, zones.ts, the worlds' green hooks). */
export const GROUNDS: Readonly<Record<string, number>> = {
  fairway: 0x60ab96, sand: 0xecd49c, planks: 0xc99a63, stone: 0xaeb0a6, concrete: 0xcfcac1, snow: 0xeaf4ff,
  dirt: 0xb68e5d, basalt: 0x9c92a6, crystal: 0xb4c6d8, marble: 0xe0d4bc,
};
/** What a gnome of each tier may cost to draw on a phone: triangles (ink
 *  included) and draws once baked, a Legendary's moving piece among them
 *  (test/gnome.test.ts builds every one and holds it to this). A Common's is
 *  what the game already draws for its heaviest gnome, the Pirate (5,772). */
export const BUDGET = {
  earned: { tris: 6000, draws: 9 },
  common: { tris: 6000, draws: 7 },
  rare: { tris: 6000, draws: 8 },
  epic: { tris: 6500, draws: 9 },
  legendary: { tris: 8000, draws: 12 },
} as const;
/** How much further than GNOMES' widest a gnome may reach (the replay keeps that much off a wall). */
export const MAX_REACH = 1.1;
/** A duel's ghost's opacity (engine/rival.ts makeGhost(0.55)). */
const GHOST = 0.55;
const INK = 0x144134;

/** The trails and holings each tier may have: a Rare's ribbon, the Epics' own, the Legendaries' own. */
export const TIER_FX: Readonly<Record<Tier, { trails: readonly string[]; holings: readonly string[] }>> = {
  earned: { trails: [""], holings: ["confetti"] },
  common: { trails: [""], holings: ["confetti"] },
  rare: { trails: ["ribbon"], holings: ["confetti"] },
  epic: { trails: ["sparks", "shavings", "light", "bubbles", "leaves", "stars", "notes", "dust", "crumbs"],
    holings: ["sparks", "shavings", "pulse", "petals", "bubbles", "leaves", "stars", "notes", "steam", "crumbs", "ripples", "feathers"] },
  legendary: { trails: ["shards", "embers", "streaks", "petals", "foam", "spores", "snow"], holings: ["shards", "embers", "bolt", "gale", "splash", "spores", "avalanche"] },
};

/** How different two looks are, in what the eye takes in first: the hat's
 *  shape, then colours, the beard, the things he wears. */
export function lookDistance(a: Traits, b: Traits) {
  let d = 0;
  if (a.hat !== b.hat) d += 3;
  if (a.hatColour !== b.hatColour) d += 2;
  if (a.body !== b.body) d += 2;
  if (a.pattern !== b.pattern || (a.pattern !== "plain" && a.patternColour !== b.patternColour)) d += 2;
  if (a.beard !== b.beard) d += 2;
  else if (a.beard !== "none" && a.hair !== b.hair) d += 1;
  const sa = new Set(a.accessories);
  d += a.accessories.filter((x) => !b.accessories.includes(x)).length + b.accessories.filter((x) => !sa.has(x)).length;
  if (a.piece !== b.piece) d += 2;
  if (a.material !== b.material) d += 3;
  if (a.prop !== b.prop) d += 3;
  if (a.trail !== b.trail || a.trailColour !== b.trailColour) d += 1;
  return d;
}
/** The least distance between two gnomes of the collection, and from any of GNOMES. */
export const MIN_APART = 3, MIN_FROM_GNOMES = 4;

/** A look the earned gnomes own: their pieces (the Diver's mask, the Mayor's
 *  sash among them), and the pairs of common things that are theirs. */
export function earnedSignature(t: Traits): string {
  const bad = t.accessories.filter((a) => EARNED_ONLY.includes(a));
  if (bad.length) return `wears ${bad.join(", ")}, the earned gnomes' own`;
  if (t.hat === "toque" && t.accessories.includes("flour")) return "the Baker's toque and flour";
  if (t.hat === "tricorn" && t.accessories.includes("patch")) return "the Pirate's tricorn and patch";
  return "";
}

/** What a gnome must read against: his ink eyes on his body, his hat on his body, him on every ground and as a ghost. */
export function readability(t: Traits): string[] {
  const out: string[] = [];
  const body = t.pattern !== "plain" ? t.body : t.body ?? 0xfdf6e9, hat = t.hatColour ?? 0xe0524b;
  if (body !== null && !darkBody(body) && oklab(body)[0] - oklab(INK)[0] < 0.25) out.push(`eyes: ink on ${colourName(body)} does not read`);
  if ((t.tier === "common" || t.tier === "rare") && body !== null && deltaE(hat, body) < 0.06) out.push(`hat ${colourName(hat)} too close to body ${colourName(body)}`);
  // what shows of him: his hat and body, and an Epic's or a Legendary's marks and prop (a porcelain's paint, a neon's light)
  const shown = [hat, body, ...(t.tier === "epic" || t.tier === "legendary" ? [t.materialColour, t.propColour] : [])].filter((v): v is number => v !== null);
  for (const [name, ground] of Object.entries(GROUNDS)) {
    const seen = Math.max(...shown.map((v) => deltaE(v, ground)));
    const ghost = Math.max(...shown.map((v) => deltaE(over(v, ground, GHOST), ground)));
    if (seen < 0.1) out.push(`lost on ${name}`);
    else if (ghost < 0.05) out.push(`its ghost lost on ${name}`);
  }
  if (t.trailColour !== null && deltaE(t.trailColour, GROUNDS.fairway) < 0.08) out.push(`trail ${colourName(t.trailColour)} lost on the fairway`);
  return out;
}

/** What a tier may and must carry. */
export function tierRules(t: Traits): string[] {
  const out: string[] = [], fx = TIER_FX[t.tier];
  if (!fx.trails.includes(t.trail)) out.push(`trail "${t.trail}" is not a ${t.tier}'s`);
  if (!fx.holings.includes(t.holing)) out.push(`holing "${t.holing}" is not a ${t.tier}'s`);
  const legend = !!t.prop && "legend" in (PROP_DESIGNS[t.prop] ?? {});
  if (t.tier === "common" && (t.pattern !== "plain" || t.piece || t.material !== "toon" || t.prop)) out.push("a Common wears only the base traits");
  if (t.tier === "rare" && (t.pattern === "plain" && !t.piece)) out.push("a Rare has a pattern or a piece");
  if (t.tier === "rare" && (t.material !== "toon" || t.prop)) out.push("a Rare has no material nor prop");
  if (t.tier === "epic" && (t.material === "toon" || !t.prop || legend)) out.push("an Epic has a material and a prop of its own");
  if (t.tier === "legendary" && (!legend || !t.kind)) out.push("a Legendary has its own piece and number");
  if (["mill", "mushroom"].includes(t.hat) && t.tier !== "legendary") out.push(`the ${t.hat} hat is a Legendary's`);
  if (t.piece === "bowtie" && !["none", "moustache", "goatee"].includes(t.beard)) out.push("a bow tie under a beard does not show");
  return out;
}

export interface Report { errors: string[]; counts: Record<string, Record<string, number>> }

/** Every rule over a catalogue, against GNOMES' looks (theirs: traitsOf of each). */
export function validate(c: Catalogue, gnomes: readonly Traits[]): Report {
  const errors: string[] = [];
  const err = (id: number | string, m: string) => errors.push(`#${id}: ${m}`);
  const counts: Report["counts"] = { tier: {}, home: {}, archetype: {} };
  const looks: { id: number; t: Traits }[] = [];
  // the series' plan, id by id
  const planned = new Map<number, { tier: string; home: string; wave: number; series: string }>();
  for (const s of c.series) for (const w of planSeries(s)) for (const tier of SALE_TIERS) {
    const { first, count } = w.tiers[tier];
    for (let id = first; id < first + count; id++) planned.set(id, { tier, home: w.home, wave: w.n, series: s.id });
  }
  if (planned.size !== c.gnomes.length) errors.push(`${c.gnomes.length} gnomes for ${planned.size} planned`);
  const names = new Set<string>(), lines = new Set<string>(), holings = new Set<string>(), props = new Set<string>();
  for (const e of c.gnomes) {
    const p = planned.get(e.id);
    if (!p) { err(e.id, "not in any series' plan"); continue; }
    if (p.tier !== e.tier || p.home !== e.home || p.wave !== e.wave || p.series !== e.series) err(e.id, `planned ${p.series} wave ${p.wave} ${p.home} ${p.tier}, is ${e.series} wave ${e.wave} ${e.home} ${e.tier}`);
    for (const [k, v] of [["tier", e.tier], ["home", e.home], ["archetype", e.archetype]] as const) counts[k][v] = (counts[k][v] ?? 0) + 1;
    if (!/^[A-Za-z' -]{3,24}$/.test(e.name)) err(e.id, `name "${e.name}"`);
    if (names.has(e.name)) err(e.id, `name "${e.name}" twice`);
    if (lines.has(e.line) || e.line.length > 100 || e.line.length < 12) err(e.id, `line "${e.line}"`);
    names.add(e.name), lines.add(e.line);
    const t = decode(e.traits);
    if (!t) { err(e.id, "traits do not decode"); continue; }
    if (encode(t) !== e.traits) err(e.id, "traits do not read back the same");
    if (t.tier !== e.tier || t.home !== e.home || t.archetype !== e.archetype) err(e.id, "traits disagree with the entry");
    for (const m of [...tierRules(t), ...readability(t)]) err(e.id, m);
    const sig = earnedSignature(t);
    if (sig) err(e.id, sig);
    if (t.tier === "epic") {
      const h = `${t.holing} ${t.holingColour}`;
      if (holings.has(h)) err(e.id, `holing ${t.holing} in ${colourName(t.holingColour ?? -1)} is another Epic's`);
      holings.add(h);
    }
    if (t.prop) {
      if (props.has(t.prop)) err(e.id, `prop ${t.prop} is another gnome's`);
      props.add(t.prop);
    }
    looks.push({ id: e.id, t });
  }
  // no two alike, none a copy of GNOMES'
  for (let i = 0; i < looks.length; i++) {
    for (let j = i + 1; j < looks.length; j++)
      if (lookDistance(looks[i].t, looks[j].t) < MIN_APART) err(looks[i].id, `looks like #${looks[j].id}`);
    for (const g of gnomes) if (lookDistance(looks[i].t, g) < MIN_FROM_GNOMES) err(looks[i].id, "looks like one of GNOMES");
  }
  return { errors, counts };
}
