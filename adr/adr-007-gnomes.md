# ADR-007: The gnomes realm, its catalogue as data, sold in waves

## Status

Accepted for the feasibility step, 2026-10-06. Implements the on-chain part
of the gnomes' design (`docs/superpowers/specs/2026-10-06-nft-gnomes-design.md`)
as `gno.land/r/gnogolf/gnomes`, with the user's decisions: 720 gnomes, the
research brief's waves, player window and prices
(`docs/superpowers/research/2026-10-06-nft-best-practices.md`), every tier
at a fixed price, the Legendaries too (no auction: the user's decision of
2026-10-06), a hard closing date for the genesis sale, a treasury apart
from the owner's key, and a site link the owner sets. golf/v2 and store do
not change. Nothing is deployed. Two points stay open for the user:
`Renounce`, and a portrait drawn from the traits.

## Context

The ball is a gnome. Players choose the exact gnome they buy (no random
draw), pay a fixed price in GNOT, and equip it. GNOT moves on gnoland-1
(`params/bank:p:restricted_denoms` is `[]`; gnofly's treasury holds what
its 162 mints paid).

Before the client is built on it, four things had to be proven:

- that `p/nt/grc721` (with `royalty`) is on onyx-1 and gnoland-1 and works
  from a realm under `gno test` (it is, on both: `vm/qfile` lists
  `grc721/v0`, `royalty/v0`, `metadata/v0`, `enumerable/v0`, `bptree/v0`);
- that a sale can be paid exactly and forwarded in the same call, the realm
  holding nothing;
- that the nine earned gnomes can be proven from store's rows alone, at a
  gas a transaction can pay;
- what each write costs in deposit, since every byte of state is paid at
  100 ugnot.

And the collection must grow without new code: seasonal drops after the
genesis, waves of a world at a time, prices moved between waves.

## Decision

