# Final pre-deploy review: the deploy artefacts for pearl (2026-09-25)

Scope: HEAD `affe241`, namespace `nym-golfer000`, chain `pearl-1` (profile `testnet`, height ~700,900).
Everything ran in a scratch copy. No repo code was changed.
The web review reads the working tree, which has uncommitted edits under `web/`. The findings below also hold at HEAD.

**Verdict:** the three packages and the data are ready. Two things block the deploy:

- **5.3** `playURL` is frozen at addpkg, and `https://gnogolf.netlify.app/` returns 404 today.
- **5.2** the Netlify env must set `NEXT_PUBLIC_REALM`.

Two more should be fixed before launch:

- **5.4** the "get a name" link is a 404 on pearl.
- **3.4** the README's gas figures.

## 1. Stage (`scripts/stage.sh nym-golfer000 <scratch>`)

| # | Check | Result |
|---|---|---|
| 1.1 | `stage.sh` exits 0: rewrite, the old-namespace check, the gnomod checks and the pearl lint all pass | **PASS** |
| 1.2 | Only the namespace changed. `diff -r` of each source against its staged copy shows import lines and the `module =` line only (physics 1, course 5, golf 12 lines) | **PASS** |
| 1.3 | Staged files: physics 5 `.gno`, course 4, golf 6, plus a gnomod each. No `_test.gno`, no `_filetest.gno`, no `course/fingerprint`, none of the 74 hole realms | **PASS** |
| 1.4 | gnomod.toml: `module = "gno.land/{p,r}/nym-golfer000/<pkg>"`, `gno = "0.9"`, no `replace`. Pearl's own `p/nt/*` gnomods say `gno = "0.9"`, so the version matches | **PASS** |
| 1.5 | No leftover `gno.land/[pr]/gnogolf` in code, comments or strings. `hub`, `officialPrefix` and the `/p/<ns>/` links are computed from `self` at runtime | **PASS** |
| 1.6 | The only `gnogolf` left is `playURL = "https://gnogolf.netlify.app/"` (`render.gno:80`). It is a domain, not a path (see 5.3). Also left: the brand name in the Render title | **PASS** (path), see 5.3 |
| 1.7 | No local path (`/Users`, `127.0.0.1`, `localhost`, `:26757`) and no `g1…` address in the staged tree | **PASS** |

Sizes: physics 49,383 B, course 49,565 B, golf 103,315 B.

## 2. Lint and tests on the staged copy (pearl toolchain `c4c72fd`)

| # | Check | Result |
|---|---|---|
| 2.1 | `gno lint ./gno.land/...` on the staged tree (inside `stage.sh`) | **PASS** |
| 2.2 | Tests copied in, with `[pr]/gnogolf/` rewritten to `[pr]/nym-golfer000/` in every test and filetest: physics `ok`, course `ok` | **PASS** |
| 2.3 | golf: every test passes, including `TestTheNamespaceIsGolfsOwn`. It asserts `self`, `hub` and `officialPrefix` with the rewritten values, so `officialPrefix` is correct when derived at runtime. `Expect` also refuses an id outside the new namespace (`gno.land/r/gnogolf/…`), as it should | **PASS** |
| 2.4 | `TestGoldenReplays` fails on the staged copy. This is expected: the fixture ids contain the namespace. `sea` and `tunnel` match bit for bit once `nym-golfer000` is mapped back to `gnogolf` before hashing. `timed`, `slope`, `pulse` and `storm` also move their forecast column, because `course.ForecastFor` seeds the weather with `hash(id + "#" + period)`, so a new id means new weather. No logic change | **PASS** (id-dependent only) |
| 2.5 | Two storage filetests move: `z_storage_play` 24,421 → 24,451 B (+30), `z_storage_publish` 21,362 → 21,380 B (+18). That is the path being 6 bytes longer (`nym-golfer000` against `gnogolf`), stored 5 and 3 times | **PASS** (path length only) |

Fix: none. The goldens stay tied to the canonical `gnogolf` tree, as `deploy-v1.md` §10.1 says.

## 3. Data

