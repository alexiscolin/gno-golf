# Chain ↔ client sync, completeness and end-to-end performance

Scope: the hub `r/gnogolf/golf` (`golf.gno`, `state.gno`, `weather.gno`, `render.gno`), `p/gnogolf/physics` and `p/gnogolf/course`, against the client `web/lib/chain.js`, `adena.js`, `engine.js` + `engine/*`, `scene/*` and `components/*.jsx`. HEAD is `6c5cdb6`, and no code was changed.

How it was checked:
- **Deployed code.** `gno_read` of the deployed `golf` (`SimulateFrom` and `zonesJSON`) matches the local files.
- **Live reads.** `gno_eval` was run on the profile `gnogolf` (`test-gnogolf`, 74 holes, a fresh chain with nothing played, blocks every 5 s). It covered sizes, geometry census, weather and routes.
- **Query gas.** Each read was wrapped in a `gno_run simulate=true`, minus the 19.3M of an empty script. This includes the package loads a qeval pays too.
- **Write gas.** `gno_call simulate=true` of `Reset`, `PlayRoundAt` and `PlayRoundPro`.
- **Browser.** One nice'd headless Chrome (`media/lib/cdp.mjs`: own profile, `--mute-audio`, killed by PID). It ran a full session in each mode, with `fetch` and `requestAnimationFrame` instrumented and Adena stubbed so that `DoContract` is captured, not sent. The script is `scratchpad/session.mjs`, which is not in the repo.

---

## 1. API sync

### 1.1 Reads: hub function × client

| Hub read | Client wrapper | Used by | Status |
|---|---|---|---|
| `Holes()` | `chain.holes` | `engine.start` (once a page) | used |
| `State(hole)` | `chain.state` | `engine.load` (each hole load) | used |
| `Simulate(…)` | — | — | **unused** (superseded by SimulateRound/From) |
| `SimulateFrom(hole,x,y,shot,stroke,period)` | `chain.simulateFrom` | aim preview and shot for strokes ≥ 2 | used, exact `rest` round-trips (`fx`) |
| `SimulateRound(hole,shots)` | `chain.simulateRound(…, null)` | only when `g.period == null` | used as fallback |
| `SimulateRoundAt(hole,shots,period)` | `chain.simulateRound` | preview and shot for stroke 1; the save pre-check (`splitRound`) | used |
| `Weather(hole,period)` | `chain.weather` | `freshWeather` (new round, period turned) | used |
| `Period()` | `chain.period` | `freshWeather` (every new round) | used |
| `Extras(hole,stroke)` | `chain.extras` | `showExtras` (timed holes, once a stroke) | used |
| `Round(hole,addr)` | `chain.round` | save: part wait and read-back | used, `null` handled |
| `Leaderboard(mode)` | `chain.leaderboard` | Boards → course; win-card rank | used (5 s cache) |
| `HoleLeaderboard(hole,mode,off,lim)` | `chain.holeLeaderboard` | Boards → this hole, paged ten at a time | used (paging bug, §1.4) |
| `Bests(hole,mode,players)` | `chain.bests` | Friends; "already saved?" for the deposit | used |
| `Standings(mode,players)` | `chain.standings` | Friends → the course | used |
| `Records` / `Players` / `Rounds` (paged by address) | — | — | **unused** (meant for indexers and a golf/v2; no client need) |
| `Render` | — | gnoweb | n/a |
| `r/sys/users.ResolveName` / `ResolveAddress` | `resolveName` / `nameOf` | Friends add; the "get a name" hint | used |
| `auth/gasprice`, `bank/balances`, `params/vm:p:storage_price`, `/status` | `gasPrice`, `balance`, `storagePrice`, `chainId` | fee, deposit, funds check | used |

No call targets a function that is missing or renamed. Every client call exists with the arity and types it sends: floats carry a `.`, ints are `|0`, and the mode is sent exactly as `"assisted"` or `"pro"`.

### 1.2 Writes

