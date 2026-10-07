// The gnome collection's words: every trait a token can carry, each table in
// the order its code is written (docs/gnomes/design.md, "Trait encoding").
// Append only: a code, once a token carries it, means the same thing for
// good. A new hat, effect or colour is a new last entry here and its mesh in
// scene/ (the binding: its name); nothing else changes, and a client that
// does not have it yet draws the plain form.

/** A colour of the collection: its name (what the data and the trait lists say) and its value. */
export type Colour = readonly [name: string, hex: number];

// The first 27 are every colour GNOMES draws with today, so an earned gnome
// writes exactly as it is drawn; the rest are the collection's own
// (design.md, "The signature palette").
export const COLOURS: readonly Colour[] = [
  ["cap", 0xe0524b], ["cream", 0xfdf6e9], ["sun", 0xffd98a], ["white", 0xffffff], ["ink", 0x144134],
  ["periwinkle", 0x5b6fb5], ["snow", 0xf1eee6], ["pine", 0x2f8f6f], ["ginger", 0xd9793a], ["mustard", 0xf2b94a],
  ["cocoa", 0x6b4a2f], ["rose", 0xe98fb0], ["indigo", 0x4b3a9a], ["steel", 0x9aa5ab], ["wheat", 0xd9a441],
  ["gold", 0xf2c14e], ["butter", 0xf7d977], ["coal", 0x1f2328], ["bark", 0x3a2a1c], ["lagoon", 0x2aa6a0],
  ["seafoam", 0x7fd3cc], ["ash", 0xd9d4c8], ["pebble", 0x9a8b7a], ["walnut", 0x9a6f42], ["petal", 0xf2b8b0],
  ["parrot", 0x3fa34d], ["royal", 0x6b3fa0],
  // the collection's
  ["moss", 0x6e8b3d], ["sage", 0x9cbf8a], ["fern", 0x4f7f4a], ["tile", 0xb8573f], ["terracotta", 0xc8693f],
  ["brick", 0x9e3b32], ["plum", 0x7a3b6e], ["heather", 0xa184c9], ["lilac", 0xc9b3e6], ["sky", 0x79c0e8],
  ["navy", 0x24406e], ["denim", 0x3f6aa8], ["teal", 0x1f7a7a], ["mint", 0xa8dcc4], ["lemon", 0xf5e06b],
  ["apricot", 0xf4a76b], ["coral", 0xf07a68], ["berry", 0xb83a5e], ["slate", 0x5c6670], ["pewter", 0x8b939a],
  ["charcoal", 0x3b3f45], ["linen", 0xefe4cf], ["oat", 0xd8c7a3], ["caramel", 0xb9814a], ["chestnut", 0x7c4a2a],
  ["auburn", 0xa4492b], ["flaxen", 0xe8d28c], ["silver", 0xc9ced3], ["ice", 0xdff1f7], ["glacier", 0xa9d8ea],
  ["ruby", 0xc23b4a], ["emerald", 0x2f9e6b], ["amethyst", 0x8a5ad1], ["copper", 0xc97a43], ["brass", 0xc9a245],
  ["bronze", 0xa87038], ["pink", 0xff4fa8], ["cyan", 0x3ff0ff], ["lime", 0xb6ff3f], ["amber", 0xffb43f],
  ["obsidian", 0x2a2433], ["lava", 0xff6a2a], ["jade", 0x5fae8c], ["delft", 0x2f5fb3], ["marble", 0xeceae6],
  ["chocolate", 0x5a3522], ["olive", 0x7d7a3a], ["saffron", 0xe8a33a], ["rust", 0x9c4a26], ["storm", 0x4a5568],
  ["lichen", 0xb7c49a], ["peach", 0xf7c7a3], ["blush", 0xf5d5d0], ["sand", 0xe3c79a], ["honey", 0xe0a43c],
];

/** The tiers, by code: 0 is the nine earned gnomes, never sold. */
export const TIERS = ["earned", "common", "rare", "epic", "legendary"] as const;
/** Where a gnome comes from: the five cups and the course's two set pieces. 0: none (the earned). */
export const HOMES = ["", "garden", "island", "town", "mountain", "mines", "volcano", "storm"] as const;
/** What a gnome does: one look of hats, beards and things that belong together (design.md, "Archetypes"). */
export const ARCHETYPES = ["", "gardener", "fisher", "sailor", "deckhand", "baker", "painter", "skier", "alpinist",
  "miner", "prospector", "explorer", "smith", "stormwatch", "apprentice"] as const;
/** The hats: GNOMES' six first (cone, tall and helmet are not Skin.shape: see codec), then the collection's. */
export const HATS = ["cone", "tall", "tricorn", "toque", "tophat", "helmet", "straw", "bucket", "sailor", "bandana",
  "beret", "beanie", "alpine", "slouch", "pith", "skullcap", "souwester", "mill", "mushroom"] as const;
