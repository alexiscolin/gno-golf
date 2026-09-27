# Robustness and scalability review: client and chain (2026-09-24)

Scope: `web/` (Next.js + three.js client) and `gno.land/` (hub `r/gnogolf/golf`, packages `p/gnogolf/*`). This is a review only: no code was changed. It overlaps with `deep-security.md` Y3, Y4 and Y6 and with `js-review.md` items 4 to 6, and adds numbers to them.

## How it was measured

- **Chain gas** was measured with gnomcp `gno_run` and `gno_call` (simulate=true, profile `gnogolf`, gnodev on `:26757`). This uses the real store, so store-read gas is included.
- **Storage** was measured with scratch filetests. They register `hole2` or `hole3` and play rounds, and `gno test -v` prints the realm storage diff.
- **O(players) CPU gas** was measured with a scratch internal test that inserts 5,000 synthetic finishers. The test runner keeps objects in memory, so these figures leave out store-read gas (59,000 gas per uncached read in `tm2/pkg/store/types/gas.go:410`). The on-chain figures below add an estimate of that gas.
- All the scratch tests were deleted afterwards. `golf/zz_perfp_filetest.gno` belongs to another agent and was left in place.

| Measurement | Result |
|---|---|
| `SimulateRound` on hole2, 12 shots (a preview at stroke 12) | **885M gas**, about 0.5 to 0.6 s of node CPU on this Mac |
| `SimulateRound` on hole2, 1 shot | about 70M gas |
| `PlayRound` on hole2 by a new player, 1 shot (tx) | 95M gas |
| `Holes()` (about 70 holes) | 202M gas, 12.7 KB |
| `State(hole2)` | 103M gas |
| `HoleLeaderboard`, 0 finishers | 16M gas |
| `HoleLeaderboard`, 5,000 finishers (CPU only) | 300M gas, about 60K per finisher |
| `retire()`, 5,000 players (CPU only) | 913M gas, about 180K per player |
| Register one hole | +7.1 KB hub state |
| First holed round of a new player (hole3, 1 shot) | **+7.4 KB** hub state, about 123M gas |
| Round in progress (hole2, 3 shots, not holed) | +4.6 KB |
| The same player replaying a hole (Reset + PlayRound) | +2 B: the round is replaced, not added |
| One `bests` entry | about 2.0 KB |
| One `totals` row | about 3.0 KB |
| Default storage price (`vm/params.go:41`) | 100 ugnot/B, so 10 KB costs 1 GNOT |
| Query gas cap (`maxGasQuery`) and block max gas | 3B each. Adena simulates with at most 2B |

## Findings, ranked

Effort: S is under an hour, M is up to a day, L is several days.

### 1. Aim previews replay the whole round, and one aiming player keeps the RPC node busy (scale, critical)
- **Where:** `web/lib/engine.js:1386` (`PREVIEW_MS = 70`), `:1428` (`simulateRound(... [...q.shots, next])`), `:749` (on a timed hole, a new preview every 250 ms even when the hand is still). On the chain side, `state.gno:215-239`.
- **Scenario:** every preview sends all the shots so far, so a preview at stroke k costs k × 40 to 120M gas.
  - One request is in flight at a time, and the next goes out as soon as the answer lands. So an aiming player keeps about one query running on the node all the time. It costs about 40 ms at stroke 1 and 0.5 to 1 s at stroke 12 on a busy hole.
  - A 3-stroke round costs about 10B gas of previews, which is about 6 s of node CPU.
  - On the tm2 in `~/Server/gnoland/gno`, queries run in parallel up to GOMAXPROCS (`tm2/pkg/bft/proxy/client.go:17,68`). Older nodes run all queries behind one mutex shared with consensus (`abci/client/local_client.go:189`).
  - So an 8-core RPC node saturates at about 8 to 15 players aiming at the same moment, and an older node at 1 or 2.
  - Beyond that, the 1.5 s preview timeout (`:1428`) starts dropping previews, and the dots fall back to a straight line without a word. Next the 8 s shot query times out, and the player gets "That shot did not go through".
  - On a shared public testnet RPC, per-IP rate limits (typically 10 to 20 req/s) are reached by one player at stroke 1, where a preview takes about 70 ms.
