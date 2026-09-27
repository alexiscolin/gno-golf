# ADR-004: Ghost duels

## Status

Proposed. The product decisions were taken with the user on 2026-09-27. One
realm change has to land before mainnet: a best keeps its shots and its
period. Everything else is client work and can ship after mainnet. There is
no on-chain duel record in V1.

## Context

A duel is a normal hole played against another player's record. The record
is shown as a see-through gnome, like the time-trial ghost in Mario Kart, and
it plays turn by turn:

1. the player shoots;
2. the rival's stroke with the same number replays, fast, and can be skipped;
3. the HUD says "You 2 · nym-ace123 3".

The chain is what makes this worth building. The rival's round is on-chain,
so nobody can fake it, and replaying it is a free read. Today the game has
everything a duel needs except one thing:

- **A round keeps its shots, a best does not.** A round is
  `{bx, by, fx, fy, strokes, done, period, shots, mode}` (golf.gno:203-211).
  `shots` is the decisions as played, `"angle,power,tick;…"`, written with
  `%.4f,%.4f,%d` (golf.gno:917-921). A finish writes only the stroke count
  into the version's bests, `e.bests(m).Set(p, r.strokes)` (golf.gno:945-951),
  keyed by player under `id + " " + mode + " "` (golf.gno:112). The round
  itself stays until the player's next save: the client records with
  `Reset` + `PlayRoundAt` in one transaction (golf.gno:21-24), and `Reset`
  frees the round (golf.gno:848-853). So the shots of a player's *latest*
  saved round are on-chain, but the shots of their *best* are gone as soon as
  they save a worse round.
- **The `Holed` event carries the shots but not the period**
  (golf.gno:969-970, owner.gno:250). Without the period the weather is
  unknown, so the round cannot be replayed from the event.
- **Replaying an old round is already a free read.** `SimulateRoundIn` and
  `SimulateFrom` take any period that has already started (`notAhead` only,
  state.gno:412-417 and 480-483, weather.gno:53-57). The weather is a pure
  function of the version id and the period (weather.gno:25-27). Wear is
  counted but never read by the physics: `PlayWith` is `PreviewWith` plus a
  wear mark (data.gno:39-44). The physics package is frozen at its path. So a
  stored round replays the same way forever.
- **The client already has the pieces**:
  - a dare link, `?by=<address>` (`holeLink`, common.ts:30-39). Landing on it
    reads the sharer's best in both modes, shows it on the picker and in a
    toast, and adds the sharer to the friends (Golf.tsx:660-682);
  - friends kept in the browser (friends.ts:1-28), read with `Bests`, which
    covers named and unnamed players alike (state.gno:843-857);
  - a second, silent replay on a gnome of its own, which the share clip
    already runs (engine/clip.ts:67-87).

## Decision

### 1. A duel is a solo round with a rival's best replayed next to it

- Nothing about the player's own round changes. It is played, previewed,
  saved and ranked exactly as it is today. The rival is only drawn: the ghost
  is not part of the physics, and the two balls pass through each other.
- The rival is one player's **best** on this exact version, in one mode.
- The result (win, loss or tie) is worked out in the client from two numbers
  the chain already vouches for: the player's strokes and the rival's best.
  V1 does not write it anywhere.

### 2. The realm: a best keeps its shots and its period (before mainnet)

**What is stored.** The value in the bests tree changes from an `int` to a
string, `"<strokes> <period> <shots>"`, for example
`"3 5912345 12.5000,6.2000,0;…"`. The mode is already part of the key
(golf.gno:112), so it is not repeated. The shots are the round's own
`r.shots`, copied as they are, in the format `SimulateFrom` and
`SimulateRoundIn` already read. This needs no encoder, and gnoweb can print
it.

**When it is written.** In `stroke`, in the branch that already replaces a
best (golf.gno:945-951), and in the same transaction as the finish:

- a better round overwrites the string. The old shots are freed, and the
  refund goes to the player saving, who is the one who paid for them;
- a worse round, or an equal one, leaves the best and its shots alone. The
  comparison is strict (`r.strokes < v`), so on a tie the older round stays
  the ghost.

**What reads it.** Every place that reads a best as `v.(int)` goes through one
helper, `bestStrokes(v any) int`. There are nine such places:

| File | Line | What reads it |
|---|---|---|
| golf.gno | 488 | `drain` |
| golf.gno | 945, 948 | `stroke` |
| golf.gno | 979 | `seat` |
| state.gno | 752 | `HoleRank` |
| state.gno | 849 | `Bests` |
| state.gno | 887 | `Records` |
| data.gno | 429 | `BestOf` |
| render.gno | 454 | `roundSummary` |

The tests that read a best directly change too (golf_test.gno:126,
golf_test.gno:510, rules_test.gno:211).

**A new read.** `Ghost(hole, mode string, player address) string` returns
`{"version":1,"hole":…,"mode":…,"player":…,"strokes":3,"period":5912345,"shots":"…"}`,
or `null` when the player has no best. The argument order follows `BestOf`
and `HoleRank` (`hole, mode, player`) rather than the `(hole, player, mode)`
first sketched. Like `Bests`, it serves any address, named or not. It decodes
nothing: it is a tree lookup.

**Measured, not estimated.** These numbers come from a scratch copy of the
realm, run with the pearl toolchain `check.sh` uses. The setup is the
`z_storage_finish` filetest with 5 unnamed players; the baseline stores
33,937 bytes. Each row is the storage added per finish:

| How the ghost is kept | 1-stroke round | 12-stroke round |
|---|---|---|
| a string in place of the int (chosen) | +50 B | +246 B |
| a row in a separate seeded tree | +537 B | — |
| a `*best` struct in the bests tree | +860 B | — |

- **Per shot.** The string grows by about 18 bytes a shot, and each best
  carries about 30 bytes of fixed overhead. A shot's text is 15 to 22 bytes
  plus its `;`: `90.0000,0.2000,0` at the short end, `-359.9999,10.0000,1023`
  at the long end. **The "~12 bytes a shot" estimate in BACKLOG.md:323-328 is
  low by about half.** It is still cheap.