**The catalogue is data, published as series.** The owner publishes a series
with `AddSeries(name, rows)`, one gnome a line, `id|tier|name|traits`, ids
following on from the last series. The first is the genesis and must match
the config's supply per tier (504, 144, 65, 7: 720, ten times a par-72
course), which `scripts/selfcheck.ts` holds to `data/gnomes/series.json`
(with the prices and caps: every count is written once). A
later drop is one more call of any size, never new code. A series is
checked whole and never changed. It is kept as one string read in place by
bisection (as gnofly's table), not as structs. The traits are the designer's
encoding, version first, opaque to the realm: the client reads them, the
realm keeps and returns them. A token's id is its row's id, and its row is
its record: no copy is made per token. Which ids were ever sold is a bitmap
(a bit an id), so a burned gnome is never sold again.

**The sale comes in waves.** `AddWave(first, last, start, playerHours)` puts
a range of ids on sale from a start, at the prices of the day. Its first
hours sell only to wallets with a record in store (a standing in either mode
in `totals`, which v1's records were copied into), at most 3 commons, 2
rares, 1 epic and 1 legendary each per wave; then anyone, under the lifetime
caps (10, 5, 2, 1: one Legendary a wallet, ever). A wave is never changed
nor withdrawn: its ids stay on sale at its prices, and `SetPrice` moves only
the waves published after it. Prices start at golf's own numbers: 36 GNOT
a Common, the par of nine holes; 72 a Rare, the par of a course; 336 an
Epic, the dimples on a golf ball; 1,296 a Legendary, eighteen holes times
par 72 (59,424 GNOT if all 720 sell). Nothing is ever discounted by the
realm. A Legendary is bought as any
gnome, at its wave's price, by the first who buys it: there is no auction,
no escrow, no bid to refund.

**The genesis sale closes on a date.** `SetCloseAt(at)`, owner only, once the
genesis is published: a date in the future, which can later be brought
forward, never pushed back, by this owner or the next. From its block on, the
genesis's unsold gnomes are closed for good: `Buy` and `AddWave` refuse
them ("the genesis sale closed on <date>"), and its
final supply is readable on chain (`Collection`: the series' `sold` and
`closed`; `Gnome`: `closed`; `Sold` stays the sold bitmap). A later series
is not closed by it, and earned gnomes never are. **Recommended date**:
about 30 days after wave 7 opens, announced at launch with the waves.

**Buy is a direct, exact, forwarded payment.** `Buy(ids)` takes 1 to 5 ids
and exactly their sum in one ugnot coin, checked against `OriginSend`, which
is trusted only on a direct user call (`cur.Previous().IsUserCall()`): a
realm or run script in between could keep coins it attached. The state is
written first, then the sum goes to the treasury with an `OriginSend` banker,
which can spend this call's envelope and nothing else.

**No auction.** Built at first (an auction of each Legendary, one at a
time, its top bid held in escrow, a soft close, a pause that froze its
clock), then removed by the user's decision: the Legendaries are sold as the
other tiers, so the realm holds no one's money at any time, and the pause
(`SetMintOpen(false)`) is a plain switch over every sale. `Sweep` stays: it
sends the treasury coins someone sent the realm by a plain transfer.

**Earned gnomes are proven from store, free, and bound.** `MintEarned(kind)`
mints the caller's earned gnome once store proves the feat (the nine of
`UNLOCKS`: a cup finished, at par, five aces, the four cups at par), reading
store with golf/v2's key layout (slots, bests, copies, holes) and never
calling golf/v2. A best that is a copy (a record sent again) does not count;
only a slot's current version does. The proof refuses while store's writer
is not the golf/v2 it was built against, and on any row not in the format
it knows: a later format can refuse a mint, never prove a false one. A cup
is read in one store page (300 slots; golf takes up to 999 a world): a
larger one is refused ("cup too large for the proof"), never proven from
its first page. Free:
nothing may be sent; once per player and kind; ids from 1,000,001, above any
catalogue's (64 series of 1,000). An earned gnome cannot be transferred or
approved (the ledger extension vetoes it); it can be burned, and its kind
minted again under a new id. `Proof(kind, player)` says, free, what a mint
would find. Its traits are the designer's codec's for the kind, byte for
byte (selfcheck.ts).

**Burn is the holder's.** `Burn(id)` clears what the ledger's hook cannot
(the locker's row, the equipped gnome, an earned gnome's rows) before the
ledger's burn; the deposit returns to the holder.

**The owner's role and the treasury are apart.** The owner, captured at
deploy, holds the settings and hands them on with `Transfer` then
`Accept`, as golf's; every check is on the immediate caller. The treasury
is where the money goes: every sale, the royalty (5%, advisory) and
`Sweep`'s strays; the realm itself holds nothing. It is the deployer at
deploy, and
moves in two steps: the owner offers it (`SetTreasury`, never to the
realm's own address), and the new address takes it with `AcceptTreasury`,
a transaction signed from that address itself, so a mistyped address never
receives a sale, and a realm cannot take it. Handing the owner's role on
moves no money. The treasury can be, and should be, an address whose key is
not the owner's hot key: a gnokey multisig (`gnokey add --multisig`, which
signs `AcceptTreasury` with its threshold of keys) or a hardware wallet's
address (a Ledger through gnokey or Adena). `SetMintOpen` stops every sale
at once (not `MintEarned`, which sells nothing). Whether the role
may be renounced is not decided: there is no `Renounce`.

**The site link is the owner's.** `SetSiteURL` sets the game's site, which
a token's `external_url` names (`<site>g/<id>/`, an earned one's `<site>g/<kind>/`: the site's static pages); none is set at deploy,
and until one is, the metadata has no `external_url`. The image is the
on-chain SVG, so nothing a wallet shows depends on the domain. The link
follows golf/v2's `SetPlayURL` rule (https://, at most 100 of a-z, A-Z, 0-9
and -._~/:%, no query or fragment), shared as `p/gnogolf/weblink`, and ends
with "/"; golf/v2 keeps its own copy of the rule until its next version.

**State in bptrees, no enumerable.** Measured with storage goldens: an avl
row costs about 2 KB of deposit, `grc721/enumerable` added 5 to 9 KB to a
buy. The realm keeps its own rows (caps, equips, a holder's gnomes, earned
kinds) in bptrees seeded at deploy, as store does, and indexes holdings
with a small ledger extension, which also drops a gnome its holder wore when
it leaves them and refuses to move an earned one.

| what | bytes | deposit | golden |
|---|---|---|---|
| the deploy: the realm with the portrait's drawing (159,277 bytes of source, staged, no catalogue), and p/gnogolf/weblink | 236,801 and 2,029 stored | 23.68 and 0.20 GNOT, the deployer (239M gas) | an `addpkg` on an in-process node (below) |
| the genesis published as the catalogue lays it out, with a wave | 64,230 | 6.4 GNOT, the owner | `z_storage_genesis` |
| a first buy (was 10,465 with enumerable and a traits copy) | 4,332 | 0.43 GNOT, the buyer | `z_storage_buy` |
| an earned gnome | 4,038 | 0.40 GNOT, the player | `z_storage_earned` |

