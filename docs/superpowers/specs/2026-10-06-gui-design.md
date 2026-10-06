# Gnomes and the Builder: the GUI

## Status

Proposed, 2026-10-06; revised the same day after review (simpler screens,
alignment and readability, share moments, scrolling, the player's
collection, no Builder on a phone). The screens of two features of the
second wave, as the player sees and uses them: **A**, the collectible
gnomes; **B**, the no-code hole Builder. Nothing here is built.

The mechanics are other specs'; this one draws them:

- `docs/superpowers/specs/2026-10-06-nft-gnomes-design.md`: the realm
  `r/gnogolf/gnomes`, traits, equip, sharing, the client files it touches.
- `docs/superpowers/specs/2026-10-06-hole-builder-design.md`: the palette,
  the validation layers, `builder.wasm`, proofs, `PublishMine`.
- `docs/superpowers/research/2026-10-06-nft-best-practices.md`: launch,
  presentation, trust and marketing practice for the gnomes.

The mockups are in `docs/superpowers/mockups/` ("Mockups", at the end).

### Decisions taken by the owner

- **Prices** follow the research brief as defaults: Common 30, Rare 99,
  Epic 333 GNOT; a Legendary is auctioned from a 777 GNOT reserve. The owner
  sets them between waves, never during one, never lower for gnomes already
  offered. The GUI hard-codes none of them: every figure is read.
- **Waves** open by id range, one world a wave. Each wave's first window is
  reserved to wallets with a record in `store`, with per-wave caps in it
  (Common 3, Rare 2, Epic 1).
- **The Legendary auction**: 48 hours; a bid in the last 10 minutes moves
  the end 10 minutes on; each bid beats the last by max(5%, 5 GNOT); no
  discount ever (an unsold Legendary comes back at the same reserve).
- **The genesis sale closes for good** at `closesAt` (in `CollectionJSON`;
  the owner can only move it earlier). Gnomes not sold by then are never
  made. The screens say it calmly, as a date, never as a countdown.
- **GNOT transfers are live on mainnet** since 2026-09-12 (the README's
  note is outdated): no "mainnet can't send yet" state.
- **No Builder on a phone.** On a phone, a touch screen or under 900 px,
  `/build` loads neither the editor nor `builder.wasm`: one screen says the
  Builder is for a computer, offers a link to open it there, and lists
  holes to play (playing stays on the phone).

The realm as written today (720 genesis gnomes, one `SetMintOpen`, a
lifetime cap of 5, fixed prices 10/40/120/400, no auction, no waves, no
`closesAt`) does not have these yet: "Data the screens need" lists what it
must expose.

## Principles

What makes these screens the game's, and easy. Each is already a rule of
the game's code or a rule this review added; every screen keeps all of them.

1. **The game's own controls, one of each** (`components/ui.tsx`):
   `Button`, `Segmented`, `Toggle`, `InfoTip`, `Sheet`, `Dialog`; the front
   screens' look (`app/title.css`): a world's tint, the halftone, the inked
   frame, inked display headings, paper panels, gold for the call to action.
2. **One title, one primary action per screen and per state.** A state
   shows only what changed: a note above the same panel, a button's words,
   never a new layout. What is not needed to choose, buy, bid, equip, build,
   test or publish is cut, or waits behind a tap (a `<details>` disclosure,
   `.more`: a dashed link that opens in place).
3. **Nothing said twice on a screen.** A fact lives in one panel: the
   price in the buy panel, the closing date in the gallery's head and in the
   trust strip under a buy button, never both on one screen.
4. **What signs is blue.** `--chain` (`.btn--save`'s Adena blue) is the one
   action that puts something on the chain: buy, bid, wear (equip), publish.
   Gold stays the game's call to action (Play, Race, Choose this gnome,
   Share my team).
5. **What only shows is flat** (`--info-edge`, no drop); **what presses has
   its drop** (`--shadow-btn`).
6. **The bill before the signature**: each cost on a line, the total
   ("At most"), the approximate fiat figure when a rate is known.
7. **Short copy in the game's voice**: a few words, a colon for cause and
   effect, "he"/"she" as the catalogue says. Never "NFT", "mint", "token",
   "floor", "invest", "value", "limited", "don't miss", "last chance".
8. **Honest social proof, no pressure.** Counts that are true and go up
   ("58 of 101 found a player · 41 players"); dates, not countdowns; no
   "3 people are looking", no fake scarcity, no timer that the chain does
   not hold.
9. **Nothing interrupts play.** No pop-up or prompt about gnomes during a
   hole or after a bad shot.
10. **Data, not code.** Tiers, prices, waves, worlds, pieces, climates come
    from the realm, the catalogue and the palette.

### Layout and alignment

- **One spacing scale** (`--sp-1` to `--sp-7`: 4, 8, 12, 16, 24, 32, 48 px):
  every gap, padding and margin is one of them.
- **One grid per screen**: sibling cards share their edges, their rows
  their height (a card's last row is pinned to its foot: names, chips and
  buttons sit on one line across a row); labels left, values right on one
  baseline (the bill, the bids, the limits); a field and its button one
  height in a row.
