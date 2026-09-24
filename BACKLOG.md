# Backlog

## Where this stands

Working, on a local gnodev: two `/p/` packages, the `golf` realm, **18 holes**,
and the 3D client in `web/` (Next static export). 16 tests pass. Everything below marked *measured* came from a real
deploy, not from reading.

To pick it up again:

```sh
# the chain + gnoweb  (the installed gno/gnodev binaries are stale — build them)
cd ~/Server/gnoland/gno/contribs/gnodev && go build -o /usr/local/bin/gnodev .
cd ~/Server/gnoland/gnogolf && gnodev local -node-rpc-listener 127.0.0.1:26757
#   gnoweb lands on :8888, the 18 holes deploy from disk automatically

# register the holes once (one MsgRun does all of them; see git history)
#   or call Register on each hole realm

# the site
cd web && npm run dev        # or: npm run build → out/, static, host anywhere
```

Next, in order: the visual client is done, so what is missing is **the board** —
records, other people's courses ranked by what makes them worth replaying. That
is the real paid feature, and it is half built. Then wear-as-physics, which is
v2 and already collecting its data.

One dependency has never been exercised: a real `create_session` from a web page
with Adena. The whole no-popup, we-pay-the-gas story rests on it.

Everything parked while Milestone 0 (the mechanic, played in gnoweb) gets built.
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
| a shot **previewed** (`golf.Simulate`, read-only `vm/qeval`) | **44 ms**, 0 gas, no wallet, no account |
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

**`Simulate` does two jobs at once, and that is the point.** It is the animation
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

**"The round exists" is worth nothing without somewhere it is seen.** The real
paid feature is the board — records, other people's courses ranked by what makes
them worth replaying. It is half built. After the 3D client, build that, not a
third mode.

## The course maker — compatible, with three things to fix first

The geometry side is already right: a hole built by a GUI is a
`course.Simple` literal — tee, pin, a `physics.Field`, two tuning numbers. The
pipeline is proven, not theoretical: fourteen of the eighteen holes were emitted
from a data table into `.gno` source and deployed. A builder replaces the table
with a canvas and changes nothing else.

Three things did **not** survive contact with user-made courses:

1. **The id scheme — done.** A hole's id is now the pkgpath of the realm that
   registered it (`gno.land/r/alice/marsh`), so it is unique by construction
   and cannot be squatted; `Register(cur, h)` takes no id. Rounds live in a
   tree per hole, so `r/alice/marsh/2` cannot leak rounds into `r/alice/marsh`
   (tested).
2. **The hole number is not a property of a hole.** The client reads digits out
   of `hole7` to label the chip and the signpost, which works only because we
   named them. `alice/marsh` has no number, and should not need one.
3. **There is no such thing as a course.** Today the registry is a flat list of
   holes; "18" is just how many exist. A round of eighteen is an ordered
   selection *of* holes, curated by somebody — a second concept, and the one
   that makes a builder world navigable. It is also where a leaderboard would
   finally make sense: not per hole, per course.

A fixed 32×16 board stays a deliberate constraint: it keeps holes comparable and
the text renderer honest. Say so in the builder rather than letting people ask.

## Publishing a course — unblocked

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

- **The contract is renderer-agnostic.** `State()` and `Simulate()` are HTTP and
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
  whole path, `golf.State(hole)` hands it out as JSON. A client that
  re-simulated the physics in JS would have to match float64 GnoVM semantics
  exactly, and the ball would occasionally land somewhere on screen that the
  chain disagrees with. Nothing re-simulates.
- **`golf.State(hole)` over `vm/qeval` is the API the 3D site consumes**:
  geometry, `Skin` names, wear grid, every round in flight with its last path.
  The realm's markdown view is a second client, not the interface.
- **`Skin` is the seam.** It means nothing to the simulation; the renderer owns
  the lookup from `"turning blade"` to a mesh. Adding a themed prop never
  touches physics.
- Two points far apart in a path mean a tunnel. Do not interpolate across them.

## v2 — wear becomes physical

**Decided: v2, not now.** A worn cell becomes a rut — the ball rolls a little
further along it and is pulled toward the deeper neighbour — so that grinding
carves the course for everyone instead of winning anything, and the optimum
moves while staying readable.

Deferring costs nothing, which is why it is a good deferral: **the counters are
already accumulating**. Every committed shot marks its cell today, the grid is
in `State()`, a renderer can already draw it. v2 only has to make `Field.Step`
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
cosmetic, v1 has exactly **one** hole where this is live: `hole4`, whose blade
advances a notch per shot. Options there, cheapest first: commit per shot on
that hole rather than per round; or have the client re-simulate just before
committing — 44 ms — and warn if the result moved. Do not build pinning
machinery for it. In v2 the problem becomes general and that is when it earns a
real answer.

## Next milestones

- **Done:** three more holes, each with a mechanic the others do not have
  (bumpers, tunnel/sand/slope/water, a blade that turns one notch per shot).
  That is ADR-001 Milestone 1: the course interface held, and `golf` was not
  touched for any of them.
- The visual client (ADR-001 Milestone 3). The obstacle types already carry a
  `Skin` string that means nothing to the simulation and everything to a
  renderer — that is the seam a themed dapp plugs into.
- A second game on `p/gnogolf/physics` — the only honest test that the types are
  general (Milestone 2).

## Tests

- `p/gnogolf/physics` — 8 tests: tunnelling, a short wall that is not an
  infinite line, posts, tunnel, hazard, uphill, reflection, and the collinear
  bar that a bare segment cannot catch.
- `r/gnogolf/golf` — 8 tests, including the two invariants that matter:
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
