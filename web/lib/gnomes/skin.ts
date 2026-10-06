// A token's traits as the gnome makeBall draws (and back). An earned kind is
// GNOMES' own gnome, as the game draws it; anything else is built from its
// fields, each plain where the traits say nothing.
import { C } from "../scene/materials";
import { GNOMES, type Skin } from "../scene/gnome";
import { UNLOCKS, type UnlockId } from "../card";
import { ACCESSORIES, type Accessory } from "./vocab";
import { PLAIN, decode, type Traits } from "./codec";

/** The earned kinds, by their code (1 first): UNLOCKS' order. */
export const EARNED_KINDS = Object.keys(UNLOCKS) as UnlockId[];

/** What a token is called, besides its look. */
export interface Named { id: string; name: string; line: string }

/** The gnome a token's traits draw. */
export function skinOf(t: Traits, { id, name, line }: Named): Skin {
  if (t.tier === "earned") {
    const earned = GNOMES.find((g) => g.unlock && g.unlock === EARNED_KINDS[t.kind - 1]);
    if (earned) return earned;
  }
  const s: Skin = { id, name, line, hat: t.hatColour ?? C.cap, beard: t.beard };
  if (t.hat === "tall") s.tall = true;
  else if (t.hat === "helmet") s.helmet = true;
  else if (t.hat !== "cone") s.shape = t.hat;
  if (t.brim !== null) s.brim = t.brim;
  if (t.hair !== null) s.hair = t.hair;
  if (t.body !== null) s.body = t.body;
  for (const a of t.accessories) s[a] = true;
  if (t.accent !== null) s.accent = t.accent;
  if (t.pattern !== "plain") (s.pattern = t.pattern), t.patternColour !== null && (s.patternColor = t.patternColour);
  if (t.piece) (s.piece = t.piece), t.pieceColour !== null && (s.pieceColor = t.pieceColour);
  if (t.material !== "toon") (s.material = t.material), t.materialColour !== null && (s.materialColor = t.materialColour);
  if (t.trail) (s.trail = t.trail), t.trailColour !== null && (s.trailColor = t.trailColour);
  if (t.holing !== "confetti") (s.holing = t.holing), t.holingColour !== null && (s.holingColor = t.holingColour);
  if (t.prop) (s.prop = t.prop), t.propColour !== null && (s.propColor = t.propColour);
  return s;
}

type More = Partial<Pick<Traits, "series" | "tier" | "kind" | "home" | "archetype">>;

/** A gnome's look as traits, as encode writes them (an earned one: his kind alone, the game draws the rest). */
export const traitsOf = (s: Skin, more: More = {}): Traits =>
  s.unlock ? { ...PLAIN, accessories: [], tier: "earned", kind: EARNED_KINDS.indexOf(s.unlock) + 1, ...more } : lookOf(s, more);

/** Every field of a gnome's look, an earned one's too (his stripes as a pattern): what validate compares. */
export function lookOf(s: Skin, more: More = {}): Traits {
  if (s.stripes) return lookOf({ ...s, stripes: undefined, body: s.stripes[0], pattern: "stripes", patternColor: s.stripes[1] }, more);
  return {
    ...PLAIN, ...more,
    hat: s.tall ? "tall" : s.helmet ? "helmet" : s.shape ?? "cone",
    hatColour: s.hat, brim: s.brim ?? null, beard: s.beard, hair: s.hair ?? null, body: s.body ?? null,
    accessories: ACCESSORIES.filter((a: Accessory) => s[a] === true), accent: s.accent ?? null,
    pattern: s.pattern ?? "plain", patternColour: s.patternColor ?? null,
    piece: s.piece ?? "", pieceColour: s.pieceColor ?? null,
    material: s.material ?? "toon", materialColour: s.materialColor ?? null,
    trail: s.trail ?? "", trailColour: s.trailColor ?? null,
    holing: s.holing ?? "confetti", holingColour: s.holingColor ?? null,
    prop: s.prop ?? "", propColour: s.propColor ?? null,
  };
}

/** The gnome a stored look draws, whatever it is: a look this client cannot
 *  read draws the Classic, under the token's own name. */
export function skinOfTraits(hex: string, named: Named): Skin {
  const t = decode(hex);
  return t ? skinOf(t, named) : { ...GNOMES[0], ...named };
}
