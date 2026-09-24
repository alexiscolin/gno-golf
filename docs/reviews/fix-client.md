# Client fixes: `web/` (PLAN D, and the new hub API), 2026-09-25

Scope: the web client only. There are also a small contract update in `CLIENT.md` and one line in `lib/scene/mountain.js`. Nothing was committed. The hub (`render.gno`) was not touched, so its no-admin footer line stays with the hub agent.

## 1. The new hub API

Every call in `lib/chain.js` was run against the live hub (`:26757`, `test-gnogolf`) through the app's own RPC code, from a node script in the scratchpad.

| call | result |
|---|---|
| `Holes()` | 74 holes, all `official:true`. There is no `by`. |
| `State(hole)` | Has `version`, `official` and `period`, and no `by`. |
| `SimulateRoundAt` | Has `rest`. |
| `SimulateFrom(rest of stroke 1, shot 2, stroke 1)` | The same path and `rest` as `SimulateRoundAt` with both shots, on hole2 (a timed hole). |
| `Leaderboard`, `HoleLeaderboard` | Have `mode`, `players` and `finished`. |
| `Round` | `null` for a player with no round. |
| `Extras`, `Weather`, `chainId`, `gasPrice`, `storagePrice` | ok |
| a bad mode | Refused by the realm. The client now always sends `"assisted"` or `"pro"`. |

**Previews and shots use `SimulateFrom`.** The code is `engine.js` `strokeFrom`.
- The first stroke is still asked with `SimulateRound` of that one shot, so the tee is exact (`State.start` is rounded to 3 decimals).
- Every later stroke, and every aim preview, is asked with `SimulateFrom(hole, rest, shot, stroke, period)` from the exact `rest` of the previous answer. That is one shot of work, whatever the round's length.
- The perf agent's debounce, cache (keyed by the round so far) and cancel are unchanged.
- Checked in the browser: after stroke 1, the preview queries are `SimulateFrom(...)` (the `fix-client-03` capture).
- The shot itself moved to `SimulateFrom` too. That way a long round on a heavy hole is never refused in the middle of play: the work cap only applies when saving.

**A bug found and fixed.** `chain.period()` has always thrown, because `Period()` returns an `int64`, not a string. So `freshWeather()` (the new weather between rounds) never ran. It now parses the int.

**JSON fields.**
- **`version`:** `qeval` warns once in the console if the realm speaks a version above 1.
- **`by`:** the snapshot no longer reads it. The source link is built from the hole id.
- **`finished`:** "This hole" shows "N finished, M ranked".
- **`Round` returning null:** the save flow already handles it.

**Cups hold only official holes** (`engine.start`). Any other hole goes to `snapshot.community`:
- it is shown as a small "Community holes · not ranked" list under the cups (`Worlds.jsx`), up to 12, or not at all;
- a community hole's HUD says "Community hole · not ranked".
- Today the list is empty, since all 74 holes are official.

**Splitting commits** (`adena.js` `splitRound`, `Golf.jsx` `recordIt`).
- Before Adena opens, the whole list is checked with `SimulateRoundAt`.
- **"commit the first N, then the rest":** the round is cut N shots at a time.
  - The first transaction does Reset + PlayRound…, and the next ones continue the round.
  - Each waits until the chain has the part before it.
  - The card says "This round is saved in 2 transactions … Adena asks 2 times", and the button reads "Adena: part 1 of 2…".
- **Any other refusal** is shown as the realm's own sentence (`refusal()` pulls `golf: …` out of the VM log), and Adena never opens.
- **A refused second part:** the message says the first part is on-chain and that saving again resends the whole round.

**The gas estimate** (`gasOf`) uses the hub's own work model:
- per shot, 10M plus 150K per wall, plus, per path point, 1.2M and 15K per piece;
- plus 170M for the call, the Reset and the forecast;
- the path lengths come from the chain's answers.

Zones now count per path point, not as walls. The old client refusal ("too long to record") is gone: the chain's pre-check decides. The ask is capped at 1.9e9.

**Modes** are passed exactly (`m()` in `chain.js`), for `Leaderboard`, `HoleLeaderboard`, `Bests` and `Standings`.

**Stale weather** (`SaveClock`, `saveBy`).
- The win card shows "Save within 4:12 or replay in the new weather". The deadline is (period + 2) × 5 min, on the device clock, because the block that takes the transaction carries the real time.
- Once it is over, the card says so and offers "Replay in the current weather", one click that restarts the hole with the new forecast. The Save button then refuses before Adena opens.
- A chain refusal that says "weather … is over" gives the same state.