- **Cost at the local chain's price.** `params/vm:p:storage_price` on
  127.0.0.1 is 100 ugnot a byte:
  - a 3-stroke best adds about 85 B, 0.0085 GNOT;
  - a 12-stroke best about 250 B, 0.025 GNOT;
  - the worst case, 60 strokes of the longest shot text, about 1.4 KB, 0.14 GNOT.

  The price on other chains is read at run time (`storagePrice`,
  chain.ts:307-311).
- **Gas.** About +54K a finish (251,995,306 against 251,727,378 for five
  12-stroke finishes). That is nothing next to the replay itself.

**Why before mainnet.** Packages are frozen at their path. If a best is an
`int` on mainnet, adding its shots later means a golf/v2 and a migration of
every best. Worse, the shots of any best a player has since beaten with
nothing (their latest round replaced it in the rounds tree) are already lost,
and no migration can bring them back.

### 3. Replaying the ghost costs only reads

- **Which reads.** Stroke 0 is replayed with
  `SimulateRoundIn(hole, shot0, period)`, which starts from the exact tee
  (state.gno:480-483). The client already has this read as `replayRound`
  (chain.ts:359-360). Each later stroke uses
  `SimulateFrom(hole, rest, shotN, N, period)`, starting from the exact
  `rest` the answer before returned (state.gno:412-417, `jexact` at 217-220).
  This is the pattern the player's own strokes already follow
  (engine/aim.ts:157-164). Neither read refuses a period for being old.
- **Two reads that must not be used.** `SimulateRoundAt` takes only the
  current period and the one before (state.gno:470-473). `SimulateCommit`
  refuses a later stroke whose weather is over (`notOver`, state.gno:494-499).
  **Neither can replay a ghost.**
- **Why not the whole round in one read.** `SimulateRound*` returns only the
  last shot's path (state.gno:538-540). It also takes at most 12 shots
  (`maxShots`, golf.gno:48) and one commit's work budget, 1.4e9
  (golf.gno:730-731). So a 60-stroke ghost cannot be replayed in one read.
  One read per stroke also matches the turn-by-turn play: one read a turn.
- **Cost of one read.** Each read decodes the hole and plays one shot. On the
  course holes that is 45 to 47M gas at most (docs/golf.md:805-808), well
  under the node's 3e9 query cap (docs/design/deploy-v1.md:34). A hostile
  community hole is bounded by `maxShotGas`, 1.3e9, checked at publish
  (golf.gno:754).
- **Order.** The reads are sequential, because each one needs the `rest` of
  the one before. The client asks for the rival's stroke N+1 as soon as
  stroke N has landed, while the player aims. A turn then rarely waits for
  the network.
- **Archived versions.** A version is never removed, and its data stays in
  `holeData` (golf.gno:257). `readHole` answers an archived id
  (golf.gno:365-373), and the weather follows the id (weather.gno:25-27). A
  best on an archived version therefore replays as long as the realm exists.
- **Timed holes.** Each shot string carries the shot's tick. The pieces
  depend on the stroke number (`Extras(hole, stroke)`, state.gno:630-637), so
  the rival's stroke N meets the same pieces as the player's stroke N, at its
  own tick.
- **Name gate.** A best is kept for every address; only the boards are for
  named players (golf.gno:308-315, 963-965). `Ghost`, like `Bests`, reads
  anyone. So an unnamed friend, or an unnamed sharer of a dare link, can be
  raced. Only the ⚔ buttons on the hole's board are limited to named
  players, because that board only lists them.

### 4. Drawing the ghost

- **Its own gnome and replay.** The ghost is built the way the clip builds
  its gnome:
  - a `Live` of its own, `Object.create(g)` with its own ball, cause,
    `cut` and `quiet` (engine/clip.ts:73-86);
  - its own `makeReplay(E)`. The replay's state lives in its closure
    (engine/replay.ts:91-274), so two replays do not share state;
  - a gnome and ball from `makeBall(skin)` (scene/gnome.ts:105-322), never
    `clone()`, which would share materials and `userData`.
- **Translucency.** The gnome gets its own materials through
  `ownFade(piece)` and `setFade(mat, 0.45)` (scene/materials.ts:493-535).
  Changing `flat()`'s shared palette would fade every prop of that colour
  (materials.ts:65-74).
- **Look.** The rival's skin is not on-chain, so every ghost looks the same:
  a paper-white gnome with a thin ink outline at the same opacity, no shadow
  blob, and a paper ball with an ink ring. The fadeable hull is 0.055 wide,
  twice the gnome's usual 0.028 (materials.ts:503, gnome.ts), so the ghost
  needs a thin fadeable hull of its own. Otherwise its outline reads heavier
  than the player's.
- **Where it stands.** On the tee both balls sit on the same point, so the
  ghost gnome stands on the other side of its ball. This is display only.
- **Cost.** The ghost adds a handful of draw calls to the live scene. It
  needs no second WebGL context (the clip does, the ghost does not), and it
  is one more transparent object in the sort. Two details matter:
  - its fade materials are not in `warm()` (engine.ts:623-646), so they
    compile at the ghost's first frame; they should be warmed when a duel is
    armed;
  - frames run at 60 fps only while `busy` (engine.ts:379, pace.ts:40-45), so
    a ghost replay must count as busy.
- **Cleanup.** The ghost is freed on a new hole or when the duel is dropped
  (`disposeCourse` skips shared materials, materials.ts:443-458). It is added
  to `hide()` (engine.ts:1344), so the clip never draws it by accident.
- **Name clash.** "Ghosts" already names the blank rows of an empty board
  (Leaderboard.tsx:51-62) and the dashed outlines of timed pieces while
  aiming (engine/aim.ts:125-126). The code calls this one `rival`.

### 5. Turn by turn, inside today's stroke flow

The ghost's turn fits between the end of the player's replay and the next
aim. In `shoot`, that is after `restTimed()` and before `showExtras()`
(engine.ts:1115-1121):

1. The player's ball replays and rests, as today.
2. If the rival has a stroke with this number, it replays, in this order:
   - the ghost's replay sets the scene's clock to the rival's tick
     (`showAt((tick0||0)+i)`);
   - its cause words use the rival's weather (`cg.weather`, replay.ts:152
     and 601-603);
   - it plays at twice the speed. `replay.ts` has no speed factor today, so
     one is added for `showMs`, the tunnel, climb and splash durations
     (replay.ts:230, 279, 317-390, 563) and `fly()`'s gravity (115-147).
