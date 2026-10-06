# Gnomes and the Builder: the GUI

## Status

Proposed, 2026-10-06. The screens of two features of the second wave, as the
player sees and uses them: **A**, the collectible gnomes (the shop, a
gnome's page, buying, the Legendary auctions, the picker, where the
collection shows in play); **B**, the no-code hole Builder (the editor, test
mode, publishing, the holes' lists). Nothing here is built.

The mechanics are other specs'; this one draws them:

- `docs/superpowers/specs/2026-10-06-nft-gnomes-design.md`: the realm
  `r/gnogolf/gnomes`, traits, equip, sharing, the client files it touches.
- `docs/superpowers/specs/2026-10-06-hole-builder-design.md`: the palette,
  the four validation layers, `builder.wasm`, proofs, `PublishMine`.
- `docs/superpowers/research/2026-10-06-nft-best-practices.md`: launch,
  presentation and trust practice for the gnomes.

The static mockups are in `docs/superpowers/mockups/` (see "Mockups"), each
state a `?state=` of its page, their screenshots in
`docs/superpowers/mockups/screens/`.

### Decisions taken by the owner

- **Prices** follow the research brief as defaults: Common 30, Rare 99,
  Epic 333 GNOT; a Legendary is auctioned from a 777 GNOT reserve. The owner
  sets them between waves, never during one, and never lower for gnomes
  already offered. The GUI hard-codes none of them: every figure is read.
- **Waves**: the sale opens by id range, one world a wave. Each wave's
  first window (48 h in the brief) is reserved to wallets with a record in
  `store`, with per-wave caps in that window (Common 3, Rare 2, Epic 1).
- **Legendary auction**: 48 hours, a bid in the last 10 minutes moves the
  end to 10 minutes after it, each bid beats the last by max(5%, 5 GNOT),
  never a discount (an unsold Legendary returns at the same reserve).
- **GNOT transfers are live on mainnet** since 2026-09-12: the README's
  note saying otherwise is outdated, and the GUI has no "mainnet can't
  send yet" state for the gnomes (`Tip.tsx`'s own note goes too).

These touch the contract; the realm must make them settings, not
constants. The realm as written today (720 genesis gnomes, one
`SetMintOpen`, a lifetime cap of 5, fixed prices 10/40/120/400, no
auction, no waves) does not have them yet: "Data the screens need" lists
what it must expose.

## Principles

What makes these screens the game's and not a web3 template's. Each is
already a rule of the code; the new screens keep it.

1. **The game's own controls, one of each** (`components/ui.tsx`):
   `Button`, `Segmented`, `Toggle`, `InfoTip`, `Sheet`, `Dialog`. A new
   screen adds no second button or second sheet.
2. **The front screens' look** (`app/title.css`): a world's tint under the
   halftone, the inked frame, display headings inked paper on their drop,
   the ink eyebrow pill, the gold call to action, paper panels.
3. **What signs is blue.** `--chain` (Adena's blue, `.btn--save`) is "the
   one action that puts a round on the chain". Buying, bidding, publishing
   and equipping are that action and wear it; nothing else does. Gold stays
   the game's call to action (Play, Race, Choose this gnome).
4. **What only shows is flat** (`--info-edge`, no drop); **what presses
   has its drop** (`--shadow-btn`). A price, a gauge, a trait never look
   pressable.
5. **The bill before the signature.** Every transaction shows, before its
   button, each line the wallet will take (price, deposit, fee) and the
   total ("At most"), the balance, and a fiat figure marked approximate.
6. **One sentence of copy per state**, in the game's voice: short, warm,
   literal, a colon to join cause and consequence, the gnomes as "he" or
   "she" by the catalogue's word (the realm's names do not carry it: "he"
   in these mockups until the catalogue says). Never "NFT", "mint",
   "token", "floor", "rare drop", "invest", "value", "limited",
   "don't miss". "Buy", "gnome", "yours", "plays with".
7. **Nothing interrupts play.** No pop-up, toast or prompt about gnomes
   during a hole, after a bad shot, or between holes. The collection shows
   in play only as the gnomes themselves (yours, your rival's ghost).
8. **Data, not code.** Tiers, prices, waves, series, worlds, pieces and
   climates come from the realm, the catalogue and the palette. A new wave,
   series, world or piece appears without a UI change.

## Information architecture

```
Title ─ Modes ─┬─ Solo ─ Cups ─┬─ Picker (the shelf: yours · earned · everyone's) ─ Hole
               │               ├─ "Gnomes →" ──────────────┐
               │               └─ Community holes (flag)   │
               ├─ Duel ─ Rival ─ Ghosts ─ Picker ─ Hole    │
               └─ Builder (desktop) ─┬─ Your holes         │
                                     ├─ The community's    │
                                     └─ Editor ─ Test ─ Publish
                                                           │
   /g/  The gnomes (shop) ─┬─ /g/<id>/  a gnome's page ─ Buy (sheet)
                           └─ /g/<id>/  a Legendary's page = its auction
```

| Route | What | Built as |
|---|---|---|
| `/` | the game, as today | |
| `/g/` | the gnomes: the shop's gallery | a static page with its own `og:` tags; renders `Game` opened on the screen `gnomes` (the pattern of `app/h/[slot]/page.tsx`) |
| `/g/<id>/` | a gnome's page (a Legendary's: its auction) | `app/g/[id]/page.tsx`, one per catalogue row, `generateStaticParams` from `data/gnomes.txt` |
| `/g/<kind>/` | an earned gnome's page | the same route, the nine earned kinds |
| `/build/` | the Builder: your holes, then the editor | `app/build/page.tsx`, behind `NEXT_PUBLIC_BUILDER`, its code loaded only there (`next/dynamic`) |
| `/?hole=<addr>/<slug>/v<n>` | a community hole, played | as today (`holeLink`), `&by=` a dare |

The gnome's and the gallery's static pages exist for link cards and search;
on the client they open the game on the matching screen, as `/h/` does for a
hole. Inside the game the gallery is a front screen like the cups
(`FrontScreen`), reached from the cups' links row and from the picker's
shelf, with Back returning where the player came from.

**Entry points, and only these:**

| Where | What | Why it is enough |
|---|---|---|
| Cups screen, the links row beside "Badges" and "All players" | `Gnomes →` (`Gnomes · Wave 2 →` while a wave is open) | a plain link where the player already looks for extras |
| The picker's shelf, its end | `+ More gnomes` | the one moment the player chooses a look |
| A rival's ghost, its tag | the rival's gnome's name → its page, in a sheet over the hole | the strongest ad is a gnome seen in play (brief §4) |
| The finish card, after a personal best | "Try another gnome on it" in the share | only on the share, only after a best |
| A board row | the face is the player's gnome; a Legendary's name pill | the boards are already the shop window |
| Modes | the Builder panel loses "Coming soon" | the Builder's one door |

The **title screen does not change**: no gnome sale, no wave banner. The
title's facts ("Free to play · save your score on-chain") stay true.

## Shared pieces

### The tiers

One colour and one shape each, so a tier reads in grey and to a
colour-blind player, and never `--chain`'s blue (which means "signs").

| Tier | Token | Shape | Tile's frame |
|---|---|---|---|
| Common | `--tier-common: #e8dfcc` (stone) | disc | the plain inked frame |
| Rare | `--tier-rare: #7cc8f0` (sea) | diamond | a second rim in the tier's colour |
| Epic | `--tier-epic: #c6a4f5` (amethyst) | gem | a thick rim, a white inner line, faint facets on the stage |
| Legendary | `--gold-grad` (the cup's gold) | crown | a gold rim on a sunburst stage (the logo's badge), a slow shine (a won cup's, `won-shine`), off under reduced motion |

The chip is `.tier tier--<name>`: the shape, then the name in caps. The
list of tiers and their order comes from `CollectionJSON().tiers`: a fifth
tier gets the plain frame and a disc until it is given its own.

### A gnome's tile and card

- **Tile** (`.gtile`): the gnome on his world's `--stage` (the picker's
  card colour), framed in his tier. In the gallery and on cards it is the
  prebuilt 256 px thumbnail; on a gnome's page and in the picker it is the
  live turntable (`makePreview`).
- **Card** (`.gcard`, a `button`): the tile, the name and `#id`, then the
  tier chip and either the price ("30 GNOT"), the player who has him
  ("nym-…", tile stays in colour, a "Taken" tag), "Yours" (the board's own
  row look, ink), or "Wave 2" (dashed: browsable, not on sale). It lifts and
  glows as a board's sticker does.

### The trust strip

One line of facts under every buy and bid button, the same words
everywhere:

- You get exactly this gnome: no random draw.
- Cosmetic only: every gnome rolls the same.
- Paid straight to the game's account, in the same transaction (the
  auction: "your bid waits in the contract only while it leads").