- **Numbers are tabular** (`font-variant-numeric: tabular-nums`): prices,
  counts, clocks, gauges line up.
- **Long names and numbers** ellipsize on one line (a card's name, a
  player's address) or wrap (a sentence); they never push a layout.

### Readability

- Body text is 15 px at least on a phone (labels in caps, chips and tags
  aside); lines stay under about 70 characters.
- Contrast is WCAG AA at least everywhere, AAA for small text on the
  Legendary's night. The soft ink moves from the game's `#4f7a6c` (4.48:1 on
  the paper, under AA) to `#44705f` (5.0:1): the game's token should follow.
  The network banner's words are ink on gold (its green on gold was 3.7:1).
- No text over the 3D without a paper scrim (the hole's share card, the
  test mode's panels).

### Scrolling, never overflow

- The page never scrolls sideways at any width from 320 px.
- Only lists, grids and the board scroll, in their own container, with
  `overscroll-behavior: contain` (no chaining, no rubber band showing the
  canvas behind).
- A sheet scrolls inside itself; its head and its primary action stay
  pinned (`.sheet__foot`, sticky); the page under it is locked
  (`html:has(.sheet) { overflow: hidden }`). On a phone it rises from the
  foot, full width, clear of the home bar (`env(safe-area-inset-bottom)`).
- The 3D canvas never takes the page's scroll, and the page never scrolls
  the canvas (`touch-action: none` on the canvas and the board).
- Safe-area insets are respected (`viewport-fit=cover`, padding from
  `env(safe-area-inset-*)`).
- No layout shift while data loads: blank cards and rows hold their places
  (`.skel`), counts and owners fill in place.
- The gallery pages its grid (48 cards a page, "Show more", the next page
  read and drawn while the player scrolls near the end); thumbnails are 256
  px, lazy, decoded off the main thread: 720 cards stay smooth on a phone.
- Under 900 px the network banner is the page's last row, not a layer over
  it, and on a scrolling front screen at every width: it never covers an
  action.

`shoot.mjs` checks all of this on every state of every screen at 320, 390,
768 and 1280 px (see "Mockups") and fails on the first breach.

## Information architecture

```
Title ─ Modes ─┬─ Solo ─ Cups ─┬─ Picker (shelf: yours · earned · everyone's) ─ Hole
               │               ├─ "Gnomes →" ─────────────┐
               │               └─ Community holes          │
               ├─ Duel ─ Rival ─ Ghosts ─ Picker ─ Hole     │
               └─ Builder ─┬─ computer: Your holes · Community · Editor ─ Test ─ Publish
                           └─ phone: "For a computer" + holes to play
   /g/   the gallery ─┬─ /g/<id>/  a gnome's page ─ Buy (sheet) ─ Show your gnome (share)
                      └─ /g/<id>/  a Legendary's page = his auction ─ Share the auction
   My gnomes (the player's) · Their gnomes (anyone's, read-only) ─ Share my team
```

| Route | What | Built as |
|---|---|---|
| `/g/` | the gallery | a static page with its own `og:` tags, opening the game on the screen `gnomes` (`app/h/[slot]/page.tsx`'s pattern) |
| `/g/<id>/` | a gnome's page; a Legendary's is his auction | `app/g/[id]/page.tsx`, one per catalogue row, with its 1200×630 card |
| `/g/<kind>/` | an earned gnome's page | the same route |
| `/g/@<address>/` | a player's gnomes (theirs, read-only; the player's own when it is them) | the screen `team`, its address in the link (no static page: an address is not known at build) |
| `/build/` | the Builder | `app/build/page.tsx` behind `NEXT_PUBLIC_BUILDER`; its code and `builder.wasm` loaded only on a computer (below) |

**Entry points, and only these:**

| Where | What |
|---|---|
| Cups screen, the links row | "Gnomes →" (while a wave is open: "Gnomes · Wave 1 →") |
| The picker's shelf | "Yours · 12 · See all →" (My gnomes), "+ More gnomes" (the gallery) |
| A rival's ghost, its tag | the rival's gnome's page, in a sheet, between shots |
| A board row, a friend, a ghost's tag | their gnomes (read-only) |
| The finish card, after a personal best only | "Try another gnome on it" on the share card |
| Modes | the Builder panel loses "Coming soon" |

The title screen does not change.

## Shared pieces

### The tiers

One colour and one shape each, so a tier reads in grey, never `--chain`'s
blue: Common stone and a disc, Rare sea blue and a diamond, Epic amethyst
and a gem, Legendary gold and a crown. The tile's frame adds a rim per tier
(none, a second rim, a thick rim with facets, a gold rim on a sunburst with
a slow shine, still under reduced motion). The list and order of tiers come
from `CollectionJSON().tiers`; an unknown tier gets the plain frame.

### A gnome's card

`.gcard`, a button: the tile, the name and `#id`, then one row: the tier
chip and one fact (the price; the player who has him; "Yours"; "Never
made"). Taken cards keep their colour (a gnome with a player is not a gap);
never-made ones are a dashed outline, the gnome faded to a drawing.

### The closing date

`.closes`, a flat note with a calendar: "Sale closes for good on **Sun 14
Dec, 18:00 UTC**. Unsold gnomes are never made." In the gallery's head;
under a buy button it is a line of the trust strip instead. A date, in UTC
and the player's own time on hover and for screen readers, never a
countdown; on the last day it reads "today, 18:00 UTC".

### The trust strip

Under a buy button only, four short facts: "This exact gnome: no random
draw · Cosmetic only · Sale closes for good on … Unsold gnomes are never
made. · The contract ↗". Where the money goes is said once, in the buy
sheet's consent line ("straight to the game's account").

### The bill

Labels left, amounts right on one baseline; "At most" and the total under a
dashed rule; "≈ $N at today's rate" under it when a rate is known, else
nothing. In the short state the balance replaces the rate.

### The wallet path

The save's own, unchanged: `connect`/`onOurNode` (`lib/adena.ts`), the
network warning, `GnokeyTx` in a disclosure ("Buy with gnokey instead"),
read-back until the chain shows the result. Each transaction is sent alone
(nft spec §11).

| State | What shows (only what changed) |
|---|---|
| not connected | "Connect Adena, the gno.land wallet, to buy." · Connect Adena |
| no Adena | "Buying takes a gno.land wallet." · Install Adena ↗, gnokey open |
| no Adena, phone | "Adena lives on a computer. The link keeps Tansy for you there." · Send the link to my computer |
| wrong network | note: "Adena is on another network. Pick **gnoland-1** in Adena: nothing was sent." · Check again |
| short | the bill with the balance; note "**213.33 GNOT** to go." · Get GNOT ↗ |
| signing | the tile hopping, "Sign in Adena…" (no close) |
| reading back | "Reading it back from the chain…" |
| cancelled | note "Cancelled in Adena: nothing was sent." over the bill |
| unsure | note "Sent, but not confirmed yet. **Don't buy again**: it would pay twice." · Check again |

## A. The gnomes

### A1. The gallery

`gnomes-gallery.html`: open, teaser, players, soldout, closed, loading,
empty, error; phone.

- **Head**: the pill "The gnomes", "Who's on the ball?", the closing date.
- **Now**, one row: the wave ("Wave 1 · Garden", "58 of 101 found a player ·
  41 players", the putting green mown to it) and the Legendary's auction
  (his tile, "Top bid 1,240 GNOT · ends Sat 18:00 UTC", gold "Bid").
- **Filters**, sticky: "On sale · Mine · All 720", the tier chips with
  their counts, "More filters" (hat, beard, extras, trail, world) behind a
  tap, a search; on a phone one "Filters" button opens a bottom sheet.
- **The grid** of cards, paged (above).
- **Foot**: "How the gnomes work" behind a tap (what you get, cosmetic,
  for adults, not an investment).

| State | Only what changes |
|---|---|
| teaser | the wave: "Opens Thu 9 Oct, 18:00 UTC"; the auction's place: "Legendary 2 of 7 · One revealed a day · the next tomorrow, 18:00 UTC", the revealed ones on their sunburst, the next in silhouette, "See them" |
| players' window, no record | the wave panel's note: "Save one round on-chain to buy now, or come back Thursday. Play a hole →" |
| wave sold out | "All 101 found a player", the green full |
| closed | head without the date; one panel: "Closed on Sun 14 Dec, 18:00 UTC · 486 made · 234 never made", one bar (made mown, never made hatched), "By tier" behind a tap; filters "Made · Mine · All 720"; never-made cards dashed |
| loading | blank cards in place |
| empty | "No gnome like that one" · Clear the filters |
| error | "The chain did not answer" · Try again |

### A2. A gnome's page

`gnome-detail.html`: open, nowallet, locked, cap, mine, taken, later,
nevermade; phone.

Two columns on one centre line: the turntable (drag or arrow keys; ‹ › to
the previous and next of the gallery's list), then the facts: tier chip,
`#id · Wave`, the name, one line about him, the buy panel, "His traits"
behind a tap. On a phone: one column, the tile at 300 px.

The buy panel: the price big and "+ ≈ 0.3 GNOT deposit", one blue "Buy
Tansy", the trust strip. States change only the button or add one note:

| State | The panel |
|---|---|
| no wallet | + "With Adena, or a gnokey command: the next step has both." |
| players' window | button off: "Players first until Thu 18:00 UTC"; note "Save one round on-chain to buy now. Play a hole →" |
| window cap | button off: "3 of 3 Commons this wave"; note "Your share until Thu 18:00 UTC. Then open to everyone." |
| yours | "Yours since 4 Oct"; gold "Play with him"; "Your ghost wears him. Show him off" |
| taken | "Plays with **nym-gnorman**"; gold "Race nym-gnorman's ghost" |
| later wave | "from Wave 2 · Island"; "♡ Keep him on my list"; "A wave not open by Sun 14 Dec, 18:00 UTC never opens." |
| never made | the tile faded and dashed; "**Never made.** The sale closed before he found a player."; "See the gnomes that were made" |

### A3. Buying

`gnome-buy.html`: a sheet over the gnome's page. Its head (his tile, "Buy
Tansy"), the bill, one line of consent ("Buy sends the GNOT now, straight
to the game's account, and he's yours at once: no 14-day return. For
adults."), gnokey behind a tap, and the pinned blue "Buy in Adena · 333.33
GNOT". States: the wallet path's.

**Success** is a moment: the tile pops in, "Tansy's yours!", gold "Play with
him" and "Show your gnome" (the share moment, A8). Wearing him on the
ghost is the picker's (A5), not another button here.

**Taken in the same block**: "Someone took Tansy a moment before you.
**Nothing was sent.**" · Pick another.

### A4. A Legendary's auction

`gnome-auction.html`: live, outbid, leading, extended, ended, won, nobid,
upcoming; phone.

The one dark front (the night, `#2b2550`; paper and `#e2dcff` on it, AAA).
The Legendary on his sunburst; the name in gold; one panel: the top bid and
who, the end as a date on the right ("Sat 18:00 UTC / Ends Sat 11 Oct"),
the bid field and the blue "Bid 1,302 GNOT" on one row, one line "At least
1,302. Outbid? Your GNOT comes straight back."; "The bids · 3" and "How the
auction works" (48 h, the increment, the 10-minute rule, the reserve, the
contract) behind taps. Under the panel: "Share the auction →" (A8).

| State | Only what changes |
|---|---|
| outbid | note "**Outbid.** Your 1,240 GNOT is back in your Adena." above the form |
| leading | "You lead with"; note "You lead. Nothing to do until it ends." instead of the form |
| extended | the date in red: "Ends 18:10 UTC · Moved 10 min by a late bid" |
| ended | "Hand him over to nym-zxxma042" (anyone can; one signature ends it) |
| won | "Your winning bid"; gold "Play with him"; "Show him off →" |
| nobid | "Nobody bid the reserve", note "He comes back in the last wave, at the same reserve." |
| upcoming | "Opening bid 777 GNOT", "Fri 10 Oct · Opens 18:00 UTC", "♡ Remind me" |

`Auction` is polled every 30 s while the page is visible, and at once on
focus; a new top bid fades in.

### A5. The picker's shelf

`gnome-locker.html`: mine, many, nowallet, locked; phone.

The game's picker keeps its stage, arrows, aim row and "Choose this gnome".
Its dots become a shelf of faces in three groups: **Yours** first, set apart
in a gold well, each face with its tier mark ("Yours · 12 · See all →" when
there are more than the shelf shows: Legendary first, then by tier); then
**Earned** (locked ones grey); then **Everyone's**; then "+ More gnomes".
Under an owned gnome's name: one pill, "Your ghost wears **The Pirate** ·
Wear Tansy instead" (Equip, alone), followed by the share moment "Your
rivals will see him". On a phone the shelf scrolls sideways.

### A6. My gnomes, their gnomes

`collection.html`: many (31, paged by 12), few, one, empty, theirs; phone.

- **Head**: the pill "My gnomes", "Your team of 31", the tier counts as
  chips, the one action: gold "Share my team" (A8).
- **The shelf**: large cards, Legendary first, then Epic, Rare, Common, then
  by number. Each: the tile on its tier's stage (the Legendary on his
  sunburst), for a Rare or better a "Trail" / "His holing" chip on the tile
  that plays it in place; the name, the tier chip; one action: blue "Wear
  him", or for the worn one a gold "On your ball" sticker and "Your ghost
  wears him".
- **Many**: "Show 12 more · 12 of 31", the next page read from
  `GnomesOf(addr, from)`; two columns on a phone, nothing wider than the
  screen.
- **One**: his tile large beside his name and one line; "Share him".
- **Empty**: "None yet. You play with the free five and the gnomes you
  earn on the course." · "See the gallery" (a ghost button: an invitation,
  not a push).
- **Theirs** (from a board row, a friend, a ghost's tag): the pill "Their
  gnomes", "nym-itsok123's team", the same shelf with no Wear and no prices,
  "Worn" on theirs, each `#id` to its page; the one action: "Race their
  ghost".

### A7. Where the collection shows in play

`gnome-places.html`: the cups' link; a rival's ghost wearing their gnome
(meshes only), its tag a tap away between shots; the finish card's "Try
another gnome on it" after a personal best only; the boards, where a face
is the player's gnome, a Legendary adds his name in gold, and a row opens
their gnomes.

### A8. Share moments and share cards

At no server cost: the cards are drawn by the page or prebuilt at build
time; the share uses the system share sheet on a phone, copy, X and Bluesky
on a computer (`Share.tsx`).

**The moments** (`share.html`), one sheet each: what happened as the title,
the card as it will look in a post, the words (short, about the game, never
value), one row of actions: on a computer "Copy the link" first, X,
Bluesky, the picture to download; on a phone "Share…" first (the system
sheet takes the picture, the words and the link), copy beside it.

| Moment | From | Card | Words |
|---|---|---|---|
| Show your gnome | after a buy | the gnome's | "I just adopted Tansy, gnome #94 of Gnogolf. He rolls for me now" |
| Your rivals will see him | after Wear | the gnome's | "My gnome for the boards: Tansy of the Garden. Race his ghost" |
| Share the auction | a Legendary's page, bidding | the auction's | "I'm bidding on the Windmill King, one of seven. Ends Sat 18:00 UTC" |
| Show him off | an auction won | the auction's | "The Windmill King is mine: one of seven Legendary gnomes of Gnogolf" |
| Share my team | My gnomes | the team's, made in the browser | "My Gnogolf team: 31 gnomes, the Windmill King up front. Race their ghosts" |
| Dare them with your ghost | a hole published, then holed by its author | the hole's | "I built Mole Run, par 5. Beat my 4: race my ghost, free, no wallet" |
| What a shot | a hole finished (`NEXT_PUBLIC_CLIPS`) | the clip, the gnome in it | "Tansy sank Down the Tunnel in one…" |

**The cards** (`share-card.html`), 1200×630 and 1080×1080:

- *A gnome* (prebuilt for every `/g/<id>/`): his tile on his tier's stage
  left, the tier chip, his name inked, his line, the game's word and his
  address; the square stacks the same.
- *The auction*: the night, the Legendary on his sunburst, "Auction ends
  Sat 11 Oct, 18:00 UTC", the top bid.
- *The reveal* (the teaser, one Legendary a day): the next one in
  silhouette, "Legendary 3 of 7", "One Legendary revealed a day. Tomorrow,
  18:00 UTC.", seven dots, two lit.
- *A team*: "nym-twee's team", the six best tiles, "+25", the counts.
- *A hole*: its picture full bleed, the author's ghost on it, a paper
  scrim with "Beat my 4 on Mole Run", "a hole by nym-twee · par 5", "Race
  my ghost · free, no wallet".

The gnome cards are prebuilt (nft spec §12); the team, hole and moment
cards are drawn in the page on a canvas from the same tiles and handed to
the share sheet. The reveal is honest: a Legendary's art ships with the
site only on his day (the daily build adds it), so no one finds him early in
the bundle.

### A9. The sale's life

| Phase | Gallery's "now" row | A gnome's page |
|---|---|---|
| Teaser | "Opens <date>", the Legendary a day | price, "♡ Keep him on my list" |
| Players' window | the wave, gold "Players first" tag | buy, or the window's reason |
| Open to all | the wave, counting up · the auction | buy |
| A wave sold out | "All 101 found a player" | taken |
| Paused | "Paused for a moment: the sale picks up where it stopped." | button off with that line |
| Closed (`closesAt` passed) | made vs never made | yours, taken, or never made |

## B. The Builder

### B0. Where it runs

On a computer (900 px and up, a fine pointer): the editor. On a phone, a
touch screen or under 900 px: B6, and nothing of the editor is loaded.
`app/build/page.tsx` decides before importing anything
(`matchMedia("(max-width: 899px), (pointer: coarse)")`); the editor's
components and `builder.wasm` are `next/dynamic` imports reached only on
the computer's path. A test (`web/test/builder-phone.test.ts`) renders the
page with a phone's media and asserts that no request names
`builder.wasm` or the editor's chunks; the smoke run checks the same at
390 px.

### B1. One header, three steps

Every computer screen of the Builder has the same header: Back (the draft is
saved), the hole's name in place with its address and world under it, the
three steps in the middle, and on the right the history (in Edit) and the
one primary action of the mode.

| Step | Shows | Unlocked when | Primary action |
|---|---|---|---|
| 1 · Edit | current (ink, the gold number) | always | gold "Test it"; off, with its reason ("Fix 2 first"), while an error stands |
| 2 · Test | open, current, done (✓) or locked (🔒, "Fix the errors first") | no error | none while playing ("Back to edit"); blue "Publish →" once every weather is holed |
| 3 · Publish | locked ("Hole it in every weather first") until proved | every proof in hand for the current geometry | the form's own "Publish in Adena" |

A step that is done or open is a link back to it; a locked one says why on
hover and to a screen reader. Moving a piece drops the proofs: Test and
Publish lock again, said once in the checks ("Moved: test it again").

Widths: 1024, 1280 and 1440 px are checked; under 1180 px the steps keep
their numbers and only the current one its word, and the less needed
gauges and keys fold away. Never under 900 px (B6).

### B2. The editor

`builder-editor.html`: select, empty, place, invalid, issues, timed, proved;
at 1440, 1280 and 1024.

The window never scrolls. Three columns under the header:

- **The palette** (left, 208 px; 224 from 1400 px): the world's name on an
  ink strip edged in its colour, then its pieces by kind: Start (tee, cup),
  Walls, Posts, Ground, Moving, Jumps. Each a tile with the board's own
  drawing and its name (what it does in its tooltip). It scrolls in itself.
  Only what the palette has can be placed (the hole-builder spec's palette
  lock).
- **The board** (centre): the hole from above on its snapping grid, the
  units along two edges. The wheel and the pinch zoom it, a drag on empty
  space pans it, never the page. Its foot: the keys always in sight as
  keycaps (Undo, Redo, Turn, Copy, Delete; Ctrl on Windows and Linux, ⌘ on a
  Mac), "Snap 0.5" and zoom.
- **The right** (300 px; 340 from 1400): the 3D preview, rebuilt from the
  canonical hole as the board changes ("3D · in sync"), then the inspector
  of the selected piece only: its name and place, label · slider · value
  rows on one grid with each range written under it ("0.6 to 1.6"), timing,
  a timed piece's cycle strip, and Turn · Copy · Delete with their keys.
  Nothing selected: "Select a piece to change it, or drag one in from the
  left."
- **The checks**, docked under the board: one row with the verdict ("Ready
  to test", "2 to fix", "Holed in every weather") and the limits as small
  gauges (walls /160, posts /32, zones /32, points /512, size /32 KB, gas
  room), green, amber from 80%, red at the limit; above it, when anything
  is wrong, the list (errors first, then warnings), each line naming its
  piece in bold, a click selecting it, and a one-click fix where one is
  obvious ("Move the cup", "Make it 1.5 deep", "Delete it"); the list
  scrolls in itself.

**Placing**: a piece dragged from the palette is a ghost under the cursor,
snapped to the grid, with guide lines to its row and column and a label: in
green its name and place ("Mushroom · 24, 9.5"); in red the one-line reason
("Too close to the cup", "Off the lane", "The cup must stay clear") and a
not-allowed cursor: letting go there drops nothing. Moving clamps to the
last valid place; a handle stops at the range's end (a radius at 1.6, a
loop's depth at 1.5) and the measure label says the limit.

**Empty**: a new hole opens on the empty grid with one card: "A new hole ·
Garden / Start from a template", the world's three templates as cards with
their maps (straight par 2, dogleg par 3, the world's signature piece), and
"or a blank board: drag a tee and a cup in". The verdict says "Place a tee
and a cup"; Test is locked.

### B3. Test

`builder-test.html`: playing, proved, missed; at 1440 and 1024.

The game takes everything under the header: the play area is the window's.
Over it, top left the strokes card, top centre one strip: the weathers to
beat as chips (☀ Clear ✓ 3 · ≋ Wind ✓ 4 · ☂ Rain, now) and "Par –" until all
are holed, then the suggested par ("Par 5"). A chip ticks when its round is
holed and replayed by the chain's code; a round that does not count turns
its chip red and says why once, under the strip ("That rain round doesn't
count: one shot could run out of room. Play it again, a softer line."). The
game's own hint at the foot. The header's action: "Back to edit", then
"Publish →" once proved.

### B4. Publish

`builder-publish.html`: form, refused, newer, closed, pending, done; at 1440
and 1024.

Two columns under the header: the hole as players will see it (the 3D, its
card in the community list); the form, a panel that scrolls in itself with
its action pinned at its foot:

- **Name** (40) with its counter; **Address** `nym-twee/mole-run/v1`, shown
  and fixed ("Fixed at the test": the weather comes from it; the slug is
  chosen in Edit, before the first test); **A line for players** (140).
- **The cost before any signature**: storage deposit, network fee, "At most
  1.20 GNOT", "The chain's price for keeping and checking the hole. Nothing
  goes to the game."
- "Publish with gnokey instead" behind a tap.
- Pinned: the blue "Publish in Adena · 1.20 GNOT".

Only what changes: a refused name turns its field red with one line ("Looks
like a web address. Try "St. Andrews"."), the button off; a newer version
elsewhere ("This one would be v3, with new weather: test it again.") makes
the action gold "Test again (free)"; closed: "Publishing isn't open on
gno.land yet. Your draft is kept." and "Back to edit"; signing: "Check the
window Adena opened, and sign there."

**Done**: "Mole Run is on gno.land!", the hole's share card, "Play it for
real: your best becomes the ghost your friends race.", gold "Play it for
real" and "Share the dare" (A8; the dare carries the author's ghost once
their best is saved).

### B5. Your holes, the community's

`builder-holes.html`: mine, community, empty; phone.

A front screen, "Yours · Community", "+ New hole" (gold, computer only).
Cards on one grid: the map, the name (one line), one line of facts ("Garden ·
par 5 · 23 players", "by nym-pebble77 · Mountain · par 4"), one button
("Play", "Race the author" with "✓ Holed by its author" beside it when the
chain says so, "Open" for a draft) and "Edit" as a link on the player's own.
Empty: "No hole of yours yet" · Draw a hole.

### B6. On a phone

`builder-phone.html`: both, community.

"The Builder · For a computer", "Drawing a hole takes a mouse and a
keyboard. Playing them works right here.", the primary "Copy the link for
my computer", then "Your holes" and "Community holes" as rows to Play or
Race, "More community holes". Nothing to edit, nothing of the editor
downloaded.

## Data the screens need

Shapes are JSON from `qeval`, parsed in `lib/chain.ts` alone. Amounts in
ugnot, times in Unix seconds, ids as numbers. Every read is bounded.

### From `r/gnogolf/gnomes`

| Read | The fields the GUI uses | Screens |
|---|---|---|
| `CollectionJSON()` | `open, paused, closesAt, closed, denom, tiers:[{name, price, minted, supply}], waves:[{n, world, first, last, opens, playersUntil, caps, sold, size}], players` (distinct owners), `made, neverMade` (once closed) | gallery's head, now row, closed state, A9 |
| `GnomesJSON(from, count)` | `{id, tier, name, price, owner, wave}` a page, `next` | gallery grid |
| `GnomeJSON(id)` | one row, `since`; `null` if unknown | gnome page |
| `Sold()` | the bitmap | gallery's taken and never-made marks |
| `GnomesOf(addr, from)` | the wallet's ids, a page, `next` | picker shelf, My/Their gnomes |
| `TeamJSON(addr)` | `{total, byTier:{…}, equipped}` | My/Their gnomes' head, the team card |
| `CanBuy(addr, id)` | `{ok, reason, left:{common, rare, epic}}` (`closed, paused, later, players-only, wave-cap, cap, taken`) | the buy panel's disabled states |
| `AuctionJSON()` | `{id, reserve, top, bidder, end, minNext, started, settled}` | auction, gallery |
| `BidsJSON(id, from, count)` | `[{bidder, amount, at}]`, latest first | "The bids" |
| `Equipped(addr)`, `EquippedMany(addrs)` | the worn id or `""` | picker, boards, ghosts, My gnomes |
| `Params()` | increment, extension, duration, window, caps | the sentences, never hard-coded |

Writes, each alone: `Mint(id)` (`send` = the price), `Bid(id)`,
`Settle(id)`, `Equip(tid)`, `MintEarned(kind)`. Their refusals map to the
sentences above; `closesAt` passed refuses `Mint` and `Bid` with "The sale
closed on Sun 14 Dec, 18:00 UTC. Nothing was sent."

`closesAt` can only move earlier (`SetClosesAt` refuses a later time); the
gallery re-reads it on focus, and a change shows as the new date, nothing
louder. An auction already running when the sale closes runs to its end.

### From the catalogue (`data/gnomes.txt`, built into `lib/gnomes.ts`)

Per row: `id, tier, name, traits, world, line`; for a Legendary `lore`,
`holing`, `revealAt`; built: the 256 px thumbnail, the 1200×630 card,
per-world trait counts, trait labels.

### From the Builder's wasm and the golf realm

As the hole-builder spec lists them, and for B5/B6 a bounded
`CommunityJSON(from, count, order)` (`{id, alias, author, name, par, world,
players, holedByAuthor}`) and `MineJSON(addr)`.

## Components

| File | New or changed | Reuses |
|---|---|---|
| `web/components/Gnomes.tsx` (new) | `Gallery`, `GnomePage`, `BuySheet`, `Auction`, `Team` (mine and theirs), `GnomeCard`, `TierChip`, `TrustStrip`, `Closes`, `Bill` | `FrontScreen`, `Button`, `Segmented`, `Sheet`, `Share`, `GnokeyTx` |
| `web/components/ShareMoment.tsx` (new) | the share sheet and the in-page cards (team, hole, moments) | `Share`, the `snapshot` path |
| `web/components/Golf.tsx` | the picker's shelf, the wear pill, the ghost's tag, the finish card's try-on | |
| `web/components/Worlds.tsx`, `Leaderboard.tsx`, `Modes.tsx`, `About.tsx` | the cups' link; faces, the Legendary pill, a row's "their gnomes"; the Builder panel; "How the gnomes work" | |
| `web/components/builder/*` | the hole-builder spec's files, plus `Header.tsx` (the three steps and the mode's action), `Checks.tsx` (the docked verdict, gauges and issues with their fixes), the board's placement ghost, `Holes.tsx`, `PhoneBuilder.tsx` | `Segmented`, `Sheet`, the engine and HUD for the test |
| `web/app/globals.css`, `title.css` | tiers, `.gcard`, `.closes`, `.trust`, `.bill`, `.more`, `.sheet__foot`, the spacing scale, `--ink-soft`, `.tint--shop`, `.tint--legend` | |
| `web/app/g/…`, `web/app/build/page.tsx` | static pages; the phone/computer split | `app/h/[slot]/page.tsx` |

The mockups' `kit.css` mirrors the game's tokens under the same names and
marks each new piece NEW: the reference, not code to copy.

## Accessibility

- Every sheet is `Sheet` (focus in, Tab trapped, Escape, focus back); its
  pinned foot is in the tab order last.
- Cards are buttons with full labels ("Tansy of the Garden, number 94, Epic,
  333 GNOT"; "…, never made"). Tiers are said in words; shapes repeat them.
- Disclosures are native `<details>`; clocks `role="timer"`,
  `aria-live="off"`; notes after an action `role="status"`, errors
  `role="alert"`.
- The turntable is `role="img"` and turns with the arrow keys; the board's
  pieces are focusable, named and moved with the keys (hole-builder spec).
- Targets 44 px on touch; reduced motion stops the spin, the shine, the
  confetti and the hop.

## Mobile

Gallery: two columns, filters in a bottom sheet. A gnome's page and the
auction: one column. Sheets rise from the foot, their action pinned. The
picker's shelf and My gnomes: two columns or a sideways shelf. The Builder:
B6 only.

## Evolvability

A new wave, series, world, tier or piece is data (realm rows, the catalogue,
the palette): the screens list what they read. Copy lives in the components
that use it; refusals map in one table per feature.

## What this revision removed

- From every screen: the long explanatory sentences (kept, shorter, behind
  "How it works" taps), the second and third buttons of a state, duplicated
  facts between panels.
- Gallery: the lead sentence, the "Next wave" panel, the later waves' cards,
  the "shown" line above the grid, trait chips (now "More filters"), the
  sort, the footer's trust strip and adults line (now one tap).
- A gnome's page: the view switch (turning, on the green, as a ghost), the
  trait cards with counts (now "His traits"), "Nobody plays him yet", the
  share row and the ♡ on an open gnome, the adults line (now in the buy
  sheet's consent), the pinned phone bar.
- Buying: the two-step list, the balance and the subtitles of every bill
  line, the trust strip in the sheet (it is on the page under), the
  "Connected as" line, the three look-alikes after a lost race, "Wear him"
  on success.
- The auction: the lore, the line, the view switch, the visible bid
  history and rules (now taps), the trust strip, two of the three trust
  facts.
- The picker: the `#id` and the long ghost sentence.
- The editor: the kind filters (the palette is grouped by kind instead),
  the one-word role under each piece (now its tooltip), the draft subtitle,
  the world as five buttons (now one menu), the size and keys pills (now
  keycaps on the board), the gauges' panel and storm warning (now small
  gauges docked under the board), the disabled Publish with its sticker (the
  header's three steps now say what is locked, and why).
- Test mode: the explanatory paragraph, the moving-hole note, the camera
  button, the proof panel (now chips over the play area).
- Publishing: the separate checks step (checks run on their own), the
  wizard's sheet (Publish is now a step of the header), the cost paragraph.
- The holes: the community's order switch, its footer, the per-card notes,
  "Dare a friend" on each card.
- The touch editor mockup: replaced by B6.

## Open questions

1. The realm's shape: waves, the players' window, `closesAt`, the auction,
   prices 30/99/333 and the reads above are not in the realm as written.
2. A lifetime cap beside the window's per-wave caps?
3. A fiat rate without a server: without one, the line is left out.
4. "He", "she" or "they" per gnome: the catalogue's word.

## Mockups

`docs/superpowers/mockups/`: static HTML on the game's font and tokens
(`kit.css`, `builder.css`, `kit.js`, `builder.js`), the gnomes' art the
picker's 14 renders standing in for the catalogue's, the in-play images
captured from the running game. Each page lists its states at its top
(`?state=`). `node docs/superpowers/mockups/shoot.mjs` takes the
screenshots into `screens/`, writes `index.html`, and audits every state at
320, 390, 768 and 1280 px (sideways scroll, anything off the screen,
overlapping controls, phone body text under 15 px, contrast under AA, or
AAA on the night), exiting non-zero on any finding; it uses the repo's
headless Chrome (`media/lib/cdp.mjs`), no new dependency.

| Screen | Page | States |
|---|---|---|
| A1 the gallery | `gnomes-gallery.html` | open, teaser, players, soldout, closed, loading, empty, error · phone |
| A2 a gnome's page | `gnome-detail.html` | open, nowallet, locked, cap, mine, taken, later, nevermade · phone |
| A3 buying | `gnome-buy.html` | confirm, connect, nowallet, elsewhere, network, short, pending, reading, success, taken, cancelled, unsure · phone |
| A4 the auction | `gnome-auction.html` | live, outbid, leading, extended, ended, won, nobid, upcoming · phone |
| A5 the picker's shelf | `gnome-locker.html` | mine, many, nowallet, locked · phone |
| A6 my gnomes, theirs | `collection.html` | many, few, one, empty, theirs · phone |
| A7 where it shows | `gnome-places.html` | one |
| A8 share moments | `share.html` | bought, equipped, bidding, won, team, published, clip · phone |
| A8 share cards | `share-card.html` | gnome, square, auction, reveal, team, hole |
| B2 the editor (B1 its header) | `builder-editor.html` | select, empty, place, invalid, issues, timed, proved · 1280, 1024 |
| B3 test | `builder-test.html` | playing, proved, missed · 1024 |
| B4 publish | `builder-publish.html` | form, refused, newer, closed, pending, done · 1024 |
| B5 the holes | `builder-holes.html` | mine, community, empty · phone |
| B6 the Builder on a phone | `builder-phone.html` | both, community |