3. `showExtras()` runs for the next stroke, then the aim comes back.

**Skip.** The `cut` token already stops every animation of a replay
(replay.ts:484-514, 609). Skipping puts the ghost's ball at its `rest`.
`onDown` ignores taps while `g.flying` (engine.ts:923), so the ghost's turn
uses a flag of its own, and a tap on the canvas, or the Skip chip, cuts it.

**The network never blocks the player.** If the rival's stroke has not
arrived 1.5 s after the player's ball rests, the aim comes back anyway. When
the answer lands, the ghost's ball jumps to its rest without animating.

**Camera.** The camera stays on the player's ball. While the ghost moves, the
frame widens to hold both balls, using `focusRig`'s second point
(scene/camera.ts:262-278). It never follows the ghost alone: the next shot is
the player's.

### 6. The rules of a duel, case by case

- **Mode.** The ghost is a best in one mode. The duel races the rival's best
  in the player's aim mode if there is one, and otherwise the other mode,
  with the aim set to match and the picker saying so. Assisted and pro are
  ranked apart because the chain cannot see a screen (golf.gno:215-218). The
  dare's reading today takes the lower best of the two modes
  (Golf.tsx:673-676). A duel must keep the mode it took the best from.
  - The aim toggle on the picker stays free (recommended, open question 1).
    A player who races a Pro ghost with Assisted aim still gets a duel; the
    end card says `Your Assisted vs their Pro`, and it earns no Ghost buster.
    Locking the toggle would drop a newcomer from a dare link into Pro, with
    no aim line, on their first hole ever.
- **Weather.** The ghost replays in its own period, and the player plays
  today's weather. The scene draws a single weather (`makeWeather`,
  engine.ts:90; `scene.fog` and `set()` in weather.ts:380 and 428), so the
  ghost's weather cannot be drawn at the same time. Its effect is already
  in its path. The screen says so plainly (see the UX section). No attempt
  is made to make the weather fair: a ghost is a record, and records keep
  the weather they were set in.
- **The rival holes first** (R < the player's strokes). The ghost drops into
  the cup and stays there, and the HUD shows ✓. When the player passes R
  strokes without holing, one toast says the duel is lost. The round goes on
  and can still be saved.
- **The player holes first.** The result is known, because R is known. The
  win card opens straight away, and the rival's remaining strokes are not
  replayed.
- **Tie.** Same strokes: "Tied with nym-ace123". When the player holes in
  exactly R, the ghost's last stroke still replays: seeing it drop too is
  the moment. On a win (fewer than R) it does not.
- **An ace ghost.** R = 1 cannot be beaten, only tied. The picker says so
  up front (see the UX section), so the loss is not a surprise.
- **No record.** When `Ghost` is `null` in both modes, there is no duel. The
  dare line says what it says today: "nym-ace123 dares you on this hole."
  (Golf.tsx:677).
- **Another version.** A cup hole's link is its slot page, which opens the
  *current* version (common.ts:32-38). A sharer whose best is on an older
  version has no best on the one that opens. That case is shown as "No
  saved round on this version". Racing the archived version is an open
  question.
- **Beat yourself.** The player's own row on a board races their own best:
  "Race your best".
- **The best changes during a duel.** `Ghost` is read once, when the duel is
  armed, and the duel runs against that copy. The end card reads `BestOf`
  again, and if the rival's best has improved it says so. Rematch reads
  `Ghost` again.
- **Restart.** Restart (Golf.tsx:1238) starts both rounds again from the tee.
- **Network down.** Arming a duel needs the `Ghost` read. After that, the
  result needs only R, so a failed replay read costs the animation, never
  the score.
- **Reduced motion.** `replay.ts` and the camera ignore reduced motion today
  (device.ts:8 is read only by the clock, `motion` and the weather). The
  ghost's stroke is never animated under it: the ghost appears at its rest,
  and its path is drawn as a flat dotted ink line for 1.5 s.

### 7. Why a ghost cannot be forged

A best exists only because `stroke` replayed its shots in its own period
(golf.gno:905-972). The ghost is those same decisions replayed again, by the
same frozen physics, in the same weather (a pure function of the id and the
period). Wear does not change a stroke. A rival cannot claim a round they did
not play, and a client cannot hand anyone a better ghost.

What a client *can* do is lie to its own player. The duel's result in V1 is
the client's arithmetic. A "You beat nym-ace123" shared without a save proves
nothing, but anyone can check it against the two bests on the chain. The
paths come from the node, like every read today, so a dishonest RPC could
lie about them. That trust is already the same for every shot.

### 8. Later, not in V1

- **`Duel(hole, rival)` on-chain.** It needs no replay. Both rounds were
  already replayed when they were saved: the caller's finished round (its
  `done` round in the rounds tree) and the rival's best. The chain compares
  them and keeps wins, losses and streaks on a board of their own. Because
  the ghost is stored, a result can later point at the exact rounds that
  decided it.
- **"Ghost buster"**: beat a ranked player's ghost.
  - In V1 it is earned in the front end, like the gnomes (card.ts:160-171,
    front-only): a duel won against another address's best, in the same
    mode, with the winning round saved on-chain. The saved round makes the
    claim checkable, since the player's public best is lower than the
    rival's.
  - The rival's best must be **at par or under**. Without that floor, the
    cheapest way to earn it is to race the worst row on any board, or a
    second account's 9 on a par 3.
  - Once `Duel` exists, the chain holds it.
  - Whether it is a stamp on the card or a gnome is an open question.
- **The clip with both balls.** The clip plays the holing stroke only
  (engine.ts:1084; engine/clip.ts:35), framed on one ball (`lively()`,
  clip.ts:109-117). Showing the rival too means:
  - a second `makeReplay` and ball in the clip;
  - the rival's stroke with the same number next to the player's;
  - a window as long as the longer of the two (`clipWindow`,
    lib/clip.ts:27-41);
  - framing on two points.

  In V1 the clip hides the ghost. The share image is a snapshot of the live
  scene (engine.ts:1325-1337), so it shows the ghost where it stands, which
  is the point.

