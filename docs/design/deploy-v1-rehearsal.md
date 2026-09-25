# Deploy v1, Phase 4: the pearl rehearsal (2026-09-25)

The exact artefacts of the pearl deploy — `scripts/stage.sh nym-golfer000`'s three packages and the 74 holes of `data/holes.txt` as data — deployed, published, played and handed over on a throwaway chain built from the pearl tag, with every cost measured. Then the pearl facts read live, read-only. Nothing was broadcast to pearl.

## The rehearsal chain

- **Binary:** `gnoland` built from `chain/pearl` = `c4c72fdd288c` (the tag the pearl `gno` in `~/.cache/gno-toolchains/pearl/` is built from), installed beside it as `~/.cache/gno-toolchains/pearl/gnoland`. Not gnodev.
- **Genesis:** `gnoland start -lazy` over a GNOROOT whose `examples/` holds exactly pearl's package set: pearl's `FILTERED_PACKAGES` (from `misc/deployments/pearl.gno.land/gen-genesis.sh`) resolved with `gno tool deplist -test-dep` gives 85 packages, the count pearl has. None of ours. Chain id `test-rehearsal`, RPC `127.0.0.1:26767`, P2P `:26766`, run under `nice`. Not set at genesis, unlike pearl: `names.Enable` (namespace enforcement), so `nym-golfer000` deploys would have worked unregistered; it was registered anyway, first, as on pearl.
- **Params:** every VM and auth param that prices gas matches pearl, read live on both (`preprocess_gas_per_byte` 1250, the read/write depth costs, `iter_next_cost_flat` 1000, `tx_size_cost_per_byte` 10, the sig costs, gas price `1ugnot/1000gas`, block max gas 3e9, `default_deposit` 100 GNOT, `code_submission_policy` permissionless). One exception, on purpose: `storage_price` was set to `1ugnot` in the genesis (pearl: `100ugnot`). See problem 5. Gas does not depend on it, and each transaction's `StorageDepositEvent` gives its exact byte count; every deposit below is those bytes × pearl's 100 ugnot.
- **gnomcp:** profile `rehearsal` (added with `gno_profile_add`, in memory), agent keys `default` (`g1sz0h…5ent`, deployer and owner) and `heir` (`g10g3j…8ctx`, made with `gno_key_generate`, for the handover). Both funded at genesis.

The byte-identity of what was deployed was checked file by file against the staged tree over `vm/qfile`: every `.gno` file is the same bytes (the chain adds an `[addpkg]` block to `gnomod.toml`, nothing else).

## The numbers

"Deposit" is pearl GNOT at 100 ugnot/byte. "Fee (floor)" is the gas used at `1ugnot/1000gas`; what a transaction pays is its gas-wanted at that price (see the command list, which offers 1.3× gas and 1.2× the floor).

### Name and code

| Step | Gas used | Bytes | Deposit | Design estimate (`deploy-v1.md` §10.3–10.4) |
|---|---|---|---|---|
| `namereg/v1.Register("nym-golfer000")` | 25.4M | 3,326 | 0.33 GNOT | ~5M gas |
| addpkg `p/nym-golfer000/physics` (49.4 KB source) | 72.4M | 43,429 | 4.34 GNOT | 5.2 GNOT |
| addpkg `p/nym-golfer000/course` (49.6 KB) | 76.7M | 43,962 | 4.40 GNOT | 3.7 GNOT |
| addpkg `r/nym-golfer000/golf` (103.3 KB, its init and globals included) | 164.6M | 156,855 | **15.69 GNOT** | 9.1 + ~1 GNOT |
| **Name + code** | 339.1M | 247,572 | **24.76 GNOT** | ~19 GNOT |

`Owner()` after the golf addpkg: the deployer (`g1sz0h…5ent`). Its init captured `OriginCaller`, as designed.

### The 74 holes as data