| Hub write | Client | Status |
|---|---|---|
| `Reset(hole)` | first message of every save (`adena.js:207`) | used |
| `PlayRoundAt(hole,shots,period)` | assisted save | used |
| `PlayRoundPro(hole,shots,period)` | pro save | used; sends `String(period ?? 0)` (`adena.js:210`): a null period would send 0 and be refused. It can't be null today, because State always carries `period`. |
| `PlayRound(hole,shots)` | only if period is null | dead in practice |
| `Launch(hole,angle,power)` | — | gnoweb only (always pro) |
| `Register` | — | holes only |

### 1.3 Fields: JSON × client reads

| Object | Field | Client reads it? | Note |
|---|---|---|---|
| every | `version` | yes (`chain.js:96`, warns if > 1) | ok |
| Holes[] | `id name official par world order next` | yes | `official` and `next` split cup / community / archived (`engine.js:997`) |
| Holes[] | `plays best proBest` | **no** | hub records are not shown in the client |
| State | `hole name official board par world order timed period weather start cup walls posts zones wear` | yes | |
| State | `plays` | no | |
| State | `roundsTotal rounds[]` (24 rounds with their `shots`) | **no** | pure weight, see §4 |
| State.weather / Weather | `period zones` | yes | |
| State.weather / Weather | `kind wind` | **no** | the client rebuilds the kind and wind from zone skins (divergence D5) |
| Simulate* | `path air cause rest holed strokes` | yes | `strokes` is absent from SimulateFrom (handled: `engine.js:895`) |
| Simulate* | `bounces period` | no | |
| Round | `strokes done` | yes | |
| Round | `player ball rest period mode shots path air cause` | no | the read-back could compare `shots` and `mode` too |
| HoleLeaderboard | `par players finished rows` | yes | |
| HoleLeaderboard | `offset hole mode` | no | |
| Leaderboard / Standings | `holes rows` | yes | |
| Bests | `par rows` | yes | |
| wall | `a b skin every on phase` | yes | |
| post | `c r skin` | yes | |
| zone | `kind min max vec scale round poly outside every on phase skin` | yes | see §1.5 |

### 1.4 The recent changes, end to end

| Change | Chain | Client | Verdict |
|---|---|---|---|
| `version` on every object | `versionJSON` | checked, warns once | ok |
| `rest` (exact ball) | `jexact`, shortest `'g'` | `fx()` sends it back unchanged; −0 becomes 0, harmless | ok |
| `official` | Holes, State | list split; HUD says "Community hole · not ranked" | ok |
| `finished` (HoleLeaderboard) | `bests[m].Size()` | "N finished, M ranked" | ok |
| `"by"` removed | only in `render.gno` `bestCell` | nothing reads `.by` | ok. The record holder is no longer visible in the dapp at all. |
| Round `null` after Reset | `"null"` | `JSON.parse` gives `null`, guarded (`r && …`) | ok |
| SimulateFrom | from `rest`, stroke k, period | aim and shot for k ≥ 1 (`aim.js:140`) | ok. Stroke 1 still uses SimulateRoundAt, because `start` is rounded; that is right. |
| Commit cap (12) and split (work budget) | `maxShots=12` per commit, `maxRoundStrokes=60` per round | `MAX_SHOTS=12` **per round** (`engine.js:31`); `splitRound` cuts the whole list N at a time | **divergence D6 / D7** |
| Mode strings | `modeOf`: `""`/`assisted`/`pro`, else panic | `m()` maps anything to one of the two | ok |
| Paged Records/Players/Rounds | new | unused | ok (no need) |
| Bests / Standings | new | Friends tab | ok (50 cap on both sides) |
| HoleLeaderboard players vs finished | `players` = board size (named at insert), `finished` = everyone | label ok; paging uses `rows.length` as the next offset and `rows < PAGE` as the end | **bug** (§3, fix 8) |
| Holes().official and the community list | `listed()`: official first, 120 cap | `g.community` = `!next && !official`; Worlds shows 12 (`Worlds.jsx:200`) | ok, but the rest is unreachable |

### 1.5 Zone JSON against what the renderer needs

Census of the 74 deployed fields:
- 1 `Air` zone (mountain10 `gust`), 0 `Capped`.
- 1 `Loop` (island7).
- 7 timed zones, 2 of them timed **hills** (hole20 `seesaw`).
- 64 timed walls. The longest polygon has 34 points.

