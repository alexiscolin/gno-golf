# Deploy v1, Phase 4: the pearl rehearsal (2026-09-25)

This rehearsal took the exact artefacts of the pearl deploy and ran them on a throwaway chain built from the pearl tag, measuring every cost. The artefacts are the three packages from `scripts/stage.sh nym-golfer000`, and the 74 holes of `data/holes.txt` as data. The run deployed, published and played them, then checked the owner functions. Nothing was broadcast to pearl.

There were three runs. The **first** ran on the code of `162a6e9`. The **second** ran on HEAD `82c7196`, which is `62488e6` ("golf before the freeze") plus a `cdp.mjs` change that has no effect on the chain. The **third**, which this page reports, ran on the final code, HEAD `3432d52` ("shared indexes make a first finish cost about 3.4 KB; board render bounded for any polygon"). It started from a fresh genesis and followed run 2's method step for step. All the numbers below come from run 3. The previous runs' numbers are given next to them for comparison. The owner handover (`Transfer`/`Accept`) and the reading of pearl's own values come from run 1 only.

## The rehearsal chain

- **Binary:** `gnoland` built from `chain/pearl` = `c4c72fdd288c` and installed as `~/.cache/gno-toolchains/pearl/gnoland`. This is the tag that the pearl `gno` in `~/.cache/gno-toolchains/pearl/` is built from. It is not gnodev.
- **Genesis:** a GNOROOT whose `examples/` holds exactly pearl's package set. Pearl's `FILTERED_PACKAGES`, from `misc/deployments/pearl.gno.land/gen-genesis.sh`, resolved with `gno tool deplist -test-dep`, give 85 packages, the same count as pearl. None of them are ours. Chain id `test-rehearsal`, RPC `127.0.0.1:26767`, P2P `:26766`, run under `nice`, with `-skip-genesis-sig-verification`. One difference from pearl: `names.Enable` (namespace enforcement) is not set at genesis. The name was registered first anyway, as it will be on pearl.
- **Fresh start for runs 2 and 3:** the same `genesis.json` and node secrets as run 1. Before each run the `db/`, the `wal/` and `priv_validator_state.json` were deleted, so the chain replayed its genesis from height 0. Start line: `nice gnoland start -chainid test-rehearsal -genesis node/genesis.json -data-dir node/gnoland-data -gnoroot-dir pearlroot -skip-genesis-sig-verification`.
- **Params:** every VM and auth param that prices gas matches pearl. Both were read live in run 1: `preprocess_gas_per_byte` 1250, the read/write depth costs, `iter_next_cost_flat` 1000, `tx_size_cost_per_byte` 10, the sig costs, gas price `1ugnot/1000gas`, block max gas 3e9, `default_deposit` 100 GNOT, `code_submission_policy` permissionless.
  - One param differs on purpose: `storage_price` is `1ugnot` in the genesis, against pearl's `100ugnot` (see problem 5).
  - Gas does not depend on the storage price, and each transaction's `StorageDepositEvent` gives its exact byte count. Every deposit below is those bytes × pearl's 100 ugnot.
- **gnomcp:** profile `rehearsal`, with two agent keys: `default` (`g1sz0h…5ent`, the deployer and owner) and `heir` (`g10g3j…8ctx`, the non-owner and the second player). Both keys are funded at genesis.
  - In runs 2 and 3 every write went through gnomcp. A small stdio driver (`mcp.py`, in the session scratch) started `gnomcp` and sent it `tools/call` requests. It read each file body from the staged tree or from the generated scripts on disk. gnomcp signed with its own keystore. No gnokey was used, and no key material was touched.
  - Because the bodies were read from disk, the run-1 risk of a mistyped hand copy (problem 9) is gone.
- **Byte identity:** every `.gno` file of the three packages was read back over `vm/qfile` and compared with the staged tree using `cmp`. All 15 files are byte-identical (runs 2 and 3).

## The numbers

"Deposit" is pearl GNOT at 100 ugnot a byte. "Gas" is the gas used. At `1ugnot/1000gas`, the fee floor is gas ÷ 1000 ugnot.

### Name and code

`scripts/stage.sh nym-golfer000` staged the packages and linted them with the pearl `gno lint`, which passed. Source sizes: physics 51,025 B, course 50,762 B, golf 120,075 B (116,392 in run 2).