## UX, screen by screen

The site's rules hold throughout:

- one solid button per screen;
- ink, paper and one red touch (the solid action);
- display-only things are flat, with no button chrome;
- no focus ring unless the keyboard asked for one (`:focus-visible`), and
  nothing is autofocused;
- plain, short copy in the game's voice.

In the strings below, `{rival}` is the gno.land name, or the short address
(`shortAddr`, common.ts:14) for a player without a name. On a phone it is
cut to 12 characters with "…".

### Entries

**The link landing (`?by=`).** A dare link arms a duel by itself, which saves
a step. It lands on the title screen first (Golf.tsx:275), and today that
screen says nothing about the dare: the friend taps Start blind.

- **Title screen.** One flat line above Start, in the tag's place:
  `⚔ {rival} holed {hole} in {n}. Race their ghost.` (no record:
  `⚔ {rival} dares you on {hole}.`). The Start button and its copy do not
  change. The facts under it stay; the third one already says
  `Free to play`, which is what a friend with no wallet needs to read.
- **Picker.** The dare line (Golf.tsx:1839) becomes a flat badge:
  - `⚔ Racing {rival} · {n} to beat` with an `×` (aria-label
    `Stop racing {rival}`);
  - under it, in small type, `Their round is on the chain, replayed, not
    typed in.` This is the one place the "can't fake it" message is said
    before play;
  - then `They played in {weather}.` The weather is `Weather(hole, period)`
    for the ghost's period, which any past period can read
    (weather.gno:42-47): "sun", "a breeze", "wind", "rain", "fog", "a
    storm", "snow";
  - the ghost's mode: `Their aim: Pro.` (or `Assisted`). If the player picks
    the other one: `You: Assisted. Them: Pro. Still a race, not a record.`;
  - an ace ghost: `{rival} aced it. Match it to tie.`;
  - your own best: `⚔ Racing your best · {n} to beat`;
  - while `Ghost` is being read: `⚔ Racing {rival} · reading their round…`;
    the gnome can already be chosen;
  - no record: `{rival} dares you on this hole.` (unchanged, no duel);
  - another version: `{rival} has no saved round on this version yet.`

The solid action stays `Choose this gnome`. The toast on opening the hole
(`setLinkNote`, Golf.tsx:679) becomes `{rival} holed it in {n}. Your turn.`

**The board ⚔.** On the Leaderboard sheet:

- each row of "This hole" (Leaderboard.tsx:428-437) gets a flat ink `⚔` icon
  button, aria-label `Race {rival}'s {n}`, visible text `Race` from 480 px up.
  It is not red: the red stays with the one solid action;
- the player's own row shows `Race your best`;
- the course tab has no ⚔, because a course has no single hole.

Tapping ⚔ closes the sheet, arms the duel on this hole in the board's mode,
and restarts the round from the tee. When the player has strokes on the
round, the sheet first asks, inline in the row:

- `Restart and race {rival}?`
- two plain buttons, `Race` and `Not now`.

**Friends.** In the Friends tab, each row of the hole list
(Leaderboard.tsx:152-161) gets the same ⚔. The friend-adding field stays as
it is (Leaderboard.tsx:180-183): it is how a name becomes a rival, and no
other name field is added.

- A friend whose best here is lower than yours shows a flat `beat you` after
  their score. The rows are already read and sorted; this is one comparison.
  With no server, it is the only way a sharer learns they were beaten other
  than a dare sent back (see "Launch and marketing").

### The HUD

- **The score card** (Golf.tsx:1093-1098) keeps its place:
  - the eyebrow says `Race` instead of `Strokes`;
  - the line reads `You 2 · {rival} 3`, with a ✓ after the rival's number
    once their ball is in;
  - in portrait on a phone, the two counts stack: `You 2`, then `{rival} 3`;
  - `par 3` stays under it.
- **The rival's number** is the strokes replayed so far, not their total.
  That keeps the tension: it goes up in step with the player's.
- **The duel badge** sits under the score card: a flat chip
  `⚔ {rival} · {n} to beat` with its `×`. The HUD line counts up; the badge
  keeps the target in sight.
  - Tapping `×` drops the duel at once. The ghost fades out over 300 ms, the
    round goes on, and the toast says `Solo now. Your strokes still count.`
  - There is no confirmation, because nothing is lost.
  - Once the duel is lost (the player passes R), the badge reads
    `⚔ {rival} won · Rematch`, `Rematch` a text link that restarts from the
    tee. A lost duel then costs one tap to retry, not a trip to the end card.
- **While the player aims,** the ghost's ball stays where it rests, with its
  ink ring: where it sits is the "who is ahead" signal, and it needs no
  meter. The ghost gnome drops to about 0.2 opacity so it does not clutter
  the aim, and comes back to 0.45 for its turn. No distance-to-cup number:
  on a hole with walls, the straight line lies.
- **The Adena pill, the weather and the camera button do not change.** The
  weather badge keeps showing *today's* weather, because it is the player's.

### The moment after each stroke

1. The player's ball rolls and rests as today.
2. After 250 ms, a small flat tag shows over the ghost, `{rival} · stroke 2`,
   and the ghost's stroke replays at double speed, **capped at 2 s**: a
   longer stroke plays faster to fit. A ghost's turn is then never longer
   than the wait it replaces. A `Skip ›` chip takes the aim bar's place
   (Golf.tsx:1225), and a tap anywhere also skips.
   - A press that starts a pull-back skips the ghost **and** starts the aim,
     in the same gesture. The player who wants to shoot is never made to tap
     twice.
3. The rival's number in the HUD goes up with a small pop, or none under
   reduced motion. The polite live region says `{rival}, stroke 2: stopped.`
   or `{rival}, stroke 3: in the hole.`
4. The aim comes back. When the rival has no stroke with this number (they
   holed earlier), nothing replays and nothing waits.
5. The first time the player passes the rival's total without holing:
   `{rival} holed it in {n}. Finish for your score, or rematch.` This shows
   once, as a toast, and the badge turns to `Rematch` (see "The HUD").

### The end card

The hole-finished banner (Golf.tsx:1258-1345) keeps its structure. Only the
title, a line and the buttons change.