The weather adds `Air+Capped` whole-board wind: one untimed zone for Wind, and two gusts (6/3, phase 0 and 3) for Storm.

| Physics field | In JSON? | Does the client need it? |
|---|---|---|
| `Air` | **no** | **Yes.** `terrain.js:24` `airy()` guesses air from `skin ∈ {wind, gust}` or `every`, and `cause.js:25` names a wind by skin. It is right for all 74 holes today. It goes wrong for an author's air slope under another skin (a "fan" or "cannon": drawn as a ramp, labelled "Downhill"), or a hill skinned `gust` (drawn flat, while the chain lets the ball take off from it). Community holes make this reachable. |
| `Capped` | no | Nice to have: the cause cue says "Gust" even when capped wind only brakes the ball. That is cosmetic. |
| `Every/On/Phase` | yes, when `Every>0` | ok. The client's `there()` is exact (§2). |
| `Offset` | not a physics field | `Phase` is the only offset; course.js:796 derives its own `w` from it. ok |
| `Poly/Outside` | yes, capped at 256 points (`state.gno:397`) | ok today (max 34). A longer polygon would be drawn truncated while played whole. |
| `Loop` (`kind "loop"`, `vec` = exit, `scale` = speed) | yes | ok: `replay.js` rides it as a tunnel |
| Wall and post `Bounce`, `Mark`; Field `Friction/Bounce/Radius` | no | not needed; `BALL_R` is hard-coded to the deploy radius (`terrain.js:17`) |

---

## 2. Rules parity (client re-implementations)

| Rule | Chain | Client | Parity |
|---|---|---|---|
| Timed phase | `there()`: `every<=0 ∨ ((i+phase)%every+every)%every < on` (`field.gno:77`) | `there()`: `!(every>0) ∨ mod(i+(phase\|0), every) < on` (`terrain.js:34`); `mod` is sign-safe | **identical.** Example: i=0, every=6, on=3, phase=−4 gives 2 → on, on both sides. |
| The tick at release | `WithTick`: substep i is tested at `i+tick`; `tick` is clamped to 0..1023 | `tickNow = floor(clock) % L`, L = lcm(every…) capped at **1024** (`engine.js:576`) | Consistent: the value sent is what's played. When the true lcm is > 1024, the tick is not the pieces' real phase. Example: everys 7, 11 and 17 give an lcm of 1309, capped to 1024. At clock 1100 the screen shows phase 1100 and the tick sent is 76, so the pieces the ball meets are not the ones on screen. No hole has this today. |
| q4 of the shot | `validShot`: `q4 = Round(x·1e4)/1e4`, then the power check `0<p≤10` | `pullShot` rounds to 2 decimals, and `shotOf` sends `toFixed(4)` | No protocol divergence: the chain replays the string it is sent. `toFixed` and `Round(x·1e4)` do disagree on non-2-decimal inputs: x = 2.00005 gives `"2.0000"` (JS) and 2.0001 (Go). That is reachable only through `?shot=`/`demo` with raw numbers, and even then the chain plays the string. |
| Angle normalisation | `q4(Mod(a,360))`, then `Mod` again if ±360; Mod keeps the sign | `((d%360)+360)%360`, rounded to 0.01, so the range is **[0, 360]** | **Cosmetic divergence.** For −1e-5 rad, the client sends `"360.0000"` and the chain records `"0.0000"`. Same physics. `g.shots` (client) and `Round.shots` (chain) then differ as strings. Harmless today, because the read-back compares strokes only. |
| Period | `Period() = blockTime/300` | read from the chain (`State.period`, `Period()`), never computed. **But** `saveBy = (period+2)·300 s` and the weather `until = (period+1)·300 s` run on the **device clock** (`Golf.jsx:122`, `:741`) | Formula ok. The clock is not: the chain judges by block time, 0–5 s behind now here, plus the inclusion delay. Example: period P, device clock at (P+2)·300 − 3 s. The UI allows the save, the tx lands in a block at ≥ (P+2)·300, and it is refused "period P is not the current weather". Skew (a laptop 30 s fast) shifts it further. |
| Stale period | `playablePeriod`: period ∈ {now, now−1}; `stroke` refuses a round older than now−1 | `freshWeather` runs only on a new round (`engine.js:623`). A hole loaded at P and first shot at P+2 is played, previewed and holed in P, because `notAhead` lets the reads through. It is unsaveable from its first stroke, and the player learns this only on the win card. | **Gap** (fix 3) |
| Weather computation | `ForecastFor` (FNV hash, climate table, LCG) | not re-implemented; read from the chain | ok. It is a design choice, and notAhead forbids future periods anyway. |
| Par | `ParOf`: 1..19, else 3 (`course.gno:67`); Register: `<1 ∨ >20` → 3 (`golf.gno:251`) | `parOf = h.par \|\| 3` (`card.js:6`) | Client ok. The chain's two clamps disagree (20 is unreachable). Trivial. |
| Official | `official()`: prefix + chain id or `names.IsEnabled()` | `official !== false` (unknown = official) | ok |
| Gas / work model | `work`: 10M + 150K·walls + pts·(1.2M + 15K·pieces), budget 1.4e9 | `gasOf`: same terms + **170M per call** (+8 pieces for timed holes) | Consistent, but it overestimates (§4). The client also does not use the model to split (D7). |
| Stroke limit | 60 per round, 12 per commit | 12 per round | **D6** |