| what | gas | measured by |
|---|---|---|
| a first buy (2.45M while a sold count in the series rewrote its rows) | 2.37M | `z_storage_buy` less `z_storage_genesis` (`// Gas:` goldens) |
| the King's proof, the heaviest `MintEarned` reads (72 slots, both modes, the pars) | 44.6M | `z_proof_king` less `z_proof_seed` |
| a collection read whole with `GnomesOf`: 1, 50, 205 gnomes | 4.8M, 144M, 616M (3 pages) | the `TestLockerGas*` pairs |

The deploy's deposit is what a chain stores, not the source's size: the
package and its preprocessed code, about one and a half times the staged
source. It was measured with the onyx toolchain's integration harness
(`gno.land/pkg/integration`, a txtar that loads store and the `p/nt`
imports, then `gnokey maketx addpkg` of the staged weblink and gnomes on
its in-process node: `STORAGE DELTA`), and agrees with the local chain's
20.6 GNOT for gnomes before the portrait's art. `addpkg` is sent with a
`-max-deposit` of 40 GNOT, as planned.
| `TokenURI` of the heaviest portrait, gnome 199 (Figurehead Fen, an Epic: 8,170 bytes of data URI, the largest of the Genesis) | 76.0M; **83.08M on a chain** | `z_portrait_read` less `z_portrait_base`; a local chain from the onyx toolchain |