The eyebrow stays `In the hole! · {hole name}`. The title (`h2`, today's
`golfTerm`) becomes:

| Result | Title | Line under it |
|---|---|---|
| Win | `You beat {rival}!` | `{mine} strokes to their {theirs} · {golfTerm}` |
| Loss | `{rival} wins by {d}` | same line |
| Tie | `Tied with {rival}` | `{n} strokes each · {golfTerm}` |
| Your own best, beaten | `You beat your best!` | same line as a win |
| Your own best, not beaten | `Your best still stands, by {d}` | same line as a loss |
| An ace ghost, tied | `You matched {rival}'s ace!` | `1 stroke each · Ace` |

`d` is written out when it is one: `{rival} wins by one`. Losing by one is the
most common loss and the one most likely to bring a rematch.

More lines can appear under the result, each fine print, flat:

- when the weathers differ: `They had {weather}. You had {weather}.`;
- when the modes differ: `Your Assisted vs their Pro.`;
- when the rival has improved since the duel was armed:
  `{rival} has since holed it in {n}. Rematch races that.`;
- the rematch count, this session only: `Race 3 against {rival}.` It is
  kept in memory, not stored, and resets with the page.

Under the standings, in muted type, a flat line with no link:
`Duel records on-chain · soon`.

**Buttons, one solid at a time:**

- *While the round can be saved:*
  - `Save on-chain` is solid, as today. On a win or a tie, one line under
    it says why now: `Saved, your round becomes the ghost they race.`;
  - `Rematch` is secondary;
  - `Dare them back` is a text link.
- *Once saved, or when it cannot be saved:*
  - a win makes `Dare them back` solid, with `Rematch` secondary;
  - a loss or a tie makes `Rematch` solid, with `Dare them back` as a text
    link.
- `Play again` becomes `Rematch` in a duel. It resets the round and reads
  `Ghost` again. `Play solo` sits next to it as a text link.

### Sharing, rematch, dare back

**Dare them back** opens the existing `Share` with the link
`holeLink(s, gnome, me)`, which carries `by=` only once the round is saved
on-chain (Golf.tsx:1276). The texts:

| Result | Share text |
|---|---|
| Win | `⚔ Beat {rival} on {hole}, {mine} to {theirs}. My ghost is waiting. Free to play, no wallet needed. #gnoland @_gnoland` |
| Loss | `⚔ {rival} beat me by {d} on {hole}. Race my ghost while I rematch. #gnoland @_gnoland` |
| Tie | `⚔ {rival} and I both holed {hole} in {n}. Settle it. #gnoland @_gnoland` |

- The texts say `ghost` because that is what the friend will race. `Free to
  play, no wallet needed` goes on the win text, the one most sent to new
  people: a crypto-shy friend reads it before the link.
- Once saved, the text may add `Both rounds are on gno.land.` It is never
  added before a save: an unsaved result is the client's own arithmetic
  (section 7), and the copy must not claim more than the chain holds.
- **Not saved yet.** `Dare them back` is not disabled: a disabled control
  gives no reason and no way on. It stays a text link, and a tap shows in
  place `A dare races your saved round. Save it first.` The link must race a
  round the chain holds. Once the save lands, a win makes `Dare them back`
  the solid action, as above.
- **Cannot save at all** (a phone with no Adena, the weather over): the text
  link reads `Dare a friend` and shares the *rival's* link,
  `holeLink(s, gnome, rival)`, with
  `⚔ Can you beat {rival}'s {n} on {hole}? Free to play, no wallet needed.`
  The dare keeps travelling through a player who cannot sign. This is the
  loop's biggest leak (see "Launch and marketing"); it is recommended, not
  yet decided (open question 8).
- **Rematch** keeps the rival and the mode, reads `Ghost` again, and starts
  from the tee.
- **Ghost buster** (when it ships): a gnome, not a stamp (open question 5).
  It shows on the win card through the existing `Unlocked` block
  (Golf.tsx:1320), with its need: `Beat a friend's ghost at par or under.`

### Empty, error and slow states

| State | Where | Copy |
|---|---|---|
| Reading `Ghost` | picker badge | `⚔ Racing {rival} · reading their round…` |
| `Ghost` failed | picker badge | `Couldn't read {rival}'s round.` + `Try again` (text link); the `×` plays solo |
| No record in either mode | picker | `{rival} dares you on this hole.` (no duel) |
| No record on this version | picker | `{rival} has no saved round on this version yet.` |
| A ghost stroke is slow (> 1.5 s) | tag over the ghost | `{rival} · stroke 2 …` then a jump to its rest |
| A ghost stroke failed | tag, once | `Their stroke didn't load. The race still counts.` |
| Board row with no name | Friends tab | ⚔ still offered (`Ghost` reads anyone) |

### Accessibility

- Every ⚔ is a real `<button>` with an aria-label naming the rival and their
  strokes.
- The `×` is labelled `Stop racing {rival}`, and the `Skip ›` chip is
  reachable from the keyboard.
- The ghost's turn is said in the polite live region (see "The moment after
  each stroke"), so the duel can be followed without seeing the ghost.
- Colour is never the only signal. The ghost carries its name tag, and the
  HUD writes both numbers out.
- The ghost is at least 3:1 against the grass. This is paper-white with an
  ink outline, so it holds on the ice and snow holes too, and the outline
  carries it there.
- Reduced motion: no flight, the ghost at its rest with a still path, no pop
  in the HUD, and confetti follows `motion`, as the cup card's `Cheer` does (Golf.tsx:2021-2033).
- The end card's title is the dialog's label. Nothing is autofocused, and
  focus rings show for the keyboard only.

### Phone, portrait and landscape

- **Portrait.**
  - The two counts stack in the score card, and the duel badge wraps under
    it.
  - `Skip ›` sits at the bottom centre, in the thumb's reach, where the aim
    bar is.
  - On the end card, `Save on-chain` and `Rematch` go full width, one above
    the other, with `Dare them back` as a text link under them.
  - The ⚔ on a board row is icon-only at 44×44 px.
- **Landscape.**
  - The HUD keeps one line, `You 2 · {rival} 3`.
  - The badge sits beside the score card, not under it, because height is
    short.
  - `Skip ›` goes bottom right.