export const BEARDS = ["full", "long", "bushy", "moustache", "none", "goatee", "braids", "chops"] as const;
export const PATTERNS = ["plain", "stripes", "spots", "checks", "zigzag", "argyle", "patchwork"] as const;
/** Small things a gnome wears, one bit each (the 32-bit mask, bit 0 first). */
export const ACCESSORIES = ["glasses", "pompom", "flower", "cheeks", "stars", "horns", "patch", "parrot", "mask",
  "flour", "sash", "monocle", "crown", "cape", "lamp", "goggles", "earring", "neckerchief", "leaf", "soot",
  "freckles", "moon"] as const;
/** A Rare's piece: one thing more than any Common wears. 0: none. */
export const PIECES = ["", "scarf", "bowtie", "plume", "earmuffs", "satchel", "medal"] as const;
/** What a gnome is made of: an Epic's or a Legendary's own; 0 the game's toon. */
export const MATERIALS = ["toon", "metal", "wood", "neon", "porcelain", "stone", "glaze", "wool", "gingerbread",
  "crystal", "lava", "frost"] as const;
/** What a gnome leaves behind as he rolls. 0: nothing. */
export const TRAILS = ["", "ribbon", "sparks", "shavings", "light", "shards", "embers", "streaks", "petals", "foam",
  "spores", "snow", "bubbles", "leaves", "stars", "notes", "dust", "crumbs"] as const;
/** What the cup does when he drops in. 0: the game's confetti. */
export const HOLINGS = ["confetti", "sparks", "shavings", "pulse", "shards", "embers", "bolt", "petals", "splash",
  "spores", "avalanche", "bubbles", "leaves", "stars", "notes", "steam", "crumbs", "ripples", "feathers", "gale"] as const;

/** An Epic's own thing (and a Legendary's piece) by code, 0: none; each one's shapes are props.ts PROP_DESIGNS'. */
export const PROPS = ["", "windup-key", "watering-can", "acorn", "spade", "snail", "teacup", "knitting",
  "neon-bloom", "koi", "fishing-rod", "bosun-whistle", "ship-wheel", "anchor", "beacon", "conch", "palm", "spyglass",
  "rope-coil", "gull", "oyster", "rolling-pin", "cupcake", "whisk", "paint-palette", "paintbrush", "clock-face",
  "pigeon", "candle", "cinnamon-roll", "ice-axe", "alphorn", "cuckoo-clock", "cocoa-mug", "skis", "edelweiss",
  "cairn", "rescue-keg", "snowglobe", "pickaxe", "geode", "canary-cage", "gold-pan", "glow-crystal", "gears",
  "hand-lantern", "mole", "nugget", "hammer", "bellows", "map-scroll", "thermometer", "pineapple", "neon-flame",
  "clay-pot", "torch", "kettle", "lightning-rod", "weathervane", "barometer", "spellbook", "umbrella", "kite",
  "crystal-ball", "stone-wings", "owl", "crystal-cluster", "lava-vent", "thundercloud", "mill-sails", "epaulettes",
  "fairy-ring", "frost-cap"] as const;

export type Tier = (typeof TIERS)[number];
export type Home = Exclude<(typeof HOMES)[number], "">;
export type Archetype = Exclude<(typeof ARCHETYPES)[number], "">;
export type Hat = (typeof HATS)[number];
export type Beard = (typeof BEARDS)[number];
export type Pattern = (typeof PATTERNS)[number];
export type Accessory = (typeof ACCESSORIES)[number];
export type Piece = Exclude<(typeof PIECES)[number], "">;
export type Material = (typeof MATERIALS)[number];
export type Trail = Exclude<(typeof TRAILS)[number], "">;
export type Holing = (typeof HOLINGS)[number];

/** The earned gnomes' pieces: no gnome of the sale wears one (design.md, "Never a copy"). */
export const EARNED_ONLY: readonly Accessory[] = ["stars", "horns", "parrot", "mask", "sash", "crown", "cape", "lamp"];

const byName = new Map(COLOURS.map(([n, v], i) => [n, { v, i }]));
/** A colour's value by its name; throws on a name the palette lacks (data is checked, not guessed). */
export function colour(name: string) {
  const c = byName.get(name);
  if (!c) throw new Error(`gnomes: no colour "${name}" in the palette`);
  return c.v;
}
/** A colour's code (its index), or -1 for a value outside the palette. */
export const colourCode = (v: number) => COLOURS.findIndex(([, x]) => x === v);
/** A colour's name, or "" for a value outside the palette. */
export const colourName = (v: number) => COLOURS.find(([, x]) => x === v)?.[0] ?? "";
