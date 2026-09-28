# Deploy v1, Phase 4: the pearl rehearsal (2026-09-25)

This rehearsal took the exact artefacts of the pearl deploy and ran them on a throwaway chain built from the pearl tag, measuring every cost. The artefacts are the three packages from `scripts/stage.sh nym-golfer000`, and the 74 holes of `data/holes.txt` as data. The run deployed, published and played them, then checked the owner functions. Nothing was broadcast to pearl.

There were four runs. The **first** ran on the code of `162a6e9`. The **second** ran on HEAD `82c7196`, which is `62488e6` ("golf before the freeze") plus a `cdp.mjs` change that has no effect on the chain. The **third** ran on HEAD `3432d52` ("shared indexes make a first finish cost about 3.4 KB; board render bounded for any polygon"). The **fourth**, which this page reports, ran on the final code, HEAD `3858f19`: the new physics, the gas bound per shot (strokes stop at `MaxWork`, publishing refuses a hole whose shot bound exceeds 1.3e9), and the final golf. It started from a fresh genesis and followed run 3's method step for step. All the numbers below come from run 4. Run 3's numbers are given next to them, and run 1's where they help. The owner handover (`Transfer`/`Accept`) and the reading of pearl's own values come from run 1 only.

A **fifth** run (2026-09-27) ran on the current code, HEAD `f1bef35` plus the uncommitted work (the only chain change in it is one line of golf's `cleanText`). It has its own section, [Run 5 (current code)](#run-5-current-code). The projection and the command list for pearl now follow run 5; the run-4 tables are kept as history.

A **sixth** run (2026-09-27, evening) ran on the code about to deploy (publishing switch, Hide's index, each shot's work and a commit's fixed gas in the reads). Only golf moved; the projection and step 5 below follow it.

## The rehearsal chain

- **Binary:** `gnoland` built from `chain/pearl` = `c4c72fdd288c` and installed as `~/.cache/gno-toolchains/pearl/gnoland`. This is the tag that the pearl `gno` in `~/.cache/gno-toolchains/pearl/` is built from. It is not gnodev.
- **Genesis:** a GNOROOT whose `examples/` holds exactly pearl's package set. Pearl's `FILTERED_PACKAGES`, from `misc/deployments/pearl.gno.land/gen-genesis.sh`, resolved with `gno tool deplist -test-dep`, give 85 packages, the same count as pearl. None of them are ours. Chain id `test-rehearsal`, RPC `127.0.0.1:26767`, P2P `:26766`, run under `nice`, with `-skip-genesis-sig-verification`. One difference from pearl: `names.Enable` (namespace enforcement) is not set at genesis. The name was registered first anyway, as it will be on pearl.
- **Fresh start for runs 2, 3 and 4:** the same `genesis.json` and node secrets as run 1. Before each run the `db/`, the `wal/` and `priv_validator_state.json` were deleted, so the chain replayed its genesis from height 0. Start line: `nice gnoland start -chainid test-rehearsal -genesis node/genesis.json -data-dir node/gnoland-data -gnoroot-dir pearlroot -skip-genesis-sig-verification`.
- **Params:** every VM and auth param that prices gas matches pearl. Both were read live in run 1: `preprocess_gas_per_byte` 1250, the read/write depth costs, `iter_next_cost_flat` 1000, `tx_size_cost_per_byte` 10, the sig costs, gas price `1ugnot/1000gas`, block max gas 3e9, `default_deposit` 100 GNOT, `code_submission_policy` permissionless.
  - One param differs on purpose: `storage_price` is `1ugnot` in the genesis, against pearl's `100ugnot` (see problem 5).
  - Gas does not depend on the storage price, and each transaction's `StorageDepositEvent` gives its exact byte count. Every deposit below is those bytes × pearl's 100 ugnot.
- **gnomcp:** profile `rehearsal`, with two agent keys: `default` (`g1sz0h…5ent`, the deployer and owner) and `heir` (`g10g3j…8ctx`, the non-owner and the second player). Both keys are funded at genesis.
  - In runs 2 to 4 every write went through gnomcp. A small stdio driver (`mcp.py`, in the session scratch) started `gnomcp` and sent it `tools/call` requests. It read each file body from the staged tree or from the generated scripts on disk. gnomcp signed with its own keystore. No gnokey was used, and no key material was touched.
  - Because the bodies were read from disk, the run-1 risk of a mistyped hand copy (problem 9) is gone.
- **Byte identity:** every `.gno` file of the three packages was read back over `vm/qfile` and compared with the staged tree using `cmp`. All 15 are byte-identical (runs 2 to 4). The three `gnomod.toml` differ only because the chain rewrites them at addpkg.

## The numbers

"Deposit" is pearl GNOT at 100 ugnot a byte. "Gas" is the gas used. At `1ugnot/1000gas`, the fee floor is gas ÷ 1000 ugnot.

### Name and code

`scripts/stage.sh nym-golfer000` staged the packages and linted them with the pearl `gno lint`, which passed. Source sizes: physics 62,914 B, course 52,507 B, golf 124,141 B (run 3: 51,025 / 50,762 / 120,075).

| Step | Gas | Bytes | Deposit | Run 3 | Run 1 |
|---|---|---|---|---|---|
| `namereg/v1.Register("nym-golfer000")` | 25.4M | 3,326 | 0.33 GNOT | same | same |
| addpkg `p/nym-golfer000/physics` | 90.1M | 43,170 | 4.32 GNOT | 74.5M, 42,182 (4.22) | 72.4M, 4.34 |
| addpkg `p/nym-golfer000/course` | 80.9M | 45,806 | 4.58 GNOT | 78.2M, 44,870 (4.49) | 76.7M, 4.40 |
| addpkg `r/nym-golfer000/golf` (its init and globals included) | 196.2M | 206,282 | **20.63 GNOT** | 190.2M, 203,451 (20.35) | 164.6M, 15.69 |
| **Name + code** | 392.6M | 298,584 | **29.86 GNOT** | 368.4M, 293,829 (29.38) | 339.1M, 24.76 |

The new physics adds 11.9 KB of source, which costs 15.6M more gas on its addpkg (the preprocess charge is 1,250 gas a byte) but only 988 bytes of storage. golf grew by 2,831 bytes (+0.28 GNOT) for the gas bound and the final fixes.

`Owner()` after the golf addpkg returns the deployer (`g1sz0h…5ent`), because golf's init captures `OriginCaller`.

### The 74 holes as data

The scripts come from `REALM=gno.land/r/nym-golfer000/golf OUT=<scratch> scripts/publishdata.sh`, at 7 holes a script. Each script was run with `gno_run`:

| Script | Holes | Gas | Bytes | Deposit | Run 3 (gas, bytes) | Run 1 bytes |
|---|---|---|---|---|---|---|
| publish-01 | extras/10, extras/16, garden/1–5 | 633.9M | 47,862 | 4.79 | 632.7M, same | 62,987 |
| publish-02 | garden/6–12 | 484.4M | 32,208 | 3.22 | 483.2M, same | 60,908 |
| publish-03 | garden/13–18, island/1 | 709.0M | 35,357 | 3.54 | 707.9M, same | 64,057 |
| publish-04 | island/2–8 | 616.3M | 34,449 | 3.44 | 615.1M, same | 63,149 |
| publish-05 | island/9–15 | 775.2M | 65,942 | 6.59 | 774.1M, same | 94,582 |
| publish-06 | island/16–18, mountain/1–4 | 743.8M | 35,650 | 3.56 | 742.6M, same | 64,350 |
| publish-07 | mountain/5–11 | **859.7M** | 53,102 | 5.31 | 858.5M, same | 82,060 |
| publish-08 | mountain/12–18 | 791.6M | 37,296 | 3.73 | 790.4M, same | 66,218 |
| publish-09 | town/1–7 | 681.7M | 34,494 | 3.45 | 680.6M, same | 78,059 |
| publish-10 | town/8–14 | 739.9M | 59,326 | 5.93 | 738.8M, same | 73,796 |
| publish-11 | town/15–18 | 254.7M | 18,675 | 1.87 | 253.9M, 18,679 | 48,806 |
| **74 holes** | | **7,290.2M** | **454,361** | **45.44 GNOT** | 7,277.8M, 454,365 (45.44) | 758,972 (75.90 GNOT) |

- A hole takes **6,140 bytes on average, which is 0.61 GNOT**, as in run 3 (10,256 in run 1). The generated scripts are byte-identical to run 3's except publish-11 and `verify.gno`: town/17 is now "T-Junction" (it was "Night Market"), 4 bytes shorter. The gas rose by 1.1–1.2M a script (0.2%), to about 98.5M a hole.
- The first script is the heaviest per hole because it also creates the course-wide trees.
- `verify.gno`, simulated, printed **"74 slots hold their data; missing or other:"** with nothing after it. It used 346.2M gas (345.7M in run 3).

### Playing

These were real transactions, on the published holes, in period 5967999. Run 3's plans (`0,7.5` on extras/10, `332,9.25` on extras/16) no longer hole under the new physics, so run 4 used the plans of the current `scripts/hole-bests.json`: `14,8.5` on extras/10 and `22,7.5` on extras/16. Both holed in 1. Simulated in the same period, the plans of garden/3, garden/14, island/1, mountain/5 and town/1 also holed in 1, and garden/2's in 2. `default` is the named deployer; `heir` has no name. The calls ran in run 3's order: first finish, second hole, Reset, replay, new player, MsgRun.

| Call | Gas | Bytes | Deposit | Run 3 | Run 1 |
|---|---|---|---|---|---|
| `PlayRoundAt(extras/10/v1, "14,8.5")` by `default`, holed in 1. This is the first finish on the course: it creates the mode's standing and ranking rows and the player's first rows in the shared indexes. | 50.7M | 5,404 | **0.54 GNOT** | 47.5M, 5,403 | 16,900 (1.69) |
| `PlayRoundAt(extras/16/v1, "22,7.5")` by `default`, holed in 1: the same player's first finish on a second hole, and the first finish on that hole | 51.3M | 3,405 | 0.34 GNOT | 58.6M, 3,406 | 6,039 (0.60), not the first on its hole |
| `Reset(extras/10/v1)` | 13.7M | −1,513 (refunded) | −0.15 GNOT | 13.5M, −1,512 | −2,155 |
| `PlayRoundAt(extras/10/v1)` again: a replay with the same score | 48.5M | 1,525 | 0.15 GNOT | 45.5M, 1,524 | 2,161 (0.22) |
| `PlayRoundAt(extras/10/v1)` by `heir`: a new player's first finish on a hole someone has already finished | 49.4M | 3,312 | 0.33 GNOT | 46.2M, 3,311 | 6,561 (0.66) |
| A MsgRun of `Reset` + `PlayRoundAt(extras/10/v1)` in one transaction, as the client records a replay | 58.6M | −6 | ~0 | 55.3M, −6 | 77.1M, 6 |

The storage is the same as in run 3 to within a byte: a first finish costs 3.3–3.4 KB whoever is first on the hole, and 5.4 KB for the course's very first finish in a mode. The gas of a round now depends on its shot more than on the realm: extras/10's new shot costs 3M more than run 3's, and extras/16's new shot 7M less. No call used more than 58.6M. A replay after a Reset still costs as much as the Reset refunds, 0.15 GNOT.

### Owner functions (simulated)

| Call | Signer | Result |
|---|---|---|
| `SetPlayURL("https://gnogolf.xyz/")` | `default` (owner) | ok, 11.6M gas (run 3: 11.5M) |
| `SetSuccessor("gno.land/r/nym-golfer000/golf2")` | `default` (owner) | ok, 11.8M gas (run 3: 11.7M) |
| `SetPlayURL("https://evil.example/")` | `heir` | **refused**: "golf: only the owner can move the play link" |
| `SetSuccessor("gno.land/r/nym-golfer000/golf2")` | `heir` | **refused**: "golf: only the owner can name a successor" |

These calls were simulated only, so `Successor()` is still `""` afterwards. The hub page already links to `https://gnogolf.xyz/` (the default `playURL`), so **pearl does not need `SetPlayURL`**. The command list keeps it as an optional step, for use if the site moves.

Run 1 checked the handover (`Transfer(heir)` → `Accept()` → back again), and every step worked as specified. Pearl does not need it: the user deploys golf with their own key, so golf's init makes the user the owner.

### The web client

A second dev server ran `next dev -p 3310` from a fresh copy of `web/`, sharing its `node_modules`, with `NEXT_PUBLIC_RPC=http://127.0.0.1:26767` and `NEXT_PUBLIC_REALM=gno.land/r/nym-golfer000/golf`.

Headless Chrome ran through `media/lib/cdp.mjs`: muted, one browser, killed after the test. `chainUp()` now polls the realm from `REALM` and succeeded against the namespaced chain.

- **extras/10, island/6, mountain/7 and town/18** each loaded, drew, and replayed a chain-simulated shot (the first shot of each hole's best plan in the current `hole-bests.json`). extras/10 (`14,8.5`) and mountain/7 (`8,8`) were holed in one; island/6 and town/18 have multi-shot plans. There was no page error (runs 2 to 4).
- The page talked only to `127.0.0.1:3310`, `127.0.0.1:26767`, and Google Fonts.
- Screenshots: `media/rehearsal-{extras-10,island-6,mountain-7,town-18}.jpg`.

## Run 5 (current code)

Run 5 took the code as it stands after the leaderboards: the charged square roots in physics (`843df86`), the course and hole leaderboards, `Claim` and `SimulateRoundIn` (`d596aaa`), and the pre-deploy review fixes (`f1bef35`). It rebuilt the rehearsal chain from nothing, because run 4's `node/` was gone from the scratch.

### How it differs from run 4

- **The chain is built the same way.** The pearl `gnoland` (`c4c72fdd288c`) started with `-lazy` over a GNOROOT whose `examples/` holds pearl's 85 packages (pearl's `FILTERED_PACKAGES` through `gno tool deplist -test-dep`, one symlink per file), `-skip-genesis-sig-verification`, and the seven creator addresses funded. Chain id `test-rehearsal`, RPC `127.0.0.1:26767`, P2P `:26766`, under `nice`. `names.Enable` is still not set.
- **The storage price is pearl's own, 100 ugnot a byte.** Run 4 lowered it to 1 ugnot so gnomcp's 10 GNOT cap would pass. Run 5 did not need to: every deposit below is what the chain charged, not bytes × 100 worked out afterwards.
- **Every write went through gnokey, with pearl's command list as written.** The gnokey is the pearl tag's own (`go install …/gnokey@c4c72fdd288c`, into the scratch). Its keys are three throwaway keys made in the scratch for this run: `default` (the deployer and owner), `heir` (a second player), and `third` (a player funded by `default`, for the name taken in one transaction). No real key was used, and nothing was sent to pearl.
- **Byte identity:** the 15 `.gno` files read back over `vm/qfile` are byte-identical to the staged tree.

### Name and code

`scripts/stage.sh nym-golfer000` linted clean with the pearl `gno`. Source sizes: physics 66,788 B, course 53,903 B, golf 131,768 B (run 4: 62,914 / 52,507 / 124,141).

| Step | Gas | Bytes | Deposit | Run 4 |
|---|---|---|---|---|
| `namereg/v1.Register("nym-golfer000")` | 25.6M | 3,332 | 0.33 GNOT | 25.4M, 3,326 (0.33) |
| addpkg physics | 95.3M | 44,998 | 4.50 GNOT | 90.1M, 43,170 (4.32) |
| addpkg course | 83.0M | 47,823 | 4.78 GNOT | 80.9M, 45,806 (4.58) |
| addpkg golf | 206.7M | 211,748 | **21.17 GNOT** | 196.2M, 206,282 (20.63) |
| **Name + code** | 410.6M | 307,901 | **30.79 GNOT** | 392.6M, 298,584 (29.86) |

- The code costs 0.93 GNOT more than in run 4: physics +0.18 (its gas accounting for every square root, +3.9 KB of source), course +0.20 (+1.4 KB), golf +0.55 (+7.6 KB: the paged leaderboards, `HoleRank`, `Claim`, `SimulateRoundIn`, the round summaries on gnoweb).
- Each addpkg passed with run 4's flags, but with less room than the 1.3× rule wants: golf used 206.7M of its 260M, and physics 95.3M of its 120M. The command list below raises both.
- `Owner()` returns the deployer.

### The 74 holes as data

The scripts come from `REALM=gno.land/r/nym-golfer000/golf OUT=<scratch> scripts/publishdata.sh`, and each ran with the flags of the command list.

| Script | Gas | Bytes | Deposit | Run 4 gas |
|---|---|---|---|---|
| publish-01 | 635.1M | 47,862 | 4.79 | 633.9M |
| publish-02 | 485.6M | 32,208 | 3.22 | 484.4M |
| publish-03 | 710.3M | 35,357 | 3.54 | 709.0M |
| publish-04 | 617.5M | 34,449 | 3.44 | 616.3M |
| publish-05 | 776.5M | 65,942 | 6.59 | 775.2M |
| publish-06 | 745.0M | 35,650 | 3.56 | 743.8M |
| publish-07 | **860.9M** | 53,102 | 5.31 | 859.7M |
| publish-08 | 792.8M | 37,296 | 3.73 | 791.6M |
| publish-09 | 683.0M | 34,494 | 3.45 | 681.7M |
| publish-10 | 741.2M | 59,326 | 5.93 | 739.9M |
| publish-11 | 255.6M | 18,675 | 1.87 | 254.7M |
| **74 holes** | **7,303.6M** | **454,361** | **45.44 GNOT** | 7,290.2M |

- The bytes are exactly run 4's, script by script: the hole data has not changed. The gas rose by 1.2–1.3M a script (about 0.2%), from the charged square roots.
- publish-02 and publish-08 cross a 10M step of the 1.3× rule (630M → 640M, 1,030M → 1,040M).
- `verify.gno`, simulated, printed **"74 slots hold their data; missing or other:"** with nothing after it, in 348.8M gas (run 4: 346.2M).

### Playing

Real transactions, in period 5968131. extras/10's plan (`14,8.5`) did not hole in that period's weather, so the first finish was on extras/16 (`22,7.5`), and the second hole was garden/3 (`0,9.25`). Both held in 1, as did garden/14's `14,8.5`. `default` has a name; `heir` and `third` had none when they played.

| Call | Gas | Bytes | Deposit | Run 4 |
|---|---|---|---|---|
| `PlayRoundAt(extras/16/v1)` by `default`: the course's first finish | 51.2M | 5,404 | **0.54 GNOT** | 50.7M, 5,404 |
| `PlayRoundAt(garden/3/v1)` by `default`: a second hole | 54.1M | 3,401 | 0.34 GNOT | 51.3M, 3,405 |
| `Reset(extras/16/v1)` | 13.9M | −1,513 | −0.15 GNOT | 13.7M, −1,513 |
| `PlayRoundAt(extras/16/v1)` again: a replay, same score | 49.0M | 1,525 | 0.15 GNOT | 48.5M, 1,525 |
| `PlayRoundAt(extras/16/v1)` by `heir`, unnamed: a first finish on a hole finished before | 49.3M | 3,300 | 0.33 GNOT | 49.4M, 3,312 |
| `PlayRoundAt(garden/3/v1)` by `heir`, unnamed: its second hole | 51.7M | 1,997 | 0.20 GNOT | — |
| A MsgRun of `Reset` + `PlayRoundAt(extras/16/v1)`, as the client records a replay | 59.6M | 6 | ~0 | 58.6M, −6 |
| `PlayRoundPro(garden/14/v1)` by `default`: the course's first pro finish | 53.0M | 5,204 | **0.52 GNOT** | — |
| `Reset(garden/3/v1)`, then `PlayRoundPro(garden/3/v1)` by `default`: a pro best on a hole it had finished assisted | 13.9M, then 54.6M | −1,523, then 2,529 | 0.25 GNOT net 0.10 | — |

- The storage is run 4's to within 12 bytes. A named player's new hole costs 0.34 GNOT, the course's first finish in a mode about 0.53, a replay after a Reset 0.15.
- An unnamed player pays less on its later holes (0.20 GNOT for heir's second), because it takes no board row. It pays the rest when it claims (below).
- `PlayRoundPro` on a hole already finished assisted is refused at simulation ("this hole is finished — Reset it to play again"), so it cost nothing. A round is one per hole and player, whatever the mode.
- No call used more than 59.6M.

### A name, and Claim

| Call | Gas | Bytes | Deposit |
|---|---|---|---|
| `Register("nym-heirputter007")` by `heir`, alone | 28.5M | 3,184 | 0.32 GNOT |
| `Claim()` by `heir`, alone: returned 2 (assisted bests on extras/16 and garden/3) | 54.3M | 1,528 | 0.15 GNOT |
| **`Register("nym-thirdwedge042")` + `Claim()` by `third`, one transaction**: Claim returned 2 (extras/16 assisted, garden/14 pro) | **80.1M** | **5,216** | **0.52 GNOT** |

- **gnokey can put both calls in one transaction, but not with `maketx` alone.** `maketx call` takes one message. The two-message transaction was built as the dapp builds it: `maketx call … -broadcast=false` for each call, their `msg` arrays joined with `jq`, then `gnokey sign` (with the account number and sequence from `query auth/accounts`) and `gnokey broadcast`. Claim saw the name registered by the message before it.
- Of the 5,216 bytes, 829 are namereg's, 2,367 the users registry's, and 2,020 golf's (the two bests seated on their boards and the course ranking).
- `heir`'s name and Claim went in two transactions, by mistake, and are kept as a measure of each call alone: **the pearl gnokey broadcasts by default** (`-broadcast=true`), so a `maketx` meant to only print a transaction sends it. Claim's gas does not depend on the caller: it reads the course's 74 slots in both modes.
- The client budgets 60M + 90M for the pair; 80.1M was used.

### Reads

Each read was checked over `vm/qeval`, and its gas measured in a simulated MsgRun (which adds a few million for the script itself).

| Read | Gas (MsgRun) | Result |
|---|---|---|
| `CourseLeaderboard("assisted", 0, 10)` | 24.8M | 74 holes, 3 players: `default` 2 holes in 2, `heir` 2 in 2, `third` 1 in 1; `next` 0. Pro: `default` and `third` |
| `HoleRank("extras/16/v1", "assisted", heir)` | 21.3M | rank 3 of 3, 1 stroke. `third` is rank 1 of 2 on garden/14 in pro |
| `HoleLeaderboard("extras/16/v1", "assisted", 0, 10)` | 25.7M | 3 players, 3 finished |
| `SimulateRoundIn("extras/10/v1", "14,8.5", 5967998)` | 53.8M | holed in 1, in a period 133 behind (the one `hole-bests.json` recorded) |
| `SimulateRoundIn(…, 5999999)` | — | refused: "that weather has not come yet" |

The hub (`Render("")`) and a hole page render.

### Owner functions (simulated)

| Call | Signer | Result |
|---|---|---|
| `SetPlayURL("https://gnogolf.xyz/")` | `default` | ok, 11.8M gas |
| `SetSuccessor("gno.land/r/nym-golfer000/golf2")` | `default` | ok, 12.0M gas |
| `SetPlayURL("https://evil.example/")` | `heir` | refused: "golf: only the owner can move the play link" |
| `SetSuccessor(…)` | `heir` | refused: "golf: only the owner can name a successor" |

`Successor()` is still `""` afterwards.

### Run 5 in short

- Every step passed. No problem was found in the code.
- The deploy costs 0.93 GNOT more than in run 4, all in the code deposit; the holes cost the same. The fees rise by 0.05 GNOT.
- The command list as run 4 wrote it would have worked on pearl: every transaction passed with those flags. It is updated below all the same, so that each flag keeps its 1.3× margin: physics 130M gas, course `-max-deposit` 7 GNOT, golf 270M gas and 28 GNOT, publish-02 640M, publish-08 1,040M.
- The web client was not run against the rehearsal chain this time.

## Pearl, read live (run 1: profile `testnet`, `pearl-1`, height ~700,460)

| Fact | Value | How |
|---|---|---|
| Storage price | `100ugnot` per byte | `abci_query params/vm:p:storage_price` (read-only; gnomcp has no param tool) |
| Gas price | `1ugnot/1000gas` | `auth/gasprice` |
| Default deposit cap (empty `-max-deposit`) | `100000000ugnot` (100 GNOT) | `params/vm:p:default_deposit` |
| Block max gas | 3,000,000,000 | `consensus_params` |
| Code submission | permissionless | `params/vm:p:code_submission_policy` |
| CLA | **not enforced** (`enabled: false`) | `gno_cla_info` |
| Namespace enforcement | **on** (`r/sys/names.IsEnabled()` = true) | `gno_eval` |
| `nym-golfer000` | **free**: `IsNameTaken` false, `IsCanonicalTaken` ("", false), `ValidateNymFormat` nil, nothing deployed under `@nym-golfer000` | `gno_eval`, `gno_packages` |
| Registration | `gno.land/r/sys/namereg/v1`, `Register(cur, username)`; price **0 ugnot** (so send nothing: it requires the sent amount to equal the price exactly), not paused; a direct MsgCall from the key only (it checks `IsUserCall`: a `maketx run` cannot register). Format `nym-<5–13 lowercase letters><3 digits>`, 12–20 chars, no `gno`/`gl`/`atom`/`atone`/`photon`/`cosmos` stem prefix, no reserved role name, no confusable of an existing name | `gno_render`, `gno_read` of `Register` |
| Faucet | 10 GNOT a grant, 1 per address per 24 h | `gno_status`, `faucet-agent.pearl…/limits` |
| Our imports | `p/nt/avl/v0`, `p/nt/bptree/v0`, `p/nt/ufmt/v0`, `r/sys/users` all deployed | `gno_packages` |

## Projection for pearl (measured, run 6)

| Item | GNOT (run 6) | Run 5 | Run 4 | Run 1 |
|---|---|---|---|---|
| Name deposit | 0.33 | 0.33 | 0.33 | 0.33 |
| Code deposit (3 packages) | 31.65 | 30.46 | 29.53 | 24.43 |
| 74 holes' deposit | 45.44 | 45.44 | 45.44 | 75.90 |
| **Deposit** | **77.42** | 76.23 | 75.29 | 100.65 |
| Fees: the 15 transactions below, each at its gas-wanted (1.3× measured) and 1.2× the price floor | 12.14 | 12.12 (7.71 at the floor) | 12.07 | 11.93 |
| **Total** | **89.56** | 88.35 | 87.37 | 112.6 |
| **With a 15% margin** | **103.0, so ask for 105 GNOT** | 101.6 | 100.5 | ~130 |

Run 6 (2026-09-27) is today's code on a pearl-tag chain: only golf grew (131,768 → 139,209 B, +1.19 GNOT: the publishing switch, Hide's index, each shot's work and a commit's fixed gas in the reads). Its addpkg measured 217.1M gas and 22.37 GNOT of deposit, so step 5's flags are raised to keep a 1.3× margin. Every other step measured as run 5. Since run 6, golf keeps each best's round for the ghost duels (ADR-004) and its gnoweb pages were reworked: about 3 KB more source (142 KB), some 4M gas and 0.3 GNOT more at addpkg, well inside step 5's flags.

Ask for **105 GNOT**, as in run 4. That still leaves room for one failed-and-rerun publish script. At the faucet's 10 GNOT a day for one address, 100 GNOT takes 10 days, so ask the faucet operators or GovDAO instead. The deposit is locked for good, because published data is never freed.

The deploy order also bounds when the money is needed:

- about 32 GNOT for the name and the code, of which golf alone takes 22.4;
- then 2–7 GNOT for each publish script.

For players on pearl:

- A round costs 0.05–0.06 GNOT in fees at the floor (49–60M gas).
- A named player's first finish on a hole also costs a deposit of about 0.34 GNOT (3.3–3.4 KB), whether or not someone has finished the hole before.
- The very first finish in a mode on the whole course costs about 0.53 GNOT (0.54 assisted, 0.52 pro).
- A replay after a Reset costs 0.15 GNOT, which is what the Reset refunds.
- An unnamed player pays less on its later holes (0.20 GNOT), and the rest when it takes a name: Register + Claim in one transaction measured 80.1M gas and 0.52 GNOT of deposit.

## The command list for pearl

> Superseded for onyx, which lets one seeded account `maketx run`: the holes are published with `scripts/publishdata.sh <key>`, one `gnokey maketx call` of `Publish` a hole, and checked with `scripts/publishdata.sh -verify` (docs/design/deploy-v1.md, section 10). The `maketx run` steps below are pearl's.

The user runs these commands with their own key, in this order. The key is written `<your-key-name>` below, and its address `<your-address>`. Every transaction takes `-chainid pearl-1 -remote https://rpc.pearl.testnets.gno.land:443`, shortened to `$P` below. The read-only checks take only the remote, `$R`:

```sh
P="-chainid pearl-1 -remote https://rpc.pearl.testnets.gno.land:443"   # for maketx
R="-remote https://rpc.pearl.testnets.gno.land:443"                    # for query
```

How each flag is sized, from the run-5 measurements:

- **Gas-wanted:** the measured gas × 1.3, rounded up to 10M.
- **Fee:** gas-wanted at 1.2× the floor. The chain takes the whole fee, so the margin stays small.
- **`-max-deposit`:** the measured deposit × 1.3, rounded up to 1 GNOT.

gnokey simulates a transaction before it broadcasts it (`-simulate test`, the default), so a transaction that would fail costs nothing. The pearl gnokey also broadcasts by default (`-broadcast=true`): leaving out `-broadcast` does not make a dry run. Only `-simulate only` does.

**0. Fund** the key with ~105 GNOT. Check: `gnokey query auth/accounts/<your-address> $R`.

**1. Register the name** (0.33 GNOT deposit, no `-send`):

```sh
gnokey maketx call -pkgpath gno.land/r/sys/namereg/v1 -func Register -args nym-golfer000 \
  -gas-wanted 40000000 -gas-fee 48000ugnot -max-deposit 1000000ugnot -broadcast $P <your-key-name>
```

Check: `gnokey query vm/qeval -data 'gno.land/r/sys/names.IsAuthorizedAddressForNamespace(address("<your-address>"), "nym-golfer000")' $R` returns `true`. Or open https://pearl.testnets.gno.land/u/nym-golfer000.

**2. Stage** the three packages. This also lints them with the pearl toolchain and prints their sizes: 53,903 / 66,788 / 139,209 B.

```sh
scripts/stage.sh nym-golfer000 /tmp/stage
```

**3. Deploy physics** (4.50 GNOT):

```sh
gnokey maketx addpkg -pkgpath gno.land/p/nym-golfer000/physics -pkgdir /tmp/stage/gno.land/p/nym-golfer000/physics \
  -gas-wanted 130000000 -gas-fee 156000ugnot -max-deposit 6000000ugnot -broadcast $P <your-key-name>
```

Check: https://pearl.testnets.gno.land/p/nym-golfer000/physics$source.

**4. Deploy course** (4.78 GNOT):

```sh
gnokey maketx addpkg -pkgpath gno.land/p/nym-golfer000/course -pkgdir /tmp/stage/gno.land/p/nym-golfer000/course \
  -gas-wanted 110000000 -gas-fee 132000ugnot -max-deposit 7000000ugnot -broadcast $P <your-key-name>
```

Check: https://pearl.testnets.gno.land/p/nym-golfer000/course$source.

**5. Deploy golf** (22.37 GNOT; its init makes you the owner, with community publishing closed until `SetPublishing`):

```sh
gnokey maketx addpkg -pkgpath gno.land/r/nym-golfer000/golf -pkgdir /tmp/stage/gno.land/r/nym-golfer000/golf \
  -gas-wanted 290000000 -gas-fee 348000ugnot -max-deposit 30000000ugnot -broadcast $P <your-key-name>
```

Check: `gnokey query vm/qeval -data 'gno.land/r/nym-golfer000/golf.Owner()' $R` returns `<your-address>`. https://pearl.testnets.gno.land/r/nym-golfer000/golf shows the hub, with its "open the game" link going to https://gnogolf.xyz/.

**6. Generate the publish scripts** for the namespace, 7 holes a script. The committed `scripts/publish/` import the local `gno.land/r/gnogolf/golf`, so pearl needs `REALM`. `OUT` leaves the committed scripts as they are.

```sh
REALM=gno.land/r/nym-golfer000/golf OUT=/tmp/pub scripts/publishdata.sh
```

**7. Publish the 74 holes** (45.44 GNOT), one script after the other. A script that runs twice skips the slots it has already published, so if one fails, run it again:

```sh
gnokey maketx run -gas-wanted  830000000 -gas-fee  996000ugnot -max-deposit 7000000ugnot -broadcast $P <your-key-name> /tmp/pub/publish-01.gno
gnokey maketx run -gas-wanted  640000000 -gas-fee  768000ugnot -max-deposit 5000000ugnot -broadcast $P <your-key-name> /tmp/pub/publish-02.gno
gnokey maketx run -gas-wanted  930000000 -gas-fee 1116000ugnot -max-deposit 5000000ugnot -broadcast $P <your-key-name> /tmp/pub/publish-03.gno
gnokey maketx run -gas-wanted  810000000 -gas-fee  972000ugnot -max-deposit 5000000ugnot -broadcast $P <your-key-name> /tmp/pub/publish-04.gno
gnokey maketx run -gas-wanted 1010000000 -gas-fee 1212000ugnot -max-deposit 9000000ugnot -broadcast $P <your-key-name> /tmp/pub/publish-05.gno
gnokey maketx run -gas-wanted  970000000 -gas-fee 1164000ugnot -max-deposit 5000000ugnot -broadcast $P <your-key-name> /tmp/pub/publish-06.gno
gnokey maketx run -gas-wanted 1120000000 -gas-fee 1344000ugnot -max-deposit 7000000ugnot -broadcast $P <your-key-name> /tmp/pub/publish-07.gno
gnokey maketx run -gas-wanted 1040000000 -gas-fee 1248000ugnot -max-deposit 5000000ugnot -broadcast $P <your-key-name> /tmp/pub/publish-08.gno
gnokey maketx run -gas-wanted  890000000 -gas-fee 1068000ugnot -max-deposit 5000000ugnot -broadcast $P <your-key-name> /tmp/pub/publish-09.gno
gnokey maketx run -gas-wanted  970000000 -gas-fee 1164000ugnot -max-deposit 8000000ugnot -broadcast $P <your-key-name> /tmp/pub/publish-10.gno
gnokey maketx run -gas-wanted  340000000 -gas-fee  408000ugnot -max-deposit 3000000ugnot -broadcast $P <your-key-name> /tmp/pub/publish-11.gno
```

Each script prints the version ids it published (`extras/10/v1` …). After each one, check that https://pearl.testnets.gno.land/r/nym-golfer000/golf lists more cups.

**8. Verify** every slot. This is a simulation, so it costs nothing:

```sh
gnokey maketx run -simulate only -gas-wanted 460000000 -gas-fee 552000ugnot $P <your-key-name> /tmp/pub/verify.gno
```

It must print `74 slots hold their data; missing or other:` with nothing after it.

**(9. Only if the site moves) Set the play link.** The default is already `https://gnogolf.xyz/`, so skip this step for that site. It measured 11.8M gas and no deposit:

```sh
gnokey maketx call -pkgpath gno.land/r/nym-golfer000/golf -func SetPlayURL -args https://<new-site>/ \
  -gas-wanted 20000000 -gas-fee 24000ugnot -max-deposit 1000000ugnot -broadcast $P <your-key-name>
```

**10. Point the client** at pearl with the Netlify environment below, then build.

The same list as gnomcp calls (what the rehearsal ran):

1. `gno_call(namereg/v1, Register, [nym-golfer000])`
2. `gno_addpkg` ×3, with the staged files
3. `gno_eval(golf, Owner())`
4. `gno_run` ×11, with the publish scripts
5. `gno_run(verify.gno, simulate)`

gnomcp cannot run step 5 on pearl as it stands, for two reasons. It pins `-max-deposit` to 10 GNOT on addpkg, and golf needs 22.37 GNOT (problem 5). It also deploys as its agent key, not as the user.

## Netlify environment

These are the values for the site (see `netlify.toml`; `web/.env.example` carries the same set):

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | `https://gnogolf.xyz` |
| `NEXT_PUBLIC_REALM` | `gno.land/r/nym-golfer000/golf` |
| `NEXT_PUBLIC_RPC` | `https://rpc.pearl.testnets.gno.land:443` |
| `NEXT_PUBLIC_WEB` | `https://pearl.testnets.gno.land` |

`NEXT_PUBLIC_ALLOWED_HOSTS` stays unset: pearl's hosts end in `.gno.land`, which `chain.ts` allows already. `chain.ts` accepts the realm when it matches `^gno\.land/r/[a-z0-9_-]+/golf$` and otherwise falls back to the local `gno.land/r/gnogolf/golf`, so a pearl build must set it.

## Paths still naming `gnogolf`

Two run-1 findings are fixed since:

- The "get a name ↗" link (`web/components/Golf.tsx:2017`) now points at `${web}/r/sys/namereg/v1`.
- `media/lib/cdp.mjs` `chainUp()` takes `REALM` from the environment.

`web/.env.example` now holds the pearl values. What remains is intended:

- `web/lib/chain.ts:43` falls back to `gno.land/r/gnogolf/golf` for local dev.
- `web/lib/card.ts` holds `OLD_REALM`, the migration of old ids.
- `web/lib/scene/title-holes.json` is static decor.
- The remaining mentions are comments.
- `scripts/stage.sh`, `holedata.sh`, `paritydata.sh` and `selfcheck.ts` read the canonical tree.
- `scripts/publishdata.sh` defaults to `gnogolf`, and `REALM` overrides it.
- The committed `scripts/publish/*.gno` import the local realm: regenerate them with `REALM` (step 6).

## Problems hit, and their fixes

Problems from run 1:

1. **No pearl `gnoland` binary.** Fix: `GOBIN=~/.cache/gno-toolchains/pearl go install github.com/gnolang/gno/gno.land/cmd/gnoland@c4c72fdd288c`.
2. **A lazy genesis loads every example.** Fix: a GNOROOT of symlinks with an `examples/` holding only pearl's 85 packages.
3. **Genesis panicked with "PubKey does not match Signer address g1manfred…".** Fix: `-skip-genesis-sig-verification`, which pearl's own genesis uses, and the seven creator addresses funded in the balances file.
4. **A restart over the same secrets stalled at height 0,** because the old `priv_validator_state.json` refused to sign again. Fix: delete it together with `db/` and `wal/`. Run 2 did exactly that for its fresh genesis, and the chain was producing blocks within seconds.
5. **gnomcp cannot deploy golf on pearl.** `gno_addpkg` pins `-max-deposit` to 10 GNOT, and golf now needs **22.37** GNOT at pearl's price (21.17 in run 5, 20.63 in run 4, 20.35 in run 3, 17.35 in run 2, 15.69 in run 1).
   - Workaround for the rehearsal: `storage_price` = 1 ugnot in the genesis, with the bytes read from the events and multiplied by 100 for pearl.
   - On pearl, the user deploys with gnokey and `-max-deposit 30000000ugnot` (step 5). Run 5 needed no workaround: it used gnokey at pearl's own price.
   - Still worth raising with gnomcp: a `max_deposit` argument on `gno_addpkg`.
6. **`publishdata.sh` overwrote the committed scripts.** Fixed: `OUT` sets the output directory.
7. **`publishdata.sh`'s default split did not match the committed set.** Fixed: the default is 7 holes a script.
8. **gnomcp caps a write's gas-wanted at 1e9.** publish-07 still uses the most gas, 859.7M (858.5M in run 3), which leaves 14% headroom. It passes through gnomcp. With gnokey, the user sets 1.12e9 (step 7).
9. **A hand-copied script had a typo in run 1,** and the chain refused it at simulation. In run 2 every body was read from disk by the stdio driver, so nothing was copied by hand.
10. **The data publish cost twice the design's estimate in run 1: 75.9 GNOT.** Fixed in `62488e6`, and measured at **46.13 GNOT** in run 2 (6,234 bytes a hole) and **45.44 GNOT** in runs 3 and 4 (6,140). This matches the filetest estimate of ~46. In run 2 the cost moved to the first finisher on each version (1.5 GNOT, or 2.6 GNOT for the course's very first finish in a mode), and every later player paid half what they did. `3432d52` moved those trees into shared indexes paid at golf's init (+3.0 GNOT on the addpkg), so in run 3 every first finish costs about 0.34 GNOT, and the course's very first one 0.54 GNOT.
11. **The "get a name" link pointed at `r/gnoland/users`.** Fixed in `web/` since run 1.

Run 2 found no new problem in the code. Two notes:

- The weather in period 5967793 made garden/3's one-shot plan (`0,8`, which holed in run 1) roll through the hole on ice. The play tests used extras/10 and extras/16 instead, whose plans held in that period. This is the weather working as designed, not a bug. `scripts/hole-bests.json` plans are for their recorded periods.
- `golf` grew by 16.6 KB of storage (+1.66 GNOT) over run 1. This is the final fixes' code: lazy trees, the owner-set play link, the successor, and the safer pages.

Run 3 found no new problem in the code either. Every step passed on the first try, and no plan had to be swapped: in period 5967805 the plans of extras/10, extras/16, garden/1–3, garden/5 and garden/14 all held. Two notes:

- The total with its 15% margin is now 99.9 GNOT, against 97.1 in run 2, because golf's init pays 3.0 GNOT for the shared indexes. "Ask for ~100 GNOT" still holds, but only just: ask for 105 to keep room for a rerun.
- Gas rose a little everywhere in golf: +7.1M on its addpkg, +0.6% on the publishes, and +1–12M on a play call (58.6M for the first finish on extras/16, against 46.2M). The heaviest round stays far below any limit, and publish-07 (858.5M) still fits gnomcp's 1e9 cap.

Run 4 found no new problem in the code. Every step passed on the first try. Three notes:

- The total with its 15% margin is now 100.5 GNOT, against 99.9 in run 3: +0.48 GNOT of code deposit (physics +0.10, course +0.09, golf +0.28) and +0.05 of fees. Ask for 105 GNOT.
- Run 3's one-shot plans no longer hole under the new physics. The plans in the current `scripts/hole-bests.json` held in period 5967999, on chain and in the web client. This is expected with a physics change, not a bug.
- Gas moved in three places, and every change is small against its limit: physics' addpkg +15.6M (its source grew by 11.9 KB), so its gas-wanted goes from 100M to 120M; golf's addpkg +5.9M (250M → 260M); publish-04 crosses a 10M step (800M → 810M); `verify.gno` 460M. publish-07 (859.7M) still fits gnomcp's 1e9 cap, and the heaviest round (58.6M) is far below any limit. The gas bound per shot did not refuse any of the 74 holes.

Run 5 found no new problem in the code either, and every step passed on the first try. Its notes are in [Run 5 in short](#run-5-in-short). One finding about the tools: the pearl gnokey broadcasts unless told `-broadcast=false`, which the command list now says.

## Left running

Nothing is left running after run 4. The rehearsal chain (`:26767`) and the second dev server (`:3310`) were stopped, and the Chrome started by the smoke test was killed. The existing gnodev (`:26757`) and dev server (`:3300`) were not touched. The rehearsal chain's state is kept in the session scratch (`node/`), and it restarts with the same `gnoland start` line. Run 4's outputs are in `r4/` there.

Nothing is left running after run 5 either: its chain (`:26767`) was stopped. The gnodev on `:26657` and the dev server on `:3300` were not touched. Its chain, keys and outputs are in the session scratch, under `rehearsal5/` (`node/`, `keys/`, `out/`).
