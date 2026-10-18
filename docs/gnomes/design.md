# The gnome collection: design bible

The rules every collectible gnome is made to, and the data the realm and the
screens read. Status: the Genesis series (720 gnomes) is designed, generated,
checked and drawn; the realm (`r/gnogolf/gnomes`), the shop and the game's
use of trails and holings are other work, which reads this.

What is where:

| what | file |
|---|---|
| the series, their supply, waves and sale settings: **the one place counts live** | `data/gnomes/series.json` |
| the Genesis recipe: archetypes, palettes, names, lines | `data/gnomes/genesis/archetypes.json` |
| the 65 Epics and the 7 Legendaries, designed by hand | `data/gnomes/genesis/epics.json`, `legendaries.json` |
| **the catalogue** (made, never edited): every token's id, tier, name, line, traits and skin; the code tables; the earned nine | `data/gnomes.json` |
| the words (code tables, palette), append only | `web/lib/gnomes/vocab.ts`, `props.ts` |
| the traits' encoding | `web/lib/gnomes/codec.ts` |
| a token's gnome (`skinOf`) | `web/lib/gnomes/skin.ts` |
| the plan, tier looks, trait list, filters: what the screens call | `web/lib/gnomes/catalogue.ts` |
| the generator and the rules | `web/lib/gnomes/generate.ts`, `validate.ts` |
| the meshes: hats and wear, props, materials, Legendary pieces, trails and holings, the showcase | `web/lib/scene/gnome*.ts` |
| what a gnome costs to draw | `web/lib/scene/gnome-cost.ts` |
| make and check the catalogue | `npm run gnomes [-- --check]` (`scripts/gnomes.ts`; `scripts/check.sh` runs `--check`) |
| **the realm's rows**, one file a series, what `AddSeries` is sent | `npm run gnomes:rows [-- --check]` (`scripts/gnomerows.ts`, `web/lib/gnomes/rows.ts`) → `data/gnomes/rows/<series>.txt` |
| **the golden looks**: what every gnome is drawn as, for good | `npm run gnomes:looks [-- --write]` (`scripts/gnomelooks.ts`, `web/test/looks.ts`) → `data/gnomes/looks.golden.json` |
| how far apart the gnomes are | `npm run gnomes:stats` (`scripts/gnomestats.ts`) |
| thumbnails and turntables | `npm run gnomes:thumbs` (`media/gnomes/render.mjs`) → `media/gnomes/thumbs/<id>.webp`, `media/gnomes/turntables/<id>.webp` |

Decisions: ADR-008 (the catalogue as data, in series and waves), ADR-009 (the
trait encoding), ADR-010 (the look: style, materials, props as data, budgets,
permanence), ADR-011 (the collection as status: the album and the collector
rank). ADR-007 is the realm's (`r/gnogolf/gnomes`).

## 1. The style

The ball is a gnome, and every gnome of the collection is drawn the way the
game draws everything: **flat colour in three bands of light, under a thin
ink line**. Nothing is rendered realistically. A collectible is the game's
own gnome with more of a story, never a different art.