| Step | Gas | Bytes | Deposit | Run 2 | Run 1 |
|---|---|---|---|---|---|
| `namereg/v1.Register("nym-golfer000")` | 25.4M | 3,326 | 0.33 GNOT | same | same |
| addpkg `p/nym-golfer000/physics` | 74.5M | 42,182 | 4.22 GNOT | same | 72.4M, 4.34 |
| addpkg `p/nym-golfer000/course` | 78.2M | 44,870 | 4.49 GNOT | same | 76.7M, 4.40 |
| addpkg `r/nym-golfer000/golf` (its init and globals included) | 190.2M | 203,451 | **20.35 GNOT** | 183.1M, 173,463 (17.35) | 164.6M, 15.69 |
| **Name + code** | 368.4M | 293,829 | **29.38 GNOT** | 361.3M, 263,841 (26.38) | 339.1M, 24.76 |

golf's storage grew by 29,988 bytes (+3.0 GNOT) over run 2. Its source grew by only 3.7 KB. The difference is the shared indexes that `3432d52` creates at init, which take storage off every first finish (see Playing).

`Owner()` after the golf addpkg returns the deployer (`g1sz0h…5ent`), because golf's init captures `OriginCaller`.

### The 74 holes as data

The scripts come from `REALM=gno.land/r/nym-golfer000/golf OUT=<scratch> scripts/publishdata.sh`, at 7 holes a script. The generated scripts are byte-identical to run 2's. Each script was run with `gno_run`:

| Script | Holes | Gas | Bytes | Deposit | Run 2 (gas, bytes) | Run 1 bytes |
|---|---|---|---|---|---|---|
| publish-01 | extras/10, extras/16, garden/1–5 | 632.7M | 47,862 | 4.79 | 629.0M, 48,520 | 62,987 |
| publish-02 | garden/6–12 | 483.2M | 32,208 | 3.22 | 479.3M, 32,866 | 60,908 |
| publish-03 | garden/13–18, island/1 | 707.9M | 35,357 | 3.54 | 704.0M, 36,015 | 64,057 |
| publish-04 | island/2–8 | 615.1M | 34,449 | 3.44 | 611.3M, 35,107 | 63,149 |
| publish-05 | island/9–15 | 774.1M | 65,942 | 6.59 | 770.1M, 66,600 | 94,582 |
| publish-06 | island/16–18, mountain/1–4 | 742.6M | 35,650 | 3.56 | 738.9M, 36,308 | 64,350 |
| publish-07 | mountain/5–11 | **858.5M** | 53,102 | 5.31 | 854.6M, 53,760 | 82,060 |
| publish-08 | mountain/12–18 | 790.4M | 37,296 | 3.73 | 786.9M, 37,954 | 66,218 |
| publish-09 | town/1–7 | 680.6M | 34,494 | 3.45 | 676.2M, 35,152 | 78,059 |
| publish-10 | town/8–14 | 738.8M | 59,326 | 5.93 | 734.8M, 59,984 | 73,796 |
| publish-11 | town/15–18 | 253.9M | 18,679 | 1.87 | 251.6M, 19,055 | 48,806 |
| **74 holes** | | **7,277.8M** | **454,365** | **45.44 GNOT** | 7,236.6M, 461,321 (46.13) | 758,972 (75.90 GNOT) |

- A hole takes **6,140 bytes on average, which is 0.61 GNOT**, against 6,234 in run 2 and 10,256 in run 1. Every script is 658 bytes lighter than in run 2 (376 for publish-11, which has 4 holes): a version no longer builds trees of its own. The gas rose by 0.6%, to about 98M a hole.
- The first script is the heaviest per hole because it also creates the course-wide trees.
- `verify.gno`, simulated, printed **"74 slots hold their data; missing or other:"** with nothing after it. It used 345.7M gas (345.5M in run 2).

### Playing

These were real transactions, on the published holes, in period 5967805 (run 2: 5967793). The same plans holed in 1 in both periods. `default` is the named deployer; `heir` has no name. The calls ran in run 2's order: first finish, second hole, Reset, replay, new player, MsgRun.

