![Gnogolf: 3D mini-golf on gno.land](docs/img/banner.png)

# Gnogolf

A 3D mini-golf game that runs on [gno.land](https://gno.land). Every hole lives
on-chain, and the chain computes every shot.

## Why on-chain

The chain doesn't just store your score. It plays your shots. The client sends
decisions (an angle, a power, and when you let go) and the `golf` realm replays
them through the physics to see where the ball ends up. There's no "I scored 2"
message anywhere. A recorded round is the chain's own replay of what you did,
and anyone can replay it again from the shots it keeps, so you can't fake a
score.

It also means:

- Previewing a shot is a free read-only query (`vm/qeval`). You can play every
  hole without a wallet or an account. Nothing gets recorded until you ask for
  it.
- Recording a whole hole takes one transaction (`PlayRound`), not one per
  shot.
- The golf realm has one role, its owner, who publishes the course's holes and
  can hand the role on or renounce it. There is no pause, no upgrade and no
  delisting: anyone can publish a hole of their own, and nobody can take one
  down.
- You can read a hole's source on gnoweb before you play it. The physics you
  trust is code you can read.

## How to play

Click (or touch) anywhere, pull back like a slingshot, and let go. The further
you pull, the harder you hit. The ball rolls, bounces off rails and bumpers,
slows down in sand, speeds up on ice, goes through tunnels, and flies off the
top of a fast slope. Get it in the cup in as few strokes as you can. Each hole
has a par.

Some holes move: a mill's sails turn, a tram crosses, a gate closes every other
stroke. Some depend on when you let go, so timing is part of the shot. Every cup hole
hole also has weather (clear, wind, rain, fog, storm or snow). It changes every
five minutes of chain time and is the same for everyone.

There are four cups of 18 holes each:

| Cup | World | Source realms |
|---|---|---|
| Garden Cup | `garden` | `r/gnogolf/hole1` … `hole20` (without `hole10` and `hole16`, which are in `extras`) |
| Island Cup | `island` | `r/gnogolf/island1` … `island18` |
| Mushroom Town | `town` | `r/gnogolf/town1` … `town18` |
| Mountain Cup | `mountain` | `r/gnogolf/mountain1` … `mountain18` |

Practice is free. Connect [Adena](https://www.adena.app/) when you want to keep
a round: it gets signed as one transaction (`Reset` + `PlayRoundAt`) and goes on
the leaderboard once the ball is holed.

## Running it locally

You need a `gnolang/gno` checkout next to this repo, Go, and Node.

**1. The chain.** The `gno` and `gnodev` binaries you get from installing are
older than the checkout and fail with `pubKeyAddress does not have a body`,
so build `gnodev` from source:

```sh
cd ~/Server/gnoland/gno/contribs/gnodev && go build -o /usr/local/bin/gnodev .
cd ~/Server/gnoland/gnogolf && gnodev local -node-rpc-listener 127.0.0.1:26757
```

gnodev loads every package under `gno.land/` from disk. gnoweb runs on
`http://127.0.0.1:8888`, and the RPC runs on `http://127.0.0.1:26757`, which is
the web client's default.

**2. Publish the holes.** The course's holes are data (`data/holes.txt`, one
GG1 string per slot, built from the hole realms by `scripts/holedata.sh`), and
only golf's owner, the key that deployed it, can publish them. Under gnodev
that is gnodev's deploy key (`test1` by default). Generate the scripts and run
them in order as that key:

```sh
scripts/publishdata.sh     # writes scripts/publish/publish-NN.gno, 10 holes each
gnokey maketx run -gas-fee 1000000ugnot -gas-wanted 1000000000 \
  -remote http://127.0.0.1:26757 -chainid dev -broadcast test1 scripts/publish/publish-01.gno
```

A Publish costs a few tens of millions of gas and about half a GNOT of storage
deposit. A slot whose data is already current is skipped, so a script can be
run again after a failure; `scripts/publish/verify.gno`, run simulated, checks every
slot. Once they're published, `http://127.0.0.1:8888/r/gnogolf/golf` lists them.

**3. The web client.**

```sh
cd web
npm install
npm run dev          # development server
npm run build        # static export to web/out/, host it anywhere
```

The client reads its config from the query string, so one build works with any
chain: `?rpc=` for the node, `?web=` for gnoweb, `?hole=` for a hole's pkgpath,
and `?shot=angle,power` to fire a shot on load.

To run the Gno tests, the test harness needs a package cache that matches the
chain: point `GNOHOME` at a cache holding the gno checkout's `examples/` copies
of `avl`, `ufmt`, `uassert` and `urequire` (top-level `.gno` and `gnomod.toml`
only), since the module cache's `p/nt/avl` differs from the chain's.

## Repo layout

```
gno.land/p/gnogolf/physics   2D rolling-ball engine: walls, posts, zones, Step
gno.land/p/gnogolf/course    the hole contract: Hole interface, course.Simple, weather
gno.land/r/gnogolf/golf      the game realm: registry, rounds, previews, leaderboard, gnoweb page
gno.land/r/gnogolf/<hole>    one realm per hole (hole1…, island1…, town1…, mountain1…)
web/                         Next.js + three.js client, TypeScript (static export)
adr/                         architecture decision records
CLIENT.md                    the contract for writing a client
data/holes.txt               the course's holes as GG1 data, one line per slot
```

## Leaderboards (coming soon)

In the dapp, the leaderboard button and sheet carry a "Coming soon" badge until
launch. Turning the badge off is one constant, `SOON` in `web/components/Golf.tsx`.
Everything below already runs on-chain.

- **Two modes, ranked apart.**
  - **Assisted:** the full aim line (the chain's preview). It is recorded with
    `PlayRoundAt`.
  - **Pro:** no aim line. It is recorded with `PlayRoundPro`. Every `Launch`
    (one shot at a time from gnoweb) is pro.
  - A round keeps the mode of its first stroke.
  - The mode is the player's word: the chain cannot see a screen, and
    `Simulate` is open to all.
- **Only named players are ranked.** `Leaderboard(mode)` (the course-wide top ten)
  and `HoleLeaderboard(hole, mode, offset, limit)` (a hole's top 100, read ten by
  ten) list only addresses with a gno.land name (`r/sys/users`). An address is
  free, a name is not, so a script cannot flood the boards. Unnamed finishes are
  still kept, and count as soon as the player takes a name.
- **Friends first.** `Bests(hole, mode, players)` and `Standings(mode, players)`
  read any list of up to 50 addresses, named or not. The dapp's Friends tab is the
  default view: you compare with people you chose, and no bot can push you off.
- **Suspected bots are hidden in the dapp only.** `scripts/botcheck.ts` (see Bot
  check) writes `web/public/flags.json`. The general tabs hide players scoring at
  least 0.5 by default, with a "Show all" toggle. The Friends tab is never
  filtered. The chain and gnoweb show the raw boards, unfiltered, with no admin
  deciding who is suspect.
- **Archived holes keep their boards.** See Updating after the deploy.

## Bot check

The physics is public and deterministic, so a bot can play perfectly, and the
chain cannot tell. `scripts/botcheck.ts` (Node, no dependencies, reads only)
flags rounds that look machine-made:

```
nice -n 20 node --experimental-strip-types scripts/botcheck.ts [--rpc http://127.0.0.1:26757] [--top 10] [--json]
nice -n 20 node --experimental-strip-types scripts/botcheck.ts --selftest
```

It takes the top rows of every official hole's boards and the course boards,
in both modes, reads each candidate's bests (`Bests`) and recorded rounds
(`Round`), and prints a markdown (or `--json`) report. It also writes
`web/public/flags.json`: `{ updated, flags: { <address>: { score, reasons } } }`.
The score, 0 to 1, is a weighted mean of four signals:

| signal | weight | what it measures |
|---|---|---|
| knife-edge | 0.35 | the holing shot is replayed (`SimulateRoundAt`, same period) with ±0.2°, ±0.05 power and, on a timed hole, ±1 tick. If 75% or more of the nudges stop holing in as few strokes, that hole counts as knife-edge. The signal is knife-edge holes / max(3, holes checked), so one lucky shot is not enough. |
| values | 0.30 | the dapp sends angle and power in 0.01 steps, so a human shot lands on the solver's grid (whole degrees, power in 0.25) about 1 time in 2,500. A grid shot counts 1. A shot finer than 0.01, which means another client, counts 0.5. The mean is damped below 5 shots. |
| optimality | 0.20 | the share of the player's holes finished at or below the solver's best (`scripts/hole-bests.json`, from the verification pass), damped below 3 holes. Beating the solver is listed as a reason. |
| volume | 0.15 | how many holes they finished at the optimum, capped at 20. |

The script rate-limits the RPC (`--delay`, 150 ms by default) and caps the
replays (`--max-sims 300`) and round reads (`--max-rounds 300`). The selftest
builds two synthetic players from real replays. The bot plays the solver's
plans unchanged. The human plays the same plans with 0.01-step noise and
keeps only the noisy rounds that still hole. The selftest checks that the bot
scores higher.

**Limits: this is an indicator, not proof.** A careful bot can add noise at
0.01, pick robust shots rather than knife-edge ones (our own solver prefers
those), and play a few strokes over the optimum. Such a bot scores like a
strong human. A strong human who plays a lot will score on optimality and
volume, up to 0.35 from those two alone. The recorded round is the latest one
on a hole, which may be a replay rather than the ranked best. Only the holing
shot is nudged, because setup shots are fragile for everyone. Flags feed a
"show all" toggle, not a ban.

## Writing a hole

Most holes are just geometry, and `course.Simple` covers that. A hole of your
own is a community hole: playable, recorded and on its own board, but in no
cup. It is either GG1 data (`course.Encode`) published with
`golf.PublishMine(slug, hexData, note)`, or a realm with a `course.Simple`
value and a `Register` function:

```go
package myhole

import (
	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
	"gno.land/r/gnogolf/golf"
)

var me = &course.Simple{
	World: "garden", Order: 21,
	W: 40, H: 12, // the board; 0 means 32x16
	Title:     "First Hole",
	Strokes:   3, // par
	Tee:       physics.V(4, 6),
	Pin:       physics.V(35, 6),
	Substeps:  24,
	CupRadius: 1.2,

	Course: &physics.Field{
		Walls: physics.Walls(
			physics.Box(physics.V(0, 0), physics.V(40, 12)),
			physics.Bar(physics.V(20, 0), physics.V(20, 7), 0.8, '=', "hedge"),
		),
		Posts: []physics.Post{
			{Circle: physics.Circle{C: physics.V(28, 4), R: 1.0}, Bounce: 1.2, Skin: "bumper"},
		},
		Zones: []physics.Zone{
			{Kind: physics.Surface, Min: physics.V(10, 8), Max: physics.V(16, 12), Scale: 0.55, Skin: "sand"},
		},
		Friction: 0.86,
		Bounce:   0.85,
		Radius:   0.5,
	},
}

// Register publishes this hole to golf. It can't run from init(): there is no
// `cur` there, so it takes one transaction after the deploy.
func Register(cur realm) { golf.Register(cross(cur), me) }
```

Deploy it with your own key (sessions can't use `vm/add_package`), then call
`Register` once. The hole's id is its pkgpath, so nobody else can claim it
(under golf's own namespace, the owner must `Expect` the path first). A
`Skin` is only a hint for renderers: a client that doesn't know `"hedge"` draws
a plain wall.

The hole realms in `gno.land/r/gnogolf/` are the best examples. `hole2` has a
mole that pops up (`Pulses`), `hole4` has timed sails, `hole20` has a loop, and
`island6` has a no-rail lane over the sea (an `Outside` polygon hazard). Every cup hole
comes with a `fingerprint_test.gno` that pins its shots and checks it survives
encoding as data.

## Updating after the deploy

Nothing on gno.land is edited in place: a published package is frozen at its
path. An update is a new package at a new path, and the rules below keep every
score honest through it.

- **The physics never changes under a hole.** A data hole plays on the physics
  golf imports, a realm hole on the one it imports, and both are frozen, so
  scores stay comparable forever. A new physics goes to a new path
  (`p/gnogolf/physics/v2`).
- **A broken hole is replaced by a new version.** The owner publishes the fixed
  data into the same slot (`Publish("island/7", hexData, note)`), and it plays
  as `island/7/v2`. Data identical to the current version is refused.
- **No score is ever erased.** The old version is archived: still playable, its
  records and leaderboard kept and shown (under "Archived course holes"). Its
  bests leave the course-wide ranking, and the new version starts a fresh
  leaderboard. Unlocked gnomes and grand slams stay earned.
- **Say what changed.** The version's note (on its data page, and in
  `Versions`), and the dapp's changelog, name the fix ("Hole 7 v2: closed a
  shortcut, v1 records archived").
- **The hub itself** has no successor mechanism: if it ever needs one, a
  `r/gnogolf/golf/v2` can read the v1's public state (`Holes`, `Leaderboard`,
  `State`, `Round`) and show it as history.
- **The dapp** (the web client) is not on-chain and can be updated at any time.
  It lists the current holes (`"next"` is empty in `Holes()`) and links the
  archived ones.

## Docs

- [docs/physics.md](docs/physics.md): the physics package, usable as a 2D
  mini-golf engine by other Gno games.
- [docs/course.md](docs/course.md): the hole contract, `course.Simple`, timed
  pieces, the weather.
- [docs/golf.md](docs/golf.md): the golf realm's public API and its JSON.
- [CLIENT.md](CLIENT.md): how to write a client (the reads, the double
  unwrap, animating a path, the four rules).
- [adr/adr-001-architecture.md](adr/adr-001-architecture.md): the original
  architecture.