**The storage deposit.**
- The price is read from `params/vm:p:storage_price` (100 ugnot/B here).
- Whether the player has a best on this hole in this mode comes from `Bests`.
- **The estimate** (fix-hub's measured sizes): about 9.1 KB (≈0.91 GNOT) for a first save on a hole, and ≈0 for a hole already saved.
- **Where it shows:** under the win card's buttons ("About X GNOT of gas + a storage deposit of about Y GNOT…"), in the Save on-chain sheet, and in the funds warning (`shortOf` counts gas and deposit).

**The leaderboard.**
- "This hole" pages through `players` with no 100-deep cap, since the hub's offsets are O(page) now.
- The new `Records`, `Players` and `Rounds` reads are paged **by address**, not by rank. They do not help a ranked board, and Friends is bounded at 50 addresses (`Bests`, `Standings`), so they are not used and no wrapper was added.

## 2. UX blockers

- **The `.note` toast bug.** The HUD toasts are now `.toast` (CSS and JSX), so `.note` is inline only. Checked: a `.note--good` injected into the win card is static, at opacity 1, after 3.6 s (`fix-client-06`).
- **Toasts under reduced motion.** `.toast { animation: none; opacity: 1 }` under reduced motion, and `Toast` dismisses itself with a 3.2 s timer. Checked with reduced motion emulated: the shared-link toast is visible at 1.5 s and gone at 4 s (`fix-client-07`).
- **Chain down.** The title keeps its loader while nothing has loaded (`loading={!s}`), so there is no Play button and no blank screen. The banner retries on its own every 10 s ("Trying again in 9 s…") and has a "Try again now" button (`fix-client-02`). Checked: the queries repeat after 10 s.
- **Escape and focus.**
  - **Who uses it:** a new `useDialog` / `Dialog` in `ui.jsx` is used by every `Sheet` (Leaderboard, Save on-chain, Scorecard, Switch aim), the menu drawer, the win card, the error banner and the graphics banner.
  - **What it does:** focus moves in, Tab and Shift-Tab are trapped, Escape closes the top dialog only, and focus goes back to the opener.
  - **Checked:** the board focuses its close button and Escape closes it; the drawer keeps focus after 40 Tabs; Escape closes the drawer.
- **The first Tab.** The canvas is `tabIndex = -1` until the course is shown (`cover(false)`). Checked: the first Tab on the title lands on Play.
- **The "Coming soon" badge.** It uses `--hat-ink: #b83a33` (5.3:1 on paper, was 3.57:1), and its sizes went up to 11 and 12 px (10 px on the HUD chip).
- **The hint** adds "or use the arrow keys and Space".

## 3. Copy

- **"Play for real" becomes "Save on-chain".**
  - The HUD button reads "Adena / Save on-chain".
  - The sheet title is "Save your rounds on-chain", and its columns are "Free play" and "Your records on-chain".
  - The win card button reads "Save on-chain".
- **Step 2** now says "It cannot move funds without your signature in Adena".
- **Step 3** now says "…so the score is the chain's own, not one you type in", and mentions the deposit.
- **The Adena install** is followed by "Installed it? Reload this page", with a button. On a testnet the faucet line says "Needs a little GNOT".
- **The win card:**
  - not saved: "Saved in this browser only. Save it on-chain to make it public and ranked.";
  - saved: "Saved on-chain: public, on your address, on any device.";
  - the "nothing is kept" line is gone.
- **Share texts**, following the deep-ux table:
  - no "couldn't find a trick", no "in writing" and no "so no, I didn't make it up";
  - the unlock line is "one putt at a time".
- **The cup-finish line** promises a gnome only when that cup earns one (`cupHasGnome`). The Mountain Cup now says "Cup finished at par or under!".
- **Unlock names:**
  - "Finish Mushroom Town", "Mushroom Town at par or under";
  - "Garden Cup at par or under", "Island Cup at par or under", "Every cup at par or under".
- **The Wizard and Viking lines** in `gnome.js` now name the Garden Cup.
- **The course board's heading** is "The course · top ten". The duplicate "Leaderboard · recorded on-chain" is gone, and the comment "the only board a score cannot be typed into" is reworded.

## 4. Robustness

- **The start timeout.**
  - `query()` tags errors `kind: "down"` (a refused connection, a timeout, a non-JSON body) or `"chain"`.
  - A read the network dropped is retried once after 400 ms. A caller's cancel is never retried.
  - `fatalKind` maps a down error to "course not reachable" and "no hole is registered" to its own text, both with the auto retry.
- **WebGL.**
  - **No WebGL:** `createGame` is wrapped in a try, which shows "Your browser can't draw 3D here" with a link to the text game on gno.land. Checked with `--disable-3d-apis` (`fix-client-10`).
  - **Render errors:** `app/error.jsx` is Next's boundary for them.
  - **Context loss:** `webglcontextlost` shows "Graphics were reset" and `webglcontextrestored` rebuilds the hole. Without a restore within 3 s, the banner offers Reload. Checked with `WEBGL_lose_context`: the banner appears, then the hole is back (`fix-client-08`, `-09`).
- **Test hooks.**
  - In a production build, `?play`, `?shot`, `?demo`, `?weather`, `?world` and `?promo` answer only with `?camlog`.
  - `?won` answers in a dev build only (`DEV = NODE_ENV !== "production"`), and `fakeWin` is gated the same way.
  - `window.__g` was already `?camlog` only.
- **`?rpc` and `?web`** go through an allowlist (`safeEndpoint`, `allowedHost`):
  - this machine (http or https);
  - the build's own hosts, `gno.land` and `*.gno.land` (https);
  - `NEXT_PUBLIC_ALLOWED_HOSTS`.
  - Anything else falls back to the default. The self-check is `demoEndpoint()`, and in the browser `?rpc=https://evil.example` used the default node.
- **The gas estimate** counts zones correctly (see §1). The self-check is `demoSplit()` in `adena.js`.
- **The "Show more" race.** A page asked for another hole, mode or tab is dropped, and `Leaderboard` clears its error on each load.
- **`chainId()`** has a 4 s timeout and a status check, and its callers wrap it in `within()`.
- **Also fixed:** `earned()` tolerates a non-array value, which used to blank the page.

## 5. Camera

- **Far on long holes.** The overview itself framed the whole hole. What cut it was the **mouse lean**: it moved the target up to `0.22·w + 3` units, so on mountain8 and town18 a mouse near an edge pushed the other end off-screen (`far-*-mouseleft-before.png`).
  - `leanRoom()` in `scene/camera.js` now works out, once per resize, how far the target may lean with every corner of the course box still inside the free screen. The lean is capped at that.
  - A long hole the overview fits end to end has almost no room.
  - Checked with the mouse at the left and right edges: the whole hole stays in frame (`far-lean-after-sheet.png`).
- **island7's lens fill.** Third person now keeps clear of closed tubes in the air: 49 points along each "tube" loop's curve, with the camera pushed out to 2.6 in 3D. A big post such as the sandcastle (r ≥ 2) gets a wider berth (r + 2.6). camsuite on island7 went from `lensFrames: 1` to 0.
- **mountain.js:** the 12 spark sprites set `visible = opacity > 0.01`.

## Checks

- `npx eslint .` is clean after each step.
- **`pulltest.mjs`** (town1): 4/4 pass.
- **`camsuite.mjs`**, all 12 holes: 11 pass on the first attempt. island2 failed once on `yawRate` 133 (the limit is 125), then passed on a rerun (96). It has no zone and one small post, so nothing changed here touches it; it is a flaky turn-rate sample.
  - island7 passes, with `lensFrames` 0.
  - Earlier in this session island7 had `afterOk: false` (rest d8.8, in rain), before and after the castle change. It passed in the full run.
- **One headless Chrome at nice 20** (its own profile, killed by PID), walking:
  - the title and the first Tab;
  - chain down and the auto retry;
  - a shot, then an aim with `SimulateFrom`;
  - the Leaderboard (focus, Escape), the menu (focus trap, Escape) and the Save on-chain sheet;
  - the win card (notes stay, countdown);
  - reduced motion, context loss and restore, and no WebGL.
- There were no page errors. The captures are in `media/ui/fix-client-*.png` and `far-*`.

## Left open

- **Adena was not driven.** Headless Chrome has no extension, so the split commit, the deposit line with an account, and the part 1/2 messages were checked by reading the code and by `demoSplit()`, not by signing.
- **No production build was run.** `next build` would overwrite `web/out/`. The hook gating depends on `NODE_ENV`, so check it once with a real build.
- **gnodev without `-empty-blocks`:** the chain's clock stops between transactions. The countdown uses the device clock, which is what the next block will carry, so on an idle gnodev a round can show "weather over" at once. That is true: the transaction would be refused. Run gnodev with `-empty-blocks` (robustness finding 2).
- **The deposit is an estimate.** Adena's own simulation shows the real figure. The client cannot simulate a signed transaction.
- **Not done** (deep-ux P1/P2, not asked for here):
  - the one-state Leaderboard (the Friends headings when not connected);
  - the phone labels;
  - the arrival card for `&vs=`;
  - the aria-live stroke announcements;
  - a HUD mute button.
- **The hub's footer line** (`render.gno`) belongs to the hub agent.
- **camsuite rewrites `results.json`** on every run. My single-hole reruns replaced the earlier full table before the final full run rewrote it. Its island2 row shows the flaky first attempt.
