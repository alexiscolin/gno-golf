# Backlog

## Where this stands

*2026-09-29, the day before the onyx deploy.*

The V1 is built, and it runs end to end on a local chain built with the onyx
toolchain.
- **On the chain:** the `physics` and `course` packages and the `golf` realm,
  the only three deployed. The whole course goes on chain as data: four cups
  of 18 holes (`data/holes.txt`). golf already names a fifth
  world, the Crystal Mines, whose holes come after the launch.
- **In the repo only:** the authoring code (`p/gnogolf/physics/build`,
  `p/gnogolf/course/author`) and the 72 hole realms are the source, and are
  not deployed. What goes on chain is the repo byte for byte:
  `scripts/stage.sh` stages it and checks it, on every `scripts/check.sh` run.
- **In `web/`,** the 3D client:
  - the boards: every hole and the whole course, paged on-chain, your place,
    your gno.land name. The course ranks by most holes, then the best score
    against par;
  - badges, and a Support tip;
  - ghost duels: the champion, a player at your level, yourself, a friend's
    link, or anyone on the board ("Race here" on the hole you're on, "Their
    holes" to pick one), with a callout before each turn;
  - share clips;
  - saving, the name, Claim and the tip with Adena or a gnokey paste;
  - anonymous analytics with a one-click opt-out;
  - the Crystal Mines card, as coming soon.

**The deploy target is onyx** (`onyx-1`, mainnet's code v1.5.0), tomorrow, as
the key `GnoAlex` under `nym-alexiscolin000`, the game at its sub-path
`gnogolf` (`r/nym-alexiscolin000/gnogolf/golf`). The runbook is
`docs/design/deploy-v1.md`, "Onyx deploy, step by step": about 85 GNOT in all,
and the key holds 100.

**Done since the last update:**

1. The onyx compatibility fixes:
   - the onyx toolchain everywhere (`80635bf`);
   - no `MsgRun`: `publishdata.sh` sends one `Publish` call a hole, and the
     gnokey save pastes plain calls (`33d39a2`, `67b7135`);
   - `namereg/v0` (`337f349`);
   - every dependency is live on onyx (checked 09-29).
   - Onyx parks each addpkg until the gpao oracle approves it: the runbook
     polls `vm/qpkgmeta_json` between packages.
2. The realm batch:
   - a hole's worst-case weather cost is bounded at publish (`32faa21`);
   - a hole page draws its forecast once (`a165a8b`);
   - finished rounds are no longer stored, so "Reset first" is gone. A first
     course finish is now about 0.29 GNOT and each further hole about 0.10
     (`1a47321`).
3. The course ranking counts holes, then the score against par, so the Crystal
   Mines' pars weigh the same as any other cup's (`d0272d6`, `da76f54`).
4. PostHog analytics (EU, no banner) and its opt-out, which also takes the
   cookies away (`427aca0`, `a29162e`).
5. The gnokey paths:
   - the save wherever a round waits, confirmed on the chain by the key's
     address (`8b54f0e`);
   - its weather checked first (`0e13d52`);
   - the name, Claim and the tip (`5634e7a`).
6. On mainnet, no Support chip while ugnot is transfer-locked (`bae4a21`).
7. The cups screen has its own address (`?screen=cups`), and so does a cup's
   picker. The Crystal Mines card shows as coming soon.
8. Trailer v11 and its teaser (`52ab3cb`).
9. The docs brought up to date: this file, the README, `CLIENT.md`,
   `docs/golf.md`, `docs/leaderboards.md`, `docs/analytics.md`, the pitch, and
   the onyx runbook.

**Still to do:**

1. The final full review of the final code (bugs, security, scalability,
   playability). It is running now, and its fixes land before the deploy.
2. The OG images re-rendered (Mushroom Town): being re-rendered on 09-29.
3. **The deploy on onyx, tomorrow:** the runbook's steps 0 to 7, then a real
   save from the site.

**Right after the launch:**

- **The Crystal Mines** are being built on the branch `mines` (ADR-005). The
  client ships first, then the owner publishes the 18 holes.
- **V1.1: auto-save through a chain session.** See "Next milestones".

This file is the longer view: what we measured along the way, and what comes
after V1.

To pick it up again, follow "Running it locally" in the README: build gnodev
and gnokey from the gno checkout, run `gnodev local -empty-blocks`, publish
the course with `scripts/publishdata.sh`, then `npm run dev` in `web/`.
`scripts/check.sh` runs everything that must pass (`--smoke` adds the
end-to-end run against a local chain).

After launch comes the Builder (see Next milestones): the realm side is ready,
the in-game editor and its GG1 encoder are not (see ADR-002).

## The hole of the day — an idea, not for V1 (the whole course stays open from day one)

One hole a day, the same for everyone, with a board that starts empty every
morning: a reason to come back, and something to post ("#3 today on Down the
Tunnel"). It runs on its own: no owner, no cron, no server.

**How it would work**

- **The day comes from the chain's clock**, like the weather: `Day()` is the
  block time divided by 86,400 (UTC days). Nobody has to start it or end it.
- **The chain picks the hole.** `HoleOfTheDay()` maps the day to one of the
  course's current slots with a hash of the day (so the order doesn't simply
  walk the course), and returns its version id. Anyone can compute tomorrow's:
  it's public, like everything here.
- **A finish counts twice.** When a named player finishes today's hole (any
  `PlayRound*` in the day's weather), golf also seats their best of the day on
  a daily board keyed by day, mode, strokes and player. A new day is a new key,
  so the board "resets" by itself; old days stay readable as history.
- **Reads, paged like the others**: `DailyBoard(day, mode, offset, limit)` and
  `DailyRank(day, mode, player)`.
- **The client** shows the hole of the day on the cups screen with a countdown
  to the next one, opens straight on it, and shares "#N today".

**Costs and limits**

- About one extra row (a few hundred bytes) per player and day, paid by the
  player's own deposit like the rest; reads are O(page).
- **It has to live in golf.** A separate realm can't see golf's finishes (there
  are no hooks), so this is a golf change: either in the V1 we deploy on onyx,
  or later in a golf v2 through `SetSuccessor`. Putting it in V1 avoids a
  migration.
- **Bots know the hole in advance**, since the pick and the physics are public:
  fine for a board played for fun, not enough for prizes (those would need a
  hole revealed at the start of the day by something no one can predict, and a
  tournament design of their own).

One dependency has never been exercised: a real `create_session` from a web page
with Adena. The whole no-popup, we-pay-the-gas story rests on it; V1 does
without it (a player signs with Adena or gnokey).

What follows was parked while Milestone 0 (the mechanic, played in gnoweb) was built.
Findings marked *measured* come from a POC deployed on a local gnodev, not from
reading.

## Onboarding — settled

- **Sponsorship already exists; it is called a session subaccount.** There is no
  feegrant in tm2 and none is needed: `tm2/adr/adr-002` is explicit — *"Phase 2:
  Deduct gas fees. Always from master."* A session key signs, the master's
  balance pays, `SpendLimit` caps the damage per session, and `SpendLimit` must
  include ugnot or the session cannot pay gas at all (fail-closed). So whoever
  signs `create_session` is who pays:
  - the player's own Adena → the player pays, one popup per round, no custody
    for us;
  - our own account → the player never holds GNOT and never sees a popup, at
    the cost of being the funding target for spam. Rate-limit per web2 account.
- **A shot costs a transaction only when it is committed.** See the play model
  below — most shots never become transactions at all.
- **Session subaccounts.** Merged and usable (`gno.land/adr/adr-001`, Accepted;
  `gno.land/pkg/gnoland/allow_paths.go`). Scope for a game session is
  `vm/exec:gno.land/r/<ns>/golf`. Two consequences to design around: matching is
  by path prefix, so a session scoped to golf cannot call a hole realm directly
  — every shot must route through golf; and `vm/add_package` is always denied to
  sessions, so a course author deploys with their master key.
- **Cost of a round.** ~0.028 GNOT per shot at the price floor (1 ugnot/1000
  gas), so ~1 GNOT for a 9-hole round at 4 shots a hole. Sizes the faucet.

## Engine economics — measured, decide before physics grows

- **An importer pays for code it never calls.** Same trivial function:
  1,667,915 gas with no import, 2,105,852 gas importing a 1,591-byte package
  that is never invoked. ~275 gas per byte of imported source, **on every
  call**, proportional to size rather than a flat fee. ADR-001 open question 5
  is answered: yes. The single-package decision still holds (merging is
  reversible), but "small" is now a budget line, not a posture. `physics` has
  since grown from 1,591 to 8,236 bytes (vec2 + shapes + field + step), which at
  that rate is roughly 2.2M gas added to **every** call of **every** importer.
  Re-measure it directly before the package grows again; if the rate holds, the
  obstacle set is close to its budget.
- **Per-shot compute budget.** ~7.3M gas fixed per shot, plus ~860k gas per
  substep against 4 obstacles. Measured on the four holes as built: 15M (hole1,
  before it gained thickness), 23.5M (hole2, 3 posts), 21.9M (hole3, 4 zones),
  28.8M (hole4, 10 walls). Call it **0.02–0.03 GNOT a shot** at the price floor.
  ADR-001's "physics must stay closed-form" is correct and already tight: a hole
  pays for `substeps * (walls + posts + zones)` on every stroke, so the obstacle
  count is a budget, not a decoration.

## Design holes to settle in ADR-002

- **Course version pinning** (ADR-001 §8). In solo play the only shared state is
  the wear field. Failing a shot because someone else scuffed the green is a
  cheap grief on a popular hole — decide a tolerance instead of a strict pin.
- **A hostile hole.** Borrow rules do protect golf: a hole realm cannot write
  golf's state. But nothing stops it from panicking (kills the round), looping
  (burns the player's gas), or simply returning `holed = true`. The
  "first to complete" record is only as honest as the hole.
- **Wear decay.** Not implemented. Per-course knob, belongs in the interface.

## The play model — measured, and it decides the UX

Two numbers, both taken on the running node:

| | |
|---|---|
| a shot **previewed** (`golf.SimulateFrom`, read-only `vm/qeval`) | **44 ms**, 0 gas, no wallet, no account |
| a shot **committed** (`golf.Launch`, a transaction) | **~3.2 s** (pearl block time), ~0.025 GNOT |

So a shot does not have to be a transaction. The chain resolves it either way —
`Preview` is the same physics as `Play` minus the consequences, which is why the
preview and the committed result agree exactly (checked: both land the bumper
shot at x=4.3).

That gives three things at once, and none of them needed a new protocol feature:

- **Instant play.** The client asks the chain what the shot does, gets the path
  in 44 ms, and animates it. No 3-second wait between the swing and the ball.
- **A free level with no wallet at all.** A visitor plays the real course with
  the real physics; nothing is recorded. That is the demo level — it does not
  need to be disconnected from the chain, it needs to not write to it.
- **One payment per hole instead of per shot.** Built: `PlayRound(cur, hole,
  "angle,power;angle,power;…")` replays the shots authoritatively — the client
  sends decisions, never outcomes. The shot list travels as a string because
  `MsgCall` rejects slice arguments.
  It is also **much cheaper**, which was not the point but is welcome. The same
  five shots on the same hole, both ending `holed in 5 strokes`:

  | | gas | GNOT | waits | signatures |
  |---|---|---|---|---|
  | five `Launch` calls | 114.6M | 0.115 | 5 × 3.2 s | 5 |
  | one `PlayRound` | 49.9M | 0.050 | 3.2 s | 1 |

  **56% less gas**, because the ~7.3M fixed cost of a call is paid once instead
  of five times: 22.9M per shot alone against 10.0M inside a commit.

**The `Simulate*` reads do two jobs at once, and that is the point.** It is the animation
source for a paying player and it is the entire game for a visitor with no
wallet — same function, same physics, same 44 ms. One read-only entry point
removes the need for a demo build, a trial mode, a JS physics port and a
separate free tier. Anything that would be gated by rebuilding the game
elsewhere should be re-examined against this first.

Consequences to accept: a player can abandon a bad hole and never commit it, so
only kept rounds exist — fine without a score ladder, arguably a feature. And
the preview needs a reachable RPC node; do **not** add a JS physics fallback,
that is the divergence bug the client contract exists to prevent.

## Free and paid — settled

The line is **playing vs. recording**, not hole 1 vs. the rest.

Gating holes behind a wallet is unenforceable anyway: `vm/qeval` is a public
read, anyone can simulate any hole from a terminal. The client could of course
hide them, but it should not. The stated goal is a demo that makes developers
want to deploy a realm, and what produces that is seeing the variety — a
windmill, a tunnel, somebody else's hole from last month. Putting eight ninths
of that behind the highest-drop-off step in web3 defeats the demo, and the free
tier costs nothing to run (it is an RPC node, not a game server).

A transaction does not buy access. It buys **permanence**:

- the round exists — strokes recorded, readable by others;
- the player leaves wear, so the terrain is shaped only by those who committed.
  That is the only scarce thing in the game;
- a record can be claimed;
- a course can be published.

So the connect prompt belongs at the moment something is worth keeping — "you
finished in 34, connect to record it" — not at hole 2. Same request, incomparable
conversion. If a closed door is wanted for scarcity, close a **mode**, never
content: the async challenge, the daily hole, the course maker. Those are
meaningless without an identity, so the connection is justified there rather
than endured.

Modes worth having, and no more until the first has an audience:

| mode | cost | what it is |
|---|---|---|
| practice | free, no account | every hole, nothing recorded. Also the demo. |
| recorded round | one session, one commit per hole | the round enters the world and marks the course |
| async challenge | a commit | your round vs. another player's recorded round. No matchmaking, no simultaneity — the opponent is a permanent record nobody can forge or reset. The only social mode that needs a chain. |

A pot or a tournament waits until the course interface is frozen and audited: a
hostile hole can already lie about `holed`.

**"The round exists" is worth nothing without somewhere it is seen.** That was
the case for the boards, and they are now built: every hole and the course,
paged on-chain, in the game and on gnoweb. Ranking other people's courses by
what makes them worth replaying is the part still to come, with the Builder.

## The course maker — compatible, with three things to fix first

The geometry side is already right: a hole built by a GUI is a
`course.Simple` literal — tee, pin, a `physics.Field`, two tuning numbers. The
pipeline is proven, not theoretical: fourteen of the eighteen holes were emitted
from a data table into `.gno` source and deployed. A builder replaces the table
with a canvas and changes nothing else.

Three things did **not** survive contact with user-made courses:

1. **The id scheme — done.** Since ADR-002 a hole's id is a version: a
   course slot's (`garden/7/v2`, published by the owner) or a player's own
   (`<address>/<slug>/v1`, by `PublishMine`), so it is unique by construction
   and cannot be squatted. Each version has its own rounds, board and wear.
2. **The hole number is not a property of a hole — done.** A course hole sits
   in a slot (`garden/7`): its cup and its place are the slot's, and a
   community hole (`<address>/<slug>`) has none, and needs none. (The client
   used to read digits out of `hole7`.)
3. **There is no such thing as a course — done.** A cup is an ordered
   selection of 18 slots, curated by the owner, and the course's current holes
   are ranked together on their own board, beside each hole's. What a builder
   world still lacks is the same for community holes (the creators' board).

The board is no longer a fixed 32×16: `author.Fit` sizes each hole's to its
walls, within `course.MaxBoard`, and golf bounds the text renderer's work on
it (`maxBoardWork`). Say what the limits are in the builder rather than
letting people ask.

## Publishing a course — unblocked

Since ADR-002 a hole is data: a player publishes one with `PublishMine`, a
plain call, no `addpkg`, about half a GNOT of deposit a version, and golf
plays data only (`Register` is gone). The numbers and the two tiers below are
from the hole-as-realm days.

ADR-001 said to prove the interface with hand-written holes before designing an
editor. Four holes, four mechanics, zero lines changed in `golf`: proven.

- Publishing a course costs ~6M gas to deploy plus ~7M to register, about
  **0.013 GNOT**, and it is playable by everyone — free, in preview — within a
  block. That is ADR-001 pillar 1 end to end.
- **`vm/add_package` is denied to sessions** (verified). A course author signs
  the deploy with a real key, so an in-browser maker cannot publish silently on
  their behalf. Acceptable: authors are a smaller, more committed audience.
- **Two tiers of author.** A GUI produces geometry — walls, posts, zones. It
  will never produce hole4's blade, which is code. The interface serves both
  without distinguishing them; keep both doors open, that is what keeps "a
  course is a program" true after the editor ships.

## The visual reference, and what it implies for the client

Dumpling Delivery (Mailchimp) is **Unity + WebGL**, per its Awwwards credits —
alongside After Effects and Illustrator. Awwwards SOTD May 2022, 7.69 overall.
An agency production: ~20 holes prototyped, 9 shipped, plus iOS and Android
builds. The gap between it and this repo is art and production, not engineering.

Three consequences:

- **The contract is renderer-agnostic.** `HoleState()` and `SimulateFrom()` are HTTP and
  JSON. Unity WebGL consumes them exactly as a three.js page would, so the
  choice belongs to whoever does the art.
- **If it ends up in Unity, one rule is not negotiable: no Rigidbody.** The ball
  is a transform animated along the polyline the chain returned. Unity's physics
  is not the chain's, and letting it simulate would silently desync the ball
  from the state everyone else reads. Colliders for looks only, never for play.
- **Decided: three.js**, for two reasons that have nothing to do with rendering.
  A Unity WebGL build is tens of megabytes, which fights a demo whose job is
  "open the link, play in five seconds"; and Adena is a browser extension, so
  Unity would need a `.jslib` bridge where a web page needs nothing. The
  Rigidbody warning above still applies to any engine with its own physics —
  in three.js, do not reach for cannon-es or rapier either.
  The handoff for whoever builds it is `CLIENT.md`: the two reads with real
  payloads, the exact ABCI call and its double unwrap, the animation timing, and
  the four rules.

Do not try to out-art Mailchimp. Out-open them: their nine holes came from a
studio, ours come from anyone with a key, and that is the only axis where a
small team wins.

## The client contract — settled, do not drift from it

- **The chain computes the flight, the client replays it.** `Play` returns the
  whole path, `golf.Round` and the `Simulate*` reads hand it out as JSON. A client that
  re-simulated the physics in JS would have to match float64 GnoVM semantics
  exactly, and the ball would occasionally land somewhere on screen that the
  chain disagrees with. Nothing re-simulates.
- **`golf.HoleState(hole)` over `vm/qeval` is the API the 3D site consumes**:
  geometry, `Skin` names, wear grid; `Round` gives a round in flight with its last path.
  The realm's markdown view is a second client, not the interface.
- **`Skin` is the seam.** It means nothing to the simulation; the renderer owns
  the lookup from `"turning blade"` to a mesh. Adding a themed prop never
  touches physics.
- Two points far apart in a path mean a tunnel. Do not interpolate across them.

## Duels against a ghost: the next stages

Designed in [ADR-004](adr/adr-004-duels.md). Built: the realm side (a best
keeps its round, `Ghost`), the dare link's duel, Race on the boards and in
Friends (`Race your best` on one's own row), the game choice's Duel (the
rival: the champion, a player at your level, yourself, a friend's link or
anyone on the board; then their ghosts, then the picker), the turns with a
callout before each stroke, and the Ghost buster and Good sport badges.
Next: `beat you` in Friends, the clip with both balls, then `Duel(hole,
rival)` on-chain with its board and streaks (a V2 idea, see Next milestones).

## v2 — wear becomes physical

**Decided: v2, not now.** A worn cell becomes a rut — the ball rolls a little
further along it and is pulled toward the deeper neighbour — so that grinding
carves the course for everyone instead of winning anything, and the optimum
moves while staying readable.

Deferring costs nothing, which is why it is a good deferral: **the counters are
already accumulating**. Every committed shot marks its cell today, the grid is
in `HoleState()`, a renderer can already draw it. v2 only has to make `Field.Step`
read it. No migration, no data lost in the meantime — v1 players are already
writing v2's terrain.

It also keeps v1 simpler in a way worth naming: with a static course, what the
player previewed is what the commit replays. See the drift note below.

### Why not randomness, settled

Any on-chain seed is either known before you commit — the bot simulates and only
sends winning shots, the human cannot — or unknown, and then nobody can aim while
the bot's edge, which is volume, is exactly what randomness rewards. There is no
beacon in gno anyway: no `rand`, `entropy` or VRF package in the examples, only a
deterministic `math/rand`. Simultaneous play is ruled out separately: it needs
matchmaking, which kills the solo casual game the visual reference is.

### The drift, and where it actually bites in v1

Between previewing a shot and committing it, another player's commit can change
the course, and the replay then differs from what the player watched. With wear
cosmetic, v1 had exactly **one** hole where this was live: `hole4`, whose blade
advanced a notch per shot. It is gone: timed pieces now follow the round's own
strokes and release tick (`TestTimedHoleFollowsTheRoundsStrokes`), so a
preview is what the commit replays on every hole. Do not build pinning
machinery for it. In v2 the problem becomes general and that is when it earns a
real answer.

## Next milestones

- **Launch on onyx**, after the list in "Where this stands".
- **Marketing wave 1: the duels.** Race anyone's ghost, verified on-chain.
- **Wave 2: the Builder.** The contract side is ready: `PublishMine`, its
  checks, and the owner's switch (`SetPublishing`), closed at deploy. Still to
  build: the in-game editor and its GG1 encoder (ADR-002).
- **Auto-save with a chain session (V1.1, right after launch).** Onyx (v1.5.0)
  has sessions in tm2's auth (`MsgCreateSession`: `AllowPaths`, `SpendLimit`
  per `SpendPeriod`, `ExpiresAt`; `MsgRevokeSession`, `MsgRevokeAllSessions`;
  gno-onyx `tm2/pkg/sdk/auth/msgs.go`). The game makes a key in the browser,
  the player signs one session for it in Adena, allowed only calls to the golf
  realm, with a spend cap (e.g. 2 GNOT a day) and an expiry (24 h or 7 days),
  revocable; every save after is signed by that key, no Adena window: a whole
  cup saved as it is played. A switch in the game ("Auto-save my rounds").
  No realm change. To check first: Adena can sign `MsgCreateSession` (else
  gnokey once, or wait for it); the client signs txs itself (tm2 JS signing);
  the storage deposit counts against the spend cap; the key stays scoped to
  this origin (and what a leaked key could still do: only golf calls, capped).
- **A fifth cup, for experts** (a "Champion's Cup"): 18 long, hard holes for
  the players who finished the four at par, unlocked by them (a gnome of its
  own, a badge). Holes are data: they publish with `Publish` and need no
  redeploy; the work is the design (long lanes, chained hazards, timed pieces,
  worst weathers) and their solving (`scripts/hole-bests.json`, every hole
  finishable at par, see `docs/design/phase5-pars.md`). Two limits to design
  under: a stroke's cost stays under `maxShotGas`, and a published hole must
  leave its first stroke `minShotWork` in its worst weather (so the longest
  lanes cost the rain's forecast). The client needs its world: a new scene,
  or a night/volcano variant of an existing one to ship sooner. A good
  "what's next" after the launch, between the duels wave and the Builder.
  **Chosen: the Crystal Mines** (the gnomes' own mines), at the other cups'
  level of finish, with wow moments: glowing crystal galleries, mine carts on
  rails to time, rope bridges over the void, lava lakes and a lava fall, a
  collapsing gallery, a lift down a shaft, lanterns and gnome miners at work;
  a miner gnome (helmet, headlamp) and a badge for finishing it at par.
- **V2 ideas:** duel records on-chain (`Duel(hole, rival)` with its board and
  streaks, ADR-004), a creators' board (community holes ranked by what makes
  them worth replaying), the hole of the day (above).
- **A second game on `p/gnogolf/physics`**: the only honest test that the
  types are general (ADR-001 Milestone 2).

## Tests

- `p/gnogolf/physics` 16 tests, `physics/build` 52, `course` 10,
  `course/author` 4; each hole realm's fingerprint test (the hole survives
  encoding bit for bit). `scripts/check.sh` runs them all.
- `r/gnogolf/golf` — 98 tests and 8 filetests (gas and storage goldens),
  including the two invariants that matter:
  **Preview must equal Play** (or players animate something that did not
  happen), and **PlayRound must equal the same shots one by one** (or the
  replay is a shortcut rather than the record).
- Browser access to the node needs no proxy: the RPC answers
  `Access-Control-Allow-Origin: *` and handles the preflight. Verified.

Running them needs a package cache that matches the target chain, see below.

## Toolchain gotchas

- The installed `gno` / `gnodev` binaries are older than the `gnolang/gno`
  checkout and fail with `pubKeyAddress does not have a body`. Build from
  source: `go run ./gnovm/cmd/gno`, `go build .` in `contribs/gnodev`.
- `gno lint` resolves `p/nt/avl/v0` from the module cache, where `Tree.Get`
  returns `(any, bool)`; the chain loads the `examples/` copy, where it returns
  `any`. Lint passing is not proof the chain will accept it — trust the chain.
- Same cause breaks `gno test` on anything importing `p/nt`. Fix: point GNOHOME
  at a scratch cache holding the `examples/` copies of `avl`, `ufmt`, `uassert`,
  `urequire` and `onbloc/diff` — top-level `.gno` and `gnomod.toml` only, no
  `filetests/`, no `*_test.gno`, or the harness trips over duplicate filenames.
  The cached dep still reports its own `[setup failed]` line; the line that
  matters is `ok .` with `0 test errors`.