Divergences that matter:
- **D1 (stale period).** A round that is unsaveable from its first stroke is not flagged.
- **D2 (device clock).** A save in the last ~5–10 s of the window fails on chain.
- **D5 (storm wind).** `weather.js:331` takes the first `wind` zone as "the wind". In a storm that is gust 1, 40° off the forecast. Example: island18 in a storm now shows `wind [0.093,0.075]` (flag, HUD, foliage) against the chain's `wind [0.119,−0.002]`. The alternating second gust is never drawn: `gusts` only picks skin `gust`.
- **D6 (stroke limit).** The client caps the round at 12. The chain allows 60, and splitRound was built for more than one commit. The limit is really `SimulateRound*`'s `len(list) > maxShots` (`state.gno:307`), which also caps a *round* preview at 12.
- **D7 (split).** `splitRound` learns N from the first N shots only and cuts the rest N at a time (`adena.js:182`). A later chunk with heavier shots can be refused by `work.next` after chunk 1 is already on chain. The client has every input the chain's `work` uses (walls, pieces, `pts`), so it can compute the exact split itself.

---

## 3. Feature completeness

| Feature | Chain | Dapp | gnoweb | Gaps |
|---|---|---|---|---|
| Modes (assisted / pro) | two boards; round mode fixed at stroke 1 | toggle; pro hides preview and asks nothing | Launch = pro only | ok. The pro claim is on the player's word, by design. |
| Hole leaderboard | `HoleLeaderboard` paged, named | Boards → this hole | none (only 24 "Rounds" by address, no mode, no best order) | client paging bug (fix 8); gnoweb has no per-hole board |
| Course leaderboard | `Leaderboard` top 10; `ranks` | top 10; win card "On-chain #" found only in the top 10 | top 10 per mode | a player ranked beyond 10 sees "–": no rank read exists |
| Friends | `Bests`/`Standings` (50) | full: add by address or name, invite link | none | — |
| Bot flags | none | `public/flags.json`, hide ≥ 0.5 | none | off-chain list; the numbering shifts when rows are hidden |
| Archived holes | kept, `next` set, drained from standings | playable by `?hole=<id>`; a Boards note links the current one | listed "archived" with a note | **bug:** the HUD says "Hole 1 of 18" and the address bar is rewritten to `?cup=<cup>&hole=1` (`engine.js:149` falls back to 1, `Golf.jsx:630`). A reload or a share opens the *current* hole 1. |
| Community holes | open Register, `official=false`, unranked | Worlds lists **12** of up to 120 − 74; playable; saveable | table | same URL bug as archived. gnoweb `playLink` (`render.gno:43`) sends `?cup=world&hole=order`, which the client resolves to the *official* hole there. It should be `?hole=<id>` for non-current holes. |
| Weather forecast display | `State.weather`, `Weather`, the period | HUD kind + "for N min", flag and decor, fog clip of the preview | "Weather now … for m:ss" | storm wind (D5); `kind`/`wind` fields ignored; no next-period forecast (by design) |
| Save-before countdown | window = period, period+1 | `SaveClock` "Save within m:ss", stale → replay | text note | device clock, no margin (D2); no warning *before* the first stroke (D1) |
| Storage deposit | `storage_price` param | `depositBytes` 9100 / 300 B × price → "about 0.91 GNOT" | — | a fixed estimate, not measured here (simulate reports no storage); first-save detection uses `Bests` for the mode |
| Gas cost shown | real: Reset 8.6M + PlayRoundAt 103M (3 shots, hole1) | asks gasWanted **292M** and shows **0.439 GNOT** | — | about 2.6× too high (fix 7). Adena re-simulates, so the charge is lower, but the label is off. |
| Stale period | refused with a clear sentence | caught at save and after | text | D1 |
| Reset | `Reset` (drops the round) | inside every save; "Restart" is local; "Reset scores" is the local card | Reset form | ok |
| Unlocks (gnomes) | none | `card.js`, from localStorage scores | none | **local only:** forgeable, lost on another device. Could be derived from `Bests` for a connected player. |
| Grand slam | none (no per-cup standing) | local card | none | same as unlocks |
| Launch / Pro from gnoweb | `Launch` (pro, one tx a shot) | never reads a chain round in progress; a dapp save Resets it silently | full: board, aim hint, Launch, Reset | fine. `playURL` is hard-wired to the netlify prod (`render.gno:48`), so the local chain's pages link to prod. |
| Record holder ("by") | `bestBy` stored | gone | shown in the hub table | the dapp has no "record by" |

