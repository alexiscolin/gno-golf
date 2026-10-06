# Gnomes realm, end to end on a local chain — 2026-10-06

The gnomes realm (`gno.land/r/gnogolf/gnomes`), deployed with what it reads
(store, golf/v2) on a local gnodev of the onyx toolchain, played through
from the genesis to the settled auction: **183 of 184 steps pass**. The one
that fails is a cost figure, not a rule: TokenURI of the heaviest portrait
takes 83.1 million gas on chain where its commit says 76 million (finding 1).
Run twice on two chains side by side, once with the owner's calls and the
reads through the gno MCP server and once with gnokey alone: the same 184
steps, the same results, the gas to within 20.

## The setup

- **Code**: branch `gnome-e2e` at `5197af7`: `worktree-nft-gnomes` at
  `3717c73` (the realm with the treasury in two steps, SetSiteURL, the
  review's fixes and the on-chain portrait drawn from the traits,
  `art.gno`) merged with `worktree-gnome-designs` at `7aabe6d` (the genesis
  rows, `data/gnomes/rows/genesis.txt`: 720 rows, 60,096 bytes;
  `scripts/gnomerows.ts --check` passes on the merge). The one conflict,
  `media/tsconfig.json`, was each branch adding its own folder to `include`
  (`gnomes/*.mjs`, `gnomes/portrait/*.mjs`): both kept.
