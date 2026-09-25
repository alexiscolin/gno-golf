# ADR-001: On-chain mini-golf — engine, courses, and what the chain is for

## Status

Proposed

## Context

The goal is a playable mini-golf game on gno.land whose real purpose is to be a
**demo that makes other developers want to deploy a realm**. Visual reference:
`dumplingdelivery.mailchimp.com` — a 9-hole obstacle course, solo, colourful,
mobile-first.

A game like that does not need a blockchain. Single-player golf has no
counterparty, no trust problem, and nothing to prove to anyone; putting it
on-chain would pay the entire cost of consensus for nothing. Everything in this
ADR exists to answer one question: **what does the chain actually buy here?**

Three answers survived scrutiny, and the architecture below is built around
them:

1. A course is a **program**, not data — so contributors can invent mechanics
   the engine author never anticipated, without asking permission.
2. The physics is an **importable package** — so the next game (pool, pinball,
   marble run) is cheaper to build than this one was.
3. The course accumulates the **traces of everyone who played it** — a shared,
   permanent state no operator can reset, which is a mechanic a server cannot
   credibly copy.

If any of the three is dropped, the remaining design still needs re-justifying.

## Decision

### 1. Turn-based: one transaction per shot, animation is client-side

A shot is a single call `Launch(angle, power)`. The realm computes the
resulting ball position and the client animates the flight.

Real-time play is not available and will not be attempted. A state change costs
a block; real-time rendering needs 30–60 updates per second. The gap is three
orders of magnitude and no optimisation closes it.

This costs nothing in practice, because mini-golf is already shaped this way:
aiming is slow and deliberate, the flight is a spectacle. The player sees 60 fps
of aiming curve, ball trail, bounces and camera follow — all local, all free.
The chain sees one call.

**Consequence for game design, and it is not negotiable:** an on-chain game can
have *decision* skill but never *execution* skill. Timing, precision and dosage
all happen in a client that anyone can replace with a script that posts
`Launch(37.42, 0.813)` directly. Every design decision below follows from this.

### 2. Three layers; the physics package is the real deliverable

| Layer | Path | Role |
|---|---|---|
| Physics | `p/<ns>/physics` | Vectors, shapes, swept collision, a step helper. No game concepts. |
| Game | `r/<ns>/golf` | Players, rounds, shot routing, wear field. |
| Course | `r/<author>/hole_*` | One realm per hole, implementing the course interface. |

**One package, not several**, split internally by file — `vec2.gno`,
`shapes.gno`, `collide.gno`, `step.gno`.

Two reasons, and the second is decisive:

- In Go a type's identity is its package path. Packages here are permanent and
  versioned by path, so if `collide2d` v1 and v2 both define a `Vec2`, those are
  incompatible types and nothing interoperates. One package removes the failure
  mode by construction.
- **Merging is reversible; splitting is not.** Extracting files later and
  leaving type aliases (`type Vec2 = vec2.Vec2`) behind breaks no caller.
  Starting split and wanting to merge breaks every import. Starting merged is
  therefore the *less* committing choice.

The package exposes two levels: the raw geometric queries, and a `Step` helper
for callers who just want a ball moved. Golf uses the helper; a caller with
unusual needs skips it.

**Floats are safe.** `gnovm/stdlibs/math/native.go` binds only
`Float64bits`/`frombits` — exact bit reinterpretation. `sqrt`, `sin`, `atan2`
and the rest are pure Gno source ported from Go's stdlib (itself from FreeBSD
libm), so every validator runs the same interpreted code over IEEE-754
primitives. No fixed-point arithmetic is required.

#### Small is the reuse strategy, not a compromise on it

What decides whether a package gets reused on-chain is not its feature count:
it is being auditable in half an hour and cheap to call. A large engine is the
opposite — people fear the gas cost and the audit burden and write their own.
A focused package plus your own twenty lines *is* the general solution, and it
is more reusable than a ported Box2D would be: it audits in one sitting and
callers pay only for what they invoke.

The gno examples currently contain **no** vector, fixed-point, collision or
physics package. The first correct foundational package has outsized value —
which is an argument for its types being right, not for it being big.

#### What is worth getting right now, because it cannot be retrofitted

Adding features later is easy. Fixing wrong types is not, because everything
built on them is polluted. So the investment goes into the boundary:

- **No golf concepts in the package** — no hole, no stroke, no `spin` field
  smuggled into `Vec2` because the game needed it one evening.
- **Collision returns geometric facts** — time of impact, contact point, normal.
  Never "bounces" or "stops": that is the game's decision, not the library's.
- **Conventions documented** — what 1.0 means, which way Y points, what the
  units are. Undocumented, it is unusable by anyone else.
- **An explicit determinism contract** — float64 only, no map iteration, no
  clock, no randomness. This is what makes the package trustworthy to a third
  party, and it costs nothing to write down today.

#### Ported algorithms keep their notices