---

## 4. End-to-end performance

The session: title → Play → Garden Cup → "Choose this gnome" → hole1 (The Shelf, par 3) → three aimed strokes (1.5 s keyboard sway + 1.6 s mouse pull per stroke) → holed in 3 → "Save on-chain". Setup:
- Local node (RTT ~1 ms), `next dev`, headless Chrome with Metal ANGLE at 1280×800.
- The route was found beforehand through the page's own chain client; those 925 queries are not counted.
- Adena is stubbed. The read-back then never finds the round and polls `Round` 8 times, where a real save needs 1–2. The table counts the real case.

### 4.1 RPCs and bytes (wire bytes of the JSON-RPC answer)

| Read | Assisted n | Pro n | Wire bytes each | Query gas each (net) | When |
|---|---|---|---|---|---|
| `Holes()` | 1 | 1 | 18.2 KB (11.4 KB payload) | **163M** | page load |
| `State(hole1)` | 1 | 1 | 4.7 KB (2.7 KB) | 43M (island18 in a storm: **171M**) | hole load |
| `Period()` | 1 | 1 | 0.3 KB | ~0 | load → newRound → freshWeather (redundant right after State) |
| `Weather` | 0 | 0 | 0.1–1.3 KB | 7M clear, **142M storm** (puddle placement, `course.gno:334`) | only if the period turned |
| `/status` (chainId) | 3 | 3 | 1.6 KB | — | twice at start (`Golf.jsx:454` and `:534`), again at holing |
| `auth/gasprice`, `bank/balances`, `storage_price` | 2+3+2 | 2+3+2 | 0.3 KB | — | at connect **and again at every holing** (`Golf.jsx:538` effect on `holedNow`); balance again after the save |
| `Bests` | 2 | 2 | 0.4 KB | ~3M | "saved already?" at load and at holing |
| `SimulateRoundAt` (1 shot) | 8 | 1 | 0.8 KB | 40M | stroke 1: 7 previews + the shot |
| `SimulateFrom` | 16 | 2 | 0.75 KB | 36M | strokes 2–3: 7 previews + the shot each |
| `Leaderboard` | 1 | 1 | 0.4 KB | ~2M | win card rank |
| `SimulateRoundAt` (3 shots, save check) | 1 | 1 | 0.8 KB | 90M | splitRound |
| `Round` (read-back) | 1–2 | 1–2 | 0.3 KB | ~36M (replays the last stroke) | after sign |
| **Total** | **~42 RPC, ~51 KB** | **~21 RPC, ~35 KB** | | **≈ 1.25 G gas / ≈ 0.46 G gas** of qeval | |

