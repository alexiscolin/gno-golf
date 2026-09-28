![Gnogolf: 3D mini-golf on gno.land](docs/img/banner.png)

# Gnogolf

A 3D mini-golf game on [gno.land](https://gno.land). The holes live on-chain,
and so does the physics: the chain plays every shot.

**Race anyone's ghost, verified on-chain.** Every best round on the boards is
a ghost you can take turns against, stroke for stroke: the champion's, a
player's at your level, a friend's, or your own. The chain kept it, so nobody
can fake one, and there is no game server: the chain is the referee. Next:
**build a hole, own it forever**, the contract side is ready and closed
behind a switch, the in-game editor comes with the second wave.

## How it works

You pull back like a slingshot and let go. The client sends that decision (an
angle, a power, the moment you let go) and the `golf` realm rolls the ball
itself. Nobody ever sends "I scored 2": a recorded round is the chain's own
replay of your shots, and anyone can replay it again.

- Playing is free. A shot's preview is a read-only query, so you need no wallet
  to play the whole course.
- Keeping a score takes one transaction per hole (two for a long round),
  signed with [Adena](https://www.adena.app/) (or gnokey, from the game's
  commands). The first save on a hole costs
  about 0.4 GNOT (most of it a storage deposit), a later one about 0.06.
- The boards list players with a gno.land name, so a script can't flood them
  with throwaway addresses. You can take a name without leaving the game, in
  the same signature that ranks the rounds you saved before it. Rounds saved
  without a name are still kept, and shown apart under each board.
- You can read a hole's code on gnoweb before you play it.
- A saved round dares your friends: your share link has them race your best
  as a see-through ghost, stroke for stroke. The ghost is your real round,
  replayed by the chain in the weather you had, so it can't be faked, and
  racing it costs only free reads ([ADR-004](adr/adr-004-duels.md)).
- Or pick a rival yourself: after the title, choose Duel, then whose ghost
  (a friend's name or address, or anyone on the board), then one of their
  ghosts, listed hole by hole with their best to beat. The ghost wears
  another gnome than yours, and each turn is called out: yours, then theirs.
  Race on a hole's board or in Friends does the same from the game.
- Badges (an ace, all six weathers, a duel won…) are kept in your browser
  and stamped on the cup card, on the hole each was earned on. New game
  clears them with your scores; the gnomes you unlocked stay.
- Support, the chip by the network banner, sends an optional 1, 5 or 10
  GNOT tip: a plain bank send to the golf realm's `Owner()` as read on the
  chain, confirmed in Adena. Playing stays free.

There are four cups of 18 holes (Garden, Island, Mushroom Town, Mountain) and
two extras. A cup always starts from its first hole, with a fresh round. The
menu's Mode goes back to Solo or Duel, All cups to the cups (a duel's ghosts
in a duel), and Gnome to the gnome picker. Some holes move, so timing is part of the shot. Every hole has
weather (wind, rain, fog, storm, snow), which changes every five minutes of
chain time and is the same for everyone.

## Running it locally

You need a `gnolang/gno` checkout next to this repo, Go, and Node.

**1. The chain.** The `gnodev` and `gnokey` you may have installed are older
than the checkout (they fail with `pubKeyAddress does not have a body`), so
build them from source:

```sh
(cd ../gno/contribs/gnodev && go build -o /usr/local/bin/gnodev .)
(cd ../gno/gno.land && go build -o /usr/local/bin/gnokey ./cmd/gnokey)
gnodev local -empty-blocks -empty-blocks-interval 5   # from this repo's root
```

That gives you gnoweb on `http://127.0.0.1:8888` and the RPC on
`http://127.0.0.1:26657`, the web client's default. Three things we learned
the hard way:

- **Keep `-empty-blocks`.** Without it gnodev only makes a block when a
  transaction arrives, so its clock stops. The weather changes every five
  minutes of chain time, and a frozen clock makes every new round look like
  its weather is already over.
- **Keep port 26657.** Adena's built-in `dev` network points there, with
  chain id `dev`. Run the node anywhere else and Adena can't sign for it (it
  won't add a second `dev` network).
- **Open `http://127.0.0.1:8888/r/sys/namereg/v0` once.** gnodev loads
  packages lazily, and registering a name straight after a restart fails
  until the registrar has been loaded. Pearl and mainnet deploy it at genesis,
  so this is local only.

**2. The holes.** The course is data (`data/holes.txt`), and only golf's owner
can publish it. Under gnodev that's the deploy key, `test1`:

```sh
scripts/publishdata.sh 7   # writes scripts/publish/publish-NN.gno, 7 holes each
gnokey maketx run -gas-fee 100000000ugnot -gas-wanted 2000000000 \
  -remote http://127.0.0.1:26657 -chainid dev -broadcast test1 scripts/publish/publish-01.gno
```

Run them in order. A slot already up to date is skipped, so a failed script
can just be run again. To save a round from the game, fund your Adena account
from `test1` with `gnokey maketx send`.

**3. The web client.**

```sh
cd web
npm install
npm run dev     # development server
npm run build   # static export to web/out/, host it anywhere
npm run typecheck && npm run lint && npm run selfcheck   # selfcheck fails if the client's copy of the realm's rules drifts
```

The client takes its config from the URL, so one build works with any chain:
`?rpc=`, `?web=`, `?hole=garden/7` or `?cup=garden&hole=7`.
`NEXT_PUBLIC_CLIPS=1` at build time offers a clip of the holing shot in the
hole-finished card ([ADR-003](adr/adr-003-sharing.md); `?clips` in a dev build).

For the Gno tests, point `GNOHOME` at a package cache holding the gno
checkout's `examples/` copies of `avl`, `ufmt`, `uassert` and `urequire`: the
module cache's `p/nt/avl` differs from the chain's.

## Writing a hole

A hole is geometry: a `course.Simple`, encoded as data and published with
`golf.PublishMine(slug, hexData, note)`. It becomes a community hole: playable,
and recorded on its own board, but in no cup and not in the rankings. No hole runs code of its own:
golf decodes the data and plays it with its own physics.

```go
var me = &course.Simple{
	World: "garden", Order: 21,
	W: 40, H: 12, // the board: 1 to 96 a side
	Title:     "First Hole",
	Strokes:   3, // par
	Tee:       physics.V(4, 6),
	Pin:       physics.V(35, 6),
	Substeps:  24,
	CupRadius: 1.2,

	Course: &physics.Field{
		Walls: build.Walls(
			build.Box(physics.V(0, 0), physics.V(40, 12)),
			build.Bar(physics.V(20, 0), physics.V(20, 7), 0.8, '=', "hedge"),
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

var hexData = hex.EncodeToString([]byte(course.Encode(me)))
```

Its id is `<your address>/<slug>/v1`, and only you can add versions to it. A
`Skin` is only a hint: a client that doesn't know `"hedge"` draws a plain wall.
`build` is `gno.land/p/gnogolf/physics/build`, the wall builders; the course's
holes also finish with `author.Fit` (`gno.land/p/gnogolf/course/author`). Both
are for writing holes only: nothing on chain needs them.
The course's own holes, in `gno.land/r/gnogolf/`, are the best examples.

## Who can change what

The golf realm has one role, its owner (the account that deployed it). The
owner publishes the course's holes and their new versions. A new version
archives the old one: still playable, its records kept, but out of the
course-wide ranking. The owner can also set the game's link, name a successor
realm once, and hand the role on or give it up for good.

The owner can't edit or delete a hole, a round or a score, can't touch
anyone's community hole, the weather or the physics, and can't pause or
upgrade the realm. The details are in
[docs/golf.md](docs/golf.md#who-can-change-what).

## Repo layout

```
gno.land/p/gnogolf/physics   2D rolling-ball engine
gno.land/p/gnogolf/course    the hole contract and the weather
gno.land/r/gnogolf/golf      the game realm: holes, rounds, previews, boards, gnoweb page
gno.land/r/gnogolf/<hole>    each course hole's source
web/                         Next.js + three.js client (static export)
data/holes.txt               the course as data, one line per slot
```

## Docs

- [docs/physics.md](docs/physics.md): the physics, usable by other Gno games.
- [docs/course.md](docs/course.md): the hole contract, timed pieces, weather.
- [docs/golf.md](docs/golf.md): the realm's API, and how it's updated after the deploy.
- [docs/leaderboards.md](docs/leaderboards.md): the boards, the ghost duels, and the bot check.
- [CLIENT.md](CLIENT.md): how to write a client.
- [adr/](adr/): the architecture decisions.