| Call | Gas | Bytes | Deposit | Run 2 | Run 1 |
|---|---|---|---|---|---|
| `PlayRoundAt(extras/10/v1, "0,7.5")` by `default`, holed in 1. This is the first finish on the course: it creates the mode's standing and ranking rows and the player's first rows in the shared indexes. | 47.5M | 5,403 | **0.54 GNOT** | 44.4M, 25,592 (2.56) | 16,900 (1.69) |
| `PlayRoundAt(extras/16/v1, "332,9.25")` by `default`, holed in 1: the same player's first finish on a second hole, and the first finish on that hole | 58.6M | 3,406 | 0.34 GNOT | 46.2M, 14,765 (1.48) | 6,039 (0.60), not the first on its hole |
| `Reset(extras/10/v1)` | 13.5M | −1,512 (refunded) | −0.15 GNOT | 11.8M, −4,518 | −2,155 |
| `PlayRoundAt(extras/10/v1)` again: a replay with the same score | 45.5M | 1,524 | 0.15 GNOT | 43.1M, 4,536 | 2,161 (0.22) |
| `PlayRoundAt(extras/10/v1)` by `heir`: a new player's first finish on a hole someone has already finished | 46.2M | 3,311 | 0.33 GNOT | 45.0M, 3,336 | 6,561 (0.66) |
| A MsgRun of `Reset` + `PlayRoundAt(extras/10/v1)` in one transaction, as the client records a replay | 55.3M | −6 | ~0 | 52.8M, −6 | 77.1M, 6 |

The final code puts every version's rounds, bests and board in shared indexes, whose first leaves golf pays at init. A first finish now costs 3.3–3.4 KB whoever is first on the hole, and 5.4 KB for the course's very first finish in a mode (25.6 KB in run 2). The price is 3.0 GNOT more on golf's addpkg, paid once by the deployer, and 1–12M more gas a call (the searches by index in the shared trees; 58.6M on extras/16, the most of any play). A replay after a Reset still costs as much as the Reset refunds, now 0.15 GNOT.

### Owner functions (simulated)

| Call | Signer | Result |
|---|---|---|
| `SetPlayURL("https://gno-golf.netlify.app/")` | `default` (owner) | ok, 11.5M gas (run 2: 11.2M) |
| `SetSuccessor("gno.land/r/nym-golfer000/golf2")` | `default` (owner) | ok, 11.7M gas (run 2: 11.2M) |
| `SetPlayURL("https://evil.example/")` | `heir` | **refused**: "golf: only the owner can move the play link" |
| `SetSuccessor("gno.land/r/nym-golfer000/golf2")` | `heir` | **refused**: "golf: only the owner can name a successor" |

These calls were simulated only, so `Successor()` is still `""` afterwards. The hub page already links to `https://gno-golf.netlify.app/` (the default `playURL`), so **pearl does not need `SetPlayURL`**. The command list keeps it as an optional step, for use if the site moves.

Run 1 checked the handover (`Transfer(heir)` → `Accept()` → back again), and every step worked as specified. Pearl does not need it: the user deploys golf with their own key, so golf's init makes the user the owner.

### The web client

A second dev server ran `next dev -p 3310` from a fresh copy of `web/`, sharing its `node_modules`, with `NEXT_PUBLIC_RPC=http://127.0.0.1:26767` and `NEXT_PUBLIC_REALM=gno.land/r/nym-golfer000/golf`.

Headless Chrome ran through `media/lib/cdp.mjs`: muted, one browser, killed after the test. `chainUp()` now polls the realm from `REALM` and succeeded against the namespaced chain.