The writes, one tx each mode: `Reset` + `PlayRoundAt`/`PlayRoundPro`, 8.6M + 103.2M = **112M gas used**. The client asks for 292–293M and shows about 0.44 GNOT. The captured messages are right: `Reset(hole1)`, then `PlayRoundAt(hole1 | 24.0000,6.5000;60.0000,10.0000;150.0000,8.0000 | 5967684)`.

The pro session costs about 37% of the assisted one in query gas, because there are no previews. `Holes()` alone is 13% of an assisted session and 35% of a pro one.

### 4.2 Timings

| | Assisted | Pro |
|---|---|---|
| DOM interactive (title) | 465 ms | 427 ms |
| Hole built and shaders compiled behind the title | 905 ms | 866 ms |
| Cup pick → play | 0 RPC (the garden's first hole is the one preloaded); then the 1.5 s overview and the glide | same |
| First shot: release → replay start | **55 ms** (SimulateRoundAt 35 ms on the wire) | **32 ms** (26 ms) |
| Strokes 2–3: SimulateFrom on the wire | 29–39 ms | 36–37 ms |
| Replay length | 1.1–1.5 s | 1.1–1.5 s |
| Frames during the replay (rendered) | 16.7 ms median, p95 16.8, max 33.4 (one hitch); JS per frame 0.9–1.4 ms median, 1.8–1.9 p95, max 2.3 | 16.7 / 16.8 / 16.8; JS 0.8–1.4 / 1.7–1.8 / 2.1 |
| Previews while aiming (3.1 s a stroke) | 7 a stroke, about 2.3/s (the debounce holds) | 0 |

On a remote node, every shot's release → replay start is one full RTT plus the qeval: about 150–400 ms on a testnet. In Assisted that request is usually a repeat of the preview already answered for the same aim.

### 4.3 What is cached, what is refetched

| Data | Cached? |
|---|---|
| `Holes()` | once per page (`engine.start`); not refreshed, so its `plays` and `best` go stale. That is fine, because they are unused. |
| `State` | refetched on **every** hole load, including going back to a hole already seen. The geometry is immutable for a hole id; only the wear, the rounds and the weather change. |
| Previews | `answers` Map (256) keyed by hole, period, round so far and shot; cleared on each hole load (`aimer.forget`); **not consulted by `fire()`** (`engine.js:871` calls `strokeFrom` directly). |
| `Leaderboard` | 5 s memo shared by the two sheets |
| gas price, chain id, storage price, balance | re-read on account change **and on every hole finished** |
| `Period` | re-asked at every new round (Restart, Play again, every load), even right after State gave it |
| Next hole | not prefetched: "Next hole →" means State + world chunk + build while the curtain is shut |

---

## 5. Ranked fix list

| # | Where | What | Effort |
|---|---|---|---|
| 1 | `web/lib/engine.js:871`, `engine/aim.js:134` | Let `fire()` reuse the preview answer: expose `answers.get(keyOf(q))` for the same hole, period, shots and shot string, and use it before `strokeFrom`. Assisted release → replay goes from 1 RTT to 0. It saves 3 qevals (~110M gas) a hole. | S |
| 2 | `web/lib/adena.js:171-184` | Compute the split with the chain's `work` model on the client (walls, pieces, `pts`: all already in the snapshot) and keep SimulateRoundAt only as the check of chunk 1. This stops a chunk 2 from being refused after chunk 1 is on chain (D7). | S |
| 3 | `web/lib/engine.js:857` (`shoot`), `:549` | Before stroke 1, if `Date.now() ≥ (g.period+1)·300e3`, await `freshWeather()`. Also re-run it when the HUD's `until` passes with no shot played. This keeps a round from being unsaveable from its first stroke (D1). | S |
| 4 | `web/components/Golf.jsx:122`, `:547` | Save deadline: take the clock offset from the `/status` already read (`latest_block_time`), and stop about 15 s before `(period+2)·300` (D2). | S |
| 5 | `web/lib/engine.js:149`, `web/components/Golf.jsx:630`; `r/gnogolf/golf/render.gno:43` | For a community or archived hole, don't fall back to place 1: write `?hole=<id>` in the address bar and the share link. In gnoweb, `playLink` should emit `?hole=<id>` when `!official \|\| next != ""`. | S |
| 6 | `r/gnogolf/golf/state.gno:366-379`; `web/lib/terrain.js:24`, `scene/cause.js:25` | Add `"air":true` and `"capped":true` to the zone JSON (only when set: no bytes for most zones). The client then reads `z.air` instead of guessing from skins. | S (needs a hub redeploy) |
| 7 | `web/lib/adena.js:154-160` | `PER_CALL` 170M against the measured ~9M Reset + ~10M call overhead; the forecast is already inside the 103M. Measured 112M against 292M asked: the fee label is about 2.6× high. Lower it to about 40M, or show the SimulateRoundAt-based estimate. | XS |
| 8 | `web/components/Golf.jsx:1764`; `state.gno:461-491` | HoleLeaderboard paging: the next offset must be `offset+PAGE` (chain offsets), and done = `offset+PAGE ≥ players`. Rows skipped for deleted names otherwise end the board early. Example: 25 on the board, #3 deleted → page 1 has 9 rows → "done", and 15 players are hidden. Better: have the hub return `next`. | XS |
| 9 | `web/lib/scene/weather.js:329-331` | Storm: take the wind from `forecast.wind` (or the mean of the timed winds), and animate the timed `wind` zones like `gust` (D5). | S |
| 10 | `r/gnogolf/golf/state.gno:56-66` | State's 24 rounds (with their shot strings) are never read by the client. Add `Hole(hole)`, State without `rounds` and `plays`, or a flag. On a busy hole that saves up to about 30 KB and the gas of 24 `roundJSON`. | S (hub redeploy) |
| 11 | `r/gnogolf/golf/state.gno:229-240`, `render.gno:655` | `Holes()` costs 163M a page load: one `ufmt.Sprintf` of 5 fields per hole, plus an insertion sort over 74 entries. Use `strconv` as `jnum` does, and keep `listed()` order in a maintained tree. Client side: cache Holes in `sessionStorage` for the tab (reload and Retry). | S |
| 12 | `web/components/Golf.jsx:454`, `:529-539` | Read chainId once. Don't re-read gas price and storage price at every holing: they are params. Keep the balance re-read. Saves 3–4 RPCs a hole. | XS |
| 13 | `web/lib/engine.js:461-465`, `:623` | Don't call `Period()` in the `newRound` of a load: State just gave `period`. | XS |
| 14 | `web/lib/engine.js` (`load`), `components/Golf.jsx` (win card) | Prefetch the next hole's `State` (and its world chunk) when the win card shows. Cache `State` geometry per id and refresh only weather and wear. "Next hole →" is then a local build. | M |
| 15 | `web/lib/engine.js:31`; `state.gno:307` | Round stroke limit: either allow up to 60 client-side (with the split from fix 2 and a chunked pre-check), or document 12 as the dapp's limit. The chain says 60 (D6). | S / doc |
| 16 | `course.gno:334` (`wet`) | Storm and rain forecasts cost up to 142M a read (State + Weather on the lane holes). Memoise per (hole, period) in the realm? That isn't possible in a read, so make `wet` cheaper: fewer `dryLand` probes. | M |
| 17 | `web/components/Worlds.jsx:200` | Community list capped at 12, with no "more": add paging or "show all". | XS |
| 18 | `web/components/Golf.jsx:1521-1531` | The win card's on-chain rank is found only in the top 10. Say "not in the top 10" rather than "–", or add a `Rank(mode, addr)` read (the rank key is known: count the keys before it). | XS / M |
| 19 | `web/lib/chain.js:169` | Stale comment: "block time / 900", which is really 300. | XS |
| 20 | `web/lib/adena.js:210` | `String(period ?? 0)`: throw instead of sending 0. | XS |
| 21 | `card.js` unlocks and slam | Local only. For a connected player, cross-check with `Bests`. That is a product decision, not a bug. | M |
| 22 | `course.gno:67` vs `golf.gno:251` | Par clamps disagree (`<20` against `>20`). | XS |