Swept-circle collision is copied from published work (Ericson, *Real-Time
Collision Detection*; Box2D's conservative-advancement `b2TimeOfImpact`). Matter.js,
Planck.js, Box2D, cannon-es are MIT; Rapier is Apache-2.0 — all portable, provided
the copyright header and licence text travel with the code. The precedent is in
this repo already: `gnovm/stdlibs/math/sqrt.gno` carries the Go Authors and
SunPro/FreeBSD notices.

**No engine is ported wholesale.** A rigid-body engine spends its budget on a
broad phase, a narrow phase and an iterative constraint solver — 8-10 iterations
per step, 60 steps per simulated second. Golf has one dynamic body and static
terrain, so the solver, the expensive part, buys nothing. Continuous
collision is also strictly *better* here: a fast ball tunnels through a thin
wall under discrete stepping, which is why Box2D reserves swept tests for its
own bullets.

#### Physics stays 2D even when rendering is 3D

Mini-golf on a flat course is 2D physics with a 3D camera. Height only matters
for ramps and jumps, and a 2.5D height field covers those without a 3D
rigid-body solver. This is roughly an order of magnitude of cost, and the player
cannot tell.

### 3. A course is a realm implementing an interface

Not a level file, not rows in an editor's schema. A hole is deployed code, which
is what makes a mechanic the engine never shipped — gravity wells, a wind
function, a teleporter, a surface that inverts bounces — possible without a
release on our side.

The interface is the load-bearing decision of this whole document and is
specified separately (ADR-002). Two failure modes bound it: too narrow and
creators cannot invent anything, which collapses pillar 1; too wide and we
cannot guarantee a hole is completable or bound its compute cost.

### 4. Wear field, not stored traces

Every shot marks the course. Balls do **not** persist individually — that is
unbounded state growth and an unplayable hole after ten thousand rounds.

Instead each hole carries a **fixed-size coarse grid** of wear values, updated
per shot. Bounded state, tiny write, and the client interpolates it into visible
grooves and scuffs. The visual richness is a rendering concern, not a storage
one.

Decay is **per-course, exposed in the interface**, not a global constant: one
author may want a hole that remembers everything, another one that resets daily.
The decay rate is the central tuning knob of the game and belongs to whoever
designed the hole.

### 5. Variability comes from accumulated play, not from randomness

No RNG in shot resolution.

> Randomness is uncertainty a player cannot act on. Accumulated wear is
> variability a player can read.

A player arriving at a worn hole can see where everyone went and choose to
exploit the groove or avoid it. That is decision skill — the only kind this
medium can protect. Randomness would convert the game into a lottery and make
records meaningless, which is strictly worse than the problem it was meant to
solve.

### 6. Competition is on course design, not on scores

Playing a hole is **casual and unranked**. Because the physics is deterministic
and public, the optimal shot for any static configuration is brute-forceable in
milliseconds. A score ladder would be fully solved within a week; this is a fact
about the medium, not a difficulty to be tuned.

So the competitive surface moves to where bots cannot follow: **designing
courses.** Plays, completion rate, repeat plays, ratings. A bot can solve a hole;
it cannot design one people want to play again.

This aligns three things that are usually in tension — the anti-cheat story, the
content pipeline and the "make devs deploy realms" goal all become the same
activity.

One verifiable record is kept per hole: **first to complete it**, timestamped.
It can only be won once, it creates a small event when a course ships, and being
solver-assisted does not damage anything.

### 7. Web2 users never see the chain

- **Session subaccounts** (`gno.land/adr/adr-001-session-subaccounts.md`) for
  the signing UX: one authorisation, then N shots with no further prompts.
  `AllowPaths` is scoped to `vm/exec:gno.land/r/<ns>/golf` rather than the `*`
  wildcard — a game session must not be able to move funds.
- **Account provisioning** from a web2 login (email / OAuth); the key is
  generated and custodied server-side at first, exportable later for players who
  want it.
- Funding is an **open question** (see below).

### 8. Each shot pins the course version it was played against

Another player's shot can land between a shot being submitted and resolved. The
course state identifier is carried in the shot so a player never resolves against
terrain that no longer exists. Cheap to implement, expensive to retrofit.

### 9. Deferred

- **Commit–reveal simultaneous shots** — only earns its place with synchronous
  multiplayer; in solo it protects nothing.
- **Ball-to-ball collision between live players** — same.
- **The course maker (GUI)** — the course interface must be proven by
  hand-written holes before any editor is designed on top of it. Writing the
  editor first would freeze an interface nobody has stress-tested.

## Consequences

**Good**

- Every contributed course is a deployed realm; the success metric (realms
  importing ours) is public and countable.
- The physics package outlives the game.
- The wear mechanic is genuinely hard to copy: a server could implement it, but
  the operator could silently reset it and players know that.
- Solo play is preserved, matching the visual reference, while the chain still
  earns its keep.

**Bad, and accepted**

- **Any individual hole remains solvable by a bot.** The wear field removes the
  point of botting (no stable optimum to converge on) but not the capability.
  We are not claiming otherwise anywhere in the product.
- **Scores are not comparable across time**, since two players face different
  terrain. Classic leaderboards are therefore not just deprioritised, they are
  incoherent here.
- **The relayer / funding path is centralised** and a spam vector; it needs rate
  limiting tied to the web2 account. Casual players get no censorship
  resistance, which is acceptable for a game but should be stated rather than
  glossed.
- **Physics must stay closed-form** — ballistic arcs plus plane reflections, a
  few dozen operations. No iterative simulation loop. Gno is an interpreter and
  the cost is charged per shot. The constraint is healthy: it forces geometric,
  legible level design.

## Alternatives considered and rejected

| Alternative | Why rejected |
|---|---|
| Real-time multiplayer on-chain | Three orders of magnitude off block time. If real-time were non-negotiable the correct decision would be to drop the chain entirely and build a web2 game. |
| RNG on shot resolution | Does not stop solvers — it converts them to expected-value solvers — while turning records into luck. |
| Score leaderboards | Structurally unprotectable; see decision 6. |
| Persisting individual ball traces | Unbounded state growth; hole becomes unplayable. |
| A level editor with fixed primitives | Constrains creators to mechanics we anticipated, which discards the main reason to be on-chain. |
| Storing courses as data in `r/golf` | Same objection, plus it makes us the gatekeeper for every new hole. |

## Open questions

1. **Who pays gas for a web2 player.** Session subaccounts solve re-signing, but
   spend limits draw on the master account's balance — so a player with no funds
   still needs either per-user faucet provisioning (`faucet-hub` is available) or
   a sponsored-transaction mechanism. No sponsorship/feegrant design was found in
   the gno docs during this review. **This is a hard prerequisite and must be
   settled before committing to the web2 onboarding story.**
2. **The course interface** — ADR-002, the real design work.
3. **Wear decay tuning** — needs play data; ship with a conservative default.
4. **Per-shot compute budget** — must be measured on a real hole early, since it
   bounds how expressive a course can be.
5. **Does an importer pay for code it never calls?** The single-package decision
   assumes gas is charged for operations executed, not for loading the imported
   package. If loading or storing an import carries a cost proportional to its
   size, a caller using 10% of `physics` subsidises the other 90%, and the
   split-package argument returns. Measurable in an hour against local `gnodev`
   — do it during Milestone 0, before the package grows.

## Delivery order: engine first, rendering second, polish last

One thing at a time, and never the pretty part first. Each milestone answers a
single question and is worthless before the previous one is answered.

### Milestone 0 — the engine, played through `Render()`

**No client at all.** The realm's `Render()` output *is* the game: gnoweb shows
the hole as markdown, and shots are submitted as calls. Ugly on purpose.

This is the laziest thing that can possibly work, and it is also the right
first step — it proves the engine with zero frontend, and a `Render()` view
stays useful forever afterwards as the debug surface.

- `p/<ns>/physics`: swept circle vs segment, closed form, ~200 lines
- `r/golf`: one hard-coded hole, `Launch(angle, power)`, ball position, stroke
  count, wear grid
- `Render()`: the hole as an ASCII/markdown grid, ball position, strokes, and
  the wear values visible as characters
- `gnodev` locally, one key via `gnokey`

**Question answered:** is the physics right, and is deciding a shot
interesting? Nothing about graphics.

### Milestone 1 — the course interface

Extract the hard-coded hole into the interface of decision 3, then prove it by
writing a *second* hole that does something the first could not. See ADR-002.

**Question answered:** can someone else invent a mechanic without touching the
engine?

### Milestone 2 — a second game, as the library's forcing function

A minimal breakout or pinball, on `p/<ns>/physics`. A weekend, not a project.

This is a milestone of the **library**, not a side quest. Generalising from two
real callers is reliable; generalising from zero is divination. The second game
is what tells us what is missing and what is badly named — and until it exists,
any claim that the packages are reusable is untested.

**Question answered:** are the types actually general, or only golf-shaped?

### Milestone 3 — the visual client

Only now. 2D canvas before WebGL; the 60 fps aiming curve, ball trail and camera
follow all sit on top of an engine that is already correct.

**Question answered:** is it pleasant?

### Explicitly out of every milestone above

The maker GUI, session accounts, the relayer, multiplayer, commit–reveal, decay
tuning, Three.js.

**The demo that matters lands at Milestone 1**, and it is 60 seconds: deploy a
new hole from a terminal, refresh gnoweb, play it. Nothing rebuilt, nobody's
permission asked. Ideally the hole is someone else's, with a mechanic we did not
write. It works in `Render()` — it does not need to be beautiful to make the
point.

## Tooling

`gnoverse/gno-mcp` (Apache-2.0) is the chain toolchain this project was built with:
local `gnodev` profile, realm build/test/deploy flow, and — relevant to
Milestone 0 — `Render()` conventions in its docs. It is pre-release and
unaudited by its own README; writes are confined to dev/testnet by design.
