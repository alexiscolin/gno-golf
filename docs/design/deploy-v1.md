# Deploy v1: Gnogolf on onyx

> The target is onyx (`onyx-1`, mainnet's code v1.5.0). **The deploy is the runbook just below.** Sections 0 to 19 are the design as it was written for pearl (2026-09-25), kept as history: their costs, their pearl command lists (here and in `deploy-v1-rehearsal.md`) and their `maketx run` steps no longer apply.

## Onyx deploy, step by step

Everything is signed by the owner's key **`GnoAlex`** (`g1mpkp5lm8lwpm0pym4388836d009zfe4maxlqsq`, single-sig, in gnokey's default keystore). It registers the namespace, submits the three packages, publishes the holes and stays the golf realm's owner: golf's init makes the package's creator the owner, and on onyx the init runs when the package is approved, still with the creator as its origin caller (gno-onyx `gno.land/pkg/sdk/vm/keeper_inert.go`). Keep its recovery phrase offline: losing the key freezes the course (nobody can publish or hand the role on), and the namespace goes with the key, not with the golf role.

| | |
|---|---|
| Chain | `onyx-1` |
| RPC | `https://rpc.onyx.testnets.gno.land:443` |
| gnoweb | `https://onyx.testnets.gno.land` |
| Namespace | `nym-golfer000`: valid, free and not canonically taken (read on onyx 2026-09-29) |
| Realm | `gno.land/r/nym-golfer000/golf` |
| Prices (read on onyx 2026-09-29) | gas `1ugnot/1000gas`, storage `100ugnot` a byte, default deposit cap 100 GNOT |
| Code submission | `inert`: an addpkg parks until the approver (`g1yaee4f2qt8yyzse54wq7r897ndupnvxcyl6adz`, the chain's `pkg_approvers`, run by the gpao oracle) enables it; no submission charge; the CLA is not enforced |

The commands are written for zsh or bash. Every transaction gets `-chainid onyx-1 -remote $RPC` in full, because zsh does not split a variable into several flags. gnokey simulates each transaction before it sends it, so a transaction that would fail costs nothing. It broadcasts by default: only `-simulate only` makes a dry run.

### Costs (estimates)

The costs come from the pearl rehearsal (runs 5 and 6, `deploy-v1-rehearsal.md`, at the same 100 ugnot a byte) and from the onyx gnodev measurements in the commits since (`33d39a2`, `1a47321`, `web/lib/adena.ts`). The deploy itself has not been rehearsed on onyx.

| Step | Deposit | Fees (at the flags below) |
|---|---|---|
| 1. Name | ~0.33 GNOT | 0.05 |
| 3. physics | ~4.5 GNOT | 0.16 |
| 3. course | ~4.8 GNOT | 0.13 |
| 3. golf (its init and shared indexes) | ~22.7 GNOT | 0.35 |
| 4. 74 holes | 45.3 GNOT (453,029 bytes, onyx gnodev) | ~11.5 (74 calls at `publishdata.sh`'s gas, 11.5e9 asked in all) |
| **Total** | **~77.6 GNOT** | **~12.2 GNOT** |

That makes **about 90 GNOT**. `GnoAlex` held 100 GNOT on onyx on 2026-09-29, which leaves about 10 for a rerun. The deposits are locked for good, since published data is never freed.

For players, these are the storage figures measured on an onyx gnodev since finished rounds stopped being kept:
- a named player's first finish on the course (in a mode) stores about 2.9 KB, **~0.29 GNOT**;
- each further hole stores 1,040 bytes, **~0.10 GNOT** (plus 512 bytes, 0.05, for the hole's wear if it is that version's first finish);
- a replay stores nothing.

A save also pays **about 0.05 GNOT** in fees: 49M to 60M gas at the floor, measured on pearl.

### 0. Prerequisites

- **gnokey from the onyx toolchain.** This is the one the README's "Running it locally" builds from the tag `chain/onyx` into `~/.cache/gno-toolchains/onyx`, and the one `scripts/publishdata.sh` uses. `media/check/bin-onyx/gnokey` is a local, git-ignored copy of the same build.

  ```sh
  export PATH=~/.cache/gno-toolchains/onyx:$PATH
  RPC=https://rpc.onyx.testnets.gno.land:443
  gnokey list | grep GnoAlex          # the key is there: g1mpkp5lm8lwpm0pym4388836d009zfe4maxlqsq
  ```

  A new machine needs the key restored once: `gnokey add GnoAlex --recover`, with its recovery phrase.
- **Funds: about 90 GNOT.** Check the balance:

  ```sh
  gnokey query bank/balances/g1mpkp5lm8lwpm0pym4388836d009zfe4maxlqsq -remote $RPC   # "100000000ugnot" on 09-29
  ```

  If it runs short, the faucet (https://faucet.gno.land) gives 10 GNOT an address every 24 h. For more, ask aeddi or the faucet team. The key must stay funded until the end of step 4, because each package's deposit is taken when it is approved, not when it is submitted.
- **The code.** The commit being deployed passes `scripts/check.sh`. Note its hash (`git rev-parse HEAD`): physics, course and golf are frozen once they are on chain.

### 1. Register the namespace

Registration is free on onyx (`r/sys/namereg/v0`, price 0 ugnot, so send nothing). Only a direct call from the key can register.

```sh
gnokey maketx call -pkgpath gno.land/r/sys/namereg/v0 -func Register -args nym-golfer000 \
  -gas-wanted 40000000 -gas-fee 48000ugnot -max-deposit 1000000ugnot \
  -broadcast -chainid onyx-1 -remote $RPC GnoAlex
```

Check that this returns `(true bool)`:

```sh
gnokey query vm/qeval -remote $RPC \
  -data 'gno.land/r/sys/names.IsAuthorizedAddressForNamespace(address("g1mpkp5lm8lwpm0pym4388836d009zfe4maxlqsq"), "nym-golfer000")'
```

You can also open https://onyx.testnets.gno.land/u/nym-golfer000. An address has one name, so `GnoAlex` will show as `nym-golfer000` on the boards if it plays.

### 2. Stage the packages

```sh
scripts/stage.sh nym-golfer000 /tmp/stage
```

This copies physics, course and golf, without their tests, into `/tmp/stage/gno.land/{p,r}/nym-golfer000/…`. The only change it makes is the namespace in the import paths. It then checks that:
- each staged package has exactly the repo's files, and each file matches the repo's byte for byte once the namespace is read back;
- no `gno.land/[pr]/gnogolf` is left;
- every `gnomod.toml` says `gno = "0.9"` and has no `replace`.

It lints the result with the onyx `gno` and prints the sizes. On 2026-09-29 these were course 37,488 B, physics 44,645 B and golf 134,215 B. Any error stops here.

### 3. Submit the packages, in order, and wait for each approval

Submit physics first, then course, then golf. Each one imports the one before, and the oracle leaves a package pending while one of its imports is still parked. So **do not submit the next package until the previous one is `live`**.

```sh
gnokey maketx addpkg -pkgpath gno.land/p/nym-golfer000/physics -pkgdir /tmp/stage/gno.land/p/nym-golfer000/physics \
  -gas-wanted 130000000 -gas-fee 156000ugnot -max-deposit 6000000ugnot \
  -broadcast -chainid onyx-1 -remote $RPC GnoAlex
```

Poll until it is live:

```sh
until gnokey query vm/qpkgmeta_json -data gno.land/p/nym-golfer000/physics -remote $RPC | grep -q '"status":"live"'; do sleep 10; done; echo live
```

`vm/qpkgmeta_json` answers `{"status":"inert","pending":true,"reason":"waiting for a package approver to enable it",…}` while the package waits, and `{"status":"live",…}` once it is enabled. `"absent"` means the submission never landed. `vm/qinertpaths` with `-data gno.land/p/nym-golfer000` lists what is still parked.

Then course:

```sh
gnokey maketx addpkg -pkgpath gno.land/p/nym-golfer000/course -pkgdir /tmp/stage/gno.land/p/nym-golfer000/course \
  -gas-wanted 110000000 -gas-fee 132000ugnot -max-deposit 7000000ugnot \
  -broadcast -chainid onyx-1 -remote $RPC GnoAlex
until gnokey query vm/qpkgmeta_json -data gno.land/p/nym-golfer000/course -remote $RPC | grep -q '"status":"live"'; do sleep 10; done; echo live
```

Then golf. Its init makes `GnoAlex` the owner, with community publishing closed:

```sh
gnokey maketx addpkg -pkgpath gno.land/r/nym-golfer000/golf -pkgdir /tmp/stage/gno.land/r/nym-golfer000/golf \
  -gas-wanted 290000000 -gas-fee 348000ugnot -max-deposit 30000000ugnot \
  -broadcast -chainid onyx-1 -remote $RPC GnoAlex
until gnokey query vm/qpkgmeta_json -data gno.land/r/nym-golfer000/golf -remote $RPC | grep -q '"status":"live"'; do sleep 10; done; echo live
```

- **The deposit is charged at approval,** from `GnoAlex`, up to the `-max-deposit` recorded at submission. An approval that finds the key short fails, and gpao retries it only a few times. So keep at least ~23 GNOT on the key until golf is live.
- **If a package stays `inert`:**
  1. Read its `reason`.
  2. If the package was submitted before its import was live, or the oracle missed it, run the same addpkg again. The same creator may replace its own parked package, the oracle sees the new submission, and it costs one more fee, no deposit.
  3. If it is still stuck, ask the onyx operators (aeddi) to look at the gpao oracle. Its status API says whether the package is `rejected`, `pending`, `gave_up` or `blocked` (the oracle's spend cap).
- Check the pages: https://onyx.testnets.gno.land/p/nym-golfer000/physics$source, …/course$source, and https://onyx.testnets.gno.land/r/nym-golfer000/golf (the hub, empty until step 4).

### 4. Publish the 74 holes

The script sends one plain `gnokey maketx call` of `Publish(slot, hex, "")` a hole, in the order of `data/holes.txt`. It asks the password once. Each call's gas is sized from its hole's data at the node's gas price, and its deposit is capped at `MAX_DEPOSIT`, 10 GNOT by default. A slot that already holds its data is skipped, so after a failure you just run it again. It ends by checking every slot.

```sh
REALM=gno.land/r/nym-golfer000/golf REMOTE=$RPC CHAINID=onyx-1 scripts/publishdata.sh GnoAlex
```

It prints the gas, storage and hash of each hole as it goes, and ends with `"every slot holds its data"`. You can run the check alone at any time: it is one read, with no key.

```sh
REALM=gno.land/r/nym-golfer000/golf REMOTE=$RPC scripts/publishdata.sh -verify
```

### 5. Owner settings

Nothing has to be sent at launch:
- `Publishing()` is already `false`: golf's init closes community publishing when a key deploys it, and `SetPublishing(false)` would be a no-op.
- The play link is already `https://gnogolf.xyz/`.

Check the owner and the settings:

```sh
for f in 'Owner()' 'Pending()' 'Publishing()' 'Successor()'; do
  gnokey query vm/qeval -data "gno.land/r/nym-golfer000/golf.$f" -remote $RPC
done
```

They should return `GnoAlex`'s address, `""`, `false` and `""`.

**Only if the game is served somewhere other than https://gnogolf.xyz/,** for example the Netlify URL until the domain points at it, move the link every gnoweb page gives. It must be https, at most 100 characters, with no query. End it with `/`, since a hole's link appends `?cup=…&hole=…`. It measured 11.8M gas and no deposit.

```sh
gnokey maketx call -pkgpath gno.land/r/nym-golfer000/golf -func SetPlayURL -args https://<the-site>/ \
  -gas-wanted 20000000 -gas-fee 24000ugnot -max-deposit 1000000ugnot \
  -broadcast -chainid onyx-1 -remote $RPC GnoAlex
```

golf has no other setting. `Hide`, `SetSuccessor`, `Transfer`/`Accept` and `Renounce` are for later (docs/golf.md).

### 6. Smoke test on onyx (reads only)

```sh
gnokey query vm/qeval -data 'gno.land/r/nym-golfer000/golf.Holes()' -remote $RPC | head -c 600; echo
gnokey query vm/qeval -data 'gno.land/r/nym-golfer000/golf.HoleState("garden/1")' -remote $RPC | head -c 600; echo
gnokey query vm/qeval -data 'gno.land/r/nym-golfer000/golf.SimulateRound("garden/1", "0,5")' -remote $RPC | head -c 300; echo
```

Check each answer:
- `Holes()` answers `{"version":1,"play":"https://gnogolf.xyz/",…}` and lists the 74 holes;
- `HoleState` answers `garden/1/v1`'s geometry and weather;
- `SimulateRound` answers a path.

Then open https://onyx.testnets.gno.land/r/nym-golfer000/golf: the hub lists the cups, a hole's page renders, and its "open the game" link goes to the play link. After step 7, save one round from the site with a player's account (Adena on onyx, or the gnokey paste) and see it on the hole's board.

### 7. Netlify

The site is a static export (`netlify.toml`: base `web`, `npm ci && npm run build`, publish `out`). Set these in the site's environment, then deploy. A production deploy (`CONTEXT=production`) fails its build if `REALM`, `RPC`, `WEB` or `NETWORK` is missing or malformed (`web/next.config.mjs`).

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_REALM` | `gno.land/r/nym-golfer000/golf` |
| `NEXT_PUBLIC_RPC` | `https://rpc.onyx.testnets.gno.land:443` |
| `NEXT_PUBLIC_WEB` | `https://onyx.testnets.gno.land` |
| `NEXT_PUBLIC_NETWORK` | `testnet` |
| `NEXT_PUBLIC_SITE_URL` | `https://gnogolf.xyz` (link previews and share links) |
| `NEXT_PUBLIC_POSTHOG_KEY` | `phc_oHdpsLEGWUkXRvetWb5MDxHUukkC5fvT3AkePmYYhHdB` (the PostHog EU project's public, write-only key; docs/analytics.md) |
| `NEXT_PUBLIC_OTHER_URL` | empty (no mainnet site yet) |
| `NEXT_PUBLIC_COMMUNITY` | empty (community holes off until the Builder) |
| `NEXT_PUBLIC_CLIPS` | optional, `1` offers the holing shot's clip (ADR-003) |
| `NEXT_PUBLIC_NAMEREG`, `NEXT_PUBLIC_FAUCET`, `NEXT_PUBLIC_GNOT_URL`, `NEXT_PUBLIC_ALLOWED_HOSTS` | unset: the registrar is found on the chain (`r/sys/namereg/v0`), the faucet is https://faucet.gno.land, and `*.gno.land` is allowed already |

`web/.env.example` carries the same set. Every value is baked in at build time, so after changing one, redeploy (Deploys, "Trigger deploy", "Clear cache and deploy site"). No change is needed in the CSP (`netlify.toml`): `connect-src` has `https://*.gno.land` (onyx's RPC) and PostHog EU (`eu.i.posthog.com`, `eu-assets.i.posthog.com`), `script-src` has `eu-assets.i.posthog.com`, and the font is served from the site itself. Then open the site and check:
- its network band says Testnet;
- a hole loads and previews;
- the About sheet shows the analytics line and its opt-out.

### 8. After the launch

- **Handing the role on (optional).**
  1. `GnoAlex` offers it: `gnokey maketx call -pkgpath gno.land/r/nym-golfer000/golf -func Transfer -args <new-address> -gas-wanted 20000000 -gas-fee 24000ugnot -max-deposit 1000000ugnot -broadcast -chainid onyx-1 -remote $RPC GnoAlex`.
  2. The new key takes it with `-func Accept` (no args), signed by that key.
  3. Check `Pending()` and `Owner()`.

  `Transfer` to the owner's own address cancels an offer. Tips follow the role, because the game sends them to `Owner()`. The namespace `nym-golfer000` stays with `GnoAlex`.
- **The Crystal Mines** (branch `mines`, in progress; ADR-005). The cup ships as data, with no redeploy: golf already names the world. The order matters:
  1. Deploy the client that knows `mines` first. Before it, a mines hole would be dressed as the garden and named "Garden Cup".
  2. Then add its 18 lines to `data/holes.txt` and run step 4's same command. The course's 74 slots are skipped as already current.
  3. Run `-verify`.

  The course ranking then counts 92 holes. At the course's average of about 0.6 GNOT a hole, the 18 holes' deposit would be about 11 GNOT, but measure them on a local chain first.
- **Mainnet notes.**
  - The namespace: a non-nym name such as `gnogolf` is not self-registered on mainnet. You register a nym, and GovDAO renames it (`r/sys/namereg/v0` `ProposeNewName`).
  - While ugnot is transfer-locked there (`bank:p:restricted_denoms`, empty on onyx), the client shows no Support chip and the About sheet says tips open once GNOT can be sent.
  - Freed storage (a `Reset`, a best that shrinks) goes to the storage fee collector, not back to the player (§10.3).
  - `maketx run` is restricted there too, so the same plain calls apply.
  - Build the mainnet site with `NEXT_PUBLIC_NETWORK=mainnet`, and link the two sites with `NEXT_PUBLIC_OTHER_URL`.

## 0. Recommendation

- **Holes become data.** Official holes are data records in `golf`, not 74 realm packages.
  - A hole version is one compact binary string `GG1`, sent as hex, validated, and stored as bytes.
  - It is decoded into a transient `*course.Simple` once per call and never persisted.
  - The hole sources stay in the repo as the authoring tool and the proof, but are no longer deployed.
- **Three packages instead of 77:** `p/<ns>/physics`, `p/<ns>/course`, `r/<ns>/golf`, then 74 `Publish` calls.
- **Cost:** the deposit is about 58 GNOT (45 to 80) instead of about 790, plus about 5 GNOT in fees.
- **Updates keep the address.**
  - `garden/7` is a stable alias to its current version; each version is its own entry (`garden/7/v1`, `garden/7/v2`, and so on).
  - Records, boards and wear are kept per version.
  - This reuses today's per-entry machinery: slots, retire and drain.
- **Authority:** the golf deployer is captured at init, and only it can publish official data.
  - A realm hole under golf's own namespace is official only if the deployer signed its registering transaction.
  - The chain-id allowlist and the `names.IsEnabled` check are removed. This fixes security findings N1 and N4.
- **Zero regression, proven by the existing hashes.**
  - `fingerprint.Check` also requires `Of(Decode(Encode(me))) == want`, so the 74 test files don't change.
  - The 6×3 golf goldens keep running on realm-registered fixtures.
- **Namespace:** `nym-golf000` is invalid on pearl (the stem must be 5 to 13 letters). Chosen: `nym-golfer000`, valid and free at pearl height 693,540.
  - The code derives its namespace from its own path at init.
  - `scripts/stage.sh <ns>` rewrites the import paths.

## 1. Chain facts checked with gnomcp

| Fact | Value |
|---|---|
| pearl | pearl-1, height 693,540. The faucet gives 10 GNOT per address per 24 h |
| Name format | `nym-[a-z]{5,13}\d{3}`, price 0. Prefixes `gno` and `gl` are reserved |
| `nym-golfer000` | valid, not taken, no canonical collision |
| `p/nt/bptree/v0` | present on pearl, same `ITree` interface as avl, zero value usable |
| Stdlib at the pearl tag `c4c72fd` | `chain/runtime/unsafe` has `OriginCaller` and `CurrentRealm`. `math.Float64frombits` is native. `encoding/hex`, `encoding/binary` and `crypto/sha256` exist. `math.Sqrt` and `strconv.ParseFloat` are interpreted |
| Limits | `MaxBlockTxBytes` 1,000,000. `maxGasQuery` 3e9 |
| Course | 74 holes, 1,896 walls (at most 48 per hole, 64 timed), 111 posts, 139 zones, 301 polygon points. Pulses on 11 holes, Shelter on 5. Every hole is `course.Fit(&course.Simple{…}, 1.5)` |

## 2. Architecture

```
p/<ns>/physics  unchanged engine + PrepareWith/Lengths (same arithmetic, no sqrt)
p/<ns>/course   unchanged + data.gno: Encode(*Simple) string, Decode(string) (*Simple, error)
r/<ns>/golf     registry; entries are realm holes (course.Hole) OR data versions.
                Publish (owner), PublishMine (anyone), Versions, HoleData, typed getters,
                Drain, Transfer/Accept/Renounce
repo only       hole sources (Fit literals + fingerprint tests), data/holes.txt generated
                from them, scripts/stage.sh, scripts/holedata.sh; the authoring packages
                p/<ns>/physics/build (wall builders) and p/<ns>/course/author (Fit, Diff)
```

A call on a data hole goes through four steps:
1. Load the version entry: one object holding the data string, about 0.15M gas.
2. `course.Decode` rebuilds a `*course.Simple`, and `physics.PrepareWith` fills its `prep` from the stored lengths.
3. The `*course.Simple` is the call's hole; golf marks the wear on the version's entry, never on it.
4. The rest of the code (`previewAt`, `weatherOf`, `State`, `Render`) runs unchanged.

The decoded value is never linked into realm state, so it costs no deposit.

## 3. Holes as data

### 3.1 Encoding options

| Option | Size per float | Total for 74 holes | Per-call cost | Verdict |
|---|---|---|---|---|
| A. Gno slices | ~47 B | ~70 GNOT | no parsing | too heavy |
| B. Hex stored as a string | 16 B | ~29 GNOT | decode 16 nibbles | fallback |
| **C. Binary string (hex on the wire, bytes stored)** | **8 B** | **~15 GNOT** | native `Float64frombits` | **recommended** |
| D. Decimal text | 10–18 B | ~10 GNOT | `ParseFloat` is interpreted, 10–50× slower, on every call | rejected |
| E. Gno source | same as today | — | import gas | rejected |

C is exact by construction, since it stores the float bits. If Phase 0 finds any problem storing non-UTF-8 bytes in a string, fall back to B (+14 GNOT).

### 3.2 Format `GG1` (little-endian, frozen in course v1)

```
"GG1"
header : W,H u16 · Strokes u8 · Substeps u16 · World str · Order f64 · Title str
         Tee f64×2 · Pin f64×2 · CupRadius f64 · Shelter f64
field  : Friction, Bounce, Radius f64            (Tick must be 0)
skins  : n u16, n × str                          (str = u8 len + bytes)
walls  : n u16 · style runs [count u16, Bounce f64, Mark i32, Skin u16, Every/On/Phase i32]
         then per wall: Ax Ay Bx By, l, lp, lm   (7 × f64 = 56 B)
posts  : n u16 · per post: Cx Cy R Bounce f64, Mark i32, Skin u16
zones  : n u16 · per zone: Kind u8, flags u8 (Round|Outside|Air|Capped), Min Max Vec f64×6,
         Scale f64, Mark i32, Skin u16, Every/On/Phase i32, npoly u16, poly f64×2n
pulses : n u8 · per pulse: Every/On/Offset i32, then walls (no lengths), posts, zones
```

`Decode` rejects anything outside frozen, generous limits:
- a wrong magic, trailing bytes, or any non-finite float;
- a board outside 1..96;
- more than 512 walls, 128 posts, 128 zones, 256 points per polygon or 1,024 points in total, or 16 pulses;
- substeps outside 1..200;
- a zone kind outside 0..4;
- any timing value beyond ±4096.

Every current hole is far inside these limits (at most 48 walls and 30 substeps).

### 3.3 How each feature maps

Every feature is a field of `Wall`, `Post`, `Zone`, `Pulse` or `Simple`, so the encoding is one to one:

| Feature | Encoded as |
|---|---|
| Timed walls | the wall style's `Every`/`On`/`Phase` |
| Timed zones | the zone's `Every`/`On`/`Phase` |
| Pulses | the pulse list, pieces recursive |
| Polygons and rail-less lanes | `Poly` + the `Outside` flag |
| Tunnel, hazard | `Kind` + `Vec` |
| Closed tube | a Loop zone plus its ordinary walls |
| Surfaces, slopes, air | `Kind` + `Scale`/`Vec`, with the `Air` and `Capped` flags |
| Shelter | `Simple.Shelter` |
| Everything else (world, order, par, title, board, tee, pin, cup, substeps) | the header |

Weather is not hole data: golf computes it at play time.

### 3.4 Why the decoded hole plays bit-identically

- **Stored after `Fit`.** The encoder stores the values after `Fit` has run. `Decode` never calls `Fit` or any other builder, so every float comes back with the same bits (−0 included), in the same order.
- **`prep` without square roots.**
  - `lines()` takes 3 square roots per wall, about 23M gas on a 48-wall hole.
  - Refactor it into shared arithmetic that takes the 3 lengths as input. `Prepare` computes them; `PrepareWith(f, lens)` takes them from the data.
  - Each given length is checked cheaply (`l > 0 && |l*l − d·d| ≤ 1e-12·d·d`), falling back to the real `sqrt` if the check fails.
  - The same inputs give the same `prep` bits, and `offsets()` already rechecks each entry against its wall.
- **Wear** is a lazily created `[]byte` of 128 × uint32 per version, marked with `course.WearIndexOn`.
- **Proof:** see §14.

### 3.5 Storage per hole

| Hole | Walls/posts/zones | Data | Entry + index | Total | Today |
|---|---|---|---|---|---|
| hole1 | 40/1/0 | 2.5 KB | ~3.3 KB | **~5.8 KB, 0.58 GNOT** | 13.1 GNOT |
| town14 | 44/3/1 | 2.9 KB | ~3.3 KB | **~0.62 GNOT** | 14.7 GNOT |
| island6 | 4/0/1 | ~1.2 KB | ~3.3 KB | **~0.45 GNOT** | 5.0 GNOT |
| **All 74** | | ~145 KB | ~245 KB | **~39 GNOT** | ~700 GNOT |

### 3.6 Gas per call (estimated; Phase 0 measures it)

| Step | Data hole | Realm hole |
|---|---|---|
| Load | ~0.15M | ~10–14M on 48 walls |
| Decode | ~1–1.5M | — |
| PrepareWith | ~0.15M | stored |
| **Total** | **~1.5–2M** | **~7–14M** |

There is no cross-call cache: it would be persisted, and qeval can't persist anyway. The hole is decoded once per public call: `h := e.hole()` is passed down to weather, work, State and Render.

## 4. Slots and versions

- **Versions are entries.**
  - `Publish(cur, slot, hexData, note)` creates `slot/v<n+1>`.
  - The slot must equal the data's `World + "/" + Order`, so a mis-edited file can't replace the wrong hole.
  - The existing slot code then runs: `retire(old, id)`, then `slots.Set(slot, id)`.
- **Aliases.** `mustHole(id)` tries the exact id first, then `slots.Get(id)` (official) or `aliases.Get(id)` (community). Every read and write accepts `garden/7`, and gnoweb `golf:garden/7` shows the current version. Clients write with the version id `State` returned, so a version published mid-round can't replay shots against new geometry.
- **Per version:**
  - rounds, bests, boards, record and holder, plays and wear;
  - provenance: publisher, height, sha256 of the data, and a cleaned note of at most 140 characters.
- **Archived versions stay playable.** Their page shows "Archived: v3 took its place".
- **Cups and URLs don't change.** `?cup=garden&hole=7` still matches by order.
- **New read:** `Versions(slot)` returns `[{id, height, by, sha, note, next}]`.
- **Retire and drain** are reused, with the N2 fix in `counts()` and an open `Drain(cur, n ≤ 400)` crank. The batching can't be simplified: taking an archived hole out of the standings is O(players on that hole).
- **Weather seed** stays `Hash(e.id + "#" + period)`. A new version gets new weather, which is fine: it is a new hole.

## 5. Authority

- **Captured at golf's init:**
  - `owner = unsafe.OriginCaller()`;
  - `self = unsafe.CurrentRealm().PkgPath()`;
  - `nsPrefix` is derived from `self`, and so are all the `/r/…/golf` links.
- **Official data hole:** published by `owner` through `Publish`.
- **Official realm hole:** its id is under `nsPrefix`, and `OriginCaller == owner` at Register (the hole's `init(cur realm)` at deploy). It takes a slot only if it declares `World != ""` and `Order > 0`.
- **Removed:** the chain-id allowlist and the `names` import. This fixes N1 on every chain and N4.
- **Ownership transfer:**
  - `Transfer(cur, to)`, then `Accept(cur)` by the recipient: two steps.
  - `Renounce(cur)` freezes the course for good, which lets "no admin" become literally true.
  - Recommended: yes.
- **The owner can:** add official holes, publish a new version into a slot (which archives the old one and removes its bests from the course ranking), and hand over or renounce the role.
- **The owner cannot:**
  - edit or delete any version, round, best, board, record or standing;
  - take a hole down without replacing it;
  - touch community holes, the weather, the physics or golf's code.
- **Honest caveat:** by choosing the holes, the owner shapes the course ranking.
- This goes into `noAdmin()` and the README.

## 6. Community and builder

- **`PublishMine(cur, slug, hexData, note)`, open to anyone.**
  - The id is `<caller>/<slug>/vN`, with slug `[a-z0-9-]{1,32}`, and the alias is `<addr>/<slug>`.
  - Only that address can add versions.
  - It is never official: no cup, no ranking.
  - It lives in its own `aliases` tree, so `slots.Size()` still counts the course's holes.
- **Realm holes through `Register` stay** as they are.
- **Anti-spam:**
  - The publisher locks the deposit for the bytes it adds: about 0.5 GNOT per version, at most about 2.5 GNOT at the limits. Nothing can be deleted, so this is the throttle.
  - Gas is bounded by the format limits, the work budget and the path cap.
  - `Holes()` lists the course first, then community holes up to a cap. A `Community(after, limit)` read pages them.
  - No name requirement: names are free on pearl, so it would add nothing.

## 7. Physics storage

- **Walls cost bytes.** Data holes never store a `Field`, so a wall costs 56 B instead of about 2.8 KB.
- **Flattening `Wall`/`Segment`/`Vec2`** is not recommended: it would rewrite the API realm-hole authors use.
- **`prep`** is never stored for data holes: it is rebuilt from the 3 stored lengths per wall (+9 GNOT in total, and ~23M gas saved per call on 48 walls).
- **Phase 0 gate:** if `Prepare` costs less than 5% of a light preview, drop the stored lengths and call `Prepare` at decode.

## 8. Indexes

- **Every golf tree moves to `bptree`:** holes, slots, aliases, rounds, bests, board, totals, ranks.
  - About 660 B per entry, against 2,117 B for avl (measured).
  - The same `ITree` interface and the same sorted iteration, so outputs are byte-identical and the goldens don't move.
  - `page()` takes a `bptree.ITree`. Trees are zero-value fields, created lazily.
- **Caveat:** bptree forbids changing the tree it is iterating. `drain` iterates `bests` while it changes `totals` and `ranks`, which is fine; audit every other `Iterate`.
- **Per player:** the first finish goes from about 12.5 KB to about 5 KB, each further hole from about 6.6 KB to about 3.5 KB.

## 9. Upgradability

- **Typed reads for a future golf/v2:**
  - `HoleData(id)` returns the hex, and `Versions(alias)` each version's sha;
  - `Current(slot)`;
  - `BestOf(hole, mode, player)`, and `Ghost(hole, mode, player)` for the round that set it (its shots and period: a v2 can carry a best over with its proof);
  - `StandingOf(mode, player)`;
  - the paged JSON reads (`Records`, `Players`, `Community`) to enumerate.
  - There is no `HoleOf`: it would hand any realm a value that writes golf's wear (audit Y4).
- **golf/v2** re-publishes v1's data and shows v1's records as history, or carries bests over lazily (`v2.Import(player)` reading `v1.BestOf`), only where the physics and course are the same.
- **Deploy v2 as a sibling** (`r/<ns>/golf2`): golf derives `officialPrefix` and the `/p/<ns>/` links from its own path up to the last `/`, so `r/<ns>/golf/v2` would take `r/<ns>/golf/` for its namespace.
- **Trap: the weather is seeded by the version id** (`ForecastFor(e.id, …)`). A version re-published in v2 gets a new id, so new weather: a v1 best was played in other weather than the v2 round it would be compared with. A v2 that counts imported bests as the same hole must seed its weather from the v1 id (keep a `legacyID` per version).
- **Trap: no hole comes over by itself.** Holes don't register from realms any more (every hole is data, and the 74 hole realms don't call golf), so nothing re-registers into a v2: it re-publishes every official version from `HoleData`, checked against `Versions`' sha, and community authors re-publish theirs with v2's `PublishMine`.
- **Pointing players at v2:** v1's owner calls `SetSuccessor(v2)` once. Every v1 page then shows a "moved to" banner and `Holes` gives `"successor"`; v1 goes on playing and blocks nothing.
- **physics/v2** needs course/v2 and golf/v2, because `course.Hole` uses physics v1 types. The `GG1` magic leaves room for a `GG2`.
- **Frozen at deploy:** physics, course and the `GG1` format with its limits, the golf code and constants, the namespace.
- **Updatable:** official hole versions, community holes, the owner, the play link (`SetPlayURL`), the successor (once), the client.

## 10. Deploy pipeline

### 10.1 `scripts/stage.sh <ns> <out>`

The deployed source is the repo's, byte for byte: stage.sh transforms nothing but the namespace, and checks it.

1. Copy every file of the physics, course and golf directories but their tests (`*_test.gno`, `*_filetest.gno`) into `<out>/gno.land/{p,r}/<ns>/…`, as it is. The subpackages (`physics/build`, `course/author`, `course/fingerprint`) and the hole realms are other directories, and never deployed: nothing deployed imports them.
2. Rewrite the import paths (`gno.land/[pr]/gnogolf/` → `<ns>`) with `sed`: the one transformation. The production deploy targets the `gnogolf` namespace itself (to be obtained on onyx, where namespaces are enforced from block 1), where it is the identity, so the on-chain source is then exactly the repo's; it only matters for a rehearsal nym such as `nym-golfer000`.
3. Assert that each staged package holds the repo package's non-test files, no more and no fewer, and that each is the repo's file byte for byte once the namespace is read back; that no `gno.land/[pr]/gnogolf` string is left (under a nym); that every gnomod has `gno = "0.9"`; and that there is no `[[replace]]`.
4. Run `gno lint` with the onyx toolchain (`GNO_TOOLCHAIN`, see the README) and print the package sizes.

`scripts/check.sh` stages into a temporary directory under `gnogolf` on every run, so a stage-time transformation or a skipped file fails the check before it can reach a deploy.

The goldens stay tied to the canonical `gnogolf` tree, so staged tests would move only the id-dependent columns.

### 10.2 `scripts/holedata.sh`

It runs the fingerprint tests with `-v`. `fingerprint.Check` logs `data <slot> <sha8> <hex>`, which is written to the committed `data/holes.txt`. A change to a hole then shows up as a reviewable diff.

### 10.3 Order

> History: the order as designed, with pearl-era estimates. The measured costs and the commands are in [Onyx deploy, step by step](#onyx-deploy-step-by-step).

| # | Step | Signer | Size and cost |
|---|---|---|---|
| 1 | `namereg/v0 Register("nym-golfer000")` (onyx and mainnet run v0; pearl ran v1) | user, gnokey | ~5M gas |
| 2 | addpkg physics | user, gnokey | ~52 KB, 5.2 GNOT |
| 3 | addpkg course | user, gnokey | ~3.7 GNOT |
| 4 | addpkg golf (its init sets the owner) | user, gnokey | ~9.1 GNOT |
| 5 | 74 × `Publish`, one plain `gnokey maketx call` a hole (`scripts/publishdata.sh <key>`: onyx lets one seeded account `maketx run`, so no script) | the user's key, gnokey | measured on the onyx toolchain: 46M to 174M gas a hole (8.1e9 in all, asked as 1.2 × (25M + 55K a byte of data)), 453,029 bytes in all (45.3 GNOT at 100 ugnot a byte) |
| 6 | Verify: `scripts/publishdata.sh -verify`, one `vm/qeval` of `Current` and `Versions` over every slot | a read | 0 |

- Every package is far below the 1 MB transaction limit.
- **gnomcp can:**
  - simulate each addpkg under the agent's own address namespace;
  - bench on a gnodev matched to onyx;
  - publish through a user-approved session;
  - run the verification reads.
- **gnomcp cannot:** addpkg under the user's name, and sessions can't addpkg either. Phase 0 checks that sessions work on pearl.
- **No `MsgRun` on onyx:** `maketx run` (and its simulation) is restricted to one seeded account, so every write of the deploy and of the game is a plain `MsgCall`: `Publish` a hole a call, a save `PlayRoundAt` (or `PlayRoundPro`), a name `Register`.
- **On mainnet, freed storage is not refunded to the player.** A realm's freed storage deposit goes to the caller of the transaction that frees it only while ugnot moves freely (the testnets); where ugnot is transfer-locked (`bank:p:restricted_denoms` holds it, as on mainnet), the VM sends it to `StorageFeeCollector` instead (onyx's `gno.land/pkg/sdk/vm/keeper.go`, the refund's `receiver`). There a Reset, a round holed after a part left it under way, or a best improved in fewer bytes frees storage for the fee collector, not for the player who paid it: the deposit a save shows is spent, not escrowed.

### 10.4 Budget

> History: the design's estimate. Measured since: about 77.6 GNOT of deposit and 12.2 of fees ([Costs](#costs-estimates)).

| Item | GNOT |
|---|---|
| Code (physics, course, golf) | ~18 |
| 74 official holes (data ~15, entries and indexes ~24) | ~39 |
| Golf globals at init | ~1 |
| **Deposit** | **~58 (45–80)** |
| Fees | ~3–6 |
| **Total** | **~65 (50–90)** |

That is about 7 faucet-days for one address, or a request to the faucet operators or GovDAO for about 100 GNOT.

## 11. Security fixes folded in

| Finding | Fix | Change in output |
|---|---|---|
| N1 | owner origin + own namespace, no allowlist | the rule's tests are rewritten (intended); goldens unchanged |
| N4 | registration requires the owner's origin; holes register from init; hole sources lose `Register` | none |
| N2 | `counts()` is false when `next != "" && was == 0` | that case only |
| N3, bug 1, bug 2 | physics, optional (IC-B) | may move timed-bar and wall-end holes |
| bug 3 | an empty `SimulateRound` panics "no shots" | error path only |
| bug 4 | only non-empty entries count toward the cap | accepts lists it used to refuse |
| bug 5 | refuse a ball outside `[0,W]×[0,H]` | error path only |
| bug 6 | dedupe friends and skip invalid entries | duplicate or junk input only |
| bug 7 | a tick that overflows is clamped | error path only |
| findings 8–11, 13 | board key on any named finish; `listed()` walks slots first; `Drain`; explicit slots; staging | as listed |
| Lint | `fingerprint.Check(t T, …)` with a small interface | none |

## 12. Client impact

- **`chain.js`:**
  - `REALM` comes from `?realm=` or the build environment (pearl: `gno.land/r/nym-golfer000/golf`).
  - Add a `DATA` id regex for version and community ids.
  - `sourceURL` links data holes to `<realm>:<id>/data`.
- **`Holes()`:** same shape, with version ids and `next`.
- **engine `linked()`:** accepts a slot id (`?hole=garden/7`).
- **Golf.jsx:** the text-play link is built from `REALM`.
- **gnoweb `<id>/data`:** provenance, history, a decimal listing of the pieces, the raw hex, and `$source` links to golf, course and physics.
- **botcheck:** filters on `official && !next`.
- **hole-bests.json:** keyed by slot.
- **camsuite and pulltest:** use slots from a name→slot table generated from `data/holes.txt`. hole19 is garden order 17, so a hole's name isn't its order.
- **vsolve:** a `-data` mode.

## 13. Behaviour changes

- **IC-A, intended, no fingerprint or golden moves:**
  - version ids and aliases;
  - the official rule;
  - explicit slots;
  - the `Holes()` order;
  - N2, finding 8, bugs 3–7;
  - the new API;
  - forecast sequences follow the new ids (new on pearl anyway; not pinned by the fingerprints).
- **IC-B, optional physics fixes, each moving some fingerprints:** bug 1, bug 2, N3. Each would be its own commit listing the holes it moves, with a par re-check.
- **Not done:**
  - Puddle precompute: it would move every rain hash. An exact-only broad phase in `dryLand`, proven by the fingerprints, is possible instead.
  - The `t` cause letter.
  - The M9 warning zones.

## 14. Zero-regression proof

1. **Fingerprints:** `fingerprint.Check(t, me, want)` requires `Of(me) == want`, `Of(Decode(Encode(me))) == want` (432 shots, calm, rain and wind, plus the zones), and `Encode(Decode(Encode(me))) == Encode(me)` (for the fields the hash skips). It logs the data. No hole test file changes.
2. **Physics:** `TestPrepareWithIsPrepare`: bitwise equality on every fixture, plus 10K random segments at Radius 0.5 and 0.
3. **Goldens:** the 6×3 goldens stay pinned on realm fixtures. A parity test registers the same 6 fixtures as data versions and compares, per fixture:
   - `previewAt` over a grid of shots in 3 weathers;
   - the `State` JSON, minus the id and weather fields;
   - the weather zones for the same id.
4. **Local dress rehearsal:** two gnodevs at the pearl tag, one with the old HEAD and realm holes, one with the new tree and the data. For each hole, compare:
   - the `HoleData` sha;
   - the `State` pieces JSON;
   - `SimulateRoundAt` of the solver plan in a calm period;
   - the gas, which must not exceed the realm hole's by more than 10%.
5. **vsolve** on the decoded holes matches `hole-bests.json`.
6. **Client and storage:**
   - camsuite (14 holes) and pulltest pass tables are unchanged;
   - `botcheck --selftest` passes;
   - a storage-delta filetest makes sure a decoded hole is never persisted.

## 15. Phases

| Phase | Content | Gate |
|---|---|---|
| 0 Measure | pearl toolchain; baseline; probes: `Prepare` vs `PrepareWith`, decode cost, bytes per version, bptree entry, binary string round trip, gnoweb `golf:garden/7/v2`, sessions on pearl | the cost model holds within ±50% |
| 1 Pure refactors | pass `h` explicitly; bptree + lazy trees; namespace and owner at init; the `T` interface; faster fingerprint tests | every hash byte-identical |
| 2 Data format | `course/data.gno`; the `lines()` refactor + `PrepareWith`; data checks in `fingerprint.Check`; `holedata.sh` | 74 data checks; round-trip and hostile-input tests |
| 3 Versions and authority | dataHole, Publish, PublishMine, Versions, HoleData, getters, Drain, Transfer/Accept/Renounce, aliases, the §11 fixes, the `/data` page, `noAdmin` | goldens unchanged; parity; new tests |
| 4 Rehearsal and client | hole sources lose `Register` and the golf import; publish locally; the §12 client changes; the §14.4–6 checks | everything green |
| 5 (optional) IC-B | bugs 1, 2, N3, one commit each | moved holes listed; pars re-verified; data regenerated |
| 6 pearl | `stage.sh` simulate → name → 3 addpkg → Publish cup by cup | the checklist |
| 7 Docs | README, CLIENT.md, golf.md, course.md | review |

## 16. Risks

- **Decode costs more gas than the model predicts.** Phase 0 checks this. Fallback: store `prep` as bytes (+~30 GNOT).
- **Non-UTF-8 strings misbehave.** Fallback: store hex (+14 GNOT).
- **`OriginCaller` behaves differently** at init, in tests, or on pearl. The Phase 0 probe runs on pearl.
- **A decoded hole gets persisted by accident.** The storage-delta filetest catches it.
- **bptree is young.** `r/sys/users` uses it, and tests cross-check it against avl.
- **The frozen `GG1` limits turn out too small.** That would need a v2; the limits are generous.
- **The owner key is lost,** which freezes the course. `Transfer` mitigates it.
- **The name is permanent,** and GovDAO can delete names.
- **The `/vN` suffix collides with a slug.** It can't: slugs contain no `/`.
- **Budget:** the faucet pace, or a grant.

## 17. Open decisions

1. The name: `nym-golfer000` (decided).
2. The IC-B physics fixes: **yes, all of them** (decided). Fix the physics as far as possible before it is frozen.
3. `Transfer` and `Renounce`: **included** (decided).
4. `playURL`: owner-settable (`SetPlayURL`), starting at `https://gnogolf.xyz/` (decided). Realm holes (`Register`, `Expect`) removed: every hole is data (decided, final fixes).
5. Funding: the official pearl faucet gives up to 300 GNOT, enough for the whole deploy (decided).

## Critical files

- `gno.land/r/gnogolf/golf/golf.gno`
- `gno.land/p/gnogolf/course/course.gno` (+ new `data.gno`)
- `gno.land/p/gnogolf/physics/walls.gno`
- `gno.land/p/gnogolf/course/fingerprint/fingerprint.gno`
- `web/lib/chain.js` (+ `web/lib/engine.js`)

## 18. Audit amendments (binding, from `deploy-v1-audit.md`)

Where these differ from the sections above, these win.

- **Y1:**
  - Every owner function checks `cur.Previous().Address() == owner`.
  - `OriginCaller` is used only in golf's `init`, to capture the owner.
- **Y2:**
  - Every official hole is a data version.
  - There are no official realm holes: a `Register` under the namespace panics unless the owner allowed it first with `Expect(cur, pkgpath)`.
  - A hole is official exactly when it has a slot.
- **Y3:**
  - `Renounce` clears both `owner` and `pending`.
  - `Accept` requires `owner != ""` and the caller to equal `pending`.
  - `Transfer` validates the address, and `Transfer(owner)` cancels a pending transfer.
  - Add `Owner()` and `Pending()` getters, and emit an event on each change.
- **Y4:** delete `HoleOf`.
- **Y5:**
  - `Decode` enforces value bounds (the list is in the audit) on top of the count limits.
  - The frozen limits are 160 walls, 32 posts, 32 zones, 64 points per polygon, 512 points in total, and at most 60 substeps.
  - The work estimator counts polygon edges and pulse extras.
  - Phase 0 adds a gas gate on a synthetic hole built at the limits.
- **Y6:**
  - Official and community entries live in separate trees.
  - The hole data lives in its own tree.
  - Name, par, world and order are frozen at publish.
  - Listing a hole never decodes its data.
- **Y7:**
  - Check each decoded hole field by field with `equalSimple`, plus a field-count tripwire.
  - Extend `Of()` to hash Kind, Air, Capped, Round, Outside, Every, On, Phase, Mark and Skin.
  - Run pulse holes through strokes up to `max(Every)`.
- **Y8:** writes take exact version ids only, and `Launch` returns the version id.
- **GREEN notes:**
  - Check the stored lengths bit-exactly once, at publish.
  - `dataHole` overrides Play, PlayAt, PlayWith and Wear. (Since gone: `Simple` no longer has Play, PlayAt, PlayWith or Wear, and golf marks the wear on the entry itself.)
  - Test the bptree indexes against avl.
  - Refuse a publish whose sha matches the current version.
  - Strip bidi and zero-width characters from text.
  - The README must state what the owner can do (the audit lists it).

## 19. Feasibility amendments (binding, from `deploy-v1-review.md`)

- **D1:**
  - Give hole10 `Order: 10` and hole16 `Order: 16`. Fingerprints don't change, because Order isn't hashed.
  - Official orders must be integers from 1 to 999.
- **D2:**
  - `init` rejects an empty owner.
  - Tests set the owner explicitly, because OriginCaller is `""` under `gno test`.
  - `init(cur realm)` crossing into golf works, so drop the stale "can't register from init" comments.
- **D3:** `Publish` authenticates through `cur.Previous()` (the same rule as audit Y1).
- **D4:**
  - `lines()` stays untouched.
  - `PrepareWith` goes beside it, and the stored lengths are verified bit-exactly once, at Publish.
- **D5:**
  - Choose the tree type per index:
    - small per-version trees stay on avl (a bptree costs about 4.9 KB even when nearly empty);
    - large global indexes use bptree only if Phase 0 measures a win.
- **D6: gas.**
  - A data hole costs about the same gas per call as a realm hole. Measured: decode is 4.5 to 28M, and PrepareWith on 30 walls is 5.4M.
  - The saving is the storage deposit only.
  - Phase 0 must optimise decode, for example by caching the decoded prep per version in realm state, or by storing the prepared form.
  - The §14.4 target of "≤ 110% of realm-hole gas" stays in place.
- **D7: client migration.**
  - Generate a map from old pkgpath to slot out of `data/holes.txt`.
  - Scorecards and cup unlocks get a one-time rewrite, keyed by slot. When two entries collide, keep the lower score.
  - The scene's decor, theme and time of day keep reading the old id through that map.
  - In `Golf.jsx`, accept `?hole=` slot ids.
  - Fix `botcheck`, the media scripts, and the 9 hardcoded `/r/gnogolf/golf` strings.
- **D8: parity.**
  - The parity tests inject the same weather, since weather is seeded from the id.
  - Add the structural `Diff` inside `fingerprint.Check`.
  - Add tests T1–T9 from the review.
