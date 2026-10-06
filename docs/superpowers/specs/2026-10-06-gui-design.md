# Gnomes and the Builder: the GUI

## Status

Proposed, 2026-10-06, revised through the day's reviews. The screens of two
features of the second wave as the player sees them: **A**, the collectible
gnomes; **B**, the no-code hole Builder. Nothing here is built.

The mechanics are other documents'; this one draws them:

- `docs/superpowers/specs/2026-10-06-nft-gnomes-design.md` and the realm
  `r/gnogolf/gnomes` (worktree `nft-gnomes`): what is sold and how.
- `docs/superpowers/specs/2026-10-06-hole-builder-design.md`: the Builder.
- `docs/superpowers/research/2026-10-06-nft-best-practices.md`: launch and
  presentation practice.
- `docs/superpowers/legal/draft-shop-copy.md` (with `draft-terms-ja-en.md`,
  `draft-tokushoho.md`): the shop's legal words, used verbatim here. Drafts
  for a lawyer's review; their `[ ]` placeholders stay placeholders.

The mockups are in `docs/superpowers/mockups/` ("Mockups", at the end).

### Decisions taken by the owner

- **Every tier is a fixed price, Legendaries included; there are no
  auctions.** Defaults: Common 30, Rare 99, Epic 333, Legendary 777 GNOT,
  owner-settable between waves, never discounted once on sale. The first
  buyer of a gnome has him. All are bought the same way (`Buy(ids)`).
- **Waves** open by id range, one world each: wave 1 the Garden (ids 1 to
  104: Commons 1-72, Rares 73-93, Epics 94-103, the Legendary The Miller
  104), wave 2 the Island (105 to 208), and on. A wave's first window is
  for wallets with a record in `store`.
- **Caps per wallet**: in a players' window, 3 Commons, 2 Rares, 1 Epic a
  wave; for life, 10, 5, 2, and **one Legendary**.
- **The genesis sale closes for good** at its closing date (it can only move
  earlier); unsold gnomes are never made.
- **Wearing is free.** Everyone sees a player's best gnome by default; a
  player plays any of theirs at once, in their browser; showing another one
  to everyone is an optional transaction (`Equip`).
- **No Builder on a phone**; the Builder offers the four classic worlds only.
- **Geography**: the shop is not offered in mainland China and the
  comprehensively sanctioned countries (Netlify, best effort); the EU and the
  UK are served.
- **Simplicity**: the fewest new elements; the game's own sheets and controls;
  one primary action a screen; a section of an existing screen rather than a
  new screen; never remove or enlarge any existing game UI.

## Principles

1. **The game's own controls and sheets** (`components/ui.tsx`: `Button`,
   `Segmented`, `Sheet`, `Dialog`; `Share.tsx`'s row). A new element only
   where none of these does it.
2. **One title, one primary action a state.** A state shows only what
   changed. What is not needed to choose, buy, show, build, test or publish
   is cut, or waits behind a tap (a `<details>` disclosure).
3. **Nothing said twice on a screen.**
4. **What signs is blue** (`--chain`): buy, show a gnome to everyone,
   publish. Gold stays the game's call to action (Play, Race, Choose this
   gnome). Playing a gnome yourself is free and never blue.
5. **What only shows is flat; what presses has its drop.**
6. **The terms before the signature**: the order reviewed term by term, the
   consents ticked by hand, the order button named as an order.
7. **Short copy in the game's voice**; never "NFT", "mint", "invest",
   "floor", "returns", "value", "will go up", "early = cheaper", "last
   chance", "only N left" (legal pack §5).