- **Both.** The camera widens to hold both balls only while the ghost moves,
  then settles back on the player's ball. On a small screen a wide shot the
  whole time would make the aim hard to read.

## Game design notes

**Turn by turn is the right rhythm.** Golf is already a turn game, and a
putt is short: the ghost's answer is a reveal, not a wait.

- Live, both balls at once, looks more like Mario Kart but reads worse: two
  balls in flight split the eye, the camera can follow only one, and on a
  timed hole the pieces can be drawn at one clock only.
- The player shoots first, then the ghost answers. The other way round
  would show the rival's line before the player aims, which on stroke 1
  hands out the route to an ace. Shooting first keeps each turn a question:
  "did they do better?"
- The cost is waiting. It is kept small by the 2 s cap, skip by tap, and
  skip by starting to aim. If skips run high (see "What to measure"), the
  next step is to replay the ghost's turn while the player's ball is still
  slowing, not to make it live.

**Tension, stroke by stroke.** The HUD counts up in step (`You 2 · nym 2`),
the badge keeps the target (`3 to beat`), and the ghost's ball stays on the
green while the player aims. Where the two balls lie is the "who is ahead"
signal. No distance meter: on a hole with walls, the straight line to the cup
lies.

**Fairness is said, not fixed.** A record keeps its weather, as a track
record keeps its wind. The copy says it three times, each time small: the
picker (`They played in wind.`), the ghost's cause words (its own weather),
and the end card, only when the weathers differ. A loss in a storm against a
calm ghost is a reason to rematch in five minutes, which is good for the
loop. Mode is different: it changes what the player can see, so a mixed race
is marked on the card and earns nothing.

**Frustration cases.**

| Case | What happens | Why |
|---|---|---|
| Ace ghost | Said on the picker: `Match it to tie.` A tie gets its own title. | A loss the player was warned about is a challenge, not a trap. |
| Rival far worse | A plain win. No Ghost buster unless their best is at par or under. | An easy win is fine; an easy reward is not. |
| Racing yourself | `Racing your best`, `You beat your best!` | This is the Mario Kart time trial. It is also the ⚔ a new player can use with no friends. |
| Tie | `Tied with {rival}`, Rematch solid. | Ties are common on par 2 and 3. They should push to a rematch, not end flat. |
| Lost mid-round | Badge turns to `Rematch`. | Nobody should play out 20 strokes of a lost duel to get a retry. |

**Rematch loops.** Rematch is one tap, keeps the rival and the mode, and
reads `Ghost` again. The session count (`Race 3 against {rival}`) gives the
loop a shape without storing anything. A stored head-to-head
(`You 2 – 1 {rival}`) and streaks wait for `Duel`, where the chain can
vouch for them; a local one would be easy to inflate and would disagree
across devices.

**Rewards.** The gnomes are the game's one reward currency: they are on the
picker, in the share link (`&gnome=`), and seen by friends. A stamp would be
a second system seen by no one. So Ghost buster is a gnome (a gnome with a
lantern, never a see-through one: it must not look like the ghost it races).
Its bar: another address's best, same mode, at par or under, the win saved.

**What makes a player send the dare back.**

- A win against a named person. The text names them, and the link races the
  winner's own saved round: it is a direct, personal "your move".
- A save that says what it is for: `Saved, your round becomes the ghost they
  race.` The wallet then serves the brag, not the other way round.
- A tie: `Settle it.` is the strongest single ask in the set.
- A loss rarely sends a dare back to the winner, who would race a worse
  ghost. The loser's moves are Rematch, and passing the rival's dare on
  (`Dare a friend`, open question 8).

**The best three changes for fun,** in order:

1. Skip by aiming, and the 2 s cap. Waiting is the one thing that can make
   a duel feel worse than solo play.
2. `{n} to beat` on the badge, and the ghost's ball left on the green while
   aiming. The target and the rival's lie are the whole tension.
3. `Rematch` on the badge the moment the duel is lost, and a solid Rematch on
   a tie or loss.

## Launch and marketing

**The loop, end to end, and where it leaks.**

| Step | Leak | Plug |
|---|---|---|
| 1. Save | A player with no reason to save doesn't. | On a duel win: `Saved, your round becomes the ghost they race.` |
| 2. Share the dare | Text only; the link card is the hole's, static. | The number and `Free to play, no wallet needed` are in the text, which the card cannot carry without a server. |
| 3. Friend lands | Title screen is silent about the dare. | The title's dare line. |
| 4. Friend races | A Pro ghost puts a first-timer in Pro. | The aim stays free; mixed races are marked. |
| 5. Friend wins | No wallet: cannot save, so cannot dare back. **The biggest leak.** | `Dare a friend`: the rival's link passes on. The friend's first save stays one tap away. |
| 6. Dare comes back | The sharer never learns they were beaten unless the friend sends it. | Partly. `beat you` on the Friends tab, but only for friends the sharer already added: opening a dare adds the sharer to the friend's list, not the other way round. With no server, the dare sent back is the notification, so it is the win card's solid action once saved. |

**The "can't fake the rival" message.** One line, said where it is true and
nowhere else:

- picker: `Their round is on the chain, replayed, not typed in.`;
- Rules sheet (About.tsx:73, "On the boards"), a new row:
  `Duels` — `Race any player's best as a see-through ghost, stroke for
  stroke. Their round is on the chain, so it can't be faked. It keeps the
  weather it was played in.`;
- share text, once saved: `Both rounds are on gno.land.`

It is never said about the *result* before `Duel` exists: V1's win is the
client's arithmetic (section 7).

**Title facts and About.** At launch, the title's second fact (`Pull back and
let go`) becomes `⚔ Race a friend's ghost · it can't be faked`, with the
aim icon kept. About's facts list (About.tsx:36) gains `Duels against any
player's ghost`. The about steps do not change: a duel is not a fourth step.

**First visit from a dare, with no wallet.** Nothing on the way asks for a
wallet: title, picker, race and end card are all reads. The first mention of
Adena is the Save button on the end card, with the reason next to it. A
player who never saves still gets the full duel and can pass the dare on.

**The link card and the clip.**

- The link card stays the hole's own (ADR-003). A card per dare needs a
  server and is not worth one.