- **Fix, in order of value:**
  - (a) Add a `SimulateFrom(hole, token, shot)`. `token` is an exact state: the float64 bits of the ball, the stroke, the period and the tick. SimulateRound/PlayRound return it. A preview then costs one shot, not k. Replaying at record time keeps the round unforgeable.
  - (b) Preview only when the pull rests (a debounce of about 150 ms), and cache answers by the quantised (angle, power, tick).
  - (c) Serve the game from a dedicated pool of query nodes behind a load balancer (`?rpc=`): the reads scale horizontally.
  - (d) Longer term: port the physics to JS, pinned by the golden tests, for the preview only, with the chain resolving the shot at release.
- **Effort:** (a) M, (b) S, (c) M (ops), (d) L.

### 2. On gnodev, the chain's clock stops between transactions, so a round can be refused after Adena accepted it (robustness, high)
- **Where:**
  - `weather.gno:20` (`Period()` is `time.Now()`, which is the block time) and `:50-55` (`playablePeriod`);
  - `engine.js:860` (the period is taken from `State` at load);
  - `tm2/pkg/sdk/baseapp.go:571` (a query uses the last block's header);
  - gnodev runs with `emptyBlocks: false` (`contribs/gnodev/command_local.go:41`).
- **Scenario:** confirmed on `:26757` at height 2, where the block time stayed at 14:28:54 while the wall clock moved on.
  - Every query, and Adena's simulation, sees the last block's time. The first block after an idle spell carries the real time.
  - If the chain was idle for more than 5 to 10 minutes before the record, the client's period is stale: the simulation passes, then `PlayRoundAt` panics in DeliverTx ("period X is not the current weather (Y) or the one before"). The player pays the gas and sees the raw panic.
  - The weather HUD countdown (`Golf.jsx:491`) is wrong too.
  - Testnets create empty blocks (the tm2 default is `CreateEmptyBlocks: true`), so this hits local play, demos and gnodev-hosted events.
- **Fix:** run gnodev with `-empty-blocks` (document it in README and CLIENT.md). Client side, see finding 3.
- **Effort:** S.

### 3. A round must be recorded within 5 to 10 minutes of the hole loading, with no warning (robustness, high)
- **Where:**
  - `engine.js:860` and `:918-929` (`freshWeather` runs only in `newRound(ask)`, never before the first shot);
  - `golf.gno:305-314` and `weather.gno:50-55` (only the current period or the one before is accepted);
  - `Golf.jsx:317-347` (`recordIt` has no pre-check).
- **Scenario:**
  - The player opens a hole 10 s before a period turns, lines up for a while, takes 4 strokes and reads the win card. The record reaches the chain more than 5 min 10 s later.
  - Adena's simulation fails with the chain panic, shown raw in `record.error`. The round can never be recorded, because the same shots in the current weather are a different round.
  - A player who sits on the tee for more than 5 minutes is doomed before the first shot.
- **Fix:**
  - (a) Before the first shot, if `Period()` moved, refetch the weather (`freshWeather` with `ask`).
  - (b) Show "save before mm:ss" on the win card, from `(period + 2) * 300`.
  - (c) When the period has passed, `SimulateRoundAt(shots, now)`. If it still holes in the same strokes, record in the current period. Otherwise say plainly "the weather changed; this round can no longer be saved".
  - (d) Chain side, optional: accept `now-2`.
- **Effort:** (a) S, (b) S, (c) M, (d) S.

### 4. The storage deposit is about 3 to 4 times the gas, and the page neither shows it nor checks it (robustness and UX, high)
- **Where:** `web/lib/adena.js:196-201` (`shortOf` and `costOf` count gas only), `Golf.jsx:895` ("plus a small storage deposit"), `Golf.jsx:683-693`.
- **Scenario:**
  - A first finish on a hole writes about 7.4 KB, which is **0.74 GNOT** of deposit at the default price. The gas at 0.001 ugnot/gas × 1.5 is about 0.18 GNOT (hole3).
  - An account holding 0.3 GNOT sees no warning and gets Adena's "insufficient funds".
  - A player who records the whole course (72 holes) locks about 40 to 50 GNOT, and nothing ever refunds it (there is no delete path).
- **Fix:**
  - Read `vm/params` `storage_price` and add an estimated deposit to `costOf`/`shortOf`: about 7.5 KB for a first finish on a hole, about 0 for a replay.
  - Shrink the state (finding 6).
- **Effort:** S (client), M (state).

### 5. `retire()` becomes impossible once about 5,000 players have a `totals` row, which freezes the cup slots for good (scale, high)
- **Where:** `golf.gno:224-243` (a pass over the old hole's `bests`, then a pass over **every** `totals` row with a `named()` cross-realm call each), and `golf.gno:125-131` (`improve` creates a row for any finish, official or not).
- **Scenario:**
  - Measured at about 180K CPU gas per player. Store reads add about 150 to 300K (the `totals` node, the `bests` node, and a `users` avl lookup per `named()`).
  - At about 400K per player, a replacing `Register` passes Adena's 2B simulation cap at about **5K players** and the 3B block limit at about **7.5K**.
  - The registering tx then always fails, and that world/order slot can never take a newer hole.
  - Sybils can inflate `totals` for free by finishing any throwaway unofficial hole (security Y3).
- **Fix:**
  - (a) Create `totals` rows for official finishes only (1 line).
  - (b) Keep a rank-ordered avl index `holes desc / strokes asc / player`, so the top ten is a prefix read and needs no refill.
  - (c) Make retire incremental: set `old.next` and enqueue it. Add a public `Crank(n)` that anyone may call, which walks at most n players from a stored cursor and fixes their rows and index keys. Or make standings lazy: keep, per player, their bests on current slots, and recompute a player's row on their next finish or read (at most 72 lookups).
- **Effort:** (a) S, (b) M, (c) M.

### 6. Hub state grows about 5 KB per (player, hole), forever (scale, high)
- **Where:** `golf.gno:60-69` (`round` keeps `path []float64`, `air`, `shots`), `:342-347` and `:475-482` (a round is created for any caller, even on `Reset`), `:388-394` (`bests`), `:125-131` (`totals`).
- **Scenario:** the measured sizes are a round in progress of 2.4 to 4.6 KB (path-dominated), 2.0 KB per best, and 3.0 KB per totals row. So:
  - 10K players × 10 holes: 100K rounds, 60 to 70 MB;
  - 100K players × 10 holes: about 650 MB;
  - 1M players × 10 holes: **about 6.5 GB** of realm state. Every avl read then goes deeper and costs more store gas.
- **Fix:**
  - Stop storing `path` and `air`. The last shot's path can be rebuilt with `SimulateRoundAt(shots, period)`, and the client already replays from the shot list.
  - Keep the shots as one string, not a `[]string`.
  - Store a `bests` value as a small int in a packed string per hole, or keep the avl but with shorter keys (a 20-byte address, not bech32).
  - Optional: drop a round in progress when it is replaced by `Reset`, which already happens, and do not create a round on `Reset` for a player who has none.
- **Effort:** M.

### 7. `HoleLeaderboard` scans every finisher, with a cross-realm `named()` each (scale, medium to high)
- **Where:** `state.gno:360-411`.
- **Scenario:**
  - At about 60K CPU plus about 200K store gas per finisher, a page costs about 0.25B gas per 1K finishers of a hole/mode (about 0.15 s of node time).
  - It passes the 3B query cap at about **12K finishers**, after which "This hole" shows the raw out-of-gas error.
  - Every "Show more" rescans from the start.
  - botcheck runs this 144 times a pass (72 holes × 2 modes).
- **Fix:** keep a sorted per-hole index `bestIdx[m]` with keys `%03d/<player>`. Delete the old key on improvement, and iterate until `offset+limit` named rows are found. That makes a page O(page), not O(N) (security Y4).
- **Effort:** M.

### 8. A timeout at startup reads as a bug, and there is no retry anywhere (robustness, medium)
- **Where:** `Golf.jsx:774` (the regex matches `timeout` but not "signal timed out" or "The operation timed out", which is what `AbortSignal.timeout` throws), `web/lib/chain.js:22-31` (no retry).
- **Scenario:**
  - A slow or hanging node at startup shows "Something went wrong … Reloading usually fixes it", not "The course is not reachable".
  - A 200 answer with an HTML body (a captive portal or a proxy error page) throws a JSON SyntaxError, which also shows as a bug.
  - One dropped packet during a shot shows the error banner. Reads are idempotent, so one quiet retry is free.
  - While gnodev restarts mid-hole, previews fail silently: the dots go straight, which misleads the aim.
  - The shot then says "did not go through", and "Keep playing" works once the node is back and the holes are registered again.
  - If the restart wiped the holes, the player loops on "unknown hole" until a reload, which then shows the "bug" banner ("no hole is registered on this chain").
- **Fix:**
  - Add `timed out|TimeoutError|Unexpected token|no hole` to the "down" regex, or better, tag the errors in `query()` (`e.kind = "down"`).
  - Retry a failed query once after 400 ms (for GETs only).
  - After two failed previews, show "the chain is slow, the aim line is paused".
  - Map "unknown hole" to the `load` kind.
- **Effort:** S.

### 9. WebGL unavailable crashes the page: there is no error boundary (robustness, medium)
- **Where:** `Golf.jsx:197` (`createGame` is called in an effect with no try; `makeRenderer` in `lib/scene/camera.js:12` throws "Error creating WebGL context"), `Golf.jsx:989` (`makePreview`), and `app/` has no `error.jsx` and no boundary.
- **Scenario:** hardware acceleration is off, iOS Lockdown Mode is on, the GPU is blocklisted, or the browser has too many contexts. The throw inside the effect unmounts the whole React tree, and the player sees Next's "Application error: a client-side exception has occurred" on a blank page. Any render-time exception elsewhere (for example finding 12) does the same.
- **Fix:**
  - Wrap `createGame` in try/catch and `setFatal({ kind: "webgl" })`, with the text "Your browser can't draw 3D here — enable hardware acceleration" and a link to the gnoweb board (`/r/gnogolf/golf`), where the game is playable as text.
  - Add `app/error.jsx` (Next's boundary) with a Reload button.
- **Effort:** S.

### 10. WebGL context loss is not handled (robustness, medium)
- **Where:** no `webglcontextlost` or `webglcontextrestored` listener in `lib/`.
- **Scenario:** on a low-memory phone, going to the background or opening a heavy tab drops the context.
  - three.js calls `preventDefault` and re-initialises its state on restore. Most buffers re-upload, but nothing here re-bakes the hole or tells the player, and on iOS the restore often never comes. The canvas stays black under a live HUD.
  - The Picker's second context (`Golf.jsx:984-996`) raises the pressure. The shared-resource disposal bugs (`js-review` items 4 to 6) and the InstancedMesh leak (item 5) make it more likely over a long session.
- **Fix:** listen on the canvas.
  - On loss: pause and show "Graphics were reset".
  - On restore: `load(g.id)` again.
  - If there is no restore within 3 s: offer Reload.
- **Effort:** S.

### 11. The gas estimate refuses rounds that would fit (robustness, medium)
- **Where:** `adena.js:151,158` and `engine.js:131` (`pieces` counts every zone, plus 8 for a timed hole, at 4.5M a piece a shot).
- **Scenario:** zones cost far less than walls. A 12-stroke round on a 40-piece hole is estimated at 3.0B and refused before Adena opens ("too long to record"), while the real cost is about 1.5B (the realm comment says at most about 1.8B).
- **Fix:** count walls and posts only, or better, ask the chain.
  - A `gno_run`-style simulation is not open to the page, but Adena simulates anyway.
  - So remove the client refusal. Only cap `gasWanted` at `MAX_GAS`, and translate Adena's out-of-gas simulation error into the same sentence.
- **Effort:** S.

### 12. Race conditions in the boards (robustness, low to medium)
- **Where:** `Golf.jsx:1473-1480` (`loadMore` has no `live` or mode guard) and `Golf.jsx:1559-1565` (`Leaderboard` never clears `err`).
- **Scenario:**
  - The player taps "Show more", then switches Assisted to Pro. The pending assisted page is appended to the pro list.
  - A failed read leaves its red error above the rows of a later successful one.
- **Fix:** key the pending request by `mode` and `s.id`, drop mismatches, and `setErr(null)` on each load.
- **Effort:** S.

### 13. `chainId()` has no timeout and no status check (robustness, low to medium)
- **Where:** `chain.js:75`, used raw in `Golf.jsx:285` (`connectWallet`) and `:246`.
- **Scenario:** a node that accepts the TCP connection but never answers leaves "Check Adena…" busy for minutes. `chainId`, `gasPrice` and `chainName` are cached in React state for good, so a gnodev restart under a new chain id sends Adena the old one.
- **Fix:** route it through `query()`-style `fetch` with `AbortSignal.timeout` and a `res.ok` check. Re-read the chain id in `recordIt` rather than trusting the cache.
- **Effort:** S.

### 14. Test hooks answer in production (robustness and trust, low to medium)
- **Where:** `Golf.jsx:30-39,203,220,224` and `lib/promo.js:13`.
- **Scenario:**
  - `?won=1` shows a real-looking "Hole in one!" win card, with share text saying "The gno.land VM replayed it" for a round nobody played. That is a fake brag screenshot one link away.
  - `?camlog` exposes the game on `window.__g`.
  - `?promo` switches the capture rig on.
  - `?shot=`, `?demo=` and `?play` are harmless, but a bad value surfaces as a chain error banner.
  - `?rpc`/`?web` accept any https host (`chain.js:138-146`). A link can point the game at a look-alike node and gnoweb, with fake boards and a "read its code ↗" link to a phishing page. Adena still guards the signing (`adena.js:62-64`).
- **Fix:**
  - Compile the hooks out behind `process.env.NEXT_PUBLIC_DEV`, or require `?dev`.
  - For `?rpc` on a host that is not the build's, show a persistent "Playing on <host>" chip.
- **Effort:** S.

### 15. Period boundaries on the chain: the check is on the first stroke only (chain, low)
- **Where:** `golf.gno:252-259` (Launch) and `:306-314` (`playRound` checks `playablePeriod` only when `strokes == 0`).
- **Scenario:**
  - A round started by `Launch` keeps its period forever. A player can open rounds in several calm periods (future weather is computable, see security OQ3), wait, and finish the best one days later through `PlayRoundPro(…, oldPeriod)`. That is pro-board weather picking.
  - At an exact boundary, a round played in P and recorded in P+1 is accepted. In P+2 it is refused (finding 3).
- **Fix:** also refuse a round in progress whose `r.period < Period()-1`. It becomes Reset-only, and gnoweb's Launch still works within 10 minutes.
- **Effort:** S.

### 16. Behaviour at the limits (chain, low: all fail closed)
- `maxShots = 12` (`golf.gno:40`): a longer list panics in both `PlayRound` and `SimulateRound`, and the client caps at 12 (`engine.js:39`). This is consistent.
  - A 13-stroke player gets "the most strokes a round holds", and can never record a round worse than 12. That is by design, but the 2B Adena ceiling (finding 11), not this cap, is what really binds.
- `maxRoundStrokes = 60` is reachable only through gnoweb's `Launch`. `PlayRound` continuing an in-progress round can cross it mid-list: the whole tx reverts, which is fine.
- `maxPath = 512` is checked in `stroke` only, not in `simulateRound` or `Simulate`. A hostile hole's huge path inflates only its own query output. That is acceptable, but the check should be the same in both places.
- `maxTick = 1023` clamps silently. That is fine, and the client caps its cycle at 1024 (`engine.js:950`).
- Validating before quantising (security Y6): a power in (0, 5e-5) is recorded as `0.0000` and cannot be replayed. Quantise first. **S.**

### 17. `retire` during a round, and a hole whose methods panic (chain, low: sound)
- **A round in progress on a hole being archived** goes on. Finishing it records on the archived hole, and `improve(official=false)` leaves the course standing alone. This is correct.
  - But the client's hole list is read once per session (`engine.js:2137`), so a player mid-session saves on the archived hole without being told it no longer counts.
  - Fix: after a record, re-read `Holes()` and warn if `next` is set. **S.**
- **A hole whose methods panic:**
  - `Register` reads name, world, order and par once. A panic there aborts only its own registration.
  - `Holes()`, `renderHub`, `Leaderboard`, `retire`, `Bests` and `Standings` never call hole code (`render.gno:587-609`).
  - `State`, `Simulate*`, `Extras`, `Weather`, `Reset` and `Play*` do, but only for that hole.
  - So containment holds.
- **The one cross-hole effect** is node load: a hole whose `Preview` burns the full 3B query gas holds a query slot for about 2 s per free call. That is a generic gno DoS, so rate-limit queries at the RPC proxy.

### 18. flags.json and botcheck do not scale past about 1,500 candidates (scale, low to medium)
- **Where:** `scripts/botcheck.mjs:79-98` and `Golf.jsx:1299-1319`.
- **Scenario:**
  - The candidates are the course top ten plus the `--top` of every hole/mode, at most about 1,450.
  - Collecting their bests takes 144 × ⌈P/50⌉ `Bests` calls. At P = 1,450 that is about 4,200 calls × 150 ms, about 10.5 min, plus 144 full `HoleLeaderboard` scans (finding 7).
  - `MAX_SIMS` and `MAX_ROUNDS` = 300 per run, so at scale most candidates stay "unchecked" (`null`).
  - The file is static: a new flag needs a rebuild and redeploy.
  - Client side, hiding rows after paging leaves pages with fewer than 10 rows, and the shown rank (`i+1` after filtering) differs from the chain's.
  - The file itself stays small (about 100 B per flagged player, 150 KB at the cap).
- **Fix:**
  - Run botcheck incrementally. Check only players whose best changed since the last run: follow the `holed` events through the tx-indexer.
  - Serve flags.json from a location the site can refresh without a rebuild (a Netlify blob or function), with `Cache-Control: max-age=300`.
  - Show the chain rank rather than the filtered index.
- **Effort:** M.

### 19. localStorage, a hidden tab, reduced motion (client, low)
- **localStorage:** every access is in try/catch, and quota or private mode degrades to not remembering.
  - One crash path: `earned()` (`Golf.jsx:1598-1604`) returns whatever JSON is stored, and render calls `.includes` on it (`:163`). A non-array value (a hand edit, or an older format) throws in render and blanks the page (finding 9).
  - Fix: `Array.isArray(x) ? x : []`. **S.**
- **A hidden tab:**
  - The rAF loop skips drawing (`engine.js:716`), `visibilitychange` cancels a pull (`:1217`) and the ambience is muted (`feel.js:133,179`). This is good.
  - A replay's rAF pauses while the shot's safety timer keeps running, so the replay is cut and the ball placed where the chain says. That recovers correctly.
  - The tab-title roller (`Golf.jsx:141`) keeps its 140 ms interval in the background. That is trivial.
- **Reduced motion:** CSS honours it in 7 places, and the timed-piece clock slows (`engine.js:746`). The camera flights, confetti, gnome bob and flag flap still run, so gate them on `motion` (`materials.js:92`). **S.**
- **iOS 15 and older Safari** have no `AbortSignal.timeout` (`chain.js:23`), so every query throws a TypeError and the page shows the "bug" banner. Fall back to an `AbortController` plus `setTimeout`. **S.**

### 20. What a player sees on each failure (current behaviour)

| Failure | What the player sees | OK? |
|---|---|---|
| Node down at start (connection refused) | "The course is not reachable right now" and Try again (reload) | yes |
| Node hangs at start (8 s timeout) | "Something went wrong" and Reload | no (finding 8) |
| No hole registered | "Something went wrong" | no (finding 8) |
| `State` fails | "That hole did not load" and Try again | yes |
| Preview fails or is slow | straight dots, no word | no (finding 1, 8) |
| Shot query fails | "That shot did not go through" and Keep playing | yes, but add a retry |
| 12 strokes | "That is the most strokes a round holds" and Restart | yes |
| WebGL unavailable or a render exception | Next's white "Application error" page | no (finding 9) |
| Context lost | a black canvas under a live HUD | no (finding 10) |
| Adena missing | Install Adena link in "Play for real" | yes |
| Adena locked, busy or cancelled | a clear sentence (`adena.js:18-26`) | yes |
| Wrong network | switched or added automatically, with clear instructions if that fails | yes |
| Account unknown to the chain or unfunded | a gas-only shortfall note, then Adena's error | partly (finding 4) |
| Round too long for gas | refused before Adena opens | too eager (finding 11) |
| Period expired | the raw chain panic in red, no way out | no (finding 3) |
| Tx lands with a different replay | a clear sentence (`Golf.jsx:341`) | yes |

## Scaling limits

N is the number of players unless stated. "On-chain" figures add an estimate of store-read gas to the measured CPU gas.

| What | Cost model | What breaks | At N ≈ | Mitigation |
|---|---|---|---|---|
| Aim previews | k × 40 to 120M gas a preview, about 1 query in flight per aiming player | the RPC node saturates, previews time out at 1.5 s, shots at 8 s | **8 to 15 aiming at once per 8-core node** (1 or 2 on older tm2 with the global mutex). One player hits a 10 to 20 req/s public rate limit | exact-state `SimulateFrom`, debounce and cache, a query-node pool, a JS preview port (finding 1) |
| `retire` (a new version of a cup hole) | about 400K gas × players with a `totals` row | Adena's simulation (2B), then block gas (3B): the slot is frozen for good | **about 5K** (Adena) / **about 7.5K** (block) | official-only rows, a rank index, a crank or lazy standings (finding 5) |
| `HoleLeaderboard` | about 260K gas × finishers of that hole/mode, per page | the query cap (3B): the board shows an error | **about 12K finishers of one hole** (0.15 s per page per 1K) | a sorted per-hole index (finding 7) |
| Hub state | about 5 KB per (player, hole) plus 3 KB per player | the deposit per player (40 to 50 GNOT for the full course), state size, deeper avl reads | 100K players × 10 holes ≈ 650 MB; **1M ≈ 6.5 GB** | drop path and air, pack bests (finding 6) |
| Deposit per record | 7.4 KB on a first finish ≈ 0.74 GNOT; about 0 on a replay | "insufficient funds" with no warning | any player holding less than about 1 GNOT | show and check it (finding 4) |
| `Holes()` | about 3M gas × listed holes (capped at 120) | nothing: bounded | none (about 350M at 120) | none |
| `State()` | rounds capped at 24 | nothing | none | none |
| Course `Leaderboard` / `Standings` / `Bests` | O(10) / O(50) | nothing | none | none |
| `Register` of anyone's hole | 7.1 KB paid by its author | `holes` grows without bound, but lists cap at 120 | none | none (security Y5 for presentation) |
| botcheck | 144 × ⌈P/50⌉ `Bests` calls + 144 full scans | the run takes over 10 min and most candidates go unchecked | about 1.5K candidates | incremental runs from events (finding 18) |
| flags.json | about 100 B per flag | a stale file (rebuild needed) | none on size | serve it dynamically (finding 18) |

## Leaderboards at 10K, 100K and 1M players

- **10K:**
  - The course top ten is fine: it costs O(10) a finish.
  - `retire` is already broken, since about 10K `totals` rows is past about 5 to 7.5K. So is `HoleLeaderboard` on the most-played hole or two (about 12K finishers).
  - The state is about 65 MB.
  - Fixes 5a, 5b and 7 are needed before this point.
- **100K:**
  - The rank index (key `%04d/%06d/<addr>` = `(999-holes)/strokes/addr`) and the per-hole index (`%03d/<addr>`) make every board O(page).
  - `retire` must be cranked or lazy. With an index, fixing a player's row means a delete and an insert of their key, about 1 to 2M gas, so 1 to 2K players a tx, which is 50 to 100 crank txs per replacement.
  - `named()` on page rows only.
  - The state is about 650 MB unless path and air are dropped (finding 6), which gets it to about 250 MB.
- **1M:**
  - The same design holds for reads, and the writes stay O(log N).
  - Keep a player's standing lazy (a sum of their ≤72 current-slot bests, recomputed on their own finish), so a retire costs O(1) and index keys are fixed as each player next plays or through a crank.
  - Keep the rounds to the shot string and period (about 300 B), which gives about 3 GB for 10M rounds. At this size, consider keeping only the best round per (player, hole) and letting a round in progress expire.

## Recommended order

1. Finding 2 (`-empty-blocks`) and finding 3a/b: S, and they stop failed paid transactions today.
2. Finding 4 (show the deposit), 8, 9, 13 and 19's `earned()` guard: all S, and they fix the failure screens.
3. Finding 1b (preview debounce and cache), then 1a (`SimulateFrom`): the only real ceiling on concurrent players.
4. Finding 5a (1 line), then 5b/c and 7: before about 5K players.
5. Finding 6 (state diet): before a public launch, since every byte is a player's deposit.