- **extras/10, island/6, mountain/7 and town/18** each loaded, drew, and replayed a chain-simulated shot (the first shot of each hole's best plan). extras/10 was holed in one. There was no page error (runs 2 and 3).
- The page talked only to `127.0.0.1:3310`, `127.0.0.1:26767`, and Google Fonts.
- Screenshots: `media/rehearsal-{extras-10,island-6,mountain-7,town-18}.jpg`.

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

## Projection for pearl (measured, run 3)

| Item | GNOT | Run 2 | Run 1 |
|---|---|---|---|
| Name deposit | 0.33 | 0.33 | 0.33 |
| Code deposit (3 packages) | 29.05 | 26.05 | 24.43 |
| 74 holes' deposit | 45.44 | 46.13 | 75.90 |
| **Deposit** | **74.82** | 72.52 | 100.65 |
| Fees: the 15 transactions below, each at its gas-wanted (1.3× measured) and 1.2× the price floor | 12.02 (7.65 at the floor) | 11.95 | 11.93 |
| **Total** | **86.84** | 84.47 | 112.6 |
| **With a 15% margin** | **99.9, so ask for ~100 GNOT** | 97.1 | ~130 |

100 GNOT now covers the margin with almost nothing to spare. Asking for 105 GNOT leaves room for one failed-and-rerun publish script. At the faucet's 10 GNOT a day for one address, 100 GNOT takes 10 days, so ask the faucet operators or GovDAO instead. The deposit is locked for good, because published data is never freed.

The deploy order also bounds when the money is needed:

- about 30 GNOT for the name and the code, of which golf alone takes 20.4;
- then 2–7 GNOT for each publish script.

For players on pearl:

- A round costs 0.05–0.06 GNOT in fees at the floor (45–59M gas).
- A first finish on a hole also costs a deposit of about 0.34 GNOT (3.3–3.4 KB), whether or not someone has finished the hole before.
- The very first finish in a mode on the whole course costs 0.54 GNOT.
- A replay after a Reset costs 0.15 GNOT, which is what the Reset refunds.

## The command list for pearl

The user runs these commands with their own key, in this order. The key is written `<your-key-name>` below, and its address `<your-address>`. Every transaction takes `-chainid pearl-1 -remote https://rpc.pearl.testnets.gno.land:443`, shortened to `$P` below. The read-only checks take only the remote, `$R`:

```sh
P="-chainid pearl-1 -remote https://rpc.pearl.testnets.gno.land:443"   # for maketx
R="-remote https://rpc.pearl.testnets.gno.land:443"                    # for query
```

How each flag is sized, from the run-3 measurements:

- **Gas-wanted:** the measured gas × 1.3, rounded up to 10M.
- **Fee:** gas-wanted at 1.2× the floor. The chain takes the whole fee, so the margin stays small.
- **`-max-deposit`:** the measured deposit × 1.3, rounded up to 1 GNOT.

gnokey simulates a transaction before it broadcasts it (`-simulate test`, the default), so a transaction that would fail costs nothing.

**0. Fund** the key with ~100 GNOT. Check: `gnokey query auth/accounts/<your-address> $R`.

**1. Register the name** (0.33 GNOT deposit, no `-send`):

```sh
gnokey maketx call -pkgpath gno.land/r/sys/namereg/v1 -func Register -args nym-golfer000 \
  -gas-wanted 40000000 -gas-fee 48000ugnot -max-deposit 1000000ugnot -broadcast $P <your-key-name>
```

Check: `gnokey query vm/qeval -data 'gno.land/r/sys/names.IsAuthorizedAddressForNamespace(address("<your-address>"), "nym-golfer000")' $R` returns `true`. Or open https://pearl.testnets.gno.land/u/nym-golfer000.

**2. Stage** the three packages. This also lints them with the pearl toolchain and prints their sizes: 50,762 / 51,025 / 120,075 B.

```sh
scripts/stage.sh nym-golfer000 /tmp/stage
```

**3. Deploy physics** (4.22 GNOT):

```sh
gnokey maketx addpkg -pkgpath gno.land/p/nym-golfer000/physics -pkgdir /tmp/stage/gno.land/p/nym-golfer000/physics \
  -gas-wanted 100000000 -gas-fee 120000ugnot -max-deposit 6000000ugnot -broadcast $P <your-key-name>
```

Check: https://pearl.testnets.gno.land/p/nym-golfer000/physics$source.

**4. Deploy course** (4.49 GNOT):

```sh
gnokey maketx addpkg -pkgpath gno.land/p/nym-golfer000/course -pkgdir /tmp/stage/gno.land/p/nym-golfer000/course \
  -gas-wanted 110000000 -gas-fee 132000ugnot -max-deposit 6000000ugnot -broadcast $P <your-key-name>
```

Check: https://pearl.testnets.gno.land/p/nym-golfer000/course$source.

**5. Deploy golf** (20.35 GNOT; its init makes you the owner):

```sh
gnokey maketx addpkg -pkgpath gno.land/r/nym-golfer000/golf -pkgdir /tmp/stage/gno.land/r/nym-golfer000/golf \
  -gas-wanted 250000000 -gas-fee 300000ugnot -max-deposit 27000000ugnot -broadcast $P <your-key-name>
```

Check: `gnokey query vm/qeval -data 'gno.land/r/nym-golfer000/golf.Owner()' $R` returns `<your-address>`. https://pearl.testnets.gno.land/r/nym-golfer000/golf shows the hub, with its "open the game" link going to https://gno-golf.netlify.app/.

**6. Generate the publish scripts** for the namespace, 7 holes a script. The committed `scripts/publish/` import the local `gno.land/r/gnogolf/golf`, so pearl needs `REALM`. `OUT` leaves the committed scripts as they are.

```sh
REALM=gno.land/r/nym-golfer000/golf OUT=/tmp/pub scripts/publishdata.sh
```

**7. Publish the 74 holes** (45.44 GNOT), one script after the other. A script that runs twice skips the slots it has already published, so if one fails, run it again:

```sh
gnokey maketx run -gas-wanted  830000000 -gas-fee  996000ugnot -max-deposit 7000000ugnot -broadcast $P <your-key-name> /tmp/pub/publish-01.gno
gnokey maketx run -gas-wanted  630000000 -gas-fee  756000ugnot -max-deposit 5000000ugnot -broadcast $P <your-key-name> /tmp/pub/publish-02.gno
gnokey maketx run -gas-wanted  930000000 -gas-fee 1116000ugnot -max-deposit 5000000ugnot -broadcast $P <your-key-name> /tmp/pub/publish-03.gno
gnokey maketx run -gas-wanted  800000000 -gas-fee  960000ugnot -max-deposit 5000000ugnot -broadcast $P <your-key-name> /tmp/pub/publish-04.gno
gnokey maketx run -gas-wanted 1010000000 -gas-fee 1212000ugnot -max-deposit 9000000ugnot -broadcast $P <your-key-name> /tmp/pub/publish-05.gno
gnokey maketx run -gas-wanted  970000000 -gas-fee 1164000ugnot -max-deposit 5000000ugnot -broadcast $P <your-key-name> /tmp/pub/publish-06.gno
gnokey maketx run -gas-wanted 1120000000 -gas-fee 1344000ugnot -max-deposit 7000000ugnot -broadcast $P <your-key-name> /tmp/pub/publish-07.gno
gnokey maketx run -gas-wanted 1030000000 -gas-fee 1236000ugnot -max-deposit 5000000ugnot -broadcast $P <your-key-name> /tmp/pub/publish-08.gno
gnokey maketx run -gas-wanted  890000000 -gas-fee 1068000ugnot -max-deposit 5000000ugnot -broadcast $P <your-key-name> /tmp/pub/publish-09.gno
gnokey maketx run -gas-wanted  970000000 -gas-fee 1164000ugnot -max-deposit 8000000ugnot -broadcast $P <your-key-name> /tmp/pub/publish-10.gno
gnokey maketx run -gas-wanted  340000000 -gas-fee  408000ugnot -max-deposit 3000000ugnot -broadcast $P <your-key-name> /tmp/pub/publish-11.gno
```

Each script prints the version ids it published (`extras/10/v1` …). After each one, check that https://pearl.testnets.gno.land/r/nym-golfer000/golf lists more cups.

**8. Verify** every slot. This is a simulation, so it costs nothing:

```sh
gnokey maketx run -simulate only -gas-wanted 450000000 -gas-fee 540000ugnot $P <your-key-name> /tmp/pub/verify.gno
```

It must print `74 slots hold their data; missing or other:` with nothing after it.

**(9. Only if the site moves) Set the play link.** The default is already `https://gno-golf.netlify.app/`, so skip this step for that site. It measured 11.5M gas and no deposit:

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

gnomcp cannot run step 5 on pearl as it stands, for two reasons. It pins `-max-deposit` to 10 GNOT on addpkg, and golf needs 20.35 GNOT (problem 5). It also deploys as its agent key, not as the user.

## Netlify environment

These are the values for the site (see `netlify.toml`; `web/.env.example` carries the same set):

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | `https://gno-golf.netlify.app` |
| `NEXT_PUBLIC_REALM` | `gno.land/r/nym-golfer000/golf` |
| `NEXT_PUBLIC_RPC` | `https://rpc.pearl.testnets.gno.land:443` |
| `NEXT_PUBLIC_WEB` | `https://pearl.testnets.gno.land` |

`NEXT_PUBLIC_ALLOWED_HOSTS` stays unset: pearl's hosts end in `.gno.land`, which `chain.ts` allows already. `chain.ts` accepts the realm when it matches `^gno\.land/r/[a-z0-9_-]+/golf$` and otherwise falls back to the local `gno.land/r/gnogolf/golf`, so a pearl build must set it.

## Paths still naming `gnogolf`

Two run-1 findings are fixed since:

- The "get a name ↗" link (`web/components/Golf.tsx:1851`) now points at `${web}/r/sys/namereg/v1`.
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
5. **gnomcp cannot deploy golf on pearl.** `gno_addpkg` pins `-max-deposit` to 10 GNOT, and golf now needs **20.35** GNOT at pearl's price (17.35 in run 2, 15.69 in run 1).
   - Workaround for the rehearsal: `storage_price` = 1 ugnot in the genesis, with the bytes read from the events and multiplied by 100 for pearl.
   - On pearl, the user deploys with gnokey and `-max-deposit 27000000ugnot` (step 5).
   - Still worth raising with gnomcp: a `max_deposit` argument on `gno_addpkg`.
6. **`publishdata.sh` overwrote the committed scripts.** Fixed: `OUT` sets the output directory.
7. **`publishdata.sh`'s default split did not match the committed set.** Fixed: the default is 7 holes a script.
8. **gnomcp caps a write's gas-wanted at 1e9.** publish-07 still uses the most gas, 858.5M (854.6M in run 2), which leaves 14% headroom. It passes through gnomcp. With gnokey, the user sets 1.12e9 (step 7).
9. **A hand-copied script had a typo in run 1,** and the chain refused it at simulation. In run 2 every body was read from disk by the stdio driver, so nothing was copied by hand.
10. **The data publish cost twice the design's estimate in run 1: 75.9 GNOT.** Fixed in `62488e6`, and measured at **46.13 GNOT** in run 2 (6,234 bytes a hole) and **45.44 GNOT** in run 3 (6,140). This matches the filetest estimate of ~46. In run 2 the cost moved to the first finisher on each version (1.5 GNOT, or 2.6 GNOT for the course's very first finish in a mode), and every later player paid half what they did. `3432d52` moved those trees into shared indexes paid at golf's init (+3.0 GNOT on the addpkg), so in run 3 every first finish costs about 0.34 GNOT, and the course's very first one 0.54 GNOT.
11. **The "get a name" link pointed at `r/gnoland/users`.** Fixed in `web/` since run 1.

