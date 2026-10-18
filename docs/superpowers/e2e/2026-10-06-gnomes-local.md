# Gnomes realm, end to end on a local chain — 2026-10-06

The gnomes realm (`gno.land/r/gnogolf/gnomes`), deployed with what it reads
(store, golf/v2) on a local gnodev of the onyx toolchain, played through
from the genesis to the close: **166 of 166 steps pass**. Run twice on two
chains side by side, once with the owner's calls and the reads through the
gno MCP server and once with gnokey alone: the same steps, the same results,
the gas to within a few dozen.

*Later (2026-10-18): waves removed, one sale per series (ADR-013):
`AddWave` became `OpenSale(series, start, playerHours)` and `CancelSale`.
The steps below record the realm as it was run that day, waves and all;
`scripts/e2e-gnomes.sh` now plays the one sale's guards instead.*

This is the realm without the auction (`0c542d9`): a Legendary is sold like
any gnome, by `Buy` at its fixed price (its wave's, that day), to its first
buyer, one a wallet. The prices are golf's numbers (ADR-007): a Common 36
GNOT, a Rare 72, an Epic 336, a Legendary 1,296. The earlier runs of this
report, with the auction and the old prices, are in this file's history
(`8cef335`, `1a96103`).

## The setup

- **Code**: branch `gnome-e2e` at `a5da730`: `worktree-nft-gnomes` at
  `0c542d9` (the realm with the treasury in two steps, SetSiteURL, the
  on-chain portrait, Worn, the total review's fixes, and no auction) merged
  with `worktree-gnome-designs` at `7aabe6d` (the genesis rows,
  `data/gnomes/rows/genesis.txt`: 720 rows, 60,096 bytes). The one
  conflict, earlier, was `media/tsconfig.json`: each branch added its own
  folder to `include`, and both were kept.
- **Chain**: `gnodev local` built from the tag `chain/onyx`
  (`../gno-onyx`, as the README's "Running it locally" says), chain id
  `dev`, on RPC `127.0.0.1:26757` and gnoweb `:8898` (26657 was another
  session's gnodev, left alone); the gnokey replay on `:26857`/`:8998`.
  Staged by `MAINNET=1 scripts/stage.sh nym-gnometest000` and deployed
  under that test name.
- **Keys**: throwaway, in a keybase of the run's own: `test1` (gnodev's
  public deploy key: the collection's owner, and its first treasury), `p0`
  (a wallet with no record), `p1` (a player), `b1` and `b2` (buyers),
  `treas` (the treasury it moves to), each given 5,000 GNOT at genesis.
  Nothing touched onyx, mainnet or a real key.
- **The MCP server**: `gnoverse/gno-mcp` at `40fcc5a`, built from source to
  `~/.local/src/gno-mcp/bin/gnomcp` (outside the repo), registered for this
  project only (`claude mcp add gnomcp --scope local -- … -config
  <profiles.toml>`, its `local` profile pointed at the node above). A
  Claude Code session loads MCP servers when it starts, so the script
  speaks gnomcp's stdio protocol itself: the same JSON-RPC tool calls a
  client makes.
  - Through gnomcp: every call of the owner (`gno_call`, which signs as
    `test1` on a local profile), the reads (`gno_eval`, `gno_account`,
    `gno_render`), the `p/` deploys (`gno_addpkg`) and the gas runs
    (`gno_run`).
  - Through gnokey: the buyers' calls (gnomcp signs as test1 alone on a
    local chain), the realms' deploys, the genesis `AddSeries` and the large
    reads (gnomcp's limits, finding 3). Each row of the table says which.
- **Replay**: `scripts/e2e-gnomes.sh` does all of it from nothing (keys,
  gnodev, stage, deploy, scenario) in about two minutes, and writes the
  table below; `MCP=1` sends the owner's calls and the reads through
  gnomcp. Its one wait is the close's minute of chain time, plus up to six
  weather periods if the ace on garden/3 needs one (finding 5).

## Findings

No bug in the realm's rules: every one the scenario asks of it held, the
money to the ugnot.

1. **TokenURI's gas on the heaviest portrait (now documented).** The
   portrait commit gave 0.076e9 at the heaviest, the test VM's figure. On
   a chain, #199 *Figurehead Fen* (an Epic, 6,108 bytes of SVG, the largest
   of the 720) takes **83,082,903 gas** in a transaction of its own: a
   MsgRun of `TokenURI("199")` less the same MsgRun reading
   `OwnerOf("199")`. The replay gave 83,082,883. ADR-007 now gives both
   figures ("76.0M; **83.08M on a chain**", `390a544`), and the script
   holds the chain's: every tier passes under 83.1M.

   | Gnome | Gas |
   |---|---|
   | Common #5 | 47,984,944 |
   | Rare #73 | 54,901,207 |
   | Epic #94 | 58,701,382 |
   | Legendary #104 | 65,527,527 |
   | Earned | 36,363,996 |
   | Heaviest #199 | 83,082,903 |

   Wallets read TokenURI by query (`vm/qeval`), which answered every one.
2. **gnodev (tooling): a lazily loaded import kills the transaction in
   flight.** The first deploy importing an examples package (`store`, which
   imports `p/nt/bptree/v0`) makes gnodev reload the node (`Node ┃ I reload
   done pkgs=1 state applied=3`), and that deploy is refused `unauthorized
   error`; sent again, it goes through. Repro: `gnodev local -no-watch` in
   an empty directory, deploy `p/…/physics`, then `r/…/store` at once. The
   script preloads the imports (`-paths gno.land/p/nt/bptree/v0,…`).
3. **gnomcp's limits (tooling).**
   - `gno_addpkg` offers a storage deposit of 10 GNOT at most, with no
     argument to raise it, so store, golf/v2 and gnomes can't be deployed
     through it (`not enough deposit …`).
   - `gno_call` simulates under a gas ceiling below what the genesis
     `AddSeries` needs (`out of gas`), with no gas argument either.
   - `gno_eval` won't return an answer of about 8 KB (`8193 bytes; preview
     omitted`), so the larger portraits' TokenURI can't be read through it.

   The script sends each of these through gnokey instead, and says so in
   the row. None of this concerns the realm.
4. **The genesis `AddSeries` takes 1,073,588,240 gas** (61 KB of rows,
   6.1 GNOT of deposit), in one transaction, as a series must be. It fits
   gnodev's 10 billion a block. Worth one `-simulate only` against onyx's
   block and transaction gas limits before the real one.
5. **The local Garden Cup is one hole, and the weather moves the ace.**
   Only `garden/3` is published on these chains, so "Finish the Garden Cup"
   is proven by holing that hole, and "at par or under" by its ace on a
   par 2. That's by design (a cup is its slots' current versions); noted so
   the rows read right. The ace is found with the chain's own
   `SimulateRound`; the wind changes every five minutes of chain time and
   moves it (`0,9.25` in calm weather, `1,9.75` in one run's), and a period
   with none is waited out.
6. **A stray coin can only come by a bank send.** The onyx chain refuses a
   call that carries coins its function never reads (`coins were sent but
   the called function never read them`). So the realm can only receive a
   coin it didn't ask for from a plain bank send to its address, which
   `Sweep` then forwards to the treasury, as the scenario shows. Noted for
   `Sweep`'s doc, which speaks of "coins someone sent with a call that keeps
   none": on this chain no call can do that.

## What it shows

Beyond the unit tests:

- **Payments**: forwarded in the same call. The treasury's balance rises by
  exactly the price, and the realm keeps nothing; after each sale its
  balance reads 0.
- **A Legendary at its fixed price**:
  - its price reads 1,296 GNOT;
  - an underpaid buy is refused;
  - p1, a player, buys #104 in the player window, and the treasury gains
    exactly 1,296 GNOT;
  - a second buyer is refused (`this gnome is already sold`);
  - #208, put on sale alone, is refused to p1 (`the cap is 1 legendary a
    wallet`), bought by b1, then refused to b2.
- **The switch**: paused, a buy is refused; open again, sales resume.
- **The record**: a real golf/v2 round's store record opens the player
  window and proves an earned gnome.
- **The treasury**: moved in two steps, it takes the next sale and the
  royalty, and a stray coin swept.
- **The close**: refuses every buy and wave (now: sale) of the genesis's unsold gnomes,
  Legendaries included (#311 closed), and leaves a sold one sold. The final
  supply is 21: 14 Commons, 3 Rares, 2 Epics, 2 Legendaries.
- **The portraits**: every one of the 720 catalogue gnomes' pages carries
  its portrait (the drawing TokenURI returns). Each is a well-formed SVG
  titled with its gnome's name, and no two are alike. Bought, the
  heaviest's TokenURI is byte for byte its page's image, and an earned
  gnome's portrait draws too.

## Steps

The table of the gnomcp-driven run, as the script wrote it. Gas is the gas
the transaction used (gnokey's `GAS USED`, gnomcp's `GasUsed`); a read
has none. A call gnomcp refuses is stopped at its simulation, so it has no
gas either. In the `portrait: TokenURI gas` rows the gas is the result
itself, the difference of two MsgRuns. `[mcp]` is a gnomcp tool call,
`[gnokey]` a gnokey transaction. The reads went through gnomcp's
`gno_eval` and `gno_account` (gnokey's qeval for an answer over gnomcp's
size, finding 3); the 720 pages through `vm/qrender`.

| # | step | call | expected | got | result | gas |
|---|------|------|----------|-----|--------|-----|
| 1 | deploy | `addpkg gno.land/p/nym-gnometest000/gnogolf/physics [mcp]` | deployed | deployed | PASS | 64945053 |
| 2 | deploy | `addpkg gno.land/p/nym-gnometest000/gnogolf/course [mcp]` | deployed | deployed | PASS | 54957895 |
| 3 | deploy | `addpkg gno.land/p/nym-gnometest000/gnogolf/weblink [mcp]` | deployed | deployed | PASS | 3852976 |
| 4 | deploy | `addpkg gno.land/r/nym-gnometest000/gnogolf/store [gnokey]` | deployed | deployed | PASS | 30706121 |
| 5 | deploy | `addpkg gno.land/r/nym-gnometest000/gnogolf/golf/v2 [gnokey]` | deployed | deployed | PASS | 235397534 |
| 6 | deploy | `addpkg gno.land/r/nym-gnometest000/gnogolf/gnomes [gnokey]` | deployed | deployed | PASS | 239264231 |
| 7 | deploy | `gnomes.Owner()` | g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5 | g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5 | PASS | - |
| 8 | deploy | `gnomes.Treasury()` | g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5 | g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5 | PASS | - |
| 9 | deploy | `store.Writer()` | gno.land/r/nym-gnometest000/gnogolf/golf/v2 | gno.land/r/nym-gnometest000/gnogolf/golf/v2 | PASS | - |
| 10 | catalogue: owner only | `p0: gnomes.AddSeries(genesis, <60096 bytes>) [gnokey]` | refused: only the owner | refused: gnomes: only the owner can do this | PASS | 4824399 |
| 11 | catalogue: genesis first | `test1: gnomes.AddSeries(drop2, 721\|common\|X\|01) [mcp]` | refused: the genesis first | refused: gnomes: the genesis first, and once | PASS | - |
| 12 | catalogue: publish the genesis (720 rows) | `test1: gnomes.AddSeries(genesis, <60096 bytes>) [gnokey (over gnomcp's gas ceiling)]` | published | went through | PASS | 1073588240 |
| 13 | catalogue: Collection series | `Collection().series[0]` | genesis 1 720 0 | genesis 1 720 0 | PASS | - |
| 14 | catalogue: once | `test1: gnomes.AddSeries(genesis, <60096 bytes>) [mcp]` | refused: already published | refused: gnomes: series genesis is already published | PASS | - |
| 15 | catalogue: Gnome(104) | `Gnome("104").tier,name` | legendary The Miller | legendary The Miller | PASS | - |
| 16 | sale: closed at deploy | `p0: gnomes.Buy(1) send 36000000ugnot [gnokey]` | refused: the sale is closed | refused: gnomes: the sale is closed | PASS | 4631096 |
| 17 | sale: open | `test1: gnomes.SetMintOpen(true) [mcp]` | open | went through | PASS | 6076095 |
| 18 | sale: MintOpen() | `MintOpen()` | true | true | PASS | - |
| 19 | waves: owner only | `p0: gnomes.AddWave(1, 104, 0, 1) [gnokey]` | refused: only the owner | refused: gnomes: only the owner can do this | PASS | 4228038 |
| 20 | waves: 0 to 168 hours | `test1: gnomes.AddWave(1, 104, 1791298952, 169) [mcp]` | refused: a player window is 0 to 168 hours | refused: gnomes: a player window is 0 to 168 hours | PASS | - |
| 21 | waves: Garden wave 1-104, 1 h player window | `test1: gnomes.AddWave(1, 104, 1791298952, 1) [mcp]` | added | went through | PASS | 8839353 |
| 22 | waves: no overlap | `test1: gnomes.AddWave(100, 110, 1791298952, 0) [mcp]` | refused: are in a wave already | refused: gnomes: ids 1 to 104 are in a wave already | PASS | - |
| 23 | player window: no record, refused | `p0: gnomes.Buy(1) send 36000000ugnot [gnokey]` | refused: players only until | refused: gnomes: players only until 1791302552: finish a hole first | PASS | 16924979 |
| 24 | record: publish garden/3 | `test1: v2.Publish(garden/3, <4110 bytes>, e2e) [mcp]` | published | went through | PASS | 116067746 |
| 25 | record: a holing shot this weather | `SimulateRound(garden/3/v1, …)` | found (0,9.25) | found (0,9.25) | PASS | - |
| 26 | record: p1 holes garden/3 | `p1: v2.PlayRound(garden/3/v1, 0,9.25) [gnokey]` | holed | went through | PASS | 56767436 |
| 27 | record: store totals | `store.Has("totals","assisted <p1>")` | true | true | PASS | - |
| 28 | buy: underpaid | `p1: gnomes.Buy(5) send 35999999ugnot [gnokey]` | refused: wrong payment, send exactly 36000000ugnot | refused: gnomes: wrong payment, send exactly 36000000ugnot | PASS | 17269238 |
| 29 | buy: overpaid | `p1: gnomes.Buy(5) send 36000001ugnot [gnokey]` | refused: wrong payment, send exactly 36000000ugnot | refused: gnomes: wrong payment, send exactly 36000000ugnot | PASS | 17269238 |
| 30 | buy: nothing sent | `p1: gnomes.Buy(5) [gnokey]` | refused: wrong payment | refused: gnomes: wrong payment, send exactly 36000000ugnot | PASS | 16649822 |
| 31 | buy: not an id | `p1: gnomes.Buy(05) send 36000000ugnot [gnokey]` | refused: not a gnome id | refused: gnomes: not a gnome id: 05 | PASS | 4985523 |
| 32 | buy: at most 5 ids | `p1: gnomes.Buy(1,2,3,4,5,6) send 180000000ugnot [gnokey]` | refused: name 1 to 5 gnomes | refused: gnomes: name 1 to 5 gnomes, as ids separated by commas | PASS | 5065469 |
| 33 | buy: an id twice | `p1: gnomes.Buy(5,5) send 60000000ugnot [gnokey]` | refused: is named twice | refused: gnomes: gnome 5 is named twice | PASS | 5061654 |
| 34 | buy: p1 buys Common 5 at its price | `p1: gnomes.Buy(5) send 36000000ugnot [gnokey]` | sold | went through | PASS | 28011213 |
| 35 | buy: treasury up by the price | `balance(treasury) after - before` | 36000000 | 36000000 | PASS | - |
| 36 | buy: the realm keeps nothing | `balance(realm)` | 0 | 0 | PASS | - |
| 37 | buy: OwnerOf(5) | `OwnerOf("5")` | g16vgyueceu2vnfegd778dwvs9mc0yvyynlug3wh | g16vgyueceu2vnfegd778dwvs9mc0yvyynlug3wh | PASS | - |
| 38 | buy: sold once | `p1: gnomes.Buy(5) send 36000000ugnot [gnokey]` | refused: already sold | refused: gnomes: this gnome is already sold | PASS | 13322551 |
| 39 | buy: two in one call | `p1: gnomes.Buy(6,7) send 72000000ugnot [gnokey]` | sold | went through | PASS | 36925582 |
| 40 | caps: player window, 3 Commons | `p1: gnomes.Buy(8) send 36000000ugnot [gnokey]` | refused: the player window takes 3 common a wallet | refused: gnomes: the player window takes 3 common a wallet | PASS | 16947906 |
| 41 | caps: 2 Rares in the window | `p1: gnomes.Buy(73,74) send 144000000ugnot [gnokey]` | sold | went through | PASS | 37691558 |
| 42 | caps: no third Rare in the window | `p1: gnomes.Buy(75) send 72000000ugnot [gnokey]` | refused: the player window takes 2 rare a wallet | refused: gnomes: the player window takes 2 rare a wallet | PASS | 18114159 |
| 43 | caps: 1 Epic in the window | `p1: gnomes.Buy(94) send 336000000ugnot [gnokey]` | sold | went through | PASS | 32026895 |
| 44 | caps: no second Epic in the window | `p1: gnomes.Buy(95) send 336000000ugnot [gnokey]` | refused: the player window takes 1 epic a wallet | refused: gnomes: the player window takes 1 epic a wallet | PASS | 16427985 |
| 45 | legendary: its price | `Gnome("104").price` | 1296000000 | 1296000000 | PASS | - |
| 46 | legendary: underpaid | `p1: gnomes.Buy(104) send 1295999999ugnot [gnokey]` | refused: wrong payment, send exactly 1296000000ugnot | refused: gnomes: wrong payment, send exactly 1296000000ugnot | PASS | 18122852 |
| 47 | legendary: p1 buys #104 at its price | `p1: gnomes.Buy(104) send 1296000000ugnot [gnokey]` | sold | went through | PASS | 30968221 |
| 48 | legendary: treasury up by the price | `balance(treasury) after - before` | 1296000000 | 1296000000 | PASS | - |
| 49 | legendary: the realm keeps nothing | `balance(realm)` | 0 | 0 | PASS | - |
| 50 | legendary: OwnerOf(104) | `OwnerOf("104")` | g16vgyueceu2vnfegd778dwvs9mc0yvyynlug3wh | g16vgyueceu2vnfegd778dwvs9mc0yvyynlug3wh | PASS | - |
| 51 | legendary: a second buyer refused | `b1: gnomes.Buy(104) send 1296000000ugnot [gnokey]` | refused: this gnome is already sold | refused: gnomes: this gnome is already sold | PASS | 13986192 |
| 52 | legendary: #208 on sale alone, no window | `test1: gnomes.AddWave(208, 208, 1791298961, 0) [mcp]` | added | went through | PASS | 9177363 |
| 53 | legendary: one a wallet | `p1: gnomes.Buy(208) send 1296000000ugnot [gnokey]` | refused: the cap is 1 legendary a wallet | refused: gnomes: the cap is 1 legendary a wallet | PASS | 16846161 |
| 54 | legendary: b1 buys #208 | `b1: gnomes.Buy(208) send 1296000000ugnot [gnokey]` | sold | went through | PASS | 29534455 |
| 55 | legendary: #208 sold once | `b2: gnomes.Buy(208) send 1296000000ugnot [gnokey]` | refused: this gnome is already sold | refused: gnomes: this gnome is already sold | PASS | 15103779 |
| 56 | legendary: SoldOfTier(3) | `SoldOfTier(3)` | 2 | 2 | PASS | - |
| 57 | pause: SetMintOpen(false) | `test1: gnomes.SetMintOpen(false) [mcp]` | paused | went through | PASS | 6076152 |
| 58 | pause: no buy | `p0: gnomes.Buy(1) send 36000000ugnot [gnokey]` | refused: the sale is closed | refused: gnomes: the sale is closed | PASS | 4325488 |
| 59 | pause: SetMintOpen(true) | `test1: gnomes.SetMintOpen(true) [mcp]` | open | went through | PASS | 6076126 |
| 60 | price: owner only | `p0: gnomes.SetPrice(common, 40000000) [gnokey]` | refused: only the owner | refused: gnomes: only the owner can do this | PASS | 4226310 |
| 61 | price: bounds | `test1: gnomes.SetPrice(common, 999999) [mcp]` | refused: a price is between | refused: gnomes: a price is between 1000000 and 10000000000 ugnot | PASS | - |
| 62 | price: Common 40 GNOT for the next waves | `test1: gnomes.SetPrice(common, 40000000) [mcp]` | set | went through | PASS | 6713315 |
| 63 | price: a wave keeps its prices | `Gnome("8").price` | 36000000 | 36000000 | PASS | - |
| 64 | waves: 105-207, no window | `test1: gnomes.AddWave(105, 207, 1791298964, 0) [mcp]` | added | went through | PASS | 9467700 |
| 65 | waves: 209-310, tomorrow | `test1: gnomes.AddWave(209, 310, 1791385364, 0) [mcp]` | added | went through | PASS | 9756041 |
| 66 | waves: not yet | `p0: gnomes.Buy(209) send 40000000ugnot [gnokey]` | refused: is not on sale yet | refused: gnomes: gnome 209 is not on sale yet | PASS | 14353777 |
| 67 | waves: in no wave | `p0: gnomes.Buy(400) send 36000000ugnot [gnokey]` | refused: is not on sale | refused: gnomes: gnome 400 is not on sale | PASS | 14590283 |
| 68 | price: the new wave at the new price | `Gnome("105").price` | 40000000 | 40000000 | PASS | - |
| 69 | caps: p0 (no record) buys 5 Commons, no window | `p0: gnomes.Buy(105,106,107,108,109) send 200000000ugnot [gnokey]` | sold | went through | PASS | 58346179 |
| 70 | caps: 5 more (10 Commons) | `p0: gnomes.Buy(110,111,112,113,114) send 200000000ugnot [gnokey]` | sold | went through | PASS | 57569037 |
| 71 | caps: lifetime, 10 Commons | `p0: gnomes.Buy(115) send 40000000ugnot [gnokey]` | refused: the cap is 10 common a wallet | refused: gnomes: the cap is 10 common a wallet | PASS | 15865742 |
| 72 | buy: SoldOfTier(0) | `SoldOfTier(0)` | 13 | 13 | PASS | - |
| 73 | equip: p1 wears 5 | `p1: gnomes.Equip(5) [gnokey]` | worn | went through | PASS | 10552235 |
| 74 | equip: Equipped(p1) | `Equipped(p1).id,tier` | 5 common | 5 common | PASS | - |
| 75 | equip: not someone else's | `p0: gnomes.Equip(5) [gnokey]` | refused: not your gnome | refused: gnomes: not your gnome | PASS | 7586366 |
| 76 | equip: not unsold | `p0: gnomes.Equip(9) [gnokey]` | refused: not your gnome | refused: gnomes: not your gnome | PASS | 7850418 |
| 77 | equip: p0 wears 105 | `p0: gnomes.Equip(105) [gnokey]` | worn | went through | PASS | 10558242 |
| 78 | equip: EquippedMany, repeats and junk skipped | `EquippedMany("p1,p0,p1,junk,b1")` | 5,105 | 5,105 | PASS | - |
| 79 | equip: p1 wears 6 | `p1: gnomes.Equip(6) [gnokey]` | worn | went through | PASS | 10559562 |
| 80 | equip: p1 sends 6 to b1 | `p1: gnomes.TransferFrom(g16vgyueceu2vnfegd778dwvs9mc0yvyynlug3wh, g1krx5u3fsmg46qkdpy8mf3r925rwva40su5gfvp, 6) [gnokey]` | moved | went through | PASS | 31049183 |
| 81 | equip: a gnome sent on is worn no more | `Equipped(p1)` |  |  | PASS | - |
| 82 | equip: off | `p0: gnomes.Equip() [gnokey]` | off | went through | PASS | 6984493 |
| 83 | equip: Equipped(p0) after off | `Equipped(p0)` |  |  | PASS | - |
| 84 | locker: GnomesOf(p0, 0) | `GnomesOf(p0,0) total,next,rows` | 10 -1 10 | 10 -1 10 | PASS | - |
| 85 | locker: GnomesOf(p0, 4) | `GnomesOf(p0,4) first row, rows` | 109 6 | 109 6 | PASS | - |
| 86 | locker: GnomesOf(p1, 0) in id order | `GnomesOf(p1,0) ids` | 5,7,73,74,94,104 | 5,7,73,74,94,104 | PASS | - |
| 87 | locker: past the end | `GnomesOf(p1,99) rows,next` | 0 -1 | 0 -1 | PASS | - |
| 88 | locker: TokenOfOwnerByIndex(p0, 9) | `TokenOfOwnerByIndex(p0,9)` | 114 | 114 | PASS | - |
| 89 | treasury: owner only | `p0: gnomes.SetTreasury(g10pf7ssgrrnw6trff0yx0x0jrzea3yk60xdvnc3) [gnokey]` | refused: only the owner | refused: gnomes: only the owner can do this | PASS | 4151398 |
| 90 | treasury: not the realm | `test1: gnomes.SetTreasury(g17xf8xm2lgj5qf0zt7g445fn6lsk7vfajwladzr) [mcp]` | refused: not the realm's own address | refused: gnomes: the treasury is not the realm's own address | PASS | - |
| 91 | treasury: offered to treas | `test1: gnomes.SetTreasury(g10pf7ssgrrnw6trff0yx0x0jrzea3yk60xdvnc3) [mcp]` | offered | went through | PASS | 6279670 |
| 92 | treasury: pending | `PendingTreasury(), Treasury()` | g10pf7ssgrrnw6trff0yx0x0jrzea3yk60xdvnc3 g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5 | g10pf7ssgrrnw6trff0yx0x0jrzea3yk60xdvnc3 g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5 | PASS | - |
| 93 | treasury: a buy while only offered | `p0: gnomes.Buy(177) send 72000000ugnot [gnokey]` | sold | went through | PASS | 32133183 |
| 94 | treasury: still paid to the old one | `balance(test1) after - before` | 72000000 | 72000000 | PASS | - |
| 95 | treasury: only the offered takes it | `p0: gnomes.AcceptTreasury() [gnokey]` | refused: no treasury is offered to you | refused: gnomes: no treasury is offered to you | PASS | 4008491 |
| 96 | treasury: treas accepts | `treas: gnomes.AcceptTreasury() [gnokey]` | taken | went through | PASS | 10222795 |
| 97 | treasury: moved | `Treasury(), PendingTreasury()` | g10pf7ssgrrnw6trff0yx0x0jrzea3yk60xdvnc3  | g10pf7ssgrrnw6trff0yx0x0jrzea3yk60xdvnc3  | PASS | - |
| 98 | treasury: royalty follows | `RoyaltyInfo("5", 1000000)` | g10pf7ssgrrnw6trff0yx0x0jrzea3yk60xdvnc3 50000 | g10pf7ssgrrnw6trff0yx0x0jrzea3yk60xdvnc3 50000 | PASS | - |
| 99 | treasury: a buy pays the new treasury | `b2: gnomes.Buy(115) send 40000000ugnot [gnokey]` | sold | went through | PASS | 32908511 |
| 100 | treasury: up by the price | `balance(treas) after - before` | 40000000 | 40000000 | PASS | - |
| 101 | treasury: the owner unchanged | `Owner()` | g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5 | g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5 | PASS | - |
| 102 | sweep: a stray coin | `p0: gnokey maketx send 1ugnot to the realm` | sent | sent | PASS | - |
| 103 | sweep: the realm holds it | `balance(realm)` | 1 | 1 | PASS | - |
| 104 | sweep: owner only | `p0: gnomes.Sweep() [gnokey]` | refused: only the owner | refused: gnomes: only the owner can do this | PASS | 4149814 |
| 105 | sweep: to the treasury | `test1: gnomes.Sweep() [mcp]` | swept | went through | PASS | 5378759 |
| 106 | sweep: the treasury has it | `balance(treas) after - before, balance(realm)` | 1 0 | 1 0 | PASS | - |
| 107 | site: owner only | `p0: gnomes.SetSiteURL(https://gnogolf.xyz/) [gnokey]` | refused: only the owner | refused: gnomes: only the owner can do this | PASS | 4151008 |
| 108 | site: https only | `test1: gnomes.SetSiteURL(http://gnogolf.xyz/) [mcp]` | refused: a site link is https:// | refused: gnomes: a site link is https:// and up to 100 of a-z, A-Z, 0-9 and -._~/:%, ending with / | PASS | - |
| 109 | site: ends with / | `test1: gnomes.SetSiteURL(https://gnogolf.xyz) [mcp]` | refused: a site link is https:// | refused: gnomes: a site link is https:// and up to 100 of a-z, A-Z, 0-9 and -._~/:%, ending with / | PASS | - |
| 110 | site: no query | `test1: gnomes.SetSiteURL(https://gnogolf.xyz/?a=1) [mcp]` | refused: a site link is https:// | refused: gnomes: a site link is https:// and up to 100 of a-z, A-Z, 0-9 and -._~/:%, ending with / | PASS | - |
| 111 | metadata: no external_url before the site | `TokenMetadata("5") has external_url` | False | False | PASS | - |
| 112 | site: set | `test1: gnomes.SetSiteURL(https://gnogolf.xyz/) [mcp]` | set | went through | PASS | 6800509 |
| 113 | site: SiteURL() | `SiteURL()` | https://gnogolf.xyz/ | https://gnogolf.xyz/ | PASS | - |
| 114 | metadata: JSON | `TokenMetadata("5") name,external_url,tier` | Eppie Thistledown https://gnogolf.xyz/g/5/ common | Eppie Thistledown https://gnogolf.xyz/g/5/ common | PASS | - |
| 115 | token: TokenURI SVG | `TokenURI("5") parsed as XML` | svg | svg | PASS | - |
| 116 | token: image is TokenURI | `TokenMetadata("5").image == TokenURI("5")` | True | True | PASS | - |
| 117 | token: unminted | `TokenURI("9")` | error | error | PASS | - |
| 118 | token: Name, Symbol, TotalSupply | `Name() Symbol() TotalSupply()` | Gnogolf Gnomes GNOME 20 | Gnogolf Gnomes GNOME 20 | PASS | - |
| 119 | render: the collection | `Render("") [gno_render]` | contains fixed price | <untrusted_content kind="render" source="gno.land/r/nym-gnometest000/gnogolf/gnomes"> # Gnogolf Gnomes  The ball you play Gnogolf with, as a | PASS | - |
| 120 | render: a gnome on gnoweb | `GET /r/nym-gnometest000/gnogolf/gnomes:5` | contains Eppie Thistledown | <!doctype html> <html lang="en">   <head>   <meta charset="UTF-8" />   <meta name="viewport" content="width=device-width, initial-scale=1.0" | PASS | - |
| 121 | render: a player | `Render("<p1>")` | contains 5 | height: 0 data: # g16vgyueceu2vnfegd778dwvs9mc0yvyynlug3wh  - [#5](/r/nym-gnometest000/gnogolf/gnomes:5) - [#7](/r/nym-gnometest000/gnogolf/ | PASS | - |
| 122 | render: not found | `Render("nope")` | contains Not found | height: 0 data: # Not found  [The collection](/r/nym-gnometest000/gnogolf/gnomes) | PASS | - |
| 123 | portrait: every page draws its gnome | `Render("1") … Render("720") [qrender]: SVG parsed, <title> its name` | 720 - | 720 - | PASS | - |
| 124 | portrait: no two alike | `distinct SVGs of the 720` | 720 | 720 | PASS | - |
| 125 | portrait: the heaviest, #199 (epic) | `its SVG's bytes (6 KiB)` | ≤ 6144 | 6108 | PASS | - |
| 126 | portrait: b2 buys #199 | `b2: gnomes.Buy(199) send 336000000ugnot [gnokey]` | sold | went through | PASS | 32861676 |
| 127 | portrait: TokenURI is the page's portrait | `TokenURI("199") == its page's image` | True | True | PASS | - |
| 128 | portrait: TokenURI gas, the heaviest (#199) | `MsgRun TokenURI("199") - MsgRun OwnerOf` | ≤ 83100000 | 83082903 | PASS | - |
| 129 | portrait: TokenURI gas, a Common (#5) | `MsgRun TokenURI("5") - MsgRun OwnerOf` | ≤ 83100000 | 47984944 | PASS | - |
| 130 | portrait: TokenURI gas, a Rare (#73) | `MsgRun TokenURI("73") - MsgRun OwnerOf` | ≤ 83100000 | 54901207 | PASS | - |
| 131 | portrait: TokenURI gas, an Epic (#94) | `MsgRun TokenURI("94") - MsgRun OwnerOf` | ≤ 83100000 | 58701382 | PASS | - |
| 132 | portrait: TokenURI gas, a Legendary (#104) | `MsgRun TokenURI("104") - MsgRun OwnerOf` | ≤ 83100000 | 65527527 | PASS | - |
| 133 | earned: free | `p1: gnomes.MintEarned(wizard) send 1ugnot [gnokey]` | refused: an earned gnome is free | refused: gnomes: an earned gnome is free: send nothing with it | PASS | 4322917 |
| 134 | earned: a kind | `p1: gnomes.MintEarned(dragon) [gnokey]` | refused: no such earned gnome | refused: gnomes: no such earned gnome: dragon | PASS | 4242860 |
| 135 | earned: not proven (Island Cup unpublished) | `p1: gnomes.MintEarned(pirate) [gnokey]` | refused: not proven: pirate | refused: gnomes: not proven: pirate | PASS | 7674713 |
| 136 | earned: not proven without a record | `p0: gnomes.MintEarned(wizard) [gnokey]` | refused: not proven: wizard | refused: gnomes: not proven: wizard | PASS | 8824778 |
| 137 | earned: p1 finished the Garden Cup (wizard) | `p1: gnomes.MintEarned(wizard) [gnokey]` | minted 1000001 | went through | PASS | 27131115 |
| 138 | earned: OwnerOf(1000001) | `OwnerOf("1000001")` | g16vgyueceu2vnfegd778dwvs9mc0yvyynlug3wh | g16vgyueceu2vnfegd778dwvs9mc0yvyynlug3wh | PASS | - |
| 139 | earned: once | `p1: gnomes.MintEarned(wizard) [gnokey]` | refused: already minted: wizard | refused: gnomes: already minted: wizard | PASS | 5149410 |
| 140 | earned: an ace on a par 2 is the cup at par (viking) | `p1: gnomes.MintEarned(viking) [gnokey]` | minted 1000002 | went through | PASS | 28126085 |
| 141 | earned: bound to its player | `p1: gnomes.TransferFrom(g16vgyueceu2vnfegd778dwvs9mc0yvyynlug3wh, g1y4ezdz9vfht05ugp2ugnwpx323slj7sdjyh2ll, 1000001) [gnokey]` | refused: bound to its player | refused: gnomes: an earned gnome is bound to its player: it cannot be transferred or approved | PASS | 12148225 |
| 142 | earned: no approval | `p1: gnomes.Approve(g1y4ezdz9vfht05ugp2ugnwpx323slj7sdjyh2ll, 1000001) [gnokey]` | refused: bound to its player | refused: gnomes: an earned gnome is bound to its player: it cannot be transferred or approved | PASS | 4308814 |
| 143 | earned: TokenMetadata kind | `TokenMetadata("1000001") tier,kind` | earned wizard | earned wizard | PASS | - |
| 144 | earned: equip it | `p1: gnomes.Equip(1000001) [gnokey]` | worn | went through | PASS | 10697388 |
| 145 | earned: Equipped | `Equipped(p1).tier` | earned | earned | PASS | - |
| 146 | earned: TokenURI SVG | `TokenURI("1000001") parsed as XML` | svg | svg | PASS | - |
| 147 | portrait: TokenURI gas, an earned gnome | `MsgRun TokenURI("1000001") - MsgRun OwnerOf` | ≤ 83100000 | 36363996 | PASS | - |
| 148 | close: owner only | `p0: gnomes.SetCloseAt(1791299598) [gnokey]` | refused: only the owner | refused: gnomes: only the owner can do this | PASS | 4226361 |
| 149 | close: in the future | `test1: gnomes.SetCloseAt(1791298988) [mcp]` | refused: a closing date is in the future | refused: gnomes: a closing date is in the future | PASS | - |
| 150 | close: set | `test1: gnomes.SetCloseAt(1791299598) [mcp]` | set | went through | PASS | 6773837 |
| 151 | close: never later | `test1: gnomes.SetCloseAt(1791299898) [mcp]` | refused: never later than | refused: gnomes: the closing date comes forward, never later than 2026-10-06 15:13 UTC | PASS | - |
| 152 | close: brought forward | `test1: gnomes.SetCloseAt(1791299059) [mcp]` | set | went through | PASS | 6783837 |
| 153 | close: CloseAt() | `CloseAt()` | 1791299059 | 1791299059 | PASS | - |
| 154 | close: buys refused | `p1: gnomes.Buy(1) send 36000000ugnot [gnokey]` | refused: the genesis sale closed on | refused: gnomes: the genesis sale closed on 2026-10-06 15:04 UTC | PASS | 15436481 |
| 155 | close: no wave for its ids | `test1: gnomes.AddWave(400, 410, 1791299059, 0) [mcp]` | refused: the genesis sale closed on | refused: gnomes: the genesis sale closed on 2026-10-06 15:04 UTC | PASS | - |
| 156 | close: no date after | `test1: gnomes.SetCloseAt(1791299659) [mcp]` | refused: the genesis sale closed on | refused: gnomes: the genesis sale closed on 2026-10-06 15:04 UTC | PASS | - |
| 157 | close: Collection genesis closed, sold | `Collection().series[0] closed,sold` | True 21 | True 21 | PASS | - |
| 158 | close: an unsold gnome closed | `Gnome("1").closed` | True | True | PASS | - |
| 159 | close: a sold Legendary is not closed | `Gnome("104").closed` | False | False | PASS | - |
| 160 | close: an unsold Legendary is | `Gnome("311").closed` | True | True | PASS | - |
| 161 | close: final supply | `Collection().series[0].sold, tiers sold` | 21 14,3,2,2 | 21 14,3,2,2 | PASS | - |
| 162 | owner: only the offered accepts | `p0: gnomes.Accept() [gnokey]` | refused: no transfer of the collection is offered to you | refused: gnomes: no transfer of the collection is offered to you | PASS | 4072277 |
| 163 | owner: Transfer offers | `test1: gnomes.Transfer(g1y4ezdz9vfht05ugp2ugnwpx323slj7sdjyh2ll) [mcp]` | offered | went through | PASS | 6209973 |
| 164 | owner: p0 accepts | `p0: gnomes.Accept() [gnokey]` | taken | went through | PASS | 6092338 |
| 165 | owner: moved, the treasury stays | `Owner() Treasury()` | g1y4ezdz9vfht05ugp2ugnwpx323slj7sdjyh2ll g10pf7ssgrrnw6trff0yx0x0jrzea3yk60xdvnc3 | g1y4ezdz9vfht05ugp2ugnwpx323slj7sdjyh2ll g10pf7ssgrrnw6trff0yx0x0jrzea3yk60xdvnc3 | PASS | - |
| 166 | owner: the old owner no more | `test1: gnomes.SetMintOpen(false) [mcp]` | refused: only the owner | refused: gnomes: only the owner can do this | PASS | - |

**166 passed, 0 failed** of 166 steps.

## Seed mode and the shop's UI runs (2026-10-06, later)

`SEED=1 scripts/e2e-gnomes.sh` does the setup only and leaves the chain
running: the genesis, the close in 30 days (set first), its one sale of
every gnome open with an hour's players' window (ADR-013; on the day this
was run it seeded wave 1 open and wave 2 in two days), p1 and b1 with a
record, p1 holding two Commons and a Rare (wearing one), b1 a Common.
`$WORK/seed.env` says where everything is.

`media/gnomes/shop-e2e.mjs` then drives the client (a dev server on that
chain, `NEXT_PUBLIC_GNOMES=1`) in the repo's headless Chrome, its wallet a
stand-in (`media/gnomes/wallet.mjs`) that signs each Adena call with gnokey
and a throwaway key, on that chain alone (it refuses an RPC that is not
this machine's). Every step checks the chain and is screenshotted, and every
screenshot is audited: no sideways scroll, nothing wider than the window, no
page error. 91 checks pass: the gallery at 320, 390, 768, 1280 and 1440 px;
the players' window and its cap said on the button; the order before the
wallet, its button off until both boxes are ticked; a cancel; a buy signed
and read back (the chain shows the owner) and its receipt; a Legendary at
its price; Adena failing without saying nothing went ("don't buy again"); my
gnomes and theirs; the picker's row, a gnome played for free, then shown to
everyone (Equip, and `Worn` says so) with the share row "Your rivals will
see …"; the title's live scene, its watcher by the cup in the player's
gnome; an earned gnome's page; a later wave's (a check gone with the
waves, ADR-013).
