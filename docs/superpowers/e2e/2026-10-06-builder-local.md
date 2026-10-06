# The Builder's holes, published for real on a local chain — 2026-10-06

Holes made with the Builder's own code, published with the command the
Builder prints, then read and played back from the chain: **208 steps pass,
none fail, 11 are noted**. Every publish lands with the id and sha the
Builder expects, inside the deposit and gas it bills, and the game reads,
replays and plays it. What's noted:

- **The bill overstates the deposit** (8 notes): its figures were measured on
  golf v1, and the Builder publishes to golf/v2 (finding 1).
- **The hostile holes stay listed** (3 notes): they're refused by the
  Builder's editor but not hidden from the lists, which nothing does yet
  (finding 2).

## The setup

- **Code**: branch `builder-e2e`, made from `worktree-hole-builder` at
  `b047fda` (`git worktree add -b builder-e2e ../builder-e2e
  worktree-hole-builder`). Builder code untouched; `web/node_modules` from
  `npm ci` (the census draws with three).
- **Chain**: `gnodev local` from the onyx toolchain (`chain/onyx`, as the
  README says), chain id `dev`, RPC `127.0.0.1:26757`, gnoweb `:8898`. Staged
  by `MAINNET=1 scripts/stage.sh nym-buildtest000` and deployed under that
  test name: physics, course, store, golf/v2.
- **Keys**: throwaway, in the run's own keybase: `test1` (gnodev's public
  deploy key: golf's owner), authors `a1` and `a2`, a player `pl`, each given
  1,000 GNOT at genesis. Nothing touched onyx, mainnet or a real key.
- **Replay**: `scripts/e2e-builder.sh` does all of it from nothing in a few
  minutes (keys, gnodev, stage, deploy, open publishing), then runs
  `scripts/e2e-builder.ts`, which writes the table below.

## How each hole goes through

Each hole goes through the Builder's own code paths, in the order an author
meets them:

1. **Checks**: `validate` (pipeline.ts, with the render census) must find no
   error.
2. **Test mode**: the id it will have is `holeId` from the chain's
   `Versions`. For each weather `plan` asks, up to the chain's current
   period, a holing round is found on builder.wasm's local chain (the search
   of `scripts/starters.ts`). It's replayed as a save is cut (`replay`, so
   `chainSplit`), and par comes from `suggestPar`.
3. **The Publish step, as `Publish.tsx` computes it**: the same readings
   (`publishing`, `successor` + `sameSources` of builder.wasm against the
   deployed realm, `versions`, `holes` for the first community hole, gas and
   storage prices, chain id), `check`'s name and note, `finalHex`,
   `proofsHold`, `shaOf`, `publishSteps`, which must say `ready`. Then
   `bill`, `gasFor` and `gnokeyPublish`.
4. **Published with the printed command**, run by sh as printed. The one
   change is where the key is: `-home <run's keybase>
   -insecure-password-stdin <key>` in place of `<your-key-name>`.
5. **Checked on chain**:
   - the `HolePublished` event's id and sha against the Builder's;
   - `Versions` and `Current` (what the page polls to say "landed");
   - the storage deposit against the bill's cap, the gas against
     `gasFor`'s ask, the bytes stored against `publishBytes`.