- **One silhouette.** A round body (the ball itself: a sphere of 0.55, scaled
  to the chain's radius), a hat on top leaning back, a beard under a pink
  nose, two ink eyes. Every gnome keeps all of it. What changes is the hat's
  shape, what he wears, and what he is made of.
- **The ink.** `inked()` with `THIN_HULL` (0.028), colour `C.ink` (#144134),
  on every part of a size to carry it; small marks (spots, glints, eyes)
  have none. The one exception is neon, whose line is lit in its colour and
  a little heavier (0.04): the sign at night is the point.
- **The light.** The game's day light (`makeScene`: a warm sky over a green
  ground, a soft sun from above right) and its toon bands (104, 178, 255).
  Polished materials get a fourth, narrow, bright band and a glint; stone a
  softer three.
- **Shape language by tier** (what a glance reads first, before colour):
  - *Common*: soft and simple. A hat, a beard, at most two small things.
  - *Rare*: the same gnome, plus **a graphic**: a patterned body (stripes,
    spots, checks, zigzag, argyle, patchwork) or one bigger piece (scarf,
    bow tie, plume, earmuffs, satchel, medal), and **a ribbon of colour
    behind him** as he rolls.
  - *Epic*: **a material** that changes how light sits on him (metal, wood,
    neon, porcelain, stone, glaze, wool, gingerbread), **a prop** of his own
    that tells his story, his own trail and his own holing.
  - *Legendary*: **a piece that breaks the outline and moves** (sails
    turning, a cloud raining, a cap breathing), a material or hat no other
    gnome has, a trail and a holing only he has.
- **Rarity at a glance, colour-blind too.** Silhouette and surface first,
  colour second: a Rare is patterned or carries a piece, an Epic shines or
  has grain, a Legendary has a moving piece. The tier colours (below) only
  confirm it.
- **Tier colours**, everywhere (frames, thumbnails' ground, plinths, pills),
  in the order games use (`TIER_LOOK` in `catalogue.ts`):

  | tier | frame | ground | plinth |
  |---|---|---|---|
  | Earned | #226c57 (gno green) | #e8f1ec | #b9d4c6 |
  | Common | #8b939a (stone) | #f3eee4 (cream) | #d9d0c0 |
  | Rare | #3f6aa8 (blue) | #e4ecf7 | #bfd0ea |
  | Epic | #7a4fc0 (purple) | #ede5f7 | #d3c3ec |
  | Legendary | #d9962b (gold) | #fbf0d6 | #f0d79a |

### The signature palette

82 named colours (`COLOURS` in `vocab.ts`). The first 27 are every colour
`GNOMES` draws with today, so an earned gnome encodes as it is drawn. The
rest are the collection's: garden greens and earths, sea blues, bakery
pastels, metals (brass, copper, bronze, silver, steel, pewter), the
Legendaries' own (obsidian, lava, glacier, ice), and four neons (pink, cyan,
lime, amber) used only for Epics' light. Colours are chosen by name in the
data; a value outside the palette cannot be written.

Palettes are curated, never random: each archetype has eight, each a hat,
a body and an accent that go together and have a name and a story ("Tomato:
the hat ripened first").

### Thumbnails

`media/gnomes/render.mjs` draws each gnome with the game's own `makeBall`,
in headless Chrome, through `makeShowcase` (`web/lib/scene/gnome-showcase.ts`):

- one camera for all: three-quarters from his front, on the side he carries
  things (+x, where the Pirate's parrot and the Diver's snorkel are), a
  little above, a 26° lens, the tallest hat in frame;
- the game's day light; the tier's ground behind, a disc of its plinth
  colour under him (ringed once for a Rare, twice for an Epic, rayed for a
  Legendary): the tier reads even in a thumbnail's corner;
- a Rare's or better's trail on the ground behind him, as if he had just
  rolled in;
- drawn at 512 px, scaled to **256×256 WebP under 10 KB** (5.5 KB on
  average for the 720);
- the seven Legendaries also as a **turntable**: 36 frames, a full turn,
  his piece moving, an animated WebP of about 250 KB
  (`media/gnomes/turntables/`). Headless Chrome reports reduced motion: the
  renderer asks for none, or the game would draw no trail.

The same throw of the dice every time (a seeded `Math.random` in the page):
a thumbnail made twice is the same picture.

## 2. Archetypes

An archetype is a look that belongs together: its hats, beards, the small
things it wears, the patterns and pieces of its Rares, its palettes, its
surnames and the tails of its lines. Two per home; every Common and Rare is
one of them.

| home | archetype | hat (silhouette) | beards | wears (at most one of each group) | Rare's patterns / pieces |
|---|---|---|---|---|---|
| garden | gardener | cone, straw sun hat | none, full, moustache, goatee, bushy | flower or leaf; cheeks or freckles; glasses | patchwork, spots, checks / satchel, scarf, bow tie |
| garden | fisher | bucket hat | full, long, bushy, chops, goatee | glasses; cheeks or freckles; neckerchief | checks, stripes / satchel, plume, scarf |
| island | sailor | sailor's cap, brim turned up | full, chops, moustache, none, braids | neckerchief; earring; cheeks or freckles | stripes, zigzag / medal, scarf, bow tie |
| island | deckhand | spotted bandana, knot at the back | bushy, braids, goatee, chops, full | earring; patch; neckerchief | stripes, checks / satchel, scarf, medal |
| town | baker | toque | moustache, full, chops, goatee, none | neckerchief; cheeks or freckles; glasses | checks, stripes / bow tie, scarf, medal |
| town | painter | beret, tipped | goatee, moustache, chops, none, full | neckerchief; glasses or monocle; freckles or cheeks | spots, stripes, zigzag / bow tie, scarf, plume |
| mountain | skier | knitted beanie, cuffed | none, full, moustache, bushy, goatee | pompom; goggles; cheeks or freckles | argyle, zigzag, stripes / scarf, earmuffs |
| mountain | alpinist | alpine felt hat, band and feather | long, bushy, full, chops, braids | neckerchief; cheeks; glasses | checks, argyle / plume, satchel, scarf |
| mines | miner | helmet (never the lamp: the Miner's) | bushy, full, long, chops, braids | goggles; soot; neckerchief | stripes, checks / satchel, medal, scarf |
| mines | prospector | slouch hat, drooping brim | long, bushy, chops, goatee, full | neckerchief; soot; glasses | checks, patchwork / satchel, plume, scarf |
| volcano | explorer | pith helmet | moustache, full, goatee, chops, none | goggles; neckerchief; glasses or monocle | checks, zigzag / satchel, medal, scarf |
| volcano | smith | leather skullcap, short peak | bushy, braids, full, chops, goatee | goggles; soot; earring | stripes, checks / medal, satchel, scarf |
| storm | stormwatch | sou'wester, long back brim | full, long, bushy, none, moustache | cheeks or freckles; glasses; neckerchief | stripes, zigzag / scarf, earmuffs, satchel |
| storm | apprentice | tall cone (never the stars: the Wizard's) | none, goatee, moustache | moon; freckles or cheeks; glasses | spots, zigzag / scarf, plume, satchel |

### Palettes and wardrobes

Each archetype has eight named palettes and a **wardrobe**. A palette is
known by its **key colour**: its hat's (a baker's palette by its coat, the
toque being white or pastel whatever the coat). It is worn with its own
other colour, or with any of the wardrobe's: the coats (or, for bakers, the
toques) that suit that archetype, eight to eleven of them, all light enough
for ink eyes. A wardrobe pairing must be plainly apart from the key (ΔE 0.12
at least: no near-hue clash), and pass every readability rule. A palette's
lines speak of its key colour only, so they read true on any of its coats.

| archetype | wardrobe |
|---|---|
| gardener | linen, cream, sage, mint, oat, blush, butter, sky |
| fisher | oat, linen, petal, apricot, cream, mint, ice, lilac |
| sailor | white, sky, ice, linen, cream, seafoam, peach, coral |
| deckhand | cream, oat, seafoam, sand, linen, lilac, sky, peach |
| baker (toques) | white, cream, butter, blush, linen, mint, sky, lilac, peach, lemon, petal |
| painter | linen, butter, lilac, white, petal, ice, flaxen, peach |
| skier | white, ice, oat, linen, petal, sky, lilac, cream |
| alpinist | linen, white, mint, cream, peach, butter, sky, ice |
| miner | oat, linen, apricot, denim, ash, peach, sand, coral |
| prospector | linen, sand, oat, sky, mint, butter, plum, ice |
| explorer | sky, pebble, apricot, cream, lilac, linen, coral, peach |
| smith | linen, sand, apricot, oat, butter, peach, sky, mint |
| stormwatch | denim, lemon, white, ice, butter, linen, apricot, mint |
| apprentice | butter, ice, lilac, sky, mint, peach, linen, cream |

Why: no two gnomes may share their silhouette and main colours (section 4),
so an archetype with one hat needs a different hat-and-coat for each of its
36 Commons; eight palettes alone gave eight.

The palettes, names and lines of each are in `archetypes.json`. Names are a
given name (140, shared) and the archetype's surname (twelve each: "Thimble
Seedwell", "Lark Orewell"). Lines are two short sentences: the palette's (or
a Rare's piece's or pattern's) and the archetype's, each standing alone, so
every pair reads, in the voice of `GNOMES`' lines: short, wry, about golf.

## 3. Readable, and never in the way

Checked by `validate.ts` on every gnome (`npm run gnomes`), and by the
build test (`web/test/gnome.test.ts`) on every mesh.

- **The face reads.** Eyes are never covered. On a body too dark for ink
  eyes (OKLab L under 0.55) each eye gets a white round behind it, or is lit
  on lava; between 0.55 and the ink's lightness plus 0.25, a body is refused.
- **The hat reads on the body**: hat and body at least ΔE 0.06 apart (OKLab)
  for Commons and Rares; an Epic's or Legendary's material and prop carry it.
- **He reads on every lane**: his hat or body (and for an Epic or Legendary
  his material's marks or prop) at least ΔE 0.10 from each ground the ball
  rolls on: the fairway #60ab96, bunker sand #ecd49c, planks #c99a63, stone
  #aeb0a6, concrete #cfcac1, packed snow #eaf4ff, the mines' dirt #b68e5d,
  basalt #9c92a6, crystal #b4c6d8 and marble #e0d4bc.
- **His ghost reads**: the same, faded to a duel ghost's 0.55 over each
  ground, at least ΔE 0.05.
- **His trail reads on the fairway**: ΔE 0.08 at least.
- **No taller, no wider.** His highest point stays within the tall hat's
  (the Wizard's, 1.472); his reach (nose, beard, hat, prop, past the ball:
  the replay keeps that off a wall) within 110% of `GNOMES`' widest.
- **Never hiding the path or the cup** (`gnome-fx.ts`): a trail lies on the
  ground behind him, under the aim (render order -1), without depth writes,
  at most 0.6 opaque, at most 1.5 long, gone 0.6 s after he stops; a holing
  starts after the drop, lasts at most 1.5 s, never flashes the screen.
  Under reduced motion there are none: the game's confetti stands.
- **As a ghost**: his own materials, faded with the rest (`makeGhost`); no
  trail, no particles, no glow. A Legendary's moving piece fades too.

### Budget, for phones

What a gnome may cost, ink hulls included, once baked (`BUDGET` in
`validate.ts`, held by `gnome.test.ts` for all 720):

| tier | triangles | draws | heaviest now |
|---|---|---|---|
| Common | 6,000 | 7 | 5,792 (#133) |
| Rare | 6,000 | 8 | 5,924 (#81) |
| Epic | 6,500 | 9 | 6,140 (#507) |
| Legendary | 8,000 | 12 | 6,592 (#720) |

6,000 is what the game already draws for its heaviest gnome (the Pirate,
5,772). A trail is one draw of its own (a ribbon of 24 segments, or 24
instanced particles); a holing one or two; a Legendary's moving parts are
each merged in their own frame (`bake` local) and swarms are instanced.
Textures are 64×64 canvases (a pattern, a material's marks), one per
material and pair of colours, shared.

## 4. The tiers

| tier | how many | what it has | trails | holings |
|---|---|---|---|---|
| Common | 504 | an archetype's hat, beard and up to two of its things, in one of its palettes | none | the game's confetti |
| Rare | 144 | a Common's look with one thing fewer, plus a pattern or a piece (or both), and a ribbon trail in its palette's accent (its hat's colour where the accent would vanish on the green) | ribbon | confetti |
| Epic | 65 | a material, a prop of its own (no two share one), its own trail; **no two Epics share a holing and its colour** | sparks, shavings, light, bubbles, leaves, stars, notes, dust, crumbs | sparks, shavings, pulse, petals, bubbles, leaves, stars, notes, steam, crumbs, ripples, feathers |
| Legendary | 7 | its number, a moving piece (a Legendary's own), a material or hat no one else has | shards, embers, streaks, petals, foam, spores, snow | shards, embers, bolt, gale, splash, spores, avalanche |

**Never a copy of the earned gnomes.** No gnome of the sale wears their
pieces (stars, horns, parrot, mask, sash, crown, cape, lamp), the toque with
flour (the Baker), or the tricorn with a patch (the Pirate); and every gnome
is at least 4 apart from each of `GNOMES` (below), so none is one of the
fourteen in other clothes.

**No two alike, no twins at ball size** (`visualDiff`, `apart` in
`validate.ts`). Two looks are compared field by field: the hat's shape, the
hat's colour, the body's colour, its pattern, the beard, the beard's colour,
each thing worn, a piece, a material, a prop, the trail. Every two gnomes of
the collection **differ in at least 3 fields, and at least one of them is a
main field**: the hat's shape or colour, the body's colour or pattern, or
what remakes the whole gnome, a material or a prop. A beard or a small thing
counts toward the three, never alone: two gnomes in the same hat and coat
that differ only by a beard and a neckerchief are twins at ball size, and
refused. From each of `GNOMES`, 4 fields with a main one. Fields are
compared **as drawn**: no hat colour is the cap's red, no body the cream one,
as `makeBall` draws them (a gnome of `GNOMES` with no body set and one in a
cream coat are the same there).

The fewest fields each gnome differs in from its nearest, Genesis
(`npm run gnomes:stats`): before this rule, 435 gnomes at 2, 147 at 3, 71 at
4, 55 at 5, 12 at 6, and 1,195 pairs it refuses; now 534 at 3, 88 at 4, 80
at 5, 18 at 6, and none.

### The Legendaries

| id | name | home | kind | piece | material | hat | trail | holing |
|---|---|---|---|---|---|---|---|---|
| 104 | The Miller | garden | 4 | `mill-sails` | toon | oat miller's cap and mill | rose petals | rose gale |
| 208 | The Admiral | island | 5 | `epaulettes` | toon | gold tricorn | white foam | sky splash |
| 311 | Ancient Mushroom | town | 6 | `fairy-ring` | toon | berry mushroom | butter spores | butter spores |
| 414 | Summit Gnome | mountain | 7 | `frost-cap` | frost (white) | glacier cone | white snow | white avalanche |
| 516 | Crystal Gnome | mines | 1 | `crystal-cluster` | crystal (amethyst) | lilac cone | lilac shards | amethyst shards |
| 618 | Lava Gnome | volcano | 2 | `lava-vent` | lava (lava) | obsidian cone | amber embers | lava embers |
| 720 | Storm Gnome | storm | 3 | `thundercloud` | toon | storm sou'wester | glacier streaks | lemon bolt |

- **The Miller** (#104). The garden's miller: a floury miller's cap and a blue smock, a small mill standing on the cap, whitewashed, red-roofed, its four sails turning. No crown: crowns are the earned Gnome King's. *Took the mill by hole 4 with him, the small one. The sails turn whatever the wind thinks.* Garden 4's mill turned for a hundred summers, and its miller never left it. So when he took up golf, he took a mill along: a small one, on his cap, that grinds a little flour on every fairway. The wind follows him round the course: it blows petals after him, and on the green it holds its breath.
- **The Admiral** (#208). The Island Cup's admiral: a golden tricorn, gold epaulettes, a navy coat, a pennant flying. *Commands the island's fleet: one boat and a rubber duck.* Nobody gave him the rank. He found the hat on the beach and the coat in a sea chest, and the island agreed it suited him. He rolls in leaving a wake of foam, and every cup he sinks sends up a splash, as a ship's should.
- **Ancient Mushroom** (#311). Mushroom Town's oldest resident: a great cap for a hat, its spots glowing and breathing, small mushrooms grown on it, spores in the air. *Was here before the town. The town grew round him.* Mushroom Town's houses are his cousins, and he is older than all of them. His cap glows when he is thinking, which is slowly. Where he rolls, spores drift; where he holes, a ring of new mushrooms will be up by morning.
- **Summit Gnome** (#414). The Mountain Cup's summit made gnome: frost over all of him, a cap of snow on his hat, icicles from its brim. *Came down from the top for one round. Has not warmed up since.* He lives where the course's last green is, above the snow line, and comes down only to play. Frost grows on him as he rolls; behind him it snows a little; and the cup that takes him gets a small avalanche over its rim.
- **Crystal Gnome** (#516). The Crystal Mines' heart: a faceted, see-through body that catches the light, shards grown from his hat, a core that glints. *Grew in the dark for a thousand years. Came up for the golf.* The miners found him in the Geode's last ring, humming the same note as the singing crystals. He is see-through, but you can never quite see through him. He drops shards where he rolls and the cup rings like a struck glass when he holes.
- **Lava Gnome** (#618). The volcano's own: a dark crust split by glowing cracks that pulse, a little vent smoking on his hat. *Rolled out of the volcano one morning. Still cooling.* The volcano on the Island Cup's last holes coughed him up, warm, on a quiet morning. His cracks glow when he breathes, his hat smokes when he thinks, and embers follow him down the fairway. Do not hand him the flag.
- **Storm Gnome** (#720). The storm's own gnome: a little thundercloud over his hat, raining, flashing now and then. *Carries the weather with him. The cup gets the lightning.* Every storm on the Island Cup was his, once. Now it is just the one cloud, small and loyal, that rains on him and nobody else. Gusts streak behind him as he rolls, and when he holes, the cloud lets go its bolt.

The Legendaries' kinds follow the realm spec's order (Crystal 1 … Summit 7);
their ids follow the waves.

### Materials

How the light takes him (`gnome-matter.ts`); his colours stay his own, the
material's detail colour (`materialColour`) is its marks:

| material | bands | marks (detail colour) | also |
|---|---|---|---|
| metal | four, a bright one | none | a band round his waist in the detail colour, a glint; one faint neutral lift of light (#141414) for every metal part, since the bake merges them into one draw |
| wood | three | fine grain running down, half seen | |
| neon | three | none | his ink line lit in the detail colour, heavier |
| porcelain | four | a painted band of rings and dots | a glint |
| stone | three, softer | speckle; the beard turns to stone too | |
| glaze | four | none | a glint: the lawn gnome's ceramic |
| wool | three | rows of knitted Vs; the beard is wool too | |
| gingerbread | three | icing: a wavy line and dots | |
| crystal | four | none | the body cut in facets, see-through (0.86, fading from there as a ghost) |
| lava | three | glowing cracks, pulsing (its tick) | lit eyes |
| frost | four | frost crystals; the beard frosted | a glint |

### The Epics

Each designed one by one: a concept, a prop no other gnome has
(`props.ts`: a few simple shapes as data), a name and a line.

| id | name | home | archetype | material (detail) | prop | trail | holing | concept |
|---|---|---|---|---|---|---|---|---|
| 94 | Old Tock | garden | gardener | metal (copper) | `windup-key` | gold sparks | brass sparks | A clockwork garden gnome: brass hat, silver body, wound by a key in his back. |
| 95 | Sprinkles | garden | gardener | metal (brass) | `watering-can` | sky bubbles | sky ripples | A tin garden ornament with a copper watering can on its brim. |
| 96 | Bramble Oak | garden | gardener | wood (chestnut) | `acorn` | caramel shavings | caramel shavings | Carved from the oak by hole 4; an acorn of the same tree on his hat. |
| 97 | Glazed Gus | garden | gardener | glaze (white) | `spade` | moss leaves | moss leaves | The garden gnome of every lawn: glazed ceramic, red hat, blue coat, a spade. |
| 98 | Mossback | garden | gardener | stone (lichen) | `snail` | pebble dust | pebble crumbs | A stone garden statue, lichen in his cracks, a snail on his hat. |
| 99 | Pippa Porcelain | garden | gardener | porcelain (rose) | `teacup` | rose stars | rose petals | A porcelain figurine painted with roses, a chipped teacup on her brim. |
| 100 | Woolly Fern | garden | gardener | wool (pine) | `knitting` | cream dust | cream feathers | A knitted gnome from a rainy weekend; the needles still in his hat. |
| 101 | Neon Nettle | garden | gardener | neon (lime) | `neon-bloom` | lime light | lime pulse | The garden centre's sign come to life: lime light, a sunflower lit on his hat. |
| 102 | Captain Koi | garden | fisher | glaze (white) | `koi` | apricot bubbles | coral bubbles | A glazed pond gnome; the koi he fished leaps off his hat. |
| 103 | Heron Hob | garden | fisher | wood (bark) | `fishing-rod` | walnut shavings | white feathers | A walnut carving of a fisherman, rod over his shoulder, still as a heron. |
| 198 | Bosun Brass | island | sailor | metal (silver) | `bosun-whistle` | brass notes | brass notes | A ship's brass fitting of a bosun, whistle on a chain. |
| 199 | Figurehead Fen | island | deckhand | wood (chestnut) | `ship-wheel` | white bubbles | chestnut shavings | A ship's figurehead, chestnut wood, a helm wheel on her back. |
| 200 | Delft Dory | island | sailor | porcelain (delft) | `anchor` | delft stars | delft ripples | A blue-and-white Delft figure of a sailor, an anchor at his chest. |
| 201 | Lighthouse Lou | island | sailor | glaze (white) | `beacon` | amber light | amber pulse | A glazed lighthouse keeper; the lantern room on his hat stays lit. |
| 202 | Shellback Sam | island | deckhand | stone (coral) | `conch` | seafoam bubbles | seafoam bubbles | Sandstone from the reef, barnacled, a conch at his side. |
| 203 | Neon Palms | island | deckhand | neon (pink) | `palm` | pink light | pink pulse | The beach bar's sign: a pink-lit deckhand under a lit palm. |
| 204 | Spyglass Sal | island | sailor | metal (bronze) | `spyglass` | bronze sparks | bronze stars | A bronze lookout, spyglass drawn, silver coat. |
| 205 | Knotty Ned | island | sailor | wool (oat) | `rope-coil` | navy dust | navy ripples | A cable-knit fisherman's jumper of a gnome, rope coiled on his shoulder. |
| 206 | Gull Patrol | island | deckhand | glaze (white) | `gull` | white stars | sky feathers | A glazed seaside souvenir, a gull settled on his bandana. |
| 207 | Pearl | island | sailor | porcelain (petal) | `oyster` | petal bubbles | petal ripples | Mother-of-pearl porcelain, an oyster on her cap, its pearl showing. |
| 302 | Gingersnap | town | baker | gingerbread (white) | `rolling-pin` | caramel crumbs | caramel crumbs | A gingerbread gnome iced in white, rolling pin on his back. |
| 303 | Sugarplum | town | baker | gingerbread (pink) | `cupcake` | rose crumbs | rose stars | Gingerbread with pink icing and a cupcake for a crown. |
| 304 | Pewter Pot | town | baker | metal (brass) | `whisk` | silver sparks | white steam | A pewter kitchen ornament: a baker whisking, steam on every holing. |
| 305 | Easel Ezra | town | painter | wood (chestnut) | `paint-palette` | coral stars | coral stars | A carved artist's mannequin with a real palette. |
| 306 | Neon Noir | town | painter | neon (cyan) | `paintbrush` | cyan light | cyan pulse | An artist of the night: a cyan neon brush through a plum beret. |
| 307 | Tick Tilly | town | painter | porcelain (delft) | `clock-face` | delft notes | delft notes | A porcelain figurine wound to the town clock, its face on her top hat. |
| 308 | Pigeon Square | town | painter | stone (slate) | `pigeon` | slate dust | slate feathers | The town square's statue on his day off; the pigeon came anyway. |
| 309 | Lamplighter Leo | town | painter | metal (brass) | `candle` | saffron light | saffron pulse | A copper lamplighter with a candle lit on his top hat. |
| 310 | Cinnamon | town | baker | wool (caramel) | `cinnamon-roll` | honey crumbs | caramel steam | A knitted baker in the shape of a roll, in a knitted cap; a cinnamon roll on top. |
| 405 | Iron Ibex | mountain | alpinist | metal (steel) | `ice-axe` | steel sparks | silver stars | A tin toy alpinist, his hat painted red, an ice axe on his back, sure-footed as an ibex. |
| 406 | Yodel | mountain | alpinist | wood (bark) | `alphorn` | walnut notes | caramel notes | A walnut carving from the valley fair, his alphorn over his shoulder. |
| 407 | Cuckoo | mountain | alpinist | wood (chestnut) | `cuckoo-clock` | honey stars | honey feathers | A cuckoo clock's gnome, the clock's house on his hat, the bird out. |
| 408 | Apres | mountain | skier | wool (ash) | `cocoa-mug` | white stars | chocolate steam | A knitted ski-lodge gnome with a mug of cocoa. |
| 409 | Neon Slalom | mountain | skier | neon (glacier) | `skis` | glacier light | glacier pulse | Night skiing in neon: glacier light, lit skis crossed on his back. |
| 410 | Edelweiss | mountain | alpinist | porcelain (emerald) | `edelweiss` | emerald leaves | white petals | A porcelain alpine girl, painted green, an edelweiss on her hat. |
| 411 | Cairn | mountain | alpinist | stone (lichen) | `cairn` | lichen dust | lichen crumbs | A gnome of piled stone, a cairn on his hat; every climber adds one. |
| 412 | Saint Barnabus | mountain | skier | glaze (white) | `rescue-keg` | gold stars | gold stars | A glazed mountain rescuer with a keg of cocoa under his chin. |
| 413 | Snowglobe | mountain | skier | glaze (white) | `snowglobe` | ice stars | ice bubbles | A glazed gnome holding a snowglobe with a pine inside. |
| 507 | Copperbeard | mines | miner | metal (bronze) | `pickaxe` | copper sparks | copper sparks | A copper miner in a copper helmet, beard and all. |
| 508 | Geode | mines | prospector | stone (amethyst) | `geode` | amethyst dust | amethyst stars | A stone prospector with a split geode on his hat, purple inside. |
| 509 | Canary Kit | mines | miner | glaze (white) | `canary-cage` | lemon notes | lemon feathers | A glazed miner carrying the canary's cage; the canary sings. |
| 510 | Panhandle | mines | prospector | wood (bark) | `gold-pan` | honey dust | saffron stars | A carved prospector with his gold pan, nuggets in it. |
| 511 | Neon Ore | mines | miner | neon (amethyst) | `glow-crystal` | amethyst light | amethyst pulse | Struck a glowing seam: amethyst light, crystals lit on his helmet. |
| 512 | Dynamo | mines | miner | metal (copper) | `gears` | gold sparks | gold sparks | A brass automaton of a miner, gears turning on his helmet. |
| 513 | Dusty Dee | mines | prospector | stone (coal) | `hand-lantern` | coal dust | slate steam | Carved from the mine wall, a lantern lit for the others. |
| 514 | Moleskin | mines | miner | wool (chestnut) | `mole` | cocoa crumbs | cocoa crumbs | A knitted miner, a mole poking out of his helmet; the mole digs the holes. |
| 515 | Nugget | mines | prospector | porcelain (honey) | `nugget` | gold stars | honey sparks | A porcelain prospector, gilt at the edges, a big nugget on his hat. |
| 609 | Anvil Ada | volcano | smith | metal (copper) | `hammer` | amber sparks | amber sparks | A steel smith in goggles, her hammer on her back. |
| 610 | Bellows | volcano | smith | wood (bark) | `bellows` | charcoal dust | ash steam | A carved smith working the bellows, soot on his cheeks. |
| 611 | Pumice | volcano | explorer | stone (charcoal) | `map-scroll` | oat dust | oat ripples | Pumice stone: light as a feather, hard as a rock, a map tucked under his arm. |
| 612 | Heat-Suit Hal | volcano | explorer | metal (lava) | `thermometer` | silver light | silver steam | A volcanologist in a silver heat suit, thermometer at his side. |
| 613 | Pineapple Pete | volcano | deckhand | glaze (white) | `pineapple` | lime leaves | lime leaves | A glazed island souvenir from the volcano's warm side, a pineapple on his bandana. |
| 614 | Neon Magma | volcano | smith | neon (lava) | `neon-flame` | lava light | lava pulse | A hothead in lava-orange neon, a flame sign on his cap. |
| 615 | Kiln | volcano | smith | glaze (white) | `clay-pot` | terracotta dust | terracotta steam | A glazed potter fired at the volcano, a pot on his cap. |
| 616 | Torchbearer | volcano | explorer | wood (chestnut) | `torch` | saffron sparks | lava sparks | A carved cave explorer with a torch alight. |
| 617 | Kettle Tess | volcano | explorer | wool (olive) | `kettle` | ash dust | peach steam | A knitted explorer who makes tea on the volcano's vents. |
| 711 | Lightning Rod | storm | stormwatch | metal (brass) | `lightning-rod` | lemon sparks | lemon sparks | A copper storm-watcher with a lightning rod on his hat. |
| 712 | Weathervane | storm | stormwatch | metal (bronze) | `weathervane` | brass stars | brass feathers | A weathervane of a gnome, brass on top, his copper gone to verdigris, its rooster on his hat. |
| 713 | Barometer Bea | storm | stormwatch | wood (walnut) | `barometer` | walnut dust | walnut ripples | A carved barometer-maker, the dial on her chest. |
| 714 | Neon Nimbus | storm | apprentice | neon (heather) | `spellbook` | heather stars | heather stars | An apprentice who learned one spell: it makes things glow. |
| 715 | Rainy Ray | storm | stormwatch | glaze (white) | `umbrella` | sky bubbles | glacier ripples | A glazed gnome in a yellow sou'wester, umbrella up. |
| 716 | Kite | storm | stormwatch | wool (coral) | `kite` | coral notes | coral feathers | A knitted gnome flying a kite on the windy holes. |
| 717 | Cass | storm | apprentice | porcelain (amethyst) | `crystal-ball` | amethyst stars | lilac pulse | A porcelain fortune-teller's apprentice, crystal ball in hand. |
| 718 | Gargoyle | storm | stormwatch | stone (storm) | `stone-wings` | storm dust | slate crumbs | The clubhouse roof's stone guardian, small wings and all. |
| 719 | Hoot | storm | apprentice | wood (chestnut) | `owl` | honey stars | walnut feathers | A carved apprentice and the owl that knows the course by night. |

## 5. How the Commons and Rares are made

`generateSeries` (`generate.ts`), from the series' seed: the same data and
seed make the same gnomes, id for id.

1. The hand designs are laid down first; the generated ones keep away from
   them.
2. For each wave (a home) and tier, the count is split evenly over the
   home's two archetypes.
3. For each archetype, every combination of its palettes' colourings (the
   palette's own, then its key colour with each wardrobe colour), hats,
   beards, hair and things worn (two at most; for a Rare one, plus its
   pattern and/or piece) is shuffled by the seed, one queue per palette. The
   palettes take turns; each takes the next of its queue that **fits**: its
   tier's rules, readable (section 3), no earned signature, apart from every
   gnome already made (3 fields, one main) and from each of `GNOMES` (4),
   and **within its tier's triangle budget**, counted on the real
   `makeBall` (`scene/gnome-cost.ts`, given to the generator by
   `scripts/gnomes.ts`: the generator itself draws nothing).
4. A wave's gnomes are shuffled so a gallery shows its archetypes mixed;
   then named and given lines, never the same twice.

## 6. The trait encoding (format 1)

A token's look as the realm stores it: **one byte a field, written as 58
lowercase hex characters, the format first**. A field is a code into a
table of `data/gnomes.json`'s `vocab` (the same tables as `vocab.ts` and
`props.ts`), a colour is an index into its palette (255: none), and the
things worn are a 32-bit mask.

| byte | field | values |
|---|---|---|
| 0 | format | 1 |
| 1 | series | 0 earned; 1 Genesis; a later series its `code` |
| 2 | tier | 0 earned, 1 common, 2 rare, 3 epic, 4 legendary |
| 3 | kind | earned: 1–9 in `UNLOCKS`' order; Legendary: 1–7; else 0 |
| 4 | home | 0 none, 1 garden, 2 island, 3 town, 4 mountain, 5 mines, 6 volcano, 7 storm |
| 5 | archetype | `vocab.archetypes` (0 none) |
| 6 | hat | `vocab.hats`: 0 cone, 1 tall, 2 tricorn, 3 toque, 4 tophat, 5 helmet, 6 straw … 17 mill, 18 mushroom |
| 7 | hat colour | palette |
| 8 | brim colour | palette; 255: the hat's |
| 9 | beard | 0 full, 1 long, 2 bushy, 3 moustache, 4 none, 5 goatee, 6 braids, 7 chops |
| 10 | hair colour | palette; 255 for no beard |
| 11 | body colour | palette; 255: cream |
| 12 | pattern | 0 plain, 1 stripes, 2 spots, 3 checks, 4 zigzag, 5 argyle, 6 patchwork |
| 13 | pattern colour | palette |
| 14–17 | things worn | 32-bit mask, big-endian, bit k = `vocab.accessories[k]` (bit 0 glasses … 14 lamp, 15 goggles … 21 moon) |
| 18 | accent colour | palette (a neckerchief, a band, an earring) |
| 19 | piece | `vocab.pieces` (0 none, 1 scarf … 6 medal) |
| 20 | piece colour | palette |
| 21 | material | `vocab.materials` (0 toon, 1 metal … 11 frost) |
| 22 | material colour | palette: its marks |
| 23 | trail | `vocab.trails` (0 none, 1 ribbon …) |
| 24 | trail colour | palette |
| 25 | holing | `vocab.holings` (0 the game's confetti …) |
| 26 | holing colour | palette |
| 27 | prop | `vocab.props` (0 none, 1 windup-key … the Legendaries' pieces last) |
| 28 | prop colour | palette |

Example, #1 (a gardener): `0101010001010600ff05083000ff001400001900ff00ff00ff00ff00ff`.
An earned gnome is its kind alone (the game draws the rest), e.g. the Wizard:
`01000001000000ffff00ffff00ff00000000ff00ff00ff00ff00ff00ff`;
`data/gnomes.json`'s `earned` lists the nine.

**Reading what you do not know** (`decode`, `skinOfTraits`; the realm's
portrait should do the same):

- a code past its table is the plain value (a cone, plain body, no piece,
  toon, no trail, the confetti, no prop); a colour past the palette is the
  default; a bit of the mask past the table is dropped;
- a string shorter than the fields: the missing ones are plain;
- **longer: the extra bytes are ignored**. A new field is always appended,
  so an older reader still reads the ones it knows: a new client draws more
  of an old token, never less;
- **another format, or not hex: the Classic** (under the token's own name).
  The format changes only when a field's meaning does, never to add one.

**Tables are append only.** A code, once a token carries it, means the same
thing for good; a test (`gnomes.test.ts`) pins the Genesis prefixes. Adding
a hat, a piece, a material, an effect or a colour: its mesh in `scene/`,
then its name as the last entry of its table (its binding). Nothing else
changes; screens that list traits read the tables.

**The realm spec** (`docs/superpowers/specs/2026-10-06-nft-gnomes-design.md`,
"Built so far vs this spec") takes format 1 as written here: 29 bytes, the
tiers and earned kinds with its codes, the Legendaries' kinds in design order
(Crystal 1 … Summit 7).

## 7. Series, waves and drops

`data/gnomes/series.json` is the one place counts live. A series:

```json
{ "id": "genesis", "code": 1, "name": "Genesis", "first": 1,
  "supply": { "common": 504, "rare": 144, "epic": 65, "legendary": 7 },
  "waves": ["garden", "island", "town", "mountain", "mines", "volcano", "storm"],
  "seed": "gnogolf/genesis/1", "released": false,
  "sale": { "prices": { "common": 36, "rare": 72, "epic": 336, "legendary": 1296 },
            "playerWindowHours": 48, "playerWindowCaps": { "common": 3, "rare": 2, "epic": 1, "legendary": 1 },
            "lifetimeCaps": { "common": 10, "rare": 5, "epic": 2, "legendary": 1 }, "launch": "all" } }
```

- **Waves are id ranges.** `planSeries` lays each wave out as one run of
  ids, its Commons, Rares, Epics and Legendary in turn, each tier shared
  evenly over the waves (the first waves take what is left over), so the
  realm opens a wave by one range, not a tier:

  | wave | home | ids | of which |
  |---|---|---|---|
  | 1 | garden | 1–104 | 72 common from 1, 21 rare from 73, 10 epic from 94, 1 legendary from 104 |
  | 2 | island | 105–208 | 72 common from 105, 21 rare from 177, 10 epic from 198, 1 legendary from 208 |
  | 3 | town | 209–311 | 72 common from 209, 21 rare from 281, 9 epic from 302, 1 legendary from 311 |
  | 4 | mountain | 312–414 | 72 common from 312, 21 rare from 384, 9 epic from 405, 1 legendary from 414 |
  | 5 | mines | 415–516 | 72 common from 415, 20 rare from 487, 9 epic from 507, 1 legendary from 516 |
  | 6 | volcano | 517–618 | 72 common from 517, 20 rare from 589, 9 epic from 609, 1 legendary from 618 |
  | 7 | storm | 619–720 | 72 common from 619, 20 rare from 691, 9 epic from 711, 1 legendary from 720 |

- **Earned tokens are numbered apart**, from `earned.first` (1,000,001) up,
  as the realm spec says: far above any series a realm will ever hold, so a
  later series' ids never meet them.
- **`released`** is set when a series' rows go to the realm (its sale
  opens): from then its looks are final (section 10).
- **`sale` is the realm's starting settings**, from the research brief
  (`docs/superpowers/research/2026-10-06-nft-best-practices.md`) and the
  user's decisions: prices in GNOT, every tier at a fixed price (golf's
  numbers, ADR-007; no auction), the player window
  (wallets with a record in `store` first), its caps, the lifetime caps,
  and how it opens: `"launch": "all"`, the user's call (2026-10-18), every
  gnome at once, in one wave of all the series' ids (`AddWave 1 720`), its
  player window first. The waves above stay the catalogue's layout (each
  world's run of ids, its art); the realm still takes waves of any range,
  for a later series. The realm's owner changes them between
  waves, never during one, and never lower on what is on sale. Nothing in the client
  reads them as truth: the realm's `Collection()` is.
- **A new drop is data, not code.** Add a series to `series.json` (its
  `code`, `first` id after the last series', its supply and waves), a
  folder `data/gnomes/<id>/` with its `archetypes.json`, `epics.json` and
  `legendaries.json`, run `npm run gnomes`, `npm run gnomes:rows`,
  `npm run gnomes:looks -- --write`, then `npm run gnomes:thumbs`.
  New archetypes, homes or traits are appended to `vocab.ts` (and their
  meshes added) first. The generator, the rules, the encoding and the
  screens need no change.

### The realm's rows

`npm run gnomes:rows` writes `data/gnomes/rows/<series>.txt`: what the
owner sends as `AddSeries(name, rows)`. One gnome a line, in id order,
lines joined by a newline and none after the last:

```
1|common|Juniper Troutbridge|0101010001020716ff01083000ff000200010700ff00ff00ff00ff00ff
```

`id|tier|name|traits`: the tier as the realm names it (`common`, `rare`,
`epic`, `legendary`), the name as in the catalogue, the traits (section 6).
Before writing, `checkRows` (`web/lib/gnomes/rows.ts`) holds every row to
what the realm accepts and to what it does not check on chain: ids
following on from the series' first with no gap; a name of 1 to 48 bytes and
traits of 1 to 256, no control character and no `|`; traits that decode;
**the row's tier equal to the tier byte of its traits**. `--check` (in
`scripts/check.sh`) fails if a file is not what the catalogue makes, and a
test decodes every row back to the catalogue's traits, id for id.

## 8. For the screens

What a gallery, a token page, the mint, the locker or a builder reads
(`web/lib/gnomes/`), all pure and tested:

| need | call |
|---|---|
| all tokens, their series and plan, the tables | `data/gnomes.json` (`Catalogue`) |
| one token | `catalogue.gnomes.find((g) => g.id === id)` (the screens look it up inline) |
| filter a gallery (series, wave, tier, home, archetype, hat, has a trail, text) | `filterGnomes(list, query)` |
| a token's trait list, plainly worded | `traitRows(decode(entry.traits))` |
| a tier's name and colours | `TIER_LOOK[tier]` |
| waves and their id ranges | `planSeries(series)` (and `catalogue.series[n].plan`) |
| the gnome to draw from a chain's traits | `skinOfTraits(hex, { id, name, line })` (falls back to the Classic) |
| the collection's wardrobe, before the first collection gnome is drawn | `await loadWardrobe()` (`scene/gnome.ts`: its own chunk; without it a collection gnome is drawn plain) |
| draw him | `makeBall(skin)` (`makePreview` for a turntable; `makeShowcase` for a still) |
| his trail and holing in play | `makeTrail(skin)`, `makeHoling(skin, cupAt)` (`gnome-fx.ts`); `null`: the game's own |
| a Legendary's motion | `gnome.userData.tick(ms)` |
| a thumbnail | `thumb(id)` (`components/gnomes/parts.tsx`: `/gnomes/<id>.webp`, copied from `media/gnomes/thumbs/` before each build); Legendaries' turntables from `media/gnomes/turntables/` |

In play (`engine.ts`): his trail is laid on the ground under him while he
rolls and fades once he stops; his holing replaces the player's confetti (a
duel ghost's holing keeps the confetti: a ghost carries no particles); his
`tick` runs every frame. `makePreview` (the picker's turntable) plays a
Legendary's motion with its act. The wardrobe (`scene/gnome-dress.ts`:
the hats, props, materials and Legendary pieces) is its own chunk: the title
screen and the holes' pages draw only `GNOMES`' fourteen and never load it
(`web/test/bundle.test.ts` walks their eager imports).

**To see one in the real game** (the test hooks: a dev build, or a local
build with `NEXT_PUBLIC_TEST_HOOKS=1`; never the public site):
`?traits=<hex>` plays as that collection gnome, `?rivaltraits=<hex>` dresses
every rival's ghost in one. `media/gnomes/inplay.mjs` plays them (section 11).

## 9. Checks

- `npm run gnomes -- --check` (in `scripts/check.sh`): `data/gnomes.json`
  is exactly what `data/gnomes/` makes, and every rule of sections 3 and 4
  holds: the plan's ids and counts, names (`[A-Za-z' -]{3,24}`, unique),
  lines (unique, 12 to 100 characters), traits read back the same, each
  tier's rules, readability, earned signatures, the Epics' holings and
  every prop unique, no two alike, none like `GNOMES`.
- `npm run gnomes:rows -- --check` and `npm run gnomes:looks` (both in
  `scripts/check.sh`): the realm's rows as the catalogue makes them, each
  row's tier its traits'; every gnome drawn as the golden looks hold.
- `npm test`: `gnomes.test.ts` (the tables append only, the encoding and its
  fallbacks, `skinOf`, the plan, the filters, each rule caught, the rows
  decoding to the catalogue's traits id for id), `gnome.test.ts` (`GNOMES`'
  fourteen drawn exactly as before, by a fingerprint of every vertex and
  material; every gnome of the collection built, within budget, height and
  reach; faded as a ghost; every trail and holing kind run to its end) and
  `looks.test.ts` (section 10).

## 10. Permanence: a gnome is drawn the same for good

A token's traits are on chain for good; what they draw must be too. That is
held by tests, not by care.

- **The golden looks.** `data/gnomes/looks.golden.json` holds, for each of
  the 720 ids and the nine earned kinds, a record of what `makeBall` builds
  from `skinOfTraits(traits)` (`web/test/looks.ts`): how many meshes and
  vertices, the body's box (to the thousandth), every material (its kind,
  colour, emissive and its strength, its bands of light, side, opacity, and
  a hash of what its texture's canvas was told to draw: the test's canvas
  writes every call down), the trail's
  and holing's kinds with their meshes, the Legendary's piece and whether
  he moves, and a hash of every vertex, index, placement, instance and
  texture. `web/test/looks.test.ts` (in `npm test`) and `npm run
  gnomes:looks` (in `scripts/check.sh`) fail, naming the gnome, if any one
  draws differently. The file names its **record format** (`RECORD` in
  `web/test/looks.ts`; 2 added the bands and the glow's strength). A format
  that sees more is taken on by `--write` only where each gnome still draws
  as the file's own format recorded him: a richer record of the same
  drawing, never a changed released look.
- **A released look never changes in place.** `npm run gnomes:looks --
  --write` takes the records again for a series not yet `released` (the
  design is still under review), but refuses to change one of a released
  series or of an earned kind. To give a released gnome a new look is to
  add a **new trait format** (section 6): the codec reads format 1 as it
  always has, so a token written in format 1 keeps drawing the old way, and
  only a token written in the new format draws the new one. A shared mesh,
  material or texture that a change would alter for released gnomes must
  be left as it is and the change made under the new format's own name.
- **What the realm receives is what the catalogue holds**: the rows test
  (section 7) decodes every row back to the catalogue's traits, id for id.
- **Before release**, every change of look (a review verdict, a fix) is
  regenerated deterministically from `data/gnomes/` (the same seed and
  data, the same gnomes; ids and tiers fixed by the plan), checked by
  `npm run gnomes:stats` and the rules, and its records rewritten with
  `--write`; the thumbnails of the changed ids are drawn again.

## 11. In play: checked in the real game

`media/gnomes/inplay.mjs` plays collection gnomes in the real game (the dev
server; the chain read only: holes, simulations, a rival's ghost; nothing
sent), through the test hooks `?traits=` and `?rivaltraits=`. For each: a
hole-in-one on a garden hole (one on record, its shot found again in the
day's weather) with the CPU slowed 4× (a phone's), the frame rate counted
every frame; a shot on an island hole in a storm; a Crystal Mines gallery in
Lights out, where any gnome wears a headlamp; his ghost raced as a rival's.
Pictures, the report (`report.json`) and a contact sheet (`sheet.jpg`) in
`media/gnomes/inplay/`.

Run of 2026-10-06, the Classic for comparison, then 3 Commons (1, 105, 415),
3 Rares (73, 177, 487), 3 Epics (94, 203, 511) and the 7 Legendaries:

- every one holed out (the banner shown), at 60 fps with the CPU slowed 4×
  (a frame's median 16.7 ms, p95 16.8 ms, as the Classic's);
- the cup never under the gnome in the play view;
- every Rare, Epic and Legendary drew his trail behind him while he rolled;
  every Epic's and Legendary's holing played and ended; Commons and the
  Classic kept the confetti;
- every ghost raced, faded and clean (a Legendary's piece fades with him);
- in Lights out, the headlamp on every hat: the collection's hats each give
  where it clips (`kitLamp` in `gnome-kit.ts`); the Crystal Gnome's front
  shard and glinting core were moved off the hat's front, where the lamp
  sat in them;
- no page error.

There is no Legendary entrance yet (the realm spec names one per
Legendary): nothing comes between the player and his aim.