| # | Check | Result |
|---|---|---|
| 3.1 | `scripts/holedata.sh` re-run in a full copy (7 m 54 s): `data/holes.txt` is **byte-identical** to the committed one (74 holes, 141,107 bytes of data). `paritydata.sh` left `parity_data_test.gno` unchanged | **PASS** |
| 3.2 | `REALM=gno.land/r/nym-golfer000/golf scripts/publishdata.sh [7\|10]`: every script and `verify.gno` import `gno.land/r/nym-golfer000/golf` only | **PASS** |
| 3.3 | Gas, measured with `gno test -v`: the exact slot and hex list of each generated script, published in order as the owner on the staged golf. Pearl params: block `MaxGas` 3,000,000,000, `MaxTxBytes` 1,000,000, `preprocess_gas_per_byte` 1250, `tx_size_cost_per_byte` 10, `run_submitters` empty (MsgRun is open) | **PASS** |
| 3.4 | README and `deploy-v1.md` §10.3 say "~20–30M gas" per Publish. Measured: 41–107M, about 75M on average | **FAIL** (doc, and the default batch size) |

Gas per script, as VM gas plus preprocess gas (1250 × script bytes):

| Batch | Worst script | VM gas | + preprocess | Total | Headroom against 3e9 |
|---|---|---|---|---|---|
| 7 per script (README) | publish-07, 32.6 KB | 750M | 41M | ~0.79e9 | 3.8× |
| 10 per script (default) | publish-05, 44.1 KB | 1,016M | 55M | ~1.07e9 | 2.8× |

- Both batch sizes fit under pearl's limit.
- The README's `-gas-wanted 1000000000` is **too low for the default of 10 per script**: publish-05 (1.07e9) and publish-06 (1.04e9) would run out of gas, and publish-04 (0.99e9) would scrape by.
- With 7 per script it fits, at about 80% of that figure.
- `gno test` does not count package loading or signature cost, so allow a margin.

Fix:
- Always pass `7`, as the README does, or change the default in `publishdata.sh` from `per=${1:-10}` to `per=${1:-7}`.
- Use `-gas-wanted 1500000000` on pearl, and simulate each script first (`gnokey … -simulate only`, or `gno_run` simulate).
- In README step 2 and `deploy-v1.md` §10.3 row 5, replace "~20–30M gas each" with "~40–110M gas each (measured; decode + Prepare + index writes)".
- Also note that the committed `scripts/publish/` targets `gno.land/r/gnogolf/golf`. It must be regenerated with `REALM=gno.land/r/nym-golfer000/golf scripts/publishdata.sh 7` before publishing to pearl, and not committed (it is the gnodev set).

## 4. Pearl compatibility

| # | Check | Result |
|---|---|---|
| 4.1 | `gno_status testnet`: `pearl-1`, node matches the profile. The node reports `v1.0.0-rc.0`. The toolchain is gno `c4c72fdd288c` (2026-08-27), the tag `deploy-v1.md` §1 gives for pearl | **PASS** |
| 4.2 | Stdlib imports (`chain`, `chain/runtime`, `chain/runtime/unsafe`, `crypto/sha256`, `encoding/hex`, `errors`, `math`, `strconv`, `strings`, `time`): their on-chain source (`vm/qfile`) was compared file by file with `gnovm/stdlibs` at `c4c72fd`. `unsafe.OriginCaller`, `unsafe.CurrentRealm`, `math.Float64frombits` and every other symbol used are present. All 89 non-test files are byte-identical | **PASS** |
| 4.3 | `gno.land/p/nt/avl/v0`, `p/nt/bptree/v0`, `p/nt/ufmt/v0` and `r/sys/users` on pearl are byte-identical to the tag's `examples/`, every non-filetest file. The APIs used exist: `avl.NewTree` and `avl.Tree`; `bptree.NewBPTree32` and `bptree.BPTree` (zero value usable); `ufmt.Sprintf`; `users.ResolveAddress(...).IsDeleted()`, which is safe on a nil receiver; `ResolveName` and `UserData.Addr` for the client | **PASS** |
| 4.4 | `@nym-golfer000` holds no packages on pearl yet, so the namespace is free | **PASS** |

## 5. Client (`web/`)