6. **Read as the game reads it**: listed in `Holes()` as a community hole;
   `HoleData` byte for byte the published data; `HoleState` (through the
   client's own checks) identical to builder.wasm's state of the same bytes
   at the same period.
7. **Played back**:
   - each test-mode proof replayed by the chain in its own weather
     (`SimulateRoundIn`), with the same strokes;
   - a round found in the weather of the moment, checked with
     `SimulateRoundAt`, then saved by the player `pl` with the game's own
     gnokey save (`gnokeyPlan`: a Reset, then each commit's `PlayRoundAt`);
   - `BestOf(id, "assisted", pl)` is that round's strokes.

The holes:

| hole | world | what it tests | result |
|---|---|---|---|
| plain lane | garden | four rails; the chain's first community hole, and `a1`'s first | all pass |
| a starter of each classic world | garden, island, town, mountain | the Builder's own `STARTERS[world].signature` (each world's slope, ground or hazard piece) | all pass, each in its world's weathers (island: storm too; mountain: snow) |
| heavy hole | garden | a 90×40 lane, posts added both sides of a clear middle until the Builder refused five in a row: 36 posts | its heaviest shot is **95% of the realm's maxShot**, its dearest commit 82% of the budget (the work limits bind before the 32 KB data limit: 1,591 bytes); holed in 2 to 3 strokes; all pass |
| named hole | island | a 40-character name and a 140-character note in Latin, Greek, Cyrillic, CJK and emoji, by a second author | all pass; the name and note the chain keeps are `check`'s, character for character |
| second version | garden | the plain lane with one post more | the same data again is refused by `publishSteps` ("same"); v1's proofs don't hold for it (`provedAs` null), so test mode runs again under `/v2`; published as v2; v1 archived (`next` = v2); the alias plays v2 |

## Findings

1. **The bill's storage figures are golf v1's, not golf/v2's; the deposit
   shown is 31–86% too high.** `publish.ts` takes `STORED` (overhead 3,929,
   newAuthor 385, version −933, firstCommunity 17,998) and `GAS` from the
   `z_builder_publish_*` filetests. Those publish to and measure
   **`gno.land/r/gnogolf/golf`** (their `// Storage:` lines), the v1 realm.
   The Builder publishes to `chain.realm`, **golf/v2**, which keeps its rows
   in `store`. store's collections are seeded at its deploy ("a first save
   never pays a whole new tree", store.gno), so a v2 publish writes much
   less:

   | | publishBytes | stored on golf/v2 | |
   |---|---|---|---|
   | the chain's first community hole (plain lane, new author) | 22,692 | 3,210 | −86% |
   | a new hole, author known (starters) | 4,363–4,400 | 2,713–2,765 | −37 to −38% |
   | heavy hole (1,591 B of data) | 5,525 | 3,798 | −31% |
   | new author, 160-rune name and note | 4,952 | 3,364 | −32% |
   | a second version | 3,424 | 1,681 | −51% |

   On v2, the fixed part of a new hole is about 2,200 to 2,300 bytes (stored
   less data, name and note); a version about 1,260. The first community
   hole with a new author adds about 550 bytes, not 18,383. The plain lane
   was billed **2.4961 GNOT** of deposit and paid **0.3210**; a starter is
   billed about 0.52 and pays about 0.27.

   It breaks nothing: the bill is a cap (`-max-deposit`), the chain takes
   only what is written, every publish went through, and none stored more
   than predicted (that would have failed its row). But an author is shown
   a deposit 1.6 to 7.8 times what they pay. Repro: `scripts/e2e-builder.sh`,
   the "What each publish stored and cost" table. Fix (for the Builder's
   owner, not done here): refit `STORED` on golf/v2 filetests.

   Gas is well fitted: each publish used 70–84% of `gasFor`'s ask, which
   asks 1.25 times the model by design.
2. **A hole that breaks the Builder's rules, published around it, is still
   listed.** Three holes the Builder refuses, published with a plain gnokey
   `PublishMine`:
   - the cup inside a post: `E3 The cup touches the scarecrow post`;
   - the cup walled in by a box of rails that touches nothing:
     `E4 The cup cannot be reached from the tee`;
   - two posts overlapping: `E13 The scarecrow post overlaps the scarecrow
     post`.

   For each:
   - the chain takes it: PublishMine checks the data, not the play, and
     builder.wasm's `check` agrees;
   - the Builder refuses to open it (`fromPublished`: "This hole breaks the
     Builder's rules: … It stays playable in the game.");
   - `listHoles` (the Builder's community list) still lists it, and so does
     `Holes()`, which the cups screen reads.

   The re-validation that would hide such a hole from the lists isn't in
   `worktree-hole-builder` at `b047fda`. Noted, not failed: those rows turn
   PASS once a list filters with the Builder's rules. Repro: the script's
   hostile section.
3. **Minor: the bill always charges a new author.** `Publish.tsx:106`
   passes `newAuthor: true` whoever publishes, so an author's second hole is
   billed for the 385 bytes of an index row it doesn't write. Small next to
   finding 1, and it goes away if `STORED` is refitted with the author known
   (`Versions` or `Holes()` tells whether the address has published).

## Steps

The table as the script wrote it. Gas is the gas the transaction used; a
read has none. `NOTE` is what's not there yet (finding 2) or a bill that
overstates (finding 1): said, not failed. The published hex, 370 to 1,591
bytes, is shown as `<n bytes>`.

| # | step | call | expected | got | result | gas |
|---|------|------|----------|-----|--------|-----|
| 1 | deploy | `addpkg gno.land/p/nym-buildtest000/gnogolf/physics` | deployed | deployed | PASS | 64945446 |
| 2 | deploy | `addpkg gno.land/p/nym-buildtest000/gnogolf/course` | deployed | deployed | PASS | 54958322 |
| 3 | deploy | `addpkg gno.land/r/nym-buildtest000/gnogolf/store` | deployed | deployed | PASS | 30706121 |
| 4 | deploy | `addpkg gno.land/r/nym-buildtest000/gnogolf/golf/v2` | deployed | deployed | PASS | 235397554 |
| 5 | publishing: closed at deploy | `a1: PublishMine(…)` | refused: golf: publishing community holes is not open yet | refused: golf: publishing community holes is not open yet | PASS | 5563865 |
| 6 | publishing: owner only | `a1: SetPublishing(…)` | refused: golf: only the owner can open or close publishing | refused: golf: only the owner can open or close publishing | PASS | 5300378 |
| 7 | publishing: the owner opens it | `test1: SetPublishing(true)` | opened | went through | PASS | 8503674 |
| 8 | publishing: Publishing() | `Publishing()` | (true bool) | (true bool) | PASS | - |
| 9 | plain lane: the Builder's checks | `validate(plain-lane) errors` | none | none | PASS | - |
| 10 | plain lane: test mode, clear | `holing round at period 5970985, replayed as a save is cut` | holed | holed in 1: -30.0000,8.0000 | PASS | - |
| 11 | plain lane: test mode, wind | `holing round at period 5963984, replayed as a save is cut` | holed | holed in 1: -36.0000,8.2500 | PASS | - |
| 12 | plain lane: test mode, rain | `holing round at period 5970981, replayed as a save is cut` | holed | holed in 1: -30.0000,7.2500 | PASS | - |
| 13 | plain lane: the Publish step | `publishSteps(readings)` | ready | ready | PASS | - |
| 14 | plain lane: the command it prints | `gnokey maketx call -pkgpath gno.land/r/nym-buildtest000/gnogolf/golf/v2 -func PublishMine -args plain-lane -args <370 bytes> -args '' -gas-fee 79219ugnot -gas-wanted 52812263 -max-deposit 2496120ugnot -broadcast -chainid` | a gnokey call | printed | PASS | - |
| 15 | plain lane: published (2.4961 GNOT deposit, 0.0792 fee billed) | `a1: the printed command` | went through | went through | PASS | 39495174 |
| 16 | plain lane: its id | `HolePublished hole` | g1kh6md6f3ssxy0mhdrz4fqujgraa32als9f3c6k/plain-lane/v1 | g1kh6md6f3ssxy0mhdrz4fqujgraa32als9f3c6k/plain-lane/v1 | PASS | - |
| 17 | plain lane: its sha | `HolePublished sha = shaOf(hex)` | 24b9600be989b1998d8adf39a05c457c582f1f1c7a38b94952b4c1872cd3863f | 24b9600be989b1998d8adf39a05c457c582f1f1c7a38b94952b4c1872cd3863f | PASS | - |
| 18 | plain lane: Versions | `Versions(plain-lane) last: id, v, sha` | g1kh6md6f3ssxy0mhdrz4fqujgraa32als9f3c6k/plain-lane/v1 1 24b9600be989b1998d8adf39a05c457c582f1f1c7a38b94952b4c1872cd3863f | g1kh6md6f3ssxy0mhdrz4fqujgraa32als9f3c6k/plain-lane/v1 1 24b9600be989b1998d8adf39a05c457c582f1f1c7a38b94952b4c1872cd3863f | PASS | - |
| 19 | plain lane: Current | `Current(plain-lane)` | g1kh6md6f3ssxy0mhdrz4fqujgraa32als9f3c6k/plain-lane/v1 | g1kh6md6f3ssxy0mhdrz4fqujgraa32als9f3c6k/plain-lane/v1 | PASS | - |
| 20 | plain lane: the deposit within the bill | `STORAGE FEE ≤ the bill's deposit (-max-deposit)` | ≤ 2496120 | 321000 | PASS | - |
| 21 | plain lane: the gas within the ask | `GAS USED ≤ gasFor` | ≤ 52812263 | 39495174 | PASS | - |
| 22 | plain lane: stored vs publishBytes | `STORAGE DELTA vs publishBytes (newAuthor true, first true)` | ≤ 22692 | 3210 (-19482, -86%) | NOTE | - |
| 23 | plain lane: listed | `Holes(): its row, official` | false | false | PASS | - |
| 24 | plain lane: HoleData | `HoleData(id) = the published bytes` | same | same | PASS | - |
| 25 | plain lane: HoleState | `HoleState(id) = builder.wasm's state of it` | same | same | PASS | - |
| 26 | plain lane: the chain replays the clear proof | `SimulateRoundIn(id, …, 5970985)` | holed in 1 | holed in 1 | PASS | - |
| 27 | plain lane: the chain replays the wind proof | `SimulateRoundIn(id, …, 5963984)` | holed in 1 | holed in 1 | PASS | - |
| 28 | plain lane: the chain replays the rain proof | `SimulateRoundIn(id, …, 5970981)` | holed in 1 | holed in 1 | PASS | - |
| 29 | plain lane: SimulateRoundAt | `SimulateRoundAt(id, -30.0000,8.0000, 5970985)` | holed in 1 | holed in 1 | PASS | - |
| 30 | plain lane: the player saves it (gnokeyPlan, 1 commit) | `pl: Reset, then PlayRoundAt as printed` | went through | went through | PASS | 58384871 |
| 31 | plain lane: the player's best | `BestOf(id, "assisted", pl)` | 1 | 1 | PASS | - |
| 32 | starter garden: the Builder's checks | `validate(garden-signature) errors` | none | none | PASS | - |
| 33 | starter garden: test mode, clear | `holing round at period 5970983, replayed as a save is cut` | holed | holed in 1: -30.0000,9.0000 | PASS | - |
| 34 | starter garden: test mode, wind | `holing round at period 5966687, replayed as a save is cut` | holed | holed in 1: -32.0000,8.5000 | PASS | - |
| 35 | starter garden: test mode, rain | `holing round at period 5970972, replayed as a save is cut` | holed | holed in 1: -30.0000,8.0000 | PASS | - |
| 36 | starter garden: the Publish step | `publishSteps(readings)` | ready | ready | PASS | - |
| 37 | starter garden: the command it prints | `gnokey maketx call -pkgpath gno.land/r/nym-buildtest000/gnogolf/golf/v2 -func PublishMine -args garden-signature -args <421 bytes> -args '' -gas-fee 83380ugnot -gas-wanted 55586217 -max-deposit 522281ugnot -broadcast -ch` | a gnokey call | printed | PASS | - |
| 38 | starter garden: published (0.5223 GNOT deposit, 0.0834 fee billed) | `a1: the printed command` | went through | went through | PASS | 41705226 |
| 39 | starter garden: its id | `HolePublished hole` | g1kh6md6f3ssxy0mhdrz4fqujgraa32als9f3c6k/garden-signature/v1 | g1kh6md6f3ssxy0mhdrz4fqujgraa32als9f3c6k/garden-signature/v1 | PASS | - |
| 40 | starter garden: its sha | `HolePublished sha = shaOf(hex)` | 476d75e490c6a1bc47aa34b67fc6cd601ef3a151f221b753a68290e002e89f8e | 476d75e490c6a1bc47aa34b67fc6cd601ef3a151f221b753a68290e002e89f8e | PASS | - |
| 41 | starter garden: Versions | `Versions(garden-signature) last: id, v, sha` | g1kh6md6f3ssxy0mhdrz4fqujgraa32als9f3c6k/garden-signature/v1 1 476d75e490c6a1bc47aa34b67fc6cd601ef3a151f221b753a68290e002e89f8e | g1kh6md6f3ssxy0mhdrz4fqujgraa32als9f3c6k/garden-signature/v1 1 476d75e490c6a1bc47aa34b67fc6cd601ef3a151f221b753a68290e002e89f8e | PASS | - |
| 42 | starter garden: Current | `Current(garden-signature)` | g1kh6md6f3ssxy0mhdrz4fqujgraa32als9f3c6k/garden-signature/v1 | g1kh6md6f3ssxy0mhdrz4fqujgraa32als9f3c6k/garden-signature/v1 | PASS | - |
| 43 | starter garden: the deposit within the bill | `STORAGE FEE ≤ the bill's deposit (-max-deposit)` | ≤ 522281 | 271400 | PASS | - |
| 44 | starter garden: the gas within the ask | `GAS USED ≤ gasFor` | ≤ 55586217 | 41705226 | PASS | - |
| 45 | starter garden: stored vs publishBytes | `STORAGE DELTA vs publishBytes (newAuthor false, first false)` | ≤ 4363 | 2714 (-1649, -38%) | NOTE | - |
| 46 | starter garden: listed | `Holes(): its row, official` | false | false | PASS | - |
| 47 | starter garden: HoleData | `HoleData(id) = the published bytes` | same | same | PASS | - |
| 48 | starter garden: HoleState | `HoleState(id) = builder.wasm's state of it` | same | same | PASS | - |
| 49 | starter garden: the chain replays the clear proof | `SimulateRoundIn(id, …, 5970983)` | holed in 1 | holed in 1 | PASS | - |
| 50 | starter garden: the chain replays the wind proof | `SimulateRoundIn(id, …, 5966687)` | holed in 1 | holed in 1 | PASS | - |
| 51 | starter garden: the chain replays the rain proof | `SimulateRoundIn(id, …, 5970972)` | holed in 1 | holed in 1 | PASS | - |
| 52 | starter garden: SimulateRoundAt | `SimulateRoundAt(id, -28.0000,9.5000, 5970985)` | holed in 1 | holed in 1 | PASS | - |
| 53 | starter garden: the player saves it (gnokeyPlan, 1 commit) | `pl: Reset, then PlayRoundAt as printed` | went through | went through | PASS | 68268458 |
| 54 | starter garden: the player's best | `BestOf(id, "assisted", pl)` | 1 | 1 | PASS | - |
| 55 | starter island: the Builder's checks | `validate(island-signature) errors` | none | none | PASS | - |
| 56 | starter island: test mode, clear | `holing round at period 5970985, replayed as a save is cut` | holed | holed in 1: -30.0000,8.5000 | PASS | - |
| 57 | starter island: test mode, wind | `holing round at period 5970284, replayed as a save is cut` | holed | holed in 1: -32.0000,8.5000 | PASS | - |
| 58 | starter island: test mode, rain | `holing round at period 5970981, replayed as a save is cut` | holed | holed in 1: -30.0000,7.5000 | PASS | - |
| 59 | starter island: test mode, storm | `holing round at period 5970975, replayed as a save is cut` | holed | holed in 1: -28.0000,8.7500 | PASS | - |
| 60 | starter island: the Publish step | `publishSteps(readings)` | ready | ready | PASS | - |
| 61 | starter island: the command it prints | `gnokey maketx call -pkgpath gno.land/r/nym-buildtest000/gnogolf/golf/v2 -func PublishMine -args island-signature -args <459 bytes> -args '' -gas-fee 84892ugnot -gas-wanted 56594334 -max-deposit 526350ugnot -broadcast -ch` | a gnokey call | printed | PASS | - |
| 62 | starter island: published (0.5263 GNOT deposit, 0.0849 fee billed) | `a1: the printed command` | went through | went through | PASS | 42621691 |
| 63 | starter island: its id | `HolePublished hole` | g1kh6md6f3ssxy0mhdrz4fqujgraa32als9f3c6k/island-signature/v1 | g1kh6md6f3ssxy0mhdrz4fqujgraa32als9f3c6k/island-signature/v1 | PASS | - |
| 64 | starter island: its sha | `HolePublished sha = shaOf(hex)` | 8ce58b04ef96e0f29047c8b2e1501f1b776f7894a21461590e08ef5877cd9a8a | 8ce58b04ef96e0f29047c8b2e1501f1b776f7894a21461590e08ef5877cd9a8a | PASS | - |
| 65 | starter island: Versions | `Versions(island-signature) last: id, v, sha` | g1kh6md6f3ssxy0mhdrz4fqujgraa32als9f3c6k/island-signature/v1 1 8ce58b04ef96e0f29047c8b2e1501f1b776f7894a21461590e08ef5877cd9a8a | g1kh6md6f3ssxy0mhdrz4fqujgraa32als9f3c6k/island-signature/v1 1 8ce58b04ef96e0f29047c8b2e1501f1b776f7894a21461590e08ef5877cd9a8a | PASS | - |
| 66 | starter island: Current | `Current(island-signature)` | g1kh6md6f3ssxy0mhdrz4fqujgraa32als9f3c6k/island-signature/v1 | g1kh6md6f3ssxy0mhdrz4fqujgraa32als9f3c6k/island-signature/v1 | PASS | - |
| 67 | starter island: the deposit within the bill | `STORAGE FEE ≤ the bill's deposit (-max-deposit)` | ≤ 526350 | 273900 | PASS | - |
| 68 | starter island: the gas within the ask | `GAS USED ≤ gasFor` | ≤ 56594334 | 42621691 | PASS | - |
| 69 | starter island: stored vs publishBytes | `STORAGE DELTA vs publishBytes (newAuthor false, first false)` | ≤ 4400 | 2739 (-1661, -38%) | NOTE | - |
| 70 | starter island: listed | `Holes(): its row, official` | false | false | PASS | - |
| 71 | starter island: HoleData | `HoleData(id) = the published bytes` | same | same | PASS | - |
| 72 | starter island: HoleState | `HoleState(id) = builder.wasm's state of it` | same | same | PASS | - |
| 73 | starter island: the chain replays the clear proof | `SimulateRoundIn(id, …, 5970985)` | holed in 1 | holed in 1 | PASS | - |
| 74 | starter island: the chain replays the wind proof | `SimulateRoundIn(id, …, 5970284)` | holed in 1 | holed in 1 | PASS | - |
| 75 | starter island: the chain replays the rain proof | `SimulateRoundIn(id, …, 5970981)` | holed in 1 | holed in 1 | PASS | - |
| 76 | starter island: the chain replays the storm proof | `SimulateRoundIn(id, …, 5970975)` | holed in 1 | holed in 1 | PASS | - |
| 77 | starter island: SimulateRoundAt | `SimulateRoundAt(id, -30.0000,8.5000, 5970985)` | holed in 1 | holed in 1 | PASS | - |
| 78 | starter island: the player saves it (gnokeyPlan, 1 commit) | `pl: Reset, then PlayRoundAt as printed` | went through | went through | PASS | 60890824 |
| 79 | starter island: the player's best | `BestOf(id, "assisted", pl)` | 1 | 1 | PASS | - |
| 80 | starter town: the Builder's checks | `validate(town-signature) errors` | none | none | PASS | - |
| 81 | starter town: test mode, clear | `holing round at period 5970982, replayed as a save is cut` | holed | holed in 1: -30.0000,8.5000 | PASS | - |
| 82 | starter town: test mode, rain | `holing round at period 5970972, replayed as a save is cut` | holed | holed in 1: -30.0000,7.5000 | PASS | - |
| 83 | starter town: test mode, wind | `holing round at period 5967341, replayed as a save is cut` | holed | holed in 1: -34.0000,8.2500 | PASS | - |
| 84 | starter town: the Publish step | `publishSteps(readings)` | ready | ready | PASS | - |
| 85 | starter town: the command it prints | `gnokey maketx call -pkgpath gno.land/r/nym-buildtest000/gnogolf/golf/v2 -func PublishMine -args town-signature -args <453 bytes> -args '' -gas-fee 83594ugnot -gas-wanted 55728987 -max-deposit 525470ugnot -broadcast -chai` | a gnokey call | printed | PASS | - |
| 86 | starter town: published (0.5255 GNOT deposit, 0.0836 fee billed) | `a1: the printed command` | went through | went through | PASS | 42041225 |
| 87 | starter town: its id | `HolePublished hole` | g1kh6md6f3ssxy0mhdrz4fqujgraa32als9f3c6k/town-signature/v1 | g1kh6md6f3ssxy0mhdrz4fqujgraa32als9f3c6k/town-signature/v1 | PASS | - |
| 88 | starter town: its sha | `HolePublished sha = shaOf(hex)` | 8bbe916bd896574c19d2e2c16a5b0bd9b69980a75e79121cfeffbe6aa827d6a8 | 8bbe916bd896574c19d2e2c16a5b0bd9b69980a75e79121cfeffbe6aa827d6a8 | PASS | - |
| 89 | starter town: Versions | `Versions(town-signature) last: id, v, sha` | g1kh6md6f3ssxy0mhdrz4fqujgraa32als9f3c6k/town-signature/v1 1 8bbe916bd896574c19d2e2c16a5b0bd9b69980a75e79121cfeffbe6aa827d6a8 | g1kh6md6f3ssxy0mhdrz4fqujgraa32als9f3c6k/town-signature/v1 1 8bbe916bd896574c19d2e2c16a5b0bd9b69980a75e79121cfeffbe6aa827d6a8 | PASS | - |
| 90 | starter town: Current | `Current(town-signature)` | g1kh6md6f3ssxy0mhdrz4fqujgraa32als9f3c6k/town-signature/v1 | g1kh6md6f3ssxy0mhdrz4fqujgraa32als9f3c6k/town-signature/v1 | PASS | - |
| 91 | starter town: the deposit within the bill | `STORAGE FEE ≤ the bill's deposit (-max-deposit)` | ≤ 525470 | 271300 | PASS | - |
| 92 | starter town: the gas within the ask | `GAS USED ≤ gasFor` | ≤ 55728987 | 42041225 | PASS | - |
| 93 | starter town: stored vs publishBytes | `STORAGE DELTA vs publishBytes (newAuthor false, first false)` | ≤ 4392 | 2713 (-1679, -38%) | NOTE | - |
| 94 | starter town: listed | `Holes(): its row, official` | false | false | PASS | - |
| 95 | starter town: HoleData | `HoleData(id) = the published bytes` | same | same | PASS | - |
| 96 | starter town: HoleState | `HoleState(id) = builder.wasm's state of it` | same | same | PASS | - |
| 97 | starter town: the chain replays the clear proof | `SimulateRoundIn(id, …, 5970982)` | holed in 1 | holed in 1 | PASS | - |
| 98 | starter town: the chain replays the rain proof | `SimulateRoundIn(id, …, 5970972)` | holed in 1 | holed in 1 | PASS | - |
| 99 | starter town: the chain replays the wind proof | `SimulateRoundIn(id, …, 5967341)` | holed in 1 | holed in 1 | PASS | - |
| 100 | starter town: SimulateRoundAt | `SimulateRoundAt(id, -30.0000,8.5000, 5970985)` | holed in 1 | holed in 1 | PASS | - |
| 101 | starter town: the player saves it (gnokeyPlan, 1 commit) | `pl: Reset, then PlayRoundAt as printed` | went through | went through | PASS | 62754518 |
| 102 | starter town: the player's best | `BestOf(id, "assisted", pl)` | 1 | 1 | PASS | - |
| 103 | starter mountain: the Builder's checks | `validate(mountain-signature) errors` | none | none | PASS | - |
| 104 | starter mountain: test mode, clear | `holing round at period 5970977, replayed as a save is cut` | holed | holed in 1: -30.0000,8.5000 | PASS | - |
| 105 | starter mountain: test mode, snow | `holing round at period 5970981, replayed as a save is cut` | holed | holed in 1: -2.0000,10.0000 | PASS | - |
| 106 | starter mountain: test mode, wind | `holing round at period 5967747, replayed as a save is cut` | holed | holed in 1: -40.0000,9.0000 | PASS | - |
| 107 | starter mountain: the Publish step | `publishSteps(readings)` | ready | ready | PASS | - |
| 108 | starter mountain: the command it prints | `gnokey maketx call -pkgpath gno.land/r/nym-buildtest000/gnogolf/golf/v2 -func PublishMine -args mountain-signature -args <457 bytes> -args '' -gas-fee 83805ugnot -gas-wanted 55869552 -max-deposit 525910ugnot -broadcast -` | a gnokey call | printed | PASS | - |
| 109 | starter mountain: published (0.5259 GNOT deposit, 0.0838 fee billed) | `a1: the printed command` | went through | went through | PASS | 42955637 |
| 110 | starter mountain: its id | `HolePublished hole` | g1kh6md6f3ssxy0mhdrz4fqujgraa32als9f3c6k/mountain-signature/v1 | g1kh6md6f3ssxy0mhdrz4fqujgraa32als9f3c6k/mountain-signature/v1 | PASS | - |
| 111 | starter mountain: its sha | `HolePublished sha = shaOf(hex)` | fd9a0faf3a5f60d79f98c0d938534a92a8e28638e6226db5a3b8a1b8174db424 | fd9a0faf3a5f60d79f98c0d938534a92a8e28638e6226db5a3b8a1b8174db424 | PASS | - |
| 112 | starter mountain: Versions | `Versions(mountain-signature) last: id, v, sha` | g1kh6md6f3ssxy0mhdrz4fqujgraa32als9f3c6k/mountain-signature/v1 1 fd9a0faf3a5f60d79f98c0d938534a92a8e28638e6226db5a3b8a1b8174db424 | g1kh6md6f3ssxy0mhdrz4fqujgraa32als9f3c6k/mountain-signature/v1 1 fd9a0faf3a5f60d79f98c0d938534a92a8e28638e6226db5a3b8a1b8174db424 | PASS | - |
| 113 | starter mountain: Current | `Current(mountain-signature)` | g1kh6md6f3ssxy0mhdrz4fqujgraa32als9f3c6k/mountain-signature/v1 | g1kh6md6f3ssxy0mhdrz4fqujgraa32als9f3c6k/mountain-signature/v1 | PASS | - |
| 114 | starter mountain: the deposit within the bill | `STORAGE FEE ≤ the bill's deposit (-max-deposit)` | ≤ 525910 | 276500 | PASS | - |
| 115 | starter mountain: the gas within the ask | `GAS USED ≤ gasFor` | ≤ 55869552 | 42955637 | PASS | - |
| 116 | starter mountain: stored vs publishBytes | `STORAGE DELTA vs publishBytes (newAuthor false, first false)` | ≤ 4396 | 2765 (-1631, -37%) | NOTE | - |
| 117 | starter mountain: listed | `Holes(): its row, official` | false | false | PASS | - |
| 118 | starter mountain: HoleData | `HoleData(id) = the published bytes` | same | same | PASS | - |
| 119 | starter mountain: HoleState | `HoleState(id) = builder.wasm's state of it` | same | same | PASS | - |
| 120 | starter mountain: the chain replays the clear proof | `SimulateRoundIn(id, …, 5970977)` | holed in 1 | holed in 1 | PASS | - |
| 121 | starter mountain: the chain replays the snow proof | `SimulateRoundIn(id, …, 5970981)` | holed in 1 | holed in 1 | PASS | - |
| 122 | starter mountain: the chain replays the wind proof | `SimulateRoundIn(id, …, 5967747)` | holed in 1 | holed in 1 | PASS | - |
| 123 | starter mountain: SimulateRoundAt | `SimulateRoundAt(id, -30.0000,8.5000, 5970985)` | holed in 1 | holed in 1 | PASS | - |
| 124 | starter mountain: the player saves it (gnokeyPlan, 1 commit) | `pl: Reset, then PlayRoundAt as printed` | went through | went through | PASS | 63286213 |
| 125 | starter mountain: the player's best | `BestOf(id, "assisted", pl)` | 1 | 1 | PASS | - |
| 126 | heavy hole: near the limits | `check(heavy): bytes, bound/maxShot, worst/budget, room/minShot` | 36 pieces | 1591 B of 32768; bound 95% of maxShot; worst 82% of budget; room 1000000 (min 800000) | PASS | - |
| 127 | heavy hole: the Builder's checks | `validate(heavy) errors` | none | none | PASS | - |
| 128 | heavy hole: test mode, clear | `holing round at period 5970985, replayed as a save is cut` | holed | holed in 3: 0.0000,10.0000 0.0000,10.0000 -28.0000,1.5000 | PASS | - |
| 129 | heavy hole: test mode, wind | `holing round at period 5962790, replayed as a save is cut` | holed | holed in 3: 4.0000,10.0000 14.8400,10.0000 25.7600,9.5000 | PASS | - |
| 130 | heavy hole: test mode, rain | `holing round at period 5970981, replayed as a save is cut` | holed | holed in 2: 10.0000,10.0000 -13.7400,8.0000 | PASS | - |
| 131 | heavy hole: the Publish step | `publishSteps(readings)` | ready | ready | PASS | - |
| 132 | heavy hole: the command it prints | `gnokey maketx call -pkgpath gno.land/r/nym-buildtest000/gnogolf/golf/v2 -func PublishMine -args heavy -args <1591 bytes> -args '' -gas-fee 141126ugnot -gas-wanted 94083479 -max-deposit 650100ugnot -broadcast -chainid dev` | a gnokey call | printed | PASS | - |
| 133 | heavy hole: published (0.6501 GNOT deposit, 0.1411 fee billed) | `a1: the printed command` | went through | went through | PASS | 65504289 |
| 134 | heavy hole: its id | `HolePublished hole` | g1kh6md6f3ssxy0mhdrz4fqujgraa32als9f3c6k/heavy/v1 | g1kh6md6f3ssxy0mhdrz4fqujgraa32als9f3c6k/heavy/v1 | PASS | - |
| 135 | heavy hole: its sha | `HolePublished sha = shaOf(hex)` | 66664c24e579476104875320a90df87afb0cd83481fa95bf3b81f1a3c7ae7356 | 66664c24e579476104875320a90df87afb0cd83481fa95bf3b81f1a3c7ae7356 | PASS | - |
| 136 | heavy hole: Versions | `Versions(heavy) last: id, v, sha` | g1kh6md6f3ssxy0mhdrz4fqujgraa32als9f3c6k/heavy/v1 1 66664c24e579476104875320a90df87afb0cd83481fa95bf3b81f1a3c7ae7356 | g1kh6md6f3ssxy0mhdrz4fqujgraa32als9f3c6k/heavy/v1 1 66664c24e579476104875320a90df87afb0cd83481fa95bf3b81f1a3c7ae7356 | PASS | - |
| 137 | heavy hole: Current | `Current(heavy)` | g1kh6md6f3ssxy0mhdrz4fqujgraa32als9f3c6k/heavy/v1 | g1kh6md6f3ssxy0mhdrz4fqujgraa32als9f3c6k/heavy/v1 | PASS | - |
| 138 | heavy hole: the deposit within the bill | `STORAGE FEE ≤ the bill's deposit (-max-deposit)` | ≤ 650100 | 379800 | PASS | - |
| 139 | heavy hole: the gas within the ask | `GAS USED ≤ gasFor` | ≤ 94083479 | 65504289 | PASS | - |
| 140 | heavy hole: stored vs publishBytes | `STORAGE DELTA vs publishBytes (newAuthor false, first false)` | ≤ 5525 | 3798 (-1727, -31%) | NOTE | - |
| 141 | heavy hole: listed | `Holes(): its row, official` | false | false | PASS | - |
| 142 | heavy hole: HoleData | `HoleData(id) = the published bytes` | same | same | PASS | - |
| 143 | heavy hole: HoleState | `HoleState(id) = builder.wasm's state of it` | same | same | PASS | - |
| 144 | heavy hole: the chain replays the clear proof | `SimulateRoundIn(id, …, 5970985)` | holed in 3 | holed in 3 | PASS | - |
| 145 | heavy hole: the chain replays the wind proof | `SimulateRoundIn(id, …, 5962790)` | holed in 3 | holed in 3 | PASS | - |
| 146 | heavy hole: the chain replays the rain proof | `SimulateRoundIn(id, …, 5970981)` | holed in 2 | holed in 2 | PASS | - |
| 147 | heavy hole: SimulateRoundAt | `SimulateRoundAt(id, 0.0000,10.0000;0.0000,10.0000;-28.0000,1.5000, 5970985)` | holed in 3 | holed in 3 | PASS | - |
| 148 | heavy hole: the player saves it (gnokeyPlan, 1 commit) | `pl: Reset, then PlayRoundAt as printed` | went through | went through | PASS | 103769082 |
| 149 | heavy hole: the player's best | `BestOf(id, "assisted", pl)` | 3 | 3 | PASS | - |
| 150 | named hole: within the Builder's limits | `[...title].length, [...note].length` | ≤40 ≤140 | ≤40 ≤140 | PASS | - |
| 151 | named hole: the Builder's checks | `validate(jardin-unicode) errors` | none | none | PASS | - |
| 152 | named hole: test mode, clear | `holing round at period 5970981, replayed as a save is cut` | holed | holed in 1: -30.0000,8.5000 | PASS | - |
| 153 | named hole: test mode, wind | `holing round at period 5964047, replayed as a save is cut` | holed | holed in 1: -40.0000,9.2500 | PASS | - |
| 154 | named hole: test mode, rain | `holing round at period 5970985, replayed as a save is cut` | holed | holed in 1: -30.0000,7.5000 | PASS | - |
| 155 | named hole: test mode, storm | `holing round at period 5970983, replayed as a save is cut` | holed | holed in 1: -32.0000,7.5000 | PASS | - |
| 156 | named hole: the Publish step | `publishSteps(readings)` | ready | ready | PASS | - |
| 157 | named hole: the command it prints | `gnokey maketx call -pkgpath gno.land/r/nym-buildtest000/gnogolf/golf/v2 -func PublishMine -args jardin-unicode -args <416 bytes> -args 'Un trou pour les patients : visez le coin, laissez rouler. 🌧 Bei Regen langsamer. 雨` | a gnokey call | printed | PASS | - |
| 158 | named hole: published (0.5447 GNOT deposit, 0.1553 fee billed) | `a2: the printed command` | went through | went through | PASS | 77376829 |
| 159 | named hole: its id | `HolePublished hole` | g18dskgdnvq9xzarks4zmdjmu733k5l27ecuwrnl/jardin-unicode/v1 | g18dskgdnvq9xzarks4zmdjmu733k5l27ecuwrnl/jardin-unicode/v1 | PASS | - |
| 160 | named hole: its sha | `HolePublished sha = shaOf(hex)` | 1c8f4db9c951adf70b2ac0425b23d76d93381322508205ea97062d8a20a8c410 | 1c8f4db9c951adf70b2ac0425b23d76d93381322508205ea97062d8a20a8c410 | PASS | - |
| 161 | named hole: Versions | `Versions(jardin-unicode) last: id, v, sha` | g18dskgdnvq9xzarks4zmdjmu733k5l27ecuwrnl/jardin-unicode/v1 1 1c8f4db9c951adf70b2ac0425b23d76d93381322508205ea97062d8a20a8c410 | g18dskgdnvq9xzarks4zmdjmu733k5l27ecuwrnl/jardin-unicode/v1 1 1c8f4db9c951adf70b2ac0425b23d76d93381322508205ea97062d8a20a8c410 | PASS | - |
| 162 | named hole: Current | `Current(jardin-unicode)` | g18dskgdnvq9xzarks4zmdjmu733k5l27ecuwrnl/jardin-unicode/v1 | g18dskgdnvq9xzarks4zmdjmu733k5l27ecuwrnl/jardin-unicode/v1 | PASS | - |
| 163 | named hole: the deposit within the bill | `STORAGE FEE ≤ the bill's deposit (-max-deposit)` | ≤ 544720 | 336400 | PASS | - |
| 164 | named hole: the gas within the ask | `GAS USED ≤ gasFor` | ≤ 103516260 | 77376829 | PASS | - |
| 165 | named hole: stored vs publishBytes | `STORAGE DELTA vs publishBytes (newAuthor true, first false)` | ≤ 4952 | 3364 (-1588, -32%) | NOTE | - |
| 166 | named hole: listed | `Holes(): its row, official` | false | false | PASS | - |
| 167 | named hole: HoleData | `HoleData(id) = the published bytes` | same | same | PASS | - |
| 168 | named hole: HoleState | `HoleState(id) = builder.wasm's state of it` | same | same | PASS | - |
| 169 | named hole: the chain replays the clear proof | `SimulateRoundIn(id, …, 5970981)` | holed in 1 | holed in 1 | PASS | - |
| 170 | named hole: the chain replays the wind proof | `SimulateRoundIn(id, …, 5964047)` | holed in 1 | holed in 1 | PASS | - |
| 171 | named hole: the chain replays the rain proof | `SimulateRoundIn(id, …, 5970985)` | holed in 1 | holed in 1 | PASS | - |
| 172 | named hole: the chain replays the storm proof | `SimulateRoundIn(id, …, 5970983)` | holed in 1 | holed in 1 | PASS | - |
| 173 | named hole: SimulateRoundAt | `SimulateRoundAt(id, -30.0000,7.5000, 5970985)` | holed in 1 | holed in 1 | PASS | - |
| 174 | named hole: the player saves it (gnokeyPlan, 1 commit) | `pl: Reset, then PlayRoundAt as printed` | went through | went through | PASS | 67647376 |
| 175 | named hole: the player's best | `BestOf(id, "assisted", pl)` | 1 | 1 | PASS | - |
| 176 | named hole: the note as kept | `Versions(…).note = check's note` | Un trou pour les patients : visez le coin, laissez rouler. 🌧 Bei Regen langsamer. 雨の日は遅い。 Καλή τύχη! Удачи — ¡suerte! 🍄🍄🍄 ok | Un trou pour les patients : visez le coin, laissez rouler. 🌧 Bei Regen langsamer. 雨の日は遅い。 Καλή τύχη! Удачи — ¡suerte! 🍄🍄🍄 ok | PASS | - |
| 177 | named hole: the name as kept | `Holes() name = check's name` | Le jardin des gnomes 🌷 庭のノーム ⛳ Ωμέγα | Le jardin des gnomes 🌷 庭のノーム ⛳ Ωμέγα | PASS | - |
| 178 | second version: the same data again | `publishSteps, v1's data` | same | same | PASS | - |
| 179 | second version: v1's proofs do not hold | `provedAs(v1's proofs, the new key)` | null | null | PASS | - |
| 180 | second version: the Builder's checks | `validate(plain-lane) errors` | none | none | PASS | - |
| 181 | second version: test mode, clear | `holing round at period 5970985, replayed as a save is cut` | holed | holed in 1: -2.0000,7.0000 | PASS | - |
| 182 | second version: test mode, wind | `holing round at period 5970796, replayed as a save is cut` | holed | holed in 1: -40.0000,8.7500 | PASS | - |
| 183 | second version: test mode, rain | `holing round at period 5970974, replayed as a save is cut` | holed | holed in 1: -2.0000,6.2500 | PASS | - |
| 184 | second version: the Publish step | `publishSteps(readings)` | ready | ready | PASS | - |
| 185 | second version: the command it prints | `gnokey maketx call -pkgpath gno.land/r/nym-buildtest000/gnogolf/golf/v2 -func PublishMine -args plain-lane -args <418 bytes> -args '' -gas-fee 81749ugnot -gas-wanted 54499043 -max-deposit 418991ugnot -broadcast -chainid ` | a gnokey call | printed | PASS | - |
| 186 | second version: published (0.4190 GNOT deposit, 0.0817 fee billed) | `a1: the printed command` | went through | went through | PASS | 45640813 |
| 187 | second version: its id | `HolePublished hole` | g1kh6md6f3ssxy0mhdrz4fqujgraa32als9f3c6k/plain-lane/v2 | g1kh6md6f3ssxy0mhdrz4fqujgraa32als9f3c6k/plain-lane/v2 | PASS | - |
| 188 | second version: its sha | `HolePublished sha = shaOf(hex)` | fe84b617c738409dcfa88ef51a5fc8759f59ce3db816c57042f0d165b53f9dd8 | fe84b617c738409dcfa88ef51a5fc8759f59ce3db816c57042f0d165b53f9dd8 | PASS | - |
| 189 | second version: Versions | `Versions(plain-lane) last: id, v, sha` | g1kh6md6f3ssxy0mhdrz4fqujgraa32als9f3c6k/plain-lane/v2 2 fe84b617c738409dcfa88ef51a5fc8759f59ce3db816c57042f0d165b53f9dd8 | g1kh6md6f3ssxy0mhdrz4fqujgraa32als9f3c6k/plain-lane/v2 2 fe84b617c738409dcfa88ef51a5fc8759f59ce3db816c57042f0d165b53f9dd8 | PASS | - |
| 190 | second version: Current | `Current(plain-lane)` | g1kh6md6f3ssxy0mhdrz4fqujgraa32als9f3c6k/plain-lane/v2 | g1kh6md6f3ssxy0mhdrz4fqujgraa32als9f3c6k/plain-lane/v2 | PASS | - |
| 191 | second version: the deposit within the bill | `STORAGE FEE ≤ the bill's deposit (-max-deposit)` | ≤ 418991 | 168100 | PASS | - |
| 192 | second version: the gas within the ask | `GAS USED ≤ gasFor` | ≤ 54499043 | 45640813 | PASS | - |
| 193 | second version: stored vs publishBytes | `STORAGE DELTA vs publishBytes (newAuthor false, first false)` | ≤ 3424 | 1681 (-1743, -51%) | NOTE | - |
| 194 | second version: listed | `Holes(): its row, official` | false | false | PASS | - |
| 195 | second version: HoleData | `HoleData(id) = the published bytes` | same | same | PASS | - |
| 196 | second version: HoleState | `HoleState(id) = builder.wasm's state of it` | same | same | PASS | - |
| 197 | second version: the chain replays the clear proof | `SimulateRoundIn(id, …, 5970985)` | holed in 1 | holed in 1 | PASS | - |
| 198 | second version: the chain replays the wind proof | `SimulateRoundIn(id, …, 5970796)` | holed in 1 | holed in 1 | PASS | - |
| 199 | second version: the chain replays the rain proof | `SimulateRoundIn(id, …, 5970974)` | holed in 1 | holed in 1 | PASS | - |
| 200 | second version: SimulateRoundAt | `SimulateRoundAt(id, -2.0000,7.0000, 5970985)` | holed in 1 | holed in 1 | PASS | - |
| 201 | second version: the player saves it (gnokeyPlan, 1 commit) | `pl: Reset, then PlayRoundAt as printed` | went through | went through | PASS | 57853677 |
| 202 | second version: the player's best | `BestOf(id, "assisted", pl)` | 1 | 1 | PASS | - |
| 203 | second version: v1 archived | `Versions: v1's next` | g1kh6md6f3ssxy0mhdrz4fqujgraa32als9f3c6k/plain-lane/v2 | g1kh6md6f3ssxy0mhdrz4fqujgraa32als9f3c6k/plain-lane/v2 | PASS | - |
| 204 | second version: the alias plays v2 | `Current(plain-lane)` | g1kh6md6f3ssxy0mhdrz4fqujgraa32als9f3c6k/plain-lane/v2 | g1kh6md6f3ssxy0mhdrz4fqujgraa32als9f3c6k/plain-lane/v2 | PASS | - |
| 205 | hostile, cup in a wall: the Builder refuses it | `validate(cup-in-wall) errors` | an error | E3 The cup touches the scarecrow post at (28.5, 7.5) | PASS | - |
| 206 | hostile, cup in a wall: the chain takes it | `a2: PublishMine, around the Builder` | went through | went through | PASS | 44729067 |
| 207 | hostile, cup in a wall: PublishMine's own checks pass | `builder.wasm check()` | ok | ok | PASS | - |
| 208 | hostile, cup in a wall: the Builder will not open it | `fromPublished(HoleData(id))` | refused, its rules named | This hole breaks the Builder's rules: The cup touches the scarecrow post at (28.5, 7.5). It stays playable in the game. | PASS | - |
| 209 | hostile, cup in a wall: hidden from the lists | `listHoles(Holes()) after re-validation` | hidden | listed (no re-validation in the lists yet) | NOTE | - |
| 210 | hostile, unreachable cup: the Builder refuses it | `validate(walled-cup) errors` | an error | E4 The cup cannot be reached from the tee | PASS | - |
| 211 | hostile, unreachable cup: the chain takes it | `a2: PublishMine, around the Builder` | went through | went through | PASS | 53580733 |
| 212 | hostile, unreachable cup: PublishMine's own checks pass | `builder.wasm check()` | ok | ok | PASS | - |
| 213 | hostile, unreachable cup: the Builder will not open it | `fromPublished(HoleData(id))` | refused, its rules named | This hole breaks the Builder's rules: The cup cannot be reached from the tee. It stays playable in the game. | PASS | - |
| 214 | hostile, unreachable cup: hidden from the lists | `listHoles(Holes()) after re-validation` | hidden | listed (no re-validation in the lists yet) | NOTE | - |
| 215 | hostile, overlapping pieces: the Builder refuses it | `validate(overlap) errors` | an error | E13 The scarecrow post overlaps the scarecrow post at (12, 4) | PASS | - |
| 216 | hostile, overlapping pieces: the chain takes it | `a2: PublishMine, around the Builder` | went through | went through | PASS | 44620468 |
| 217 | hostile, overlapping pieces: PublishMine's own checks pass | `builder.wasm check()` | ok | ok | PASS | - |
| 218 | hostile, overlapping pieces: the Builder will not open it | `fromPublished(HoleData(id))` | refused, its rules named | This hole breaks the Builder's rules: The scarecrow post overlaps the scarecrow post at (12, 4). It stays playable in the game. | PASS | - |
| 219 | hostile, overlapping pieces: hidden from the lists | `listHoles(Holes()) after re-validation` | hidden | listed (no re-validation in the lists yet) | NOTE | - |

**208 passed, 0 failed, 11 noted** of 219 steps.

### What each publish stored and cost

| hole | id | data B | name+note runes | v | new author | first community | stored B | publishBytes | Δ | deposit cap (bill) | deposit paid | gasFor | gas used | used/asked |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| plain lane | `g1kh6md6…/plain-lane/v1` | 370 | 10 | 1 | true | true | 3210 | 22692 | -19482 | 2496120 | 321000 | 52812263 | 39495174 | 75% |
| starter garden | `g1kh6md6…/garden-signature/v1` | 421 | 13 | 1 | false | false | 2714 | 4363 | -1649 | 522281 | 271400 | 55586217 | 41705226 | 75% |
| starter island | `g1kh6md6…/island-signature/v1` | 459 | 12 | 1 | false | false | 2739 | 4400 | -1661 | 526350 | 273900 | 56594334 | 42621691 | 75% |
| starter town | `g1kh6md6…/town-signature/v1` | 453 | 10 | 1 | false | false | 2713 | 4392 | -1679 | 525470 | 271300 | 55728987 | 42041225 | 75% |
| starter mountain | `g1kh6md6…/mountain-signature/v1` | 457 | 10 | 1 | false | false | 2765 | 4396 | -1631 | 525910 | 276500 | 55869552 | 42955637 | 77% |
| heavy hole | `g1kh6md6…/heavy/v1` | 1591 | 5 | 1 | false | false | 3798 | 5525 | -1727 | 650100 | 379800 | 94083479 | 65504289 | 70% |
| named hole | `g18dskgd…/jardin-unicode/v1` | 416 | 160 | 1 | true | false | 3364 | 4952 | -1588 | 544720 | 336400 | 103516260 | 77376829 | 75% |
| second version | `g1kh6md6…/plain-lane/v2` | 418 | 10 | 2 | false | false | 1681 | 3424 | -1743 | 418991 | 168100 | 54499043 | 45640813 | 84% |
