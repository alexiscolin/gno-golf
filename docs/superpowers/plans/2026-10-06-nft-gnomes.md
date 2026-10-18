# Collectible gnomes: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `gno.land/r/gnogolf/gnomes` (a GRC721 whose catalogue is data published in series: the genesis is 720 gnomes, 504 Common, 144 Rare, 65 Epic and 7 Legendary, every one sold by id at a fixed price in one sale of the whole series (its seven Legendaries with it, one a wallet), until a closing date that can only come earlier; plus the nine earned gnomes minted free once store proves the feat, and the gnome each player shows, their best owned one unless they equip another) and the client that draws, sells, shows and shares them, without touching golf/v2, store, the physics or the wasm.

**Architecture:** One new realm beside golf/v2 and store. It imports grc721 v0 and royalty v0, and reads store's rows (never golf/v2) for the earned proofs (through a small interface the tests replace) and for the player window. The catalogue is data: `data/gnomes/` (`series.json`, and each series' `archetypes.json`, `epics.json`, `legendaries.json`) makes `data/gnomes.json` through `scripts/gnomes.ts`, which `check.sh` holds to the data and to every rule; `scripts/gnomesrows.ts` writes from it the rows the owner publishes with `AddSeries`. A token's traits are format 1 of `web/lib/gnomes/codec.ts`, the version first, opaque to the realm; the client maps them to the `Skin` it already draws, plain where it does not know a code. Every gnomes call is a transaction of its own; each gnome gets a static page, and its picture is the game's own drawing, made once in headless Chrome.

**Tech stack:** Gno 0.9 on the onyx toolchain (`gno test`, filetests with `// Gas:` and `// Storage:` goldens), `gno.land/p/nt/grc721/v0`, `royalty/v0`, `bptree/v0`; Next.js static export, three.js, Node's test runner with `--experimental-strip-types`; headless Chrome for the thumbnails (`media/gnomes/render.mjs`), no image library.

**Spec:** [docs/superpowers/specs/2026-10-06-nft-gnomes-design.md](../specs/2026-10-06-nft-gnomes-design.md). Read it before any task; section numbers below ("§7") are its sections. Read also README.md ("Running it locally"), CLIENT.md, docs/golf.md, ADR-003, ADR-004's notes on store, and the research brief ([docs/superpowers/research/2026-10-06-nft-best-practices.md](../research/2026-10-06-nft-best-practices.md)).

**Revised 2026-10-06** to the user's final decisions (the spec's Status lists them): 720 gnomes (504/144/65/7); prices Common 36 GNOT (the par of nine holes), Rare 72 (the par of a course), Epic 336 (the dimples on a golf ball), Legendary 1296 (18 holes × par 72), the owner's to change before a sale opens, never lower on what is on sale; one sale a series, every gnome of it at once, opening with a 48-hour player window (first planned as waves of one world each; waves removed 2026-10-18, ADR-013); a hard closing date for the genesis (`SetCloseAt`: earlier, never later; set at launch; what is unsold then is never minted); the catalogue versioned in series, traits with a version prefix, unknown traits drawn plain, every count defined once; no Legendary named King or wearing a crown.

**Revised again 2026-10-06**, final: **no auction.** The seven Legendaries are sold at their fixed price by the same `Buy`, one a wallet. The auction was dropped for simplicity (no escrow, no refunds, less code and fewer tests) and for legal clarity (no bid as an order, no auction rules to publish, no coins held by the realm). The built `auction.gno` is removed (Milestone 4). Also decided: wearing is free by default (`Worn`: everyone shows their best owned gnome, derived from the chain; any owned gnome plays free in the player's browser; `Equip` is optional); a treasury apart from the owner, changed in two steps; the site URL set by the owner (`SetSiteURL`); the portrait drawn on chain from the traits; the shop (never the game) refused by Netlify country rules for CN, CU, IR, KP, SY, RU and BY, the EU and the UK not blocked for now; no free gift to buyers; the seller an individual in Japan.

**Much of it is built** in two worktrees, uncommitted (the spec's "Built so far vs this spec" compares them with the spec): the realm's sale, waves (since replaced by one sale a series, ADR-013), auction (to remove) and equip in `.claude/worktrees/nft-gnomes`, the catalogue, codec and drawing in `.claude/worktrees/gnome-designs`. A task marked **(built)** has code there. For it, the steps are: read the built code against the task's tests and the spec, add the tests it lacks, make the changes the spec's table assigns to the code, and land it. Where the built realm names a thing differently from a task not rewritten here (`held` for `owned`, the payment inline in `Buy` rather than in `pay.gno`, ids as `string`), the built name wins, and the task's snippets are read in that light.

## Global constraints

Copied from the spec. Every task's requirements include these.

- golf/v2 and store are not modified, and never import or call gnomes. No gnomes message ever rides in the same transaction as a golf message (§11, §14).
- No trait reaches the chain's physics; the ball stays `BALL_R / 0.55`; nothing is pay-to-win (§1).
- No random draw anywhere: every token is chosen by id, its traits public before the call (§2, §15).
- The catalogue is published in series by `AddSeries`, rows `id|tier|name|traits`, ids following on with no gap, checked whole, never changed; at most 64 series of 1,000 rows. The genesis is the first series, ids 1 to 720 (§2, §9).
- Every count is defined once: `data/gnomes/series.json`'s `supply` (504, 144, 65, 7 for the genesis); the realm's `genesisSupply` and every client number are held to it by a check (§2).
- The genesis's worlds, one range of ids each (its Commons, Rares, Epics, then its Legendary), all sold in the one sale: 1–104 Garden, 105–208 Island, 209–311 Town, 312–414 Mountain, 415–516 Mines, 517–618 volcano, 619–720 storm (§2). The Legendaries are ids 104, 208, 311, 414, 516, 618, 720.
- Ids: decimal, no leading zero; `"1"` to the catalogue's last id for its gnomes, `"1000001"` up for earned tokens; anything else is "no such gnome" (§2, §5, §14).
- Starting settings: closed (`SetMintOpen(false)`), no closing date; prices Common 36 GNOT, Rare 72, Epic 336, Legendary 1296 (36, 72, 336, 1,296 × 10⁶ ugnot); `SetPrice` 1 to 10,000 GNOT, for the sales opened after it; a sale keeps the prices it opened with, so nothing on sale ever gets cheaper (§6). If all 720 sold at these prices: 504 × 36 + 144 × 72 + 65 × 336 + 7 × 1,296 = 18,144 + 10,368 + 21,840 + 9,072 = 59,424 GNOT.
- The closing date: `SetCloseAt(at)`, owner only; the genesis's `OpenSale` and `SetMintOpen(true)` are refused while it is unset, so it is set at launch; once set it only moves earlier, never later and never into the past; the genesis's sale cannot start at or after it; from it on, `Buy` refuses every genesis id ("sale closed") and what is unsold is never minted (§6).
- The sale (ADR-013): `OpenSale(series, start, playerHours)`, owner only, once a series, every id of it at once, start from a day back to a year ahead, the prices in force frozen into it; `CancelSale(series)` only before it starts, nothing of it sold; the genesis's sale opens with a 48-hour player window: wallets with a standing in store's `totals`, at most 3 Commons, 2 Rares, 1 Epic, 1 Legendary each in that window (counted per series and buyer); lifetime caps Common 10, Rare 5, Epic 2, Legendary 1 (§6).
- `Buy`: 1 to 5 ids, any tier, Legendaries included; guard order `IsUserCall`, the closing date, ids (each in a started sale, unsold), player window and caps, `OriginSend()` exactly one `ugnot` coin of the exact sum of the sale prices, the state, then one `OriginSend` banker send to the treasury (§6).
- No auction, no escrow: the realm never holds coins (a sale is forwarded in its own call; `Sweep` forwards anything sent by mistake) (§6).
- The treasury is not the owner: a staged constant per chain at deploy, checked in `init` (valid, not the realm's, not the owner's), changed in two steps (`SetTreasury` offers, the new address calls `AcceptTreasury`). Royalty 5% (500 bps) by default to the treasury (§4, §5). The site's URL is the owner's setting (`SetSiteURL`, `https://`, at most 128 bytes), read by `TokenMetadata` and `Render`.
- Wearing: `Worn(player)` is the gnome a player shows everyone: their `Equip` choice while they still own it, else their best owned gnome (Legendary, Epic, Rare, Common, then earned; ties to the lowest id) among the first 100 rows of their `owned` index. Any owned gnome plays free in its owner's browser; `Equip` is optional and always a transaction of its own (§5, §11).
- Refusals are string constants, never `errors.New` values kept in state (§9). Every JSON answer starts with `"version":1` (§5).
- The earned proof reads store with golf/v2's key layout, skips a best that has a `copies` row, panics on a hole entry not of format `"1"` and on strokes that are not one to three digits and a space, and refuses while `store.Writer()` is not the golf/v2 path it was built against (§7).
- Earned tokens are bound: transfer and approval refused; a burn's cleanup is in the `Burn` wrapper, not `OnBurn` (§8).
- Traits: format 1, 29 bytes as 58 lowercase hex, byte 0 the format (§10). Tables append only. A code past a table, a colour past the palette, a short string: drawn plain; another format: the Classic under the token's name.
- The client: everything behind `NEXT_PUBLIC_GNOMES=1` (and `?gnomes` in a dev build); unset, the game is as today (§11).
- Effects: trail only while rolling, ≤ 0.6 opaque, ≤ 1.5 board units, gone 0.6 s after the stop, under the aim line, no depth writes; holing effect after `DROP_MS` (320 ms), ≤ 1.5 s, no flash; reduced motion: no trails or particles, a still frame; entrances never block aiming, never on a retry, a ghost or a clip (§1).
- Budget per gnome: §1's table, with x/z half-extent ≤ 1.1 × the Classic's `reach` and height ≤ the Wizard's tall hat. (The designer's `BUDGET` is higher for Commons, Rares and Epics; the spec's limits hold until the user decides, §"Built so far".)
- Sharing adds no server: static pages, pictures made once and committed (§12, ADR-003).
- No Common, Rare or Epic copies a gnome of `GNOMES`; no sale token wears `stars`, `horns`, `parrot`, `mask`, `sash`, `crown`, `cape` or `lamp`, nor an earned gnome's signature combination; no Legendary is named King or wears a crown (§3).
- Names match `[A-Za-z' -]{3,24}` and are unique; no player text enters the portrait, and the realm escapes the name anyway (§10, §14).
- The repo's writing style: plain, precise sentences; English; no marketing words. Shop copy never speaks of floors, returns, flipping or "early is cheaper"; counters count the sale up, never a collection down; no fake timers; no free gift to buyers (a "Founding Gnome" or the like is a premium under Japan's 景品表示法) (§15).
- The shop, never the game, is refused by Netlify country rules (`netlify.toml`, `Country` conditions) for CN, CU, IR, KP, SY, RU and BY; the EU and the UK are not blocked for now; the realm itself cannot be geoblocked (§15). The seller is an individual living in Japan.

## Conventions for every task

The Gno commands use the onyx toolchain, as `scripts/check.sh` does. Once per shell:

```sh
t=${GNO_TOOLCHAIN:-$HOME/.cache/gno-toolchains/onyx}
export PATH=$t:$PATH GNOHOME=$t/gnohome
```

- One Gno test: `gno test ./gno.land/r/gnogolf/gnomes -run TestName -v` (from the repo root).
- The realm's filetests and goldens: `gno test ./gno.land/r/gnogolf/gnomes` (a filetest is selected by `-run 'TestFiles/<file name>'`; if the onyx toolchain does not select it that way, run the whole package); a new `// Gas:` or `// Storage:` golden is written with `-update-golden-tests`, then read and kept only if it is plausible (each task says what is plausible).
- One client test file: `(cd web && node --experimental-strip-types --disable-warning=ExperimentalWarning --import ./test/setup.mjs --test test/gnomes.test.ts)`. The whole client suite with its coverage floor: `(cd web && npm test)`.
- The full check: `scripts/check.sh` (Gno tests, fingerprints, staging, wasm, types, lint, selfcheck, unit tests). Every milestone ends with it green.
- `testing.SetRealm` acts on the frame that calls it: call it in the test's own body, never in a helper (store's tests say so). After every `testing.SkipHeights`, set `SetRealm` and `SetOriginSend` again: it resets the context (§16).
- `testing.SetOriginSend` reports an envelope but does not credit the realm: every paid call in a test is preceded by `envelope(n)` (Task 4), which issues the same coins to the realm's address.
- Commit at the end of each task, with a message in the repo's style (a plain sentence on what changed and why) ending with the attribution lines the session gives.

## Files

Realm, `gno.land/r/gnogolf/gnomes/` (as built, then what is to add):

| file | holds |
|---|---|
| `gnomod.toml` | `module = "gno.land/r/gnogolf/gnomes"`, `gno = "0.9"` |
| `config.gno` | the numbers in one place: `tiers` (name, price at deploy), `genesisSupply`, `lifetimeCap` (10/5/2/1), `playerCap` (3/2/1/1), the price bounds, `maxBatch`, `royaltyBps`, `maxURL`, the staged `treasuryAtDeploy` and `siteAtDeploy` |
| `gnomes.gno` | the state, `init`, `setUp`, `SetMintOpen`, `mintTo`, `isSold`, the refusal strings |
| `owner.gno` | owner, pending; `Transfer`, `Accept`, `Renounce`; the treasury (`SetTreasury`, `AcceptTreasury`); `SetSiteURL` |
| `close.gno` (to add) | `closeAt`, `SetCloseAt`, `closed(now)` |
| `catalogue.gno`, `rows.gno` | `AddSeries`, the series, a row found by bisection, `parseRow` |
| `sale.gno` (first built as `waves.gno`; ADR-013) | `OpenSale`, `CancelSale`, `SetPrice`, `saleOf`, `saleAt` |
| `players.gno` | `hasRecord`: the player window's read of store |
| `buy.gno` | `Buy`, `parseIDs` |
| `sweep.gno` | `Sweep` (moved out of the built `auction.gno`, which is deleted with the auction: Milestone 4) |
| `holdings.gno` | the ledger extension: the `held` index, the equipped gnome dropped when it leaves its holder, an earned token's transfer vetoed (to add) |
| `equip.gno` | `Equip`, `Worn`, `WornMany` (the built `Equipped`, `EquippedMany` renamed and extended) |
| `token.gno` | the GRC721 surface, `RoyaltyInfo` |
| `read.gno` | `Collection`, `Gnome`, `Sold`, `GnomesOf` |
| `svg.gno` | `TokenURI` (a placeholder today; the portrait drawn from the traits, decided, to add) |
| `earned.gno` (to add) | the store reader, row parsers, the cup proof, `Proof`, `MintEarned` |
| `burn.gno` (to add) | `Burn` and its cleanup |
| `metadata.gno`, `render.gno` (to add) | `TokenMetadata`, `Render` |
| `*_test.gno`, `z_*_filetest.gno` | tests and goldens |