Run 2 found no new problem in the code. Two notes:

- The weather in period 5967793 made garden/3's one-shot plan (`0,8`, which holed in run 1) roll through the hole on ice. The play tests used extras/10 and extras/16 instead, whose plans held in that period. This is the weather working as designed, not a bug. `scripts/hole-bests.json` plans are for their recorded periods.
- `golf` grew by 16.6 KB of storage (+1.66 GNOT) over run 1. This is the final fixes' code: lazy trees, the owner-set play link, the successor, and the safer pages.

Run 3 found no new problem in the code either. Every step passed on the first try, and no plan had to be swapped: in period 5967805 the plans of extras/10, extras/16, garden/1–3, garden/5 and garden/14 all held. Two notes:

- The total with its 15% margin is now 99.9 GNOT, against 97.1 in run 2, because golf's init pays 3.0 GNOT for the shared indexes. "Ask for ~100 GNOT" still holds, but only just: ask for 105 to keep room for a rerun.
- Gas rose a little everywhere in golf: +7.1M on its addpkg, +0.6% on the publishes, and +1–12M on a play call (58.6M for the first finish on extras/16, against 46.2M). The heaviest round stays far below any limit, and publish-07 (858.5M) still fits gnomcp's 1e9 cap.

## Left running

Nothing is left running after run 3. The rehearsal chain (`:26767`) and the second dev server (`:3310`) were stopped, and the Chrome started by the smoke test was killed. The existing gnodev (`:26757`) and dev server (`:3300`) were not touched. The rehearsal chain's state is kept in the session scratch (`node/`), and it restarts with the same `gnoland start` line.