- The contract on gnoweb ↗ (the realm's source, `?web=` aware).

And in the gallery's foot and the buy sheet: "For adults. A gnome is a game
cosmetic, not an investment: nothing promises it can be sold on."

### The bill

`.bill`, in the buy, bid and publish sheets: one line per cost with a word
of what it is, a dashed rule, "At most" and the total, then "About $N at
today's rate (approximate)" when a rate is known (none: the line is left
out, never guessed) and "Your Adena: N GNOT". The deposit and the fee come
from the same helpers the save uses (`depositBytes`'s pattern, `feeFor`,
`shortOf` in `lib/adena.ts`), with the gnomes' measured row sizes and the
Builder's `storagePrice × (bytes + overhead) × 1.1`.

### The wallet path

Buying, bidding, equipping and publishing reuse the save's path, unchanged
in look: the `RealPlay` steps for a missing or unconnected Adena
(`Golf.tsx`), `connect`/`onOurNode` in `lib/adena.ts`, the network warning
copy, the `Gnokey`/`GnokeyTx` fallback in a `<details>` ("Buy with gnokey
instead"), and the read-back after sending (`readBack`'s pattern: the chain
is read until it shows the new owner, the new bid, the new version). Each
transaction is sent alone, never in the same `DoContract` as a golf message
(nft spec §11).