Every figure above is `gno test`'s, and a chain charges more. `gno test`
runs on a store with no gas meter: it never charges what a call pays to load
each object it reads from the chain's store (per object 59,000 to read, then
17 a byte, and amino's decoding a byte; `tm2/pkg/store/types/gas.go`
`DefaultGasConfig`). For `TokenURI(199)` that is 7.1M more, the
catalogue's 60 KB string and the ledger's nodes among it; a read of the
catalogue (a buy, a proof's cups) pays its share too. The client's gas for
a call is the chain's figure with a margin, never a filetest's.

The King's proof is under the 300M the client will ask for `MintEarned` and
of the order of golf's `Claim` (70.2M); a `GnomesOf` page of 100 is about
210M, far under a query's 3e9.

**Wearing is free.** Every player wears their best gnome (the highest tier
they hold, then its lowest id; an earned one after any bought one) with no
transaction: `Worn(player)` answers it in one read, and `WornMany` for a
board's page or a rival (the first 50 of a list). `Equip` is optional: it
shows everyone another gnome than the best, until it leaves its holder;
`Worn`'s `"equipped"` says which. On their own screen a player may play any
gnome they hold, kept in their browser: nothing on chain. To make the best
one row away, a holder's index sorts best first (`"<holder> <rank><id>"`,
the last tier's rank 0): `GnomesOf` and `TokenOfOwnerByIndex` list a
wallet as its team is shown, Legendary first, and a sale writes the rank
from the row it has already read (one byte more a row; a first buy 2.37M
gas, 2.35M before).

**Where the shop opens.** The free game plays everywhere; the shop is not
offered in mainland China nor under the comprehensive sanctions (Cuba, Iran,
North Korea, Syria, Russia, Belarus). The EU and the UK are not blocked: the
buy sheet asks for their consent to delivery at once. At zero server cost:
Netlify's country rules (`netlify.toml`) rewrite `/geo.json` to
`/geo-blocked.json` and a gnome's page `/g/*` to a static "not available in
your region" page for those countries; the client reads `/geo.json` once
when the shop would open and, shut, hides the shop, its links and every buy,
buy and equip (`web/lib/gnomes/geo.ts`, whose `BLOCKED` is the one list, the
tests holding both rules to it). Best effort, and said so: a VPN gets round
it, and the realm stays callable with gnokey by anyone; a realm cannot know
a caller's country.

**Reads for the screens**, JSON starting with `"version":1`, one query each:
`Collection`, `Gnome` (`{"version":1,"id":""}` for none), `Sold` (a bit per
id), `GnomesOf(owner, offset)` (100 rows a page, each id, tier and traits:
enough to draw a collection with no call per token; `total`, `next`),
`Equipped`, `EquippedMany` (the first 50 players of a list), `Worn` and
`WornMany` (below),
`Proof`; `CanBuy(buyer, ids)`, the mint page's answer before any
signature: `ok`, a `reason` code (`ids`, `paused`, `unknown`,
`unlisted`, `later`, `taken`, `closed`, `players-only`, `wave-cap`, `cap`:
the first refusal Buy would meet), `said` (Buy's own sentence), `total` (the
ugnot to send), the lifetime caps `left` and the first id's player `window`
(its end, its caps left; `until` 0 when none), asked of the very checks Buy
runs, the payment aside; `Params` (the longest player window, the batch, the coin, from
config.gno); the
GRC721 surface (`TokenOfOwnerByIndex` from the locker's index, no
`TokenByIndex`); `TokenMetadata` (name, description, image,
`external_url`, attributes Tier, Series and an earned gnome's Kind);
`Render` for gnoweb (the collection, a gnome with a `gnokey` line to buy it
while on sale, an earned kind, a player).
`TokenURI` is an SVG drawn on read, its name escaped; a portrait drawn from
the traits is the user's call.

## Threats, and the test for each

| function | threat | answer | test |
|---|---|---|---|
| Buy, MintEarned | a realm or run script relays the call and keeps the coins it attached | direct user call only | `TestBuyMustBeADirectUserCall`, `TestAProvenKindIsMintedFreeOnce` |
| Buy | underpay, overpay, another denom, two coins | exact single coin | `TestBuyRefusesAnyOtherPayment`, `TestBuyTakesUpToFiveAtTheirSum` |
| Buy | malformed list: repeats, blanks, signs, leading zeros, huge numbers | strict parse, 1 to 5 | `TestBuyReadsItsIDsStrictly` |
| Buy | the same gnome twice; a burned gnome sold again | sold once, for good | `TestAGnomeSellsOnce`, `TestABurnIsTheHoldersAndForGood` |
| Buy | more than one Legendary to a wallet; a Legendary sold twice | lifetime cap 1; sold once | `TestALegendaryIsBoughtOneAWallet` |
| Buy | before a wave, outside every wave | refused | `TestAWaveOpensItsIDsAtItsStart` |
| Buy | a non-player in the player window, a player over its cap | store record, per-wave cap | `TestThePlayerWindowIsForPlayers`, `TestARecordInEitherModeCounts` |
| Buy | a wallet over its cap, in one call or several | lifetime cap per tier, batch checked whole | `TestAWalletBuysUpToItsLifetimeCap` |
| Worn | a gnome shown on a player who no longer holds it; a read that walks a whole collection | owner checked on read; the best is the holder's first row | `TestAPlayerWearsTheirBestGnome`, `TestEquipShowsAnotherGnomeToEveryone`, `TestAnEarnedGnomeIsWornLast`, `TestWornManyAnswersABoardPage` |
| CanBuy | a refusal shown that Buy would not give, or the reverse | one check, shared | `TestCanBuyAndBuyNeverDisagree`, `TestCanBuySaysTheFirstRefusal` |
| SetPrice | an announced wave discounted or raised | waves keep their prices | `TestAWaveKeepsItsPrices` |
| SetCloseAt | the date pushed back; set by another; before the genesis; in the past | forward only, by this owner or the next; future only | `TestOnlyTheOwnerSetsTheCloseOncePublished`, `TestTheCloseComesForwardNeverBack`, `TestAnEmptyOwnerCannotSetTheClose` |
| Buy, AddWave | a sale after the close, at the boundary block | closed at the date's block | `TestTheSaleClosesAtItsDateToTheBlock`, `TestAClosedGnomeIsNeverSold` |
| SetCloseAt | a later series or an earned gnome closed by the genesis's date | the genesis only | `TestTheCloseIsTheGenesissOnly` |
| Buy | each sale rewriting the catalogue's rows (gas) | nothing that changes kept beside them | `z_storage_buy`'s `// Gas:` golden |
| MintEarned | a resent ghost, an archived version, a cup with no slot, one hole short, over par | the proof's rules | `TestWhatDoesNotCount`, `TestEachKindIsProvenAndRefusedOneShort`, `TestParMeansTheSumAtOrUnder` |
| MintEarned | rows of new rules, or a format the proof does not know; a cup past one page | refused, never a false proof | `TestNewRulesRefuseTheMint`, `TestARowNotAsGolfWritesItRefuses`, `TestACupTooLargeForThePageRefuses` |
| MintEarned | paid; twice for a kind | free only; once per player and kind | `TestAProvenKindIsMintedFreeOnce` |
| TransferFrom, Approve | an earned gnome sold or moved, by its player or an operator | vetoed by the ledger extension; approval refused | `TestAnEarnedGnomeIsBoundToItsPlayer`, `TestAnOperatorCannotMoveAnEarnedGnome` |
| Burn | another's gnome burned, by anyone or an operator | the holder only | `TestABurnIsTheHoldersAndForGood` |
| owner calls | anyone else; a realm the owner calls; no owner | immediate caller only | `TestAnEmptyOwnerHoldsNoPower`, `TestARealmTheOwnerCallsIsNotTheOwner`, `TestTheOwnerHandsOverInTwoSteps` |
| SetTreasury, AcceptTreasury | the money sent to a mistyped or dead address; to the realm itself; taken by another or by a realm | two steps, the new address signing; not the realm's address | `TestTheTreasuryMovesInTwoSteps`, `TestARealmCannotAcceptForTheTreasury`, `TestAnOfferToTheTreasuryInPlaceCancels` |
| Transfer, Accept | the money moved with the owner's role | the treasury stays | `TestAnOwnerHandoverLeavesTheTreasury`, `TestTheOwnerHandsOverInTwoSteps` |
| Buy, Sweep, royalty | a payment to the owner or kept by the realm | the treasury, in the same call | `TestTheTreasuryMovesInTwoSteps`, `TestTheSweepPaysTheTreasury` |
| SetSiteURL | a link that breaks out of a page or points off https | golf's play link rule | `TestTheOwnerMovesTheSite` |
| init | a deploy with no signer | refused off `dev` | `TestTheDeployerOwns` |
| TransferFrom, Approve | a realm moves its caller's gnomes | the ledger's caller teller | `TestARealmCannotMoveItsCallersGnomes`, `TestTransfersGoThroughTheLedgersChecks` |
| Equip | wearing another's gnome; a gnome sold on | owner checked on write and on read | `TestEquipWearsAGnomeTheCallerOwns`, `TestAGnomeSoldIsNoLongerWorn` |
| AddSeries | a malformed row; a gap; growth without bound | checked whole; 64 series of 1,000 rows | `TestASeriesIsRefusedWhole`, `TestASeriesIsBounded` |
| AddWave | overlaps; too many | checked; 64 waves | `TestAWaveIsCheckedWhole`, `TestTheWavesAreBounded` |
| reads | a query made unbounded | bounded pages and lists | `TestEquippedManyAnswersABoardPage`, `TestWornManyAnswersABoardPage`, `TestGnomesOfPagesAWallet`, `TestACollectionOf1_50And205ReadsInPages` |
| Worn | a gnome shown that the player no longer owns; the best-first index left behind by a transfer or a burn | equipped only while owned; the holder's row moved by the ledger's hook and Burn | `TestEquipShowsAnotherGnomeToEveryone`, `TestAnEarnedGnomeIsWornLast` |
| TokenURI, TokenMetadata | markup or JSON in a name | escaped | `TestANameCannotInjectMarkup`, `TestMetadataEscapesTheName` |
| TokenMetadata | an earned gnome's link to a page the static site never builds (one per earned id) | its kind's page, `g/<kind>/` | `TestAnEarnedTokensMetadataNamesItsKind` |

Reentrancy: the only calls out are to the banker, which runs no code, and
store's reads, which write nothing; each send comes after the state is
written. Overflow: a Buy's sum is at most 5 times the highest price
SetPrice takes. Not tested, and not built: `Renounce` (open); the close is a
date in block time, so it holds whatever becomes of the owner.

## Consequences

- A new drop is two owner calls, `AddSeries` and `AddWave`; a new price,
  one. No redeploy. A later series's closing date is a decision of its own
  (the genesis's date does not close it).
- The client draws a gnome from its traits; an unknown version or trait
  falls back to a plain gnome (the client's side, not this realm's).
- Store's layout is now read by a second realm: `totals` for the player
  window, `slots`, `bests`, `copies` and `holes` for the proof. Rules that
  change them must keep the same answers, or the proof refuses until gnomes
  is updated.
- `scripts/stage.sh` stages `r/gnogolf/gnomes` beside store; the proof's
  golf/v2 path is rewritten with the other paths.
- After deploy the owner sets the site (`SetSiteURL`) and moves the
  treasury to its own address (`SetTreasury`, then `AcceptTreasury` from
  that address), before the genesis is published.
- `p/gnogolf/weblink` is one more package to deploy, before gnomes
  (stage.sh stages it).
- In `gno test`, a recovered call's writes are not reverted (golf's
  `z_worst_shot` notes the same): the earned veto is tested as an abort, and
  on chain the abort reverts the whole call.
