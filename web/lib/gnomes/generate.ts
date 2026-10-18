// A series of gnomes from its data (data/gnomes/<series>/): the Commons and
// Rares made from archetypes and their palettes, the Epics and Legendaries as
// designed by hand, laid out on the series' plan. The same data and seed
// give the same gnomes, id for id (scripts/gnomes.ts writes them out).
import { seeded } from "../scene/common";
import { GNOMES } from "../scene/gnome";
import { ACCESSORIES, ARCHETYPES, BEARDS, COLOURS, HATS, HOLINGS, HOMES, MATERIALS, PATTERNS, PIECES, PROPS, TIERS, TRAILS, colour,
  type Accessory, type Archetype, type Beard, type Hat, type Home, type Pattern, type Piece } from "./vocab";
import { FORMAT, PLAIN, encode, type Traits } from "./codec";
import { deltaE } from "./colour";
import { lookOf, skinOf, traitsOf } from "./skin";
import { planSeries, type Catalogue, type Entry, type SeriesConfig, type SaleTier, evenly } from "./catalogue";
import { BUDGET, MIN_FROM_GNOMES, apart, earnedSignature, readability, tierRules } from "./validate";

/** A set of colours that go together (vocab names), and the openers of its gnomes' lines. */
export interface Palette { name: string; hat: string; body: string; accent: string; lines: string[] }
/** An archetype: the hats, beards and things that belong together, its palettes, its names and lines. */
export interface ArchetypeRecipe {
  id: Archetype; home: Home;
  /** what a palette is known by: its hat's colour (the default), or a baker's coat */
  key?: "hat" | "body";
  /** the colours that go with any of its palettes for the other: coats, or toques */
  wardrobe: string[];
  hats: Hat[]; beards: Beard[]; hair: string[];
  /** groups of things he may wear: at most one of each group */
  wear: Accessory[][];
  patterns: Pattern[]; pieces: Piece[]; palettes: Palette[]; surnames: string[]; lines: string[];
}
/** data/gnomes/<series>/archetypes.json. */
export interface Recipe {
  given: string[];
  rare: { pieces: Partial<Record<Piece, string[]>>; patterns: Partial<Record<Pattern, string[]>> };
  archetypes: ArchetypeRecipe[];
}
/** An Epic or a Legendary, designed by hand (epics.json, legendaries.json). */
export interface Design {
  home: Home; archetype: Archetype; name: string; line: string; concept: string; lore?: string; kind?: number;
  hat: Hat; hatColour: string; brim?: string; body: string; beard: Beard; hair?: string; wear?: Accessory[]; accent?: string;
  material?: Traits["material"]; materialColour?: string; prop: string; propColour?: string;
  trail: NonNullable<Traits["trail"]>; trailColour: string; holing: Traits["holing"]; holingColour: string;
}