- **Chain**: `gnodev local` built from the tag `chain/onyx`
  (`../gno-onyx`, as the README's "Running it locally" says), chain id
  `dev`, on RPC `127.0.0.1:26757` and gnoweb `:8898` (26657 was another
  session's gnodev, left alone); the replay on `:26857`/`:8998`. The
  packages staged by `MAINNET=1 scripts/stage.sh nym-gnometest000` (v1 and
  v2's `import_v1.gno` left out) and deployed under that test name.
- **Keys**: throwaway, in a keybase of the run's own: `test1` (gnodev's
  public deploy key: the collection's owner, and its first treasury), `p0`
  (a wallet with no record), `p1` (a player), `b1` and `b2` (bidders),
  `treas` (the treasury it moves to), each given 5,000 GNOT at genesis.
  Nothing touched onyx, mainnet or a real key.
- **The MCP server**: `gnoverse/gno-mcp` at `40fcc5a`, built from source to
  `~/.local/src/gno-mcp/bin/gnomcp` (outside the repo), registered for this
  project only (`claude mcp add gnomcp --scope local -- … -config
  <profiles.toml>`, its `local` profile pointed at the node above). A
  Claude Code session loads MCP servers when it starts, so the session that
  ran this spoke gnomcp's stdio protocol itself: the same JSON-RPC tool
  calls a client makes, one gnomcp per call. Through gnomcp: every call
  of the owner (`gno_call`, which signs as `test1` on a local profile),
  the reads (`gno_eval`, `gno_account`, `gno_render`), the `p/` deploys
  (`gno_addpkg`) and the gas runs (`gno_run`). Through gnokey: the
  players' calls (gnomcp signs as test1 alone on a local chain), the
  realms' deploys and the genesis `AddSeries` (gnomcp's limits, finding
  3). Each row of the table says which.
- **Replay**: `scripts/e2e-gnomes.sh` does all of it from nothing (keys,
  gnodev, stage, deploy, scenario) and writes the table below; `MCP=1`
  sends the owner's calls and the reads through gnomcp. It takes about 65
  minutes: the chain's clock is the wall's and an auction lasts an hour at
  least, so everything else runs inside that hour.

## Findings

No bug in the realm's rules: every one the scenario asks of it held, the
money to the ugnot.

1. **TokenURI of the heaviest portrait costs more than its commit says
   (step 132).** `4a852c6` gives "0.076e9 gas at the heaviest", from its
   filetests: `z_portrait_read` − `z_portrait_base` = 1,482,736,365 −
   1,406,927,467 = 75,808,898 (reproduced here). On chain the heaviest,
   #199 *Figurehead Fen* (an Epic, 6,108 bytes of SVG, the largest of the
   720), takes **83,082,963 gas** in a transaction of its own: a MsgRun of
   `TokenURI("199")` less the same MsgRun reading `OwnerOf("199")`; the
   replay gave 83,082,943. A second call in the same run, the realm then
   loaded, took 77,054,284 (measured on a scratch chain). So the bound is
   about 10% low for a real transaction. The filetest reads after a Buy in
   the same transaction, in the test VM, which likely explains the gap
   (not verified). The other tiers stay under it: a Common (#5) 47,985,530,
   a Rare (#73) 54,901,267, an Epic (#94) 58,701,442, the Legendary (#104)
   65,527,587, an earned gnome 36,363,996. It doesn't break anything:
   wallets read TokenURI by query (`vm/qeval`, which answered every one
   here). What's low is the figure to quote and the bound a gas test
   should hold. Repro: the script's portrait section, `urigas 199`.
2. **gnodev (tooling): a lazily loaded import kills the transaction in
   flight.** The first deploy importing an examples package (`store`, which
   imports `p/nt/bptree/v0`) makes gnodev reload the node (`Node ┃ I reload
   done pkgs=1 state applied=3`), and that deploy is refused `unauthorized
   error`; sent again, it goes through. Repro: `gnodev local -no-watch` in
   an empty directory, deploy `p/…/physics`, then `r/…/store` at once. The
   script preloads the imports (`-paths gno.land/p/nt/bptree/v0,…`).
3. **gnomcp's limits (tooling).** `gno_addpkg` offers a storage deposit of
   10 GNOT at most, with no argument to raise it: store (13.4 GNOT),
   golf/v2 (24.4) and gnomes (20.6 before the portrait's art.gno, more
   with it) cannot be deployed
   through it (`not enough deposit … requires 13406300ugnot`; its first
   attempt said only `unauthorized error`: the reload of finding 2).
   `gno_call` simulates under a gas ceiling below what the genesis
   `AddSeries` needs (`call: simulate: out of gas error`), with no gas
   argument either. `gno_eval` will not return an answer of about 8 KB
   (`8193 bytes; preview omitted. Request a smaller slice`), so the larger
   portraits' TokenURI cannot be read through it; the script reads those
   with gnokey. None of this concerns the realm.
4. **The genesis `AddSeries` takes 1,073,661,719 gas** (61 KB of rows
   stored, 6.1 GNOT of deposit), in one transaction, as a series must be.
   It fits gnodev's 10 billion a block. Worth one `-simulate only` against
   onyx's block and transaction gas limits before the real one.
5. **`Auction()` during a pause that spans the end** (read from the code,
   not played: it takes a pause across an auction's last moment).
   `Auction()` computes `over = settled || now() >= end` whatever the
   switch. Paused past the end, it says `"over":true,"min":0` while
   `Settle` refuses ("the sale is paused"), and on resume `resume()` moves
   the end on and bids are taken again. A client trusting `over` would show
   the auction ended, then reopened. Low; `over` could account for the
   pause, or the page read `MintOpen()` too.
6. **The local Garden Cup is one hole, and the weather moves the ace.** On
   these chains only `garden/3` is published, so "Finish the Garden Cup"
   was proven by holing that hole, and "at par or under" by its ace on a
   par 2: by design (a cup is its slots' current versions), noted so the
   rows read right. The ace is found with the chain's own `SimulateRound`.
   The wind changes every five minutes of chain time and moves it: `0,9.25`
   in calm weather, `1,9.75` in this run's. A period with none is waited
   out. (An earlier attempt searched only around the calm shot, found
   none, and every step needing p1's record failed after it.)

## What it shows

Beyond the unit tests:

- **Payments**: forwarded in the same call. The treasury's balance rises by
  exactly the price, and the realm keeps nothing but the escrowed top bid.
- **Bids**: an outbid bidder is refunded to the ugnot. The pause moves the
  auction's end by exactly the time paused (41 s, from the two blocks'
  times). A late bid moves the end to exactly its block's time + 600 s.
- **The close**: an auction under way runs past the genesis's close and
  settles to the treasury set by the two-step change.
- **The record**: a real golf/v2 round's store record opens the player
  window and proves an earned gnome.
- **The portraits**: every one of the 720 catalogue gnomes' pages carries
  its portrait (the drawing TokenURI returns). Each is a well-formed SVG
  titled with its gnome's name, and no two are alike, so each gnome's
  traits change its picture. The largest is 6,108 bytes. Bought, the
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
| 6 | deploy | `addpkg gno.land/r/nym-gnometest000/gnogolf/gnomes [gnokey]` | deployed | deployed | PASS | 245466318 |
| 7 | deploy | `gnomes.Owner()` | g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5 | g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5 | PASS | - |
| 8 | deploy | `gnomes.Treasury()` | g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5 | g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5 | PASS | - |
| 9 | deploy | `store.Writer()` | gno.land/r/nym-gnometest000/gnogolf/golf/v2 | gno.land/r/nym-gnometest000/gnogolf/golf/v2 | PASS | - |
| 10 | catalogue: owner only | `p0: gnomes.AddSeries(genesis, <60096 bytes>) [gnokey]` | refused: only the owner | refused: gnomes: only the owner can do this | PASS | 4893129 |
| 11 | catalogue: genesis first | `test1: gnomes.AddSeries(drop2, 721\|common\|X\|01) [mcp]` | refused: the genesis first | refused: gnomes: the genesis first, and once | PASS | - |
| 12 | catalogue: publish the genesis (720 rows) | `test1: gnomes.AddSeries(genesis, <60096 bytes>) [gnokey (over gnomcp's gas ceiling)]` | published | went through | PASS | 1073661719 |
| 13 | catalogue: Collection series | `Collection().series[0]` | genesis 1 720 0 | genesis 1 720 0 | PASS | - |
| 14 | catalogue: once | `test1: gnomes.AddSeries(genesis, <60096 bytes>) [mcp]` | refused: already published | refused: gnomes: series genesis is already published | PASS | - |
| 15 | catalogue: Gnome(104) | `Gnome("104").tier,name` | legendary The Miller | legendary The Miller | PASS | - |
| 16 | sale: closed at deploy | `test1: gnomes.StartAuction(104, 1) [mcp]` | refused: the sale is closed | refused: gnomes: the sale is closed | PASS | - |
| 17 | sale: open | `test1: gnomes.SetMintOpen(true) [mcp]` | open | went through | PASS | 6428995 |
| 18 | sale: MintOpen() | `MintOpen()` | true | true | PASS | - |
| 19 | auction: owner only | `p0: gnomes.StartAuction(104, 1) [gnokey]` | refused: only the owner | refused: gnomes: only the owner can do this | PASS | 4298420 |
| 20 | auction: Legendary only | `test1: gnomes.StartAuction(94, 1) [mcp]` | refused: only a legendary | refused: gnomes: only a legendary is auctioned | PASS | - |
| 21 | auction: 1 to 168 hours | `test1: gnomes.StartAuction(104, 0) [mcp]` | refused: 1 to 168 hours | refused: gnomes: an auction runs 1 to 168 hours | PASS | - |
| 22 | auction: start 104 for 1 hour | `test1: gnomes.StartAuction(104, 1) [mcp]` | started, reserve 777 GNOT | went through | PASS | 16026282 |
| 23 | auction: Auction() at start | `Auction() id,reserve,top,min,end-start` | 104 777000000 0 777000000 3600 | 104 777000000 0 777000000 3600 | PASS | - |
| 24 | auction: one at a time | `test1: gnomes.StartAuction(208, 1) [mcp]` | refused: an auction is under way | refused: gnomes: an auction is under way | PASS | - |
| 25 | auction: Buy refuses a Legendary | `p0: gnomes.Buy(104) [gnokey]` | refused: sold by auction | refused: gnomes: a legendary is sold by auction | PASS | 13263113 |
| 26 | auction: below the reserve | `b1: gnomes.Bid(104) send 776999999ugnot [gnokey]` | refused: a bid is at least 777000000ugnot | refused: gnomes: a bid is at least 777000000ugnot | PASS | 5734444 |
| 27 | auction: only the gnome auctioned | `b1: gnomes.Bid(208) send 777000000ugnot [gnokey]` | refused: is not being auctioned | refused: gnomes: gnome 208 is not being auctioned | PASS | 5219290 |
| 28 | auction: b1 bids the reserve | `b1: gnomes.Bid(104) send 777000000ugnot [gnokey]` | taken | went through | PASS | 7842329 |
| 29 | auction: escrow | `balance(realm), the top bid held` | 777000000 | 777000000 | PASS | - |
| 30 | auction: no outbidding oneself | `b1: gnomes.Bid(104) send 815850000ugnot [gnokey]` | refused: you hold the top bid already | refused: gnomes: you hold the top bid already | PASS | 5176348 |
| 31 | auction: min raise 5% | `b2: gnomes.Bid(104) send 815849999ugnot [gnokey]` | refused: a bid is at least 815850000ugnot | refused: gnomes: a bid is at least 815850000ugnot | PASS | 5503246 |
| 32 | auction: b2 outbids | `b2: gnomes.Bid(104) send 815850000ugnot [gnokey]` | taken | went through | PASS | 7849833 |
| 33 | auction: b1 refunded exactly | `balance(b1) after - before` | 777000000 | 777000000 | PASS | - |
| 34 | auction: no cancel after a bid | `test1: gnomes.CancelAuction() [mcp]` | refused: an auction with a bid runs to its end | refused: gnomes: an auction with a bid runs to its end | PASS | - |
| 35 | pause: SetMintOpen(false) | `test1: gnomes.SetMintOpen(false) [mcp]` | paused | went through | PASS | 6607847 |
| 36 | pause: no bid | `b1: gnomes.Bid(104) send 900000000ugnot [gnokey]` | refused: the sale is closed | refused: gnomes: the sale is closed | PASS | 4394973 |
| 37 | pause: no settle | `p0: gnomes.Settle(104) [gnokey]` | refused: the sale is paused | refused: gnomes: the sale is paused: the auction settles once it resumes | PASS | 4273098 |
| 38 | pause: no buy | `p0: gnomes.Buy(1) send 30000000ugnot [gnokey]` | refused: the sale is closed | refused: gnomes: the sale is closed | PASS | 4397594 |
| 39 | pause: SetMintOpen(true) | `test1: gnomes.SetMintOpen(true) [mcp]` | resumed | went through | PASS | 7178746 |
| 40 | pause: the end moved by the pause | `Auction().end - end before (= resume - pause block times)` | 41 | 41 | PASS | - |
| 41 | pause: open again is a no-op | `test1: gnomes.SetMintOpen(true) [mcp]` | no change | went through | PASS | 4369769 |
| 42 | pause: no-op leaves the end | `Auction().end` | 1791288148 | 1791288148 | PASS | - |
| 43 | waves: owner only | `p0: gnomes.AddWave(1, 104, 0, 1) [gnokey]` | refused: only the owner | refused: gnomes: only the owner can do this | PASS | 4296768 |
| 44 | waves: 0 to 168 hours | `test1: gnomes.AddWave(1, 104, 1791284552, 169) [mcp]` | refused: a player window is 0 to 168 hours | refused: gnomes: a player window is 0 to 168 hours | PASS | - |
| 45 | waves: Garden wave 1-104, 1 h player window | `test1: gnomes.AddWave(1, 104, 1791284552, 1) [mcp]` | added | went through | PASS | 8912872 |
| 46 | waves: no overlap | `test1: gnomes.AddWave(100, 110, 1791284552, 0) [mcp]` | refused: are in a wave already | refused: gnomes: ids 1 to 104 are in a wave already | PASS | - |
| 47 | player window: no record, refused | `p0: gnomes.Buy(1) send 30000000ugnot [gnokey]` | refused: players only until | refused: gnomes: players only until 1791288152: finish a hole first | PASS | 16692713 |
| 48 | record: publish garden/3 | `test1: v2.Publish(garden/3, <4110 bytes>, e2e) [mcp]` | published | went through | PASS | 116067746 |
| 49 | record: a holing shot this weather | `SimulateRound(garden/3/v1, …)` | found (1,9.75) | found (1,9.75) | PASS | - |
| 50 | record: p1 holes garden/3 | `p1: v2.PlayRound(garden/3/v1, 1,9.75) [gnokey]` | holed | went through | PASS | 74872361 |
| 51 | record: store totals | `store.Has("totals","assisted <p1>")` | true | true | PASS | - |
| 52 | buy: underpaid | `p1: gnomes.Buy(5) send 29999999ugnot [gnokey]` | refused: wrong payment, send exactly 30000000ugnot | refused: gnomes: wrong payment, send exactly 30000000ugnot | PASS | 17036972 |
| 53 | buy: overpaid | `p1: gnomes.Buy(5) send 30000001ugnot [gnokey]` | refused: wrong payment, send exactly 30000000ugnot | refused: gnomes: wrong payment, send exactly 30000000ugnot | PASS | 17036972 |
| 54 | buy: nothing sent | `p1: gnomes.Buy(5) [gnokey]` | refused: wrong payment | refused: gnomes: wrong payment, send exactly 30000000ugnot | PASS | 16722878 |
| 55 | buy: not an id | `p1: gnomes.Buy(05) send 30000000ugnot [gnokey]` | refused: not a gnome id | refused: gnomes: not a gnome id: 05 | PASS | 4752021 |
| 56 | buy: at most 5 ids | `p1: gnomes.Buy(1,2,3,4,5,6) send 180000000ugnot [gnokey]` | refused: name 1 to 5 gnomes | refused: gnomes: name 1 to 5 gnomes, as ids separated by commas | PASS | 4831953 |
| 57 | buy: an id twice | `p1: gnomes.Buy(5,5) send 60000000ugnot [gnokey]` | refused: is named twice | refused: gnomes: gnome 5 is named twice | PASS | 4828152 |
| 58 | buy: p1 buys Common 5 at its price | `p1: gnomes.Buy(5) send 30000000ugnot [gnokey]` | sold | went through | PASS | 26580193 |
| 59 | buy: treasury up by the price | `balance(treasury) after - before` | 30000000 | 30000000 | PASS | - |
| 60 | buy: the realm keeps nothing | `balance(realm) = the auction's top bid in escrow` | 815850000 | 815850000 | PASS | - |
| 61 | buy: OwnerOf(5) | `OwnerOf("5")` | g1dljzv5g99k0zdflq7sqamvz9s8dtzgjaacthe4 | g1dljzv5g99k0zdflq7sqamvz9s8dtzgjaacthe4 | PASS | - |
| 62 | buy: sold once | `p1: gnomes.Buy(5) send 30000000ugnot [gnokey]` | refused: already sold | refused: gnomes: this gnome is already sold | PASS | 13395762 |
| 63 | buy: two in one call | `p1: gnomes.Buy(6,7) send 60000000ugnot [gnokey]` | sold | went through | PASS | 35526629 |
| 64 | caps: player window, 3 Commons | `p1: gnomes.Buy(8) send 30000000ugnot [gnokey]` | refused: the player window takes 3 common a wallet | refused: gnomes: the player window takes 3 common a wallet | PASS | 17021268 |
| 65 | caps: 2 Rares in the window | `p1: gnomes.Buy(73,74) send 198000000ugnot [gnokey]` | sold | went through | PASS | 35991006 |
| 66 | caps: no third Rare in the window | `p1: gnomes.Buy(75) send 99000000ugnot [gnokey]` | refused: the player window takes 2 rare a wallet | refused: gnomes: the player window takes 2 rare a wallet | PASS | 18187521 |
| 67 | caps: 1 Epic in the window | `p1: gnomes.Buy(94) send 333000000ugnot [gnokey]` | sold | went through | PASS | 30393726 |
| 68 | caps: no second Epic in the window | `p1: gnomes.Buy(95) send 333000000ugnot [gnokey]` | refused: the player window takes 1 epic a wallet | refused: gnomes: the player window takes 1 epic a wallet | PASS | 16501347 |
| 69 | price: owner only | `p0: gnomes.SetPrice(common, 40000000) [gnokey]` | refused: only the owner | refused: gnomes: only the owner can do this | PASS | 4295040 |
| 70 | price: bounds | `test1: gnomes.SetPrice(common, 999999) [mcp]` | refused: a price is between | refused: gnomes: a price is between 1000000 and 10000000000 ugnot | PASS | - |
| 71 | price: Common 40 GNOT for the next waves | `test1: gnomes.SetPrice(common, 40000000) [mcp]` | set | went through | PASS | 6786740 |
| 72 | price: a wave keeps its prices | `Gnome("8").price` | 30000000 | 30000000 | PASS | - |
| 73 | waves: 105-207, no window | `test1: gnomes.AddWave(105, 207, 1791284560, 0) [mcp]` | added | went through | PASS | 9250902 |
| 74 | waves: 209-310, tomorrow | `test1: gnomes.AddWave(209, 310, 1791370960, 0) [mcp]` | added | went through | PASS | 9540245 |
| 75 | waves: not yet | `p0: gnomes.Buy(209) send 40000000ugnot [gnokey]` | refused: is not on sale yet | refused: gnomes: gnome 209 is not on sale yet | PASS | 14351123 |
| 76 | waves: in no wave | `p0: gnomes.Buy(400) send 30000000ugnot [gnokey]` | refused: is not on sale | refused: gnomes: gnome 400 is not on sale | PASS | 14587629 |
| 77 | price: the new wave at the new price | `Gnome("105").price` | 40000000 | 40000000 | PASS | - |
| 78 | caps: p0 (no record) buys 5 Commons, no window | `p0: gnomes.Buy(105,106,107,108,109) send 200000000ugnot [gnokey]` | sold | went through | PASS | 55413041 |
| 79 | caps: 5 more (10 Commons) | `p0: gnomes.Buy(110,111,112,113,114) send 200000000ugnot [gnokey]` | sold | went through | PASS | 55135137 |
| 80 | caps: lifetime, 10 Commons | `p0: gnomes.Buy(115) send 40000000ugnot [gnokey]` | refused: the cap is 10 common a wallet | refused: gnomes: the cap is 10 common a wallet | PASS | 15859970 |
| 81 | buy: SoldOfTier(0) | `SoldOfTier(0)` | 13 | 13 | PASS | - |
| 82 | equip: p1 wears 5 | `p1: gnomes.Equip(5) [gnokey]` | worn | went through | PASS | 10479747 |
| 83 | equip: Equipped(p1) | `Equipped(p1).id,tier` | 5 common | 5 common | PASS | - |
| 84 | equip: not someone else's | `p0: gnomes.Equip(5) [gnokey]` | refused: not your gnome | refused: gnomes: not your gnome | PASS | 7509203 |
| 85 | equip: not unsold | `p0: gnomes.Equip(9) [gnokey]` | refused: not your gnome | refused: gnomes: not your gnome | PASS | 7922058 |
| 86 | equip: p0 wears 105 | `p0: gnomes.Equip(105) [gnokey]` | worn | went through | PASS | 10729231 |
| 87 | equip: EquippedMany, repeats and junk skipped | `EquippedMany("p1,p0,p1,junk,b1")` | 5,105 | 5,105 | PASS | - |
| 88 | equip: p1 wears 6 | `p1: gnomes.Equip(6) [gnokey]` | worn | went through | PASS | 10152581 |
| 89 | equip: p1 sends 6 to b1 | `p1: gnomes.TransferFrom(g1dljzv5g99k0zdflq7sqamvz9s8dtzgjaacthe4, g1gkmfvg0v9l9hlqejsvesjerllp7cm6ghe6rap8, 6) [gnokey]` | moved | went through | PASS | 17755308 |
| 90 | equip: a gnome sent on is worn no more | `Equipped(p1)` |  |  | PASS | - |
| 91 | equip: off | `p0: gnomes.Equip() [gnokey]` | off | went through | PASS | 7060848 |
| 92 | equip: Equipped(p0) after off | `Equipped(p0)` |  |  | PASS | - |
| 93 | locker: GnomesOf(p0, 0) | `GnomesOf(p0,0) total,next,rows` | 10 -1 10 | 10 -1 10 | PASS | - |
| 94 | locker: GnomesOf(p0, 4) | `GnomesOf(p0,4) first row, rows` | 109 6 | 109 6 | PASS | - |
| 95 | locker: GnomesOf(p1, 0) in id order | `GnomesOf(p1,0) ids` | 5,7,73,74,94 | 5,7,73,74,94 | PASS | - |
| 96 | locker: past the end | `GnomesOf(p1,99) rows,next` | 0 -1 | 0 -1 | PASS | - |
| 97 | locker: TokenOfOwnerByIndex(p0, 9) | `TokenOfOwnerByIndex(p0,9)` | 114 | 114 | PASS | - |
| 98 | treasury: owner only | `p0: gnomes.SetTreasury(g1f05x9eu8044w4jyd3wc8jq3s0z5nv3fmek4dfm) [gnokey]` | refused: only the owner | refused: gnomes: only the owner can do this | PASS | 4220128 |
| 99 | treasury: not the realm | `test1: gnomes.SetTreasury(g17xf8xm2lgj5qf0zt7g445fn6lsk7vfajwladzr) [mcp]` | refused: not the realm's own address | refused: gnomes: the treasury is not the realm's own address | PASS | - |
| 100 | treasury: offered to treas | `test1: gnomes.SetTreasury(g1f05x9eu8044w4jyd3wc8jq3s0z5nv3fmek4dfm) [mcp]` | offered | went through | PASS | 6353075 |
| 101 | treasury: pending | `PendingTreasury(), Treasury()` | g1f05x9eu8044w4jyd3wc8jq3s0z5nv3fmek4dfm g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5 | g1f05x9eu8044w4jyd3wc8jq3s0z5nv3fmek4dfm g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5 | PASS | - |
| 102 | treasury: a buy while only offered | `p0: gnomes.Buy(177) send 99000000ugnot [gnokey]` | sold | went through | PASS | 30072765 |
| 103 | treasury: still paid to the old one | `balance(test1) after - before` | 99000000 | 99000000 | PASS | - |
| 104 | treasury: only the offered takes it | `p0: gnomes.AcceptTreasury() [gnokey]` | refused: no treasury is offered to you | refused: gnomes: no treasury is offered to you | PASS | 4077221 |
| 105 | treasury: treas accepts | `treas: gnomes.AcceptTreasury() [gnokey]` | taken | went through | PASS | 10296220 |
| 106 | treasury: moved | `Treasury(), PendingTreasury()` | g1f05x9eu8044w4jyd3wc8jq3s0z5nv3fmek4dfm  | g1f05x9eu8044w4jyd3wc8jq3s0z5nv3fmek4dfm  | PASS | - |
| 107 | treasury: royalty follows | `RoyaltyInfo("5", 1000000)` | g1f05x9eu8044w4jyd3wc8jq3s0z5nv3fmek4dfm 50000 | g1f05x9eu8044w4jyd3wc8jq3s0z5nv3fmek4dfm 50000 | PASS | - |
| 108 | treasury: a buy pays the new treasury | `b2: gnomes.Buy(115) send 40000000ugnot [gnokey]` | sold | went through | PASS | 30592049 |
| 109 | treasury: up by the price | `balance(treas) after - before` | 40000000 | 40000000 | PASS | - |
| 110 | treasury: the owner unchanged | `Owner()` | g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5 | g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5 | PASS | - |
| 111 | site: owner only | `p0: gnomes.SetSiteURL(https://gnogolf.xyz/) [gnokey]` | refused: only the owner | refused: gnomes: only the owner can do this | PASS | 4219738 |
| 112 | site: https only | `test1: gnomes.SetSiteURL(http://gnogolf.xyz/) [mcp]` | refused: a site link is https:// | refused: gnomes: a site link is https:// and up to 100 of a-z, A-Z, 0-9 and -._~/:%, ending with / | PASS | - |
| 113 | site: ends with / | `test1: gnomes.SetSiteURL(https://gnogolf.xyz) [mcp]` | refused: a site link is https:// | refused: gnomes: a site link is https:// and up to 100 of a-z, A-Z, 0-9 and -._~/:%, ending with / | PASS | - |
| 114 | site: no query | `test1: gnomes.SetSiteURL(https://gnogolf.xyz/?a=1) [mcp]` | refused: a site link is https:// | refused: gnomes: a site link is https:// and up to 100 of a-z, A-Z, 0-9 and -._~/:%, ending with / | PASS | - |
| 115 | metadata: no external_url before the site | `TokenMetadata("5") has external_url` | False | False | PASS | - |
| 116 | site: set | `test1: gnomes.SetSiteURL(https://gnogolf.xyz/) [mcp]` | set | went through | PASS | 6873914 |
| 117 | site: SiteURL() | `SiteURL()` | https://gnogolf.xyz/ | https://gnogolf.xyz/ | PASS | - |
| 118 | metadata: JSON | `TokenMetadata("5") name,external_url,tier` | Eppie Thistledown https://gnogolf.xyz/g/5/ common | Eppie Thistledown https://gnogolf.xyz/g/5/ common | PASS | - |
| 119 | token: TokenURI SVG | `TokenURI("5") parsed as XML` | svg | svg | PASS | - |
| 120 | token: image is TokenURI | `TokenMetadata("5").image == TokenURI("5")` | True | True | PASS | - |
| 121 | token: unminted | `TokenURI("9")` | error | error | PASS | - |
| 122 | token: Name, Symbol, TotalSupply | `Name() Symbol() TotalSupply()` | Gnogolf Gnomes GNOME 18 | Gnogolf Gnomes GNOME 18 | PASS | - |
| 123 | render: the collection | `Render("") [gno_render]` | contains The Miller | <untrusted_content kind="render" source="gno.land/r/nym-gnometest000/gnogolf/gnomes"> # Gnogolf Gnomes  The ball you play Gnogolf with, as a | PASS | - |
| 124 | render: a gnome on gnoweb | `GET /r/nym-gnometest000/gnogolf/gnomes:5` | contains Eppie Thistledown | <!doctype html> <html lang="en">   <head>   <meta charset="UTF-8" />   <meta name="viewport" content="width=device-width, initial-scale=1.0" | PASS | - |
| 125 | render: a player | `Render("<p1>")` | contains 5 | height: 0 data: # g1dljzv5g99k0zdflq7sqamvz9s8dtzgjaacthe4  - [#5](/r/nym-gnometest000/gnogolf/gnomes:5) - [#7](/r/nym-gnometest000/gnogolf/ | PASS | - |
| 126 | render: not found | `Render("nope")` | contains Not found | height: 0 data: # Not found  [The collection](/r/nym-gnometest000/gnogolf/gnomes) | PASS | - |
| 127 | portrait: every page draws its gnome | `Render("1") … Render("720") [qrender]: SVG parsed, <title> its name` | 720 - | 720 - | PASS | - |
| 128 | portrait: no two alike | `distinct SVGs of the 720` | 720 | 720 | PASS | - |
| 129 | portrait: the heaviest, #199 (epic) | `its SVG's bytes (6 KiB)` | ≤ 6144 | 6108 | PASS | - |
| 130 | portrait: b2 buys #199 | `b2: gnomes.Buy(199) send 333000000ugnot [gnokey]` | sold | went through | PASS | 30992921 |
| 131 | portrait: TokenURI is the page's portrait | `TokenURI("199") == its page's image` | True | True | PASS | - |
| 132 | portrait: TokenURI gas, the heaviest (#199) | `MsgRun TokenURI("199") - MsgRun OwnerOf` | ≤ 76000000 | 83082963 | FAIL | - |
| 133 | portrait: TokenURI gas, a Common (#5) | `MsgRun TokenURI("5") - MsgRun OwnerOf` | ≤ 76000000 | 47985530 | PASS | - |
| 134 | portrait: TokenURI gas, a Rare (#73) | `MsgRun TokenURI("73") - MsgRun OwnerOf` | ≤ 76000000 | 54901267 | PASS | - |
| 135 | portrait: TokenURI gas, an Epic (#94) | `MsgRun TokenURI("94") - MsgRun OwnerOf` | ≤ 76000000 | 58701442 | PASS | - |
| 136 | earned: free | `p1: gnomes.MintEarned(wizard) send 1ugnot [gnokey]` | refused: an earned gnome is free | refused: gnomes: an earned gnome is free: send nothing with it | PASS | 4395101 |
| 137 | earned: a kind | `p1: gnomes.MintEarned(dragon) [gnokey]` | refused: no such earned gnome | refused: gnomes: no such earned gnome: dragon | PASS | 4314660 |
| 138 | earned: not proven (Island Cup unpublished) | `p1: gnomes.MintEarned(pirate) [gnokey]` | refused: not proven: pirate | refused: gnomes: not proven: pirate | PASS | 7746513 |
| 139 | earned: not proven without a record | `p0: gnomes.MintEarned(wizard) [gnokey]` | refused: not proven: wizard | refused: gnomes: not proven: wizard | PASS | 8900905 |
| 140 | earned: p1 finished the Garden Cup (wizard) | `p1: gnomes.MintEarned(wizard) [gnokey]` | minted 1000001 | went through | PASS | 22845993 |
| 141 | earned: OwnerOf(1000001) | `OwnerOf("1000001")` | g1dljzv5g99k0zdflq7sqamvz9s8dtzgjaacthe4 | g1dljzv5g99k0zdflq7sqamvz9s8dtzgjaacthe4 | PASS | - |
| 142 | earned: once | `p1: gnomes.MintEarned(wizard) [gnokey]` | refused: already minted: wizard | refused: gnomes: already minted: wizard | PASS | 5221210 |
| 143 | earned: an ace on a par 2 is the cup at par (viking) | `p1: gnomes.MintEarned(viking) [gnokey]` | minted 1000002 | went through | PASS | 24022847 |
| 144 | earned: bound to its player | `p1: gnomes.TransferFrom(g1dljzv5g99k0zdflq7sqamvz9s8dtzgjaacthe4, g18qr5mft8rmgzha0ldh6pr80krt0egyvqjjkj39, 1000001) [gnokey]` | refused: bound to its player | refused: gnomes: an earned gnome is bound to its player: it cannot be transferred or approved | PASS | 12216725 |
| 145 | earned: no approval | `p1: gnomes.Approve(g18qr5mft8rmgzha0ldh6pr80krt0egyvqjjkj39, 1000001) [gnokey]` | refused: bound to its player | refused: gnomes: an earned gnome is bound to its player: it cannot be transferred or approved | PASS | 4380614 |
| 146 | earned: TokenMetadata kind | `TokenMetadata("1000001") tier,kind` | earned wizard | earned wizard | PASS | - |
| 147 | earned: equip it | `p1: gnomes.Equip(1000001) [gnokey]` | worn | went through | PASS | 10773863 |
| 148 | earned: Equipped | `Equipped(p1).tier` | earned | earned | PASS | - |
| 149 | earned: TokenURI SVG | `TokenURI("1000001") parsed as XML` | svg | svg | PASS | - |
| 150 | portrait: TokenURI gas, an earned gnome | `MsgRun TokenURI("1000001") - MsgRun OwnerOf` | ≤ 76000000 | 36363996 | PASS | - |
| 151 | close: owner only | `p0: gnomes.SetCloseAt(1791285183) [gnokey]` | refused: only the owner | refused: gnomes: only the owner can do this | PASS | 4295091 |
| 152 | close: in the future | `test1: gnomes.SetCloseAt(1791284573) [mcp]` | refused: a closing date is in the future | refused: gnomes: a closing date is in the future | PASS | - |
| 153 | close: set | `test1: gnomes.SetCloseAt(1791285183) [mcp]` | set | went through | PASS | 6847262 |
| 154 | close: never later | `test1: gnomes.SetCloseAt(1791285483) [mcp]` | refused: never later than | refused: gnomes: the closing date comes forward, never later than 2026-10-06 11:13 UTC | PASS | - |
| 155 | close: brought forward | `test1: gnomes.SetCloseAt(1791284644) [mcp]` | set | went through | PASS | 6857262 |
| 156 | close: CloseAt() | `CloseAt()` | 1791284644 | 1791284644 | PASS | - |
| 157 | close: buys refused | `p1: gnomes.Buy(1) send 30000000ugnot [gnokey]` | refused: the genesis sale closed on | refused: gnomes: the genesis sale closed on 2026-10-06 11:04 UTC | PASS | 15710796 |
| 158 | close: no wave for its ids | `test1: gnomes.AddWave(400, 410, 1791284644, 0) [mcp]` | refused: the genesis sale closed on | refused: gnomes: the genesis sale closed on 2026-10-06 11:04 UTC | PASS | - |
| 159 | close: no date after | `test1: gnomes.SetCloseAt(1791285244) [mcp]` | refused: the genesis sale closed on | refused: gnomes: the genesis sale closed on 2026-10-06 11:04 UTC | PASS | - |
| 160 | close: Collection genesis closed, sold | `Collection().series[0] closed,sold` | True 19 | True 19 | PASS | - |
| 161 | close: an unsold gnome closed | `Gnome("1").closed` | True | True | PASS | - |
| 162 | close: the auctioned one not closed | `Gnome("104").closed` | False | False | PASS | - |
| 163 | close: no new auction while one runs | `test1: gnomes.StartAuction(208, 1) [mcp]` | refused: an auction is under way | refused: gnomes: an auction is under way | PASS | - |
| 164 | auction: late bid, after the close | `b1: gnomes.Bid(104) send 856642500ugnot [gnokey]` | taken, the end moved | went through | PASS | 7851672 |
| 165 | auction: a late bid extends to 10 min | `Auction().end - the bid's block time` | 600 | 600 | PASS | - |
| 166 | auction: b2 refunded exactly | `balance(b2) after - before` | 815850000 | 815850000 | PASS | - |
| 167 | auction: escrow | `balance(realm)` | 856642500 | 856642500 | PASS | - |
| 168 | auction: not over | `p0: gnomes.Settle(104) [gnokey]` | refused: the auction is not over | refused: gnomes: the auction is not over | PASS | 4640837 |
| 169 | auction: over | `b2: gnomes.Bid(104) send 900000000ugnot [gnokey]` | refused: the auction is over | refused: gnomes: the auction is over | PASS | 4966823 |
| 170 | auction: over, min 0 | `Auction() over,min,settled` | True 0 False | True 0 False | PASS | - |
| 171 | auction: anyone settles | `p0: gnomes.Settle(104) [gnokey]` | settled | went through | PASS | 27254333 |
| 172 | auction: the treasury paid the bid | `balance(treas) after - before` | 856642500 | 856642500 | PASS | - |
| 173 | auction: the realm keeps nothing | `balance(realm)` | 0 | 0 | PASS | - |
| 174 | auction: the winner holds it | `OwnerOf("104")` | g1gkmfvg0v9l9hlqejsvesjerllp7cm6ghe6rap8 | g1gkmfvg0v9l9hlqejsvesjerllp7cm6ghe6rap8 | PASS | - |
| 175 | auction: settled | `Auction() settled,top` | True 856642500 | True 856642500 | PASS | - |
| 176 | portrait: TokenURI gas, the Legendary (#104) | `MsgRun TokenURI("104") - MsgRun OwnerOf` | ≤ 76000000 | 65527587 | PASS | - |
| 177 | auction: settles once | `p0: gnomes.Settle(104) [gnokey]` | refused: no auction of this gnome to settle | refused: gnomes: no auction of this gnome to settle | PASS | 4071049 |
| 178 | close: no auction once closed | `test1: gnomes.StartAuction(208, 1) [mcp]` | refused: the genesis sale closed on | refused: gnomes: the genesis sale closed on 2026-10-06 11:04 UTC | PASS | - |
| 179 | close: final supply | `Collection().series[0].sold, tiers sold` | 20 14,3,2,1 | 20 14,3,2,1 | PASS | - |
| 180 | owner: only the offered accepts | `p0: gnomes.Accept() [gnokey]` | refused: no transfer of the collection is offered to you | refused: gnomes: no transfer of the collection is offered to you | PASS | 4141007 |
| 181 | owner: Transfer offers | `test1: gnomes.Transfer(g18qr5mft8rmgzha0ldh6pr80krt0egyvqjjkj39) [mcp]` | offered | went through | PASS | 6283378 |
| 182 | owner: p0 accepts | `p0: gnomes.Accept() [gnokey]` | taken | went through | PASS | 6165743 |
| 183 | owner: moved, the treasury stays | `Owner() Treasury()` | g18qr5mft8rmgzha0ldh6pr80krt0egyvqjjkj39 g1f05x9eu8044w4jyd3wc8jq3s0z5nv3fmek4dfm | g18qr5mft8rmgzha0ldh6pr80krt0egyvqjjkj39 g1f05x9eu8044w4jyd3wc8jq3s0z5nv3fmek4dfm | PASS | - |
| 184 | owner: the old owner no more | `test1: gnomes.SetMintOpen(false) [mcp]` | refused: only the owner | refused: gnomes: only the owner can do this | PASS | - |

**183 passed, 1 failed** of 184 steps. Failed: 132.

## Seed mode and the shop's UI runs (2026-10-06, later)

Since this run the realm sells every tier at a fixed price (no auction: the
user's decision), and every player wears their best gnome unless they Equip
another (`Worn`). The scenario above was updated to match (a Legendary
bought at its price, one a wallet; the pause a plain switch; no escrow), and
`URIMAX` raised to the chain's 83.08M with room (finding 1). It has not been
replayed whole since.

`SEED=1 scripts/e2e-gnomes.sh` does the setup only, in about 30 seconds,
and leaves the chain running: the genesis, wave 1 open with an hour's
players' window, wave 2 in two days, the close in 30 days, p1 and b1 with a
record, p1 holding Commons 1 and 2 and Rare 73 (wearing 1), b1 Common 3.
`$WORK/seed.env` says where everything is.

`media/gnomes/shop-e2e.mjs` then drives the client (a dev server on that
chain, `NEXT_PUBLIC_GNOMES=1`) in the repo's headless Chrome, its wallet a
stand-in (`media/gnomes/wallet.mjs`) that signs each Adena call with gnokey
and a throwaway key, on that chain alone (it refuses an RPC that is not
this machine's). Every step checks the chain and is screenshotted, and every
screenshot is audited: no sideways scroll, nothing wider than the window, no
page error. 66 checks pass: the gallery at 320, 390, 768, 1280 and 1440 px;
the players' window and its cap said on the button; the order before the
wallet, its button off until both boxes are ticked; a cancel; a buy signed
and read back (the chain shows the owner) and its receipt; a Legendary at
its price; Adena failing without saying nothing went ("don't buy again"); my
gnomes and theirs; the picker's row, a gnome played for free, then shown to
everyone (Equip, and `Worn` says so); an earned gnome's page; a later wave's.
