// The mockups' kit: the icons the screens share, a stand-in catalogue, and
// the state switch (?state=…) every mockup reads. Stand-in only: the art is
// the 14 gnomes of web/lib/scene/gnome.ts as the picker renders them, until
// data/gnomes.json and its renders land; names, traits and owners are made up.

(() => {
const ICON = {
  back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5 8 12l7 7" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  about: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M12 11v6" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><circle cx="12" cy="7.4" r="1.6" fill="currentColor"/></svg>',
  close: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 4 16 16M16 4 4 16" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/></svg>',
  search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2.6"/><path d="m15.5 15.5 5 5" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"/></svg>',
  undo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 7 4 12l5 5M4 12h10a6 6 0 0 1 0 12h-2" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" transform="translate(0 -3)"/></svg>',
  redo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 7 5 5-5 5M20 12H10a6 6 0 0 0 0 12h2" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" transform="translate(0 -3)"/></svg>',
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12-7.5z" fill="currentColor"/></svg>',
  chain: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
  eye: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" fill="none" stroke="currentColor" stroke-width="2.2"/><circle cx="12" cy="12" r="3" fill="currentColor"/></svg>',
  x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.8 3h3.1l-6.8 7.7L22 21h-6.2l-4.9-6.3L5.3 21H2.2l7.2-8.3L1.8 3h6.4l4.4 5.8zM16.7 19.2h1.7L7.3 4.7H5.5z"/></svg>',
  bsky: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5.8 3.9C8.4 5.8 11.1 9.7 12 11.7c.9-2 3.6-5.9 6.2-7.8 1.9-1.4 4.9-2.5 4.9 1 0 .7-.4 5.8-.6 6.6-.8 2.9-3.7 3.6-6.3 3.2 4.5.8 5.7 3.3 3.2 5.9-4.7 4.8-6.8-1.2-7.3-2.8l-.1-.3-.1.3c-.5 1.6-2.6 7.6-7.3 2.8-2.5-2.6-1.3-5.1 3.2-5.9-2.6.4-5.5-.3-6.3-3.2C1.3 10.7.9 5.6.9 4.9c0-3.5 3-2.4 4.9-1z"/></svg>',
  copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
  more: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  heart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" fill="#e0524b" stroke="#144134" stroke-width="1.8"/></svg>',
  feedback: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-7l-4 3v-3H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
};

// the tiers' shapes: a disc, a diamond, a gem, a crown (read in grey too)
const TIER_ICON = {
  common: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.5"/></svg>',
  rare: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5 14.5 8 8 14.5 1.5 8z"/></svg>',
  epic: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2h8l3 4-7 8.5L1 6z M1 6h14 M6 2 5 6l3 8.5L11 6l-1-4"/></svg>',
  legendary: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 5 5 8l3-5.5L11 8l3.5-3-1.5 9H3z"/></svg>',
};
const TIER_NAME = { common: "Common", rare: "Rare", epic: "Epic", legendary: "Legendary" };
const tierChip = (t) => `<span class="tier tier--${t}">${TIER_ICON[t]}${TIER_NAME[t]}</span>`;

// the 14 renders, stand-ins for the catalogue's 256 px thumbnails
const art = (i) => `img/g${String(((i % 14) + 14) % 14).padStart(2, "0")}.png`;

// the worlds as the game names them (web/lib/card.ts CUP_NAMES)
const WORLDS = [
  { id: "garden", name: "Garden", of: "of the Garden", names: ["Fennel", "Clover", "Basil", "Thistle", "Moss", "Bramble", "Hazel", "Sorrel", "Pip", "Rowan", "Tansy", "Juniper"] },
  { id: "island", name: "Island", of: "of the Island", names: ["Coral", "Kelp", "Cove", "Puffin", "Barnacle", "Shelly", "Marlin", "Wrasse"] },
  { id: "town", name: "Mushroom Town", of: "of Mushroom Town", names: ["Crumpet", "Cobble", "Barley", "Pretzel", "Brioche", "Tinker", "Lamplight"] },
  { id: "mountain", name: "Mountain", of: "of the Mountain", names: ["Edelweiss", "Flint", "Fondue", "Sledge", "Cirrus", "Larch"] },
  { id: "mines", name: "Crystal Mines", of: "of the Mines", names: ["Garnet", "Quartz", "Cinder", "Ember", "Obsidian", "Pyrite"] },
];

const HATS = ["a bobble hat", "a tall red cone", "a straw brim", "a felt tricorn", "a baker's toque", "a top hat"];
const BEARDS = ["a white beard", "a ginger beard", "a long grey beard", "a moustache", "no beard"];
const EXTRAS = ["a sunflower behind the ear", "round glasses", "a leaf in the hat", "rosy cheeks", "a striped shirt", "a snail on the brim", "a mole friend"];

/** A stand-in gnome for an id: wave w's world, a tier by its place in the
 *  wave, traits picked by the id (the realm's table decides, not the page). */
function gnome(id, owners = {}) {
  const w = WORLDS[Math.floor((id - 1) / 101) % WORLDS.length];
  const k = (id - 1) % 101; // 72 Commons, 20 Rares, 9 Epics a wave (the brief's split)
  const tier = k < 72 ? "common" : k < 92 ? "rare" : "epic";
  const name = `${w.names[id % w.names.length]} ${w.of}`;
  const traits = { Hat: HATS[id % HATS.length], Beard: BEARDS[(id * 7) % BEARDS.length], Extra: EXTRAS[(id * 3) % EXTRAS.length] };
  if (tier !== "common") traits.Trail = ["petals", "bubbles", "sparks", "snowflakes"][id % 4];
  if (tier === "epic") traits.Holing = ["a fountain of petals", "a ring of crystal", "a burst of confetti"][id % 3];
  const price = { common: 30, rare: 99, epic: 333 }[tier];
  return { id, world: w.id, worldName: w.name, tier, name, line: `${cap(traits.Hat)}, ${traits.Beard} and ${traits.Extra}.`, traits, price, owner: owners[id] || "", art: art(id * 5 + (tier === "epic" ? 3 : 0)) };
}
const cap = (s) => s[0].toUpperCase() + s.slice(1);

/** The mockup's state, from ?state= (each mockup lists its own). */
const state = (def) => new URLSearchParams(location.search).get("state") || def;

/** The corner's Back and About, the game's own. */
const corners = (back = "Back", right = "") => `
  <div class="corner corner--l"><button class="round round--big" aria-label="${back}">${ICON.back}</button></div>
  <div class="corner corner--r">${right}<button class="round round--big" aria-label="About">${ICON.about}</button></div>`;

/** The testnet's banner, bottom left, as on every front screen (a phone's: "TEST" and the icon). */
const netbanner = () => `
  <div class="netbanner"><p class="netbanner__band"><b><span class="wide-only">TESTNET</span><span class="phone-only">TEST</span></b><span class="wide-only">practice scores</span>
  <button class="btn btn--ghost btn--s" aria-label="Send feedback">${ICON.feedback}<span class="wide-only">Feedback</span></button></p></div>`;

const shareRow = (label = "Share") => `
  <span class="share" role="group" aria-label="${label}"><span class="share__label">${label}</span>
  <a class="share__icon share__icon--x" aria-label="Post on X">${ICON.x}</a>
  <a class="share__icon share__icon--bsky" aria-label="Post on Bluesky">${ICON.bsky}</a>
  <a class="share__icon share__icon--copy" aria-label="Copy the link">${ICON.copy}</a>
  <a class="share__icon share__icon--more" aria-label="More ways to share">${ICON.more}</a></span>`;

window.Kit = { ICON, TIER_ICON, TIER_NAME, tierChip, art, WORLDS, gnome, state, corners, netbanner, shareRow };
})();