`scripts/publishdata.sh` with `REALM=gno.land/r/nym-golfer000/golf`, 7 holes a script (the committed set's split), each run with `gno_run`:

| Script | Holes | Gas used | Bytes | Deposit |
|---|---|---|---|---|
| publish-01 | extras/10, extras/16, garden/1–5 | 632.1M | 62,987 | 6.30 |
| publish-02 | garden/6–12 | 481.2M | 60,908 | 6.09 |
| publish-03 | garden/13–18, island/1 | 706.0M | 64,057 | 6.41 |
| publish-04 | island/2–8 | 613.3M | 63,149 | 6.31 |
| publish-05 | island/9–15 | 772.5M | 94,582 | 9.46 |
| publish-06 | island/16–18, mountain/1–4 | 740.9M | 64,350 | 6.44 |
| publish-07 | mountain/5–11 | **856.5M** | 82,060 | 8.21 |
| publish-08 | mountain/12–18 | 788.9M | 66,218 | 6.62 |
| publish-09 | town/1–7 | 685.8M | 78,059 | 7.81 |
| publish-10 | town/8–14 | 727.7M | 73,796 | 7.38 |
| publish-11 | town/15–18 | 244.0M | 48,806 | 4.88 |
| **74 holes** | | **7,249M** | **758,972** | **75.90 GNOT** |

- Per hole: 98M gas on average (Phase 0 measured a `Put` at 80–109M: it holds), and **10,256 bytes = 1.03 GNOT**. The design counted ~0.53 GNOT a hole (data ~15 + entries and indexes ~24 = 39 GNOT); the data is 141 KB of the 759 KB, so an entry with its index keys costs about 8.3 KB, not the ~3.3 KB the design assumed. See problem 10.
- The heaviest hole alone (mountain/8) publishes in 164M.
- `verify.gno`, simulated: **"74 slots hold their data"**, 347.9M gas.

### Playing

Real transactions from the agent key, on the published holes, period 5967775:

| Call | Gas used | Bytes | Deposit |
|---|---|---|---|
| `PlayRoundAt(garden/3/v1, "0,8")`, holed in 1: first finish, first assisted finish on the course (creates the mode's standing and ranking trees) | 56.9M | 16,900 | 1.69 GNOT |
| `PlayRoundPro(garden/1/v1, 2 shots)`, holed in 2: first pro finish | 69.5M | 16,895 | 1.69 GNOT |
| `PlayRoundAt(extras/16/v1)`, holed in 1: the same player's first finish on another hole | 45.2M | 6,039 | 0.60 GNOT |
| `PlayRoundAt(garden/3/v1)` by `heir` (unnamed): a second player's first finish there | 56.8M | 6,561 | 0.66 GNOT |
| `Reset(garden/3/v1)` | 11.4M | −2,155 (refunded) | −0.22 GNOT |
| `PlayRoundAt(garden/3/v1)` again: a replay, same score | 55.3M | 2,161 | 0.22 GNOT |
| MsgRun `Reset` + `PlayRoundPro(garden/1/v1)` in one transaction, as the client records | 77.1M | 6 | ~0 |

The leaderboard then held the named deployer (assisted: 2 holes, 2 strokes; pro: 1 hole, 2 strokes) and not the unnamed `heir`, as designed.

### Owner handover

`Transfer(heir)` 10.3M → `Pending()` = heir → `Accept()` from heir 10.7M → `Owner()` = heir, and a `Transfer` from the old owner is refused ("only the owner can transfer the course") → `Transfer(deployer)` from heir 10.3M → `Accept()` 10.7M → `Owner()` = deployer, `Pending()` = "". Every step as specified (audit Y3).

**On pearl this step is not needed:** the user deploys golf with their own key, so golf's init makes the user the owner directly. The handover was a local check only.

### The web client

A second dev server (`next dev -p 3310`, from a copy of `web/` sharing its `node_modules`) with `NEXT_PUBLIC_RPC=http://127.0.0.1:26767` and `NEXT_PUBLIC_REALM=gno.land/r/nym-golfer000/golf`. `chain.ts` takes the realm from `NEXT_PUBLIC_REALM` when it matches `^gno\.land/r/[a-z0-9_-]+/golf$` (`nym-golfer000` does) and falls back to `gno.land/r/gnogolf/golf`; the RPC from `NEXT_PUBLIC_RPC`.

Headless Chrome (`media/lib/cdp.mjs`, muted, one page at a time, killed after): garden/3, island/6, mountain/7 and town/18 loaded, drew and replayed a chain-simulated shot each (garden/3 holed in one), with no page error. The page talked only to `127.0.0.1:3310` and `127.0.0.1:26767`. Screenshots: `media/rehearsal-{garden-3,island-6,mountain-7,town-18}.jpg`.

## Pearl, read live (profile `testnet`, `pearl-1`, height ~700,460)

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

## Projection for pearl

| Item | Measured | Design |
|---|---|---|
| Name deposit | 0.33 | — |
| Code deposit (3 packages) | 24.43 | ~19 |
| 74 holes' deposit | 75.90 (~46 after the final fixes, estimated: problem 10) | ~39 |
| **Deposit** | **100.65 GNOT** (~71 after the final fixes) | ~58 (45–80) |
| Fees: the 15 transactions below at their gas-wanted (1.3× measured) and 1.2× the price floor | 11.93 GNOT (7.59 at the floor) | ~3–6 |
| **Total** | **112.6 GNOT** (~83 after the final fixes, estimated) | ~65 (50–90) |
| **With a 15% margin** | **~130 GNOT** (~95 after the final fixes; keep asking for ~130, the fixes are not re-rehearsed) | |

At the faucet's 10 GNOT a day for one address that is 13 days; ask the faucet operators or GovDAO for ~130 GNOT instead. The deposit is locked for good (published data is never freed). The deploy order also bounds when money is needed: ~25 GNOT for the name and code, then ~6–10 GNOT per publish script.

For players, on pearl: a round costs 0.05–0.08 GNOT in fees (45–77M gas), plus a deposit of 0.6–0.7 GNOT for a first finish on a hole, 1.7 GNOT for the very first finish in a mode on the whole course, and 0.22 GNOT for a replay after a Reset (which refunds 0.22).

## The command list for pearl

The user runs these with their own key (`<your-key-name>`; its address below is `<your-address>`), in this order. Every transaction carries `-chainid pearl-1 -remote https://rpc.pearl.testnets.gno.land:443`, shortened below to `$P`; the read-only checks take only the remote, `$R`:

```sh
P="-chainid pearl-1 -remote https://rpc.pearl.testnets.gno.land:443"   # for maketx
R="-remote https://rpc.pearl.testnets.gno.land:443"                    # for query
```

Gas-wanted is the rehearsal's gas × 1.3, rounded up; the fee is gas-wanted at 1.2× the floor (the chain takes the whole fee, so the margin stays small); `-max-deposit` is the measured deposit × 1.3. gnokey simulates before it broadcasts (`-simulate test`, the default), so a transaction that would fail costs nothing.

**0. Fund** the key with ~130 GNOT. Check: `gnokey query auth/accounts/<your-address> $R`.

**1. Register the name** (0.33 GNOT deposit, no `-send`):

```sh
gnokey maketx call -pkgpath gno.land/r/sys/namereg/v1 -func Register -args nym-golfer000 \
  -gas-wanted 40000000 -gas-fee 48000ugnot -max-deposit 1000000ugnot -broadcast $P <your-key-name>
```

Check: `gnokey query vm/qeval -data 'gno.land/r/sys/names.IsAuthorizedAddressForNamespace(address("<your-address>"), "nym-golfer000")' $R` → `true`; or https://pearl.testnets.gno.land/u/nym-golfer000.

**2. Stage** the three packages (this also lints them with the pearl toolchain and prints their sizes: 49,383 / 49,565 / 103,315 B):

```sh
scripts/stage.sh nym-golfer000 /tmp/stage
```

**3. Deploy physics** (4.34 GNOT):

```sh
gnokey maketx addpkg -pkgpath gno.land/p/nym-golfer000/physics -pkgdir /tmp/stage/gno.land/p/nym-golfer000/physics \
  -gas-wanted 100000000 -gas-fee 120000ugnot -max-deposit 6000000ugnot -broadcast $P <your-key-name>
```

Check: https://pearl.testnets.gno.land/p/nym-golfer000/physics$source, or `gnokey query vm/qfile -data gno.land/p/nym-golfer000/physics $R` (lists its 5 files).

**4. Deploy course** (4.40 GNOT):

```sh
gnokey maketx addpkg -pkgpath gno.land/p/nym-golfer000/course -pkgdir /tmp/stage/gno.land/p/nym-golfer000/course \
  -gas-wanted 100000000 -gas-fee 120000ugnot -max-deposit 6000000ugnot -broadcast $P <your-key-name>
```

Check: https://pearl.testnets.gno.land/p/nym-golfer000/course$source.

**5. Deploy golf** (15.69 GNOT; its init makes you the owner):

```sh
gnokey maketx addpkg -pkgpath gno.land/r/nym-golfer000/golf -pkgdir /tmp/stage/gno.land/r/nym-golfer000/golf \
  -gas-wanted 220000000 -gas-fee 264000ugnot -max-deposit 21000000ugnot -broadcast $P <your-key-name>
```

Check: `gnokey query vm/qeval -data 'gno.land/r/nym-golfer000/golf.Owner()' $R` → `<your-address>`; https://pearl.testnets.gno.land/r/nym-golfer000/golf shows the hub ("No hole yet", "the course's owner, now <you>").

**6. Generate the publish scripts** for the namespace (7 holes a script). Pearl needs `REALM`: the committed `scripts/publish/` import the local `gno.land/r/gnogolf/golf`, and `OUT` keeps them as they are:

```sh
REALM=gno.land/r/nym-golfer000/golf OUT=/tmp/pub scripts/publishdata.sh
```

**7. Publish the 74 holes** (75.90 GNOT), one script after the other. A script run twice skips the slots it already published, so a failed one is simply run again:

```sh
gnokey maketx run -gas-wanted  830000000 -gas-fee  996000ugnot -max-deposit  9000000ugnot -broadcast $P <your-key-name> /tmp/pub/publish-01.gno
gnokey maketx run -gas-wanted  630000000 -gas-fee  756000ugnot -max-deposit  8000000ugnot -broadcast $P <your-key-name> /tmp/pub/publish-02.gno
gnokey maketx run -gas-wanted  920000000 -gas-fee 1104000ugnot -max-deposit  9000000ugnot -broadcast $P <your-key-name> /tmp/pub/publish-03.gno
gnokey maketx run -gas-wanted  800000000 -gas-fee  960000ugnot -max-deposit  9000000ugnot -broadcast $P <your-key-name> /tmp/pub/publish-04.gno
gnokey maketx run -gas-wanted 1010000000 -gas-fee 1212000ugnot -max-deposit 13000000ugnot -broadcast $P <your-key-name> /tmp/pub/publish-05.gno
gnokey maketx run -gas-wanted  970000000 -gas-fee 1164000ugnot -max-deposit  9000000ugnot -broadcast $P <your-key-name> /tmp/pub/publish-06.gno
gnokey maketx run -gas-wanted 1120000000 -gas-fee 1344000ugnot -max-deposit 11000000ugnot -broadcast $P <your-key-name> /tmp/pub/publish-07.gno
gnokey maketx run -gas-wanted 1030000000 -gas-fee 1236000ugnot -max-deposit  9000000ugnot -broadcast $P <your-key-name> /tmp/pub/publish-08.gno
gnokey maketx run -gas-wanted  900000000 -gas-fee 1080000ugnot -max-deposit 11000000ugnot -broadcast $P <your-key-name> /tmp/pub/publish-09.gno
gnokey maketx run -gas-wanted  950000000 -gas-fee 1140000ugnot -max-deposit 10000000ugnot -broadcast $P <your-key-name> /tmp/pub/publish-10.gno
gnokey maketx run -gas-wanted  320000000 -gas-fee  384000ugnot -max-deposit  7000000ugnot -broadcast $P <your-key-name> /tmp/pub/publish-11.gno
```

Each prints the version ids it published (`extras/10/v1` …). Check after each: https://pearl.testnets.gno.land/r/nym-golfer000/golf lists the cups filling in.

**8. Verify** every slot, simulated (free):

```sh
gnokey maketx run -simulate only -gas-wanted 500000000 -gas-fee 600000ugnot $P <your-key-name> /tmp/pub/verify.gno
```

It must print `74 slots hold their data; missing or other:` with nothing after it.

**9. Point the client** at pearl: `NEXT_PUBLIC_RPC=https://rpc.pearl.testnets.gno.land:443`, `NEXT_PUBLIC_WEB=https://pearl.testnets.gno.land`, `NEXT_PUBLIC_REALM=gno.land/r/nym-golfer000/golf` (see the hardcoded paths below first).

The same list as gnomcp calls (what the rehearsal ran, and a pearl dry run could): `gno_call(namereg/v1, Register, [nym-golfer000])` → `gno_addpkg` ×3 with the staged files → `gno_eval(golf, Owner())` → `gno_run` ×11 with the publish scripts → `gno_run(verify.gno, simulate)`. gnomcp cannot run step 5 on pearl as it stands: it pins `-max-deposit` to 10 GNOT on addpkg (problem 5), and it deploys as its agent key, not the user.

## Paths still naming `gnogolf`

In `web/` (not edited: another agent owns it):

- `web/lib/chain.ts:43`: the fallback realm `gno.land/r/gnogolf/golf` when `NEXT_PUBLIC_REALM` is unset or malformed. Intended for local dev; a pearl build must set the variable.
- `web/.env.example`: `NEXT_PUBLIC_RPC=https://rpc.testnet.gno.land:443`, `NEXT_PUBLIC_WEB=https://testnet.gno.land`, and no `NEXT_PUBLIC_REALM`. For pearl it needs the three values of step 9.
- `web/components/Golf.tsx:1849`: the "get a name ↗" link goes to `${web}/r/gnoland/users`, which pearl does not have (registration is `r/sys/namereg/v1`). **A bug on pearl.**
- `web/lib/card.ts:36–51`: `OLD_REALM = "gno.land/r/gnogolf/"`, the migration from old realm ids to slots. Intended.
- `web/lib/scene/title-holes.json`: the title's baked snapshot carries old ids (`gno.land/r/gnogolf/hole4` …). Static decor; it does not reach the chain.
- Comments only: `web/lib/types.ts:1`, `web/lib/chain.ts:18`.
- Log prefixes, the Adena memo `"gnogolf"` and the `gnogolf.*` storage keys: names, not paths.

Elsewhere:

- `media/lib/cdp.mjs:101`: `chainUp()` polls `gno.land/r/gnogolf/golf.Period()`, so the media scripts' wait-for-chain never succeeds against a namespaced chain. It did not matter here (the rehearsal script did not call it). Could take the realm from the environment like `RPC` and `APP`.
- `scripts/stage.sh`, `scripts/holedata.sh`, `scripts/paritydata.sh`, `scripts/selfcheck.ts`: they read the canonical `gnogolf` tree on purpose.
- `scripts/publishdata.sh`: defaults to `gno.land/r/gnogolf/golf`; `REALM` overrides it.
- The committed `scripts/publish/*.gno` import `gno.land/r/gnogolf/golf`: regenerate with `REALM` (step 6) rather than use them on pearl.

## Problems hit, and their fixes

1. **No pearl `gnoland` binary.** Only the pearl `gno` was in the toolchain store. Fix: `GOBIN=~/.cache/gno-toolchains/pearl go install github.com/gnolang/gno/gno.land/cmd/gnoland@c4c72fdd288c`.
2. **A lazy genesis loads every example.** `gnoland start -lazy` deploys all of `$GNOROOT/examples`, far more than pearl. Fix: a GNOROOT of symlinks (`gnovm`, `gno.land`, `tm2`) with an `examples/` of only pearl's 85 packages, from `gno tool deplist -test-dep` over pearl's `FILTERED_PACKAGES`.
3. **Genesis panicked: "PubKey does not match Signer address g1manfred…".** Packages whose `gnomod.toml` names an `[addpkg] creator` are deployed under that creator, but the lazy genesis signs them with the node's key. Fix: `-skip-genesis-sig-verification` (pearl's own genesis uses it) and the seven creator addresses funded in the balances file.
4. **gnomcp needs the node up to add a profile, and the key's address before the genesis.** Fix: boot once with an empty genesis, `gno_profile_add` + `gno_key_generate` ×2, stop, write the balances, boot for real. A restart over the same secrets then stalled at height 0: the old `priv_validator_state.json` (height 170) refused to sign again. Fix: delete it with the database.
5. **golf cannot be deployed through gnomcp.** `gno_addpkg` pins `-max-deposit` to 10 GNOT; golf locks 15.69 at pearl's price ("not enough deposit … requires 15685500ugnot for 156855 bytes", at simulation, no gas spent). Fix for the rehearsal: `storage_price` = 1 ugnot in the genesis, bytes read from the events, × 100 for pearl. On pearl the user deploys with gnokey and `-max-deposit 21000000ugnot` (step 5). Worth raising with gnomcp: a `max_deposit` argument on `gno_addpkg`.
6. **`publishdata.sh` would overwrite the committed scripts.** It always wrote to `scripts/publish/` after an `rm -rf`, whatever the realm. Fixed in `scripts/publishdata.sh`: `OUT` sets the directory (default unchanged).
7. **`publishdata.sh`'s default split did not match the committed set.** The default was 10 holes a script; the committed set is 7 a script, and 10 of the heavier holes come to ~1.2e9 gas, past gnomcp's 1e9 measuring ceiling. Fixed: the default is now 7, and its output with no arguments is byte-for-byte the committed `scripts/publish/`. (The last script's header still says "holes 71-77" for 71–74; cosmetic, left so the committed files do not change.)
8. **gnomcp caps a write's gas-wanted at 1e9.** publish-07 used 856.5M of it (14% headroom). It passed; with gnokey the user sets 1.12e9 (step 7). A heavier set of seven would need splitting for gnomcp.
9. **One of the rehearsal's own hand-copied scripts had a typo in mountain/8's hex.** The chain refused the whole script at simulation ("course: a point lies off the board"), nothing was published, and the corrected script went through. On pearl the scripts are files, so this cannot happen; it does show a corrupted hole cannot be published silently (the decode bounds, `Exact` and the re-`Encode` check stop it, and `verify.gno` checks every sha).
10. **The data publish costs twice the design's estimate: 75.9 GNOT, not ~39.** 10,256 bytes a hole, of which ~1,900 are the GG1 string; the rest is the `entry` (three `avl.NewTree()` made up front for `rounds` and the two `bests`, the name, slot, sha, note…) and the keys in `courseHoles`, `holeData` and `slots`. **Fixed after the rehearsal (final fixes):** a version's rounds and records are made at the first stroke and the first finish, as B+ trees; before that its entry holds no tree, array or record object (each was an object of its own, a few hundred bytes even empty). Measured in filetests on the same eight course holes, a further publish went from 8,993 to 4,975 bytes a hole (−45%: ~3.2 KB besides the data, against ~7.2 KB). Scaled to the rehearsal's 10,256 bytes a hole, that is about 6,240 a hole, ~462 KB and **~46 GNOT for the 74 holes** instead of 75.9 (an estimate from the filetests, not a new rehearsal). The first finisher on a version now pays the first leaves of its trees instead (about 17 KB with a new player's standing, from 9.9 KB); a later player pays less (3.2 KB for a new player's first finish at 50 players, from 6.5 KB; 1.9 KB on a further hole, from 5.3 KB).
11. **The web client's "get a name" link points at `r/gnoland/users`,** absent on pearl (see above). Reported, not fixed.

## Left running

Nothing: the rehearsal chain (`:26767`) and the second dev server (`:3310`) were stopped. The existing gnodev (`:26757`) and dev server (`:3300`) were not touched. The rehearsal chain's state is kept in the session scratch (`node/`), and restarts with the same `gnoland start` line.