const c = (name: string | undefined) => (name ? colour(name) : null);
/** The items in a random order of this seed. */
function shuffled<T>(xs: readonly T[], rand: () => number) {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
/** Every way to pick at most one of each group. */
const picks = (groups: Accessory[][]): Accessory[][] =>
  groups.reduce<Accessory[][]>((acc, g) => acc.flatMap((p) => [p, ...g.map((x) => [...p, x])]), [[]]);

/** A palette's colourings: its own hat and body, then its key colour with each of the wardrobe's for the other. */
function colourings(a: ArchetypeRecipe, p: Palette): { hat: number; body: number }[] {
  const own = { hat: colour(p.hat), body: colour(p.body) };
  const alt = a.wardrobe.map(colour).map((v) => (a.key === "body" ? { hat: v, body: own.body } : { hat: own.hat, body: v }));
  // a pairing of the wardrobe's plainly apart from the key (no near-hue clash); none twice
  return [own, ...alt.filter((x) => deltaE(x.hat, x.body) >= 0.12 && !(x.hat === own.hat && x.body === own.body))];
}

/** A Common's or a Rare's traits, from its archetype, palette, colouring and choices. */
function made(a: ArchetypeRecipe, p: Palette, k: { hat: number; body: number }, hat: Hat, beard: Beard, hair: string, wear: Accessory[], tier: SaleTier, rare?: { pattern: Pattern | "plain"; piece: Piece | "" }): Traits {
  const t: Traits = {
    ...PLAIN, tier, home: a.home, archetype: a.id, hat, hatColour: k.hat, beard, hair: beard === "none" ? null : colour(hair),
    body: k.body, accessories: wear, accent: colour(p.accent),
  };
  if (rare) {
    Object.assign(t, { pattern: rare.pattern, patternColour: rare.pattern === "plain" ? null : colour(p.accent), piece: rare.piece, pieceColour: rare.piece ? k.hat : null });
    // the ribbon in the accent, or the hat's colour where the accent would vanish on the green
    Object.assign(t, { trail: "ribbon", trailColour: colour(p.accent) });
    if (readability(t).some((m) => m.startsWith("trail"))) t.trailColour = k.hat;
  }
  return t;
}

/** What a look costs in triangles, as makeBall builds it (scene/gnome-cost.ts):
 *  given by the caller, so this module draws nothing. */
export type Triangles = (t: Traits) => number;

/** Whether a look can join: its tier's rules, readable, no earned signature,
 *  apart from all the others, and (when it can be counted) within budget. */
function fits(t: Traits, taken: readonly Traits[], gnomes: readonly Traits[], tris?: Triangles) {
  if (tierRules(t).length || readability(t).length || earnedSignature(t)) return false;
  if (!(taken.every((o) => apart(t, o)) && gnomes.every((g) => apart(t, g, MIN_FROM_GNOMES)))) return false;
  return !tris || tris(t) <= BUDGET[t.tier].tris;
}

/** n looks of an archetype for a tier: through its palettes in turn, each the next of its candidates that fits. */
function looksOf(a: ArchetypeRecipe, tier: "common" | "rare", n: number, rand: () => number, taken: Traits[], gnomes: readonly Traits[], tris?: Triangles) {
  const out: { t: Traits; p: Palette }[] = [];
  const rares = tier === "rare"
    ? [...a.patterns.map((pattern) => ({ pattern, piece: "" as const })), ...a.pieces.map((piece) => ({ pattern: "plain" as const, piece })),
      ...a.patterns.flatMap((pattern) => a.pieces.map((piece) => ({ pattern, piece })))]
    : [undefined];
  // two small things at most, and a Rare one fewer: its piece or pattern is its thing (readable, and in budget)
  const wears = picks(a.wear).filter((w) => w.length <= (tier === "rare" ? 1 : 2));
  const queues = a.palettes.map((p) => shuffled(colourings(a, p).flatMap((k) => a.hats.flatMap((hat) => a.beards.flatMap((beard) => (beard === "none" ? [a.hair[0]] : a.hair).flatMap((hair) =>
    wears.flatMap((wear) => rares.map((r) => () => made(a, p, k, hat, beard, hair, wear, tier, r))))))), rand));
  for (let k = 0; out.length < n; k = (k + 1) % queues.length) {
    if (queues.every((q) => !q.length)) throw new Error(`gnomes: ${a.id} has only ${out.length} ${tier} looks apart, not ${n}`);
    const q = queues[k];
    while (q.length) {
      const t = q.shift()!();
      if (fits(t, taken, gnomes, tris)) {
        out.push({ t, p: a.palettes[k] }), taken.push(t);
        break;
      }
    }
  }
  return out;
}

/** A hand design's traits. */
function designed(d: Design, tier: "epic" | "legendary", series: number): Traits {
  return {
    ...PLAIN, series, tier, kind: d.kind ?? 0, home: d.home, archetype: d.archetype, hat: d.hat, hatColour: colour(d.hatColour), brim: c(d.brim),
    beard: d.beard, hair: d.beard === "none" ? null : c(d.hair), body: colour(d.body), accessories: d.wear ?? [], accent: c(d.accent),
    material: d.material ?? "toon", materialColour: c(d.materialColour), prop: d.prop, propColour: c(d.propColour),
    trail: d.trail, trailColour: colour(d.trailColour), holing: d.holing, holingColour: colour(d.holingColour),
  };
}

/** Names and lines, never the same twice: the next unused of a deterministic walk. */
function namer(recipe: Recipe, rand: () => number, used: Set<string>) {
  const given = shuffled(recipe.given, rand);
  let g = 0;
  return (a: ArchetypeRecipe) => {
    for (let tries = 0; tries < given.length * a.surnames.length; tries++) {
      const name = `${given[g++ % given.length]} ${a.surnames[Math.floor(rand() * a.surnames.length)]}`;
      if (name.length <= 24 && !used.has(name)) return used.add(name), name;
    }
    throw new Error(`gnomes: no name left for a ${a.id}`);
  };
}
function liner(rand: () => number, used: Set<string>) {
  return (openers: readonly string[], tails: readonly string[]) => {
    for (const o of shuffled(openers, rand)) for (const t of shuffled(tails, rand)) {
      const line = `${o} ${t}`;
      if (line.length <= 100 && !used.has(line)) return used.add(line), line;
    }
    throw new Error("gnomes: no line left");
  };
}

/**
 * A series' gnomes, id by id on its plan. gnomes: GNOMES' looks (lookOf),
 * which no gnome of the series may come near. Throws when the data cannot
 * fill the plan (too few looks apart, a hand design missing or extra).
 */
export function generateSeries(s: SeriesConfig, recipe: Recipe, epics: readonly Design[], legendaries: readonly Design[], gnomes: readonly Traits[], tris?: Triangles): Entry[] {
  const rand = seeded(s.seed), out: Entry[] = [], taken: Traits[] = [];
  const name = namer(recipe, rand, new Set([...epics, ...legendaries].map((d) => d.name))), line = liner(rand, new Set());
  const designs = { epic: epics, legendary: legendaries };
  // the hand designs first: the generated ones keep away from them
  const hand = new Map<string, Traits[]>();
  for (const tier of ["epic", "legendary"] as const)
    for (const d of designs[tier]) {
      const t = designed(d, tier, s.code);
      taken.push(t);
      hand.set(`${tier} ${d.home}`, [...(hand.get(`${tier} ${d.home}`) ?? []), t]);
    }
  for (const w of planSeries(s)) {
    const archetypes = recipe.archetypes.filter((a) => a.home === w.home);
    if (!archetypes.length) throw new Error(`gnomes: no archetype for ${w.home}`);
    for (const tier of ["common", "rare", "epic", "legendary"] as const) {
      const { first, count } = w.tiers[tier];
      let looks: { t: Traits; name: string; line: string }[];
      if (tier === "common" || tier === "rare") {
        looks = evenly(count, archetypes.length).flatMap((n, i) => {
          const a = archetypes[i];
          return looksOf(a, tier, n, rand, taken, gnomes, tris).map(({ t, p }) => {
            const openers = tier === "common" ? p.lines : [...(recipe.rare.pieces[t.piece as Piece] ?? []), ...(recipe.rare.patterns[t.pattern] ?? [])];
            return { t: { ...t, series: s.code }, name: name(a), line: line(openers, a.lines) };
          });
        });
        // the archetypes of a world mixed, as a gallery shows them
        looks = shuffled(looks, rand);
      } else {
        const mine = designs[tier].filter((d) => d.home === w.home);
        if (mine.length !== count) throw new Error(`gnomes: ${w.home} has ${mine.length} ${tier} designs for ${count} planned`);
        looks = mine.map((d, i) => ({ t: hand.get(`${tier} ${w.home}`)![i], name: d.name, line: d.line }));
      }
      looks.forEach(({ t, name: n, line: l }, i) => {
        const id = first + i, traits = encode(t);
        out.push({ id, series: s.id, tier, home: w.home, archetype: t.archetype as Archetype, name: n, line: l, traits, skin: skinOf(t, { id: `t${id}`, name: n, line: l }) });
      });
    }
  }
  return out;
}

/** A file of data/gnomes/ ("series.json", "genesis/epics.json"…), parsed: the caller reads it. */
export type ReadData = (path: string) => unknown;

/** The whole catalogue (data/gnomes.json) from data/gnomes/: every series
 *  on its plan, the tables the traits are codes into, the nine earned gnomes. */
export function makeCatalogue(read: ReadData, tris?: Triangles): Catalogue {
  const config = read("series.json") as { series: SeriesConfig[] };
  const gnomes = GNOMES.map((g) => lookOf(g));
  const hex = (v: number) => "#" + v.toString(16).padStart(6, "0");
  return {
    version: 1,
    format: FORMAT,
    note: "Made by scripts/gnomes.ts from data/gnomes/: do not edit by hand. The traits' encoding and the rules: docs/gnomes/design.md.",
    series: config.series.map((s) => ({ ...s, plan: planSeries(s) })),
    vocab: {
      colours: COLOURS.map(([name, v]) => [name, hex(v)] as const), tiers: TIERS, homes: HOMES, archetypes: ARCHETYPES, hats: HATS,
      beards: BEARDS, patterns: PATTERNS, accessories: ACCESSORIES, pieces: PIECES, materials: MATERIALS, trails: TRAILS, holings: HOLINGS, props: PROPS,
    },
    earned: GNOMES.filter((g) => g.unlock).map((g) => ({ kind: traitsOf(g).kind, unlock: g.unlock!, name: g.name, line: g.line, traits: encode(traitsOf(g)) })),
    gnomes: config.series.flatMap((s) => generateSeries(s, read(`${s.id}/archetypes.json`) as Recipe,
      (read(`${s.id}/epics.json`) as { epics: Design[] }).epics, (read(`${s.id}/legendaries.json`) as { legendaries: Design[] }).legendaries, gnomes, tris)),
  };
}
