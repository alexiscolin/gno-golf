// A token's look as the realm keeps it: one byte a field, written as
// lowercase hex, the format first (docs/gnomes/design.md, "Trait encoding").
// What a reader does not know it draws plain: a code past its table, a
// colour past the palette, a field the string is too short to hold. A field
// added later is appended, so an older reader still reads the ones it knows;
// a format other than its own (a field whose meaning changed) it does not read.
import { ACCESSORIES, ARCHETYPES, BEARDS, COLOURS, HATS, HOLINGS, HOMES, MATERIALS, PATTERNS, PIECES, PROPS, TIERS, TRAILS,
  type Accessory, type Archetype, type Beard, type Hat, type Holing, type Home, type Material, type Pattern,
  type Piece, type Tier, type Trail, colourCode } from "./vocab";

/** The format this client writes and reads. */
export const FORMAT = 1;
/** A colour field with nothing in it (a beardless gnome's hair, a hat's own brim). */
const NONE = 255;

/** A token's traits, decoded: names for codes, colour values (null: none, the default). */
export interface Traits {
  series: number;
  tier: Tier;
  /** an earned gnome's (1–9, UNLOCKS' order) or a Legendary's (1–7) number; 0 otherwise */
  kind: number;
  home: Home | "";
  archetype: Archetype | "";
  hat: Hat;
  hatColour: number | null;
  brim: number | null;
  beard: Beard;
  hair: number | null;
  body: number | null;
  pattern: Pattern;
  patternColour: number | null;
  accessories: Accessory[];
  accent: number | null;
  piece: Piece | "";
  pieceColour: number | null;
  material: Material;
  materialColour: number | null;
  trail: Trail | "";
  trailColour: number | null;
  holing: Holing;
  holingColour: number | null;
  prop: string;
  propColour: number | null;
}

/** The plain gnome: what every field falls back to. */
export const PLAIN: Readonly<Traits> = {
  series: 0, tier: "common", kind: 0, home: "", archetype: "", hat: "cone", hatColour: null, brim: null, beard: "full",
  hair: null, body: null, pattern: "plain", patternColour: null, accessories: [], accent: null, piece: "",
  pieceColour: null, material: "toon", materialColour: null, trail: "", trailColour: null, holing: "confetti",
  holingColour: null, prop: "", propColour: null,
};

type Key = keyof Traits;
/** A field: where it is, how wide, and what its code means. */
type Field = { key: Key; table?: readonly string[]; colour?: true; mask?: true; number?: true };
// in the order they are written; byte 0 is the format
const FIELDS: readonly Field[] = [
  { key: "series", number: true }, { key: "tier", table: TIERS }, { key: "kind", number: true },
  { key: "home", table: HOMES }, { key: "archetype", table: ARCHETYPES }, { key: "hat", table: HATS },
  { key: "hatColour", colour: true }, { key: "brim", colour: true }, { key: "beard", table: BEARDS },
  { key: "hair", colour: true }, { key: "body", colour: true }, { key: "pattern", table: PATTERNS },
  { key: "patternColour", colour: true }, { key: "accessories", mask: true }, { key: "accent", colour: true },
  { key: "piece", table: PIECES }, { key: "pieceColour", colour: true }, { key: "material", table: MATERIALS },
  { key: "materialColour", colour: true }, { key: "trail", table: TRAILS }, { key: "trailColour", colour: true },
  { key: "holing", table: HOLINGS }, { key: "holingColour", colour: true }, { key: "prop", table: PROPS },
  { key: "propColour", colour: true },
];
/** How many hex characters a format 1 look is. */
export const LENGTH = 2 * (1 + FIELDS.reduce((n, f) => n + (f.mask ? 4 : 1), 0));

const byte = (n: number) => n.toString(16).padStart(2, "0");

/** A look as the realm stores it. Throws on what cannot be written: a colour
 *  outside the palette, a name outside its table, a number over a byte. */
export function encode(t: Traits): string {
  let out = byte(FORMAT);
  for (const f of FIELDS) {
    const v = t[f.key];
    if (f.mask) {
      let m = 0;
      for (const a of v as Accessory[]) {
        const i = ACCESSORIES.indexOf(a);
        if (i < 0) throw new Error(`gnomes: no accessory "${a}"`);
        m |= 1 << i;
      }
      out += (m >>> 0).toString(16).padStart(8, "0");
    } else if (f.colour) {
      const i = v === null ? NONE : colourCode(v as number);
      if (i < 0 || (i >= NONE && v !== null)) throw new Error(`gnomes: ${f.key} ${(v as number).toString(16)} is not in the palette`);
      out += byte(i);
    } else if (f.table) {
      const i = f.table.indexOf(v as string);
      if (i < 0 || i > 255) throw new Error(`gnomes: no ${f.key} "${String(v)}"`);
      out += byte(i);
    } else {
      if (!Number.isInteger(v) || (v as number) < 0 || (v as number) > 255) throw new Error(`gnomes: ${f.key} ${String(v)} is not a byte`);
      out += byte(v as number);
    }
  }
  return out;
}

/** A stored look, read: each field it knows, the plain one for the rest;
 *  null for a string that is not a look of this format (the caller draws
 *  the Classic). */
export function decode(hex: string): Traits | null {
  if (!/^(?:[0-9a-f]{2})+$/.test(hex) || parseInt(hex.slice(0, 2), 16) !== FORMAT) return null;
  const t: Record<string, unknown> = { ...PLAIN, accessories: [] };
  let at = 2;
  for (const f of FIELDS) {
    const w = f.mask ? 8 : 2;
    if (at + w > hex.length) break; // a shorter look: the rest stay plain
    const n = parseInt(hex.slice(at, at + w), 16);
    at += w;
    if (f.mask) t[f.key] = ACCESSORIES.filter((_, i) => n & (1 << i));
    else if (f.colour) t[f.key] = n < COLOURS.length ? COLOURS[n][1] : null;
    else if (f.table) t[f.key] = n < f.table.length ? f.table[n] : PLAIN[f.key];
    else t[f.key] = n;
  }
  return t as unknown as Traits;
}