- In V1 the clip hides the ghost; the share image shows it where it stands.
  The clip with both balls (stage 3) is the best launch asset there is: two
  balls, one cup, one of them see-through. For the launch post, record it by
  hand from a local chain rather than wait for stage 3.

**Launch plan, no code.**

- Seed a ghost on every course hole: the team saves a round at par or under
  on all 72, named. Every board then has a ⚔ from day one.
- `Beat the maker`: post one dare link a week from the team's address, on a
  hole where the team's ghost is good but beatable.
- Post the realm's gnoweb page of a best next to its replay. It shows,
  without a claim, that the shots are public.

**What to measure.** No analytics by default, and none is added by this ADR.
If one is chosen later, it counts events, not people: no cookie, no address,
no IP kept. The events worth counting:

| Event | Tells us |
|---|---|
| `dare_open` (title seen with `?by=`) | reach of the links |
| `duel_start` (source: link, board, friends, self) | which entry works |
| `duel_first_stroke` | the landing's drop-off |
| `ghost_skip` (per turn, skipped or not) | whether the pacing is right |
| `duel_drop` (the `×`) | whether the ghost annoys |
| `duel_end` (win, loss, tie; d as 0, 1, 2+) | balance |
| `duel_save` | the wallet conversion a duel brings |
| `dare_back`, `dare_forward` | the loop's k-factor |
| `rematch` | stickiness |

One is free and public today: the save's transaction memo, `"gnogolf"`
(adena.ts:351, 372). A duel's save can carry `"gnogolf duel"`. Anyone can
count duel saves from the chain, and it says nothing a save does not already
say.

## What is to build

Nothing is built yet.

**The realm** (gno.land/r/gnogolf/golf):

- in `stroke`: the best becomes a string with its period and shots;
- `bestStrokes` at the nine read sites;
- the `Ghost` read;
- docs/golf.md: `Ghost`, and the deposit numbers.

**The client** (web/):

- `chain.ts`: `ghost(hole, mode, player)` and its shape check.
- `lib/engine/rival.ts`:
  - the ghost's `Live`, gnome, fade, replay and reads;
  - the prefetch of the next stroke, skip, tick and weather.
- `engine.ts`:
  - the ghost's turn in `shoot`;
  - `busy`, `hide()`, dispose, warm-up;
  - a skip input path.
- `replay.ts`: a speed factor.
- `Golf.tsx`:
  - the duel's state, armed from `?by=` or from a board;
  - the picker badge, the HUD and the end card;
  - Rematch and Dare them back.
- `Title.tsx`: the dare line above Start; at launch, the duel fact.
- `About.tsx`: the `Duels` rule and fact.
- `adena.ts`: the memo `"gnogolf duel"` on a duel's save.
- `Leaderboard.tsx`: the ⚔ on the hole's rows and the Friends rows, and
  `beat you` on Friends.
- CSS for the badge, the tag and the chip.
- `adena.ts`: `depositBytes` (adena.ts:484-487) adds about 30 + 23 bytes a
  stroke on a first finish or an improving one.

## Complexity and plan

**Realm: small.**

- About 60 lines of code and 150 of tests. One day, one and a half with the
  goldens.
- New tests:
  - a best keeps its shots and period;
  - a worse round and an equal round leave it alone;
  - an improved best frees the old shots (storage goes down);
  - `Ghost` returns `null` for no best;
  - a ghost replayed stroke by stroke (`SimulateRoundIn`, then
    `SimulateFrom`) in a period several days old holes in exactly its
    strokes;
  - the same on an archived version and on a timed hole.
- Goldens re-pinned:
  - the storage of `z_storage_finish_filetest.gno` (27,766 today) and of
    every filetest that finishes a round;
  - the gas of the `z_worst_*` goldens if they finish (a few tens of
    thousands).
- Unchanged:
  - `zz_golden_test.gno` outputs, since no read's output changes;
  - parity (`parity_test.gno`), since the physics does not change;
  - `selfcheck.ts`, since no rule the client copies changes.

**Client: medium.**

- About 700 to 900 lines with the CSS and tests, 5 to 7 days.
- The risk is in the engine: the ghost's turn inside `shoot`, the shared
  scene clock on timed holes, skip input while the player's input is
  locked, and a correct dispose.
- Unit tests:
  - the result words (win, loss, tie, self, by `d`) as one pure function;
  - the HUD line and the name cut;
  - the rival's read sequence against a fake chain (stroke 0 through
    `replayRound`, later strokes from `rest`, a slow or failed answer);
  - `depositBytes`.
- Smoke: a duel on the local chain against a seeded best.

**Stages:**

0. **The realm change, before mainnet.** This is the only deadline. It
   ships even if no client uses it yet.
1. **The smallest shippable slice.** A duel from the dare link only:
   - the ghost gnome and ball, turn by turn, at double speed capped at 2 s,
     with skip, and a pull-back that skips and aims in one gesture;
   - the title screen's dare line, the picker badge with `×` and
     `{n} to beat`, the HUD line, the end card titles;
   - `Rematch` and `Dare them back` (the existing Share, new text), and
     `Dare a friend` when the round cannot be saved;
   - under reduced motion, the ghost appears at its rest: this is the skip
     path already built, so it costs nothing to have from day one.

   There are no board buttons in this stage. It proves the loop, and the
   dare link already exists.
2. **The ⚔ entries**: the hole board, Friends (with `beat you`), and "Race
   your best".
3. **Polish**: the still dotted path under reduced motion, the camera framing
   both balls, the Ghost buster gnome, and the clip with both balls.
4. **`Duel(hole, rival)` on-chain**, with its board and streaks, in a later
   realm.

**Prototype on today's realm.** `Round(hole, player)` returns a player's
latest saved round with its `shots`, `period` and `mode` (state.gno:101-117).
When that round is done and its strokes equal `BestOf`, it *is* their best,
so stage 1 can be built and played on the local chain before the realm
change lands. It is not a fallback for mainnet: a player's latest saved round
is often not their best.

## Consequences

**Good**

- The chain earns its keep in a way a server cannot copy cheaply. The rival
  is a public round that anyone can replay and nobody can edit.
