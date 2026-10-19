# Collectible gnomes and zero-cost sharing: design

## Status

Proposed, 2026-10-06. Parts are being built beside it (section "Built so
far vs this spec"); nothing is merged or deployed. The product decisions
(cosmetic only, no random draw, the tiers, the earned gnomes staying
earned, golf and store untouched) were agreed with the user before this
spec; everything else below is decided here, with its reason. It becomes
an ADR (the next free number) once accepted, and an "As built" section is
added then, as ADR-003, 004 and 005 do.

Revised the same day after a review: the earned proof skips copies, `Equip`
never rides with a save, a burn's cleanup moved out of the hook, enumerable
dropped, mainnet's missing store made a precondition, and the smaller points
listed at the end ("Verified facts" holds what was checked on chain).

Revised again the same day to the user's final decisions, which replace
the first draft's numbers and sale wherever they differ:

- the supply is 720: 504 Common, 144 Rare, 65 Epic, 7 Legendary (was 777:
  500, 200, 70, 7);
- the prices are golf's numbers: Common 36 GNOT (the par of nine holes),
  Rare 72 (the par of a course), Epic 336 (the dimples on a golf ball),
  Legendary 1,296 (18 holes × par 72) (were 30, 99, 333 and a 777
  reserve, and before them 5, 20, 75 and 250); the owner's to change
  before a sale opens, never during one, and never lower on what is on sale;
- a series is sold in one sale, every id of it at once, opening with 48
  hours kept for wallets with a record in store (was: each tier opened
  whole, then a wave a world; waves removed, ADR-013);
- **no auction**: the seven Legendaries are sold at their fixed price by
  the same `Buy` as the other tiers, one Legendary a wallet. The auction
  of the first drafts (48 hours, a reserve, escrowed bids, a soft close)
  was dropped for simplicity (no coins held for anyone, a third less code
  and tests) and legal clarity (no bid as an order, no auction rules);
- the genesis has an **optional closing date** (`SetCloseAt`): it may open
  with none and then sells until sold out; the owner may set one later, and
  once set it can move earlier (always at least 7 days ahead), never later
  nor be removed, and what is
  unsold then is never minted;
- **wearing is free by default**: everyone shows their best gnome, derived
  from what they own on chain (`Worn`); any owned gnome can be played in
  one's own browser for free; `Equip` on chain is optional, to choose which
  one others see;
- the treasury is an address apart from the owner, changed in two steps;
  the site's URL is the owner's to set (`SetSiteURL`); `TokenURI` is a
  portrait drawn on chain from the traits;
- the catalogue is data, versioned and published in series (the genesis
  720 now; a later seasonal series is more data, not new code); a token's
  traits start with their format's version; a client draws what it does not
  know as the plain form; every count is defined once;
- no Legendary is named King or wears a crown;
- the seller is an individual living in Japan; the shop (not the game) is
  closed to China and to the countries under comprehensive sanctions (Cuba,
  Iran, North Korea, Syria, Russia, Belarus) by Netlify's country rules;
  the EU and the UK are not blocked for now; buyers get no free "Founding
  Gnome" (a premium under 景品表示法).

The research brief (`docs/superpowers/research/2026-10-06-nft-best-practices.md`)
is applied where it bears on the design: the player window, the tier colours, the words the shop never
uses. Its auction advice is not: the auction was dropped (above). The
lawyer pack (`docs/superpowers/legal/2026-10-06-lawyer-pack.md`) holds the
legal questions. Section "Built so far vs this spec", near the end,
compares this spec with the code being built beside it.

## Summary

- The ball is a gnome (`makeBall(skin)` in `web/lib/scene/gnome.ts`), and its
  `Skin` is already a set of traits. A new realm, `gno.land/r/gnogolf/gnomes`,
  makes gnomes tokens: a GRC721 collection whose genesis series is 720
  gnomes sold at a fixed price per tier (504 Common, 144 Rare, 65 Epic,
  7 Legendary one-of-ones), plus the nine gnomes players earn
  today, minted free (the storage deposit only) once `store` proves the
  feat, and never sold.
- The catalogue is data the owner publishes a series at a time; a later
  series (a season's gnomes) is one more publication, not a new realm.
- The genesis is sold in one sale, all 720 at once. Its first 48
  hours are for wallets that have a record in store; then anyone. The sale
  runs until sold out, or, if the owner sets a closing date, ends for good
  at it; what is unsold then is never minted.
- Every gnome is seen before it is paid for: a buyer picks a token by its
  id. Nothing is drawn at random, and nothing is auctioned.
- It is cosmetic. The chain rolls a point of radius 0.5 whatever the gnome
  looks like; golf/v2 and store are not modified, and never call the new
  realm. A broken or paused gnomes realm cannot touch a record.
- Wearing costs nothing: the realm answers each player's worn gnome
  (`Worn`), their best owned one unless they chose another with the
  optional `Equip`. The client draws it on their ghost in other players'
  duels, on the boards and in clips; on their own ball they play any gnome
  they own, chosen in the browser, for free.
- Sales go to the treasury in the same transaction; the realm never holds
  coins. The treasury is an address apart from the owner.
- Sharing costs no server: a static page and link card per gnome, made at
  build time; the phone's share sheet gets a picture made in the browser;
  clips wear the player's worn gnome.
- GNOT can be sent on mainnet today (checked below), so the sale works there.
  It ships on onyx first regardless. On mainnet it waits for Gnogolf's own
  store and golf/v2, which are not there yet (section 17).

## Context

### What exists

- **The gnome.** `Skin` (`web/lib/scene/gnome.ts`) is a hat (colour, shape:
  cone, tall cone, `tricorn`, `toque`, `tophat`, or a `helmet`), a beard
  (`full`, `long`, `bushy`, `moustache`, `none`), hair and body colours,
  `stripes`, and a list of accessories (`glasses`, `pompom`, `flower`,
  `cheeks`, `stars`, `horns`, `patch`, `parrot`, `mask`, `flour`, `sash`,
  `monocle`, `crown`, `cape`, `lamp`, `brim`). `GNOMES` holds fourteen:
  five for everyone (`classic`, `sage`, `ginger`, `moustache`, `gardener`)
  and nine earned (`wizard`, `viking`, `golden`, `pirate`, `diver`, `baker`,
  `mayor`, `king`, `miner`). `makeBall` builds one from a `Skin`, inks it,
  bakes it into one draw per shader (`bake`), and scales it so its body is
  exactly the ball the chain rolls (`BALL_R / 0.55`). `makeGhost` makes the
  see-through one a duel races; `rivalSkin(player, mine)` picks a rival's
  gnome from their address today, so two gnomes never look alike.
- **The earned gnomes.** `UNLOCKS` in `web/lib/card.ts`, checked against
  `cupTotals()` of the browser's own card: finish the Garden Cup (Wizard),
  at par or under (Viking), five holes-in-one (Golden), the same pair for the
  Island Cup (Pirate, Diver) and Mushroom Town (Baker, Mayor), the four
  classic cups at par or under (King), finish the Crystal Mines (Miner).
  They are kept in the browser (`remember`, `earned` in `web/lib/prefs.ts`),
  and nobody else ever sees them: a rival's ghost wears `rivalSkin`.
- **The records.** `store` (`gno.land/r/gnogolf/store/store.gno`) is a set of
  ordered string collections that only the rules write (`gate`) and anyone
  reads: `Get(name, key)`, `Page(name, start, end, limit)`, `Size`, `Index`,
  `At`. golf/v2 keeps there, among others, `slots` (`slotKey` →
  current version id), `holes` (version id → `encodeEntry`) and `bests`
  (`<id> <mode> <address>` → `bestOf`, `"<strokes> <height> <period> <shots>"`).
- **The chain's price of storage**: `params/vm:p:storage_price` answers
  `"100ugnot"` on gnoland-1 and onyx-1 alike: 0.1 GNOT a kilobyte.
- **Sharing** (ADR-003): a static export on Netlify, a page and a 1200×630
  card per hole built once (`web/app/h/[slot]/page.tsx`, `media/og/og.mjs`),
  a picture of the course to the phone's share sheet (`snapshot` in
  `web/components/Share.tsx`), the holing shot as an MP4 clip
  (`web/lib/engine/clip.ts`, `recordClip`, behind `NEXT_PUBLIC_CLIPS=1`).
  No server, and none to be added.

### The reference: gnofly's planes

gnofly sells planes on mainnet from
`gno.land/r/g1t2kg2vtr3fukg43eujkn6x53gfdyakhngt4sfd/gnofly/nfts/planes`
(source read in full). What it does right, and this design copies:

- **A paid call is a direct user call.** `Mint` refuses anything but
  `cur.Previous().IsUserCall()`: only then has the `-send` envelope landed at
  the realm's address. A relaying realm or a `maketx run` script could attach
  coins and keep them while `OriginSend()` still reports them.
- **The payment is checked exactly**: one coin, `ugnot`, the exact total.
  Anything else panics, and a panic reverts the send with the call.
- **The realm keeps no money**: the payment is forwarded to the treasury in
  the same call, with an `OriginSend` banker, which can spend the envelope of
  this call and nothing else.
- **A 5% royalty** through `gno.land/p/nt/grc721/royalty/v0`, naming the
  treasury, bounded by a maximum (1,000 bps).
- **A per-wallet cap** over the wallet's lifetime, and a batch limit per call.
- **Traits in one table string** committed with the realm, parsed on read:
  its 777 planes as structs would cost about ten times the deposit. Here
  the string is not committed with the code but published by the owner, a
  series at a time (section 9), and read in place the same way.
- **Refusals as string constants**, not `errors.New` values (about 1.15 KB of
  storage each, by its own measure).

What it does that this design does not copy: **the random draw**. `Mint`
gives 1 to 7 ids drawn among those left (`draw.gno`), the tier of each
unknown until paid. Paying for a chance at a rarer item is what Belgium
treats as gambling, what the Netherlands' regulator once fined (the fine was
annulled on appeal in 2022), and what the UK has kept under review. Here every token is chosen by id, its traits
public before the call.

### Can GNOT be sent on mainnet?