Data and scripts: `data/gnomes/series.json` and `data/gnomes/<series>/{archetypes,epics,legendaries}.json` (the catalogue's source), `data/gnomes.json` (generated, committed), `scripts/gnomes.ts` (makes and checks it), `scripts/gnomesrows.ts` (to add: the `AddSeries` rows, and the realm's `genesisSupply` held to `series.json`), `scripts/gnomesproof.ts` (compares `Proof` with golf/v2 on onyx), `media/gnomes/render.mjs` and `webp.mjs` (the thumbnails and the Legendaries' turntables, committed under `media/gnomes/`).

Client: `web/lib/gnomes/` (`vocab.ts`, `codec.ts`, `skin.ts`, `catalogue.ts`, `generate.ts`, `validate.ts`, `props.ts`, `colour.ts`: built), `web/lib/scene/gnome-kit.ts`, `gnome-matter.ts`, `gnome-props.ts`, `gnome-legend.ts`, `gnome-fx.ts`, `gnome-showcase.ts` (built), changes to `web/lib/scene/gnome.ts` (built); to add: `web/components/Gnomes.tsx` (shop, receipt, earned), `web/app/g/[id]/page.tsx`; changes to `web/lib/chain.ts`, `web/lib/adena.ts`, `web/lib/prefs.ts`, `web/lib/engine.ts`, `web/lib/engine/rival.ts`, `web/lib/engine/clip.ts`, `web/lib/testhooks.ts`, `web/components/Golf.tsx`, `Leaderboard.tsx`, `Modes.tsx`, `Share.tsx`, `Tip.tsx`, `web/app/sitemap.ts`, `web/package.json`, `web/test/all.test.ts`, `scripts/check.sh`, `scripts/stage.sh`, `scripts/smoke.ts`, `media/og/og.mjs`, `netlify.toml` (the shop's country rules).

Docs: `docs/gnomes.md`, `docs/gnomes/design.md` (the designer's rules, cited by the code and not yet written), the ADR (drafted as `adr/adr-007-gnomes.md`), README.md, CLIENT.md.

## Milestones

1. **Feasibility on the onyx toolchain** (Tasks 1–9): the riskiest parts, proven first. A GRC721 with royalty and the realm's own hooks; a paid direct call checked exactly and forwarded with an `OriginSend` banker under the harness; relays refused; an earned token's transfer vetoed by a hook; the proof read from store's real row format; and the King proof's gas measured by filetests, with a go/no-go gate. (The paid call, the relays and the hooks are built; the earned parts are not.)
2. **The catalogue and its traits** (Tasks 10–16): built, but for the rows script, the earned ids and the Garden Legendary's name.
3. **The sale and the GRC721 surface** (Tasks 17–27): built, but for the new prices and caps, approvals of earned tokens, `Burn`, `Worn`, `GnomesOf`'s paging and the storage goldens' re-measure.
4. **No auction; the closing date, the treasury, the site** (Tasks 28–33): the built auction removed, Legendaries through `Buy`, `SetCloseAt`, the two-step treasury, `Renounce`, `SetSiteURL`.
5. **Earned gnomes** (Tasks 34–36).
6. **Portrait, metadata, Render** (Tasks 37–40).
7. **Client data layer** (Tasks 41–47).
8. **Drawing the gnomes** (Tasks 48–56): the drawing is built; the engine, ghost and clip wiring are not.
9. **The screens** (Tasks 57–64).
10. **Pages and pictures** (Tasks 65–67): the thumbnails are built.
11. **Docs, smoke, the rollout's checks** (Tasks 68–73).

Then the verification checklist.

---

## Milestone 1: feasibility on the onyx toolchain

Why first: every later milestone builds on four things no test in the repo has done yet. (a) A realm-held grc721 ledger whose extension hooks write the realm's own trees and veto a transfer. (b) A paid call under `gno test`: `IsUserCall`, `unsafe.OriginSend`, and an `OriginSend` banker that can only spend this call's envelope, with the harness traps of §16. (c) Reading golf/v2's rows from store without golf/v2. (d) The King proof's gas: the client asks 300M; if the measured figure is far above it, §7 needs rethinking before anything else is built. If any task of this milestone fails in a way its "if it fails" note does not cover, stop and report to the owner before going on.

### Task 1: the toolchain and a green baseline

**Files:** none changed.

- [ ] **Step 1: Build the onyx toolchain** as README.md "Running it locally" says (a `chain/onyx` worktree of `../gno`, then `gno`, `gnokey`, `gnodev` into `$t`).

```sh
t=${GNO_TOOLCHAIN:-$HOME/.cache/gno-toolchains/onyx}
git -C ../gno worktree add ../gno-onyx chain/onyx
(cd ../gno-onyx/gnovm && go build -o $t/gno ./cmd/gno)
(cd ../gno-onyx/gno.land && go build -o $t/gnokey ./cmd/gnokey)
(cd ../gno-onyx/contribs/gnodev && go build -o $t/gnodev .)
```

- [ ] **Step 2: Run the full check before any change.**

Run: `scripts/check.sh`
Expected: ends with `all checks passed`. If not, fix nothing here: report it, since every milestone's "green" is measured against this baseline.

- [ ] **Step 3: Confirm the onyx APIs the spec relies on** (it checked master 87f0357 and says onyx matches but for comments). In `../gno-onyx`:

```sh
grep -n "func (r Realm) IsUserCall\|func (r Realm) IsUserRun" gnovm/stdlibs/chain/runtime/frame.gno
grep -n "BankerTypeOriginSend\|func NewBanker" gnovm/stdlibs/chain/banker/banker.gno
grep -n "func OriginSend" gnovm/stdlibs/chain/runtime/unsafe/unsafe.gno
grep -n "func SetOriginSend\|func IssueCoins\|func NewCodeRealm\|func MakeRealm\|func SkipHeights" gnovm/tests/stdlibs/testing/context_testing.gno
grep -n "func NewToken\|func (led \*PrivateLedger) CallerTeller\|func (led \*PrivateLedger) RegisterExtension" examples/gno.land/p/nt/grc721/v0/*.gno
grep -n "func NewRoyalty\|func (led \*Ledger) SetDefaultRoyalty" examples/gno.land/p/nt/grc721/royalty/v0/token.gno
```

Expected: every line found. Note whether `MakeRealm` exists on onyx (Task 5 uses it if so). Write the answers in the task's commit message; nothing else is committed.

### Task 2: the realm's skeleton, wired into check.sh and stage.sh

**Files:**
- Create: `gno.land/r/gnogolf/gnomes/gnomod.toml`, `gno.land/r/gnogolf/gnomes/gnomes.gno`, `gno.land/r/gnogolf/gnomes/gnomes_test.gno`
- Modify: `scripts/check.sh` (the `gno test` line), `scripts/stage.sh` (`pkgs` and its header comment)

**Interfaces:**
- Produces: `token *grc721.Token`, `ledger *grc721.PrivateLedger`, `teller grc721.Teller`, `self address` (the realm's address), `build(cur realm)`, `Name() string`, `Symbol() string`, `TotalSupply() int64`.

- [ ] **Step 1: Write the failing test** `gnomes_test.gno`:

```go
package gnomes

import (
	"testing"

	"gno.land/p/nt/testutils/v0"
	"gno.land/p/nt/uassert/v0"
)

var (
	boss  = testutils.TestAddress("boss")
	heir  = testutils.TestAddress("heir")
	vault = testutils.TestAddress("vault")
	alice = testutils.TestAddress("alice")
	bob   = testutils.TestAddress("bob")
	carl  = testutils.TestAddress("carl")
)

// fresh is the deploy, in each test: a new collection and empty indexes.
// (Later tasks add the settings it resets.)
func fresh(cur realm) {
	build(cur)
}

func TestTheCollectionIsNamed(cur realm, t *testing.T) {
	fresh(cur)
	uassert.Equal(t, "Gnogolf Gnomes", Name())
	uassert.Equal(t, "GNOME", Symbol())
	uassert.Equal(t, int64(0), TotalSupply())
}
```

- [ ] **Step 2: Run it.** `gno test ./gno.land/r/gnogolf/gnomes -run TestTheCollectionIsNamed -v`
Expected: FAIL, `build`, `Name` undefined (or "no such package" before `gnomod.toml` exists).

- [ ] **Step 3: Write the skeleton.** `gnomod.toml`:

```toml
module = "gno.land/r/gnogolf/gnomes"
gno = "0.9"
```

`gnomes.gno`:

```go
// Package gnomes makes Gnogolf's gnomes tokens: a GRC721 collection whose
// catalogue the owner publishes in series (the genesis: 720 gnomes), each chosen by its id and seen before it is paid for (every
// tier at a fixed price, until a closing date that only comes earlier), and
// the nine gnomes players earn, minted free once store proves the feat and
// bound to their player. It also says which gnome each player shows (Worn). It is cosmetic:
// golf rolls the same ball whatever a gnome looks like, and neither golf nor
// store imports this realm. docs/gnomes.md is its API.
package gnomes

import (
	"gno.land/p/nt/grc721/v0"
)

var (
	token  *grc721.Token
	ledger *grc721.PrivateLedger
	teller grc721.Teller // acts as the caller: cur.Previous()
	self   address       // this realm's address
)

func init(cur realm) { build(cur) }

// build makes the collection and every index empty: init's work, and each
// test's fresh start.
func build(cur realm) {
	token, ledger = grc721.NewToken("Gnogolf Gnomes", "GNOME", 0, cur)
	teller = ledger.CallerTeller()
	self = cur.Address()
}

func Name() string        { return token.GetName() }
func Symbol() string      { return token.GetSymbol() }
func TotalSupply() int64  { return token.TotalSupply() }
```

- [ ] **Step 4: Run it.** Same command. Expected: PASS.

- [ ] **Step 5: Wire it in.** In `scripts/check.sh`, the `gno test` line gains `./gno.land/r/gnogolf/gnomes`:

```sh
(cd "$root" && GNOHOME=$toolchain/gnohome "$GNO" test ./gno.land/p/gnogolf/... ./gno.land/r/gnogolf/golf/... ./gno.land/r/gnogolf/store ./gno.land/r/gnogolf/gnomes)
```

In `scripts/stage.sh`, `pkgs` gains `gno.land/r/gnogolf/gnomes` after store, and the header's list gains the line `r/gnogolf/gnomes  ->  r/<ns>/gnogolf/gnomes   the gnomes (the gnomes' ADR)`.

- [ ] **Step 6: Run the staging check.** `GNO=$t/gno scripts/stage.sh nym-stagecheck000 /tmp/gnomes-stage && MAINNET=1 GNO=$t/gno scripts/stage.sh nym-stagecheck000 /tmp/gnomes-stage`
Expected: both lint clean and print a size line for `gno.land/r/nym-stagecheck000/gnogolf/gnomes`.

- [ ] **Step 7: Commit.**

### Task 3: owner, treasury and royalty at deploy

**Built differently:** the realm's `owner.gno` makes the deployer the owner and the treasury at once, with no `SetTreasury` and no `Renounce`; under `gno test` (chain "dev") it uses `testDeployer`. **Decided:** the treasury is kept apart from the owner (a cold address that only receives), so the built code changes to this task: the deploy's treasury is a constant staged per chain (`treasuryAtDeploy`, rewritten by `scripts/stage.sh` as the imports are), and `init` refuses a deploy whose treasury is invalid, the realm's own or the deployer's. Changing it later takes two steps (Task 31).

**Files:**
- Create: `gno.land/r/gnogolf/gnomes/owner.gno`, `gno.land/r/gnogolf/gnomes/owner_test.gno`
- Modify: `gnomes.gno` (`build` registers royalty, `init` calls `setUp`), `gnomes_test.gno` (`fresh`)

**Interfaces:**
- Produces: `owner, pending, treasury address`; `royal *royalty.Royalty`; `royalLedger *royalty.Ledger`; `setUp(deployer, vault address, chainID string)`; `isOwner(a address) bool`; `treasuryAtDeploy address` (staged); `devTreasury address`; constants `defaultBps = 500`, `maxBps = 1000`; `RoyaltyInfo(id grc721.TokenID, salePrice int64) (address, int64, error)`.

- [ ] **Step 1: Write the failing tests** `owner_test.gno`:

```go
package gnomes

import (
	"testing"

	"gno.land/p/nt/uassert/v0"
	"gno.land/p/nt/urequire/v0"
)

func TestTheDeployerOwnsAndTheTreasuryIsApart(cur realm, t *testing.T) {
	build(cur)
	setUp(boss, vault, "onyx-1")
	uassert.Equal(t, boss, owner)
	uassert.Equal(t, vault, treasury)
	to, amount, err := RoyaltyInfo("1", 1_000_000)
	urequire.NoError(t, err)
	uassert.Equal(t, vault, to)
	uassert.Equal(t, int64(50_000), amount) // 5%
	build(cur)
	urequire.PanicsWithMessage(t, errTreasury, func() { setUp(boss, boss, "onyx-1") })
	urequire.PanicsWithMessage(t, errTreasury, func() { setUp(boss, self, "onyx-1") })
	urequire.PanicsWithMessage(t, errTreasury, func() { setUp(boss, "nope", "onyx-1") })
}

func TestNoDeployerOnlyUnderGnoTest(cur realm, t *testing.T) {
	build(cur)
	urequire.PanicsWithMessage(t, errNoDeployer, func() { setUp("", vault, "onyx-1") })
	setUp("", vault, "dev") // gno test: no signer
	uassert.Equal(t, address(""), owner)
	uassert.Equal(t, devTreasury, treasury)
	uassert.True(t, devTreasury.IsValid())
	uassert.NotEqual(t, self, devTreasury)
}
```

And `fresh` in `gnomes_test.gno` becomes:

```go
func fresh(cur realm) {
	build(cur)
	setUp(boss, vault, "onyx-1")
}
```

- [ ] **Step 2: Run.** `gno test ./gno.land/r/gnogolf/gnomes -run 'TestTheDeployerOwns|TestNoDeployer' -v`
Expected: FAIL, `setUp` undefined.

- [ ] **Step 3: Implement.** `owner.gno`:

```go
package gnomes

import "chain"

const (
	defaultBps = 500  // 5%, to the treasury
	maxBps     = 1000 // SetRoyaltyBps's bound

	errNoDeployer = "gnomes: no owner: gnomes must be deployed by an account"
	errTreasury   = "gnomes: the treasury must be a valid address, neither this realm's nor the owner's"
	errNotOwner   = "gnomes: only the owner can "
)

var owner, pending, treasury address

// treasuryAtDeploy receives every sale and the royalty from deploy: a cold
// address apart from the owner. scripts/stage.sh rewrites it per chain, as it
// rewrites the imports; the value here is gno test's.
const treasuryAtDeploy address = "g1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq" // staged; replaced per chain

// devTreasury is the treasury under gno test alone, where nobody signs the
// deploy: a valid address no key holds, so a test's sales land somewhere.
var devTreasury = chain.PackageAddress("gno.land/r/gnogolf/gnomes/treasury")

// setUp is init's: the deployer owns the collection, vault is its treasury,
// never the same address. Only gno test (chain "dev") runs it with no
// signer: the owner stays "", which holds no power, the treasury is
// devTreasury, and the sale's settings are those of a deploy that was opened
// (Task 18 says which), since nobody there could open it, as golf's setUp
// opens publishing.
func setUp(deployer, vault address, chainID string) {
	if deployer == "" {
		if chainID != "dev" {
			panic(errNoDeployer)
		}
		owner, treasury = "", devTreasury
		royalLedger.SetDefaultRoyalty(devTreasury, defaultBps)
		return
	}
	if !vault.IsValid() || vault == self || vault == deployer {
		panic(errTreasury)
	}
	owner, treasury = deployer, vault
	royalLedger.SetDefaultRoyalty(vault, defaultBps)
}

// isOwner is the one owner check: a live role, held by the caller.
func isOwner(a address) bool { return owner != "" && a == owner }
```

In `gnomes.gno`, `build` adds after the teller (import `"gno.land/p/nt/grc721/royalty/v0"`):

```go
	royal, royalLedger = royalty.NewRoyalty(ledger, maxBps)
```

declares `royal *royalty.Royalty` and `royalLedger *royalty.Ledger`, `init` becomes:

```go
func init(cur realm) {
	build(cur)
	setUp(unsafe.OriginCaller(), treasuryAtDeploy, runtime.ChainID())
}
```

(imports `"chain/runtime"`, `"chain/runtime/unsafe"`), and the read:

```go
func RoyaltyInfo(id grc721.TokenID, salePrice int64) (address, int64, error) {
	return royal.RoyaltyInfo(id, salePrice)
}
```

- [ ] **Step 4: Run.** Same command, then the whole package. Expected: PASS. If `SetDefaultRoyalty` returns an error the realm ignores, check it with `if err := …; err != nil { panic(err.Error()) }`.

- [ ] **Step 5: Stage it.** `scripts/stage.sh` rewrites `treasuryAtDeploy` from `GNOMES_TREASURY` (required for onyx and mainnet; the stage fails without it, or when it equals the deployer's address given as `GNOMES_OWNER`), and `siteAtDeploy` (Task 33) from the URL `web/lib/site.ts`' `SITE` resolves to. Run the staging check of Task 2 with `GNOMES_TREASURY` set: the staged `owner.gno` carries it.

- [ ] **Step 6: Commit.**

### Task 4: a paid call, checked exactly and forwarded **(built, inline in `Buy`)**

The core of every sale. Proves the `OriginSend` banker works under the harness.

**Files:**
- Create: `gno.land/r/gnogolf/gnomes/pay.gno`, `gno.land/r/gnogolf/gnomes/pay_test.gno`

**Interfaces:**
- Produces: `paid(cur realm, want int64) address` (the payer), `unpaid(cur realm) address` (a direct call with nothing attached), `forward(cur realm, amount int64)` (envelope to treasury), `sweepOut(cur realm, amount int64)` (the realm's own stray coins to the treasury: `Sweep` only), `balance() int64` (the realm's ugnot).
- Test helpers: `envelope(n int64)`, `coin(a address) int64`.

- [ ] **Step 1: Write the failing tests** `pay_test.gno`:

```go
package gnomes

import (
	"chain"
	"chain/banker"
	"testing"

	"gno.land/p/nt/uassert/v0"
	"gno.land/p/nt/urequire/v0"
)

// payProbe is a paid call of 5 GNOT and nothing else: the guard, then the forward.
func payProbe(cur realm) { paid(cur, 5_000_000); forward(cur, 5_000_000) }

// envelope attaches n ugnot to the next call, as gnokey's -send does. The
// harness reports it (SetOriginSend) but does not credit the realm, so the
// realm is credited by hand (IssueCoins), as the chain does before the call.
func envelope(n int64) {
	c := chain.Coins{chain.Coin{Denom: "ugnot", Amount: n}}
	testing.SetOriginSend(c)
	testing.IssueCoins(self, c)
}

func coin(a address) int64 { return banker.NewReadonlyBanker().GetCoin(a, "ugnot") }

func TestAPaidCallTakesExactlyItsPrice(cur realm, t *testing.T) {
	fresh(cur)
	for _, sent := range []chain.Coins{
		nil,
		{chain.Coin{Denom: "ugnot", Amount: 5_000_000}, chain.Coin{Denom: "ugnot", Amount: 1}},
		{chain.Coin{Denom: "uatom", Amount: 5_000_000}},
		{chain.Coin{Denom: "ugnot", Amount: 4_999_999}},
		{chain.Coin{Denom: "ugnot", Amount: 5_000_001}},
	} {
		testing.SetRealm(testing.NewUserRealm(alice))
		testing.SetOriginSend(sent)
		urequire.AbortsContains(t, cur, "attach exactly 5000000ugnot", func() { payProbe(cross(cur)) })
	}
	before := coin(vault)
	testing.SetRealm(testing.NewUserRealm(alice))
	envelope(5_000_000)
	payProbe(cross(cur))
	uassert.Equal(t, before+5_000_000, coin(vault), "the price is the treasury's")
	uassert.Equal(t, int64(0), coin(self), "the realm keeps nothing")
}
```

- [ ] **Step 2: Run.** `gno test ./gno.land/r/gnogolf/gnomes -run TestAPaidCall -v`
Expected: FAIL, `paid` undefined.

- [ ] **Step 3: Implement** `pay.gno`:

```go
package gnomes

import (
	"chain"
	"chain/banker"
	"chain/runtime/unsafe"
	"strconv"
)

const (
	errUserCall = "gnomes: this call must come straight from an account (gnokey maketx call, or a wallet), not from a realm or a script"
	errExact    = "gnomes: attach exactly "
	errNothing  = "gnomes: this call is free: attach nothing"
)

// caller is the account behind a direct user call: a realm or a maketx run
// script could attach coins and keep them while OriginSend still reports
// them, so only a direct call may pay (gnofly's guard).
func caller(cur realm) address {
	prev := cur.Previous()
	if !prev.IsUserCall() {
		panic(errUserCall)
	}
	return prev.Address()
}

// paid is a direct call carrying exactly want ugnot, as one coin.
func paid(cur realm, want int64) address {
	who := caller(cur)
	s := unsafe.OriginSend()
	if len(s) != 1 || s[0].Denom != "ugnot" || s[0].Amount != want {
		panic(errExact + strconv.FormatInt(want, 10) + "ugnot, as one coin")
	}
	return who
}

// unpaid is a direct call with nothing attached (MintEarned).
func unpaid(cur realm) address {
	who := caller(cur)
	if len(unsafe.OriginSend()) != 0 {
		panic(errNothing)
	}
	return who
}

// forward sends amount of this call's envelope to the treasury: an
// OriginSend banker spends this call's coins and nothing else.
func forward(cur realm, amount int64) {
	banker.NewBanker(banker.BankerTypeOriginSend, cur).
		SendCoins(self, treasury, chain.Coins{chain.Coin{Denom: "ugnot", Amount: amount}})
}

// sweepOut sends amount of the realm's own coins to the treasury. The realm
// holds none in the normal course (no escrow: there is no auction); this is
// for coins someone sent it by mistake, and only Sweep calls it.
func sweepOut(cur realm, amount int64) {
	banker.NewBanker(banker.BankerTypeRealmSend, cur).
		SendCoins(self, treasury, chain.Coins{chain.Coin{Denom: "ugnot", Amount: amount}})
}

// balance is the realm's ugnot.
func balance() int64 { return banker.NewReadonlyBanker().GetCoin(self, "ugnot") }
```

- [ ] **Step 4: Run.** Same command. Expected: PASS.

If it fails in `forward` with an `OriginSend` banker error (the harness does not treat the realm as the envelope's recipient): confirm by printing `unsafe.OriginSend()` and `coin(self)` before the send; then try `testing.SetOriginSend` after `IssueCoins`. If the harness cannot do it either way, keep the `OriginSend` banker in `forward` (the chain is what matters: gnofly does exactly this on mainnet), run the forward's assertions in a filetest instead (`z_pay_filetest.gno`, a `main` that sets the envelope and calls a `Buy` once Task 19 exists), and record the finding in the ADR (Task 69). Do not switch to a `RealmSend` banker for sales: it could spend more than the envelope.

- [ ] **Step 5: Commit.**

### Task 5: relays refused **(built)**

**Files:**
- Modify: `gno.land/r/gnogolf/gnomes/pay_test.gno`

- [ ] **Step 1: Write the failing test** (it fails only if `caller` is wrong; write it before trusting Task 4):

```go
func TestOnlyADirectCallPays(cur realm, t *testing.T) {
	fresh(cur)
	// a code realm relaying the call
	testing.SetRealm(testing.NewCodeRealm("gno.land/r/attacker/relay"))
	envelope(5_000_000)
	urequire.AbortsContains(t, cur, "straight from an account", func() { payProbe(cross(cur)) })
	// a maketx run script: its ephemeral realm, gno.land/e/<addr>/run
	testing.SetRealm(testing.NewCodeRealm("gno.land/e/" + alice.String() + "/run"))
	envelope(5_000_000)
	urequire.AbortsContains(t, cur, "straight from an account", func() { payProbe(cross(cur)) })
	uassert.Equal(t, int64(10_000_000), coin(self), "nothing forwarded: the chain would revert both sends")
}
```

- [ ] **Step 2: Run.** `gno test ./gno.land/r/gnogolf/gnomes -run TestOnlyADirectCallPays -v`
Expected: PASS with Task 4's code. If `NewCodeRealm` panics on the `gno.land/e/…` path ("should only be called for Realms"), and Task 1 found `testing.MakeRealm` on onyx, build that case as a realm whose address is alice's and whose path is the run path:

```go
	run := testing.MakeRealm(alice, "gno.land/e/"+alice.String()+"/run", testing.OriginRealm())
	urequire.AbortsContains(t, cur, "straight from an account", func() { payProbe(run) })
```

(in that form the probe receives a `cur` whose `Previous()` is the run realm; adjust to the harness: the point is a frame where `IsUserRun()` is true and `IsUserCall()` false). If neither works, keep the code-realm case, and leave a comment naming the harness limit; the guard is `IsUserCall`, which a run realm fails by its path.

- [ ] **Step 3: Commit.**

### Task 6: the hooks: the owned index and an earned token that never moves **(built in part)**

Built: `holdings.gno`, a ledger extension keeping `held` (`"<holder> <id on 9 digits>"`) and dropping a worn gnome when it leaves its holder. To add: the veto of an earned token's transfer, with earned ids from 1000001.

**Files:**
- Create: `gno.land/r/gnogolf/gnomes/hooks.gno`, `gno.land/r/gnogolf/gnomes/hooks_test.gno`
- Modify: `gnomes.gno` (trees in `build`, hook registered, `TransferFrom`, `OwnerOf`, `BalanceOf`)

**Interfaces:**
- Produces: trees `owned` (`"<owner> <id>"` → `""`), `equipped` (address → id), `earned` (`"<address> <kind>"` → id), `kinds` (id → kind), `bought` (address → `"c,r,e"`), all `*bptree.BPTree` made by `bptree.NewBPTree32()`; `idNum(id grc721.TokenID) (int, bool)`; `isEarned(id grc721.TokenID) bool`; `ownedKey(a address, id grc721.TokenID) string`; `TransferFrom(cur realm, from, to address, id grc721.TokenID)`; `OwnerOf`, `BalanceOf`; constant `errBound`, `errUnknown`; `firstEarned = 1_000_001`.

- [ ] **Step 1: Write the failing tests** `hooks_test.gno`:

```go
package gnomes

import (
	"testing"

	"gno.land/p/nt/grc721/v0"
	"gno.land/p/nt/uassert/v0"
	"gno.land/p/nt/urequire/v0"
)

func TestIdsAreStrictDecimals(t *testing.T) {
	for _, bad := range []grc721.TokenID{"", "0", "042", "4a", "-1", " 42", "1234567890"} {
		_, ok := idNum(bad)
		uassert.False(t, ok, string(bad))
	}
	n, ok := idNum("720")
	uassert.True(t, ok)
	uassert.Equal(t, 720, n)
	uassert.True(t, isEarned("1000001"))
	uassert.False(t, isEarned("720"))
}

func TestAMintAndATransferKeepTheIndex(cur realm, t *testing.T) {
	fresh(cur)
	urequire.NoError(t, ledger.Mint(alice, "42"))
	uassert.True(t, owned.Has(ownedKey(alice, "42")))
	testing.SetRealm(testing.NewUserRealm(alice))
	TransferFrom(cross(cur), alice, bob, "42")
	who, err := OwnerOf("42")
	urequire.NoError(t, err)
	uassert.Equal(t, bob, who)
	uassert.False(t, owned.Has(ownedKey(alice, "42")))
	uassert.True(t, owned.Has(ownedKey(bob, "42")))
}

func TestAnEarnedTokenNeverMoves(cur realm, t *testing.T) {
	fresh(cur)
	urequire.NoError(t, ledger.Mint(alice, "1000001"))
	testing.SetRealm(testing.NewUserRealm(alice))
	urequire.AbortsContains(t, cur, "bound to its player", func() { TransferFrom(cross(cur), alice, bob, "1000001") })
	who, _ := OwnerOf("1000001")
	uassert.Equal(t, alice, who, "the veto reverts the ledger's write")
}

func TestATransferUnequips(cur realm, t *testing.T) {
	fresh(cur)
	urequire.NoError(t, ledger.Mint(alice, "42"))
	equipped.Set(alice.String(), "42")
	testing.SetRealm(testing.NewUserRealm(alice))
	TransferFrom(cross(cur), alice, bob, "42")
	uassert.False(t, equipped.Has(alice.String()))
}
```

- [ ] **Step 2: Run.** `gno test ./gno.land/r/gnogolf/gnomes -run 'TestIds|TestAMint|TestAnEarned|TestATransfer' -v`
Expected: FAIL, `idNum` undefined.

- [ ] **Step 3: Implement** `hooks.gno`:

```go
package gnomes

import "gno.land/p/nt/grc721/v0"

const (
	firstEarned = 1_000_001
	errBound    = "gnomes: an earned gnome is bound to its player: it cannot be transferred or approved"
	errUnknown  = "gnomes: unknown gnome: "
)

// idNum is an id as a number: decimal, no leading zero, at most 9 digits.
func idNum(id grc721.TokenID) (int, bool) {
	s := string(id)
	if len(s) == 0 || len(s) > 9 || s[0] == '0' {
		return 0, false
	}
	n := 0
	for i := 0; i < len(s); i++ {
		if s[i] < '0' || s[i] > '9' {
			return 0, false
		}
		n = n*10 + int(s[i]-'0')
	}
	return n, true
}

func isEarned(id grc721.TokenID) bool { n, ok := idNum(id); return ok && n >= firstEarned }

func ownedKey(a address, id grc721.TokenID) string { return a.String() + " " + string(id) }

// hooks is the realm's own extension beside royalty. grc721 runs it after
// its own write; a panic here vetoes the movement (p/nt/grc721/v0/types.gno).
type hooks struct{}

func (hooks) ExtensionKind() string { return "gnogolf-gnomes" }

func (hooks) OnMint(to address, id grc721.TokenID) { owned.Set(ownedKey(to, id), "") }

func (hooks) OnTransfer(from, to address, id grc721.TokenID) {
	if isEarned(id) {
		panic(errBound)
	}
	if v, ok := equipped.Get(from.String()); ok && v.(string) == string(id) {
		equipped.Remove(from.String()) // Worn falls back to their best owned gnome
	}
	owned.Remove(ownedKey(from, id))
	owned.Set(ownedKey(to, id), "")
}

// OnBurn does nothing: grc721 removes the owner before it runs and gives it
// the id alone, so it cannot know whose rows to clear. Burn's wrapper does.
func (hooks) OnBurn(id grc721.TokenID) {}
```

In `gnomes.gno`: declare the five trees, make them in `build` before `NewRoyalty`, register `ledger.RegisterExtension(hooks{})` after it, and add:

```go
func OwnerOf(id grc721.TokenID) (address, error)  { return token.OwnerOf(id) }
func BalanceOf(owner address) (int64, error)      { return token.BalanceOf(owner) }

// TransferFrom moves a token the caller owns or was approved for; an earned
// token refuses (the hook).
func TransferFrom(cur realm, from, to address, id grc721.TokenID) {
	if err := teller.TransferFrom(0, cur, from, to, id); err != nil {
		panic("gnomes: " + err.Error())
	}
}
```

- [ ] **Step 4: Run.** Same command. Expected: PASS. This proves the hooks can write the realm's trees when called from grc721's code, and that a hook's panic reverts the ledger's write in a crossing call. If the veto panics but `OwnerOf` reads bob (the ledger write kept), the call is not reverted in the harness: re-run the same assertions in a filetest (a transaction aborts as a whole on chain); do not add a pre-check that duplicates the hook.

- [ ] **Step 5: Commit.**

### Task 7: reading golf/v2's rows from store

**Files:**
- Create: `gno.land/r/gnogolf/gnomes/earned.gno`, `gno.land/r/gnogolf/gnomes/earned_test.gno`

**Interfaces:**
- Produces: `type reader interface { Page(name, start, end string, limit int) string; Get(name, key string) (string, bool); Has(name, key string) bool; Writer() string }`; `var rows reader = storeReader{}`; `const rules = "gno.land/r/gnogolf/golf/v2"`; `worlds = []string{"garden", "island", "town", "mountain", "mines"}`; `pageRows(s string) [][2]string`; `parOf(id string) int`; `strokesOf(best string) int`; `lowerBest(id, player string) int` (0 for none); errors `errEntry`, `errBest`, `errRules`.
- Test helpers: `type fakeRows`, `newFake() *fakeRows`, `(f *fakeRows) set(name, key, value string)`, `entry(id string, par int) string`, `hole(f, world string, n, par int) string` (returns the version id), `best(f, id, mode, player string, strokes int)`, `copied(f, id, mode, player string)`.

- [ ] **Step 1: Write the failing tests** `earned_test.gno`:

```go
package gnomes

import (
	"strconv"
	"strings"
	"testing"

	"gno.land/p/nt/bptree/v0"
	"gno.land/p/nt/uassert/v0"
	"gno.land/p/nt/urequire/v0"
)

// fakeRows is store's reads over trees of the test's own: under gno test golf
// has no owner, so no slot can be published through it (golf/v2 owner.gno).
// The rows are written by hand in golf/v2's formats.
type fakeRows struct {
	c      map[string]*bptree.BPTree
	writer string
}

func newFake() *fakeRows { return &fakeRows{c: map[string]*bptree.BPTree{}, writer: rules} }

func (f *fakeRows) tree(name string) *bptree.BPTree {
	if f.c[name] == nil {
		f.c[name] = bptree.NewBPTree32()
	}
	return f.c[name]
}
func (f *fakeRows) set(name, key, value string) { f.tree(name).Set(key, value) }
func (f *fakeRows) Get(name, key string) (string, bool) {
	v, ok := f.tree(name).Get(key)
	if !ok {
		return "", false
	}
	return v.(string), true
}
func (f *fakeRows) Has(name, key string) bool { return f.tree(name).Has(key) }
func (f *fakeRows) Writer() string            { return f.writer }
func (f *fakeRows) Page(name, start, end string, limit int) string {
	var sb strings.Builder
	n := 0
	f.tree(name).Iterate(start, end, func(k string, v any) bool {
		s := v.(string)
		sb.WriteString(strconv.Itoa(len(k)) + ":" + k + strconv.Itoa(len(s)) + ":" + s)
		n++
		return n >= limit
	})
	return sb.String()
}

// entry is a hole's row as golf/v2's encodeEntry writes it: format "1", then
// 23 fields, each its length, ":" and itself; id, name, par first.
func entry(id string, par int) string {
	f := func(s string) string { return strconv.Itoa(len(s)) + ":" + s }
	s := "1:1" + f(id) + f("Hole") + f(strconv.Itoa(par))
	for i := 3; i < 23; i++ {
		s += "0:"
	}
	return s
}

var worldDigit = map[string]string{"garden": "0", "island": "1", "town": "2", "mountain": "3", "mines": "4"}

// hole publishes slot n of a world at version 1, with its par: golf/v2's slotKey and holes rows.
func hole(f *fakeRows, world string, n, par int) string {
	id := world + "/" + strconv.Itoa(n) + "/v1"
	pad := strconv.Itoa(n)
	for len(pad) < 3 {
		pad = "0" + pad
	}
	f.set("slots", worldDigit[world]+world+"/"+pad, id)
	f.set("holes", id, entry(id, par))
	return id
}

// best is a player's best on a version in a mode, as bestOf writes it.
func best(f *fakeRows, id, mode, player string, strokes int) {
	f.set("bests", id+" "+mode+" "+player, strconv.Itoa(strokes)+" 120 7 0.5,40")
}

// copied marks that best as a copy (golf/v2 copiesOf): kept, never ranked.
func copied(f *fakeRows, id, mode, player string) { f.set("copies", id+" "+mode+" "+player, "1") }

func TestTheRowsReadAsGolfWritesThem(t *testing.T) {
	f := newFake()
	rows = f
	id := hole(f, "garden", 7, 3)
	uassert.Equal(t, 3, parOf(id))
	got := pageRows(f.Page("slots", "0garden/", "0garden0", 300))
	uassert.Equal(t, 1, len(got))
	uassert.Equal(t, "0garden/007", got[0][0])
	uassert.Equal(t, id, got[0][1])
	uassert.Equal(t, 0, lowerBest(id, alice.String()), "no best")
	best(f, id, "assisted", alice.String(), 4)
	best(f, id, "pro", alice.String(), 2)
	uassert.Equal(t, 2, lowerBest(id, alice.String()), "the lower of the two modes")
	copied(f, id, "pro", alice.String())
	uassert.Equal(t, 4, lowerBest(id, alice.String()), "a copy does not count")
	copied(f, id, "assisted", alice.String())
	uassert.Equal(t, 0, lowerBest(id, alice.String()))
}

func TestARowNotAsGolfWritesItRefuses(t *testing.T) {
	f := newFake()
	rows = f
	f.set("holes", "garden/1/v1", "1:2"+"11:garden/1/v1") // format "2"
	urequire.PanicsWithMessage(t, errEntry+"garden/1/v1", func() { parOf("garden/1/v1") })
	for _, bad := range []string{"", "x 1", "1234 1", "12", " 1", "1a 1"} {
		urequire.PanicsContains(t, errBest, func() { strokesOf(bad) }, bad)
	}
	uassert.Equal(t, 7, strokesOf("7 120 3 0,1"))
	uassert.Equal(t, 120, strokesOf("120 9 3 0,1"))
}
```

(If `urequire.PanicsContains` does not exist on onyx, use `urequire.PanicsWithMessage` with the full message, `errBest + strconv.Quote(bad)`.)

- [ ] **Step 2: Run.** `gno test ./gno.land/r/gnogolf/gnomes -run 'TestTheRows|TestARowNot' -v`
Expected: FAIL, `parOf` undefined.

- [ ] **Step 3: Implement** the reading half of `earned.gno`:

```go
package gnomes

import (
	"strconv"

	"gno.land/r/gnogolf/store"
)

// rules is the golf realm whose rows the proof reads: their format is its
// (bests carry no format version), so while store's writer is another, the
// proof refuses. stage.sh rewrites the path with the other imports.
const rules = "gno.land/r/gnogolf/golf/v2"

const (
	errEntry = "gnomes: a hole entry not as golf/v2 keeps it: "
	errBest  = "gnomes: a best not as golf/v2 writes it: "
	errRules = "rules changed"
)

// worlds in golf/v2's order: a slot key's first digit (slotKey in golf/v2/data.gno).
var worlds = []string{"garden", "island", "town", "mountain", "mines"}

// reader is what the proof reads of store; the tests replace it (see earned_test.gno).
type reader interface {
	Page(name, start, end string, limit int) string
	Get(name, key string) (string, bool)
	Has(name, key string) bool
	Writer() string
}

type storeReader struct{}

func (storeReader) Page(name, start, end string, limit int) string { return store.Page(name, start, end, limit) }
func (storeReader) Get(name, key string) (string, bool)            { return store.Get(name, key) }
func (storeReader) Has(name, key string) bool                      { return store.Has(name, key) }
func (storeReader) Writer() string                                 { return store.Writer() }

var rows reader = storeReader{}

// field reads one "<len>:<value>" from s at i: the value and the next index, or ok false.
func field(s string, i int) (string, int, bool) {
	n, j := 0, i
	for j < len(s) && j-i < 6 && s[j] >= '0' && s[j] <= '9' {
		n = n*10 + int(s[j]-'0')
		j++
	}
	if j == i || j >= len(s) || s[j] != ':' || len(s)-j-1 < n {
		return "", 0, false
	}
	return s[j+1 : j+1+n], j + 1 + n, true
}

// pageRows is a store page's rows: key and value.
func pageRows(p string) [][2]string {
	var out [][2]string
	for i := 0; i < len(p); {
		k, j, ok := field(p, i)
		v, l, ok2 := field(p, j)
		if !ok || !ok2 {
			panic("gnomes: a store page not as store writes it")
		}
		out = append(out, [2]string{k, v})
		i = l
	}
	return out
}

// parOf is a version's par: field 2 of its entry, format "1" (encodeEntry).
func parOf(id string) int {
	s, ok := rows.Get("holes", id)
	if !ok {
		panic(errEntry + id)
	}
	f, i, ok := field(s, 0)
	if !ok || f != "1" {
		panic(errEntry + id)
	}
	var par string
	for k := 0; k < 3; k++ {
		if par, i, ok = field(s, i); !ok {
			panic(errEntry + id)
		}
	}
	n, err := strconv.Atoi(par)
	if err != nil || n < 1 {
		panic(errEntry + id)
	}
	return n
}

// strokesOf is a best's strokes: one to three digits, then a space (bestOf).
func strokesOf(b string) int {
	n, i := 0, 0
	for i < len(b) && i < 4 && b[i] >= '0' && b[i] <= '9' {
		n = n*10 + int(b[i]-'0')
		i++
	}
	if i == 0 || i > 3 || i >= len(b) || b[i] != ' ' || n == 0 {
		panic(errBest + strconv.Quote(b))
	}
	return n
}

// lowerBest is the player's lower best on a version, either mode, a copy
// not counting (golf/v2's Claim and finish path skip them too); 0 for none.
func lowerBest(id, player string) int {
	low := 0
	for _, mode := range []string{"assisted", "pro"} {
		k := id + " " + mode + " " + player
		b, ok := rows.Get("bests", k)
		if !ok || rows.Has("copies", k) {
			continue
		}
		if s := strokesOf(b); low == 0 || s < low {
			low = s
		}
	}
	return low
}
```

- [ ] **Step 4: Run.** Same command. Expected: PASS. Also `gno test ./gno.land/r/gnogolf/gnomes`: the import of store resolves locally (golf/v2 imports it the same way).

- [ ] **Step 5: Commit.**

### Task 8: the cup proof and `Proof`

**Files:**
- Modify: `gno.land/r/gnogolf/gnomes/earned.gno`, `earned_test.gno`

**Interfaces:**
- Produces: `type cup struct { holes, finished, strokes, par, aces int; missing []string }`; `cupOf(world, player string, withPar bool) cup`; `prove(kind, player string) (ok bool, c cup, reason string)`; `KINDS = []string{"wizard", "viking", "golden", "pirate", "diver", "baker", "mayor", "king", "miner"}` (byte 2 of the traits is the index + 1); `kindIndex(kind string) int` (0 for unknown); `Proof(kind string, player address) string`; `maxMissing = 20`; `errKind`.

- [ ] **Step 1: Write the failing tests** (append to `earned_test.gno`):

```go
// cupHoles publishes n holes of a world, par 3 each; returns their version ids.
func cupHoles(f *fakeRows, world string, n int) []string {
	var ids []string
	for i := 1; i <= n; i++ {
		ids = append(ids, hole(f, world, i, 3))
	}
	return ids
}

func TestEachKindIsProvenAndRefusedOneShort(t *testing.T) {
	a := alice.String()
	for _, c := range []struct {
		kind, world string
		strokes     int // per hole
	}{
		{"wizard", "garden", 5}, {"viking", "garden", 3},
		{"pirate", "island", 5}, {"diver", "island", 3},
		{"baker", "town", 5}, {"mayor", "town", 3},
		{"miner", "mines", 9},
	} {
		f := newFake()
		rows = f
		ids := cupHoles(f, c.world, 18)
		for _, id := range ids[1:] {
			best(f, id, "assisted", a, c.strokes)
		}
		ok, got, _ := prove(c.kind, a)
		uassert.False(t, ok, c.kind+": one hole short")
		uassert.Equal(t, 1, len(got.missing))
		uassert.Equal(t, c.world+"/1", got.missing[0])
		best(f, ids[0], "pro", a, c.strokes)
		ok, _, _ = prove(c.kind, a)
		uassert.True(t, ok, c.kind)
	}
}

func TestParMeansTheSumAtOrUnder(t *testing.T) {
	a := alice.String()
	f := newFake()
	rows = f
	ids := cupHoles(f, "garden", 18)
	for _, id := range ids {
		best(f, id, "assisted", a, 3)
	}
	ok, c, _ := prove("viking", a)
	uassert.True(t, ok)
	uassert.Equal(t, 54, c.par)
	best(f, ids[4], "assisted", a, 4) // one stroke over
	ok, c, _ = prove("viking", a)
	uassert.False(t, ok)
	uassert.Equal(t, 55, c.strokes)
	best(f, ids[5], "pro", a, 2) // and one under elsewhere: even again
	ok, _, _ = prove("viking", a)
	uassert.True(t, ok)
}

func TestGoldenIsFiveAcesAnywhere(t *testing.T) {
	a := alice.String()
	f := newFake()
	rows = f
	for i, w := range worlds {
		id := hole(f, w, 1, 3)
		if i < 4 {
			best(f, id, "pro", a, 1)
		}
	}
	ok, _, _ := prove("golden", a)
	uassert.False(t, ok, "four aces")
	best(f, hole(f, "mines", 2, 5), "assisted", a, 1)
	ok, _, _ = prove("golden", a)
	uassert.True(t, ok)
}

func TestKingIsVikingOnTheFourClassicCups(t *testing.T) {
	a := alice.String()
	f := newFake()
	rows = f
	for _, w := range []string{"garden", "island", "town", "mountain"} {
		for _, id := range cupHoles(f, w, 18) {
			best(f, id, "assisted", a, 3)
		}
	}
	ok, _, _ := prove("king", a)
	uassert.True(t, ok)
	cupHoles(f, "mines", 18) // the mines are not the King's
	ok, _, _ = prove("king", a)
	uassert.True(t, ok)
	best(f, "mountain/18/v1", "assisted", a, 4)
	ok, _, _ = prove("king", a)
	uassert.False(t, ok)
}

func TestWhatDoesNotCount(t *testing.T) {
	a := alice.String()
	f := newFake()
	rows = f
	ids := cupHoles(f, "garden", 18)
	for _, id := range ids {
		best(f, id, "assisted", a, 3)
	}
	// a best on an archived version only: the slot now points at v2
	f.set("slots", "0garden/001", "garden/1/v2")
	f.set("holes", "garden/1/v2", entry("garden/1/v2", 3))
	ok, _, _ := prove("wizard", a)
	uassert.False(t, ok, "archived")
	best(f, "garden/1/v2", "assisted", a, 3)
	ok, _, _ = prove("wizard", a)
	uassert.True(t, ok)
	// a resent ghost: the bests row is there, with a copies row
	copied(f, ids[3], "assisted", a)
	ok, c, _ := prove("wizard", a)
	uassert.False(t, ok, "a copy proves nothing")
	uassert.Equal(t, "garden/4", c.missing[0])
	// a cup with no slot on chain proves nothing
	ok, _, _ = prove("miner", a)
	uassert.False(t, ok)
}

func TestNewRulesProveNothing(t *testing.T) {
	f := newFake()
	rows = f
	f.writer = "gno.land/r/gnogolf/golf/v3"
	ok, _, why := prove("wizard", alice.String())
	uassert.False(t, ok)
	uassert.Equal(t, errRules, why)
	uassert.True(t, strings.Contains(Proof("wizard", alice), `"reason":"rules changed"`))
}

func TestProofSaysWhatAMintWouldFind(t *testing.T) {
	a := alice.String()
	f := newFake()
	rows = f
	ids := cupHoles(f, "garden", 18)
	for _, id := range ids[2:] {
		best(f, id, "assisted", a, 3)
	}
	uassert.Equal(t,
		`{"version":1,"kind":"viking","player":"`+a+`","ok":false,"minted":"","holes":18,"finished":16,"strokes":48,"par":54,"missing":["garden/1","garden/2"]}`,
		Proof("viking", alice))
	urequire.PanicsContains(t, errKind, func() { Proof("dragon", alice) })
}
```

- [ ] **Step 2: Run.** `gno test ./gno.land/r/gnogolf/gnomes -run 'TestEachKind|TestPar|TestGolden|TestKing|TestWhat|TestNewRules|TestProofSays' -v`
Expected: FAIL, `prove` undefined.

- [ ] **Step 3: Implement** (append to `earned.gno`):

```go
const (
	maxMissing = 20
	errKind    = "gnomes: no such earned gnome: "
)

// KINDS are the earned gnomes, in UNLOCKS order (web/lib/card.ts): a token's
// kind byte is its index + 1.
var KINDS = []string{"wizard", "viking", "golden", "pirate", "diver", "baker", "mayor", "king", "miner"}

func kindIndex(kind string) int {
	for i, k := range KINDS {
		if k == kind {
			return i + 1
		}
	}
	return 0
}

type cup struct {
	holes, finished, strokes, par, aces int
	missing                             []string
}

func (c *cup) add(o cup) {
	c.holes += o.holes
	c.finished += o.finished
	c.strokes += o.strokes
	c.par += o.par
	c.aces += o.aces
	for _, m := range o.missing {
		if len(c.missing) < maxMissing {
			c.missing = append(c.missing, m)
		}
	}
}

func (c cup) all() bool   { return c.holes > 0 && c.finished == c.holes }
func (c cup) clean() bool { return c.all() && c.strokes <= c.par }

// slotName is a slot key as the player knows the hole: "0garden/007" -> "garden/7".
func slotName(key string) string {
	s := key[1:]
	i := len(s) - 3
	for i < len(s)-1 && s[i] == '0' {
		i++
	}
	return s[:len(s)-3] + s[i:]
}

// cupOf is a player's results on a cup's current versions: one page of
// slots, a best per mode a slot, and the pars when asked.
func cupOf(world, player string, withPar bool) cup {
	d := string(rune('0' + worldRank(world)))
	var c cup
	for _, kv := range pageRows(rows.Page("slots", d+world+"/", d+world+"0", 300)) {
		c.holes++
		if withPar {
			c.par += parOf(kv[1])
		}
		b := lowerBest(kv[1], player)
		if b == 0 {
			if len(c.missing) < maxMissing {
				c.missing = append(c.missing, slotName(kv[0]))
			}
			continue
		}
		c.finished++
		c.strokes += b
		if b == 1 {
			c.aces++
		}
	}
	return c
}

func worldRank(w string) int {
	for i, x := range worlds {
		if x == w {
			return i
		}
	}
	panic("gnomes: no such world: " + w)
}

// prove is what MintEarned(kind) would find for player (§7's table).
func prove(kind, player string) (bool, cup, string) {
	if kindIndex(kind) == 0 {
		panic(errKind + kind)
	}
	if rows.Writer() != rules {
		return false, cup{}, errRules
	}
	switch kind {
	case "wizard", "pirate", "baker", "miner":
		c := cupOf(map[string]string{"wizard": "garden", "pirate": "island", "baker": "town", "miner": "mines"}[kind], player, false)
		return c.all(), c, ""
	case "viking", "diver", "mayor":
		c := cupOf(map[string]string{"viking": "garden", "diver": "island", "mayor": "town"}[kind], player, true)
		return c.clean(), c, ""
	case "golden":
		var c cup
		for _, w := range worlds {
			c.add(cupOf(w, player, false))
		}
		return c.aces >= 5, c, ""
	}
	// king: viking's proof on each classic cup
	var c cup
	ok := true
	for _, w := range worlds[:4] {
		one := cupOf(w, player, true)
		ok = ok && one.clean()
		c.add(one)
	}
	return ok, c, ""
}

// Proof says what MintEarned(kind) would find for player, free (§5).
func Proof(kind string, player address) string {
	ok, c, why := prove(kind, player.String())
	minted := ""
	if v, has := earned.Get(player.String() + " " + kind); has {
		minted = v.(string)
	}
	s := `{"version":1,"kind":"` + kind + `","player":"` + player.String() + `","ok":` + strconv.FormatBool(ok) +
		`,"minted":"` + minted + `","holes":` + strconv.Itoa(c.holes) + `,"finished":` + strconv.Itoa(c.finished) +
		`,"strokes":` + strconv.Itoa(c.strokes) + `,"par":` + strconv.Itoa(c.par) + `,"missing":[`
	for i, m := range c.missing {
		if i > 0 {
			s += ","
		}
		s += `"` + m + `"`
	}
	s += "]"
	if why != "" {
		s += `,"reason":"` + why + `"`
	}
	return s + "}"
}
```


- [ ] **Step 4: Run.** Same command, then the whole package. Expected: PASS.

- [ ] **Step 5: Commit.**

### Task 9: the King proof's gas, measured — go/no-go

**Files:**
- Create: `gno.land/r/gnogolf/gnomes/z_proof_seed_filetest.gno`, `gno.land/r/gnogolf/gnomes/z_proof_king_filetest.gno`

The two filetests seed store as golf/v2 would (the course's 72 classic slots, their entries, a best in each mode on each), and the second also asks `Proof("king", …)`. The difference of their `// Gas:` goldens is the proof's gas, read through the real store, as golf's `z_list_base` and `z_list_read` measure a read.

- [ ] **Step 1: Write the seed filetest** `z_proof_seed_filetest.gno`:

```go
// PKGPATH: gno.land/r/test/proofseed
package proofseed

import (
	"strconv"
	"testing"

	"gno.land/p/nt/testutils/v0"
	"gno.land/r/gnogolf/store"
)

// The four classic cups as golf/v2 keeps them in store (slotKey, encodeEntry,
// bestOf): 72 current versions, each with a best in both modes for one
// player. z_proof_king_filetest seeds the same, then asks Proof("king"):
// the difference of their gas is the heaviest proof (§7). Written as golf/v2
// would: the writer's own frame.
func f(s string) string { return strconv.Itoa(len(s)) + ":" + s }

func seed(cur realm) {
	p := testutils.TestAddress("king").String()
	testing.SetRealm(testing.NewCodeRealm("gno.land/r/gnogolf/golf/v2"))
	for d, w := range []string{"garden", "island", "town", "mountain"} {
		for n := 1; n <= 18; n++ {
			id := w + "/" + strconv.Itoa(n) + "/v1"
			pad := strconv.Itoa(n)
			for len(pad) < 3 {
				pad = "0" + pad
			}
			e := "1:1" + f(id) + f("Hole") + f("3")
			for i := 3; i < 23; i++ {
				e += "0:"
			}
			store.Set(cross(cur), "slots", strconv.Itoa(d)+w+"/"+pad, id)
			store.Set(cross(cur), "holes", id, e)
			store.Set(cross(cur), "bests", id+" assisted "+p, "3 120 7 0.5,40;0.25,30;0.1,10")
			store.Set(cross(cur), "bests", id+" pro "+p, "3 121 7 0.5,40;0.25,30;0.1,10")
		}
	}
}

func main(cur realm) {
	seed(cur)
	println(store.Size("slots"))
}

// Output:
// 72

// Gas:
// 0
```

(`store.Set`'s writer check reads `cur.Previous()`: if setting the realm to golf/v2's code realm does not pass it in a filetest, seed with `store.Batch` the same way; store_test.gno's `TestOnlyTheWriterWrites` is the pattern.)

- [ ] **Step 2: Write the king filetest** `z_proof_king_filetest.gno`: the same file, `PKGPATH: gno.land/r/test/proofking`, importing `gno.land/r/gnogolf/gnomes`, whose `main` is:

```go
func main(cur realm) {
	seed(cur)
	println(gnomes.Proof("king", testutils.TestAddress("king")))
}

// Output:
// {"version":1,"kind":"king","player":"<the king's address>","ok":true,"minted":"","holes":72,"finished":72,"strokes":216,"par":216,"missing":[]}

// Gas:
// 0
```

- [ ] **Step 3: Run them to fill the goldens.** `gno test ./gno.land/r/gnogolf/gnomes -run 'TestFiles/z_proof' -update-golden-tests -v`
Expected: both pass after the update; `git diff` shows the two `// Gas:` numbers (and the player's address in the Output).

- [ ] **Step 4: The gate.** Compute king − seed. Expected: of the order of golf's `Claim` (70.2M with three bests seated), and under 300M, the gas the client will ask (§7). Write the difference in a comment at the top of `z_proof_king_filetest.gno` ("the difference of their gas is the King's proof: N"), as golf's filetests do.
  - Under 300M: go on. Keep the figure for Task 43 (`GNOME_GAS.earned`: this figure plus `MintEarned`'s own writes, measured in Task 35, and a third more).
  - Over 300M but under 3e9 (a query's limit): the free `Proof` still works; `MintEarned` costs more gas than §7 assumed. Report the figure to the owner before Milestone 2; the spec's 300M becomes the measured figure plus a margin.
  - Over 3e9: stop. `Proof` cannot be a query; §7 needs another design (fewer reads, or a proof per cup).

- [ ] **Step 5: Milestone check.** `scripts/check.sh`. Expected: `all checks passed`.

- [ ] **Step 6: Commit.**

---

## Milestone 2: the catalogue and its traits

One source, `data/gnomes/`, as `data/holes.txt` is for holes; one script, `scripts/gnomes.ts`, that makes `data/gnomes.json` from it and checks every rule (§3, §10); `check.sh` fails when the file is not what the data makes. The realm does not hold the catalogue in its code: the owner publishes it with `AddSeries`, from rows `scripts/gnomesrows.ts` writes. So a later series is data and an owner's call, never a new realm.

Decisions this milestone makes (recorded in the ADR, Task 69):

- **Traits are format 1 of `codec.ts`**: one byte a field, 29 bytes, 58 hex; byte 0 the format, then series, tier, kind, home, archetype, hat, hat colour, brim, beard, hair, body, pattern and its colour, a 32-bit accessory mask, accent, piece and its colour, material and its tint, trail and its colour, holing and its colour, prop and its colour (§10). 255 in a colour field is "none, the default".
- **The tables are append only** (`vocab.ts`, `props.ts`): a code keeps its meaning for good. A new field is appended to format 1; a changed meaning is a new format.
- **The palette** is `vocab.ts`' `COLOURS`, 82 today; the first 27 are every colour `GNOMES` draws with, so an earned gnome writes exactly as it is drawn.
- **An earned token's traits** are tier 0 and its kind; the client draws `GNOMES`' own gnome for it.
- **Ids by world**: `planSeries` lays a series out world by world (`series.json`'s `worlds`), each world its Commons, Rares, Epics and Legendary in turn, the counts shared over the worlds as evenly as they go (§2).
- **Rows for the realm**: `id|tier|name|traits`, the tier as its name, taken from the same entry as the traits' tier byte.

### Task 10: the codec **(built)**

**Files:** `web/lib/gnomes/vocab.ts`, `web/lib/gnomes/codec.ts`, `web/test/gnomes.test.ts`

**Interfaces:**
- Produces: `FORMAT = 1`, `LENGTH` (58), `PLAIN`, `type Traits`, `encode(t: Traits): string` (throws on a colour outside the palette, a name outside its table, a number over a byte), `decode(hex: string): Traits | null` (null for a string that is not hex or not format 1).

- [ ] **Step 1: Read the tests against §10.** They must cover: every field written and read back; a code past each table read as the plain form; a colour index past the palette read as none; a string shorter than `LENGTH` with the missing fields plain; a format other than 1, odd-length or non-hex input giving null; `encode` refusing a colour outside the palette and an unknown accessory. Add what is missing.
- [ ] **Step 2: Run.** `(cd web && node --experimental-strip-types --disable-warning=ExperimentalWarning --import ./test/setup.mjs --test test/gnomes.test.ts)`. Expected: PASS.
- [ ] **Step 3: Commit.**

### Task 11: the series' data and the generator **(built)**

**Files:** `data/gnomes/series.json`, `data/gnomes/genesis/{archetypes,epics,legendaries}.json`, `web/lib/gnomes/catalogue.ts`, `web/lib/gnomes/generate.ts`, `scripts/gnomes.ts`, `data/gnomes.json`; `scripts/check.sh` and `web/package.json` (`npm run gnomes`, `gnomes:thumbs`)

**Interfaces:**
- Produces: `SeriesConfig`, `planSeries(s)` (a plan a world), `makeCatalogue(read): Catalogue`, `TIER_LOOK`, `traitRows`, `filterGnomes`, `entryOf`, `thumbOf`; `data/gnomes.json` (`version`, `format`, `series` with their `plan`, `vocab`, `earned`, `gnomes`).

- [ ] **Step 1: Check the plan.** `planSeries` on the genesis gives the seven worlds' ranges of the Global constraints, ids 1 to 720 with no gap, 504/144/65/7 in all. A test asserts the seven ranges and the Legendaries' ids.
- [ ] **Step 2: The earned ids.** `series.json`'s `earned.first` becomes `1000001` (§2: above 64 series of 1,000 rows), and `data/gnomes.json` is made again (`npm run gnomes`).
- [ ] **Step 3: Run** `(cd web && npm run gnomes -- --check)`. Expected: the counts per tier and home printed, and `ok   720 gnomes, data/gnomes.json as made`.
- [ ] **Step 4: Commit.**

### Task 12: `skinOf`: the nine earned kinds are `GNOMES`, byte for byte **(built)**

**Files:** `web/lib/gnomes/skin.ts`, `web/test/gnomes.test.ts`, `web/test/gnome.test.ts`

**Interfaces:**
- Produces: `EARNED_KINDS`, `skinOf(t: Traits, named): Skin`, `skinOfTraits(hex, named): Skin` (the Classic under the token's name when the traits do not decode), `traitsOf(skin, more)`, `lookOf(skin, more)`.

- [ ] **Step 1: Read the tests:** each of the nine earned kinds' traits draws the `GNOMES` entry of its kind; `skinOfTraits` of a format-2 string and of junk draws the Classic with the token's name; the fourteen `GNOMES` are drawn exactly as before the collection's changes to `scene/gnome.ts` (the fingerprint test in `gnome.test.ts`).
- [ ] **Step 2: Run** both files. Expected: PASS. **Commit.**

### Task 13: the catalogue's rules **(built, one fix)**

**Files:** `web/lib/gnomes/validate.ts`, `data/gnomes/genesis/legendaries.json`, `web/lib/scene/gnome-legend.ts` (a comment), `web/test/gnomes.test.ts`

**Interfaces:**
- Produces: `validate(c: Catalogue, gnomes: Traits[]): Report`, `tierRules`, `readability`, `earnedSignature`, `lookDistance`, `MIN_APART`, `MIN_FROM_GNOMES`, `BUDGET`, `MAX_REACH`, `EARNED_ONLY`.

- [ ] **Step 1: Write the failing test:** no Legendary's name matches `/\bKing\b/`, and none wears `crown` (the accessory) or has a prop or concept with a crown: `validate` reports each. Today the Garden's Legendary, id 104, is "Windmill King", "a gold crown round its foot": the test fails on it.
- [ ] **Step 2: Add the rule** to `validate.ts` beside the earned signatures.
- [ ] **Step 3: Fix the data:** id 104 becomes **The Miller**, its concept "Garden 4's mill for a hat, its four sails turning", its line and lore without a crown ("The mill by hole 4 lent him its sails. The wind does what he says, mostly."); the comment in `gnome-legend.ts` reads "The Miller: his mill's four sails, turning". `npm run gnomes`, then the thumbnail and turntable of 104 drawn again (`npm run gnomes:thumbs -- 104`).
- [ ] **Step 4: Run** `npm run gnomes -- --check` and the test file. Expected: PASS, no `FAIL` line. **Commit.**

### Task 14: the rows the realm publishes

**Files:**
- Create: `scripts/gnomesrows.ts`, `web/test/gnomesrows.test.ts`
- Modify: `scripts/check.sh` (`npm run -s gnomes:rows -- --check`), `web/package.json` (`gnomes:rows`)

**Interfaces:**
- Produces: `rowsOf(c: Catalogue, series: string): string` (`id|tier|name|traits` a line, no trailing newline); `supplyLine(gno: string): number[]` (reads `genesisSupply` from `config.gno`); CLI `--series <id>` prints a series' rows for `AddSeries`; `--check` fails when `genesisSupply` differs from `series.json`'s genesis `supply` or a row's tier differs from its traits' tier byte.

- [ ] **Step 1: Write the failing tests:** the genesis's rows are 720 lines, ids 1 to 720 in order, each tier the name of its traits' byte 2; a catalogue whose entry and traits disagree on the tier is refused; `supplyLine` of the realm's `config.gno` is `[504, 144, 65, 7]` and equals `series.json`'s.
- [ ] **Step 2: Run** → FAIL. **Implement.** **Run** → PASS.
- [ ] **Step 3: Commit.**

### Task 15: the realm's catalogue **(built)**

**Files:** `gno.land/r/gnogolf/gnomes/config.gno`, `catalogue.gno`, `rows.gno`, `catalogue_test.gno`

**Interfaces:**
- Produces: `AddSeries(cur realm, name, rows string)`; `gnomeAt(id int64) (gnome, bool)`; `lastID() int64`; `rowOf`, `parseRow`; event `SeriesAdded` (`series`, `first`, `last`).

- [ ] **Step 1: Read the tests against §9 and §16:** a malformed row, a gap, a repeat, an unknown tier, a name over 48 bytes or with a control byte, traits over 256 bytes refuse the whole series; the genesis first and once, with `genesisSupply`'s counts; a 65th series and a 1,001st row refused; a gnome found in the second series; only the owner publishes.
- [ ] **Step 2: Run** `gno test ./gno.land/r/gnogolf/gnomes -run 'TestASeries|TestTheGenesis' -v`. Expected: PASS. Add any case missing. **Commit.**

### Task 16: the genesis published, measured

**Files:** Modify: `gno.land/r/gnogolf/gnomes/z_storage_genesis_filetest.gno`

- [ ] **Step 1:** Its rows laid out as `planSeries` lays the genesis (each world its Commons, Rares, Epics, Legendary), with names and traits of the real lengths (58 hex), then `SetCloseAt` a date past the sale's start (Task 30: no genesis sale opens without one) and `OpenSale("genesis", <start>, 48)`.
- [ ] **Step 2: Fill the golden.** `-run TestFiles/z_storage_genesis -update-golden-tests`. Expected: about 46 KB for gnomes (it measured 46,230 bytes with the Legendaries first), 4.6 GNOT; a figure far off is a finding. Write it in the file's comment.
- [ ] **Step 3: Milestone check.** `scripts/check.sh` → `all checks passed`. **Commit.**

---

## Milestone 3: the sale and the GRC721 surface

### Task 17: the owner's role **(built in part)**

`Transfer`, `Accept`, `Owner`, `Pending` are built (`TestTheOwnerHandsOverInTwoSteps`, `TestAnEmptyOwnerHoldsNoPower`, `TestARealmTheOwnerCallsIsNotTheOwner`). `Renounce` is not; it is kept (decided with the separate treasury, §4): what it freezes is Task 32.

**Files:**
- Modify: `gno.land/r/gnogolf/gnomes/owner.gno`, `owner_test.gno`

**Interfaces:**
- Produces: `Transfer(cur realm, to address)`, `Accept(cur realm)`, `Renounce(cur realm)`, `Owner() address`, `Pending() address`; events `OwnershipOffered`, `OwnershipOfferCancelled`, `OwnershipTransfer`, `OwnershipRenounced` (golf/v2 `owner.gno`'s names and attributes).

- [ ] **Step 1: Write the failing test** (append to `owner_test.gno`):

```go
func TestTheRoleIsHandedOnInTwoSteps(cur realm, t *testing.T) {
	fresh(cur)
	testing.SetRealm(testing.NewUserRealm(alice))
	urequire.AbortsContains(t, cur, "only the owner", func() { Transfer(cross(cur), alice) })
	testing.SetRealm(testing.NewUserRealm(boss))
	urequire.AbortsContains(t, cur, "not an address", func() { Transfer(cross(cur), "nope") })
	Transfer(cross(cur), heir)
	uassert.Equal(t, heir, Pending())
	testing.SetRealm(testing.NewUserRealm(alice))
	urequire.AbortsContains(t, cur, "no transfer", func() { Accept(cross(cur)) })
	testing.SetRealm(testing.NewUserRealm(heir))
	Accept(cross(cur))
	uassert.Equal(t, heir, Owner())
	uassert.Equal(t, address(""), Pending())
	testing.SetRealm(testing.NewUserRealm(boss))
	urequire.AbortsContains(t, cur, "only the owner", func() { Renounce(cross(cur)) })
	testing.SetRealm(testing.NewUserRealm(heir))
	Renounce(cross(cur))
	uassert.Equal(t, address(""), Owner())
	testing.SetRealm(testing.NewUserRealm(heir))
	urequire.AbortsContains(t, cur, "only the owner", func() { Transfer(cross(cur), boss) })
}
```

- [ ] **Step 2: Run.** `gno test ./gno.land/r/gnogolf/gnomes -run TestTheRoleIsHanded -v` → FAIL, `Transfer` undefined.

- [ ] **Step 3: Implement** in `owner.gno`, as golf/v2's `owner.gno` does (copy its three functions, `golf:` read `gnomes:`, "the course" read "the collection"), plus `Owner()` and `Pending()`. Events are emitted with `chain.Emit("OwnershipOffered", "owner", owner.String(), "to", to.String())` and the same shapes as golf's.

- [ ] **Step 4: Run.** Expected: PASS.

- [ ] **Step 5: Commit.**

### Task 18: the sale, the prices, the switch, and `Collection` **(built)**

*First built as waves (`waves.gno`, `AddWave`); waves removed 2026-10-18, one sale a series (ADR-013). This task is written for the sale.*

**Files:** `gno.land/r/gnogolf/gnomes/config.gno`, `sale.gno`, `gnomes.gno` (`SetMintOpen`), `read.gno` (`Collection`), `sale_test.gno`, `read_test.gno`

**Interfaces:**
- Produces: `type sale struct { series string; start, playersUntil int64; prices [len(tiers)]int64 }`; `sales []sale`; `prices [len(tiers)]int64` (in force for the next sale); `OpenSale(cur realm, series string, start, playerHours int64)`; `CancelSale(cur realm, series string)`; `SetPrice(cur realm, tier string, ugnot int64)`; `SetMintOpen(cur realm, open bool)`, `MintOpen() bool`; `saleOf(series string) int`, `saleAt(id int64) int`; `Collection() string`; events `SaleOpened`, `SaleCancelled`, `PriceSet`, `MintOpen`.

- [ ] **Step 1: Read the tests against §5 and §6, and add what is missing:**
  - a deploy is closed, at 36, 72, 336 and 1,296 GNOT (`config.gno`'s `tiers` change from the built 30/99/333 and the 777 reserve; `Collection` shows them, with the caps 10/5/2/1 and 3/2/1/1, the Legendary now a sold tier like the others);
  - only the owner opens or cancels a sale, sets a price, opens or closes;
  - `OpenSale` refuses an unknown series, a second sale of a series, a start more than a day back or a year ahead, a player window over 168 hours, and (Task 30) the genesis's sale while no closing date is set or starting at or after it; `CancelSale` refuses a sale under way or with a gnome sold;
  - `SetPrice` refuses an unknown tier and a price outside 1 to 10,000 GNOT; it changes the next sale's prices, never an opened sale's (`TestASaleKeepsItsPrices`): nothing on sale ever gets cheaper;
  - `Collection` lists the series, each with its sale and its prices (null before one), the closing date (`closeAt`, 0 while unset), the treasury and the pending one, the site URL.
- [ ] **Step 2: Run** `-run 'TestASale|TestEachSale|TestAWindow|TestADeploy|TestCollection'`. Expected: PASS.
- [ ] **Step 3: Commit.**

### Task 19: `Buy` **(built)**

**Files:** `gno.land/r/gnogolf/gnomes/buy.gno`, `players.gno`, `buy_test.gno`

**Interfaces:**
- Produces: `Buy(cur realm, ids string) string`; `parseIDs(ids string) []int64`; `parseID(s string) int64`; `hasRecord(addr address) bool`; trees `bought` (buyer → counts per tier), `inWindow` (`"<series> <buyer>"` → counts per tier, so a sale cancelled and opened again hands no fresh window); event `GnomeBought` (`id`, `buyer`, `price`, `treasury`).

- [ ] **Step 1: Read `Buy` against §6's order, and change it where it differs:** `IsUserCall`; the switch; the closing date (Task 30); the ids parsed strictly; for each, in the catalogue, in a sale, the sale started, unsold, a Legendary taken like any other tier (the built refusal "sold by auction" goes); in a player window, `hasRecord` once and the window's cap; the lifetime caps for the whole batch (a Legendary: one a wallet, in the window and for life); the envelope exactly one `ugnot` coin of the sum of the sale prices; the state (caps, then the mints); then the forward to the treasury with an `OriginSend` banker. Every refusal panics before any coin moves.
- [ ] **Step 2: Read the tests** (`TestBuyTakesUpToFiveAtTheirSum`, `TestBuyRefusesAnyOtherPayment`, `TestBuyMustBeADirectUserCall`, `TestAGnomeSellsOnce`, `TestBuyReadsItsIDsStrictly`), and add `TestALegendaryIsBoughtLikeAnyGnome`: id 104 bought alone at 1,296 GNOT; the treasury's balance after a buy of two gnomes of different tiers is their sum, the realm's 0.
- [ ] **Step 3: Run** `-run 'TestBuy|TestAGnome'`. Expected: PASS. **Commit.**

### Task 20: what `Buy` refuses **(built)**

**Files:** `buy_test.gno`, `sale_test.gno` (and `buy.gno` only if a case fails)

- [ ] **Step 1: Hold the tests to this list, adding what is missing:** paused; the sale closed (Task 30); `""`, six ids, an id twice, `"07"`, `"x"`; a second Legendary for a wallet that has one ("One Legendary a wallet"), in one batch and across batches; an earned id and an id past the catalogue ("no such gnome"); an id in no sale; a sale not started; a sold id; in a player window, a wallet with no `totals` row refused and one with a row in either mode taken (`TestThePlayerWindowIsForPlayers`, `TestARecordInEitherModeCounts`); the window's cap in one batch and across batches, then the lifetime cap after the window (`TestAWalletBuysUpToItsLifetimeCap`); a price changed by `SetPrice` before the sale opened, refused by the exact check, coins kept; a call from a code realm and from a run script's realm.
- [ ] **Step 2: Run** `-run 'TestBuy|TestASale|TestThePlayer|TestARecord|TestAWallet|TestALegendary'`. Expected: PASS. **Commit.**

### Task 21: `Sold` and `Gnome` **(built, two fixes)**

**Files:** `read.gno`, `read_test.gno`

**Interfaces:**
- Produces: `Sold() string` (a bit per catalogue id, bit id-1 once minted, hex: 180 digits for the genesis); `Gnome(tid string) string`.

- [ ] **Step 1: Write the failing tests:** `Gnome("0")` and `Gnome("721")` answer `{"version":1,"id":""}`, not `null` (every answer starts with its version, §5); `Gnome` of an id in an opened sale shows that sale's price after a `SetPrice`, and of an id in no sale the price in force; `Sold()` of a fresh genesis is 180 zeros, and after a buy of ids 1 and 10, `"0102"` then zeros.
- [ ] **Step 2: Run** → FAIL on `null`. **Fix** `Gnome`. **Run** → PASS. **Commit.**

### Task 22: approvals, and the GRC721 reads a wallet makes

**Files:**
- Modify: `gnomes.gno`, `hooks.gno` (`TokenOfOwnerByIndex`), `hooks_test.gno`

**Interfaces:**
- Produces: `Approve(cur realm, to address, id grc721.TokenID)` (an earned id refused), `SetApprovalForAll(cur realm, operator address, approved bool)`, `GetApproved(id) (address, error)`, `IsApprovedForAll(owner, operator address) bool`, `TokenOfOwnerByIndex(owner address, i int64) (grc721.TokenID, error)`; `ownedPage(owner address, offset, limit int) ([]grc721.TokenID, bool)` (the ids and whether more follow).

- [ ] **Step 1: Write the failing test:**

```go
func TestApprovalsAndTheWalletsReads(cur realm, t *testing.T) {
	fresh(cur)
	urequire.NoError(t, ledger.Mint(alice, "42"))
	urequire.NoError(t, ledger.Mint(alice, "7"))
	urequire.NoError(t, ledger.Mint(alice, "1000001"))
	testing.SetRealm(testing.NewUserRealm(alice))
	urequire.AbortsContains(t, cur, "bound to its player", func() { Approve(cross(cur), bob, "1000001") })
	testing.SetRealm(testing.NewUserRealm(alice))
	Approve(cross(cur), bob, "42")
	a, _ := GetApproved("42")
	uassert.Equal(t, bob, a)
	testing.SetRealm(testing.NewUserRealm(bob))
	TransferFrom(cross(cur), alice, carl, "42")
	testing.SetRealm(testing.NewUserRealm(alice))
	SetApprovalForAll(cross(cur), bob, true)
	uassert.True(t, IsApprovedForAll(alice, bob))
	testing.SetRealm(testing.NewUserRealm(bob))
	urequire.AbortsContains(t, cur, "bound to its player", func() { TransferFrom(cross(cur), alice, bob, "1000001") })
	// the owned index's order: "<owner> <id>" as strings
	id, err := TokenOfOwnerByIndex(alice, 0)
	urequire.NoError(t, err)
	uassert.Equal(t, grc721.TokenID("1000001"), id)
	id, _ = TokenOfOwnerByIndex(alice, 1)
	uassert.Equal(t, grc721.TokenID("7"), id)
	_, err = TokenOfOwnerByIndex(alice, 2)
	uassert.Error(t, err)
	n, _ := BalanceOf(alice)
	uassert.Equal(t, int64(2), n)
}
```

- [ ] **Step 2: Run.** → FAIL, `Approve` undefined.

- [ ] **Step 3: Implement** in `gnomes.gno`:

```go
func Approve(cur realm, to address, id grc721.TokenID) {
	if isEarned(id) {
		panic(errBound)
	}
	if err := teller.Approve(0, cur, to, id); err != nil {
		panic("gnomes: " + err.Error())
	}
}

// SetApprovalForAll approves an operator for every token of the caller's;
// an earned one still refuses to move (the hook).
func SetApprovalForAll(cur realm, operator address, approved bool) {
	if err := teller.SetApprovalForAll(0, cur, operator, approved); err != nil {
		panic("gnomes: " + err.Error())
	}
}

func GetApproved(id grc721.TokenID) (address, error)   { return token.GetApproved(id) }
func IsApprovedForAll(owner, operator address) bool     { return token.IsApprovedForAll(owner, operator) }
```

In `hooks.gno`:

```go
// ownedPage is up to limit of a wallet's ids from offset, in the owned
// index's order, and whether more follow. It walks the wallet's own rows
// only ("<owner> " to "<owner>!").
func ownedPage(owner address, offset, limit int) ([]grc721.TokenID, bool) {
	var out []grc721.TokenID
	more, i := false, 0
	p := owner.String() + " "
	owned.Iterate(p, owner.String()+"!", func(k string, _ any) bool {
		if i >= offset {
			if len(out) == limit {
				more = true
				return true
			}
			out = append(out, grc721.TokenID(k[len(p):]))
		}
		i++
		return false
	})
	return out, more
}

func TokenOfOwnerByIndex(owner address, i int64) (grc721.TokenID, error) {
	if i < 0 {
		return "", errors.New("gnomes: no such index")
	}
	ids, _ := ownedPage(owner, int(i), 1)
	if len(ids) == 0 {
		return "", errors.New("gnomes: no such index")
	}
	return ids[0], nil
}
```

(`errors.New` here is made per call and returned, never stored: the deposit note of §9 is about package-level error values.)

- [ ] **Step 4: Run.** Expected: PASS.

- [ ] **Step 5: Commit.**

### Task 23: `Burn`, with the cleanup the hook cannot do

**Files:**
- Modify: `gnomes.gno`, `hooks_test.gno`

**Interfaces:**
- Produces: `Burn(cur realm, id grc721.TokenID)`; `errNotYours`.

- [ ] **Step 1: Write the failing test:**

```go
func TestABurnClearsWhatTheHookCannot(cur realm, t *testing.T) {
	fresh(cur)
	urequire.NoError(t, ledger.Mint(alice, "42"))
	urequire.NoError(t, ledger.Mint(alice, "1000001"))
	kinds.Set("1000001", "viking")
	earned.Set(alice.String()+" viking", "1000001")
	equipped.Set(alice.String(), "1000001")
	markSold(42)
	testing.SetRealm(testing.NewUserRealm(bob))
	urequire.AbortsContains(t, cur, "not yours", func() { Burn(cross(cur), "42") })
	testing.SetRealm(testing.NewUserRealm(alice))
	Burn(cross(cur), "1000001")
	uassert.False(t, owned.Has(ownedKey(alice, "1000001")))
	uassert.False(t, kinds.Has("1000001"))
	uassert.False(t, earned.Has(alice.String()+" viking"), "the kind can be minted again")
	uassert.False(t, equipped.Has(alice.String()))
	testing.SetRealm(testing.NewUserRealm(alice))
	Burn(cross(cur), "42")
	uassert.True(t, isSold(42), "a sold id is never sold again")
	uassert.Equal(t, int64(0), TotalSupply())
}
```

- [ ] **Step 2: Run.** → FAIL, `Burn` undefined.

- [ ] **Step 3: Implement** in `gnomes.gno`:

```go
const errNotYours = "gnomes: not yours: "

// Burn destroys a token the caller owns; its deposit returns. Its cleanup is
// here, before the ledger's burn: grc721 removes the owner before OnBurn and
// gives the hook the id alone (§8). If the burn panics, the call reverts
// with the cleanup.
func Burn(cur realm, id grc721.TokenID) {
	who := cur.Previous().Address()
	if o, err := token.OwnerOf(id); err != nil || o != who {
		panic(errNotYours + string(id))
	}
	owned.Remove(ownedKey(who, id))
	if v, ok := equipped.Get(who.String()); ok && v.(string) == string(id) {
		equipped.Remove(who.String())
	}
	if k, ok := kinds.Get(string(id)); ok {
		kinds.Remove(string(id))
		earned.Remove(who.String() + " " + k.(string))
	}
	if err := ledger.Burn(id); err != nil {
		panic("gnomes: " + err.Error())
	}
}
```

- [ ] **Step 4: Run.** Expected: PASS.

- [ ] **Step 5: Commit.**

### Task 24: `Equip`, `Worn`, `WornMany` **(built in part)**

Built in `equip.gno` as `Equip`, `Equipped`, `EquippedMany`. **Decided:** wearing is free by default. A player shows everyone the gnome `Worn` derives from the chain: the one they equipped while they still own it, else their best owned gnome, so nobody has to send `Equip` to be seen in their gnome. `Equip` stays, optional (a player who prefers a Common to their Epic says so once). `Equipped` and `EquippedMany` become `Worn` and `WornMany`; `WornMany` answers `{"version":1,"rows":[…]}` (the built one answers a bare array; §5: every answer starts with its version). Playing an owned gnome in one's own browser needs nothing from the chain beyond `GnomesOf` (Task 57).

**Files:**
- Modify: `equip.gno` (from the built), `hooks_test.gno`

**Interfaces:**
- Produces: `Equip(cur realm, id grc721.TokenID)`; `Worn(player address) string`; `WornMany(players string) string`; `wornRow(player address) string` (the JSON object without its version, `""` for none); `bestOwned(player address) (grc721.TokenID, bool)`; `tierRank(tier string) int`; event `Equipped` (`player`, `id`).

- [ ] **Step 1: Write the failing tests:**

```go
// shows checks the id and the "how" of a Worn answer.
func shows(t *testing.T, worn, id, how string) {
	t.Helper()
	uassert.True(t, strings.Contains(worn, `"id":"`+id+`"`), worn)
	uassert.True(t, strings.HasSuffix(worn, `"how":"`+how+`"}`), worn)
}

func TestWornIsTheEquippedOneElseTheBestOwned(cur realm, t *testing.T) {
	fresh(cur)
	none := `{"version":1,"player":"` + bob.String() + `","id":"","how":""}`
	uassert.Equal(t, none, Worn(bob))
	urequire.NoError(t, ledger.Mint(alice, "42"))     // a Common
	urequire.NoError(t, ledger.Mint(alice, "1000001")) // an earned one: below every sold tier
	shows(t, Worn(alice), "42", "best")
	urequire.NoError(t, ledger.Mint(alice, "208")) // a Legendary: the best
	urequire.NoError(t, ledger.Mint(alice, "94"))  // an Epic
	shows(t, Worn(alice), "208", "best")
	testing.SetRealm(testing.NewUserRealm(bob))
	urequire.AbortsContains(t, cur, "not yours", func() { Equip(cross(cur), "208") })
	testing.SetRealm(testing.NewUserRealm(alice))
	Equip(cross(cur), "42")
	tr, _ := rowOf(42)
	uassert.Equal(t, `{"version":1,"player":"`+alice.String()+`","id":"42","name":"`+nameOf(42)+`","tier":"common","traits":"`+tr+`","how":"equipped"}`, Worn(alice))
	// an equipped row left behind (an owner changed outside the hook) is not read
	equipped.Set(bob.String(), "42")
	uassert.Equal(t, none, Worn(bob))
	testing.SetRealm(testing.NewUserRealm(alice))
	Equip(cross(cur), "")
	shows(t, Worn(alice), "208", "best") // unequipped: the best owned again
}

func TestWornManyReadsABoardsPage(cur realm, t *testing.T) {
	fresh(cur)
	urequire.NoError(t, ledger.Mint(alice, "208"))
	list := alice.String() + ",junk," + bob.String() + "," + alice.String()
	for i := 0; i < 60; i++ {
		list += "," + testutils.TestAddress("p"+strconv.Itoa(i)).String()
	}
	got := WornMany(list)
	uassert.True(t, strings.HasPrefix(got, `{"version":1,"rows":[{"player":"`+alice.String()+`","id":"208"`))
	uassert.Equal(t, 1, strings.Count(got, `"player"`), "repeats and junk skipped, those with no gnome left out")
}
```

(imports `strconv`, `strings`, `testutils` in `hooks_test.gno`; `nameOf` is the test's helper over `lookOf`.)

- [ ] **Step 2: Run.** → FAIL, `Worn` undefined.

- [ ] **Step 3: Implement** in `equip.gno`:

```go
const (
	maxMany  = 50
	wornScan = 100 // the rows of a wallet Worn reads; a wallet of more equips
)

// Equip makes a token the caller owns the one they show everyone; ""
// unequips, and Worn falls back to their best owned gnome. Optional: nobody
// needs it to be seen in their gnome. A transaction of its own, never bundled
// with a golf save (§11).
func Equip(cur realm, id grc721.TokenID) {
	who := cur.Previous().Address()
	if id == "" {
		equipped.Remove(who.String())
		chain.Emit("Equipped", "player", who.String(), "id", "")
		return
	}
	if o, err := token.OwnerOf(id); err != nil || o != who {
		panic(errNotYours + string(id))
	}
	equipped.Set(who.String(), string(id))
	chain.Emit("Equipped", "player", who.String(), "id", string(id))
}

// tierRank orders what a player shows when they equipped nothing.
func tierRank(tier string) int {
	switch tier {
	case "legendary":
		return 4
	case "epic":
		return 3
	case "rare":
		return 2
	case "common":
		return 1
	}
	return 0 // earned
}

// bestOwned is a player's best gnome among the first wornScan rows of their
// owned index: the highest tier, ties to the lowest id.
func bestOwned(player address) (grc721.TokenID, bool) {
	ids, _ := ownedPage(player, 0, wornScan)
	best, rank, num := grc721.TokenID(""), -1, 0
	for _, id := range ids {
		_, _, tier, ok := lookOf(id)
		n, _ := idNum(id)
		if r := tierRank(tier); ok && (r > rank || (r == rank && n < num)) {
			best, rank, num = id, r, n
		}
	}
	return best, best != ""
}

// wornRow is the gnome a player shows, as JSON without its version: their
// equipped one while they still own it (checked on every read), else their
// best owned; "" for none.
func wornRow(player address) string {
	how, id := "equipped", grc721.TokenID("")
	if v, ok := equipped.Get(player.String()); ok {
		if o, err := token.OwnerOf(grc721.TokenID(v.(string))); err == nil && o == player {
			id = grc721.TokenID(v.(string))
		}
	}
	if id == "" {
		how = "best"
		if b, ok := bestOwned(player); ok {
			id = b
		}
	}
	tr, name, tier, ok := lookOf(id)
	if id == "" || !ok {
		return ""
	}
	return `"player":"` + player.String() + `","id":"` + string(id) + `","name":"` + name + `","tier":"` + tier + `","traits":"` + tr + `","how":"` + how + `"`
}

func Worn(player address) string {
	if r := wornRow(player); r != "" {
		return `{"version":1,` + r + `}`
	}
	return `{"version":1,"player":"` + player.String() + `","id":"","how":""}`
}

// WornMany is Worn for up to 50 players, comma-separated, as golf's Bests
// takes a list: a board's page in one read. Repeats and junk are skipped; a
// player with no gnome is left out.
func WornMany(players string) string {
	s, n := `{"version":1,"rows":[`, 0
	seen := map[string]bool{}
	for i, p := range strings.Split(players, ",") {
		if i >= maxMany*2 { // (junk counted too: the read stays bounded)
			break
		}
		a := address(p)
		if seen[p] || !a.IsValid() || len(seen) >= maxMany {
			continue
		}
		seen[p] = true
		if r := wornRow(a); r != "" {
			if n > 0 {
				s += ","
			}
			s += "{" + r + "}"
			n++
		}
	}
	return s + "]}"
}
```

(imports `chain`, `strings`.) A `WornMany` of 50 wallets reads at most 50 × 100 rows: a free query, far under `maxGasQuery`.

- [ ] **Step 4: Run.** Expected: PASS.

- [ ] **Step 5: Commit.**

### Task 25: `GnomesOf`, paged **(to change)**

Built `GnomesOf(owner)` returns the first 100 rows only; this task gives it the `offset`, `total` and `next` of §5.

**Files:**
- Modify: `hooks.gno`, `hooks_test.gno`

**Interfaces:**
- Produces: `GnomesOf(owner address, offset int64) string`; `pageSize = 100`.

- [ ] **Step 1: Write the failing test:**

```go
func TestGnomesOfPagesAWallet(cur realm, t *testing.T) {
	fresh(cur)
	for n := 1; n <= 205; n++ {
		urequire.NoError(t, ledger.Mint(alice, grc721.TokenID(strconv.Itoa(n))))
	}
	p0 := GnomesOf(alice, 0)
	uassert.True(t, strings.HasPrefix(p0, `{"version":1,"owner":"`+alice.String()+`","total":205,"next":100,"rows":[{"id":"1","tier":"common","traits":"`))
	uassert.Equal(t, 100, strings.Count(p0, `"id"`))
	uassert.True(t, strings.Contains(GnomesOf(alice, 100), `"next":200`))
	p2 := GnomesOf(alice, 200)
	uassert.True(t, strings.Contains(p2, `"next":-1`))
	uassert.Equal(t, 5, strings.Count(p2, `"id"`))
	uassert.Equal(t, `{"version":1,"owner":"`+bob.String()+`","total":0,"next":-1,"rows":[]}`, GnomesOf(bob, 0))
}
```

- [ ] **Step 2: Run.** → FAIL.

- [ ] **Step 3: Implement:**

```go
const pageSize = 100

// GnomesOf is a wallet's tokens from offset, at most 100, with their traits,
// in the owned index's order; "next" is the following page's offset, or -1.
func GnomesOf(owner address, offset int64) string {
	if offset < 0 {
		offset = 0
	}
	total, _ := token.BalanceOf(owner)
	ids, more := ownedPage(owner, int(offset), pageSize)
	next := int64(-1)
	if more {
		next = offset + pageSize
	}
	s := `{"version":1,"owner":"` + owner.String() + `","total":` + strconv.FormatInt(total, 10) + `,"next":` + strconv.FormatInt(next, 10) + `,"rows":[`
	for i, id := range ids {
		tr, _, tier, _ := lookOf(id)
		if i > 0 {
			s += ","
		}
		s += `{"id":"` + string(id) + `","tier":"` + tier + `","traits":"` + tr + `"}`
	}
	return s + "]}"
}
```

The index's order is the strings', so `"10"` comes before `"2"`; the test's first row is `"1"`, then `"10"`, `"100"`, `"101"`… which the assertions above allow. (Walking from the wallet's first row costs O(offset) per page; a wallet holds at most its caps (18 bought, one Legendary among them), nine earned gnomes and what it was sent. Note it in docs/gnomes.md.)

- [ ] **Step 4: Run.** Expected: PASS.

- [ ] **Step 5: Commit.**

### Task 26: `Sweep` **(built, to move)**

Built in `auction.gno`, where it leaves the escrowed top bid. With no auction the realm holds nothing in the normal course, so `Sweep` sends its whole balance, and moves to `sweep.gno` before `auction.gno` is deleted (Task 28).

**Files:**
- Create: `gno.land/r/gnogolf/gnomes/sweep.gno`
- Modify: `owner_test.gno`

**Interfaces:**
- Produces: `Sweep(cur realm)`; event `Swept` (`amount`, `treasury`).

- [ ] **Step 1: Write the failing test:**

```go
func TestSweepSendsStrayCoinsToTheTreasury(cur realm, t *testing.T) {
	fresh(cur)
	testing.IssueCoins(self, chain.Coins{chain.Coin{Denom: "ugnot", Amount: 7_000_000}}) // sent by mistake
	before := coin(vault)
	testing.SetRealm(testing.NewUserRealm(alice))
	urequire.AbortsContains(t, cur, "only the owner", func() { Sweep(cross(cur)) })
	testing.SetRealm(testing.NewUserRealm(boss))
	Sweep(cross(cur))
	uassert.Equal(t, before+7_000_000, coin(vault))
	uassert.Equal(t, int64(0), coin(self), "the realm keeps nothing")
}
```

(imports `chain` in `owner_test.gno`.)

- [ ] **Step 2: Run.** → FAIL (the built `Sweep` is in `auction.gno` and subtracts the escrow).

- [ ] **Step 3: Implement** `sweep.gno`:

```go
package gnomes

import (
	"chain"
	"strconv"
)

// Sweep sends the realm's ugnot to the treasury. The realm holds none in the
// normal course (a sale is forwarded in its own call, and there is no
// escrow); this is for coins someone sent it by mistake.
func Sweep(cur realm) {
	ownerOnly(cur, "sweep")
	extra := balance()
	if extra <= 0 {
		return
	}
	sweepOut(cur, extra)
	chain.Emit("Swept", "amount", strconv.FormatInt(extra, 10), "treasury", treasury.String())
}
```

- [ ] **Step 4: Run.** Expected: PASS.

- [ ] **Step 5: Commit.**

### Task 27: the sale's storage and gas, measured **(built in part)**

**Files:** `gno.land/r/gnogolf/gnomes/z_storage_buy_filetest.gno` (built), `z_storage_buy2_filetest.gno`, `z_storage_equip_filetest.gno` (to add)

- [ ] **Step 1:** Each filetest publishes the genesis as Task 16's does, sets a closing date, opens the genesis's sale with no player window, and as a user buys `"1"` (a Common, 36 GNOT, with the envelope issued to the realm's address); `buy2` then buys `"2"`; `equip` then calls `Equip("1")`. Their comments say what they store.
- [ ] **Step 2: Fill the goldens.** `-run 'TestFiles/z_storage_(buy|equip)' -update-golden-tests`. Expected: a first buy of about 3.5 KB for gnomes (measured 3,535 bytes), a second a few hundred bytes to 2 KB more, an equip a bptree row. A figure far off is a finding: look for what was stored before accepting it.
- [ ] **Step 3: Write the figures** into each comment ("measured: N bytes, N/10,000 GNOT"), and keep them for Task 43.
- [ ] **Step 4: Milestone check.** `scripts/check.sh`. Expected: `all checks passed`. **Commit.**

---

## Milestone 4: no auction; the closing date, the treasury, the site

**The auction is dropped** (decided 2026-10-06). The seven Legendaries are sold at their fixed price (1,296 GNOT at deploy) by the same `Buy` as the other tiers, one a wallet. The reasons: simplicity (no escrow, no refunds, no state machine of running, ended and settled, and a third fewer tests and goldens) and legal clarity (no bid that is an order the buyer cannot withdraw, no auction rules to publish and defend, no coins held by the realm between calls). The built `auction.gno` (`StartAuction`, `CancelAuction`, `Bid`, `Settle`, `Auction`, the escrow, the soft close and the minimum raise) and its tests are deleted; nothing replaces them.

### Task 28: the auction removed, the Legendaries through `Buy`

**Files:**
- Delete: `gno.land/r/gnogolf/gnomes/auction.gno`, `auction_test.gno` (after Task 26 moved `Sweep`)
- Modify: `config.gno` (`auctionTier`, `softClose`, `minRaiseBps`, `minRaise`, `maxHours` gone; `lifetimeCap` and `playerCap` gain the Legendary's 1), `buy.gno` (the Legendary refusal gone), `build` (no `running`, `last`), `read.gno` (`Collection` without an auction), `render.gno` later (Task 40)

- [ ] **Step 1: Write the failing test** `TestALegendaryIsBoughtLikeAnyGnome` (Task 19): with the genesis's sale open, alice buys `"104"` with exactly 1,296 GNOT attached; the treasury's balance rises by that, the realm's stays 0; alice's second Legendary (`"208"`) is refused with "One Legendary a wallet."; in the sale's player window, a Legendary counts against a window cap of 1.
- [ ] **Step 2: Run** → FAIL ("sold by auction"). **Implement:** delete the files and constants above; `Buy` treats `legendary` as a tier like the others.
- [ ] **Step 3: Check that nothing is left:** `grep -n "auction\|Bid\|Settle\|escrow\|softClose\|minRaise" gno.land/r/gnogolf/gnomes/*.gno` → nothing.
- [ ] **Step 4: Run** the whole package. Expected: PASS. **Commit.**

### Task 29: the caps, the Legendary's included

- [ ] **Step 1: Hold the tests to:** lifetime caps 10/5/2/1 and window caps 3/2/1/1 (`Collection` shows both); a batch of five that would cross any cap refused whole; a refused batch moves no coin.
- [ ] **Step 2: Run** `-run 'TestAWallet|TestThePlayer|TestALegendary'`. Expected: PASS. **Commit.**

### Task 30: the closing date

**Files:**
- Create: `gno.land/r/gnogolf/gnomes/close.gno`, `close_test.gno`
- Modify: `sale.gno` (`OpenSale`; `waves.gno`'s `AddWave` before ADR-013), `gnomes.gno` (`SetMintOpen`), `buy.gno`, `read.gno` (`Collection`)

**Interfaces:**
- Produces: `closeAt int64` (0 while unset); `SetCloseAt(cur realm, at int64)`; `closed(now int64) bool`; event `CloseAtSet` (`at`); refusals `errNoClose`, `errLater`, `errPast`, `errClosed`.

- [ ] **Step 1: Write the failing tests:**

```go
func TestTheClosingDateOnlyComesEarlier(cur realm, t *testing.T) {
	fresh(cur)
	now := time.Now().Unix()
	testing.SetRealm(testing.NewUserRealm(boss))
	urequire.AbortsContains(t, cur, "set the closing date first", func() { OpenSale(cross(cur), "genesis", now+60, 48) })
	testing.SetRealm(testing.NewUserRealm(boss))
	urequire.AbortsContains(t, cur, "set the closing date first", func() { SetMintOpen(cross(cur), true) })
	testing.SetRealm(testing.NewUserRealm(alice))
	urequire.AbortsContains(t, cur, "only the owner", func() { SetCloseAt(cross(cur), now+90*86400) })
	testing.SetRealm(testing.NewUserRealm(boss))
	urequire.AbortsContains(t, cur, "in the past", func() { SetCloseAt(cross(cur), now-1) })
	testing.SetRealm(testing.NewUserRealm(boss))
	SetCloseAt(cross(cur), now+90*86400)
	testing.SetRealm(testing.NewUserRealm(boss))
	urequire.AbortsContains(t, cur, "never later", func() { SetCloseAt(cross(cur), now+91*86400) })
	testing.SetRealm(testing.NewUserRealm(boss))
	SetCloseAt(cross(cur), now+60*86400) // earlier: taken
	uassert.Equal(t, now+60*86400, closeAt)
	testing.SetRealm(testing.NewUserRealm(boss))
	urequire.AbortsContains(t, cur, "after the close", func() { OpenSale(cross(cur), "genesis", now+60*86400, 48) })
}

func TestNothingSellsAfterTheClose(cur realm, t *testing.T) {
	// the genesis's sale open, closeAt a block ahead; SkipHeights past it (SetRealm and
	// SetOriginSend again after it, §16): Buy("1") refused "sale closed" and
	// the coins kept; Sold() unchanged; MintEarned still works (it sells nothing).
}
```

- [ ] **Step 2: Run** `-run 'TestTheClosingDate|TestNothingSells'` → FAIL. **Implement** `close.gno`:

```go
package gnomes

import (
	"chain"
	"strconv"
	"time"
)

const (
	errNoClose = "gnomes: set the closing date first (SetCloseAt)"
	errLater   = "gnomes: the closing date can come earlier, never later"
	errPast    = "gnomes: the closing date cannot be in the past"
	errClosed  = "gnomes: sale closed"
	errAfter   = "gnomes: the genesis sale starts before it closes"
)

// closeAt is the genesis sale's end, unix seconds; 0 until the owner sets it
// at launch. It can be moved earlier, never later: a buyer reads a date that
// can only shorten. From it on nothing of the genesis sells, and what is
// unsold then is never minted.
var closeAt int64

func SetCloseAt(cur realm, at int64) {
	ownerOnly(cur, "set the closing date")
	if at <= time.Now().Unix() {
		panic(errPast)
	}
	if closeAt != 0 && at > closeAt {
		panic(errLater)
	}
	closeAt = at
	chain.Emit("CloseAtSet", "at", strconv.FormatInt(at, 10))
}

func closed(now int64) bool { return closeAt == 0 || now >= closeAt }
```

`OpenSale` refuses the genesis's sale with `errNoClose` while `closeAt` is 0 and with `errAfter` when `start >= closeAt`; `SetMintOpen(true)` refuses with `errNoClose` while it is 0; `Buy` refuses with `errClosed` when `closed(now)` for any genesis id (a later series carries its own dates, §2); `build` resets `closeAt`; `Collection` reports `"closeAt"`.
- [ ] **Step 3: Run** → PASS. **Commit.**

### Task 31: the treasury, changed in two steps

**Files:** Modify: `owner.gno`, `owner_test.gno`

**Interfaces:**
- Produces: `pendingTreasury address`; `SetTreasury(cur realm, to address)` (owner: offers); `AcceptTreasury(cur realm)` (the offered address: takes it, and the default royalty follows); `Treasury() address`; events `TreasuryOffered` (`to`), `TreasurySet` (`treasury`).

- [ ] **Step 1: Write the failing test** `TestTheTreasuryMovesInTwoSteps`: alice cannot offer; the owner's offer of the realm's own address, of the owner's, or of `"nope"` refused (`errTreasury`); the owner offers `heir`; bob cannot accept; `heir` accepts; `Treasury()` is `heir`, `RoyaltyInfo` pays `heir`, and a `Buy` after it lands at `heir`; a second offer replaces the first before it is accepted.
- [ ] **Step 2: Run** → FAIL. **Implement** as the owner's own two steps (Task 17), the checks of `setUp` on the offered address. **Run** → PASS. **Commit.**

### Task 32: after `Renounce`

- [ ] **Step 1: Write the tests:** after `Renounce`, `SetPrice`, `OpenSale`, `CancelSale`, `AddSeries`, `SetMintOpen`, `SetCloseAt`, `SetTreasury`, `SetSiteURL`, `SetRoyaltyBps` and `Sweep` refused; a pending treasury can still be accepted; the sales opened stay on sale at their prices until the closing date as set; nothing new opens. A renounced realm sells what it opened, until its close, and nothing more.
- [ ] **Step 2: Implement** in `owner.gno`. **Run** → PASS. **Commit.**

### Task 33: the site's URL

**Files:** Modify: `owner.gno`, `config.gno` (`siteAtDeploy`, staged; `maxURL = 128`), `owner_test.gno`

**Interfaces:**
- Produces: `site string` (`siteAtDeploy` at deploy); `SetSiteURL(cur realm, url string)`; `siteURL() string`; event `SiteURLSet` (`url`); refusal `errURL`.

- [ ] **Step 1: Write the failing test** `TestTheSiteURLIsTheOwners`: alice refused; `"http://x"`, `""`, a URL of 129 bytes, one with a space, a quote, `<` or a control byte refused; `"https://gnogolf.example/"` taken and kept without its trailing slash; `TokenMetadata`'s `external_url` and `Render`'s links follow it (Tasks 38, 40).
- [ ] **Step 2: Run** → FAIL. **Implement:** `https://` then 1 to 120 bytes of `[A-Za-z0-9./:_~%-]`, at most 128 in all. **Run** → PASS. **Milestone check.** `scripts/check.sh` → `all checks passed`. **Commit.**

---

## Milestone 5: earned gnomes

### Task 34: `MintEarned`

**Files:**
- Modify: `earned.gno`, `earned_test.gno`, `gnomes.gno` (`nextEarned`, reset in `build`)

**Interfaces:**
- Produces: `MintEarned(cur realm, kind string) grc721.TokenID`; `nextEarned int` (1000001 at deploy); event `GnomeEarned` (`id`, `kind`, `player`); errors `errMinted`, `errNotProven`.

- [ ] **Step 1: Write the failing tests:**

```go
func TestAProvenKindIsMintedFreeOnce(cur realm, t *testing.T) {
	fresh(cur)
	f := newFake()
	rows = f
	a := alice.String()
	for _, id := range cupHoles(f, "garden", 18) {
		best(f, id, "assisted", a, 3)
	}
	testing.SetRealm(testing.NewUserRealm(alice))
	envelope(1)
	urequire.AbortsContains(t, cur, "this call is free", func() { MintEarned(cross(cur), "wizard") })
	testing.SetRealm(testing.NewUserRealm(alice))
	testing.SetOriginSend(nil)
	urequire.AbortsContains(t, cur, "not proven: miner", func() { MintEarned(cross(cur), "miner") })
	testing.SetRealm(testing.NewUserRealm(alice))
	testing.SetOriginSend(nil)
	uassert.Equal(t, grc721.TokenID("1000001"), MintEarned(cross(cur), "wizard"))
	testing.SetRealm(testing.NewUserRealm(alice))
	testing.SetOriginSend(nil)
	uassert.Equal(t, grc721.TokenID("1000002"), MintEarned(cross(cur), "viking"))
	testing.SetRealm(testing.NewUserRealm(alice))
	testing.SetOriginSend(nil)
	urequire.AbortsContains(t, cur, "already minted", func() { MintEarned(cross(cur), "wizard") })
	uassert.True(t, strings.Contains(Proof("wizard", alice), `"minted":"1000001"`))
	uassert.True(t, strings.Contains(Gnome("1000001"), `"name":"The Wizard","tier":"earned"`))
	testing.SetRealm(testing.NewCodeRealm("gno.land/r/attacker/relay"))
	urequire.AbortsContains(t, cur, "straight from an account", func() { MintEarned(cross(cur), "golden") })
}

func TestNewRulesRefuseTheMint(cur realm, t *testing.T) {
	fresh(cur)
	f := newFake()
	f.writer = "gno.land/r/gnogolf/golf/v3"
	rows = f
	testing.SetRealm(testing.NewUserRealm(alice))
	testing.SetOriginSend(nil)
	urequire.AbortsContains(t, cur, "rules changed", func() { MintEarned(cross(cur), "wizard") })
}

func TestABurnedKindIsMintedAgain(cur realm, t *testing.T) {
	fresh(cur)
	f := newFake()
	rows = f
	for _, id := range cupHoles(f, "mines", 18) {
		best(f, id, "pro", alice.String(), 9)
	}
	testing.SetRealm(testing.NewUserRealm(alice))
	testing.SetOriginSend(nil)
	id := MintEarned(cross(cur), "miner")
	testing.SetRealm(testing.NewUserRealm(alice))
	Equip(cross(cur), id)
	testing.SetRealm(testing.NewUserRealm(alice))
	urequire.AbortsContains(t, cur, "bound to its player", func() { TransferFrom(cross(cur), alice, bob, id) })
	testing.SetRealm(testing.NewUserRealm(alice))
	Burn(cross(cur), id)
	uassert.True(t, strings.Contains(Worn(alice), `"id":"","how":""`), "nothing left to show")
	testing.SetRealm(testing.NewUserRealm(alice))
	testing.SetOriginSend(nil)
	uassert.Equal(t, grc721.TokenID("1000002"), MintEarned(cross(cur), "miner"), "a new id: ids are never reused")
}
```

(imports `grc721` in `earned_test.gno`.)

- [ ] **Step 2: Run.** `-run 'TestAProvenKind|TestNewRulesRefuse|TestABurnedKind'` → FAIL.

- [ ] **Step 3: Implement** (append to `earned.gno`):

```go
const (
	errMinted    = "gnomes: already minted: "
	errNotProven = "gnomes: not proven: "
)

var nextEarned = firstEarned

// MintEarned mints the caller's earned gnome of kind once store proves the
// feat (§7). Free: nothing attached, the caller pays the deposit. Once per
// player and kind, until it is burned.
func MintEarned(cur realm, kind string) grc721.TokenID {
	who := unpaid(cur)
	if kindIndex(kind) == 0 {
		panic(errKind + kind)
	}
	key := who.String() + " " + kind
	if earned.Has(key) {
		panic(errMinted + kind)
	}
	ok, _, why := prove(kind, who.String())
	if why != "" {
		panic("gnomes: " + why)
	}
	if !ok {
		panic(errNotProven + kind)
	}
	id := grc721.TokenID(strconv.Itoa(nextEarned))
	nextEarned++
	kinds.Set(string(id), kind)
	earned.Set(key, string(id))
	if err := ledger.Mint(who, id); err != nil {
		panic("gnomes: " + err.Error())
	}
	chain.Emit("GnomeEarned", "id", string(id), "kind", kind, "player", who.String())
	return id
}
```

(imports `chain`, `grc721`.) `build` resets `nextEarned = firstEarned`; `fresh` resets `rows = storeReader{}` so a test's fake never leaks into the next.

- [ ] **Step 4: Run.** Expected: PASS. Then the whole package.

- [ ] **Step 5: Commit.**

### Task 35: an earned mint's storage and gas, measured

**Files:**
- Create: `gno.land/r/gnogolf/gnomes/z_storage_earned_filetest.gno`

- [ ] **Step 1: Write it**, reusing Task 9's seeding pattern: as golf/v2's code realm, store gets the Garden Cup's 18 slots, entries and one assisted best each for a user `earner`; then, as `earner`, `testing.SetOriginSend(nil)` and `println(gnomes.MintEarned(cross(cur), "wizard"))`. Goldens `// Output:` (`1000001`), `// Storage:`, `// Gas:`. Comment: "an earned gnome: owner, balance and owned rows, plus earned and kinds, no cap row (§9: estimated 1.5 to 2.5 KB)".

- [ ] **Step 2: Fill the goldens.** `-run TestFiles/z_storage_earned -update-golden-tests`. Expected: gnomes' figure 1,200 to 3,000 bytes. The gas covers the Wizard's proof (one page, 36 gets) and the mint; with Task 9's King figure this gives `MintEarned`'s gas ceiling: King's proof plus (this file's gas minus a Wizard `Proof`'s). Keep both for Task 43.

- [ ] **Step 3: Commit.**

### Task 36: the proof against onyx's real rows

**Files:**
- Create: `scripts/gnomesproof.ts`

A script, not a unit test: it reads onyx (no writes) and is run before each deploy of gnomes (§16). It can only run once gnomes is deployed on onyx (rollout step 2); until then it is run against a local gnodev with the course published (README, steps 1 and 2) and gnomes loaded.

**Interfaces:**
- Consumes: `makeChain` (`web/lib/chain.ts`), golf/v2's `BestOf(id, mode, player)`, store's `Has("copies", key)`, gnomes' `Proof(kind, player)`.

- [ ] **Step 1: Write the script:**

```ts
#!/usr/bin/env -S node --experimental-strip-types
// The earned proof against a chain's real rows (spec §7, §16): for every
// player on the course's boards, gnomes' Proof for each kind, compared with
// what golf/v2's own reads say (BestOf on every current slot, a best with a
// copies row skipped, as the realm skips it). Reads only. Run it before each
// deploy of gnomes; exits non-zero on the first disagreement.
//
//   RPC=https://rpc.onyx.testnets.gno.land:443 REALM=gno.land/r/<ns>/gnogolf/golf/v2 node --experimental-strip-types scripts/gnomesproof.ts
import "../web/test/setup.mjs";
```

Its outline, in this order:
1. `slots`: page store's `slots` (`Page("slots", "", "", 300)` through `vm/qeval` on the store realm), keep each key's world and version id.
2. `players`: the addresses on `Leaderboard("assisted")` and `Leaderboard("pro")` (the client's `chain.leaderboard`), deduplicated.
3. For each player and slot: `BestOf(id, mode, player)` in both modes through golf/v2; drop a mode whose `store.Has("copies", id+" "+mode+" "+player)` is true; the lower strokes, or none.
4. Compute each kind's `ok`, `holes`, `finished`, `strokes`, `par` (pars from golf/v2's `Holes()`), exactly as §7's table says.
5. Ask gnomes' `Proof(kind, player)` and compare the five fields; print `ok   <kind> <player>` or `FAIL <kind> <player>: realm <json>, golf <json>`.
6. Exit 1 on any FAIL.

- [ ] **Step 2: Run it on a local chain.** Start gnodev (README step 1), publish the course (`scripts/publishdata.sh test1`), save two rounds from the game so the boards have rows, then `RPC=http://127.0.0.1:26657 REALM=gno.land/r/gnogolf/golf/v2 node --experimental-strip-types scripts/gnomesproof.ts`.
Expected: every line `ok`, exit 0.

- [ ] **Step 3: Lint.** `(cd web && npm run -s lint)`. Expected: clean.

- [ ] **Step 4: Milestone check.** `scripts/check.sh` → `all checks passed`.

- [ ] **Step 5: Commit.**

---

## Milestone 6: portrait, metadata, Render

The portrait is the token's wallet picture, drawn by the realm on every read from its catalogue row; it is not the look, which is the game's 3D drawing (§10). It is drawn once, in Gno: the thumbnails and cards are the game's own drawing (Milestone 10), so there is no TypeScript copy of the portrait to keep in step, and no sha256 golden of it. **Decided:** the realm draws the portrait from the traits (the built placeholder, a cone in the tier's colour, goes): the subset below, and plain what it does not know, which keeps it right for any later series.

### Task 37: the portrait from the traits

**Files:**
- Modify: `gno.land/r/gnogolf/gnomes/svg.gno`, `svg_test.gno`
- Create: `gno.land/r/gnogolf/gnomes/palette.gno` (generated by `scripts/gnomesrows.ts --write`: the palette as a constant of 6-hex colours, in `vocab.ts`' order; `--check` fails when it drifts)

**Interfaces:**
- Produces: `drawGnome(g gnome) string`; `traitByte(traits string, i int) (int, bool)`; `paletteAt(i int) (string, bool)`.

- [ ] **Step 1: Write the failing tests:** a Common's portrait has its hat's, body's and hair's colours from the palette (byte 7, 11, 10), its hat's shape for codes 0–5 (`GNOMES`' six) and the cone for any later code; the tier's ground and frame (grey, blue, purple, gold, as `TIER_LOOK`); a beard of codes 0–4 drawn as its shape and any later code as full; a colour index past the palette or 255 drawn as the default; traits of another format, or not hex, drawn as the plain gnome; a name with `<`, `&` and `"` escaped (`TestANameCannotInjectMarkup`); the SVG under 4 KB.
- [ ] **Step 2: Run** `-run 'TestThePortrait|TestAName'` → FAIL. **Implement**. **Run** → PASS.
- [ ] **Step 3: Commit.**

### Task 38: `TokenURI` and `TokenMetadata`

**Files:** Modify: `svg.gno`; Create: `metadata.gno`, `metadata_test.gno`

**Interfaces:**
- Produces: `TokenURI(tid string) (string, error)` (only for a minted token); `TokenMetadata(tid string) (string, error)`: `{"name","description","image","external_url","attributes":[{"trait_type":"Tier","value":…},{"trait_type":"Series","value":…},{"trait_type":"World","value":…}]}` (§4), `external_url` the gnome's page on the site (`<site>/g/<id>/`, `<site>` the owner's setting, `SetSiteURL`, Task 33; at deploy `siteAtDeploy`, staged from the URL `web/lib/site.ts`' `SITE` resolves to).

- [ ] **Step 1: Write the failing tests:** an unminted id refused by both; a minted Common's metadata parses as JSON, its `image` equal to `TokenURI`, its `name` the row's, escaped; an earned token's attributes name its kind; after `SetSiteURL("https://other.example")`, `external_url` is `https://other.example/g/<id>/`.
- [ ] **Step 2: Run** → FAIL. **Implement.** **Run** → PASS. **Commit.**

### Task 39: what a wallet reads, end to end

**Files:** Create: `gno.land/r/gnogolf/gnomes/z_wallet_filetest.gno`

- [ ] **Step 1:** Publish the genesis, set a closing date, open its sale, buy `"1"`, then print `Name()`, `Symbol()`, `BalanceOf`, `OwnerOf("1")`, the first 60 characters of `TokenURI("1")` and `TokenMetadata("1")`'s keys. `// Output:` golden.
- [ ] **Step 2: Fill it.** Expected: `Gnogolf Gnomes`, `GNOME`, 1, the buyer, `data:image/svg+xml;base64,…`, the five keys. **Commit.**

### Task 40: `Render`

**Files:**
- Create: `gno.land/r/gnogolf/gnomes/render.gno`, `render_test.gno`

**Interfaces:**
- Produces: `Render(path string) string`: `""` the collection (the series; a Sale table, a row a series: its ids, prices in GNOT, dates and how many found a player; the closing date; the site's link); `"<id>"` a gnome's page (portrait image, name, tier, owner or "unsold", price, and while it is on sale a `gnokey` line to buy it); `"<kind>"` an earned kind's page (portrait, what earns it, "minted free once the chain proves it"); `"<address>"` a player's page (the gnome they show, `Worn`, and their tokens' first page). Anything else: "Not found." with a link home.

- [ ] **Step 1: Write the failing test:**

```go
func TestThePagesGnowebShows(cur realm, t *testing.T) {
	fresh(cur)
	home := Render("")
	uassert.True(t, strings.Contains(home, "# Gnogolf Gnomes"))
	uassert.True(t, strings.Contains(home, "| 1 | 1–104 | 36 / 72 / 336 / 1,296 GNOT | 0 of 104 |"))
	g := Render("208")
	uassert.True(t, strings.Contains(g, "# The Admiral"))
	uassert.True(t, strings.Contains(g, "![The Admiral](data:image/svg+xml;base64,"))
	uassert.True(t, strings.Contains(g, "Legendary"))
	uassert.True(t, strings.Contains(Render("viking"), "Garden Cup at par or under"))
	urequire.NoError(t, ledger.Mint(alice, "42"))
	p := Render(alice.String())
	uassert.True(t, strings.Contains(p, "Shows:"))
	uassert.True(t, strings.Contains(p, "[#42]("))
	uassert.True(t, strings.Contains(Render("nope"), "Not found"))
}
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement** `render.gno`. The kinds' lines are `UNLOCKS`' `need` texts (web/lib/card.ts), copied as a `needs` slice in KINDS order: "Finish the Garden Cup", "Garden Cup at par or under", "Five holes-in-one", "Finish the Island Cup", "Island Cup at par or under", "Finish Mushroom Town", "Mushroom Town at par or under", "The four cups at par or under", "Finish the Crystal Mines". GNOT amounts are printed as whole GNOT when they are (`36 GNOT`, thousands with a comma: `1,296 GNOT`), else with up to six decimals. The buy line is `gnokey maketx call -pkgpath <this realm> -func Buy -args <id> -send <price>ugnot -gas-fee 1000000ugnot -gas-wanted <buy gas> -broadcast -chainid <chain-id> -remote <rpc-url> <your-key-name>` with the realm path from `runtime.CurrentRealm().PkgPath()` and the gas from Task 43's measured figure (until then, 50000000). Links to the site use `siteURL()`. Escape nothing: every string on these pages comes from the table or from addresses.

- [ ] **Step 4: Run.** Expected: PASS.

- [ ] **Step 5: Milestone check.** `scripts/check.sh` → `all checks passed`. Also stage: the size line for gnomes is the code and the palette, no catalogue (published after deploy). Keep it for the deploy's `-max-deposit` (Task 72).

- [ ] **Step 6: Commit.**

---

## Milestone 7: the client's data layer

Pure logic, unit-tested, no screen yet. Nothing here changes what a player sees: the screens come in Milestone 9, behind the flag.

### Task 41: the flag

**Files:**
- Modify: `web/lib/gnomes/game.ts`, `web/test/gnomes.test.ts`

**Interfaces:**
- Produces: `gnomesOn(search?: string, on?: boolean, dev?: boolean): boolean`.

- [ ] **Step 1: Write the failing test:**

```ts
import { gnomesOn } from "../lib/gnomes/game.ts";

test("the gnomes are off unless built on, or asked for in a dev build", () => {
  assert.equal(gnomesOn("", false, false), false);
  assert.equal(gnomesOn("?gnomes", false, false), false, "a production build ignores ?gnomes");
  assert.equal(gnomesOn("?gnomes", false, true), true);
  assert.equal(gnomesOn("?hole=garden/3&gnomes", false, true), true);
  assert.equal(gnomesOn("?gnomesx", false, true), false);
  assert.equal(gnomesOn("", true, false), true);
});
```

- [ ] **Step 2: Run** → FAIL. **Implement:**

```ts
// NEXT_PUBLIC_GNOMES=1 at build time turns the gnomes on (the gnomes' ADR), as
// NEXT_PUBLIC_CLIPS turns the clips on; ?gnomes does in a dev build. (Read as
// written: Next inlines process.env.NEXT_PUBLIC_* only when named literally.)
const GNOMES_ENV = process.env.NEXT_PUBLIC_GNOMES === "1";
const DEV = process.env.NODE_ENV !== "production";
export const gnomesOn = (search = typeof location !== "undefined" ? location.search : "", on = GNOMES_ENV, dev = DEV) =>
  on || (dev && /[?&]gnomes(?=&|=|$)/.test(search));
```

- [ ] **Step 3: Run** → PASS. **Commit.**

### Task 42: the reads, in `chain.ts`

**Files:**
- Modify: `web/lib/chain.ts`, `web/test/chain.test.ts`

**Interfaces:**
- Produces: `gnomesRealm(realm: string): string` (`gno.land/r/…/gnogolf/gnomes` beside golf); `GNOMES_REALM` (`NEXT_PUBLIC_GNOMES_REALM` if a realm path, else `gnomesRealm(REALM)`); `soldSet(hex: string): Set<number>`; types `GnomeRow`, `WornRow`, `GnomesPage`, `ProofRow`, `CollectionRow`; `chain.gnomes.{ gnome(id), sold(), gnomesOf(owner, offset = 0), worn(player), wornMany(players), proof(kind, player), collection() }`. `qeval` gains a last parameter `realm = REALM`.

- [ ] **Step 1: Write the failing tests** (append to `chain.test.ts`, using its `setFetch`, `decoded`, `qevalReply`, `strReply`):

```ts
import { gnomesRealm, GNOMES_REALM, soldSet } from "../lib/chain.ts";

test("gnomes: the realm beside golf's, whatever golf's version", () => {
  assert.equal(gnomesRealm("gno.land/r/gnogolf/golf/v2"), "gno.land/r/gnogolf/gnomes");
  assert.equal(gnomesRealm("gno.land/r/nym-alexiscolin000/gnogolf/golf/v2"), "gno.land/r/nym-alexiscolin000/gnogolf/gnomes");
  assert.equal(gnomesRealm("gno.land/r/gnogolf/golf"), "gno.land/r/gnogolf/gnomes");
  assert.equal(GNOMES_REALM, "gno.land/r/gnogolf/gnomes");
});

test("gnomes: the sold bitmap, bit id-1 low first", () => {
  assert.deepEqual([...soldSet("0102" + "00".repeat(96))], [1, 10]);
  assert.deepEqual([...soldSet("")], []);
  assert.deepEqual([...soldSet("zz")], [], "not hex: nothing sold said");
});

test("gnomes: each read asks the gnomes realm, and is checked", async () => {
  const asked: string[] = [];
  const A = "g1" + "a".repeat(38);
  setFetch((url) => {
    const { expr } = decoded(url);
    asked.push(expr);
    if (expr.includes(".WornMany(")) return qevalReply({ version: 1, rows: [{ player: A, id: "208", name: "The Admiral", tier: "legendary", traits: "010104050203020fff00032500ff00000000ff00ff00ff0903082446ff", how: "best" }] });
    if (expr.includes(".Worn(")) return qevalReply({ version: 1, player: A, id: "", how: "" });
    if (expr.includes(".Proof(")) return qevalReply({ version: 1, kind: "viking", player: A, ok: false, minted: "", holes: 18, finished: 16, strokes: 48, par: 54, missing: ["garden/1"] });
    return qevalReply({ nope: true });
  });
  const c = makeChain();
  assert.equal(await c.gnomes.worn(A), null, "no gnome to show");
  const many = await c.gnomes.wornMany([A, A, "junk"]);
  assert.equal(many.get(A)?.name, "The Admiral");
  assert.equal(many.get(A)?.how, "best", "derived from the chain: nothing was equipped");
  assert.ok(asked.some((e) => e.startsWith("gno.land/r/gnogolf/gnomes.WornMany(\"" + A + "\")")), "repeats and junk not sent");
  assert.deepEqual((await c.gnomes.proof("viking", A)).missing, ["garden/1"]);
  await assert.rejects(c.gnomes.collection(), /not one this page can read/);
});

test("gnomes: wornMany asks 50 at a time, and once a visit", async () => {
  let n = 0;
  setFetch(() => (n++, qevalReply({ version: 1, rows: [] })));
  const c = makeChain();
  const players = Array.from({ length: 120 }, (_, i) => "g1" + String(i).padStart(38, "q"));
  await c.gnomes.wornMany(players);
  assert.equal(n, 3);
  await c.gnomes.wornMany(players.slice(0, 10));
  assert.equal(n, 3, "cached for the visit");
});
```

(The addresses in the last test are shaped, not real: `isAddress` checks `/^g1[0-9a-z]{38}$/`, which they pass.)

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement.** In `chain.ts`:
  - `gnomesRealm`, `GNOMES_REALM` beside `storePath`: `export const gnomesRealm = (realm: string) => realm.replace(/\/v[0-9]+$/, "").replace(/[^/]+$/, "") + "gnomes";`, `const GNOMES_ENV = process.env.NEXT_PUBLIC_GNOMES_REALM || "";`, `export const GNOMES_REALM = isRealmPath(GNOMES_ENV) ? GNOMES_ENV : gnomesRealm(REALM);`.
  - `soldSet(hex)`: `/^([0-9a-f]{2})*$/` or empty set; for byte i, bit j set → id `8*i + j + 1`.
  - `qeval`'s signature gains `realm = REALM` as its last parameter and passes it to `vm`.
  - `checks` gains shape guards in the file's own style: `gnomeRow` (id, name, tier, traits 58 hex, owner, price number, sold boolean), `wornRow` (player, id, and when `id` is not empty name, tier, traits, `how` one of `equipped`, `best`), `wornMany` (`rows` an array of `wornRow`), `gnomesPage` (owner, total, next, rows of id/tier/traits), `proofRow` (kind, player, ok, minted, holes, finished, strokes, par, missing array of strings, optional reason), `collectionRow` (owner, treasury, pendingTreasury, site, royaltyBps, open, closeAt number, tiers of tier/price/cap/playerCap/sold/size, series each with its `sale` or null).
  - `makeChain` returns `gnomes`: each read a `qeval(…, checks.x, undefined, undefined, undefined, GNOMES_REALM)`; `worn` parsed and checked, `null` when its `id` is `""`; `wornMany` dedups, filters `isAddress`, consults a `Map<string, WornRow | null>` kept for the makeChain's life, asks the missing in chunks of 50, records `null` for those not in the answer; `sold` maps `Sold()` through `soldSet`; `gnome(id)` refuses an id that is not `isTokenId` before asking.

- [ ] **Step 4: Run.** `(cd web && node … --test test/chain.test.ts)` then `npx tsc --noEmit`. Expected: PASS.

- [ ] **Step 5: Commit.**

### Task 43: the writes, in `adena.ts`: each alone, never with golf

**Files:**
- Modify: `web/lib/adena.ts`, `web/test/adena.test.ts`

**Interfaces:**
- Produces: `GNOME_GAS = { buy, buyMore, equip, earned }` and `GNOME_BYTES = { buy, buyMore, earned, equip }` (the measured figures of Tasks 9, 27, 35, with a third more gas, rounded up to 1M); `buyGnomes(o)`, `equipGnome(o)`, `mintEarned(o)`, each `{ address, realm, …, price, chainId, rpc }` → `Promise<unknown>`; `gnomeDeposit(kind, price = STORAGE_PRICE): number` (GNOT).

- [ ] **Step 1: Write the failing tests** (append to `adena.test.ts`, with its `fakeAdena`, `setWindow`, `ADDR`):

```ts
import { buyGnomes, equipGnome, mintEarned, recordRound, GNOME_GAS } from "../lib/adena.ts";
import { shotOf } from "../lib/chain.ts";

const GN = "gno.land/r/gnogolf/gnomes";
const sent = (calls: { name: string; args: unknown[] }[]) =>
  calls.filter((c) => c.name === "DoContract").map((c) => (c.args[0] as { messages: { value: { pkg_path: string; func: string; send: string; args: string[] } }[] }).messages);

test("gnomes: a buy is one message, its exact price attached", async () => {
  const f = fakeAdena();
  setWindow({ adena: f.a });
  await buyGnomes({ address: ADDR, realm: GN, ids: ["42", "104"], ugnot: 1_332_000_000, price: 0.001, chainId: "dev", rpc: "http://127.0.0.1:26657" });
  const [msgs] = sent(f.calls);
  assert.equal(msgs.length, 1);
  assert.deepEqual(msgs[0].value, { caller: ADDR, send: "1332000000ugnot", pkg_path: GN, func: "Buy", args: ["42,104"] }); // a Common and a Legendary: 36 + 1,296 GNOT
});

test("gnomes: an equip and an earned mint are each one message of their own", async () => {
  const f = fakeAdena();
  setWindow({ adena: f.a });
  const at = { address: ADDR, realm: GN, price: 0.001, chainId: "dev", rpc: "http://127.0.0.1:26657" };
  await equipGnome({ ...at, id: "208" });
  await mintEarned({ ...at, kind: "viking" });
  const all = sent(f.calls);
  assert.equal(all.length, 2);
  for (const m of all) assert.equal(m.length, 1);
  assert.deepEqual(all.map((m) => [m[0].value.func, m[0].value.send, m[0].value.args]), [
    ["Equip", "", ["208"]], ["MintEarned", "", ["viking"]],
  ]);
});

test("gnomes: a malformed id or kind is never sent", async () => {
  const f = fakeAdena();
  setWindow({ adena: f.a });
  const at = { address: ADDR, realm: GN, price: 0.001, chainId: "dev", rpc: "" };
  await assert.rejects(buyGnomes({ ...at, ids: ["042"], ugnot: 1 }));
  await assert.rejects(buyGnomes({ ...at, ids: ["1", "2", "3", "4", "5", "6"], ugnot: 1 }));
  await assert.rejects(equipGnome({ ...at, id: "x" }));
  await assert.rejects(mintEarned({ ...at, kind: "dragon" }));
  assert.equal(sent(f.calls).length, 0);
});

test("gnomes: no golf save ever carries a gnomes message", async () => {
  const f = fakeAdena();
  setWindow({ adena: f.a });
  await recordRound({ address: ADDR, realm: "gno.land/r/gnogolf/golf/v2", hole: "garden/1/v1", shots: [shotOf(30, 0.5)], period: 7, reset: true, rpc: "http://127.0.0.1:26657" });
  for (const msgs of sent(f.calls)) for (const m of msgs) assert.ok(!m.value.pkg_path.endsWith("/gnomes"));
  assert.ok(GNOME_GAS.buy > 0 && GNOME_GAS.earned >= 300_000_000);
});
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement** in `adena.ts`:

```ts
// The gnomes' calls (the gnomes' ADR): each a transaction of its own, one message,
// never in the same DoContract as a golf message (a gnomes call that panics
// must not take a round or a claim down with it, spec §11). Gas: the
// filetests' measures (gnomes z_storage_* and z_proof_king), a third more.
export const GNOME_GAS = { buy: 0, buyMore: 0, equip: 0, earned: 0 }; // fill from the goldens
// The bytes each stores (the same filetests' // Storage:), for the cost lines.
export const GNOME_BYTES = { buy: 0, buyMore: 0, earned: 0, equip: 0 };

const gnomeCall = (address: string, realm: string, func: string, args: string[], sendUgnot: number, gas: number, price: number, chainId: string | null | undefined, rpc: string, failed: string) => {
  if (!isAddress(address) || !PKG_PATH.test(realm) || !realm.endsWith("/gnomes")) return Promise.reject(new Error("Nothing to send."));
  return send([{ type: "/vm.m_call", value: { caller: address, send: sendUgnot ? `${sendUgnot}ugnot` : "", pkg_path: realm, func, args } }], gas, price, chainId, rpc, failed, "gnogolf gnomes");
};

export function buyGnomes({ address, realm, ids, ugnot, price, chainId, rpc }: GnomeAt & { ids: readonly string[]; ugnot: number }) {
  if (ids.length < 1 || ids.length > 5 || ids.some((id) => !isTokenId(id) || !forSale(id)) || new Set(ids).size !== ids.length || !(ugnot > 0))
    return Promise.reject(new Error("Nothing to send."));
  return gnomeCall(address, realm, "Buy", [ids.join(",")], ugnot, GNOME_GAS.buy + (ids.length - 1) * GNOME_GAS.buyMore, price, chainId, rpc, "The gnome was not bought.");
}
// equipGnome (a token id or "", "Equip": optional, the chain shows the best owned gnome without it),
// mintEarned (kind one of KINDS, "MintEarned"): the same shape, each with its own failure sentence.

/** The deposit a gnomes call leaves, in GNOT, at the chain's storage price (ugnot a byte). */
export const gnomeDeposit = (kind: keyof typeof GNOME_BYTES, ugnotPerByte = 100) => (GNOME_BYTES[kind] * ugnotPerByte) / 1e6;
```

with `type GnomeAt = { address: string; realm: string; price: number; chainId?: string | null; rpc: string }`, `isTokenId` and `KINDS` imported from `./gnomes`. Fill `GNOME_GAS` and `GNOME_BYTES` from the goldens now; `GNOME_GAS.earned` is the larger of 300M and Task 9's King figure plus Task 35's mint overhead, a third more.

- [ ] **Step 4: Run.** The file's tests, `npx tsc --noEmit`. Expected: PASS.

- [ ] **Step 5: Commit.**

### Task 44: the gnokey lines

**Files:**
- Modify: `web/lib/adena.ts` (`gnokeyCall` gains a `send` argument; `gnokeyGnome`), `web/test/adena.test.ts`

**Interfaces:**
- Produces: `gnokeyGnome({ realm, func, args, ugnot, price, chainId, rpc }): string[]` (one line, or none when anything is malformed).

- [ ] **Step 1: Write the failing test:**

```ts
import { gnokeyGnome } from "../lib/adena.ts";

test("gnomes: a gnokey line of its own, -send for a paid call", () => {
  const [line] = gnokeyGnome({ realm: GN, func: "Buy", args: ["42,94"], ugnot: 372_000_000, price: 0.001, chainId: "onyx-1", rpc: "https://rpc.onyx.testnets.gno.land:443" });
  assert.match(line, /^gnokey maketx call -pkgpath gno\.land\/r\/gnogolf\/gnomes -func Buy -args 42,94 -send 372000000ugnot -gas-fee \d+ugnot -gas-wanted \d+ -broadcast -chainid onyx-1 -remote https:\/\/rpc\.onyx\.testnets\.gno\.land:443 <your-key-name>$/);
  const [eq] = gnokeyGnome({ realm: GN, func: "Equip", args: ["208"], ugnot: 0, price: 0.001, chainId: "onyx-1", rpc: "" });
  assert.ok(!eq.includes("-send"));
  assert.deepEqual(gnokeyGnome({ realm: GN, func: "Buy", args: ["1;rm -rf /"], ugnot: 1, price: 0.001, chainId: "x", rpc: "" }), []);
  assert.deepEqual(gnokeyGnome({ realm: "gno.land/r/gnogolf/golf/v2", func: "Buy", args: ["1"], ugnot: 1, price: 0.001, chainId: "x", rpc: "" }), []);
});
```

- [ ] **Step 2: Run** → FAIL. **Implement:** `gnokeyCall(pkg, func, args, gas, price, on, send = "")` inserts ` -send ${send}` before ` -gas-fee` when `send` is set (existing callers unchanged). `gnokeyGnome` checks `realm` ends in `/gnomes` and passes `PKG_PATH`, `func` is one of `Buy`, `Equip`, `MintEarned`, every arg matches `/^[0-9a-z,]{0,64}$/`, picks the gas from `GNOME_GAS` by func, and returns `[gnokeyCall(…)]`. The picker's and shop's gnokey panels (Milestone 9) print it apart from any save's lines.

- [ ] **Step 3: Run** → PASS. **Commit.**

### Task 45: a token in the player's prefs

**Files:**
- Modify: `web/lib/prefs.ts`, `web/test/prefs.test.ts`

**Interfaces:**
- Produces: `savedGnome(owned: readonly string[] = []): string`: a saved `"t42"` is kept only when `owned` includes `"42"`; otherwise as today.

- [ ] **Step 1: Write the failing test:**

```ts
test("savedGnome: a token kept while the account owns it, dropped once it does not", () => {
  saveGnome("t42");
  assert.equal(savedGnome(["42", "7"]), "t42");
  assert.equal(savedGnome(["7"]), "classic");
  assert.equal(savedGnome(), "classic", "no account read yet: as today");
  saveGnome("t042");
  assert.equal(savedGnome(["42"]), "classic", "not a token id");
});
```

- [ ] **Step 2: Run** → FAIL. **Implement:**

```ts
/** The gnome this player picked, if it is still theirs to play; the first one otherwise.
 *  owned: the token ids the connected account holds (GnomesOf), for a picked token ("t42"). */
export function savedGnome(owned: readonly string[] = []) {
  try {
    const id = localStorage.getItem(GNOME_KEY) || "";
    const tok = tokenIdOf(id);
    if (tok) return owned.includes(tok) ? id : GNOMES[0].id;
    const gn = GNOMES.find((x) => x.id === id);
    if (!gn || (gn.unlock && !earned().includes(gn.id))) return GNOMES[0].id;
    return gn.id;
  } catch {
    return GNOMES[0].id;
  }
}
```

(import `tokenIdOf` from `./gnomes`.) Existing callers pass nothing and behave as today.

- [ ] **Step 3: Run** → PASS (the whole `prefs.test.ts`). **Commit.**

### Task 46: a gnome id resolved to its `Skin`

**Files:**
- Modify: `web/lib/gnomes/game.ts`, `web/test/gnomes.test.ts`

**Interfaces:**
- Produces: `rememberTokens(rows: readonly { id: string; traits: string }[]): void` (an account's `GnomesOf` rows, kept for the visit: an earned token's look is known only from them); `resolveSkin(gnomeId: string | null | undefined): Skin` (a `GNOMES` id → it; `"t<id>"` → the catalogue entry's `skin` (`data/gnomes.json`) or `skinOfTraits` of a remembered token; anything else → `GNOMES[0]`); `skinOfWorn(row: { id: string; name: string; traits: string } | null): Skin | null`.

- [ ] **Step 1: Write the failing test:**

```ts
import { resolveSkin, rememberTokens, skinOfWorn } from "../lib/gnomes/game.ts";

test("a gnome id resolves to the skin makeBall draws", () => {
  assert.equal(resolveSkin("sage").id, "sage");
  assert.equal(resolveSkin("t208").name, "The Admiral");
  assert.equal(resolveSkin("t208").shape, "tricorn");
  assert.equal(resolveSkin("t1000001").id, "classic", "an earned token not yet seen");
  rememberTokens([{ id: "1000001", traits: "01000002000000ffff00ffff00ff00000000ff00ff00ff00ff00ff00ff" }]);
  assert.equal(resolveSkin("t1000001").helmet, true, "the Viking, once GnomesOf said so");
  assert.equal(resolveSkin("nope").id, "classic");
  assert.equal(resolveSkin(null).id, "classic");
  assert.equal(skinOfWorn({ id: "208", name: "The Admiral", traits: "zz" }), null);
});
```

- [ ] **Step 2: Run** → FAIL. **Implement** with the designer's modules, not a second decoder (`skin.ts` already imports `GNOMES`; the scripts import `codec.ts` and `vocab.ts` alone):

```ts
const remembered = new Map<string, string>(); // token id -> traits
export function rememberTokens(rows: readonly { id: string; traits: string }[]) {
  for (const r of rows) if (isTokenId(r.id) && decode(r.traits)) remembered.set(r.id, r.traits);
}
export function resolveSkin(gnomeId: string | null | undefined): Skin {
  const tok = tokenIdOf(gnomeId || "");
  if (tok) {
    const e = entryOf(CATALOGUE, Number(tok));
    if (e) return e.skin;
    const traits = remembered.get(tok), t = traits ? decode(traits) : null;
    if (t) return skinOf(t, { id: `t${tok}`, name: earnedName(t.kind), line: "" });
  }
  return GNOMES.find((g) => g.id === gnomeId) ?? GNOMES[0];
}
export function skinOfWorn(r: { id: string; name: string; traits: string } | null): Skin | null {
  const t = r ? decode(r.traits) : null;
  return r && t ? skinOf(t, { id: `t${r.id}`, name: r.name, line: "" }) : null; // traits it cannot read: the rival's own gnome instead
}
```

with `earnedName(kind)` the name of `CATALOGUE.earned` of that kind, else "A gnome".

- [ ] **Step 3: Run** → PASS. **Commit.**

### Task 47: share texts, the consent, the receipt

**Files:**
- Modify: `web/lib/gnomes/game.ts`, `web/test/gnomes.test.ts`

**Interfaces:**
- Produces: `shareText(m: ShareMoment): { text: string; path: string }` for `{ kind: "bought"; id; name } | { kind: "earned"; kindId; cup; atPar } | { kind: "equipped"; id; name }`; `CONSENT` (the box's sentence); `TRADER` (from `NEXT_PUBLIC_TRADER_NAME`, `NEXT_PUBLIC_TRADER_ADDRESS`, `NEXT_PUBLIC_TRADER_CONTACT`); `traderReady(t = TRADER): boolean`; `receiptLines(r: { hash; id; name; ugnot; date: Date; trader; consent }): string[]`; `gnotOf(ugnot: number): string`.

- [ ] **Step 1: Write the failing test:**

```ts
import { shareText, CONSENT, receiptLines, traderReady, gnotOf } from "../lib/gnomes/game.ts";

test("the share moments say what happened, and link the gnome's page", () => {
  assert.deepEqual(shareText({ kind: "bought", id: "42", name: "Wick Bankside" }), { text: "I just adopted Wick Bankside, gnome #42 of Gnogolf.", path: "/g/42/" });
  assert.deepEqual(shareText({ kind: "earned", kindId: "viking", cup: "Garden Cup", atPar: true }), { text: "Garden Cup at par: the Viking is mine, proven on-chain.", path: "/g/viking/" });
  assert.deepEqual(shareText({ kind: "bought", id: "720", name: "Storm Gnome" }), { text: "I just adopted Storm Gnome, gnome #720 of Gnogolf.", path: "/g/720/" }, "a Legendary is bought like any gnome");
  assert.deepEqual(shareText({ kind: "equipped", id: "208", name: "The Admiral" }), { text: "My gnome for the boards: The Admiral.", path: "/g/208/" });
});

test("no word of the shop speaks of value", () => {
  for (const s of [CONSENT, ...receiptLines({ hash: "ab", id: "42", name: "Wick Bankside", ugnot: 36e6, date: new Date(0), trader: { name: "T", address: "A", contact: "C" }, consent: CONSENT })])
    assert.ok(!/floor|return|flip|invest|profit/i.test(s), s);
});

test("the receipt carries what the directive asks", () => {
  const lines = receiptLines({ hash: "0xabc", id: "42", name: "Wick Bankside", ugnot: 36_000_000, date: new Date("2026-10-06T12:00:00Z"), trader: { name: "Taro Yamada", address: "1-2-3 Example, Shibuya-ku, Tokyo, Japan", contact: "hello@example.org" }, consent: CONSENT });
  for (const want of ["0xabc", "Wick Bankside", "#42", "36 GNOT", "2026-10-06", "Taro Yamada", "Shibuya-ku, Tokyo", "hello@example.org", CONSENT]) assert.ok(lines.some((l) => l.includes(want)), want);
  assert.equal(gnotOf(25_500_000), "25.5 GNOT");
  assert.equal(traderReady({ name: "", address: "x", contact: "y" }), false, "no sale without the trader's identity");
});
```

- [ ] **Step 2: Run** → FAIL. **Implement:**

```ts
const THE = (name: string) => (/^The /.test(name) ? name.replace(/^The /, "the ") : `the ${name}`);
export function shareText(m: ShareMoment) {
  switch (m.kind) {
    case "bought": return { text: `I just adopted ${m.name}, gnome #${m.id} of Gnogolf.`, path: `/g/${m.id}/` };
    case "earned": return { text: `${m.cup}${m.atPar ? " at par" : ""}: ${THE(kindRow(m.kindId)?.name ?? m.kindId)} is mine, proven on-chain.`, path: `/g/${m.kindId}/` };
    case "equipped": return { text: `My gnome for the boards: ${m.name}.`, path: `/g/${m.id}/` };
  }
}
export const CONSENT = "I want the gnome delivered now, and I lose my 14-day right of withdrawal.";
export const TRADER = { name: process.env.NEXT_PUBLIC_TRADER_NAME || "", address: process.env.NEXT_PUBLIC_TRADER_ADDRESS || "", contact: process.env.NEXT_PUBLIC_TRADER_CONTACT || "" };
export const traderReady = (t = TRADER) => !!(t.name && t.address && t.contact);
export const gnotOf = (ugnot: number) => `${+(ugnot / 1e6).toFixed(6)} GNOT`;
export function receiptLines(r: { hash: string; id: string; name: string; ugnot: number; date: Date; trader: typeof TRADER; consent: string }) {
  return [
    `Receipt: ${r.name}, gnome #${r.id} of Gnogolf`,
    `Price: ${gnotOf(r.ugnot)}`,
    `Date: ${r.date.toISOString().slice(0, 10)}`,
    `Transaction: ${r.hash}`,
    `Sold by: ${r.trader.name}, ${r.trader.address}. Contact: ${r.trader.contact}`,
    `You agreed: "${r.consent}"`,
  ];
}
```

(The Wizard's line is "the Wizard"; the Golden Gnome's "the Golden Gnome"; check `THE` on the nine names in the test of earned shares if one reads wrong.) Add `NEXT_PUBLIC_TRADER_NAME`, `NEXT_PUBLIC_TRADER_ADDRESS`, `NEXT_PUBLIC_TRADER_CONTACT` to `web/.env.example` with a comment: "the seller's identity (an individual living in Japan), geographic address and contact the shop shows before a purchase (特定商取引法 11条; EU Consumer Rights Directive, Art. 6, while the EU and the UK are served); the shop does not sell without them".

- [ ] **Step 3: Run** → PASS. **Milestone check:** `scripts/check.sh` → `all checks passed` (the coverage floor included: every new `lib/` file is tested above). **Commit.**

---

## Milestone 8: drawing the gnomes

three.js code is outside the unit tests' coverage (`lib/scene/**`, `lib/engine.ts`); its test is the budget test (`web/test/gnome.test.ts`, Task 48), which builds every gnome of the catalogue in Node and holds it to §1. Each drawing task below runs it before and after, and ends with a look at the gnomes it changed on a contact sheet (`npm run gnomes:thumbs -- --sheet <dir>`).

### Task 48: the budget, measured **(built, limits open)**

**Files:** `web/test/gnome.test.ts`, `web/lib/gnomes/validate.ts` (`BUDGET`, `MAX_REACH`)

The designer measures every gnome of the catalogue in Node, from `makeBall`'s meshes (triangles with ink hulls, draws in total, top, reach), not in headless Chrome: no dev server, no hook, run by `npm test`.

- [ ] **Step 1: Read the test against §1:** every gnome of `data/gnomes.json` and the nine earned kinds built; triangles and draws within its tier's limits; its top no higher than the Wizard's; its reach at most `MAX_REACH` (1.1) times the Classic's; reach unchanged with animated pieces at their widest; the fourteen `GNOMES` drawn exactly as before (a fingerprint).
- [ ] **Step 2: Settle the limits.** `BUDGET` allows 6,000 triangles for Commons and Rares and 6,500 for Epics, where §1 says 5,000 and 6,000, and counts draws in total, not added after `bake`. Either the user raises §1's limits after a check on a phone (the heaviest gnome of each tier on the oldest phone at hand, frame time over a hole), or the kit is trimmed to §1's. Until then the test holds `BUDGET` and the spec says what is open.
- [ ] **Step 3: Run** `(cd web && npm test)`. Expected: PASS. **Commit.**

### Task 49: the collection's hats, beards, patterns and pieces **(built)**

**Files:** `web/lib/scene/gnome.ts` (`beardOf`, `makeBall`), `web/lib/scene/gnome-kit.ts` (`kitHat`, `kitWear`, `kitPiece`, `hatTop`, `patternedBody`), `web/lib/gnomes/colour.ts`

- [ ] **Step 1: Look** at a contact sheet (`npm run gnomes:thumbs -- --sheet /tmp/sheets`): each hat, beard, pattern and piece once; the face's eyes and nose visible on every one (§1, "Readable at ball size"); the readability rule (`validate.ts`, `readability`) holds on every ground and as a ghost.
- [ ] **Step 2: Commit** whatever the look found.

### Task 50: the Epic materials and props, faded as ghosts **(built)**

**Files:** `web/lib/scene/gnome-matter.ts` (`dressMatter`), `web/lib/scene/gnome-props.ts` (`propOf`), `web/lib/gnomes/props.ts`

- [ ] **Step 1: Check** that every material and prop takes `ownFade`/`setFade`, so `makeGhost(0.55, skin)` fades all of it: a test builds each Epic as a ghost and asserts every material's opacity is below 1. Add it if missing.
- [ ] **Step 2: Run** `npm test` → PASS. **Commit.**

### Task 51: the Legendaries' moving pieces **(built)**

**Files:** `web/lib/scene/gnome-legend.ts` (`dressLegend`), `web/lib/gnomes/props.ts`

The seven of §2: 104 The Miller's sails turning, 208 The Admiral's epaulettes and pennant, 311 Ancient Mushroom's cap breathing, 414 Summit Gnome's frost cap, 516 Crystal Gnome's cluster, 618 Lava Gnome's vent smoking, 720 Storm Gnome's cloud raining. Each animated piece is left out of the box `reach` is taken from; under reduced motion it holds one still pose.

- [ ] **Step 1: Check** the test that a Legendary's reach does not move with its piece, and that each is within the height limit (the Storm Gnome's cloud included).
- [ ] **Step 2: Look** at the seven turntables in `media/gnomes/turntables/`. **Commit.**

### Task 52: trails and particles **(built)**

**Files:** `web/lib/scene/gnome-fx.ts`

- [ ] **Step 1: Check against §1:** a trail drawn only while rolling, behind the ball, under the aim line's render order, without depth writes, at most 0.6 opaque, at most 1.5 board units, gone 0.6 s after the stop (`MAX_LEN`, `MAX_ALPHA`, `FADE_S`); particles one instanced draw per effect, within the tier's count and the `lowGfx` count; none under `motion` false. A unit test of the timing rules (no three.js) is added if missing.
- [ ] **Step 2: Run** `npm test` → PASS. **Commit.**

### Task 53: holing effects and entrances

**Files:** `web/lib/scene/gnome-fx.ts` (holings, built), entrances (to add), `web/lib/scene/fx-timing.ts`, `web/test/fx-timing.test.ts`

- [ ] **Step 1: Write the failing test** of `fx-timing.ts`: `holingWindow(320)` is `{ start: 320, end: 1820 }`; `entranceAllowed({ firstLoad, retry, ghost, clip })` true only for a first load that is no retry, ghost or clip.
- [ ] **Step 2: Implement** `fx-timing.ts`; the holings start at its `start` and end by its `end`, no particle inside the cup's radius before the drop, no full-screen flash, one still frame without motion; the seven entrances of §2, resolved at once on a tap or a drag, never blocking aiming.
- [ ] **Step 3: Run** → PASS. **Commit.**

### Task 54: the ghost, and the preview's snapshot

**Files:**
- Modify: `web/lib/scene/gnome.ts` (`makeGhost`, `makePreview`)

**Interfaces:**
- Produces: `makePreview(...)` returns `snapshot(): Promise<Blob | null>` beside its existing members; its `show` plays a Legendary's entrance.

- [ ] **Step 1: Write the check first:** the budget hook gains `ghost` rows: `makeGhost(0.55, skin)` of every Epic and Legendary has no `THREE.Points` and no trail mesh. Run → FAIL if `makeGhost` copies fx (it must not: it takes meshes and materials only). Then `scripts/smoke.ts` gains a step (run with `npm run smoke`): on `?gnomes&screen=pick`, `snapshot()` of the picker's preview returns a PNG blob whose first pixel is opaque.

- [ ] **Step 2: Implement** `snapshot()`: render one frame, then in the same task `drawImage` it onto a 2D canvas filled with an opaque ground first (the renderer is `alpha: true` with no drawing buffer kept, `scene/camera.ts`), `toBlob("image/png")`, exactly as `engine.ts`'s snapshot draws and reads in the same task. `show(skin)` starts `fx.entrance` for a Legendary.

- [ ] **Step 3: Run** the budget and `npm run smoke` (local chain and dev server up, README). Expected: `ok`; the smoke step passes. **Commit.**

### Task 55: the engine draws the resolved gnome

**Files:**
- Modify: `web/lib/engine.ts`

- [ ] **Step 1: Write the check first:** a smoke step: `?gnomes&gnome=t208&hole=garden/1` (dev build; `linkedGnome` reads it in Task 64, so here set `localStorage["gnogolf.gnome"] = "t208"` before load, the way `og.mjs` sets the Classic) shows the Admiral: `window.__gnome?.()` (a test hook returning `ball.userData.skinId`) answers `t208`. Run → FAIL.

- [ ] **Step 2: Implement:** lines 110 and 1553, `makeBall(gnomeById(…))` become `makeBall(resolveSkin(…))`; the engine keeps one `Fx` for the live ball: `fx.roll` each frame while the ball rolls, `fx.stop` when it stops, `fx.hole(cup)` at the drop (`DROP_MS`), `fx.entrance(ball)` at a hole's first load (`entranceAllowed`), never on a retry; a tap or drag ends it. Everything only when `gnomesOn()`; when off, the engine's code path is today's (`resolveSkin` of a `GNOMES` id is `gnomeById`).

- [ ] **Step 3: Run** smoke and the budget. Play a hole by hand with the Storm Gnome (`t720`): the trail stays behind the ball under the aim line, the rain only while rolling, the lightning after the drop, no flash. Play it again (a retry): no entrance. With the OS's reduced motion: no trail, no rain, a still holing frame. **Commit.**

### Task 56: the rival's gnome, and the clip's

**Files:**
- Modify: `web/lib/engine/rival.ts`, `web/lib/engine/clip.ts`, `web/components/Share.tsx` (the clip's call), `web/lib/engine.ts` (passes the skin)

- [ ] **Step 1: Write the failing test** for the one pure choice, in `web/test/duel.test.ts` (or a new `rival.test.ts` if `rival.ts` cannot load in Node: then put the helper in `web/lib/gnomes/game.ts`):

```ts
import { ghostSkinOf } from "../lib/gnomes/game.ts";

test("a ghost wears the gnome its player shows (Worn), unless none or the same look as mine", () => {
  const theirs = { id: "208", name: "The Admiral", traits: "010104050203020fff00032500ff00000000ff00ff00ff0903082446ff" };
  assert.equal(ghostSkinOf("g1x", theirs, "classic")?.name, "The Admiral");
  assert.equal(ghostSkinOf("g1x", null, "classic"), null, "none: rivalSkin as today");
  assert.equal(ghostSkinOf("g1x", theirs, "t208"), null, "the same look as mine: rivalSkin");
});
```

Run → FAIL.

- [ ] **Step 2: Implement** `ghostSkinOf(player, worn, mine)` in `gnomes.ts` (`skinOfWorn(worn)`, null when it is null or when its traits equal `resolveSkin(mine)`'s token traits). `rival.ts`'s `made()` uses `ghostSkinOf(gh.player, wornOf(gh.player), gnome()) ?? rivalSkin(gh.player, gnome())`, where `wornOf` reads a map the duel fills with one `chain.gnomes.wornMany` per page of rivals: a rival who owns a gnome shows it without ever having sent `Equip`. `clip.ts`: `ClipOf.gnome` becomes a `Skin`; `recordClip` makes its gnome with `makeBall(skin)` and a `makeFx(skin)` whose trail and holing effect play (the clip ends on the drop); no entrance.

- [ ] **Step 3: Run** the test, `npx tsc --noEmit`, the budget, and record a clip (`?clips&gnomes`, hole any) with the Lava Gnome: its embers trail and the holing puff are in the MP4. **Milestone check:** `scripts/check.sh` → `all checks passed`. **Commit.**

---

## Milestone 9: the screens

Each screen's logic is a pure function in `web/lib/gnomes/game.ts`, tested first; the component is then written against it and checked by hand on the dev server against a local chain with gnomes deployed (gnodev loads the repo's packages; as `test1`, publish the genesis, then `gnokey maketx call -pkgpath gno.land/r/gnogolf/gnomes -func SetCloseAt -args <unix> …`, `OpenSale` and `SetMintOpen true`). Everything renders only when `gnomesOn()`.

### Task 57: the picker lists the account's gnomes

**Files:**
- Modify: `web/lib/gnomes/game.ts`, `web/test/gnomes.test.ts`, `web/components/Golf.tsx` (the gnome picker, the screen the menu's Gnome opens)

**Interfaces:**
- Produces: `pickerRows(tokens: readonly { id: string; traits: string }[], wornId: string | null): { gnomeId: string; skin: Skin; shown: boolean }[]` (tokens after `GNOMES`, in id order; `shown` the one `Worn` gives); `showToEveryone(picked: string, wornId: string | null): boolean` (a token picked that is not the one the chain already shows).

- [ ] **Step 1: Write the failing test:**

```ts
import { pickerRows, showToEveryone } from "../lib/gnomes/game.ts";

test("the picker: the account's tokens, and when to offer the optional Equip", () => {
  const rows = pickerRows([{ id: "208", traits: "010104050203020fff00032500ff00000000ff00ff00ff0903082446ff" }, { id: "42", traits: "0101010001020727ff00163000ff000000002a00ff00ff00ff00ff00ff" }], "208");
  assert.deepEqual(rows.map((r) => r.gnomeId), ["t42", "t208"]);
  assert.equal(rows[1].shown, true);
  assert.equal(showToEveryone("t42", "208"), true);
  assert.equal(showToEveryone("t208", "208"), false);
  assert.equal(showToEveryone("sage", "208"), false, "a gnome of the game is not a token");
});
```

- [ ] **Step 2: Run** → FAIL. **Implement** the two functions.
- [ ] **Step 3: The component.** When an account is connected, the picker reads `chain.gnomes.gnomesOf(account)` from offset 0 and the next pages while `next` is not -1, and `chain.gnomes.worn(account)`, calls `rememberTokens`, and lists `pickerRows` after `GNOMES`, the shown one marked "Others see this one". Picking any owned gnome plays it at once, for free, in this browser (`saveGnome`, the engine's gnome): no transaction. Others see the account's best owned gnome without anything sent; when `showToEveryone`, an optional button "Show this one to everyone" sends `equipGnome` alone; its gnokey panel prints `gnokeyGnome({ func: "Equip" })` apart from any save's lines. After it lands, offer the equip share (Task 63). Nothing is sent with a save.
- [ ] **Step 4: Check by hand:** connect, buy one gnome as `test1` from gnokey, open the picker: it is listed; before any `Equip`, `Worn(account)` on gnoweb answers it with `"how":"best"`; buy a second, pick it, press the button, confirm in Adena: `Worn(account)` answers the second with `"how":"equipped"`. **Commit.**

### Task 58: the shop

**Files:**
- Create: `web/components/Gnomes.tsx`
- Modify: `web/lib/gnomes/game.ts`, `web/test/gnomes.test.ts`, `web/components/Golf.tsx` (a "Gnomes" entry in the menu, and `?screen=shop`), `web/app/globals.css`

**Interfaces:**
- Produces: `cartCheck({ ids, collection, catalogue, sold, bought, window, now }): { ok: boolean; total: number; why: string }` where `collection` is `Collection()`'s answer (each series' sale with its prices and player window), `catalogue` is `data/gnomes.json`, `bought` the account's lifetime count per tier and `window` its count in the current sale's window, if known (the realm checks again); the component `Shop`.

- [ ] **Step 1: Write the failing test:**

```ts
import { cartCheck } from "../lib/gnomes/game.ts";

const COLL = {
  open: true,
  tiers: [
    { name: "common", price: 36e6, cap: 10, playerCap: 3 }, { name: "rare", price: 72e6, cap: 5, playerCap: 2 },
    { name: "epic", price: 336e6, cap: 2, playerCap: 1 }, { name: "legendary", price: 1296e6, cap: 1, playerCap: 1 },
  ],
  closeAt: 1000 + 90 * 86400,
  // the genesis's one sale open since 1000 with its window until 1000 + 48 h
  series: [{ name: "genesis", first: 1, last: 720, sale: { start: 1000, playersUntil: 1000 + 48 * 3600, prices: [36e6, 72e6, 336e6, 1296e6] } }],
};
const at = { collection: COLL, catalogue: CATALOGUE, sold: new Set<number>(), bought: [0, 0, 0, 0], window: [0, 0, 0, 0], player: true };

test("the cart: ids of an open sale, unsold, five at most, within the caps, its exact total", () => {
  const after = 1000 + 49 * 3600; // the window over
  assert.deepEqual(cartCheck({ ...at, ids: ["42", "94"], now: after }), { ok: true, total: 372e6, why: "" });
  assert.equal(cartCheck({ ...at, ids: ["105"], now: 999 }).why, "#105 is not on sale yet.");
  assert.equal(cartCheck({ ...at, ids: ["42"], sold: new Set([42]), now: after }).why, "#42 has found a player.");
  assert.equal(cartCheck({ ...at, ids: ["1", "2", "3", "4", "5", "6"], now: after }).why, "Five gnomes at a time.");
  assert.equal(cartCheck({ ...at, ids: ["94", "95"], bought: [0, 0, 1, 0], now: after }).why, "Two Epic gnomes a wallet.");
  assert.deepEqual(cartCheck({ ...at, ids: ["104"], now: after }), { ok: true, total: 1296e6, why: "" });
  assert.equal(cartCheck({ ...at, ids: ["104"], bought: [0, 0, 0, 1], now: after }).why, "One Legendary a wallet.");
  assert.equal(cartCheck({ ...at, ids: ["1"], now: COLL.closeAt }).why, "The genesis sale has closed.");
  assert.equal(cartCheck({ ...at, ids: ["1"], player: false, now: 1000 }).why, "The first 48 hours are for players: finish a hole first.");
  assert.equal(cartCheck({ ...at, ids: ["94", "95"], now: 1000 }).why, "One Epic a wallet in the players' first 48 hours.");
});
```

- [ ] **Step 2: Run** → FAIL. **Implement** `cartCheck` (the words above; caps spelled "One", "Two", "Three", "Five", "Ten", else digits; `CATALOGUE` is `data/gnomes.json`, imported as the shop imports it).
- [ ] **Step 3: The component.** `Shop`: the closing date on every shop page and on the confirmation ("The genesis sale closes on <date, the viewer's time and UTC>", from `Collection().closeAt`; nothing counts down to it); the sale's card (the series' name, "Genesis", its dates, "61 of 720 found a player" counted up, a "sold out" stamp when it is; its seven Legendaries, "7 Legendaries wait at the flag", sold like the rest at their price, one a wallet); filters by tier, world, archetype, hat and trail (`filterGnomes`); a grid of the sale's gnomes, each its thumbnail (`thumbOf(id)`, lazy: no chain read per gnome) on its tier's frame (`TIER_LOOK`), name, `#id`, price, "found a player" from `chain.gnomes.sold()`; gnomes of a sale not yet open shown "not yet on sale"; a tap opens the gnome on `makePreview`'s turntable; "Add" puts it in the cart (≤ 5). The cart shows `cartCheck`'s total, the deposit line ("plus about N GNOT of storage deposit, returned if you burn it", `gnomeDeposit("buy")`, then `"buyMore"` per extra), the consent box (`CONSENT`, unticked; the button needs it ticked), the trader block (`TRADER`: name, geographic address, contact; with `traderReady()` false the Buy button is replaced by "The shop opens soon."), and "The sale is for adults." On Buy: `buyGnomes` with `cartCheck(...).total` read at that moment from `chain.gnomes.collection()` (an opened sale's prices never change, so a refusal for the amount means the page was stale: say so if it fails with "wrong payment"). On success: the receipt (Task 59), then the bought share (Task 63). No word of value, floors or returns anywhere.
- [ ] **Step 4: Check by hand** on the local chain, after `AddSeries` and a sale with no player window: buy one Common and one Epic in one cart; the treasury (a second key, not `test1`, the owner) balance rises by the sum; then a Legendary, alone; a second Legendary is refused in the cart; a third Epic is refused in the cart before any send. **Commit.**

### Task 59: the receipt

**Files:**
- Modify: `web/components/Gnomes.tsx`, `web/app/globals.css` (a `@media print` block for it)

- [ ] **Step 1:** The receipt is `receiptLines` (Task 47, already tested) on a page of its own after the transaction lands: the hash (linked to gnoweb's transaction view if the network has one), the id and name, the price, the date, the trader, the consent as ticked; a button "Print or save as PDF" calling `window.print()`, and the sentence "Keep this page: the transaction on the chain is the lasting record." The print stylesheet shows the receipt alone.
- [ ] **Step 2: Check by hand:** after a buy, print to PDF from the browser: one page, every line of `receiptLines`. **Commit.**

### Task 60: the shop's country rules

There is no auction screen: the Legendaries are in the shop (Task 58). This task refuses the shop, and only the shop, where the seller does not sell.

**Files:**
- Modify: `netlify.toml`, `web/components/Gnomes.tsx` (the region notice), `web/app/shop-unavailable/page.tsx` (new, static)

- [ ] **Step 1: The rules.** In `netlify.toml`, a redirect of the shop's paths (`/shop/*`, and `/?screen=shop` handled in the client by the page the rule serves) to `/shop-unavailable/`, with `conditions = { Country = ["CN", "CU", "IR", "KP", "SY", "RU", "BY"] }`, status 302 and `force = true`. Nothing else is conditioned: the game, the boards, the gnome pages and the picker stay open everywhere. The EU and the UK are not blocked for now.
- [ ] **Step 2: The page.** `shop-unavailable` says "The gnome shop is not offered in your region. The game stays free to play." and links home. The shop's copy (and the terms) say the realm itself, on the chain, cannot be geoblocked and that the terms still bar sales there.
- [ ] **Step 3: Check** with a Netlify deploy preview and `curl -H "x-country: CN"` (or Netlify's geo override cookie `nf_country=CN`): the shop path redirects, `/` and `/g/208/` do not; with `nf_country=FR` the shop opens. **Commit.**

### Task 61: the earned gnomes' panel

**Files:**
- Modify: `web/lib/gnomes/game.ts`, `web/test/gnomes.test.ts`, `web/components/Gnomes.tsx`

**Interfaces:**
- Produces: `earnedView(p: ProofRow, courseOnChain: boolean): { can: boolean; line: string }`.

- [ ] **Step 1: Write the failing test:**

```ts
import { earnedView } from "../lib/gnomes/game.ts";

test("what the earned panel says", () => {
  const p = { version: 1, kind: "viking", player: "g1x", ok: false, minted: "", holes: 18, finished: 16, strokes: 48, par: 54, missing: ["garden/1", "garden/2"] };
  assert.deepEqual(earnedView(p, true), { can: false, line: "2 holes to finish: garden/1, garden/2." });
  assert.deepEqual(earnedView({ ...p, ok: true, finished: 18, missing: [] }, true), { can: true, line: "Proven on-chain. Mint it free (you pay the storage deposit)." });
  assert.deepEqual(earnedView({ ...p, minted: "1004" }, true), { can: false, line: "Minted: #1004." });
  assert.deepEqual(earnedView({ ...p, reason: "rules changed" } as never, true), { can: false, line: "The game's rules changed: earned gnomes open again with the next update." });
  assert.deepEqual(earnedView(p, false), { can: false, line: "Earned gnomes open with the course." });
});
```

(Over par with every hole finished: "N strokes over par: M at par or under earns it.")

- [ ] **Step 2: Run** → FAIL. **Implement.**
- [ ] **Step 3: The panel.** Nine rows, one per kind (its thumbnail and `UNLOCKS[kind].need`), each with `chain.gnomes.proof(kind, account)` read when the panel opens, and "Mint" (`mintEarned`, alone) when `can`. `courseOnChain` is whether `chain.holes()` has any slot (on mainnet, before the course is published, every row says "Earned gnomes open with the course."). After a mint lands, the earned share.
- [ ] **Step 4: Check by hand:** with the course published locally and the Garden Cup finished by the account (saved rounds), Wizard says "Proven on-chain" and mints; the picker then lists it. **Commit.**

### Task 62: the boards wear their players' gnomes

**Files:**
- Modify: `web/lib/gnomes/game.ts`, `web/test/gnomes.test.ts`, `web/components/Leaderboard.tsx`, `web/components/Modes.tsx`, the Friends list's component

**Interfaces:**
- Produces: `pillOf(e: WornRow | null | undefined): { name: string; color: number } | null` (a Legendary shown, equipped or the best owned: its name, its hat's colour).

- [ ] **Step 1: Write the failing test:**

```ts
import { pillOf } from "../lib/gnomes/game.ts";

test("a Legendary shown raises its name on the boards; nothing else does", () => {
  assert.deepEqual(pillOf({ version: 1, player: "g1x", id: "208", name: "The Admiral", tier: "legendary", traits: "010104050203020fff00032500ff00000000ff00ff00ff0903082446ff", how: "best" }), { name: "The Admiral", color: 0xd4af37 });
  assert.equal(pillOf({ version: 1, player: "g1x", id: "42", name: "Wick Bankside", tier: "common", traits: "0101010001020727ff00163000ff000000002a00ff00ff00ff00ff00ff", how: "equipped" }), null);
  assert.equal(pillOf(null), null);
});
```

- [ ] **Step 2: Run** → FAIL. **Implement.**
- [ ] **Step 3: The components.** One `chain.gnomes.wornMany` per page of rows (50 at a time, cached for the visit, Task 42); `Face` gets `skinOfWorn(row) ?? (mine ? resolveSkin(gnome) : rivalSkin(player, gnome))`; after the player's name, the pill (a small rounded label in its colour) when `pillOf` gives one, on every board, in Modes' rival stage and in Friends. A board with no gnomes realm reachable (the read fails) draws as today.
- [ ] **Step 4: Check by hand:** buy 208 as one account and send nothing else; its row shows the Admiral and the pill on the hole's board and the course ranking. **Commit.**

### Task 63: the share moments

**Files:**
- Modify: `web/components/Share.tsx` (nothing if `Share` already takes text, link and snapshot), `web/components/Gnomes.tsx`, `web/components/Golf.tsx` (the picker's equip share)

- [ ] **Step 1:** Each moment uses `shareText` (Task 47, tested) for its text and path (`SITE + path`), and `snapshot` from the preview on screen (Task 54) for its picture: bought (a Legendary included), earned, equipped. Community holes keep `holeLink` and the hole's picture, unchanged.
- [ ] **Step 2: Check by hand** on a phone (or Chrome's device mode with the Web Share API): the share sheet gets the PNG, the text and the link for each moment. **Commit.**

### Task 64: a gnome's link opens it

**Files:**
- Modify: `web/components/Golf.tsx` (`linkedGnome`)

- [ ] **Step 1: Write the failing test** for the parse, moved to `web/lib/gnomes/game.ts` as `linkedGnomeId(search: string, path: string): string | null` (`?gnome=t42`, `?gnome=wizard`, and the page path `/g/42/` or `/g/wizard/`):

```ts
import { linkedGnomeId } from "../lib/gnomes/game.ts";

test("a gnome's link: ?gnome= or its page's path", () => {
  assert.equal(linkedGnomeId("?gnome=t42", "/"), "t42");
  assert.equal(linkedGnomeId("", "/g/208/"), "t208");
  assert.equal(linkedGnomeId("", "/g/wizard/"), "wizard");
  assert.equal(linkedGnomeId("?gnome=t042", "/"), null);
  assert.equal(linkedGnomeId("", "/g/x/"), null);
});
```

- [ ] **Step 2: Run** → FAIL. **Implement**; `linkedGnome()` in `Golf.tsx` uses it when `gnomesOn()`: a token not owned is shown on the turntable ("on show"), not played; a kind not earned shows its `need` as today's locked gnomes do.
- [ ] **Step 3: Check by hand** `?gnomes&gnome=t720`. **Milestone check:** `scripts/check.sh` → green. **Commit.**

---

## Milestone 10: pages and pictures

### Task 65: a page per gnome

**Files:**
- Create: `web/app/g/[id]/page.tsx`
- Modify: `web/app/sitemap.ts`, `web/lib/gnomes/catalogue.ts` (`pageAbout`, `GNOME_PAGES`), `web/test/gnomes.test.ts`

**Interfaces:**
- Produces: `pageAbout(id: string): { title: string; description: string; image: string; heading: string; card: "summary" | "summary_large_image" } | null`; `GNOME_PAGES: readonly string[]` (every catalogue id, then the nine kinds).

- [ ] **Step 1: Write the failing test:**

```ts
import { pageAbout } from "../lib/gnomes/catalogue.ts";

test("each gnome's page: its title, words and picture", () => {
  assert.deepEqual(pageAbout("208"), {
    title: "The Admiral, Legendary gnome of Gnogolf",
    heading: "The Admiral, #208",
    description: "Commands the island's fleet: one boat and a rubber duck.",
    image: "/og/legendary/208.jpg",
    card: "summary_large_image",
  });
  assert.equal(pageAbout("1")?.image, "/gnomes/thumbs/1.webp");
  assert.equal(pageAbout("1")?.card, "summary");
  assert.equal(pageAbout("viking")?.title, "The Viking, earned gnome of Gnogolf");
  assert.equal(pageAbout("721"), null);
});
```

- [ ] **Step 2: Run** → FAIL. **Implement** `pageAbout` from `data/gnomes.json` (its `line` as the description; an earned kind's `unlock` text after its name). Then `page.tsx`, as `app/h/[slot]/page.tsx` is built: `dynamicParams = false`, `generateStaticParams = () => GNOME_PAGES.map((id) => ({ id }))`, `generateMetadata` from `pageAbout`; the page renders `Intro` with the heading and `Game` (which reads the gnome from the path, Task 64). `sitemap.ts` adds each `/g/<id>/` at priority 0.4. The thumbnails are copied into the export (`web/public/gnomes/thumbs/` from `media/gnomes/thumbs/` by the build's existing static copy, or a symlink: whichever `next build` follows).
- [ ] **Step 3: Build.** `(cd web && npm run build)`. Expected: `out/g/208/index.html` with the title above; 729 `out/g/*/index.html`. **Commit.**

### Task 66: the thumbnails and turntables **(built)**

**Files:** `media/gnomes/render.mjs`, `media/gnomes/webp.mjs`, `web/lib/scene/gnome-showcase.ts`, `media/gnomes/thumbs/*.webp`, `media/gnomes/turntables/*.webp`, `.gitignore` (`!media/gnomes/`)

- [ ] **Step 1: Check** `npm run gnomes:thumbs -- --tier legendary`: seven turntables and seven thumbnails, each thumbnail under 10 KB, made again byte for byte on a second run (the same throw of the dice).
- [ ] **Step 2: Check** that a change to `data/gnomes.json` that alters a look without new thumbnails is caught: `scripts/gnomes.ts --check` (or a new line of it) compares each gnome's `skin` hash with the one recorded when its thumbnail was drawn. **Commit.**

### Task 67: the seven Legendaries' cards

**Files:**
- Modify: `media/og/og.mjs` (a `--gnomes` mode), `web/lib/testhooks.ts` (`gnomecard`); Create: `web/public/og/legendary/104.jpg`, `208.jpg`, `311.jpg`, `414.jpg`, `516.jpg`, `618.jpg`, `720.jpg`

- [ ] **Step 1:** `og.mjs --gnomes` opens `${APP}/?gnomecard=<id>` for the seven Legendaries (a test hook drawing `makePreview` full-frame, the Legendary turning, entrance skipped, on the card's ground), screenshots the turntable at a fixed time, lays out the card as the hole cards are, and writes `web/public/og/legendary/<id>.jpg`. These seven are committed, as ADR-003's hole cards are.
- [ ] **Step 2: Run** (`npm run dev`, local chain up, then `npm run og -- --gnomes`). Expected: seven JPEGs of 1200×630, each showing its piece. **Milestone check:** `scripts/check.sh` → green; `(cd web && npm run build)` → the export includes the thumbnails and `/og/legendary/`. **Commit.**

---

## Milestone 11: docs, smoke, the rollout's checks

### Task 68: `docs/gnomes.md`

**Files:** Create: `docs/gnomes.md`

- [ ] **Step 1:** Write the API page in `docs/golf.md`'s shape: who can change what (owner; the series and their sales; prices before a sale opens, never lower on what is on sale; the closing date, earlier only; the treasury in two steps; the site URL; `Renounce`); ids; units (ugnot, bps, unix seconds); writes (each function's signature, what it checks in order, what it emits, what it refuses, with the refusal strings); events; reads (each JSON shape with an example); the earned proof (§7's table, what fails closed); storage and gas (the measured figures of Tasks 9, 27, 35); `Worn`'s rule (the equipped gnome while owned, else the best owned among a wallet's first 100 rows); what the realm never does (no mint for anyone by the owner, no coin held, no sale after the close, no golf or store call); a line that the Legendary auction was dropped and why. Link it from README.md's docs list.
- [ ] **Step 2: Check:** every exported function of the realm appears: `grep -o '^func [A-Z][A-Za-z]*' gno.land/r/gnogolf/gnomes/*.gno | grep -v _test | sed 's/.*func //' | sort -u` against the page's headings. **Commit.**

### Task 69: the ADR

**Files:** Create: `adr/adr-<next free number>-gnomes.md`

- [ ] **Step 1:** The ADR from the spec (drafted in the realm's worktree as `adr/adr-007-gnomes.md`; it takes the next free number when it lands), in ADR-003's sections (Status, Context, Decision, What is built, Consequences, Alternatives considered: the Legendary auction among them, dropped for simplicity and legal clarity), with an "As built" section naming the decisions this plan made beyond the spec: the catalogue published as series and read by bisection; traits format 1 and its append-only tables; the palette's order; an earned token's traits as its kind alone; ids laid out by world; a sale's prices fixed when it opens; the counts written once in `series.json`; the portrait drawn from the traits in Gno only, the pictures by the game itself; whatever Tasks 4, 5 and 6 found about the harness; the measured gas and deposits; and the user's answers to the spec's open points. Update the spec's Status to "Accepted" with a link to the ADR.
- [ ] **Step 2: Commit.**

### Task 70: the README, `Tip.tsx`, CLIENT.md

**Files:** Modify: `README.md`, `web/components/Tip.tsx`, `CLIENT.md`, `web/.env.example`

- [ ] **Step 1:** README: the Support paragraph's "On mainnet, while GNOT can't be sent, there is no Support chip." becomes true to the chain (GNOT moves on mainnet since `restricted_denoms` is empty; whether the chip shows there is its own change); a "Gnomes" paragraph in the game's description (cosmetic, chosen by id, earned ones free and bound, behind `NEXT_PUBLIC_GNOMES`); "Running it locally" gains the gnomes' flags, `npm run gnomes` after editing `data/gnomes/`, then `npm run gnomes:thumbs` for the gnomes it changed, and `npm run gnomes:rows` for the owner's `AddSeries`. `Tip.tsx`: the line "Tips open once GNOT can be sent on mainnet" corrected to the same fact (its condition is left for the owner's separate change). CLIENT.md: the traits rule (a value the client does not know draws the plain form), the flag, and that a gnomes call is never in a golf transaction. `.env.example`: `NEXT_PUBLIC_GNOMES`, `NEXT_PUBLIC_GNOMES_REALM`, the trader's three.
- [ ] **Step 2: Check:** `grep -n "can't be sent\|once GNOT can be sent" README.md web/components/Tip.tsx` → nothing. `scripts/check.sh` → green. **Commit.**

### Task 71: the smoke test buys, shows and equips

**Files:** Modify: `scripts/smoke.ts`

- [ ] **Step 1:** Add a step that runs when `GNOKEY_NAME` is set (a local key with funds, `test1` under gnodev) and says "skipped (GNOKEY_NAME unset)" otherwise: as the owner, publish the genesis (`npm run gnomes:rows`), set a closing date a day ahead and open the genesis's sale with no player window, `Buy` one id with its exact `-send` through `gnokey maketx call … -insecure-password-stdin` (password from `GNOKEY_PASSWORD`, default empty), read `Worn` (`"how":"best"`), `Equip` it, then read both back through the client's own `chain.gnomes.gnome` and `chain.gnomes.worn` (`"how":"equipped"`) (their checks throw on any unexpected shape), and in the headless Chrome the picker on `?gnomes&screen=pick` lists it.
- [ ] **Step 2: Run** `GNOKEY_NAME=test1 npm run smoke` against a local gnodev with the course published. Expected: every step passes. **Commit.**

### Task 72: a deploy rehearsed on a local chain

**Files:** none changed (a rehearsal; what it measures goes into the ADR and the rollout notes).

- [ ] **Step 1:** `GNO=$t/gno scripts/stage.sh nym-stagecheck000 /tmp/gnomes-stage` and `MAINNET=1 …`: both lint; note the gnomes size line.
- [ ] **Step 2:** On a fresh `gnodev local -empty-blocks …` with no repo packages loaded (`gnodev local -paths ""` or an empty workspace), `addpkg` store, golf/v2 and gnomes from the staged tree under a local name with `-max-deposit 40000000ugnot`; read the deposit charged for gnomes from the transaction's result. Expected: under 40 GNOT. Then `Collection()` shows the sale closed, no closing date, no series, the deployer as owner and the staged treasury apart from it; `AddSeries("genesis", …)` costs about 4.6 GNOT (Task 16). `scripts/gnomesproof.ts` against it passes once the course is published.
- [ ] **Step 3:** Record the deploy deposit in the ADR's "As built". **Commit.**

### Task 73: the last full check

- [ ] **Step 1:** `scripts/check.sh --smoke` with a local chain and dev server up, and `GNOKEY_NAME=test1`. Expected: `all checks passed`.
- [ ] **Step 2:** `git diff --stat main -- gno.land/r/gnogolf/golf gno.land/r/gnogolf/store gno.land/p web/lib/sim scripts/wasm` → nothing: golf, store, the physics, the course packages and the wasm untouched.
- [ ] **Step 3:** `(cd web && npm run build)` with `NEXT_PUBLIC_GNOMES` unset, then with `=1`: both export; unset, `grep -r "Show it to everyone" out/ | head -1` may find the bundled string but no page renders the shop (open `out/index.html` locally and check the menu has no "Gnomes").

---

## Rollout (the owner's steps, §17; not tasks of this plan)

Nothing in this plan deploys. The owner, after Task 73:

1. **Onyx**, closed, staged with `GNOMES_TREASURY` (an address apart from the deployer's): `addpkg` of the staged gnomes with `-max-deposit 40000000ugnot`; `AddSeries("genesis", rows)` from `npm run gnomes:rows -- --series genesis`; `SetCloseAt`, a test sale; buy one of each tier, a Legendary included; move the treasury in two steps and back; mint an earned gnome from a played cup; compare each deposit and the King proof's gas with the goldens; run `scripts/gnomesproof.ts` against onyx; put any differing figure in `GNOME_GAS`/`GNOME_BYTES` and the ADR.
2. **The client on onyx** with `NEXT_PUBLIC_GNOMES=1` and the trader's settings: the dress rehearsal, two weeks before mainnet; the shop's country rules checked on the deploy preview (Task 60).
3. **Mainnet**, only once store and golf/v2 are live there under the same namespace and the course is published (§17.4): the same staged package with `MAINNET=1`, deployed closed, the genesis published. A lawyer has read §15 and the lawyer pack first. The two weeks before: one Legendary shown a day, the gallery live with nothing on sale. At launch: `SetCloseAt(<the genesis's closing date>)` (it can then only come earlier), `SetSiteURL` if the site differs from the staged one, then the genesis's sale, ids 1–720 (`OpenSale("genesis", <start>, 48)`, `SetMintOpen(true)`), its seven Legendaries on sale with the rest at 1,296 GNOT; at the closing date what is unsold is never minted.

---

## Verification checklist

Run each before calling the work done; each line names its evidence.

- [ ] `scripts/check.sh --smoke` ends with `all checks passed` (Gno tests and goldens, fingerprints, `gnomes --check`, `gnomes:rows --check`, staging both ways, wasm unchanged, types, lint, selfcheck, unit tests over the coverage floor, smoke).
- [ ] golf/v2, store, `p/gnogolf/*`, `web/lib/sim/golf.wasm` and `scripts/wasm/` have no diff against `main`; `grep -rn "gnomes" gno.land/r/gnogolf/golf gno.land/r/gnogolf/store` finds nothing.
- [ ] No transaction mixes realms: `adena.test.ts`'s "no golf save ever carries a gnomes message" passes, and each gnomes call test asserts one message.
- [ ] The counts are written once: `series.json`'s `supply` is 504/144/65/7, the realm's `genesisSupply` is held to it, `data/gnomes.json` has 720 gnomes in the seven worlds' ranges.
- [ ] Paid calls: tests cover no coin, two coins, another denom, a unit under and over, the exact price, a code realm, a run realm, and the treasury's balance after a buy, the realm's 0 (`TestBuyRefusesAnyOtherPayment`, `TestBuyMustBeADirectUserCall`, `TestBuyTakesUpToFiveAtTheirSum`).
- [ ] Buy refusals: paused, after the close, an id in no sale or a sale not started, a sold id, an id twice, six ids, an earned id, a second Legendary for a wallet, the player window (no record; its cap), the lifetime cap in a batch and across, a price changed before the sale opened with the coins kept, an opened sale's prices unchanged by `SetPrice`.
- [ ] No auction: `auction.gno` and its tests are gone, and `grep -rn "Bid\|Settle\|escrow" gno.land/r/gnogolf/gnomes web/lib web/components` finds nothing of it; a Legendary is bought at 1,296 GNOT by `Buy`, one a wallet; the prices at deploy are 36/72/336/1,296 GNOT.
- [ ] Owner settings (Milestone 4's tests): the closing date optional (no end until set), earlier only once set, never in the past, nothing sold after it; the treasury apart from the owner at deploy and moved in two steps; the site URL's bounds; everything frozen after `Renounce` but the opened sales until the close; `Sweep` sends the whole balance.
- [ ] Wearing: `Worn` gives the equipped gnome while owned, else the best owned (tier, then lowest id), `"how"` saying which; `WornMany` with 50 players, junk and repeats; the boards and ghosts show a buyer's gnome without any `Equip`.
- [ ] Earned: each kind proven and refused one hole short and one stroke over, an archived version, a `copies` row, a bad entry format, bad strokes, another writer, a second mint, transfer and approval refused, burn then mint again (Milestones 1 and 5); earned ids from 1000001.
- [ ] `z_proof_king_filetest.gno`'s gas minus `z_proof_seed_filetest.gno`'s is written in its comment and is under the gas the client asks (`GNOME_GAS.earned`).
- [ ] `// Storage:` goldens exist for the genesis published, a first buy, a second buy, an earned mint and a first equip, and `GNOME_BYTES` equals them.
- [ ] The catalogue: `npm run gnomes -- --check` prints no `FAIL`: unique looks and names, palette, tier rules, no copy of `GNOMES`, no earned piece or signature on a sale gnome, no Legendary named King or wearing a crown.
- [ ] The codec: unknown codes, colours past the palette, short strings drawn plain; another format the Classic (`gnomes.test.ts`). The nine earned kinds draw exactly as `GNOMES`; the fourteen `GNOMES` are unchanged (`gnome.test.ts`).
- [ ] The budget test passes for every gnome of the catalogue (triangles, draws, width, height, reach unmoved), at the limits the user settled.
- [ ] By hand: a trail under the aim line and gone after the stop; holing effect after the drop, no flash; reduced motion gives no trail and a still frame; no entrance on a retry, a ghost or a clip; a ghost wears the gnome its rival shows (`Worn`); a Legendary's pill on the boards.
- [ ] The shop shows the consent box (required), the seller's identity, address and contact (no sale without them), "for adults", the price and deposit, the sale and its player window, the closing date; it offers no free gift to buyers; it is refused for CN, CU, IR, KP, SY, RU and BY by `netlify.toml` and open elsewhere, the EU and the UK included, while the game is open everywhere; the receipt prints with every line of `receiptLines`; no copy speaks of floors, returns, flipping or "early is cheaper"; the counter counts the sale up.
- [ ] With `NEXT_PUBLIC_GNOMES` unset, the built site plays as today (no Gnomes menu, the picker unchanged, no gnomes read in the network panel).
- [ ] `out/g/<id>/index.html` for the 729, each with its title and image; the 720 thumbnails and the seven turntables committed under `media/gnomes/`; seven `web/public/og/legendary/*.jpg` committed.
- [ ] `docs/gnomes.md`, `docs/gnomes/design.md`, the ADR with "As built", the README and `Tip.tsx` lines corrected, CLIENT.md's rules added.
- [ ] Task 72's local deploy: the deposit under 40 GNOT, closed, the deployer owner.
