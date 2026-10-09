// A hole's name suggested (the game-design review's quick win 11): "Mossy
// Snail Trail", "Breezy Crab Cove". Two words from a small list of the
// world's own, kind and short (within the realm's 40), the same for a draft
// and a roll (no Math.random: a seed from the draft, the roll's number), a
// new one at each roll of the die by the name field.
import type { Draft } from "./draft";

export const WORDS: Record<string, { adjectives: readonly string[]; nouns: readonly string[] }> = {
  garden: {
    adjectives: ["Mossy", "Sunny", "Twisty", "Sleepy", "Buzzing", "Dewy", "Crooked", "Lazy", "Hidden", "Merry", "Tangled", "Bumbling"],
    nouns: ["Hedge", "Burrow", "Daisy Run", "Gnome Gap", "Snail Trail", "Rose Bend", "Bramble", "Pond Hop", "Molehill", "Teapot", "Bee Line", "Shed"],
  },
  island: {
    adjectives: ["Breezy", "Salty", "Sandy", "Sunny", "Wavy", "Lazy", "Coral", "Drifting", "Lucky", "Tidal", "Golden", "Sleepy"],
    nouns: ["Lagoon", "Crab Cove", "Palm Pass", "Shell Bend", "Reef", "Dune Hop", "Parrot Point", "Tide Pool", "Sandbar", "Bay", "Driftwood", "Jetty"],
  },
  town: {
    adjectives: ["Cosy", "Crooked", "Busy", "Rainy", "Lamplit", "Cobbled", "Hidden", "Merry", "Spotted", "Little", "Sleepy", "Winding"],
    nouns: ["Alley", "Square", "Market", "Chimney Run", "Bakery Bend", "Clock Lane", "Toadstool", "Gutter", "Fountain", "Bridge", "Pigeon Row", "Corner"],
  },
  mountain: {
    adjectives: ["Frosty", "Snowy", "Windy", "Rocky", "Misty", "Icy", "Lofty", "Crisp", "Sunny", "Steep", "Quiet", "Glinting"],
    nouns: ["Pass", "Ridge", "Chalet", "Glacier", "Pine Run", "Summit", "Ice Slide", "Goat Path", "Couloir", "Snowfield", "Peak", "Hut"],
  },
};

/** A small hash (FNV-1a) of a string, unsigned. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h;
}

/** A draft's seed: its world, where its tee and cup started and its pieces (not its name: renaming it keeps it). */
export const seedOf = (d: Pick<Draft, "world" | "tee" | "pin" | "pieces">): string => `${d.world} ${d.tee.join()} ${d.pin.join()} ${d.pieces.map((p) => p.entry).join()}`;

/** The name suggested for the seed's draft at roll n (0 the first): a new pair each roll, around the whole list. */
export function suggestName(world: string, seed: string, n: number): string {
  const { adjectives: a, nouns: b } = WORDS[world] ?? WORDS.garden, all = a.length * b.length;
  // a prime stride that does not divide the pairs' count walks them all before it repeats one, both words moving
  const step = [61, 67, 71, 73].find((p) => all % p !== 0)!, k = (hash(seed) + n * step) % all;
  return `${a[k % a.length]} ${b[Math.floor(k / a.length) % b.length]}`;
}