8. **Honest social proof, no pressure**: counts that go up per wave ("58 of
   104 found a player · 41 players"), dates not countdowns, no fake timers.
9. **Nothing interrupts play**, and **nothing of today's game is removed or
   resized**: the collection is one extra line or one compact section where
   needed.
10. **Data, not code**: tiers, prices, waves, worlds, pieces from the realm,
    the catalogue and the palette.

### Layout, readability, scrolling, windows

- One spacing scale (4 to 48 px); one grid per screen; sibling cards share
  their edges and rows their height; labels and values on one baseline;
  tabular numbers; long names ellipsize or wrap, never push.
- Body text 15 px or more on a phone; contrast AA at least (the soft ink
  moves from `#4f7a6c`, 4.48:1, to `#44705f`, 5.0:1; the network banner's
  words ink on gold); no text on the 3D without a paper scrim.
- The page never scrolls sideways from 320 px; only lists, grids and the
  board scroll, in their own containers (`overscroll-behavior: contain`); a
  sheet scrolls inside itself, its action pinned (`.sheet__foot`), the page
  behind it locked; the canvas never takes the page's scroll; safe areas
  respected; blank cards hold their places while data loads; the gallery
  pages its grid (48 a page).
- **Windows as the game's**: centred at a capped width (on a phone too, with
  the game's 20 px round), the head centred, rows and the action full width,
  fine print centred, an outcome centred whole.

`shoot.mjs` checks these on every state at 320, 390, 768 and 1280 px (the
Builder's computer screens at 1024, 1280 and 1440).

## Information architecture

```
Title ─ Modes ─┬─ Solo ─ Cups ─┬─ Picker (+ the Yours row) ─ Hole
               │               ├─ "Gnomes →" ─ the gallery ─┬─ a gnome (sheet): see, review, sign, receipt
               │               │                           └─ Mine (a view of the gallery)
               │               └─ Players (the boards) ─ a row ─ their gnomes (sheet)
               ├─ Duel ─ … ─ a rival's ghost, its tag ─ that gnome (sheet)
               └─ Builder (computer) / its phone screen
```

| Route | What |
|---|---|
| `/g/` | the game opened on the gallery (a static page for its link card) |
| `/g/<id>/` | the game opened on the gallery with that gnome's sheet open; one static page per catalogue row with its 1200×630 card |
| `/g/*` in a region where the shop is not offered | `region.html`, static (A7) |
| `/build/` | the Builder (B) |

**The only new screen is the gallery.** A gnome is a `Sheet` over it; "My
gnomes" is its Mine view; another player's gnomes a small `Sheet` over the
boards; sharing is the game's `Share` row where the moment happens.

**Entry points, one line each**: the cups' links row ("Gnomes →"); the
picker's Yours row ("+25" to Mine); a ghost's tag; a board row. The title,
the finish card, its clip and the HUD do not change.

## Shared pieces

- **Tiers**: one colour and one shape each (Common stone and a disc, Rare sea
  and a diamond, Epic amethyst and a gem, Legendary gold and a crown, on a
  sunburst with a slow shine); an unknown tier the plain frame.
- **A gnome's card** (`.gcard`, a button): the tile, the name and `#id`, the
  tier chip and one fact (the price, his player, "Yours", "You play",
  "Everyone sees", "Never made").
- **The closing line** (gallery head only): "Sale closes for good on **Sun 13
  Dec, 18:00 UTC**. Unsold gnomes are never made."
- **The trust strip** (under a buy button only, legal pack §4): "Cosmetic
  only: same ball, same physics · You pick the exact gnome; nothing is random
  · Sale closes for good on … Unsold gnomes are never made. · The contract ↗".
- **The legal links** (the gallery's foot and the order review): "Terms of
  Sale · Seller information (特定商取引法に基づく表記) · Privacy".
- **The wallet path**: the save's own (`connect`, the network check, the
  `GnokeyTx` disclosure, read-back until the chain shows the result); each
  transaction sent alone.

## A. The gnomes

### A1. The gallery

`gnomes-gallery.html`: open, mine, mineempty, teaser, players, soldout,
closed, loading, empty, error; phone.

A front screen (the cups' look): the pill "The gnomes", "Who's on the ball?",
the closing line; one row "now": the wave ("Wave 1 · Garden · 58 of 104 found
a player · 41 players", its green) and the wave's Legendary ("The Miller ·
Legendary · 777 GNOT · one of one, one per wallet", "See him"); the filters
(`Segmented` "On sale · Mine · All 720", tier chips, "More filters" behind a
tap, a search; one "Filters" button on a phone); the grid, paged; the legal
links and "How the gnomes work" behind a tap.

| State | Only what changes |
|---|---|
| mine | "Mine" on; the row "now" becomes who sees what ("Everyone sees **The Miller** · You play **Tansy** · Show Tansy to everyone · ≈ 0.01 GNOT") and the game's Share row "Share my team"; the cards are the player's, the best first, marked "You play" / "Everyone sees" |
| mineempty | "None yet. You play with the free five and the gnomes you earn on the course." · See the gnomes on sale |
| teaser | the wave "Opens Tue 6 Oct, 18:00 UTC"; "Today's Legendary: The Miller · A spotlight a day on one of the seven · all are in the gallery" (no secret: the catalogue is public on chain from `AddSeries`) |
| players | "Players first · until Thu 18:00 UTC", "Save one round on-chain to buy now, or come back Thursday. Play a hole →" |
| soldout | "All 104 found a player", the green full |
| closed | "Closed on Sun 13 Dec, 18:00 UTC · 486 made · 234 never made", one bar, "By tier" behind a tap; never-made cards dashed |
| loading / empty / error | blank cards in place / "No gnome like that one" · Clear the filters / "The chain did not answer" · Try again |
| paused | "Paused for a moment: buying picks up where it stopped. The players' window and the closing date keep running." |

### A2. A gnome: one sheet

`gnome-sheet.html`, the game's `Sheet` over the gallery, all its states.

**Him**: the turntable tile (drag or arrow keys), tier chip, `#id · Wave ·
World`, the name inked, one line, the price ("333 GNOT + ≈ 0.46 GNOT deposit
and fee"), the trust strip, "His traits" behind a tap; pinned, the blue "Buy
Tansy · 333 GNOT". A Legendary is the same with his note: "One of one. At
most one Legendary per wallet; the first to buy him has him." States change
the button or add one note: locked (players' window), cap, mine ("Play with
him"), taken ("Race nym-gnorman's ghost"), later ("♡ Keep him on my list"),
never made.

**The order review** (legal pack §1, the 最終確認画面), in the same sheet,
before the wallet opens: "Review your order"; the terms, label and value
on one grid: Item, Price, Other costs ("Storage deposit about 0.31 GNOT
(held by the chain, returned if you burn the gnome) + network fee about 0.15
GNOT. Neither is paid to us."), Total (and the approximate fiat with its
time and source), Payment, Delivery, Sale period (UTC and JST),
Cancellation ("**No returns, cancellations or refunds once the transaction
is final**, except where the law requires them."), Nature ("Cosmetic only.
No gameplay advantage. Not an investment."), **Seller** (name, address,
e-mail, from the site's build settings); the legal links; **two boxes,
unticked, each its own**: A, "I am 18 or older, and I accept the Terms of
Sale. I understand a gnome is a cosmetic item, not an investment, and that
it may lose all resale value."; B, "I want my gnome delivered now, before
the 14-day withdrawal period ends, and I understand that I therefore **lose
my right of withdrawal** once it is delivered."; gnokey behind a tap; pinned,
the blue **"Order with obligation to pay (333.46 GNOT): sign in wallet"**,
off until both boxes are ticked, and under it "Your wallet will open and ask
you to sign. Signing is your order. It cannot be undone."

**The gnokey line**, from the realm's `Buy(ids)` and `lib/adena.ts`
(`gnokeyCall`'s shape, with `-send` added): `gnokey maketx call -pkgpath
gno.land/r/<ns>/gnogolf/gnomes -func Buy -args 94 -send 333000000ugnot
-gas-fee <feeFor(gas)>ugnot -gas-wanted <gas> -broadcast -chainid <chain>
-remote <rpc> <your-key-name>`. The gas is the measured buy's
(`z_storage_buy_filetest.gno`) with the margin the save uses; the fee is
`feeFor` (gas × price × 1.5). A new helper, `gnokeyBuy`, writes it.

**After**: the wallet path's states (connect, no Adena, a phone, network,
short, signing, reading back, cancelled, unsure); **success**: the tile,
"Tansy's yours!", the game's Share row "Show your gnome", "Your receipt:
print or save it", pinned gold "Play with him"; **the receipt** (legal pack
§3): seller, date and time (UTC and JST), item and contract, price paid and
costs, delivered to, transaction and explorer link, the terms' version, the
consents as ticked, the finality line; "Print or save as PDF". **Someone
was first**: "Someone bought Tansy a moment before you. **Nothing was
sent.**" · Pick another.

### A3. The picker, plus one row

`gnome-locker.html`: mine, shown, free, many, none; phone.

The game's picker exactly as today. Added for a player who owns gnomes, the
aim card's width between the tile and the aim card: the **Yours** row, its
line "Everyone sees **The Miller**" (and, when you play one of yours that
others don't see, "Show Tansy instead · ≈ 0.01 GNOT"), its faces (the best
first, a tier dot each, the one you play ringed), a tap playing him free and
at once, "+25" to the Mine view. The faces scroll inside the row; the screen
keeps today's scrolling (it fits a tall window, scrolls as a whole on a short
one). No gnome of yours: today's picker.

### A4. Their gnomes

`theirs.html`: a small `Sheet` over the boards (a row tapped; or a friend; or
a ghost's tag): "Their gnomes · 6", the name, the one they show on his tile,
"They show **The Miller**", the others as faces, the one action "Race their
ghost". Read-only, no prices.

### A5. Where the gnomes show in play

`gnome-places.html`, on the game's own screens captured untouched: the cups'
links row gains "Gnomes →"; a rival's ghost wears the gnome its player shows,
a small tag a tap away between shots; on the boards a Legendary's player has
a small gold pill after their name, and a row opens their gnomes. The finish
card, its clip (wearing the gnome you play), its share and save rows, the
HUD, the title and the menu stay as they are.

### A6. Share cards

`share-card.html`, made at build time for every gnome (`/g/<id>/`) and in the
page for the rest, at no server cost: a gnome (1200×630 and 1080×1080), the
day's Legendary spotlight, a team, a hole's ghost dare. They are the picture
the game's `Share` row sends, with short words about the game ("I just
adopted Tansy, gnome #94 of Gnogolf."), never about value.

### A7. Not in your region

`region.html`, the static page Netlify serves for `/g/*` where the shop is
not offered: the free Classic, "The gnomes", "Not in your region", "The gnome
shop is not offered in your region. The game stays free to play: every hole,
every cup, and the gnomes you earn by playing.", gold "Play Gnogolf". In the
game there, the client reads `/geo.json` once when the shop would open and
leaves the shop out: no "Gnomes →", no buy or show actions, no gnome sheets;
ghosts and boards still show the gnomes others show. Best effort (a VPN
passes; the realm stays callable with gnokey).

### A8. The sale's life

| Phase | The gallery's row "now" |
|---|---|
| Teaser | "Opens <date>"; today's Legendary spotlight |
| Players' window | the wave with "Players first" |
| Open | the wave counting up; the wave's Legendary at his price |
| Wave sold out | "All 104 found a player" |
| Paused | buying off; the players' window and the closing date keep running |
| Closed | made vs never made |

An unsold Legendary stays on sale at his price until the close; at the
close, like every unsold gnome, he is never made.

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
saved), the hole's name in place with its address under it, in Edit the
world's menu ("Garden ▾"), the three steps in the middle, and on the right
the history (in Edit) and the one primary action of the mode.

**The worlds**: the Builder offers the four classic worlds only, Garden,
Island, Mushroom Town and Mountain, each with its colour in the menu (state
`world`). The Crystal Mines are not a Builder world: their set pieces and
lighting are built by hand, so they have no palette, no starters, no menu
entry (the game still plays the mines course as before). Opening a mines
hole in the editor, from a link or "Edit" in Your holes, is refused before
anything loads, in one sentence on the holes list: "The Crystal Mines are
built by hand: this hole can't be opened in the Builder."

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

`builder-editor.html`: select, empty, place, invalid, issues, timed, proved,
world;
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
real" and "Share the dare" (A6; the dare carries the author's ghost once
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

From the realm `r/gnogolf/gnomes` as written (worktree `nft-gnomes`), JSON
from `qeval`, parsed in `lib/chain.ts` alone; amounts in ugnot, times in Unix
seconds, ids as decimal strings.

| Read | Fields the GUI uses | Screens |
|---|---|---|
| `Collection()` | `open`, `closesAt` (0: none set), `tiers[{name, price, cap, playerCap, sold}]` (`price`: the next wave's), `series[{name, first, last, sold, closed}]`, `waves[{first, last, start, playersUntil, prices}]`, `site` | the gallery's head, row "now", filters, closed state, A8 |
| `Gnome(tid)` | `id, series, name, tier, traits, owner, price, sold, closed`; none: `{"id":""}` | the gnome sheet |
| `Sold()` | the bitmap (bit id-1) | the grid's taken and never-made marks |
| `GnomesOf(owner, offset)` | `total, next, rows[{id, tier, traits}]` (100 a page) | Mine, the picker's row, their gnomes |
| `Worn(player)` | the shown gnome (`id, name, tier, traits, equipped`): the equipped one if still owned, else the best owned; `""` for none | who sees what, ghosts, boards |
| `WornMany(players)` | `rows[…]`, 50 players a read | the boards' faces and pills |
| `CloseAt()`, `MintOpen()` | the date; paused or not | head, paused state |
| `Proof(kind, player)` | `ok, minted, missing, …` | earned gnomes |

Writes, each alone: `Buy(ids)` (1 to 5 ids, `-send` exactly their prices),
`Equip(tid)` (optional, to show another gnome), `MintEarned(kind)` (free),
`Burn(tid)`. Refusals the GUI maps to sentences:

| The realm says | The GUI says |
|---|---|
| `gnomes: the sale is closed` | "Paused for a moment: buying picks up where it stopped. Nothing was sent." |
| `gnomes: this gnome is already sold` | "Someone bought Tansy a moment before you. **Nothing was sent.**" |
| `gnomes: players only until …: finish a hole first` | "Players first until Thu 8 Oct, 18:00 UTC: save one round on-chain to buy now." |
| `gnomes: the player window takes K <tier> a wallet` | "3 of 3 Commons this wave, until Thu 8 Oct, 18:00 UTC. Nothing was sent." |
| `gnomes: the cap is K <tier> a wallet` | "One wallet keeps at most K <tier>s (one Legendary). Nothing was sent." |
| `gnomes: wrong payment, send exactly <n>ugnot` | "The price changed while this page was open: it is now N GNOT. Nothing was sent." (the review refreshes) |
| `gnomes: the genesis sale closed on <date>` | "The sale closed on Sun 13 Dec, 18:00 UTC. Nothing was sent." |
| `gnomes: gnome N is not on sale yet` | "On sale from Wave 2." |
| `gnomes: not your gnome` (Equip) | "Tansy is not in this wallet any more." |

**Required of the realm by the owner's decisions** (not in it as written):
remove the auction whole (`StartAuction`, `Bid`, `Settle`, `CancelAuction`,
`Auction()`, the escrow, the soft close, the pause freeze, its events, its
Render and metadata parts, `Sweep` if only for bids); sell a Legendary
through `Buy` at his tier's price with a lifetime cap of one; keep his price
never lower than the one he was first offered at. The catalogue's names (The
Miller, The Admiral, …) and `spotlightAt` (marketing only) come from
`data/gnomes.txt`.

The Builder's data is the hole-builder spec's (`builder.wasm`, `PublishMine`,
`Publishing`, `Versions`, `Current`, `Bests`), plus a bounded community list.

## Components

| File | New or changed | Reuses |
|---|---|---|
| `web/components/Gnomes.tsx` (new) | `Gallery` (with its Mine view), `GnomeSheet` (him, the review, the receipt), `TheirGnomes`, `GnomeCard`, `TierChip`, `TrustStrip`, `Closes`, `Review` | `FrontScreen`, `Button`, `Segmented`, `Sheet`, `Share`, `GnokeyTx` |
| `web/components/Golf.tsx` | the picker's Yours row; the ghost's tag | |
| `web/components/Worlds.tsx`, `Leaderboard.tsx` | "Gnomes →"; the Legendary pill; a row opens their gnomes | |
| `web/lib/adena.ts` | `buyGnomes` (a call with `send`), `equip`, `gnokeyBuy` | `calls`, `feeFor`, `gnokeyOn` |
| `web/lib/gnomes.ts` | the catalogue, trait labels, `bestOf` (the default shown gnome, as `Worn`) | |
| `web/app/g/…` | the static pages; `/geo.json` read once | `app/h/[slot]/page.tsx` |
| `web/components/builder/*` | the Builder (section B) | |

## Accessibility

Every window is a `Sheet` (focus in, Tab trapped, Escape, focus back; its
pinned foot last in the tab order). Cards are buttons with full labels; tiers
said in words, shapes repeat them; disclosures are `<details>`; the consents
are real checkboxes, unticked, the order button `disabled` with its reason;
the turntable `role="img"` and turned by the arrow keys; 44 px targets on
touch; reduced motion stops the spin, the shine and the hop.

## Mobile

The gallery in two columns, its filters in one button; the gnome sheet a
centred window, its action pinned; the picker's row scrolling sideways; the
Builder's one phone screen.

## Evolvability

A new wave, series, world, tier or piece is data (realm rows, the catalogue,
the palette). Copy lives where it is used; the realm's refusals map in one
table per feature.

## What the reviews removed

- **The auction, whole**: its screen and states, the bid confirmation, the
  auction share card and moments, the dark auction panel, its data and
  refusals.
- **Pages folded into the game's own**: the gnome page and the buy sheet are
  one `Sheet` over the gallery; My gnomes is the gallery's Mine view; their
  gnomes a small sheet; the share moments the game's Share row where they
  happen.
- **From every screen**: long sentences (now behind taps), second and third
  buttons, facts said twice.
- **From the picker**: everything I had added but the one Yours row; the aim
  card back as it was.
- **From where the gnomes show**: the recreated screens, replaced by the
  game's own, untouched, each with its one addition; the finish card's
  try-on (the finish card stays as it is).
- **The phone editor** (the Builder on a phone is one screen of holes to
  play) and **the Crystal Mines** as a Builder world.

## Open questions

1. The realm still has the auction and refuses a Legendary in `Buy`: the
   realm agent removes and changes them (above).
2. The legal pack's `[ ]` placeholders (the seller's name and address, the
   terms' version, the rate source) and its open questions (a durable medium
   for the receipt).
3. The measured gas of a `Buy`, for the gnokey line and the fee shown.

## Mockups

`docs/superpowers/mockups/`: static HTML on the game's font and tokens
(`kit.css`, `builder.css`, `kit.js`, `builder.js`), the gnomes' art the
picker's 14 renders standing in for the catalogue's, the game's own screens
captured from it. Each page lists its states at its top (`?state=`).
`node docs/superpowers/mockups/shoot.mjs` takes the screenshots, writes
`index.html`, and audits every state (sideways scroll, anything off the
screen, overlapping controls, phone body text under 15 px, contrast),
exiting non-zero on any finding; it uses the repo's headless Chrome
(`media/lib/cdp.mjs`).

| Screen | Page | States |
|---|---|---|
| A1 the gallery and Mine | `gnomes-gallery.html` | open, mine, mineempty, teaser, players, soldout, closed, loading, empty, error · phone |
| A2 a gnome, one sheet | `gnome-sheet.html` | open, legendary, locked, cap, mine, taken, later, nevermade, review, ticked, connect, nowallet, elsewhere, network, short, pending, reading, success, receipt, sniped, cancelled, unsure · phone |
| A3 the picker + Yours | `gnome-locker.html` | mine, shown, free, many, none · phone |
| A4 their gnomes | `theirs.html` | one · phone |
| A5 where it shows | `gnome-places.html` | the game's screens, one addition each |
| A6 share cards | `share-card.html` | gnome, square, spotlight, team, hole |
| A7 not in your region | `region.html` | one · phone |
| B2 the editor (B1 its header) | `builder-editor.html` | select, empty, place, invalid, issues, timed, proved, world · 1280, 1024 |
| B3 test | `builder-test.html` | playing, proved, missed · 1024 |
| B4 publish | `builder-publish.html` | form, refused, newer, closed, pending, done · 1024 |
| B5 the holes | `builder-holes.html` | mine, community, empty · phone |
| B6 the Builder on a phone | `builder-phone.html` | both, community |