| # | Check | Result |
|---|---|---|
| 5.1 | `web/lib/chain.ts`: the realm comes from `NEXT_PUBLIC_REALM`, matched against `^gno\.land/r/[a-z0-9_-]+/golf$`, which `nym-golfer000` passes. Otherwise it falls back to `gno.land/r/gnogolf/golf`. RPC and gnoweb come from `NEXT_PUBLIC_RPC` and `NEXT_PUBLIC_WEB`, otherwise `127.0.0.1:26757` and `:8888`. The chain id is never hardcoded: it is read from the node's `/status` (`pearl-1`) and handed to Adena. Pearl's RPC answers with `access-control-allow-origin: *` | **PASS** |
| 5.2 | `netlify.toml`'s header lists `NEXT_PUBLIC_SITE_URL`, `_RPC` and `_WEB`, but **not `NEXT_PUBLIC_REALM`**. `web/.env.example` also lacks it, and points at `rpc.testnet.gno.land` and `testnet.gno.land`, not pearl. A build that follows either file plays `gno.land/r/gnogolf/golf`, which does not exist on pearl | **FAIL** |
| 5.3 | `render.gno:80` `playURL = "https://gnogolf.netlify.app/"` is baked into every hub and hole page, and cannot be changed after addpkg. **It returns HTTP 404 today** | **FAIL** (blocking) |
| 5.4 | `web/components/Golf.tsx:1849`: the "get a name" link goes to `${web}/r/gnoland/users`, which **does not exist on pearl** (gnoweb 404). Pearl registers names at `r/sys/namereg/v1` (gnoweb 200) | **FAIL** |
| 5.5 | Other gnoweb links (the round page, a hole's `$source` or `:…/data` page) are built from `REALM_PATH` and `NEXT_PUBLIC_WEB`, so they follow the env | **PASS** |
| 5.6 | `web/lib/card.ts` `OLD_REALM = "gno.land/r/gnogolf/"` and `lib/scene/title-holes.json`: these are legacy id mapping and a baked title snapshot, not chain addresses. They are harmless on pearl | **PASS** |

Fixes:

- **5.2** Add `NEXT_PUBLIC_REALM` to the `netlify.toml` comment block, and make `web/.env.example` read:
  ```
  NEXT_PUBLIC_SITE_URL=https://<the-final-site>
  NEXT_PUBLIC_REALM=gno.land/r/nym-golfer000/golf
  NEXT_PUBLIC_RPC=https://rpc.pearl.testnets.gno.land:443
  NEXT_PUBLIC_WEB=https://pearl.testnets.gno.land
  ```
- **5.3** Before step 4 of the deploy (addpkg golf), create the Netlify site and confirm its final URL, then either:
  - set `playURL` to that URL;
  - or rename the site to `gnogolf`, so that `https://gnogolf.netlify.app/` resolves.
  The source and `stage.sh` output change only in that string. Re-run `stage.sh` afterwards.
- **5.4** In `Golf.tsx:1849`, change `` `${web}/r/gnoland/users` `` to `` `${web}/r/sys/namereg/v1` ``.

### Netlify environment for pearl (exact values)

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_REALM` | `gno.land/r/nym-golfer000/golf` |
| `NEXT_PUBLIC_RPC` | `https://rpc.pearl.testnets.gno.land:443` |
| `NEXT_PUBLIC_WEB` | `https://pearl.testnets.gno.land` |
| `NEXT_PUBLIC_SITE_URL` | the site's final URL, the same as `playURL` (`https://gnogolf.netlify.app` if that name is secured) |
| `NEXT_PUBLIC_ALLOWED_HOSTS` | leave unset: `*.gno.land` and the RPC and WEB hosts are already allowed |

The chain id needs no variable: the client reads `pearl-1` from the node.

## Reproduce

```sh
S=<scratch>
scripts/stage.sh nym-golfer000 $S/stage
# tests: copy each package's *_test.gno and *_filetest.gno into the staged copy,
# sed 's#\([pr]\)/gnogolf/#\1/nym-golfer000/#g', then with the pearl GNOROOT and GNOHOME:
~/.cache/gno-toolchains/pearl/gno test ./gno.land/...
# data: in a full copy of the repo
scripts/holedata.sh && cmp data/holes.txt <repo>/data/holes.txt
REALM=gno.land/r/nym-golfer000/golf scripts/publishdata.sh 7
```