- A duel costs nothing to play. Every replay is a read, and only the player's
  own save costs gas, the same as today.
- Every best becomes replayable forever. That is useful beyond duels:
  `botcheck.ts` checking records, a best's page on gnoweb, and a golf/v2
  carrying bests over with their proof.
- The dare link turns from a sentence into a game.

**Bad, and accepted**

- **Each best costs a little more to save.** About 18 bytes a shot plus 30.
  An improving save often frees bytes, because fewer strokes make a shorter
  string.
- **Weather is not fair between the two rounds.** It is said on screen, not
  equalised.
- **A best becomes a published solution.** Its exact shots are one read
  away. A script can replay the leader's ace in a period with the same
  weather, on a hole with no timed piece, and tie it. A copy only ties, and
  earns no Ghost buster, which needs a strict win. The latest round's shots
  are already public today (`Round`), so this widens an existing exposure
  rather than opening a new one.
- **V1's result is not on-chain.** A shared "I beat X" is checkable only
  through the two bests.
- **A duel is tied to one version.** A new version of a hole starts with no
  ghosts, as it starts with no board.
- **If wear ever becomes physical** (BACKLOG.md "wear becomes physical"), a
  stored best would no longer replay the same way. That already applies to
  the records themselves, and is one more reason why that change needs a new
  realm.
- **The bests tree holds strings.** A `drain` or a `Records` page parses one
  number per row: a few thousand gas, measured as noise next to the
  standings writes.

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| Keep bests as ints and rebuild ghosts from the `Holed` events through an indexer | The event has no period (owner.gno:250), so the weather is unknown. It also needs an indexer, which is a server. |
| Race the latest saved round (`Round`) instead of the best | Often not the best. It changes whenever the rival plays. Fine as a prototype on today's realm, not as the product. |
| A separate `ghosts` tree next to the bests | Measured at +537 B a best against +50 B for a string in place, ten times the deposit, for the same data. |
| A `*best` struct in the bests tree | Measured at +860 B a best. A pointer is an object of its own. |
| A compact binary encoding of the shots (about 9 bytes a shot) | It halves a small cost and adds an encoder, a decoder, and a format that `SimulateFrom`, gnoweb and the event do not speak. The text is the format every read already takes. |
| A read that returns every stroke's path (`GhostPaths`) | A 60-stroke round is far past one read's work budget, and one read per turn is what the turn-by-turn play needs anyway. |
| Replaying the ghost in today's weather | It would not be the rival's round: a different path, maybe a different score. The ghost must be the record. |
| Both balls live at once (real-time race) | The two replays share the scene's clock on timed holes and fight for the camera. Turn by turn is also clearer. |
| A duel mode screen, or a name field to pick a rival | A duel is about one hole, so the hole is known. Friends already adds people by name. |
| Recording the duel's result on-chain in V1 | It needs a record, a board and anti-farming rules (a player racing their own second account). Deferred to `Duel`, which the stored ghosts make cheap. |

## Open questions

1. **Mode.** Does a duel force the ghost's mode, as proposed (the aim
   switches to it, and the picker says so), or may a player race a pro
   ghost with assisted aim, the result marked as such?
   - **(recommended)** Set the aim to the ghost's mode by default, leave the
     toggle free, and mark a mixed race: `Your Assisted vs their Pro.`, no
     Ghost buster. Locking drops a newcomer from a dare link into Pro on
     their first hole. Freeing it is also less code than locking it.
2. **Another version.** When a dare link's slot now opens a newer version
   than the sharer's best, do we offer to race on the archived version? It
   is still playable, but out of the cup and the ranking. Or do we just say
   "no saved round on this version"?
   - **(recommended)** Just say it, and keep the plain dare line. A link is
     made right after a save, on the current version, so this happens only
     when a version is published between the share and the click. Racing an
     archived hole adds a state ("out of the cup") to explain on a first
     visit, for a rare case.
3. **The rest of the rival's round.** After the player wins by holing first,
   offer `Watch their round` (the rival's remaining strokes, skippable), or
   end there?
   - **(recommended)** End there. The winner does not need it, and the win
     card is the moment to save and dare back; a second screen before it
     costs that moment. On a tie, the ghost's last stroke still plays (see
     section 6).
4. **The dare link lands armed.** Proposed: yes, with `×` to drop it. Or does
   the landing ask first?
   - **(recommended)** Armed. Asking adds a step to the path that matters
     most, and the `×` makes it free to leave.
5. **Ghost buster.** A stamp on the card, or an unlockable gnome? And does
   V1 grant it front-only, or wait for `Duel`?
   - **(recommended)** A gnome, front-only in V1, like the others. Its bar:
     another address's best, same mode, at par or under, the win saved
     on-chain. Gnomes are the one reward players already chase and already
     show (the picker, `&gnome=` in links). It moves to the chain with
     `Duel`.
6. **`Ghost` signature.** `Ghost(hole, mode, player)`, to match `BestOf` and
   `HoleRank`, rather than `(hole, player, mode)`. Is that fine?
   - **(recommended)** Yes. The realm's own order wins over a sketch.
7. **Carrying ghosts over.** Should `Records` (the paged read a golf/v2
   carries bests over with, state.gno:876-882) also return each best's
   period and shots? That lets a successor keep the ghosts, but makes a page
   up to about 140 KB. The alternative is one `Ghost` read per player.
   - **(recommended)** Leave `Records` as it is. It already hands a
     successor every address, a page at a time, and `Ghost` then gives each
     best's shots. Rank reads stay small, and nothing is lost: the data is
     on-chain either way.
8. **A duel that cannot be saved.** A player with no wallet who wins has no
   saved round, so `Dare them back` has nothing to race. Do we offer
   `Dare a friend`, which passes on the *rival's* link?
   - **(recommended)** Yes. It is the one way the loop keeps going through a
     player who cannot sign, which is most first visits from a link. It
     shares a round the chain holds (the rival's), so it claims nothing the
     chain does not vouch for. The same link fits a loss.
9. **The weather's fairness.** Do we say it more loudly, or equalise it?
   - **(recommended)** Neither. Said small, three times (picker, the ghost's
     cause words, the end card when it differs). A record keeps its weather,
     and a bad-weather loss is a reason to rematch after the next change.