The README says not ("On mainnet, while GNOT can't be sent, there is no
Support chip"), and `web/components/Tip.tsx` says "Tips open once GNOT can
be sent on mainnet". gnofly charges 77 GNOT a mint on mainnet. Checked on
2026-10-06:

- gnoland-1, height 595,704: `params/bank:p:restricted_denoms` is `[]`. The
  bank refuses a send of a restricted denom from an account that is not
  whitelisted (`canSendCoins` in `tm2/pkg/sdk/bank/keeper.go`, tag
  `chain/onyx`), and `ugnot` is no longer restricted.
- gnofly's `Minted()` is 162 and its `CollectionJSON()` says `"price":
  77000000, "open": true`: 162 paid mints went through.
- onyx-1 answers `[]` too.

So GNOT moves on mainnet now: a `MsgCall` with `-send`, a realm's banker and
a plain `MsgSend` all pass. The README's line and the Support chip's
condition are out of date (a separate change: the chip can come back on
mainnet). The restriction is a chain parameter, and governance could set it
again; every payment below fails closed if it does (the call reverts, and
nobody's coins move), with one exception said under "Security".

### Can an existing market list a third-party GRC721?

No general one was found. gnofly's market (`gnofly/bazaar`, read in full) is
planes-only: it imports the planes realm and escrows planes through it. Its
doc says its calls and reads have "the shapes Bazaar's site
(bazaar.gnomi.fun) uses on a collection package", so it can be registered
there later: Bazaar expects each collection to bring its own market realm
in those shapes. A gnome can therefore move only by the GRC721 transfer in
v1 (`TransferFrom`, Adena's NFT send), and the royalty is paid only where a
market honours `RoyaltyInfo`. A market wrapper is the obvious v2 (gnofly's
is about 200 lines) and is out of scope here.

## Decisions

### 1. Cosmetic, readable, cheap to draw

- **Never touches play.** No trait reaches the chain's physics: the realm
  rolls a point, `Field.Radius` 0.5, whatever is drawn. The body stays the
  ball (`BALL_R / 0.55`), so a gnome touches a wall instead of sinking in. No
  trait changes the aim line, the preview or what is sent. Nothing is
  pay-to-win, and nothing ever will be: a trait that would need the realm to
  know it is refused at design time.
- **Readable at ball size.** The silhouette is the hat and the beard: a new
  piece adds to them and never hides the face's eyes and nose, which say
  where the gnome looks (the ball's heading at release). Two limits on size:
  - **Width.** `makeBall`'s `reach` is the gnome's horizontal half-extent,
    `max(-box.min.x, box.max.x, -box.min.z, box.max.z)`, and `offWalls`
    (`engine/replay.ts`) pushes the drawn gnome off a wall by `reach - d`.
    A wider gnome floats off walls and the cup's rim. So a gnome's x/z
    half-extent is at most 1.1 times the Classic's `reach`, measured with
    every animated piece at its widest (sails spread, a scarf's tail out).
    Animated pieces are left out of the box `reach` is taken from, so the
    figure the replay uses does not move with them.
  - **Height.** A gnome's highest point, cloud and sails included, stays
    within the tall hat's (`tall: true`, the Wizard's).

  The budget test (below) asserts both.
- **Readable as a ghost.** `makeGhost` fades each material (`ownFade`,
  `setFade`). Every new material, animated ones included, takes that fade:
  an animated shader carries the same opacity uniform. A ghost wears the
  gnome's meshes and materials only: no trail, no particles, no entrance.
- **No effect hides the ball's path or the cup.** A trail is drawn only
  while the ball rolls (never while aiming), behind the ball, under the aim
  line's render order, without depth writes, at most 0.6 opaque, at most 1.5
  board units long, gone 0.6 s after the ball stops. Particles never enter
  the cup's radius before the ball drops. A holing effect starts after the
  drop (`DROP_MS`, 320 ms, in `engine/clip.ts`), lasts at most 1.5 s, and
  never flashes the screen. Under reduced motion (`motion` false) trails and
  particles are off and a holing effect is one still frame. A piece's own
  particles (the Storm Gnome's raindrops) count as particles: drawn only
  while the ball rolls, within the tier's particle budget; the piece's mesh
  (the cloud) stays, within the height limit.
- **Entrances never block play.** A Legendary's entrance plays in the
  picker's and the shop's preview, and once at a hole's first load, while
  the hole's intro camera runs; aiming is open throughout, and a tap or a
  drag ends it. It never plays on a retry, in a ghost, or in a clip.
- **A budget per gnome that holds on phones.** The Classic, counted from
  `makeBall`'s geometries with their ink hulls, is about 3,200 triangles.
  Limits, checked by a test that builds every gnome of the catalogue:

  | tier | triangles | draws added after `bake` | particles (`lowGfx`) | textures |
  |---|---|---|---|---|
  | Common, Rare | 5,000 | 1 (the trail) | none | one 64×64 canvas at most |
  | Epic | 6,000 | 2 (material, trail) | 32 (12) | one 64×64 |
  | Legendary | 8,000 | 3 (material, trail, piece) | 64 (24) | two 64×64 |

  Particles are one instanced draw per effect; a trail is one ribbon mesh
  of at most 24 segments.

### 2. The tiers, the series and the sale

The catalogue is published in **series**. The first, the genesis, is 720
gnomes, all written before deploy and published before its sale opens:
every token's look, name and tier can be read before anyone pays. A later
series (a season's gnomes, say) is one more publication of rows, of any
size, with no new code (section 9). Its counts, sale and prices are its
own data. Everything below gives the genesis's numbers.

| tier | count | what it is | sold |
|---|---|---|---|
| Common | 504 | a gnome of one of the worlds' archetypes (a gardener, a fisher, a miner…): today's traits and the collection's new hats, beards and small things, in a palette of the archetype | fixed price |
| Rare | 144 | a Common's kind with a patterned body (stripes, spots, checks, zigzag, argyle, patchwork), one piece more (scarf, bow tie, plume, earmuffs, satchel, medal), and a coloured ribbon trail | fixed price |
| Epic | 65 | designed by hand: a material of its own (metal, varnished wood, neon, porcelain, stone, glaze, wool, gingerbread), a prop of its own, its own trail and holing effect | fixed price |
| Legendary | 7 | one of one, each a unique moving piece, a material or hat of its own, a trail, a holing effect, an entrance, and its name raised on the boards | fixed price, one a wallet |
| Earned | one per player per earned gnome | the nine gnomes of `UNLOCKS`, exactly as `GNOMES` draws them | never: minted free, bound to the player |

The counts are defined once, in the series' data (`data/gnomes/series.json`:
`supply`), from which the client's catalogue, the realm's rows and the
realm's check of the genesis (its own `genesisSupply`, the one constant the
realm keeps, compared with the rows it is given) all follow. 504 is 72 a
world; 144 and 65 are shared over the seven worlds as evenly as they go,
the first worlds taking what is left over.

**The sale and the worlds.** The genesis is sold in one sale: every id of
it on sale from the same start (`OpenSale`, ADR-013). The catalogue lays
the ids out a world at a time, in this order (`series.json`'s `worlds`): a
world is one run of ids, its Commons, then its Rares, its Epics, and its
Legendary. Ids are fixed by the catalogue; the sale only opens them.

| # | world | ids | Common | Rare | Epic | Legendary |
|---|---|---|---|---|---|---|
| 1 | the Garden | 1–104 | 1–72 | 73–93 | 94–103 | 104 |
| 2 | the Island Cup | 105–208 | 105–176 | 177–197 | 198–207 | 208 |
| 3 | Mushroom Town | 209–311 | 209–280 | 281–301 | 302–310 | 311 |
| 4 | the Mountain Cup | 312–414 | 312–383 | 384–404 | 405–413 | 414 |
| 5 | the Crystal Mines | 415–516 | 415–486 | 487–506 | 507–515 | 516 |
| 6 | the volcano | 517–618 | 517–588 | 589–608 | 609–617 | 618 |
| 7 | the storm | 619–720 | 619–690 | 691–710 | 711–719 | 720 |

Earned tokens are outside the catalogue's ids: they start at 1,000,001,
above any id a catalogue can reach (64 series of at most 1,000 rows end at
64,000), so a later series never meets them.

The seven Legendaries, one a world. The course has five cups; two
Legendaries belong to its set pieces instead. `kind` is the Legendary's
number in its traits (section 10): 1 to 7 in the order they were designed
(the Crystal Gnome first), not in the order of their ids:

| id | kind | name | where from | piece and material | trail | holing | entrance |
|---|---|---|---|---|---|---|---|
| 104 | 4 | The Miller | the Garden (Garden 4's mill) | a small mill for a hat whose four sails turn | petals | the sails spin up and blow a gust of petals | rolls in on the wind |
| 208 | 5 | The Admiral | the Island Cup | a golden tricorn and epaulettes | a wake of foam | a splash of water from the cup | arrives on a small boat |
| 311 | 6 | Ancient Mushroom | Mushroom Town | a mushroom cap for a hat, pulsing softly | spores | a ring of spores puffs up | sprouts from the ground |
| 414 | 7 | Summit Gnome | the Mountain Cup | a frost-capped hat, frosted beard, a frost material | snow | a little avalanche of snow over the rim | slides down a snow bank |
| 516 | 1 | Crystal Gnome | the Crystal Mines | a faceted, see-through body that bends the light behind it (refraction faked in the toon bands, no transmission pass) | shards | the cup rings with crystal chimes and a burst of shards | rises out of a crystal cluster |
| 618 | 2 | Lava Gnome | the volcano (Island 16) and the Mines' lava | a dark crust with glowing cracks that slowly flow (the Mines' lava shader, `scene/mines-lava.ts`, at gnome size) | embers | a puff of embers and smoke | climbs out of a lava pool |
| 720 | 3 | Storm Gnome | the storm (the Island Cup's weather) | a small thundercloud floating over the hat, raining a few drops while the ball rolls | a gust of streaks | a bolt of lightning into the cup | dropped by the cloud |

"Its name raised on the boards": a row whose player wears a Legendary
(`Worn`) shows the gnome's name as a small pill after the player's name, in
its colour, on every board and in Friends, as long as they wear it.

### 3. Earned gnomes are never copied, and never sold

- No Common, Rare or Epic gnome copies a gnome of `GNOMES`, earned or free:
  each is at least a fixed distance in look from every one of them
  (`validate.ts`, `MIN_FROM_GNOMES`). The earned gnomes' signature pieces
  stay theirs: no token of the sale wears `stars`, `horns`, `parrot`,
  `mask`, `sash`, `crown`, `cape` or `lamp` (`EARNED_ONLY`), and none wears
  the combination that defines another earned gnome (`toque` with `flour`,
  the Baker's; `tricorn` with `patch`, the Pirate's; polished metal with the
  Golden Gnome's gold on both hat and body, the Golden's). The Legendaries
  keep to it too: none wears a crown, and none is named "King" (the
  earned King keeps the word). `scripts/gnomes.ts --check` and a test hold
  the catalogue to it.
- An earned token is **bound to its player**: the realm refuses to transfer
  it (below, "Earned tokens"). Selling one would sell the feat. It can be
  burned, which gives its deposit back.
- Earned gnomes stay earned in the browser as today: playing one needs no
  token. The token is what makes it visible to others (worn, on a ghost,
  on the boards) and portable to another device.

### 4. The realm: `gno.land/r/gnogolf/gnomes`

One realm, package `gnomes`, deployed as `r/<ns>/gnogolf/gnomes` like the
rest (`scripts/stage.sh` gets it in `pkgs`). It imports:

- `gno.land/p/nt/grc721/v0` (the ledger, tellers, extensions),
- `gno.land/p/nt/grc721/royalty/v0` (EIP-2981, 5% to the treasury),
- `gno.land/r/gnogolf/store`, for reads only (the earned proofs and the
  player window),
- `chain`, `chain/banker`, `chain/runtime/unsafe` (`OriginSend` only),
  `encoding/base64`, `strconv`, `strings`, `gno.land/p/nt/bptree/v0`, and
  `gno.land/p/nt/seqid/v0` (grc721's `NewToken` takes a `seqid.ID`).

It does not import golf/v2, and golf/v2 and store do not import it.

**metadata/v0 is not used.** Its `Ledger` keeps a `Data` struct and a URI
per token in avl trees: a few hundred bytes of deposit per token for what
the catalogue already says. `TokenURI` and `TokenMetadata` are computed on
every read instead, from the token's catalogue row, as gnofly does;
`TokenMetadata` returns a JSON object with the keys OpenSea and Adena read
(`name`, `description`, `image`, `external_url`, `attributes`), as gnofly's
does, not metadata/v0's Go struct.

**enumerable/v0 is not used either.** It keeps every token id in one
`allTokens` slice beside four avl trees, so each mint rewrites a backing
array that grows with the supply, and earned tokens have no supply limit.
The realm keeps its own index instead: `owned`, a bptree whose keys are
`"<owner> <id>"` (value `""`), kept by the realm's extension on mint and
transfer and by its `Burn` wrapper on burn (section 8). `GnomesOf` and `TokenOfOwnerByIndex` read it;
`TokenByIndex` is not offered. (gnofly registers no enumerable extension
either.)

**Roles.** One owner, the deployer, captured at init, handed on in two steps
(`Transfer`, `Accept`) or given up (`Renounce`), as golf/v2's `owner.gno`
does; every owner check is on `cur.Previous().Address()`. A **treasury**,
an address apart from the owner, receives every sale and the royalty: a
cold wallet can hold the money while the owner's key does the daily
settings. The owner can publish a series, open its sale, set the genesis's
closing date (earlier only), set a tier's price for the sales to come
within bounds, pause and resume every sale at once, set the site's URL,
offer the treasury and the royalty to a new address, and sweep stray
coins. The owner cannot mint a token for anyone, move or burn anyone's
token, change a published series or opened sale, move the closing date later, or
reserve anything: there is no airdrop and no team allocation.

**The treasury** at deploy is a constant of the deploy, staged per chain by
`scripts/stage.sh` as the imports are; `init` checks it is a valid address
(`address.IsValid()`), not the realm's own (a treasury at the realm would
leave each sale in the realm) and not the owner's. It moves in two steps,
as the owner does: `SetTreasury(to)` offers it to a valid address that is
not the realm's, and the new address takes it with `AcceptTreasury()`,
which also re-points the default royalty. A typo can therefore never send
the sales to an address nobody holds: until `to` accepts, the old treasury
keeps receiving.

**The site's URL** (`SetSiteURL`) is what `TokenMetadata`'s `external_url`
and `Render`'s links point at: an `https://` URL of at most 128 printable
bytes, the site's own at deploy. It is a setting, not part of a token: a
moved site needs no new series.

**After `Renounce`**, nobody can change a setting or publish a series,
but nothing published is locked: the sales already opened stay on sale at
their prices until the closing date, which stays as it was set. A
renounced realm sells what it has opened and nothing more. A treasury
offer pending at the renounce can still be accepted; no new one can be
made.

### 5. API

Gno crossing syntax as on onyx (`func F(cur realm, …)`). Token ids are
`grc721.TokenID`, decimal without leading zeros: `"1"` to the catalogue's
last id (`"720"` for the genesis), and `"1000001"` up for earned tokens. Lists travel as comma-separated strings: a
`MsgCall` cannot carry a slice. Every JSON answer starts with
`"version":1`, as golf's do.

#### Writes, anyone

```go
// Buy buys gnomes by id at their fixed price: 1 to 5 ids, each in a sale
// that has started, none sold, before the genesis's closing date for a
// genesis id; a Legendary among them like any other. A direct user call
// (IsUserCall), with exactly the sum of their sale prices attached in
// ugnot, forwarded to the treasury before it returns. In a sale's player
// window the caller must have a record in store, and the window's cap per
// tier holds; the lifetime cap per tier (one Legendary a wallet) holds
// always; both are checked for the whole batch. Returns the ids bought,
// comma-separated.
func Buy(cur realm, ids string) string

// MintEarned mints the caller's earned gnome of kind ("wizard" … "miner")
// once store proves the feat (section 7). Free: nothing may be attached; the
// caller pays the storage deposit. Once per player and kind. A direct user
// call. Returns the token id.
func MintEarned(cur realm, kind string) grc721.TokenID

// Equip is optional: it picks which token the caller owns others see them
// wear, instead of their best (Worn); "" goes back to the best. Always a
// transaction of its own, never bundled with a golf save (11).
func Equip(cur realm, id grc721.TokenID)

// AcceptTreasury is called by the address SetTreasury offered the treasury
// to; it becomes the treasury and the default royalty's receiver.
func AcceptTreasury(cur realm)

// The GRC721 surface, through the ledger's caller teller (it acts as
// cur.Previous()): a caller moves their own tokens and those they were
// approved for. An earned token refuses any transfer.
func TransferFrom(cur realm, from, to address, id grc721.TokenID)
func Approve(cur realm, to address, id grc721.TokenID)
func SetApprovalForAll(cur realm, operator address, approved bool)
// Burn destroys a token the caller owns (its deposit returns). A sold id is
// never sold again; an earned kind can be minted again by its player.
func Burn(cur realm, id grc721.TokenID)
```

#### Writes, the owner

```go
func AddSeries(cur realm, name string, rows string)    // the next series, "id|tier|name|traits" a line, checked whole (section 9); the genesis first
func SetCloseAt(cur realm, at int64)                   // the genesis's closing time (unix); optional: unset at deploy (0: never closes, the genesis sells until sold out); the owner may set it before or after the sale opens, at least 7 days ahead (closeNotice) and after the genesis's sale starts; once set, only earlier (still 7 days ahead at least), never later nor removed
func OpenSale(cur realm, series string, start, playerHours int64) // every id of the series on sale from start (unix, a day back to a year ahead), its first playerHours (0 to 168) for players, at the prices in force, frozen into it; once a series; for the genesis, refused at or after its closing date
func CancelSale(cur realm, series string)              // withdraws a sale before it starts, nothing of it sold; the series may open again
func SetPrice(cur realm, tier string, ugnot int64)     // 1 to 10,000 GNOT; for the sales opened after it
func SetMintOpen(cur realm, open bool)                 // pause or resume every sale at once; closed at deploy
func SetSiteURL(cur realm, url string)                 // https://, at most 128 printable bytes; external_url and Render's links
func SetTreasury(cur realm, to address)                // offers the treasury to a valid address, not the realm's; it takes it with AcceptTreasury
func SetRoyaltyBps(cur realm, bps int64)               // 0 to 1,000
func Sweep(cur realm)                                  // sends the realm's ugnot, coins sent to it by mistake, to the treasury
func AcceptRules(cur realm, path string)               // the rules the earned gnomes' proof reads: store's current writer only, a realm (ADR-012)
func Transfer(cur realm, to address)
func Accept(cur realm)
func Renounce(cur realm)
```

`MintEarned` is open from deploy, and `SetMintOpen` and the closing date
do not close it, because it sells nothing. A published series is never
changed, and a sale is never changed nor, once started or with a gnome
sold, withdrawn: a sale keeps the prices it opened at, so `SetPrice` never
lowers what is on sale. Each setter emits an
event naming the new value (`SeriesAdded`, `CloseAtSet`, `SaleOpened`, `SaleCancelled`,
`PriceSet`, `MintOpen`, `SiteURLSet`, `TreasuryOffered`, `TreasurySet`,
`RoyaltySet`, `Swept`, and the owner's `OwnershipOffered`,
`OwnershipTransfer`, `OwnershipRenounced`). The writes emit `GnomeBought`
(`id`, `buyer`, `price`, `treasury`), `GnomeEarned` (`id`, `kind`,
`player`), `Equipped` (`player`, `id`); grc721 emits `Transfer` for every
mint, transfer and burn.

#### Reads

The GRC721 ones a wallet calls (Adena's shapes, as gnofly has them):

```go
func Name() string                                        // "Gnogolf Gnomes"
func Symbol() string                                      // "GNOME"
func TotalSupply() int64
func BalanceOf(owner address) (int64, error)
func OwnerOf(id grc721.TokenID) (address, error)
func GetApproved(id grc721.TokenID) (address, error)
func IsApprovedForAll(owner, operator address) bool
func TokenURI(id grc721.TokenID) (string, error)          // the portrait: data:image/svg+xml;base64,…
func TokenMetadata(id grc721.TokenID) (string, error)     // a JSON object with OpenSea/Adena keys: name, description, image (the same data URI), external_url, attributes
func RoyaltyInfo(id grc721.TokenID, salePrice int64) (address, int64, error) // royalty/v0's shape
func TokenOfOwnerByIndex(owner address, i int64) (grc721.TokenID, error)    // from the realm's `owned` index
```

The game's own:

```go
// Gnome is one token of the catalogue or an earned one, minted or not;
// its price is its sale's, or the price in force when its series is on no sale yet:
// {"version":1,"id":"42","series":"genesis","name":"Pip Seedwell",
//  "tier":"common","traits":"01…","owner":"g1…" or "","price":36000000,
//  "sold":true}
func Gnome(id grc721.TokenID) string

// Sold is the catalogue's ids' state in one read, for the shop: a bit per
// id (bit id-1 set once minted), in hex; for the genesis, 90 bytes, 180 hex
// digits.
func Sold() string

// GnomesOf is a wallet's tokens from offset, at most 100, with their traits,
// in the order of the `owned` index; "next" is the offset to ask for the
// following page, or -1:
// {"version":1,"owner":"g1…","total":3,"next":-1,
//  "rows":[{"id":"42","tier":"common","traits":"01…"}, …]}
func GnomesOf(owner address, offset int64) string

// Worn is the gnome a player shows everyone, derived from chain: the one
// they chose with Equip if they still own it ("how":"equipped"), else their
// best owned ("how":"best": the highest tier, legendary, epic, rare,
// common, then earned; on a tie the lowest id), looked for in the first 100
// rows of their `owned` index (a wallet of more uses Equip); "id":"" for
// none: {"version":1,"player":"g1…","id":"208","how":"best",
// "name":"The Admiral","tier":"legendary","traits":"01…"}
func Worn(player address) string

// WornMany is Worn for up to 50 players (comma-separated; repeats and junk
// skipped), as golf's Bests takes a list: a board's rows in one read, those
// who wear one: {"version":1,"rows":[<Worn's object>, …]}
func WornMany(players string) string

// Proof says what MintEarned(kind) would find for player, free:
// {"version":1,"kind":"viking","player":"g1…","ok":false,"minted":"",
//  "holes":18,"finished":16,"strokes":51,"par":54,"missing":["garden/7","garden/12"]}
func Proof(kind string, player address) string

// Collection is the settings in one read: whether sales are open; the
// genesis's closing date; per tier its price in force, its lifetime and
// player-window caps, how many sold; the series (name, first, last id), each
// with its sale (start, end of the player window, prices; null before one); the
// treasury and any pending offer, the royalty, the site's URL, the owner.
func Collection() string

func Render(path string) string
```

`Render` gives gnoweb the collection (series, each sale with its dates and
how many sold, prices, the closing date, a link to the site), a page per
gnome with its portrait (gnoweb's markdown keeps `data:image/svg+xml`
images: `gno.land/pkg/gnoweb/markdown/ext_imgvalidator.go`), and a player's
page with their tokens and worn gnome.

### 6. Payments, the sale and the close

- **Buy** copies gnofly's guard in its order: `IsUserCall`, then the ids
  (parsed strictly, distinct, each in a sale that has started, unsold, and,
  for a genesis id, before the closing date), then the player window and
  the caps, then `OriginSend()` equal to exactly one coin of `ugnot` for
  the sum of the sale prices, then the state (caps, mints), then one
  `OriginSend` banker send of that sum to the treasury. A refused call
  reverts its send with it: nobody pays for a refusal. Two buyers asking
  the same id in one block: the second panics on "sold" and keeps their
  coins. The realm never holds a coin past the call.
- **Prices**, golf's own numbers: Common 36 GNOT (the par of nine holes),
  Rare 72 (the par of a course), Epic 336 (the dimples on a golf ball),
  Legendary 1,296 (18 holes × par 72). `SetPrice` changes a tier's price
  within its bounds (1 to 10,000 GNOT) for the sales opened after it; a
  sale keeps the prices it opened at until its last id is sold or the sale
  closes. So nothing on sale is ever made cheaper, and a buyer reads a
  price that cannot move under them. The owner re-prices, if GNOT moves a
  lot, before a series' sale opens only, and does not open a later series
  cheaper than an earlier one in GNOT terms without saying why.
- **The Legendaries are sold like the rest**, all seven in the sale, at the
  Legendary price, by `Buy`, one a wallet over the whole sale. There is no
  auction. The first drafts auctioned them (48 hours, a reserve, each bid
  escrowed by the realm and the outbid refunded, a soft close); that was
  dropped on 2026-10-06 for simplicity (the realm never holds anyone's
  coins, and the bids, settlement, refunds and their tests go) and for
  legal clarity (no bid that is an order, no auction rules, no coins kept
  for others). A Legendary unsold at the close is never minted, like any
  other id.
- **The sale.** `OpenSale` opens every id of a series from a start time
  (ADR-013; the waves of the first drafts, a world at a time, are gone).
  For its first 48 hours (the genesis's setting; the call takes the hours)
  it sells only to a wallet with a record in store, a standing in either
  mode in golf's `totals` (v1's records were copied in), and at most 3
  Commons, 2 Rares, 1 Epic and 1 Legendary a wallet in that window. Then
  anyone, under the lifetime caps: Common 10, Rare 5, Epic 2, Legendary 1
  a wallet over the whole sale. The window's caps are counted per series
  and buyer, so a sale withdrawn and opened again hands no fresh window.
  The owner opens the sale by hand; nothing opens on its own. A cap spreads the sale over players, it is not a defence: anyone
  can open more wallets. The caps are constants of the realm, kept with
  the supply in one config file.
- **The close.** The genesis's closing date, `SetCloseAt`, is optional
  (the owner's decision of 2026-10-19, ADR-007): unset at deploy, the
  genesis may open with none (`closeAt` 0: it never closes, and sells until
  sold out), and the owner may set one, before the sale or later, at least
  7 days ahead (a buyer is never surprised) and after the genesis's sale
  starts. Once set it can only move earlier (never later,
  never removed, and never into the past), so the date a buyer reads is
  the latest the sale can run. From it on, `Buy` refuses every genesis id ("sale closed"),
  whatever sale holds it; an id unsold then is never minted, by anyone,
  and no sale may start at or after it. A later series has its own sale,
  not more of the genesis. The shop shows the date on every page once one
  is set, and no closing line while none is.
- **Royalty**: 5% by default, to the treasury, through royalty/v0's default
  royalty, readable as `RoyaltyInfo`. EIP-2981 is advisory: a plain
  `TransferFrom` pays none.

### 7. Earned tokens: what store proves

`MintEarned(kind)` and `Proof(kind, player)` read store directly, with
golf/v2's own key layout, and never call golf/v2:

1. **A cup's holes**: `store.Page("slots", r+world+"/", r+world+"0", 300)`,
   where `r` is the world's rank digit in golf/v2's `worlds` (`garden` 0,
   `island` 1, `town` 2, `mountain` 3, `mines` 4; `slotKey` in
   `golf/v2/data.gno`). Each row's value is the slot's current version id
   (`"garden/1/v1"`). On onyx, `store.Size("slots")` is 90 and
   `store.Get("slots", "0garden/001")` is `("garden/1/v1", true)`.
2. **A player's best on a version**, either mode:
   `store.Get("bests", id+" assisted "+player)` and
   `store.Get("bests", id+" pro "+player)` (`bestsOf` in `golf/v2/golf.gno`).
   **A best that is a copy does not count**: when
   `store.Has("copies", id+" "+mode+" "+player)` is true, that mode's best
   is treated as absent, exactly as golf/v2's `Claim` and its finish path do
   (`copiesOf`: a record sent again is kept, never ranked). Without this, a
   player could resend a board's ghost shots and mint Wizard, Viking, Golden
   or King as "proven on-chain". The strokes are parsed strictly: one to
   three digits, then a space, else the call panics (`bestOf` writes
   `"<strokes> <height> <period> <shots>"`). A hole counts as finished when
   either mode has a best that counts; its strokes are the lower.
3. **A version's par**: `store.Get("holes", id)`, field 2 of the entry
   (`encodeEntry` in `golf/v2/codec.gno`: format `"1"`, then each field as
   its length, `:` and itself; fields `id`, `name`, `par`, …).

The nine kinds, against `UNLOCKS`:

| kind | proof | reads |
|---|---|---|
| wizard | every Garden slot finished | 1 page, 36 gets |
| viking | every Garden slot finished, the lower bests added up ≤ their pars added up | 1 page, 54 gets |
| golden | five or more course slots (all worlds) whose lower best is 1 | 5 pages, 180 gets |
| pirate, diver | as wizard, viking, on the Island Cup | as above |
| baker, mayor | as wizard, viking, on Mushroom Town | as above |
| king | viking's proof on each of garden, island, town and mountain | 4 pages, 216 gets |
| miner | every Crystal Mines slot finished | 1 page, 36 gets |

All nine are provable, so none is dropped. The proof is stricter than the
browser's card in one way and looser in another, both on purpose: only the
**current** version of each slot counts (a best on an archived version does
not; a republished hole must be finished again, as the course ranking
already asks), and the chain's best counts where the card keeps the latest
round. A cup with no slot on chain proves nothing.

Gas: golf's `Claim` reads the 90 slots in both modes and measured 70.2M with
three bests seated (`CLAIM_GAS` in `web/lib/adena.ts`). The king's proof, the
heaviest, reads 72 slots three times, plus one `copies` lookup per best it
finds (the "gets" above do not count them), of the same order; the client asks
300M for it, and the measured figure from a filetest replaces that before
mainnet. `Proof` is a free query.

**Why store, not golf/v2's reads.** golf/v2's `BestOf` answers one hole and
mode; store gives the same rows without decoding an entry per call, and
store outlives golf/v2 (the next rules read its data on, `docs/golf.md`,
"Updating after the deploy"). The cost is a dependency on golf/v2's row
format. It fails closed in three places:

- a hole entry the parser does not read as format `"1"` panics;
- a best whose strokes are not one to three digits and a space panics;
- `bests` values carry no format version, so a later rules realm could
  change their shape unseen. The realm therefore refuses to prove anything
  while `store.Writer()` is not the rules it reads: state, golf/v2 at
  deploy (rewritten per namespace by `scripts/stage.sh` as the other
  imports are). When store moves to new rules (`Propose`, `Ready`), or is
  paused, `MintEarned` refuses with "rules changed" and `Proof` answers
  `"ok":false` with that reason, until the owner, having checked that the
  new rules keep `bests`, `copies` and `holes` as golf/v2 writes them,
  calls `AcceptRules` with their path: store's current writer only, never
  another realm nor a paused store's `""` (ADR-012).

So a later format can refuse a mint, never prove a false one. A script
compares the proof with golf/v2's `BestOf` on onyx's real rows before each
deploy (section 16).

**The player window's read.** A sale's player window asks less: whether a
wallet has a standing in either mode, `store.Has("totals", "assisted
"+addr)` or `store.Has("totals", "pro "+addr)`, which golf/v2 writes from a
player's first finished hole (v1's records were copied in). A copy counts
there: a record sent again still makes its sender a player, and the window
is a courtesy, not a proof. It depends on the `totals` key layout; rules
that change it must keep the answer the same for the same players.

### 8. Earned tokens: bound to their player

The realm registers one extension of its own beside royalty (grc721's
`RegisterExtension`; hooks run after the ledger write, and a hook that
panics vetoes the movement, as `p/nt/grc721/v0/types.gno` documents):

- `OnTransfer(from, to, id)` panics when `id` is an earned token, clears
  `from`'s equipped gnome when it was `id`, and moves the `owned` row from
  `"<from> <id>"` to `"<to> <id>"`;
- `OnMint(to, id)` writes the `owned` row;
- `OnBurn(id)` does nothing. grc721's `Burn` removes the owner before the
  hook runs, and the hook receives only the id, so it cannot know whose
  rows to clear.

The cleanup of a burn is in the realm's `Burn` wrapper instead, which
already checks that the caller owns the token: before calling
`ledger.Burn`, it removes the `owned` row, clears the caller's equipped
gnome when it is `id`, and, for an earned token, removes `kinds[id]` and
the `"<caller> <kind>"` row of `earned`, so the player can mint the kind
again. The ledger's burn then runs; if it panics, the whole call reverts,
the cleanup with it.

Approvals of an earned token are refused too, so no market lists one.

### 9. Storage

#### Layout

| what | where | size |
|---|---|---|
| the catalogue | `catalogue`, a slice of series, each its rows as published: one string, `id|tier|name|traits` a line, read in place by bisection | the genesis about 720 × 64 bytes, paid by the owner when it is published |
| the sales | `sales`, a slice, one a series at most: the series, start, end of the player window, prices per tier | a few dozen bytes a sale |
| the ledger | grc721's `PrivateLedger` (owners, balances, approvals), royalty's default | per token, below |
| a wallet's tokens | `held`, bptree: `"<owner> <id on 9 digits>"` → `""`, so a wallet's rows sort by id | one row per token |
| caps | `bought`, bptree: address → counts per tier; `inWindow`, bptree: `"<series> <address>"` → counts per tier | one row per buyer, one per buyer and window |
| earned | `earned`, bptree: `"<address> <kind>"` → id; `kinds`, bptree: id → kind | two rows per earned token |
| equipped | `equipped`, bptree: address → id, the optional `Equip` choice (`Worn` derives the rest from `held`) | one row per player who equips |
| settings | the price in force per tier, open or paused, the closing date, sold per tier; the site's URL; treasury and its pending offer, owner and its pending; the next earned id | at deploy |

Each bptree is seeded at deploy with a row no read shows, as store's are,
so the deployer pays its first leaf and not the first player. Which ids are
sold is not stored apart: `Sold` asks the ledger for each id (a query, free,
720 lookups for the genesis). A token's traits are not copied per token: a
token's id is its catalogue row's, and a published series never changes,
so the row is the token's record.

The bounds that keep every walk short: at most 64 series of at most 1,000
rows each (so 64 sales, one a series), a name of 48 bytes and traits of 256, 5 ids a `Buy`,
50 players a `WornMany`, 100 rows a `GnomesOf` page and a `Worn`'s look
for the best.

Refusals are string constants (gnofly's measure: an error value costs about
1.15 KB of deposit). Nothing returned to a caller is a reference to state.

#### Deposit

The deposit is 100 ugnot a byte on both chains. Measured with `// Storage:`
goldens on the realm built beside this spec (`z_storage_genesis`,
`z_storage_buy`), with traits of the designer's length and names of a
typical one:

| what | bytes | deposit, paid by |
|---|---|---|
| the genesis published, with one wave (measured before ADR-013; now its one sale) | 46,230 | 4.6 GNOT, the owner |
| a buyer's first gnome | 3,535 | 0.35 GNOT, the buyer, on top of the price, returned on `Burn` |
| a buy, on average over the first 11 buyers | about 5,300 | about 0.53 GNOT |

An avl row was measured at about 2 KB of deposit, a bptree row a fraction
of it, which is why every table of the realm is a bptree; registering
enumerable/v0 added 5 to 9 KB to a buy (section 4).

Still estimated, to be measured the same way before mainnet:

- **Deploy**: the source and the objects `init` makes, without the
  catalogue, which is published after. `addpkg` is sent with a
  `-max-deposit` of 40 GNOT, and the figure is measured on onyx first.
- **An earned token**: the owner, balance and `held` rows, plus `earned`
  and `kinds`, without the cap rows: estimated 3 to 5 KB.
- **Equip**: one row the first time; changing it, nothing. Wearing one's
  best costs nothing: `Worn` is a read.

The client's cost lines use the measured numbers.

### 10. Traits

A token's look, its **traits**, is a string of lowercase hex, one byte a
field, the format's version first. Format 1 is 29 bytes, 58 hex digits
(`web/lib/gnomes/codec.ts`):

| byte | field | values |
|---|---|---|
| 0 | format | 1 |
| 1 | series | the series' code (`series.json`: genesis 1) |
| 2 | tier | 0 earned, 1 common, 2 rare, 3 epic, 4 legendary |
| 3 | kind | earned: 1–9 in `UNLOCKS` order; legendary: 1–7 (section 2); else 0 |
| 4 | home | 0 none, 1 garden, 2 island, 3 town, 4 mountain, 5 mines, 6 volcano, 7 storm |
| 5 | archetype | 0 none, then the archetypes (gardener, fisher, sailor, …) |
| 6 | hat | 0 cone, 1 tall cone, 2 tricorn, 3 toque, 4 top hat, 5 helmet, then the collection's (straw, bucket, sailor, …, mill, mushroom) |
| 7 | hat colour | palette index |
| 8 | brim colour | palette index; 255: the shape's default, as `makeBall` does it |
| 9 | beard | 0 full, 1 long, 2 bushy, 3 moustache, 4 none, then goatee, braids, chops |
| 10, 11 | hair, body colour | palette index; 255 none |
| 12, 13 | pattern, its colour | 0 plain, 1 stripes, 2 spots, 3 checks, 4 zigzag, 5 argyle, 6 patchwork |
| 14–17 | accessories | a 32-bit mask, big-endian, bit 0 first: glasses, pompom, flower, cheeks, stars, horns, patch, parrot, mask, flour, sash, monocle, crown, cape, lamp, then the collection's (goggles, earring, …) |
| 18 | accent | palette index: the small things' colour |
| 19, 20 | piece, its colour | a Rare's: 0 none, scarf, bow tie, plume, earmuffs, satchel, medal |
| 21, 22 | material, its tint | 0 toon, then metal, wood, neon, porcelain, stone, glaze, wool, gingerbread, crystal, lava, frost |
| 23, 24 | trail, its colour | 0 none, then ribbon, sparks, shavings, light, … |
| 25, 26 | holing effect, its colour | 0 the game's confetti, then the Epics' and Legendaries' own |
| 27, 28 | prop, its colour | 0 none, then an Epic's or a Legendary's own thing (`props.ts`) |

Every table is in `web/lib/gnomes/vocab.ts` (and `props.ts`), **append
only**: a code, once a token carries it, means the same thing for good. A
new hat, effect or colour is a new last entry and its mesh in `scene/`.
The **palette** is 82 colours today; the first 27 are every colour
`GNOMES` uses, so an earned gnome writes exactly as it is drawn. A colour
outside the palette cannot be written.

**What a reader does not know, it draws plain**, as CLIENT.md's rule 2 does
for skins: a code past its table is the plain form (a hat it lacks is the
cone, a material is toon, a trail is none, a piece or prop is not drawn), a
colour past the palette is the default, a string too short leaves the
fields it lacks plain. A field added later is appended to the same format,
so an older reader still reads the ones it knows. A field whose meaning
changes needs a new format; a reader that meets a format other than its own
draws the Classic under the token's name. A new client draws more of an
old token, never less.

**An earned token's traits** are its tier (0) and kind (1–9), every other
field plain: the client draws `GNOMES`' own gnome for the kind, so an
earned look is defined in one place, `scene/gnome.ts`.

**The realm does not decode traits** (but for its portrait, below): it
keeps them as published, at most 256 printable bytes, and returns them. It
prices and sells by the row's tier, which the traits repeat: the script
that writes the rows takes both from the same entry and checks they agree.

**The catalogue's source** is `data/gnomes/`: `series.json` (each series'
code, first id, supply per tier, its worlds in order, the generator's seed, the
starting sale settings) and, per series, `archetypes.json` (the Commons'
and Rares' archetypes and palettes), `epics.json` and `legendaries.json`
(designed by hand). `scripts/gnomes.ts` makes `data/gnomes.json` from them,
one gnome a line, and `--check` (run by `scripts/check.sh`) fails when the
file is not what the data makes or a rule breaks (`web/lib/gnomes/validate.ts`):
the ids as the series' plan lays them out, with the counts of `supply`;
names unique, `[A-Za-z' -]{3,24}`; lines unique; traits that read back the
same and agree with the entry; each tier's rules; readable on every ground
and as a ghost; no two gnomes alike; none a copy of `GNOMES` nor wearing an
earned gnome's signature (section 3). The same data and seed give the same
gnomes, id for id. A script (`scripts/gnomesrows.ts`) writes the realm's
`AddSeries` rows from `data/gnomes.json`, and a test holds the realm's
`genesisSupply` to `series.json`'s `supply`: the counts are written once.

**The portrait**, decided: drawn on chain, so a token's picture lives with
it in any wallet and outlives the site. `TokenURI` draws the token as an
SVG from its row on every read: a front view (body with its colour, hat with its shape among
`GNOMES`' six and its colour, beard, eyes and nose), on its tier's ground
and frame (grey, blue, purple, gold, as the client's `TIER_LOOK`), its name
along the foot. It reads the traits with the client's rule: what it does
not know (a later hat, a later colour) it draws plain. It is built from
constants and the row only; the name is XML-escaped. It is a token's
wallet picture, not its look: the look is the game's 3D drawing. The
thumbnails and link cards are drawn by the game itself (`makeBall` in
headless Chrome, section 12), so there is one drawing of the true look and
no second copy to keep in step.

### 11. Client integration

All of it behind `NEXT_PUBLIC_GNOMES=1` (and `?gnomes` in a dev build), as
clips are behind `NEXT_PUBLIC_CLIPS`; unset, the game is as today.

| file | change |
|---|---|
| `web/lib/gnomes/` (new) | `vocab.ts` (the append-only tables and the palette), `codec.ts` (`encode`, `decode`, `FORMAT`), `skin.ts` (`skinOf`, `skinOfTraits`: traits to the `Skin` `makeBall` draws), `catalogue.ts` (the series' plan, `TIER_LOOK`, trait rows, the gallery's filters), `generate.ts` and `validate.ts` (the catalogue made from `data/gnomes/` and its rules), `props.ts`, `colour.ts`; and `tokenGnomeId(id)` (`"t42"`) |
| `data/gnomes.json` (generated, committed) | every series, its plan and every gnome's name, line, traits and `Skin`, read by the shop at build time |
| `web/lib/scene/gnome.ts` | `Skin` gains the collection's fields, all optional (`pattern`, `patternColor`, `piece`, `pieceColor`, `material`, `materialColor`, `trail`, `trailColor`, `holing`, `holingColor`, `prop`, `propColor`, `accent`, the new accessories and hats): `makeBall` draws them through `gnome-kit.ts`, `gnome-matter.ts`, `gnome-props.ts` and `gnome-legend.ts`; `makeGhost` leaves trail and particles out; `makePreview` shows them all; the fourteen `GNOMES` are drawn exactly as before (a fingerprint test) |
| `web/lib/scene/gnome.ts`, `makePreview` | gains `snapshot()`: renders one frame and, in the same task, draws it with `drawImage` onto a 2D canvas filled with an opaque ground first (the renderer is `alpha: true` and keeps no drawing buffer, `scene/camera.ts`), as the engine's snapshot does (`engine.ts`, "drawn and read in the same task"); plays the entrance on show |
| `web/lib/scene/gnome-fx.ts` (new) | trails, holing effects, entrances, with the limits of section 1; an entrance is started by `makePreview`'s `show` and by `engine.ts` at a hole's first load, never elsewhere |
| `web/lib/chain.ts` | reads: `worn`, `wornMany`, `gnomesOf` (paged by offset), `sold`, `proof`, `collection`, the realm path from `NEXT_PUBLIC_GNOMES_REALM` (default: golf's namespace and `gnomes`, as `storePath` derives store's) |
| `web/lib/adena.ts` | `buyGnomes` (a `/vm.m_call` with `send` set: the `Call` type has the field, unused today), `mintEarned`, `equip`, each sent alone, never in the same `DoContract` as a golf message; their `gnokey` lines beside `gnokeyTip` |
| `web/lib/prefs.ts` | `savedGnome` accepts a token's id (`"t42"`) when the account owns it, falling back as today: the gnome played on one's own ball is a choice kept in the browser, free |
| `web/lib/engine.ts` | the ball made from a resolved `Skin` (lines 110 and 1553 call `makeBall(gnomeById(…))` today); the trail updated while rolling; the holing effect after the drop |
| `web/lib/engine/rival.ts` | `made()` dresses the ghost in its player's `Worn` gnome, and keeps `rivalSkin` when they have none or wear the same look as the player |
| `web/lib/engine/clip.ts` | `ClipOf.gnome` becomes a `Skin`; the clip's gnome has its trail and holing effect (the clip ends on the drop: the moment the effect is for) |
| `web/components/Golf.tsx` | the `Picker` lists the account's tokens after `GNOMES`; a shop (`web/components/Gnomes.tsx`, new), its pages closed by country (section 15); `linkedGnome` reads `?gnome=t42` |
| `web/components/Leaderboard.tsx`, `Modes.tsx` | `Face` and the rival stage wear each row's worn gnome (one `WornMany` per page of rows); the Legendary pill after a name |
| `web/components/Share.tsx` | the share moments of section 12 |
| `web/app/g/[id]/page.tsx` (new), `web/app/sitemap.ts` | a static page per gnome |

**Equipping is its own transaction, never part of a save.** A tm2
transaction is all-or-nothing, and `send` in `web/lib/adena.ts` puts every
message in one `DoContract`: an `Equip` bundled with a `PlayRound` or a
`Claim` would take the round down with it whenever `Equip` panics (the
token moved away between the read and the save, a bug in gnomes, gas run
out). That would break the promise that a broken or paused gnomes realm
cannot touch a record. So picking an owned gnome in the picker plays it at
once, locally and for free, and nothing needs to be sent: others already
see the player's best gnome (`Worn`). Only when the pick differs from
`Worn(account)` does the picker offer "Show this one to everyone", which
sends the optional `Equip` alone. Nothing is sent with a save. If saving a signature later matters, the most the client may
do is offer `Equip` as a second, separate transaction after the save has
landed. The gnokey paste is the same: a separate `maketx call` for
`Equip`, printed apart from the save's.

**Reads stay few.** `Worn` of the player once per visit and on wallet
change; `WornMany` once per board page or Friends list (a page of more
than 50 rows takes one read per 50), cached for the visit; `GnomesOf` from
offset 0 when the picker opens, then the next pages while `next` is not -1; `Sold` and `Collection` when the shop is open.

### 12. Sharing at zero server cost

ADR-003 holds: a static export, no server, nothing that needs one.

- **A page and a picture per gnome.** `/g/<id>/` for each gnome of the
  catalogue and `/g/<kind>/` for the nine earned kinds (729 pages for the
  genesis, from `data/gnomes.json`, `generateStaticParams`, no chain at
  build time), each with its title ("The Admiral, Legendary gnome of
  Gnogolf"), its line as description, and an image, opening the game with
  that gnome on show. The picture is the game's own drawing: every gnome
  drawn by `makeBall` in headless Chrome (`media/gnomes/render.mjs`,
  `npm run gnomes:thumbs`), a three-quarter view on its tier's plinth, a
  256-pixel WebP of under 10 KB, committed under `media/gnomes/thumbs/`
  (about 5.7 MB for the 720), as ADR-003 makes and commits the hole cards.
  The pages use it as a square `og:image` (`twitter:card` `summary`). The
  seven Legendaries also get a turntable (an animated WebP, its piece
  moving, `media/gnomes/turntables/`) and a 1200×630 card made once the
  same way (`media/og/og.mjs`), committed: the pages most shared. No image
  library is added, and no card is rasterised at build time. (A 1200×630
  card for every gnome would add tens of MB to the repo or an image step to
  the build: not worth it for the Commons; open, see "Built so far".)
- **On a phone, your gnome as a picture.** The picker's and the shop's
  turntable draws one frame through `makePreview`'s new `snapshot()`
  (section 11) to a 2D canvas, made into a PNG
  with its name and tier on it in the browser, and handed to the system
  share sheet through `Share.tsx`'s `snapshot`, with the text and the
  gnome's page link.
- **Clips wear the player's gnome**, its trail and holing effect included
  (section 11).
- **The moments that offer a share**, each with its text and link:
  - a gnome bought: "I just adopted Pip Seedwell, gnome #1 of Gnogolf." →
    its page;
  - an earned gnome minted: "Garden Cup at par: the Viking is mine, proven
    on-chain." → the Viking's page;
  - a Legendary bought: "The Storm Gnome is mine, one of seven." → 720's
    page;
  - the sale opened: "The Genesis is on sale: 720 gnomes." → the
    gallery;
  - showing one to everyone (`Equip`), from the picker: "My gnome for the
    boards: The Admiral." →
    its page.
- **Community holes.** A community hole has no page of its own (its id is
  only known on chain, after the build): its link stays `?hole=<id>`, with
  `&by=<address>` for a ghost dare (`holeLink` in `web/components/common.ts`
  already writes both), under the default card. The post carries the
  picture of the hole made in the browser (`snapshot`), which networks show
  before the link card.

### 13. Revenue

How the project's owner earns, and only that:

- **The sale**: each `Buy` sends its price to the treasury in the same
  transaction, the Legendaries included. If every gnome of the genesis sold
  at the starting prices, the sum would be 504 × 36 + 144 × 72 + 65 × 336
  + 7 × 1,296 = 18,144 + 10,368 + 21,840 + 9,072 = 59,424 GNOT. That is
  the ceiling of the starting settings, not a forecast: nothing says how
  many will sell (gnofly sold 162 planes in its first weeks), the prices
  of a later series' sale can differ, and what is unsold at the closing
  date is never minted.
- **Royalties** are a tip, not income: budget on the sale above only.
- **Royalties**: 5% of a resale, to the treasury, only where a market pays
  `RoyaltyInfo`. With no market for these tokens today (Context), expect
  none until one lists them.
- **Earned gnomes** bring nothing: the deposit their players pay is held by
  the chain for the storage, not paid to anyone.
- **Onyx** brings nothing: its GNOT is free. Revenue starts on mainnet.
- Tips (Support) are unchanged, and can come back on mainnet (Context).

### 14. Security

| risk | answer |
|---|---|
| A realm or a `maketx run` script calls `Buy`, attaching coins it keeps while `OriginSend` reports them | `IsUserCall` first, on every paid call: a code realm and a `maketx run` script's ephemeral realm (`gno.land/e/<addr>/run`, `IsUserRun`) are both refused |
| Wrong coin, wrong amount, several coins | exact check: one `ugnot` coin of the exact sum, or the call panics and its send reverts |
| Money held by the realm | none: a sale is forwarded in the same call, and there is no auction, so no escrow; `Sweep` sends coins sent by mistake to the treasury |
| The treasury moved to a wrong or hostile address | two steps: `SetTreasury` only offers, and the sales keep going to the old treasury until the new address calls `AcceptTreasury`; the offer refuses the realm's own address and an invalid one |
| GNOT restricted again by governance | every `Buy` reverts (the treasury send fails) and nobody's coins move; nothing is held, so nothing is stuck |
| The closing date pushed back to sell more | `SetCloseAt` only moves it earlier; `OpenSale` refuses a start at or after it; `Buy` refuses a genesis id from it on |
| A stolen owner key | can publish a series, open its sale before the close (and withdraw it before it starts, nothing sold), change the prices of the sales to come, bring the close forward, pause the sale, set the site's URL (which the shop's links and `external_url` follow), offer the treasury (it moves only if the new address accepts), set the royalty and accept store's current rules for the earned gnomes' proof (`AcceptRules`, never another realm); cannot mint for anyone, move or burn a token, take a sale, push the close later, or change a published series or an opened sale. `Renounce` freezes the settings for good |
| A price cut that undercuts earlier buyers | a sale keeps the prices it opened at; `SetPrice` moves only the sales opened after it |
| A wallet taking several Legendaries | the lifetime cap of one Legendary a wallet; like every cap, it spreads the sale, it does not stop a buyer with many wallets |
| The player window gamed by fresh wallets | a record costs a finished hole on chain, and the window has its own cap per wallet and series' sale (a sale withdrawn and opened again hands no fresh window); it spreads the first days over players, it does not claim to stop a determined buyer |
| A catalogue or a query that grows without bound | at most 64 series of 1,000 rows (so 64 sales), 5 ids a `Buy`, 50 players a `WornMany`, 100 rows a `GnomesOf` page or a `Worn`; a series is checked whole before it is kept |
| A forged realm value given to a helper | helpers take `cur` and check `IsCurrent`, as gnofly's `callerOf` does |
| Malformed ids | strict decimal, no leading zero, in a known range; anything else is "unknown gnome" |
| An earned token sold or listed | `OnTransfer` and `Approve` refuse it |
| A worn gnome after it changed hands | `OnTransfer` clears the `Equip` choice; `Worn` also checks the owner on read and derives the best from what the player holds now |
| A false earned proof | the proof reads store's rows, which only golf's rules write; a best with a `copies` row does not count (a resent ghost proves nothing); an entry of a format it does not know, or strokes not as `bestOf` writes them, panic; a store whose writer is no longer the golf/v2 it was built against proves nothing |
| A burned earned token that cannot be minted again | the `Burn` wrapper clears `earned`, `kinds`, `owned` and the equipped gnome before the ledger's burn, not the `OnBurn` hook, which cannot see the owner |
| Script injection through the portrait or the site's URL | the SVG is built from the catalogue row and constants; `SetSiteURL` takes only `https://` and printable bytes, and the realm escapes it where it writes it; no player text enters it; the catalogue's names are held to `[A-Za-z' -]` by `scripts/gnomes.ts`, and the realm escapes the name anyway, since it takes any printable row |
| Gas of the extensions | two hooks per movement (royalty, the realm's own), each a few reads and writes |
| golf and store | untouched; nothing in them imports or calls gnomes; and no gnomes message ever rides in the same transaction as a golf message (section 11), so a gnomes call that panics, from a bug, a pause or a token moved away, cannot revert a round or a claim |

### 15. Legal

Not legal advice: the owner checks these with a lawyer before mainnet;
the questions, with the drafts of the terms, the 特定商取引法 notice and the
shop's words, are in `docs/superpowers/legal/`.

- **The seller** is an individual living in Japan (個人事業者): Japanese
  law first (特定商取引法's notice and final confirmation screen, 景品表示法,
  consumption tax), then the law of the buyers the shop serves.
- **Loot boxes.** No random draw: every token is chosen by id with its traits
  published, at a fixed price, the Legendaries too. That is the point of
  dropping gnofly's draw: paid chance at a rarer item is the model Belgium
  bans and the UK keeps under review. The Netherlands' gaming authority
  (Ksa) fined EA €10M over it, but the Raad van State annulled that fine on
  9 March 2022; the question there is open, not settled against loot boxes.
- **Not an investment.** No promise of value, no share of revenue, no
  staking, no buy-back, no airdrop or token promised to holders. The
  game's words never speak of floors, returns, flipping, "early is cheaper"
  or "will go up", and no timer or counter is fake: the shop counts each
  sale up ("61 of 720 found a player"), never a whole collection down. The
  royalty goes to the project only. For the lawyer: MiCA's recital 11
  treats issuance "in a large series or collection" as a sign that
  crypto-assets are fungible, not unique; 720 fixed-price items in four
  tiers, each with its own look and name, sold in one sale, may or may not
  meet that test, and the answer decides whether the sale falls under
  MiCA. Ads aimed at the UK show the price and fees and say NFTs are
  unregulated (the ASA's rulings).
- **No auction.** Dropped for legal clarity as much as simplicity: no bid
  that is an order, no auction rules, no coins held for anyone, the same
  confirmation screen for every purchase.
- **An optional closing date**: with none the genesis sells until sold out (the confirmation says so);
  once the owner sets one, it is shown on every shop page and on the confirmation
  screen (申込期間): it can only come earlier, and nothing unsold is minted
  after it, so "limited" means what it says for the genesis; the shop still
  says later series may be sold.
- **No free gift to buyers.** The brief's free "Founding Gnome" for every
  buyer is not done: a gift tied to a purchase is a premium (景品類) under
  景品表示法, capped in value. Earned gnomes need no purchase.
- **Pay-to-win.** None: cosmetic only, and the earned gnomes cannot be bought.
  Wearing costs nothing either: everyone shows their best gnome, and the
  optional `Equip` is free but for its fee.
- **Where the shop is offered.** Everywhere but China and the countries
  under comprehensive sanctions (Cuba, Iran, North Korea, Syria, Russia,
  Belarus): Netlify's country rules (`netlify.toml`, `conditions =
  {Country = [...]}`) send the shop's pages, and only them, to a page that
  says the shop is not offered there; the game, its boards and the earned
  gnomes stay open everywhere. The chain cannot be geoblocked: the terms
  bar those buyers too. The EU and the UK are not blocked for now, so their
  consumer law applies (below), with their VAT; blocking them stays the
  fallback the lawyer may advise.
- **EU and UK consumer law.** A purchase of digital content delivered at once loses
  the 14-day right of withdrawal only with the buyer's express consent and
  acknowledgement before paying, and the trader must confirm the contract,
  that consent included, on a durable medium (Consumer Rights Directive,
  Art. 8(7)). So:
  - before the buy, a ticked box ("I want the gnome delivered now and I
    lose my 14-day right of withdrawal") the button needs, not the button
    alone;
  - the trader's identity and geographic address, and a contact, shown in
    the shop before purchase (Art. 6), from the site's build settings;
  - after the transaction lands, a receipt the buyer can print or save as
    a page (the site cannot start a download from every browser): the tx
    hash, the token id and name, the price, the date, the trader's
    identity, and the consent text as ticked. The tx hash on chain is the
    permanent record; the receipt is what the directive asks for. Whether
    that is enough is for the lawyer.
- **Taxes and VAT** on sales to consumers are the owner's to declare:
  Japanese consumption tax, and, the EU and the UK being served, their VAT
  on electronic services from the first sale (the non-Union OSS, UK VAT),
  for a tax adviser.
- **The art** is the project's own; the names are original. Nothing is drawn
  from a third party's brand.
- **Minors.** Playing stays free and needs no wallet; buying needs a wallet
  and GNOT, and the shop says the sale is for adults.

### 16. Testing

**Gno** (`gno test`, run by `scripts/check.sh`, which gets
`./gno.land/r/gnogolf/gnomes` in its list and in `stage.sh`'s `pkgs`):

- The catalogue: `AddSeries` refuses a series whole for a malformed row, a
  gap or a repeat in its ids, an unknown tier, a name or traits too long or
  with control bytes, a genesis whose counts differ from `genesisSupply`, a
  second genesis, a 65th series or a 1,001st row; a gnome is found by its
  id in any series. `genesisSupply` equals `series.json`'s `supply` (a test
  reads both). The look rules themselves are the client's (below).
- Payments, with `testing.SetOriginSend`, `testing.IssueCoins` and
  `testing.SetRealm`: no coin, two coins, another denom, a unit under and
  over the price, the exact price; a call from a code realm
  (`testing.NewCodeRealm`) refused; a call from a `maketx run` script's
  ephemeral realm (`gno.land/e/<addr>/run`, where `IsUserRun` is true and
  `IsUserCall` false) refused on `Buy`, as a case of its own;
  the treasury's balance after a `Buy` equals the price and the realm's
  is 0.
- Two harness traps, handled in every paid test:
  - `testing.SetOriginSend` reports the envelope but does not credit the
    realm: each paid call is preceded by `testing.IssueCoins` of the same
    envelope to the realm's address, or the forward to the treasury fails
    and the balance assertions are wrong;
  - `testing.SkipHeights` resets the whole test context to its height and
    time (`context_testing.gno`), dropping the realm and the `OriginSend`
    set before it: after every `SkipHeights`, the test sets `SetRealm` and
    `SetOriginSend` again.
- Buy: paused, an id in no sale, an id of a sale not started, a sold id,
  an id twice in one batch, six ids, an earned id; a Legendary bought at
  its price, a second Legendary for the same wallet refused (in one batch
  and across batches); in a player
  window a wallet with no record refused and one with a record in either
  mode taken, the window's cap reached in one batch and across batches; the
  lifetime cap the same; a `SetPrice` after a sale opened leaves the sale's
  prices as they were and prices the next sale; a price changed between
  the read and the `Buy` of a sale not yet opened, refused by the exact
  check, coins kept.
- Sales: `OpenSale` refuses an unknown series, a second sale of a series,
  a start more than a day back or a year ahead, a window over 168 hours,
  and, for the genesis, any at or after its closing date, if one is set; `CancelSale`
  refuses a sale under way or with a gnome sold, and a sale opened again
  hands no fresh player window.
- The close, with `testing.SkipHeights` to move time (5 s a block):
  a genesis sale and `SetMintOpen(true)` taken with no date, never closed; `SetCloseAt` later than the one
  set, or in the past, refused, earlier taken; a `Buy` of a genesis id one
  block before the close taken and one at it refused, its coins kept; an
  unsold id stays unminted after it; `MintEarned` unaffected.
- Owner: `SetTreasury` to the realm's own address and to an invalid one,
  refused; an offer leaves the sales going to the old treasury until the
  new address calls `AcceptTreasury`, which re-points the royalty;
  `AcceptTreasury` by anyone else refused; a deploy constant equal to the
  owner refused by `init`. `SetSiteURL` refuses a non-`https://` URL, 129
  bytes and a control byte; `TokenMetadata`'s `external_url` follows it.
  After `Renounce`, every setter refused, the opened sales still on sale
  until the close. `Sweep` sends the realm's whole balance to the treasury.
- Earned: a test cannot make course slots through golf/v2 (under `gno test`
  golf has no owner, `setUp` in `golf/v2/owner.gno`, and only the owner
  publishes into slots), so the proof reads store through one small
  interface, a variable that only the tests replace, as gnofly's `roles` is
  (`planes/roles.gno`). The tests feed it rows written in golf's format by
  hand (slots, entries, bests of both modes): each kind proven, and refused
  one hole short and one stroke over par; a best only on an archived
  version not counted; **a best that has a `copies` row not counted** (the
  hole short, and the kind refused, though the `bests` row is there); a
  row of another format refusing the mint; a best whose strokes are not
  one to three digits and a space refusing it; a `Writer()` other than the
  expected golf/v2 refusing it. Then a second mint of a kind refused; a
  transfer and an approval of an earned token refused; burn, then mint
  again (the `Burn` wrapper's cleanup: `earned`, `kinds`, `owned` and the
  equipped gnome gone, with `OnBurn` a no-op).
- Against the real rows: `scripts/gnomesproof.ts` (reads only) asks onyx's
  `Proof` for every kind for the players of its boards and compares the
  holes and strokes with golf/v2's `BestOf` on every slot, skipping, as the
  realm does, a best with a `copies` row. It runs before each deploy of
  gnomes.
- Worn and Equip: with no `Equip`, `Worn` is the best owned (a
  Legendary over an Epic over a Rare over a Common over an earned token,
  the lowest id on a tie), and follows a transfer and a burn; `Equip` of a
  token not owned refused; an `Equip` choice wins while owned, is cleared
  by a transfer and a burn, and `Equip("")` goes back to the best; none
  owned answers `"id":""`. `WornMany` with 50 players, junk and repeats. `GnomesOf` with more
  than 100 tokens, paged by offset, `next` right at each page.
- The portrait: drawn from the traits for each tier; a name with markup
  escaped; a code past the realm's tables drawn plain.
- Storage: filetests with `// Storage:` goldens for the genesis published
  with its sale, a first buy, a second buy, a Legendary buy, an earned mint,
  a first equip.

**Client** (`npm test`, `web/test/`): `gnomes.test.ts` for the codec
(every field read back; a code past a table, a colour past the palette and
a short string falling back to the plain form; another format drawing the
Classic), `skinOf` (the nine earned kinds equal to `GNOMES`), the
catalogue held to its rules (`validate` reports nothing), the share texts;
`gnome.test.ts` for the fourteen `GNOMES` drawn exactly as before (a
fingerprint of their meshes) and every gnome of the catalogue within its
tier's budget; `prefs.test.ts` for a token id kept and dropped when no longer
owned; `chain.test.ts` for the new reads' parsing; `adena.test.ts` for the
`send` field, the gnokey lines, and that no gnomes message is ever put in
a `DoContract` with a golf message. The budget test builds every gnome of
the catalogue and holds it to the budget of section 1, including the
width limit (x/z half-extent at most 1.1 times the Classic's `reach`, with
animated pieces at their widest), the height limit, and `reach` unchanged
by animated pieces. `npm run smoke`
gains a buy and an equip against a local chain. The site's country rules
are checked by a test that reads `netlify.toml`: the shop's paths, and only
them, closed for CN, CU, IR, KP, SY, RU and BY.

### 17. Rollout

1. The realm and its tests, on a local gnodev.
2. **Onyx**, deployed closed (`SetMintOpen` false). The owner publishes the
   genesis (`AddSeries`), opens a test sale, buys one
   of each tier (a Legendary included), moves the treasury in its two steps,
   brings the close forward and sees the sale end, mints an earned gnome from a played
   cup, and measures each storage deposit and the heaviest proof's gas; the
   client's numbers take the measured ones.
3. The client on onyx with `NEXT_PUBLIC_GNOMES=1`: a dress rehearsal of the
   whole flow two weeks before mainnet, players testing with faucet GNOT.
4. **Mainnet**, only once its precondition holds: Gnogolf's store and
   golf/v2 are live on mainnet under the same namespace, and the course is
   published there. Today neither exists (`package not found`, "Verified
   facts"), and an `addpkg` of a package that imports a missing realm
   fails. Then the same package, staged (`MAINNET=1 scripts/stage.sh`),
   deployed closed with `-max-deposit 40000000ugnot`, its treasury the
   staged address apart from the owner, its site's URL the site's, and the
   genesis published. The shop's country rules go live with the site. The earned tier works from deploy (it sells nothing) but
   proves nothing until mainnet has slots, and the player window has no
   players until it has records: the sale opens only once the course is
   published there. Until then the shop says "earned gnomes open with the
   course" instead of offering the mint, and the gallery shows every gnome
   as "not yet on sale".
   - The two weeks before: one Legendary shown a day, with its lore; the
     gallery live, nothing for sale.
   - The owner may set the genesis's closing date (`SetCloseAt`), before
     the sale or later, at least 7 days ahead, which the shop shows from
     then on; it can come earlier (7 days ahead still), never later, and is
     never removed. Without one the genesis
     sells until sold out.
   - The genesis's sale (ids 1–720, its seven Legendaries among them)
     opens with `OpenSale("genesis", start, 48)` and `SetMintOpen(true)`.
     Unsold ids stay on sale at the sale's price until sold, or the close.
   - At a closing date, if one is set, the sale ends; whatever is unsold, a
     Legendary included, is never minted.
5. Docs: a `docs/gnomes.md` API page like `docs/golf.md`, the ADR from this
   spec (the realm's worktree drafts it as ADR-007), the README's "Support" line (README.md, lines 61-62) and
   `Tip.tsx`'s "Tips open once GNOT can be sent on mainnet" corrected.

## Built so far vs this spec

Read on 2026-10-06, uncommitted, in two worktrees: the realm in
`.claude/worktrees/nft-gnomes` (`gno.land/r/gnogolf/gnomes/`, with
`adr/adr-007-gnomes.md`), and the designer's catalogue and drawing in
`.claude/worktrees/gnome-designs` (`data/gnomes/`, `data/gnomes.json`,
`scripts/gnomes.ts`, `web/lib/gnomes/`, `web/lib/scene/gnome-*.ts`,
`media/gnomes/`). Both follow the earlier round of decisions (720, series,
versioned traits, 48-hour windows), but were built before the final ones:
the prices 36/72/336/1,296, no auction, the closing date, `Worn`, the
treasury apart, `SetSiteURL` and the portrait (the rows marked **code**
below). Where they differ from this spec or
from each other, each point says which way to settle it: **spec** (the spec
follows the code; done above), **code** (the code follows the spec), or
**open** (a decision for the user).

**Built in the realm:** the catalogue as series (`AddSeries`, rows
`id|tier|name|traits` read by bisection), waves with a player window
(`AddWave`, `hasRecord` on store's `totals`), `SetPrice` per wave (later
replaced: one sale a series, `OpenSale`/`CancelSale`, ADR-013),
`SetMintOpen`, `Buy`, an auction (`StartAuction`, `Bid`, `Settle`,
`CancelAuction`, to be removed), `Sweep`, `Equip`, `Equipped`, `EquippedMany`, the GRC721
surface, `Collection`, `Gnome`, `Sold`, `GnomesOf`, a placeholder
`TokenURI`, and storage goldens. **Not built:** `MintEarned`, `Proof`,
`Burn`, `TokenMetadata`, `TokenOfOwnerByIndex`, `Render`, a portrait drawn
from traits, `SetCloseAt`, `Worn`, `WornMany`, `AcceptTreasury`,
`SetSiteURL`, the staging in `stage.sh`.

**Built by the designer:** the catalogue's data and generator, its rules,
the codec (format 1), `skinOf`, 720 gnomes and the nine earned kinds in
`data/gnomes.json`, `makeBall` drawing every new trait, trails and holing
effects, the Legendaries' moving pieces, 720 thumbnails and seven
turntables. **Not built:** `docs/gnomes/design.md`, which the code cites
throughout; the script that writes the realm's rows.

| point | where | settle |
|---|---|---|
| Ids laid out by world (each world's Commons, Rares, Epics, Legendary in one range), not by tier | `catalogue.ts` `planSeries`, `data/gnomes.json` | spec |
| The catalogue published as series by `AddSeries`, not a table committed with the code; rows `id|tier|name|traits` | `catalogue.gno`, `rows.gno` | spec |
| Traits: format 1 is 29 bytes (series, home, archetype, accent, prop added; a 32-bit accessory mask), not 18; palette 82 colours, not 64 | `codec.ts`, `vocab.ts` | spec |
| An earned token's traits are tier and kind only; the client draws `GNOMES`' own | `skin.ts` `traitsOf`, `skinOf` | spec |
| Legendary `kind` 1–7 in design order (Crystal 1), not by id | `legendaries.json` | spec |
| Rares and Epics richer than the first draft (six patterns, six pieces, Epic props, eight Epic materials); `EARNED_ONLY` adds `mask` and `sash` outright | `vocab.ts`, `validate.ts`, `epics.json` | spec |
| Waves replace `SetOpen` per tier; caps are constants (no `SetCap`); `SetMintOpen` pauses all | `waves.gno`, `config.gno`, `gnomes.gno` | spec; later the waves became one sale a series (`sale.gno`, ADR-013) |
| An auction for the Legendaries (`StartAuction`, `Bid`, `Settle`, `CancelAuction`, `Auction`, escrow in `Sweep`) | `auction.gno`, `gnomes.gno` | code: removed; the Legendaries are sold by `Buy` at 1,296 GNOT, one a wallet (decided) |
| Prices 30/99/333 and a 777 reserve | `config.gno`, `data/gnomes/series.json` | code: 36/72/336/1,296 GNOT (decided) |
| No closing date | `waves.gno` (now `sale.gno`, `close.gno`), `config.gno` | code: `SetCloseAt`, optional (none at deploy), earlier only once set (decided 2026-10-07) |
| `Equipped`/`EquippedMany` answer only an `Equip` choice | `equip.gno` | code: `Worn`/`WornMany`, the best owned unless equipped (decided) |
| No site URL setting; `external_url` a constant | `token.gno` | code: `SetSiteURL` (decided) |
| `Sold` asks the ledger per id instead of a stored bitmap | `read.gno` | spec |
| Thumbnails and the Legendaries' turntables drawn by `makeBall` in headless Chrome and committed (`media/gnomes/`, about 7.5 MB), not a resvg card per gnome | `media/gnomes/render.mjs` | spec, but whether every gnome also needs a 1200×630 card is **open** |
| Particles as instanced draws, not `THREE.Points` | `gnome-fx.ts` | spec |
| The Garden's Legendary is "Windmill King", "a gold crown round its foot" | `data/gnomes/genesis/legendaries.json`, `gnome-legend.ts` comment | code: rename it The Miller, no crown |
| Earned ids start at 1001 in `series.json`; the realm's series take ids following on, so a later series past id 1000 would meet them | `data/gnomes/series.json` `earned.first`; `catalogue.gno` | code: earned from 1,000,001 (above 64 × 1,000), as section 2 says; **open** if the user prefers another scheme |
| No treasury apart from the owner, no `SetTreasury`, no `Renounce` (the ADR says the owner is where the money goes) | `owner.gno`, `adr-007-gnomes.md` | code: a treasury apart from the owner, staged per chain, moved in two steps (`SetTreasury`, `AcceptTreasury`) (decided); `Renounce` as section 4 |
| The realm keeps its own `genesisSupply`; nothing ties it to `series.json`'s `supply` | `config.gno` | code: a test reads both, so the counts are written once |
| A row's tier and the traits' tier byte are both kept; nothing checks they agree on chain | `rows.gno`; `validate.ts` checks the data | code: the rows script checks them before `AddSeries` |
| `TokenURI` is a placeholder (a cone in the tier's colour), the traits opaque | `svg.gno` | code: the portrait drawn on chain from the traits (section 10) (decided); it ties the realm to format 1's tables, and drawing plain what it does not know keeps a later series safe |
| `Gnome()` answers `null`, not a JSON object with `"version":1` | `read.gno` | code |
| `EquippedMany` answers a bare JSON array, without `"version"` | `equip.gno` | code (as `WornMany`) |
| `GnomesOf(owner)` returns the first 100 only, no `offset` or `next` | `read.gno` | code |
| `RoyaltyInfo` returns `(address, int64)` and panics, not royalty/v0's `(address, int64, error)` | `token.gno` | code |
| Token ids taken as `string` and `int64`, not `grc721.TokenID` | `token.gno` | spec (the same over a `MsgCall`); either is fine |
| The realm's comments cite ADR-006; the file is `adr-007-gnomes.md`, and no ADR-006 exists | `catalogue.gno`, `waves.gno` (now `sale.gno`) | code: one number, whichever is free when it lands |
| The designer's budget: 6,000 triangles for Commons and Rares (spec 5,000), 6,500 for Epics (6,000), draws counted in total, not added after `bake` | `validate.ts` `BUDGET` | **open**: measure on a phone before raising the spec's limits |
| `series.json`'s note says the owner "never lowers a price"; the brief re-prices in GNOT if GNOT moves | `data/gnomes/series.json` | code (decided): prices are the owner's to set before a sale opens (between waves, before ADR-013), never lower on what is on sale; the note says that |
| The genesis filetest puts the Legendaries first (ids 1–7) | `z_storage_genesis_filetest.gno` | code (cosmetic): lay it out as the plan does, so the golden matches the real catalogue's size |

## Verified facts

Checked against live chains on 2026-10-06 with `abci_query` (data
base64-encoded), and in the gno sources (the local checkout at master
87f0357, and the tags `chain/onyx` and `chain/mainnet`).

**Chains**

| fact | source |
|---|---|
| `params/bank:p:restricted_denoms` is `[]` on gnoland-1 and on onyx-1: `ugnot` is not restricted, so GNOT moves on mainnet | `abci_query` on https://rpc.gno.land:443 and https://rpc.onyx.testnets.gno.land:443; enforcement in `tm2/pkg/sdk/bank/keeper.go:117-145` (`canSendCoins`) |
| `params/vm:p:storage_price` on mainnet is `"100ugnot"`: 0.1 GNOT a KB | `abci_query`, gnoland-1 |
| gnofly on mainnet: `Minted()` 162; `CollectionJSON()` price 77000000, open true, cap 7, royaltyBps 500, treasury `g1t2kg…sfd`: paid mints work | `vm/qeval` on the planes realm, gnoland-1 |
| `p/nt/grc721/v0`, `royalty/v0`, `enumerable/v0`, `metadata/v0`, `bptree/v0`, `seqid/v0` exist on both chains; their `token.gno` and `tellers.gno` match gno master 87f0357 except for comments | `abci_query` on both chains, compared with the checkout |
| onyx store (`gno.land/r/nym-alexiscolin000/gnogolf/store`): `Size("slots")` 90; `Get("slots","0garden/001")` `("garden/1/v1", true)`; `Size("bests")` 336; `Size("copies")` 0; `Writer()` is `…/gnogolf/golf/v2` | `vm/qeval`, onyx-1; key layout in `golf/v2/data.gno:339` (`slotKey`), `golf/v2/golf.gno:118` (`bestsOf`), `golf/v2/codec.gno:83` (`encodeEntry`, par as field 2) |
| mainnet has no Gnogolf store or golf at that namespace | `vm/qeval gno.land/r/nym-alexiscolin000/gnogolf/store.Size("slots")` on gnoland-1: `package not found`; `netlify.toml:6` names only the onyx deploy |

**gno sources**

| fact | source |
|---|---|
| `Realm.IsUserCall` exists; `IsUserRun` marks a `maketx run` script's ephemeral realm | `chain/runtime/frame.gno:84-105` |
| `NewBanker(OriginSend)` requires `rlm.Previous().IsUserCall()` and cannot be persisted | `chain/banker/banker.gno:117-170` |
| `unsafe.OriginSend` warns to pair it with `IsUserCall` | `chain/runtime/unsafe/unsafe.gno:56-71` |
| grc721 hooks run after the ledger write; a panic in a hook vetoes the movement | `p/nt/grc721/v0/types.gno` |
| `Burn` removes the owner before `OnBurn(tid)` runs, and the hook gets only the id | `p/nt/grc721/v0/token.gno`, `PrivateLedger.Burn` |
| `CallerTeller` is confined to its home realm | `guardHome`, `p/nt/grc721/v0/tellers.gno` |
| `NewToken(name, symbol, seqid.ID, rlm)`; `MaxSymbolLen` is 11 | `p/nt/grc721/v0/token.gno` |
| `royalty.NewRoyalty(ledger, maxBps)`; `RoyaltyInfo` returns `(address, int64, error)` | `p/nt/grc721/royalty/v0` |
| enumerable keeps one `allTokens` slice plus four avl trees (`allIndex`, `owned`, `ownedIndex`, `owner`) | `p/nt/grc721/enumerable/v0/types.gno` |
| gnoweb keeps only `data:image/svg+xml` data URIs | `gno.land/pkg/gnoweb/markdown/ext_imgvalidator.go:16-34` |
| `MsgCall` arguments convert through `BaseOf`, so `grc721.TokenID` arguments work | `gno.land/pkg/sdk/vm/convert.go:32` |
| query limits: `maxGasQuery` 3e9, `maxAllocQuery` 1.5e9 | `gno.land/pkg/sdk/vm/keeper.go:50-52` |
| `SetOriginSend`, `IssueCoins`, `NewCodeRealm`, `SkipHeights` exist; `SkipHeights` advances 5 s a block and resets the rest of the context; `SetOriginSend` does not credit the realm | `gnovm/tests/stdlibs/testing/context_testing.gno:72, 105-110` (same on `chain/onyx`) |
| no GRC721 market realm in the gno examples | grep for `grc721` under `examples/gno.land/r`: nothing |

**This repo**

| fact | source |
|---|---|
| golf/v2 keeps a resent record as a best and marks it in `copies`, never ranked; `Claim` and the finish path skip such bests | `gno.land/r/gnogolf/golf/v2/golf.gno:188-192`, `:1093`, `:1159` |
| `bestOf` writes `"<strokes> <height> <period> <shots>"`, no format prefix | `golf/v2/golf.gno:120-125` |
| store's writer can move to new rules | `store.gno`, `Propose` and `Ready` |
| `store.Page`'s limit is 1 to 300; `store.Has` exists | `gno.land/r/gnogolf/store/store.gno:27-33, 330, 364-415` |
| `makeBall`, `makeGhost`, `rivalSkin`; `reach` is the x/z half-extent; a helmet's brim defaults to `C.woodDark` | `web/lib/scene/gnome.ts` (`makeBall`, line 252 and 382) |
| `UNLOCKS`, `CLASSIC`, `cupTotals` | `web/lib/card.ts:198-264` |
| `engine.ts` calls `makeBall(gnomeById(…))` at lines 110 and 1553; its snapshot is "drawn and read in the same task" | `web/lib/engine.ts:110, 1516-1528, 1553` |
| `offWalls` pushes the drawn gnome off a wall by `reach - d` | `web/lib/engine/replay.ts:905-925` |
| the renderer has no `preserveDrawingBuffer` and uses `alpha: true` | `web/lib/scene/camera.ts:37` |
| `DROP_MS` is 320; `CLIP.tail` is 1800 | `web/lib/engine/clip.ts:29`, `web/lib/clip.ts:27` |
| `send` puts every message in one `DoContract`; the `Call` type's `send` field is unused; `CLAIM_GAS` cites 70.2M with 3 bests | `web/lib/adena.ts:33-36, 414-433, 451-456` |
| ADR-003's cards are made by headless Chrome and committed, with no image library | `adr/adr-003-sharing.md`, "The images" |
| the README's Support line and `Tip.tsx`'s text are out of date | `README.md:61-62`, `web/components/Tip.tsx:36-37` |

Physics, GG1 and the TinyGo wasm are untouched by this design; nothing was
found there.

## Rejected review points

None. Every point of the review is applied above. The one that concerned
the auction (Legendaries frozen after `Renounce`) is moot since the
auction was dropped: a Legendary is on sale with its series, like any id,
until the close.

## Out of scope

- A market of our own (a v2 wrapper like gnofly's, for Bazaar's shapes).
- Any random sale, pack or mystery box, and any auction.
- Gifts to buyers (a "Founding Gnome" or the like).
- Any effect on play, scoring, the ranking or the duels' rules.
- More of a published series: its supply is final. More gnomes come as a
  new series of the same realm (section 2), never as more of an old one,
  and never as a discount on what is on sale.
- A fungible token, airdrops or perks promised to holders.
- Off-chain metadata or images, an indexer, a server of any kind.
- Dynamic cards per score or per sale (ADR-003 rejected them for the same
  reason: they need a server).
- Owning holes as tokens ("build a hole, own it forever"), which is its own
  design.
- Fiat payment.