| State | Shows | Copy |
|---|---|---|
| no Adena, computer | step 1 of 2, "Install Adena ↗", the gnokey details open | "Buying takes a gno.land wallet. Adena is the browser one; gnokey, the terminal one." |
| no Adena, phone | one button to send the link to a computer | "Adena lives in a computer's browser. Pick him here, buy him there: the link keeps him." |
| not connected | step 1 of 2, "Connect Adena" | |
| wrong network | `note--warn` and "I switched: check again" | "Adena is on another network. In Adena, pick the one whose RPC is **rpc.gno.land**, then come back: nothing was sent." |
| short of GNOT | the bill, `note--warn`, "Get GNOT ↗" (`GNOT_URL`) | "Your Adena has **120 GNOT**: **213.33 more** to go." |
| waiting for Adena | the gnome hopping (the loader's hop), no close | "Waiting for Adena…" / "Check the window Adena opened: it shows 333 GNOT to the gnomes' contract. Sign there." |
| sent, reading back | the same | "Reading it back from the chain…" |
| cancelled | `note--bad` over the bill | "Cancelled in Adena: nothing was sent." |
| unsure | `note--warn`, "Check again" | "Sent, but the chain could not confirm it yet. **Check again in a moment**: buying again would pay twice." |
| chain unreachable | the screen's own error (below) | "The chain did not answer. Try again in a moment." |

## A. The gnomes

### A1. The gallery (`/g/`, screen `gnomes`)

Mockup: `gnomes-gallery.html` (states `open`, `players`, `soldout`,
`loading`, `empty`, `error`, `teaser`; phone).

A front screen, tint `shop` (the paper's own: no world wins in a mixed
grid), Back to where the player came from, About, and the Adena chip in the
top right corner (the HUD's, smaller).

1. **Head.** Eyebrow pill "The gnomes · 720, each one of a kind" (the count
   from `CollectionJSON`), display "Who's on the ball?", and one line:
   "Pick the exact gnome you want. He rolls for you, and every rival who
   races your ghost sees him."
2. **The drops**, three panels in a row:
   - *This wave*: "Wave 1 · Garden", the window's tag ("Players first ·
     until Thu 18:00 UTC", gold), a title, one sentence of its rule, the
     loader's putting green mown to the share found ("58 of 101 found a
     player": the count goes **up**, never "43 left"), and when it opens to
     everyone.
   - *The Legendary's auction*, the one dark panel: his tile, "Legendary ·
     one of one", the name, the top bid and the end time, "Bid →".
   - *Next*: dashed, "Next · Wave 2 · Island", "Opens when the Garden's
     wave is 70% home": its gnomes are already in the grid to meet. A date
     is shown only when the owner has set one.
3. **Filters**, sticky under the head: `Segmented` "On sale · Mine · N ·
   All 720"; chips for the tiers (with counts in the current view), the
   catalogue's trait groups (Hat, Extras, Trail), world chips when "All"
   is on; a search field ("A name or a number: Fennel, #214"); a sort
   ("Number, Tier, Name"). On a phone the chips and search fold into one
   "Filters · 2" button opening a bottom sheet.
4. **The grid** of `.gcard`s, `auto-fill, minmax(164px, 1fr)`; two columns
   on a phone. "Wave 1 · Garden · 43 Commons, 11 Rares and 4 Epics on
   sale · sorted by number" above it. Later waves' gnomes follow, dashed.
5. **Foot**: the trust strip, the adults/cosmetic line, "How the gnomes
   work" (About's new section: what you get, what a gnome cannot do, the
   deposit, can you lose money: "yes, nothing guarantees resale").

| State | Shows |
|---|---|
| loading | "Reading the gnomes from the chain…" over dashed blank cards (`.podium__ghost`'s look); the catalogue's names and art show at once, the chain's owners and the counts fill in (`.late`) |
| error | "The chain did not answer" / "The gnomes are all here, but who has which could not be read. Try again in a moment." / "Try again" |
| empty filter | "No gnome like that one, yet" / "No Epic with glasses in this wave. Try another world, or look at every wave's gnomes." / "Show all 720" |
| teaser (nothing open yet) | the wave panel: "Opens Thu 9 Oct · 18:00 UTC", "Look around, nothing's for sale yet", "Tap ♡ to keep a list in this browser" |
| players' window, no record | `note--warn`: "**Players first until Thursday.** This wallet has no score on the boards yet: save one round on-chain to buy now, or come back Thursday at 18:00 UTC. Play a hole →" |
| wave sold out | the wave panel: "Every gnome found a player" tag, "The Garden's 101 are all out playing", the green full, "412 different players" |
| mint paused (owner) | the wave panel: "Paused for a moment: the sale picks up where it stopped." Buy buttons off with that line; nothing else changes |

No countdown is shown that the chain does not hold (a window's end, an
auction's end are on chain; "only today", "3 people are looking" never).

### A2. A gnome's page (`/g/<id>/`)

Mockup: `gnome-detail.html` (states `open`, `nowallet`, `mine`, `taken`,
`later`, `locked`, `cap`; phone).

Front screen in the gnome's world tint. Two columns, the stage sticky:

- **The stage**: the live turntable (`makePreview`, drag to turn, arrows
  turn by 30°), the tile's tier frame, "Drag to turn him" while untouched;
  ‹ › to the previous and next gnome of the current list (the gallery's
  filter is kept in the URL hash). A `Segmented` "Turning · On the green ·
  As a ghost": the preview on a patch of lane at play size, then
  see-through as a rival sees him. His trail and holing effect play on the
  green (Rare and up).
- **The facts**: tier chip, `#id`, "Wave 1 · Garden"; the name, inked and
  tilted as a cup's ribbon; his line; the traits as flat info cards (`dt`
  the trait group, `dd` the value, a small "31 in the Garden" from the
  catalogue's counts); who plays him (the board's face, "Nobody plays him
  yet." / "Plays with **nym-gnorman** since 4 Oct · best on the Garden: 31
  strokes. Race nym-gnorman's ghost →").
- **The buy panel**: the price big, "+ about 0.3 GNOT storage deposit,
  once", the blue "Buy Tansy · 333 GNOT" and ♡ (a list in `localStorage`),
  the trust strip, then the share row.

| State | The panel |
|---|---|
| on sale | as above |
| no wallet | the same button (it opens the sheet's step 1), "Buying takes Adena, the gno.land wallet, or a gnokey command: the next step shows both. Playing with him needs nothing more." |
| players' window, no record | button off: "Players first until Thu 18:00 UTC"; `note--warn` "This wave goes first to wallets with a score on the boards. **Save one round on-chain** and he's yours to buy now, or wait for Thursday. Play a hole →" |
| window cap reached | button off: "3 of 3 Commons this wave"; "Until Thursday, each player takes up to 3 Commons, 2 Rares and 1 Epic of this wave: yours are Basil, Pip and Clover. Open to everyone after Thu 18:00 UTC." |
| lifetime cap reached | button off: "5 of 5 gnomes for one wallet"; "One wallet keeps at most 5. Your gnomes →" (only if the realm keeps a lifetime cap) |
| yours | gold "Play with him", "Your ghost wears him ✓" or the blue "Wear him on the boards" (`Equip`, alone), "Show him off" share |
| taken | "He found his player. The Garden has 43 more on sale." / "See the Garden's gnomes" |
| later wave | "333 GNOT when Wave 2 · Island opens", "♡ Keep him on my list", "The list stays in this browser: when the Island opens, he shows first." |
| earned kind (`/g/wizard/`) | no price: "Earned, never sold: finish the Garden Cup." and, for a player who has proven it, "Make him yours on-chain · free" (`MintEarned`, blue) |

On a phone the stage comes first, then the facts; the price and its button
pin to the screen's foot (over the network banner, which hides) so the
action never scrolls away.

### A3. Buying (a sheet over the gnome's page)

Mockup: `gnome-buy.html` (states `confirm`, `connect`, `nowallet`,
`elsewhere`, `network`, `short`, `pending`, `reading`, `success`, `taken`,
`cancelled`, `unsure`).

A `Sheet` (480 px), titled with the gnome (his tile, name, tier, `#id`):

1. **Connect** (when needed): the two steps of `RealPlay`, "Connect Adena"
   then "Check the bill, then sign". Network shown at the foot.
2. **The bill**: the gnome and "Epic, the price of every Epic this wave",
   the storage deposit ("The chain keeps it for his record, once"), the
   network fee, "At most 333.33 GNOT", the approximate fiat line and the
   balance.
3. **Consent**, a shaded line above the button: "Pressing Buy asks Adena to
   send 333 GNOT now. Tansy is yours the moment the chain says so, so there
   is no 14-day change of mind. For adults. A cosmetic: he rolls exactly as
   every gnome does."
4. **"Buy in Adena · 333.33 GNOT"** (blue, wide), the trust strip, "Buy
   with gnokey instead" (`GnokeyTx`: `-func Mint -args <id> -send
   <price>ugnot`, the chain id and remote from the page's network), "Connected
   as g1jg8m…sqf5 · Network: gnoland-1 · Disconnect".

**Success** is the moment: the tile pops in (`pop`, the spring), confetti
(`Cheer`'s, none under reduced motion), "Tansy's yours!" inked, then "He's
on your ball from your next putt. For rivals to see him on your ghost and
the boards, wear him there: one small signature.", gold "Play with him",
"Wear him on the boards too" (Equip, alone), "Show him off" share, "See the
transaction ↗". He becomes the picker's chosen gnome at once
(`prefs.savedGnome`).

**Taken in the same block** (`gnomes: this gnome is already minted`):
`note--bad` "Someone took Tansy a moment before you. **Nothing was sent**:
your GNOT stays with you." and three cards "Still on sale, and a lot like
him" (same world and tier, nearest traits), "Back to the Garden's gnomes".

### A4. A Legendary's auction (`/g/<id>/` of a Legendary)

Mockup: `gnome-auction.html` (states `live`, `outbid`, `leading`,
`extended`, `ended`, `won`, `nobid`, `upcoming`; phone).

The one dark front (tint `legend`: a deep night, the frame in gold): the
Legendary on his sunburst, glowing, "Turning · His holing · As a ghost",
his lore under him. Right: "Legendary · one of one", `#id`, the name in
gold, his line, then the auction's panel and the bids.

- **Top**: "Top bid" and the amount big, "by nym-…"; the clock on the
  right in words ("21 h 14 min", "Ends Sat 11 Oct, 18:00 UTC"). Under 10
  minutes it turns red and counts seconds; it never animates as a
  ticking bomb (`role="timer"`, `aria-live="off"`: a reader asks for it).
- **The form**: "Your bid" prefilled with the minimum, "GNOT" inside the
  field, the blue "Bid 1,302 GNOT"; under it "At least **1,302 GNOT**: the
  top bid and 5%, or 5 GNOT if that is more. While you lead, your GNOT
  waits in the contract; outbid, it comes straight back to you, in the
  same transaction as the bid that beat yours."
- **The trust strip**: "One Legendary at a time, 48 hours · The reserve,
  777 GNOT, never goes down · The contract on gnoweb ↗".
- **The bids**: rows as the boards' (`.lb li`), latest first, yours inked;
  read from the realm (`Bids(id)`, below), never from the page's memory.

| State | Shows |
|---|---|
| live, another leads | the form |
| outbid (the player led) | `note--warn` "**nym-moustache943 bid 1,302.** Your 1,240 GNOT is already back in your Adena. Still 19 h 02 min to go." and "Bid again · 1,368 GNOT". No share here (nft spec §12) |
| leading | `note--good` "You lead. If someone bids more, your 1,302 GNOT comes straight back to you, and this page says so." / "Keep the page open, or come back: nothing to do until it ends." |
| extended | the red clock, "A late bid: the end moved to 18:10 UTC", `note--warn` "A bid in the last 10 minutes moves the end 10 minutes on: nobody wins by a second." |
| ended, not settled | "Ended", "**nym-zxxma042 won him** with 1,368 GNOT.", "Hand him over" (green, `Settle`: anyone may), "One signature from anyone ends the auction: the gnome goes to its winner and the GNOT to the game's account. The winner's page does it for them." |
| won (the player) | "**He's yours.** The Windmill King plays with nym-twee, and his name goes up next to yours on every board.", "Play with him", share "The Windmill King is mine." |
| no bid | "Nobody bid the 777 GNOT reserve. He comes back in the last wave, at the same reserve." |
| upcoming | "Opening bid 777 GNOT", "Opens Fri 10 Oct, 18:00 UTC, for 48 hours", "♡ Remind me in this browser" |
| GNOT sends refused by the chain | the form off: "The chain is not moving GNOT right now: bids wait. Nothing was sent." |

The page polls `Auction` every 30 s while open and visible
(`document.visibilityState`), and at once on focus; a change of top bid
fades in (`.late`), the outbid note replaces the form when the leader was
this wallet.

### A5. The picker's shelf: owned, earned, everyone's

Mockup: `gnome-locker.html` (states `mine`, `nowallet`, `locked`; phone).

The picker (`Golf.tsx` `Picker`) keeps its stage, its arrows, the aim
setting and "Choose this gnome". Its dots become a **shelf**: round faces
in groups, the one on show ringed gold, each group a soft well with a label.

1. **Yours**: the wallet's gnomes (`GnomesOf`, paged), a tier mark on each
   rim.
2. **Earned**: the nine of `UNLOCKS`, locked ones grey with a lock (on show,
   the picker's band says what earns them, as today).
3. **Everyone's**: the free five.
4. **+ More gnomes**: dashed, to the gallery. Not the sale's gnomes one by
   one, and no price in the picker: the brief suggests greyed gnomes for
   sale there, but the picker is where play starts, and principle 7 wins.
   Earned and free gnomes sit next to bought ones with equal weight.

Under the name of an owned gnome: his tier chip and `#id · yours`, then,
when the chain's `Equipped` differs from the one on show, one pill: "Your
ghost wears **The Pirate** on the boards · Wear Tansy there too" (`Equip`,
alone, blue in its sheet). Choosing plays him at once, locally, as today.

On a phone the shelf scrolls sideways (scroll-snap), the arrows hide (swipe
the tile), and the aim setting stays under it, one compact row.

### A6. Where the collection shows in play

Mockup: `gnome-places.html`.

1. **The cups' links row** (`Worlds.tsx`'s podium head): "Gnomes →" after
   "Badges 3/15 →" and "All players →". While a wave is open: "Gnomes ·
   Wave 1 →". Nothing else on the cups screen.
2. **A rival's ghost wears their gnome** (meshes only: no trail, no
   holing). A small tag over the ghost while it rolls and on tap: face,
   "nym-moustache943 · Thistle of the Garden"; the name opens his page in a
   sheet over the hole, and the shot clock and the hole wait under it. A
   rival in the player's own look falls back to `rivalSkin`.
3. **The finish card, after a personal best only**: the share shows the
   player's gnome; "The card shows **The Pirate**. Try another gnome on it"
   swaps the card's gnome among theirs, the earned ones and the gallery's
   (the last with a link to his page). Never after a worse round.
4. **The boards**: `Face` is the row's equipped gnome (one `EquippedMany`
   per page of rows, cached), the flat face until its thumbnail loads; a
   Legendary's player has his name in a gold pill after theirs.
5. **Victory** (a cup won): unchanged, except that a newly earned gnome's
   card (`.newgnome`) adds "Make him yours on-chain · free" when the realm
   can prove it.

### A7. Sharing

Per the nft spec §12 and ADR-003, at no server cost:

- `/g/<id>/` static pages with their own title, description and 1200×630
  card (the portrait on the card's frame, the tier's colour and shape, the
  name, "a gnome of Gnogolf"). The seven Legendaries' cards are 3D, made by
  `media/og/og.mjs`. Prebuilt 256 px thumbnails for the gallery come from
  the same step.
- The share row (`Share.tsx`) on a gnome's page, after a buy, a win, and on
  the picker (the turntable's `snapshot()` as the image on a phone).
- Texts, plain and about the game (never value): "I just adopted Tansy,
  gnome #94 of Gnogolf." · "The Windmill King is mine." · "My gnome for
  the boards: The Admiral." · "I'm bidding on the Windmill King, one of
  seven. 31 hours left."
- Clips (`NEXT_PUBLIC_CLIPS`) wear the equipped gnome, trail and holing
  included.

### A8. The sale's life, as the screens see it

| Phase | Gallery | Gnome page | Cups link |
|---|---|---|---|
| Teaser (nothing open) | every gnome browsable, "Opens <date>", ♡ lists | price shown, "♡ Keep him on my list" | "Gnomes →" |
| A wave, players' window | the wave panel's gold tag; non-players see the window note | buy, or the window's reason | "Gnomes · Wave 1 →" |
| A wave, open to all | the green track counting up | buy | "Gnomes · Wave 1 →" |
| Between waves | "Next · Wave 2" panel, the last wave's unsold still on sale at their price | buy (left from a wave) | "Gnomes →" |
| A Legendary's auction | the dark panel | the auction | as above |
| Paused | the paused line | buttons off, the line | "Gnomes →" |
| After the last wave | waves panel gone; "Every world's gnomes are out" | | "Gnomes →" |

## B. The Builder

Desktop first: a mouse and a keyboard, 900 px and up. On touch or under
900 px, `/build/` is play-only (B5).

### B0. The door

The Modes screen's third panel, "Builder · Draw your own hole, dare the
others", loses "Coming soon" behind `NEXT_PUBLIC_BUILDER=1`. It opens "Your
holes" (B4) on a computer and B5 on a phone.

### B1. The editor

Mockup: `builder-editor.html` (states `select`, `timed`, `issues`,
`proved`; `touch` on a phone).

A full-window workbench in the hole's world tint, three columns under a
bar. The front's paper and ink at a tool's density: 12 to 15 px text,
flat info panels, controls on their drop.

**The bar**: Back (the draft is saved already); the hole's name, editable in
place, and under it "nym-twee/mole-run · draft, saved in this browser"; the
world (`Segmented`: Garden, Island, Town, Mountain, Mines, from the palette's
worlds); Undo and Redo (round, small); gold "Test it" (off while an error
stands, its reason as its `title` and in the checks); blue "Publish…" (off
until every proof is in hand: an "after a test" sticker says why).

**The palette** (left, 236 px), generated from the palette entries of the
current world (hole-builder spec, "The palette model"), never typed:

- kind filters ("All · Walls · Posts · Ground · Moves"), from the entries'
  kinds;
- Tee and Cup first, then "Walls and posts" and "Ground", each entry a
  tile: its drawing (the board's own, small), its label, and one word of
  what it does ("kerb", "bar", "kicks", "holds", "pushes", "jumps",
  "hazard", "moves"), from its binding;
- "Start from": the world's three templates.

Dragging an entry onto the board places it; clicking it arms it (the next
click on the board places it, Esc disarms). A hand-only skin never shows.

**The board** (centre): the hole from above on its grid (a cell 0.5, a
stronger line every 4 units, the units along the top and left edges), the
lane's felt, its rails, the pieces in their toon colours, the tee (a white
disc with T), the cup (and its flag), a tunnel's path dashed to its
destination, a timed piece hatched with its cycle ("↻ 3 in 8"), a slope's
arrows. Its foot: "Snap 0.5 · turns 15°", "40 × 26 of 96", the keys, zoom.

| Gesture | Does |
|---|---|
| click | select (Shift adds); click empty: deselect |
| drag a piece | move, on the grid; Alt: no snap (0.25) |
| a corner or end handle | size, inside the entry's range (the handle stops there) |
| the round handle above | turn, by 15° |
| a tunnel's destination, a loop's landing | its own handle, limited by construction (a loop's depth stops at 1.5) |
| arrow keys | move by a cell; Shift: by 4 |
| R / Shift-R | turn by 15° |
| Del, Backspace | delete |
| Ctrl/Cmd-D | duplicate |
| Ctrl/Cmd-Z, Shift-Z | undo, redo (200 steps; a drag is one) |
| Space-drag, wheel | pan, zoom |
| Tab / Shift-Tab | next and previous piece, in the order placed (the board's keyboard path) |

While dragging, a dark label by the handle says the measure ("r 1.2 ·
bounce 1.25", "↻ shut 3 in 8", "length 10"). Every edit runs `fit` in the
wasm: if Fit moved the hole (the board shrank or grew), the view follows
without a jump and the board's foot says "Fitted: moved 1.5 left".

**The right column**:

1. **The 3D preview**: `buildHole` on the canonical hole, rebuilt 150 ms
   after the last edit, "As players will see it"; a timed piece moves in it
   on its real cycle.
2. **The piece**: its drawing, name, "A post that kicks · at (33, 18)",
   then its parameters as sliders within the entry's ranges, each with its
   value in an output box (typed values allowed, clamped, with "1.6 at most
   for a mushroom"): size, thickness, bounce ("Above 1 it kicks:
   mushrooms may", shown only where `KICKS` allows), scale, grade, speed.
   **Timing**: `Segmented` "Always · Within a stroke · Comes and goes" (the
   entry's clocks only); "Within a stroke" shows Cycle, Shut for, Starts at
   and a strip of the cycle's steps (on in the hat's red, the current step
   ringed while the preview plays); "Comes and goes" the same in strokes
   (2 to 60). Then Duplicate, Rotate 15°, Delete.
3. **The chain's limits**: gauges, each "23 / 160": walls, posts, zones,
   pulses, polygon points, data (KB); green, then the sun at 80%, the hat
   at the limit. "A shot's room in a storm" from `check`'s `room`.
4. **Checks**: L1 and L2 issues, errors first, each naming its piece and
   its place; a click selects the piece and pans to it. A chain refusal
   shows the plain words with the realm's sentence under it in mono (the
   hole-builder spec's "Error messages" table). All clear: "The chain's own
   checks pass: it would publish as it is."

**Changing world** keeps every piece that has an entry in the new world; if
some have none, a confirm (`.confirm`) lists them: "The Island has no
hedge or molehill: 3 pieces would go. Change world anyway?" / "Keep the
Garden".

**Drafts** save on every change to `localStorage`; a private window keeps
the draft in memory and says so once ("This window keeps nothing: export
the draft before you close it."). Export and Import (`.json`) in the menu.

### B2. Test mode

Mockup: `builder-test.html` (states `playing`, `proved`, `missed`).

The game itself on the Builder's local chain (`localchain.ts`), its HUD as
in play with a yellow "Test" tag on the hole's card ("Your hole · Garden",
"Mole Run", "Back to the editor ↩"), the weather card showing the
weather being proven ("the hole's real rain"), the moving-hole note, the
aim hint, Restart and the camera. The menu, the wallet chip and the
Players chip are gone: nothing here goes to the chain.

**The proof panel** (right, as the menu drawer: paper, `-6px 6px 0` ink):

- eyebrow "Test · nothing is sent, nothing costs", the title "Hole it in
  every weather that moves the ball", one sentence on why ("The Garden's
  climate has three that change how the ball rolls. Each is the weather your
  hole will really have, from its address. Fog only hides the far end: no
  round needed.");
- one row per required weather (from `CLIMATES`): its glyph, name, and
  "3 strokes · replayed by the chain's code ✓", or "Playing now: the rain
  lays puddles before the gate", or a missed proof "Holed in 5, but one
  shot could run out of room in the rain" with "Again";
- **Par**: "–" until every weather is holed, then the suggested par big,
  "The most strokes it took, plus one. Higher if you like; never lower.",
  − and + (never below the suggestion, never above 19);
- proved: the blue "Publish…"; always "Back to the editor", and "Move a
  piece, and the proofs go: the hole is not the one you holed any more.
  Renaming it, or its par, keeps them."

When a round holes, the next weather starts by itself after the finish
card's "Next weather →" (the win card, its share and save rows left out).

### B3. Publishing

Mockup: `builder-publish.html` (states `name`, `refused`, `checks`,
`newer`, `cost`, `pending`, `done`, `closed`).

A `Sheet` over the editor, four steps in a row of pills (done green, the
current gold):

1. **Name**: the name (40) and "A line for players" (140), counters, under
   each "Stored as **Mole Run** ✓" (the wasm's `cleanName`/`cleanText`,
   live), the address locked ("Its address nym-twee/mole-run/v1 · Fixed at
   the test: the weather comes from it"), and the hole's card as the
   community list will show it. `linkish` refusals show at once, field red:
   "The name looks like a web address: write "St. Andrews", not
   "St.Andrews"." with the realm's sentence in mono.
2. **Checks**: the proofs replayed on the final bytes, `Publishing()`, and
   `Versions(alias)`: "A new hole: it will be **v1**". A newer version
   published elsewhere: "This one would be **v3**, and its weather changes
   with its address: play the three rounds again (free)." / "Test again".
   The same bytes: "This is exactly the version already published."
3. **Cost**: the bill (deposit "For the hole's 5,240 bytes and its rows in
   the lists, kept by the chain", fee, "At most 1.20 GNOT", balance), "Nothing
   goes to the game: the deposit is the chain's price for keeping the hole,
   the fee its price for checking it. A new version later costs about as
   much again.", the blue "Publish in Adena · 1.20 GNOT", gnokey (the long
   hex as one copyable line).
4. **Sign**: the wallet path's pending states, the hole's map hopping;
   read back with `Current(alias)`.

**Done**: "Mole Run is on gno.land!", the hole's picture made in the page
(the 3D pane through `snapshot`, its card: "Built on gno.land · by nym-twee,
Mole Run, par 5"), "Now play it for real and save your round: your best
becomes the dare, and the list marks it **holed by its author**.", gold
"Play it for real", "Share the hole", "After your saved round, the link
dares friends to race your ghost on it. · See it on gnoweb ↗".

**Closed** (`Publishing()` false): "Publishing community holes is not open
yet on gno.land. **Your draft is kept** in this browser, proofs and all." /
"Export the draft".

### B4. Your holes, the community's

Mockup: `builder-holes.html` (states `mine`, `community`, `empty`; phone).

A front screen ("The Builder" pill), a `Segmented` tablist "Yours · The
community's", cards in the duel's ghost cards' language (`.ghost`): the
hole's map from above (the board's drawing, small), its world's tag, name,
"v2 · par 5 · published 4 Oct" or "by nym-… · par 4", its line, the
"Holed by its author" mark (the chain's: the author has a best, `Bests`) or
"Not yet holed by its author" (dashed), the players count.

- **Yours**: "Play", "Edit for v3" (opens the published version as a
  draft; refused, with the pieces named, if a piece has no palette entry),
  "Dare a friend"; a published hole not yet holed by its author says "Save
  a round of your own on it: then it shows first in the list, and your link
  dares."; drafts dashed ("Draft · in this browser · 2 of 3 weathers
  holed", "Open in the Builder", "Export"). "+ Draw a new hole" gold.
- **The community's**: order "Holed first · Newest · Most played";
  "Race the author" (gold, a dare with `by=`) and "Play"; the foot: "At
  most 3 holes by one player are listed. "Holed by its author" is the
  chain's word: the author saved a round on it. Something wrong with a
  hole? Tell us".
- **Empty**: "No hole of yours yet" / "Draw one on the Builder's board with
  the Garden's pieces, hole it in every weather, and publish it: it costs
  about a GNOT, the chain's price for keeping it." / "Draw a hole".

### B5. On a phone

Mockup: `builder-editor.html?state=touch`.

"Built on a computer" / "Drawing a hole takes a mouse and a keyboard: open
this page on a computer. Here, play the holes you published, and dare
friends with them.", the player's holes as rows with "Play", "Send the
Builder's link to my computer" (the system share sheet, as the phone's
"Play it on my computer"), "The community's holes →".

## Data the screens need

What each screen reads, so the realm, catalogue and wasm agents expose it.
Shapes are JSON from `qeval`, parsed in `lib/chain.ts` alone (CLIENT.md).
Amounts in ugnot as integers; times as Unix seconds; ids as numbers.

### From `r/gnogolf/gnomes`

| Read | Shape (the fields the GUI uses) | Screens |
|---|---|---|
| `CollectionJSON()` | `{open, paused, denom, tiers:[{name, price, minted, supply}], series:[{name, first, last}], waves:[{n, name, world, first, last, opens, playersUntil, caps:{common, rare, epic}, sold, size}], auction: <AuctionJSON or null>, players}` (`players`: distinct owners) | gallery head and drops, A8 |
| `GnomesJSON(from, count)` | page of `{id, tier, name, traits, price, owner, wave}` (bounded `count`, `next` or -1) | gallery grid (owners, prices), gnome page |
| `GnomeJSON(id)` | one of the above, `null` if unknown; `since` (block time of the last transfer) | gnome page |
| `Sold()` | the bitmap, one read for the whole grid | gallery's taken marks |
| `GnomesOf(addr, from)` | the wallet's ids, paged | picker's shelf, "Mine", detail "yours" |
| `CanBuy(addr, id)` | `{ok, reason, window, left:{common, rare, epic}, total, cap}`: why not, in the realm's words: `closed`, `paused`, `later`, `players-only`, `wave-cap`, `cap`, `taken` | buy panel's disabled reasons, without trying a transaction |
| `HasRecord(addr)` | bool, the players' window rule as the realm applies it (a v1 or v2 score in `store`) | the window notes |
| `AuctionJSON()` | `{id, reserve, top, bidder, end, minNext, extendBy, lateWindow, settled, started}` | auction, gallery's dark panel |
| `BidsJSON(id, from, count)` | `[{bidder, amount, at}]`, latest first, bounded (or the `Bid` events, read from the indexer the game already uses, if one) | auction history |
| `Equipped(addr)`, `EquippedMany(addrs)` | the token id or `""` (as owned now) | picker pill, boards, ghosts |
| `Proof(kind, addr)` | `{ok, missing, strokes, par}` | earned "Make him yours on-chain" |
| `Params()` | the settings: `increment` (5% and 5 GNOT), `extend` (600 s), `duration`, window length, caps | the auction's and window's sentences, never hard-coded |

Writes, each sent alone: `Mint(id)` with `send` = the price exactly,
`Bid(id)` with `send`, `Settle(id)`, `Equip(tid)`, `MintEarned(kind)`.
Their refusals are short constants the GUI maps to sentences (A3 and the
table below); an unknown one is shown as it is, under "Something went
wrong".

| The realm says | The GUI says |
|---|---|
| `gnomes: the mint is closed` | "Paused for a moment: the sale picks up where it stopped. Nothing was sent." |
| `gnomes: this gnome is already minted` | "Someone took Tansy a moment before you. **Nothing was sent**: your GNOT stays with you." |
| `gnomes: this wallet minted as many gnomes as the cap allows` | "One wallet keeps at most 5. Nothing was sent." |
| (wave cap) | "3 of 3 Commons this wave, until Thu 18:00 UTC. Nothing was sent." |
| (players' window) | "Players first until Thu 18:00 UTC: save one round on-chain to buy now." |
| `gnomes: wrong payment, send exactly <n>ugnot` | "The price changed while this page was open: it is now <n> GNOT. Nothing was sent." and the bill refreshes |
| (bid too low) | "Someone bid first: at least 1,368 GNOT now. Nothing was sent." |
| (auction over) | "The auction ended a moment ago. Nothing was sent." |
| `gnomes: not your gnome` (Equip) | "Tansy is not in this wallet any more: he can't go on your ghost." |

**Required of the realm by the owner's decisions** (not in the realm as
written): per-tier prices as owner settings (defaults 30/99/333), waves as
id ranges with a world, opening time and players' window, `HasRecord` read
from `store`, the window's per-wave caps, the auction (48 h, 10 min
extension, max(5%, 5 GNOT)) with refunds in the outbidding transaction, a
pause, and the reads above. The screens degrade without the optional ones:
no `CanBuy`, the reasons come from the transaction's refusal; no
`BidsJSON`, the history shows only the top bid.

### From the catalogue (`data/gnomes.txt`, built into `lib/gnomes.ts`)

The gallery shows names and art before the chain answers, so the build
needs, per row: `id`, `tier`, `name`, `traits` (the 18 bytes), `world`
(the wave's), a `line` (the one-line epithet), for the Legendaries a `lore`
paragraph and a `holing` name, and generated at build: the 256 px
thumbnail path, the OG card path, and per world the counts of each trait
value ("31 in the Garden"). Trait **labels** (hat "Bobble, moss green")
come from one table in `lib/gnomes.ts` keyed by the traits' fields, so the
filters, the cards and the page say the same words.

### From the Builder's wasm and the golf realm

As the hole-builder spec lists them: `fit`, `check`, `state`, `extras`,
`forecast`, `find` (`builder.wasm`); `Publishing()`, `Versions(alias)`,
`Current(alias)`, `HoleData(alias)`, `Bests(hole, mode, author)`, and for
B4 a bounded `CommunityJSON(from, count, order)` with `{id, alias, author,
name, note, par, world, version, published, holedByAuthor, players}` and a
`MineJSON(addr)` (the author's aliases and their versions). The palette's
entries (`palette.ts`) give each tile its `label`, `kind`, its one word
(new field `does`) and its ranges.

## Components

| File | New or changed | Reuses |
|---|---|---|
| `web/components/Gnomes.tsx` (new) | `Gallery`, `GnomePage`, `BuySheet`, `Auction`, `GnomeCard`, `TierChip`, `TrustStrip`, `Bill` | `FrontScreen`, `Button`, `Segmented`, `Sheet`, `InfoTip`, `Share`, `GnokeyTx`, `Frame` |
| `web/components/Golf.tsx` | `Picker`: the shelf replaces the dots; the "wear him" pill; the screen `gnomes`; the ghost's tag; the finish card's try-on | `RealPlay`'s steps, `NetBanner` |
| `web/components/Worlds.tsx` | the links row's "Gnomes →" | |
| `web/components/Leaderboard.tsx` | `Face` wears the equipped gnome; `Sticker` and rows get the Legendary pill | `EquippedMany` |
| `web/components/Modes.tsx` | the Builder panel live | `Panel` |
| `web/components/About.tsx` | "How the gnomes work" section | |
| `web/components/builder/*.tsx` (new, hole-builder spec) | `Builder`, `Palette`, `Board`, `Preview`, `Inspector`, `Issues`, `TestMode`, `Publish`; plus `Holes.tsx` for B4/B5 | `Sheet`, `Segmented`, the game's engine and HUD for the test |
| `web/app/globals.css` | the tier tokens, `.tier`, `.gtile`, `.gcard`, `.trust`, `.bill`, `.track` | the existing tokens |
| `web/app/title.css` | `.tint--shop`, `.tint--legend` | the tints' recipe |
| `web/app/builder.css` (new, loaded by `/build` only) | the workbench | |
| `web/app/g/[id]/page.tsx`, `web/app/g/page.tsx` (new) | static pages | `app/h/[slot]/page.tsx`'s pattern |
| `web/lib/gnomes.ts` (new, nft spec) | catalogue, `skinOf`, trait labels, tier order | |
| `web/lib/chain.ts`, `web/lib/adena.ts` | the reads and writes above | `calls`, `feeFor`, `shortOf`, `readBack`'s pattern |

The mockups' `kit.css` mirrors the game's tokens under the same names and
marks each new piece NEW: it is the reference for these additions, not code
to copy.

## Accessibility

- Every sheet is `Sheet` (focus moves in, Tab trapped, Escape closes,
  focus returns), every overlay a `Dialog`. The auction's "Hand him over"
  and the buy's pending state have no close while Adena's window is open
  (as the save's), and say why.
- Cards are buttons with a full `aria-label` ("Tansy of the Garden, number
  94, Epic, 333 GNOT"; "…, plays with nym-gnorman"; "…, not on sale yet").
  The tier is said in words, never colour alone; the shape repeats it.
- The turntable is `role="img"` with the gnome's name and "drag to turn
  him, or use the arrow keys"; the arrow keys turn it when focused.
- Counters and clocks: `role="timer"`, `aria-live="off"`; outbid and
  success notes `role="status"`; the buy's errors `role="alert"`.
- The Builder's board: every piece is a focusable SVG group with its name
  and place ("Mushroom bumper at 33, 18, radius 1.2"); Tab walks them,
  arrows move, R turns; the checks list is a list of buttons that select
  the piece. A screen-reader user can build a hole from the palette and the
  inspector alone.
- Targets 44 px on touch (`pointer: coarse`), as today.
- Reduced motion: no turntable spin until dragged, no confetti, no shine,
  no hop; transitions at the global `.01ms`.
- Contrast: the tier colours are backgrounds under ink text (≥ 7:1); paper
  text only on ink, `--chain`, `--green` and the Legendary night (≥ 8:1).

## Mobile

- The gallery: two columns, the filters in a bottom sheet, the drops
  stacked (the "Next" panel hidden), the Adena chip icon-only.
- A gnome's page: one column, the stage first, the price and its button
  pinned to the foot.
- Buying on a phone: the sheet full width; without Adena on the device,
  "Send the link to my computer" (the phone's "Play it on my computer"
  pattern), and the gnokey details for whoever has a terminal. Adena's
  in-app browser buys as a computer does.
- The auction: one column, the tile smaller, the bid panel within the
  first screen; the lore is left to the wide layout (his share card carries
  it).
- The picker: the shelf scrolls sideways; swipe the tile.
- The Builder: play-only (B5).

## Evolvability

- **A new wave or series** is a realm row: the gallery's drops, filters,
  counts and the cups link read `CollectionJSON`; the catalogue's new rows
  bring their art at the next build.
- **A new world** brings its tint (`.tint--<world>` in `title.css`, as
  every front screen already needs), its palette entries and climate: the
  Builder's world switch, palette and proof rows are lists.
- **A new tier** gets the plain frame and a disc until its tokens are
  added; nothing breaks.
- **A new piece** appears in the Builder's palette when its drawing and
  binding meet (hole-builder spec); the palette tile draws from the board's
  own drawing.
- **Copy** lives in the components that use it, as the game's does; the
  realm's refusals map in one table per feature (`checks.ts`,
  `lib/gnomes.ts`), an unmapped sentence shown as it is.
- **Flags**: `NEXT_PUBLIC_GNOMES`, `NEXT_PUBLIC_BUILDER`,
  `NEXT_PUBLIC_COMMUNITY`, as the nft and builder specs set them; off, the
  game is as today.

## Analytics

The game's own `track` (`lib/analytics.ts`, anonymous, off without a key):
`gnomes_opened {from}`, `gnome_viewed {tier, wave}`, `gnome_buy_clicked
{tier, step}`, `gnome_bought {tier}`, `gnome_equipped`, `bid_clicked`,
`builder_opened`, `builder_tested {weathers}`, `hole_published`. No
address, no amount.

## Open questions

1. **The realm's shape.** The owner's decisions (waves, players' window,
   prices 30/99/333, the auction) are not in the realm as written; the nft
   spec still says 777 tokens and 5/20/75. The GUI follows the decisions
   and the reads listed above.
2. **A lifetime cap** beside the window's per-wave caps: keep 5, raise it,
   or drop it? The gnome page's state exists either way.
3. **Fiat line**: which rate source, if any, without a server? Without one,
   the "About $N" line is left out (never stale).
4. **Gender**: the catalogue should say "he", "she" or "they" per gnome;
   the copy uses it.
5. **Wave 2's date**: the brief opens a wave when the last is 70% sold; the
   screens show a date only once the owner sets one.

## Mockups

`docs/superpowers/mockups/`: static HTML on the game's font
(`web/public/fonts/fredoka.woff2`) and tokens (`kit.css`), the gnomes' art
the picker's 14 renders standing in for the catalogue's thumbnails, the
in-play images captured from the running game. Each page's states are
listed at its top; `node docs/superpowers/mockups/shoot.mjs [page]` takes
their screenshots into `screens/` with the repo's headless Chrome
(`media/lib/cdp.mjs`, no new dependency). `index.html` links them all.

| Screen | Page | States |
|---|---|---|
| A1 the gallery | `gnomes-gallery.html` | open, players, soldout, loading, empty, error, teaser · phone |
| A2 a gnome's page | `gnome-detail.html` | open, nowallet, mine, taken, later, locked, cap · phone |
| A3 buying | `gnome-buy.html` | confirm, connect, nowallet, elsewhere, network, short, pending, reading, success, taken, cancelled, unsure · phone |
| A4 the auction | `gnome-auction.html` | live, outbid, leading, extended, ended, won, nobid, upcoming · phone |
| A5 the picker's shelf | `gnome-locker.html` | mine, nowallet, locked · phone |
| A6 where it shows | `gnome-places.html` | the cups' link, a ghost, the finish card, the boards |
| B1 the editor | `builder-editor.html` | select, timed, issues, proved · touch (phone) |
| B2 test mode | `builder-test.html` | playing, proved, missed |
| B3 publishing | `builder-publish.html` | name, refused, checks, newer, cost, pending, done, closed |
| B4 the holes | `builder-holes.html` | mine, community, empty · phone |
