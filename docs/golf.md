# `gno.land/r/gnogolf/golf`

The game realm. It holds the holes, every player's round on each hole, the
records and the rankings. It routes shots to holes. It knows nothing about any
particular course: `golf` only understands a hole through
[`course.Hole`](course.md).

Every hole is **data**: a GG1 string ([course.md](course.md#holes-as-data-gg1))
that `golf` stores and decodes afresh for every call, and plays with the
physics package. No hole runs code of its own. The course's own holes are data
the owner publishes into **slots** (`garden/7`), each publish a new **version**
(`garden/7/v1`, `garden/7/v2`, …). Anyone can publish data of their own the
same way (`PublishMine`).

Only the versions the owner publishes into slots are **course holes**
(`"official":true`): they make up the cups and count in the course-wide
ranking. Everything else is a **community hole**: playable, recorded, with its
own records and board, but in no cup and out of the course ranking.

## Who can change what

The realm has one role, its **owner**: the account that deployed it (captured
once, when the realm is created). Every owner check is on the immediate caller
(`cur.Previous().Address()`), never on the transaction's signer, so a realm the
owner happens to call can't act in the owner's name.

The owner can:

- **Publish a new version into a slot** (`Publish`). The old version is
  archived: still playable, its records kept, but its bests leave the
  course-wide ranking, and the new version starts that hole's ranking from
  zero. A version identical to the current one is refused, but nothing checks
  that a new version is playable: a hole can be replaced, never taken down.
- **Add slots** (`Publish` into a slot that has none yet), in any world, with
  an order from 1 to 999.
- **Move the play link** (`SetPlayURL`): where every page sends a player for
  the 3D game.
- **Name a successor, once** (`SetSuccessor`): the realm the course has moved
  to. It only adds a banner to the pages and a field to `Holes`; it blocks
  nothing.
- **Hand the role on** (`Transfer`, then `Accept` by the new owner) or **give it
  up for good** (`Renounce`). After `Renounce` there is no owner, nobody can
  become one, and the course is frozen.

So the owner shapes the course, and through it the ranking. A stolen owner key
could archive every slot, and what that does to the rankings can't be undone.
When a version is published decides its id, and the id seeds its weather.
Whoever holds the namespace can also deploy lookalike realms under it; they
aren't holes of this realm at all, but their URLs look like the course's.

The owner can't edit or delete a version, a round, a record, a best, a board
or a standing, can't touch a community hole, the weather, the physics or the
code, and can't pause or upgrade the realm. Everyone else can play, reset
their own round, publish holes of their own and settle the ranking sooner
(`Drain`). The hub page says the same, with the current owner's name
(see [Render](#renderpath-string-string)).

For how a client calls all this (the `vm/qeval` query, the double unwrap,
animating a path, the rules a client must follow), see
[CLIENT.md](../CLIENT.md). This page is the API reference.

## Ids

| Form | Example | What it is |
|---|---|---|
| version | `garden/7/v2` | one published version of a course hole |
| slot | `garden/7` | alias for the slot's current version |
| community version | `g1…/my-hole/v1` | one version of someone's own data hole |
| community alias | `g1…/my-hole` | alias for its current version |

**Reads take an id or an alias. Writes take the exact id only**, the one
`State` or `Holes` gave: a round can't be replayed on a version it wasn't
played on. A write given an alias panics with
`golf: garden/7 is an alias: play its version by id, garden/7/v2`, and an
unknown hole with `golf: unknown hole: <id>`. Every JSON answer names the
version's exact id, never the alias.

The course was once 74 realms, `gno.land/r/gnogolf/hole1` and so on. They are
now only the source of the data: they don't call golf, and their paths are not
ids. `data/holes.txt` maps each slot to the realm its data was built from.

## Units and formats

- **Angle**: degrees, 0 = +X, 90 = +Y (down). `golf` turns it into radians. It
  goes through `math.Mod(angle, 360)` and is rounded to 4 decimals, so a
  negative angle stays negative. Both work the same in the physics.
- **Power**: rounded to 4 decimals, then it must be above 0 and at most 10.
  NaN, infinities and anything out of range panic.
- **Shot list**: `"angle,power;angle,power;…"`, and each shot can have a third
  field, `"angle,power,tick"`. The tick is where the timed pieces were when the
  player let go: a whole number, clamped to `0..1023`, and a missing tick is 0.
  A string is used because `MsgCall` can't carry a slice. Empty entries are
  skipped, an empty list panics, and one commit takes at most 12 shots (fewer
  on a heavy hole, see [the work budget](#the-work-budget)).
- **A round** has at most 60 strokes, then it must be `Reset`.
- **A ball off the board**: a stroke whose ball comes to rest outside the
  hole's board (a leak in its walls) brings it back to where the stroke
  started. The stroke counts, as a hazard's does, with no penalty. Play,
  every simulation and the replayed last shot (whose path ends with that
  point) agree.
- **Mode**: `"assisted"` (or `""`) or `"pro"`. Anything else panics. Each mode
  has its own records, boards and ranking.
- **Numbers in JSON** are printed with three decimals. NaN and Inf are printed
  as `0`. A vector is `[x,y]`. `rest` is the exception: the exact ball, as the
  shortest decimals that read back as the same float64.
- **Text** from a hole author (names, notes) is cleaned once, when it's
  published: one line, no control, bidi, zero-width or blank-looking
  characters (U+00AD, U+115F, U+1160, U+3164, U+FFA0, U+2800, the variation
  selectors, the tag characters and the like), none of ``|[]<>`*_#\&~@``. A
  name is at most 40 characters and falls back to `"Untitled hole"` when no
  letter or digit is left; a note is at most 140. Skins are cut down to
  `[a-z0-9 _-]`, at most 24 bytes. Every string in JSON is escaped.
- **Every JSON object** a read returns starts with `"version":1` (and so does
  each round). The rows inside a list don't. `version` is golf's generation: a
  golf/v2 answers 2 even where a shape is unchanged.

## Writes

### `Publish(cur realm, slot, hexData, note string) string`

Owner only. Puts a course hole's data into its slot as the slot's next version
and returns the new version's id (`"garden/7/v2"`).

- `hexData` is the hole as `course.Encode` wrote it, in hex, at most 32 KB of
  data (a hole at every limit of the format is about 21 KB).
- The data must decode within the format's limits, its stored wall lengths
  must be its walls' own (`course.DecodeChecked`: `Decode`, then `Exact`),
  and it must be exactly the bytes `course.Encode` would write for the hole
  it decodes to. So the same hole can't come back under another sha.
- The slot must be the data's own world and order (`"garden/7"` for world
  `garden`, order 7), so a mis-edited file can't replace the wrong hole. The
  order must be a whole number from 1 to 999.
- Data identical to the current version's is refused: it would reset the
  hole's ranking for nothing.
- The name, par, world and order are frozen with the version. `note` is
  cleaned and shown on the version's data page and in `Versions`.
- The version it replaces is archived (see [Archived holes](#archived-holes)).

Emits `HolePublished` (`hole`, `slot`, `sha`, `by`, `official` `"true"`), then
`HoleRetired` (`hole`, `next`) if a version was replaced.

### `PublishMine(cur realm, slug, hexData, note string) string`

Anyone. Publishes a hole of one's own as data and returns its id:
`"<caller>/<slug>/v1"` the first time, then `v2` and on. Only the same address
can add versions to it. `slug` is 1 to 32 of `a-z`, `0-9` and `-`.

The data is held to what `Publish` holds it to, but its world and order are
its author's business. It's a community hole: playable, recorded and on its
own board, in no cup and out of the course ranking. A new version archives the
old one (which never counted anywhere). The publisher pays the storage deposit
for the bytes it adds, and nothing published can be deleted. Emits
`HolePublished` (`official` `"false"`).

### `Transfer(cur realm, to address)`, `Accept(cur realm)`, `Renounce(cur realm)`

The owner role, handed on in two steps.

- `Transfer` (owner only) offers the role to `to`, which must be a valid
  address. Offering it to the owner themselves cancels the offer. Emits
  `OwnershipOffered` (`owner`, `to`) or `OwnershipOfferCancelled` (`owner`).
- `Accept` takes the role, when the caller is the address offered it. Emits
  `OwnershipTransfer` (`from`, `to`).
- `Renounce` (owner only) gives the role up for good: no owner, no offer, and
  none possible. Emits `OwnershipRenounced` (`from`).

### `SetPlayURL(cur realm, url string)`

Owner only. Moves the link every page gives to the 3D game (at deploy,
`https://gno-golf.netlify.app/`). `url` is `https://` and up to 100 of `a-z`,
`A-Z`, `0-9` and `-._~/:%`, with no query or fragment of its own: a hole's
link adds `?cup=…&hole=…` or `?hole=<id>` to it. Emits `PlayURLSet` (`url`).

### `SetSuccessor(cur realm, pkgpath string)`

Owner only, once. Names the realm this course has moved to: a pkgpath under
`gno.land/r/`, up to 100 of `a-z`, `0-9` and `_-/.`, not golf itself. Once set
it never changes. It moves nothing and blocks nothing: every page shows a
"This course has moved" banner and `Holes` gives `"successor"`, while every
play, record and publish here goes on as before. Emits `SuccessorSet`
(`successor`). `Successor()` reads it (`""` if none).

### `Launch(cur realm, hole string, angle, power float64) string`

One shot, one transaction, with tick 0. It's how gnoweb plays, with no aim
preview, so a round started with `Launch` is always a **pro** round, and a
round started in assisted mode can't be continued with it. The first stroke
fixes the round's weather period to `Period()`. It answers with the version's
id and, for gnoweb, where the cup is:

```
Stroke 2 on garden/3/v1: the ball stopped 7.4 from the cup, which is at 12° from it. Your round: /r/gnogolf/golf:garden/3/v1/g1…
Holed in 3 on garden/3/v1! Your round: /r/gnogolf/golf:garden/3/v1/g1…
```

### `PlayRound(cur realm, hole, shots string) string`

### `PlayRoundAt(cur realm, hole, shots string, period int64) string`

### `PlayRoundPro(cur realm, hole, shots string, period int64) string`

Commit several shots in one transaction by replaying them. The client sends
decisions, never outcomes. They **continue the caller's round from where it
is**. They don't start from the tee, so to record what `SimulateRound` showed,
send `Reset` and `PlayRoundAt` in the same transaction (the web client does
this through Adena).

- `PlayRoundAt` plays in the weather of `period`, assisted. `PlayRoundPro` is
  `PlayRoundAt` in pro mode: the aim preview cut short, on the player's word.
  `PlayRound` is `PlayRoundAt` for a caller with no period to give (a form, a
  script): a round's first stroke takes the current period, a round under
  way its own. Prefer `PlayRoundAt`: a commit included after the weather
  turned is then played in the weather its shots were chosen in.
- On a round's first stroke, the period has to be the current one or the one
  before, or it panics. The mode is fixed there too.
- On a round that's already under way, the period and the mode have to be the
  round's own, or it panics.
- A round can be played on until the period after its own is over. After
  that, every stroke panics until the round is `Reset`.
- It stops at the shot that holes the ball. Returns `"holed in N strokes"` or
  `"K shots replayed, ball at X.X,Y.Y after N strokes"`.
- A finished round (`done`) can't be played again until it's `Reset`.

### `Reset(cur realm, hole string)`

Drops the caller's round on that hole (and frees its storage). The next
stroke starts a new one from the tee. Their bests are kept. Emits
`RoundReset` (`hole`, `player`).

### `Drain(cur realm, n int) int`

Anyone. Takes up to `n` players (clamped to 1..400) of archived course holes
out of the course standings, oldest archived hole first, and returns how many
archived holes still have players in them. A standing it empties stays, at 0
holes, and its ranking key is kept aside, out of the ranking, so the storage
it would free (the player's deposit) is not refunded to the caller. See [Archived holes](#archived-holes).

### Events

The names are exported constants (`golf.EventHolePublished` and so on). A
hole is always `hole`, a player `player`.

| Event | Keys |
|---|---|
| `HolePublished` | `hole`, `slot`, `sha`, `by`, `official` (`"true"` for `Publish`, `"false"` for `PublishMine`) |
| `HoleRetired` | `hole`, `next` |
| `Shot` | `hole`, `player`, `strokes`, `mode`, `shot` (the stroke as recorded, `"angle,power,tick"`) |
| `Holed` | `hole`, `player`, `strokes`, `mode`, `shots` (the whole round, as `Round` gives it) |
| `RoundReset` | `hole`, `player` |
| `OwnershipOffered` | `owner`, `to` |
| `OwnershipOfferCancelled` | `owner` |
| `OwnershipTransfer` | `from`, `to` |
| `OwnershipRenounced` | `from` |
| `PlayURLSet` | `url` |
| `SuccessorSet` | `successor` |

`Shot` is the stroke that did not hole, `Holed` the one that did: together
they are every stroke, which is all that outlives a `Reset`.

## Archived holes

A version stops being current when a newer one takes its alias. It stays
playable, keeps its rounds, records, board and wear, and says `"next"`: the
version that took its place.

On the course, an archived version's bests also leave the course-wide
standings. That's done in batches, because it costs one standing update per
player who finished the hole: the `Publish` that replaces it takes the first
150, every finish on a course hole takes 4 more (a community hole's finish
takes none), and anyone can take up to 400 with `Drain`. Until the last one is
out, a player not yet reached still counts the old version, and a better
finish there still moves their standing. A first finish on a version after it
was archived never counts. A standing the drain empties is kept at 0 holes,
out of the ranking; the owner's playbook is to `Drain(400)` after a
republish until it returns 0.

## Reads

These are all free as `vm/qeval` queries and return JSON strings (except
`Current`, `HoleData`, `BestOf`, `StandingOf`, `Owner`, `Pending` and
`Period`, which return plain values).

### Holes and versions

#### `Holes() string`

The holes, for a client building a menu, at most 120 in all: the course's
current holes in course order (world by world, then by order), then at most
20 of its archived versions (leaving at least 20 places for the rest), then
everyone's current community versions, newest first: each address's 3
newest at most, so however many one address publishes, it fills 3 rows and
pushes nobody else further down. The rest are in `Community`, and every version of a slot is on its data page. It decodes
nothing.

```json
{"version":1,"play":"https://gno-golf.netlify.app/","successor":"","holes":[
  {"id":"garden/1/v1","name":"The Shelf","official":true,"plays":12,"best":3,"proBest":4,
   "par":3,"world":"garden","order":1.000,"next":"","slot":"garden/1"}, …]}
```

`play` is the 3D game's link (`SetPlayURL`), `successor` the realm the course
moved to, `""` if none (`SetSuccessor`). In a row, `best` and `proBest` are
the fewest strokes anyone has holed it in, assisted and pro, or 0 if nobody
has. `next` is the version that replaced it, `""` while it's current. `slot`
is its alias. The world order is `garden`, `island`, `town`, `mountain`, then
any other world.

#### `Community(after string, limit int) string`

A page of every community hole, every version of each, by id: all that
`Holes` leaves out. Paged like `Records`.

```json
{"version":1,"rows":[<a Holes row>, …],"next":"g1…/my-hole/v2"}
```

#### `Current(alias string) string`

The id of the version an alias (`"garden/7"`, `"g1…/my-hole"`) plays now, or
`""` if the alias has none.

#### `Versions(alias string) string`

Every version of an alias, oldest first (the newest 100 if there are more). An
alias with no version gives `"slot":""` and an empty list: the answer never
echoes the argument.

```json
{"version":1,"slot":"garden/7","versions":[
  {"id":"garden/7/v1","v":1,"height":1204,"by":"g1…","sha":"9f2c…","note":"","next":"garden/7/v2"},
  {"id":"garden/7/v2","v":2,"height":5310,"by":"g1…","sha":"41ab…","note":"closed a shortcut","next":""}]}
```

`height` is the block it was published at, `by` its publisher, `sha` the
sha256 of its data in hex.

#### `HoleData(hole string) string`

A version's GG1, in hex, as it was published (an alias gives its current
version's): what a successor realm or an auditor reads back.

### Drawing a hole

#### `HoleState(hole string) string`

Everything needed to draw the hole and aim: `State` without `plays`,
`roundsTotal` and `rounds`. Prefer it to `State` when the rounds aren't needed.

#### `State(hole string) string`

```json
{"version":1,"hole":"garden/3/v1","name":"Down the Tunnel","official":true,
 "slot":"garden/3","v":1,
 "board":{"w":50,"h":15},"par":3,"world":"garden","order":3.000,
 "timed":false,
 "period":5920000,
 "weather":{"period":5920000,"kind":"wind","wind":[0.1,-0.04],"zones":[…]},
 "start":[5,6],"cup":[44,6],"plays":12,
 "walls":[{"a":[0,0],"b":[32,0],"skin":""},
          {"a":[…],"b":[…],"skin":"plank","every":8,"on":4,"phase":0}],
 "posts":[{"c":[12,6.3],"r":0.7,"skin":"stump"}],
 "zones":[{"kind":"surface","min":[…],"max":[…],"vec":[0,0],"scale":0.55,"round":false,"skin":"sand"},
          {"kind":"slope","min":[…],"max":[…],"vec":[0.2,0],"scale":0,"round":false,"air":true,"skin":"cannon"},
          {"kind":"hazard","min":[0,0],"max":[50,18],"vec":[5,6],"scale":0,"round":false,
           "poly":[[…],…],"outside":true,"skin":"sea"}],
 "wear":{"w":16,"h":8,"cells":[0,0,1,…]},
 "roundsTotal":40,
 "rounds":[<round>, …]}
```

(The values are illustrative, not from one real hole.)

- `hole` is always the version's id, the one to write with, with its `slot`
  and `v` (its number), and an archived one `next`.
- `timed`: the hole changes from stroke to stroke. Read `Extras` for each
  stroke.
- `walls[].every/on/phase` only appear on timed walls, and
  `zones[].every/on/phase` only on timed zones. `zones[].poly` and `outside`
  only appear on polygon zones.
- `zones[].air` and `zones[].capped` only appear when true: the zone is moving
  air (a cannon's gust), and capped air never speeds the ball up. Draw moving
  air as air, whatever its skin.
- `zones[].kind` is `surface`, `slope`, `tunnel`, `hazard` or `loop`. For what
  `vec` and `scale` mean for each kind, see [physics.md](physics.md#zone).
- `weather` is the forecast for the current period. See `Weather`. Its zones
  never carry `air` or `capped`: the wind is always both.
- `rounds` shows at most 24 rounds, in address order, without their paths.
  `roundsTotal` is the real count. Use `Round` for one player's round, or
  `Rounds` to page through them all.

#### `Extras(hole string, stroke int) string`

What a timed hole adds at stroke N of a round (0 = first shot):

```json
{"version":1,"walls":[…],"posts":[…],"zones":[…]}
```

All three lists are empty for a hole that isn't `course.Timed`, and for
`stroke < 0`.

#### `Weather(hole string, period int64) string`

The hole's weather in a period, as the zones a client draws and the chain
plays under. A period still to come panics.

```json
{"version":1,"period":5920000,"kind":"storm","wind":[0.09,0.05],
 "zones":[{"kind":"surface",…,"skin":"storm"},{"kind":"surface",…,"skin":"rain"},
          {"kind":"slope",…,"every":6,"on":3,"phase":0,"skin":"wind"}, …]}
```

`kind` is `""` when it's clear, and `wind` is `[0,0]` unless the kind is wind
or storm.

#### `Period() int64` and `PeriodSeconds`

`PeriodSeconds = 5 * 60`. `Period()` is the block time in Unix seconds divided
by it. The weather is `course.ForecastFor(id, world, h, period)` (see
[course.md](course.md#weather)), seeded by the version's id: the same for
everyone, different from hole to hole and version to version, and nobody
chooses it.

### Rounds and previews

#### `<round>` (in `State`, `Round` and `Rounds`)

```json
{"version":1,"player":"g1…","ball":[26,0.04],"rest":[26,0.0412345],
 "strokes":2,"done":false,"period":5920000,"mode":"assisted",
 "shots":"12.0000,6.5000,0;350.0000,3.0000,4",
 "path":[[3,13],…],"air":"000110…0","cause":"--bbw…-"}
```

`ball` is where it lies, rounded; `rest` is the same ball exactly, which
`SimulateFrom` and `SimulateCommit` take. `shots` is the round as played,
which is enough to replay it. `path`, `air` and `cause` are only in `Round`:
the last stroke, replayed from where it started. `air` has one `0`/`1` per
path point (the ball is off the ground), and `cause` one letter per point for
what most acted on the ball: `b` a bounce, `s` a hill, `w` wind or a gust, `i`
a slippery surface, `-` nothing but friction.

#### `Round(hole string, player address) string`

One player's round with its last stroke's path, or `null` if they have none
(or `Reset` it). It costs one stroke of gas, whatever the size of the hole's
history.

#### `Simulate(hole string, ballX, ballY, angle, power float64) string`

What one shot from `(ballX, ballY)` would do, in the current weather, as
**stroke 0 with tick 0**. The ball must be on the board. Changes nothing.

```json
{"version":1,"holed":false,"bounces":1,"path":[[3,8],[9,8],…,[4.301,8]],
 "air":"000…0","cause":"--b…-","rest":[4.3012…,8]}
```

#### `SimulateFrom(hole string, ballX, ballY float64, shot string, stroke int, period int64) string`

One shot from an exact ball, with every input given: `shot` is
`"angle,power,tick"`, `stroke` the stroke number it would be (0 to 59; timed
and pulse holes change with it), `period` the weather (not one still to come).
It's exactly what `PlayRoundAt` would play for that stroke, for one shot's
gas. Unlike the other previews it takes an old period too, to replay a stroke
of an old round. Its JSON is `Simulate`'s.

#### `SimulateRound(hole, shots string) string`

#### `SimulateRoundAt(hole, shots string, period int64) string`

Replay a shot list **from the tee**, read-only (stroke numbers, ticks and the
period's weather included), and return the last shot. They stop at the first
holed shot. `SimulateRound` uses `Period()`; `SimulateRoundAt` takes the
current period or the one before, as a round's first stroke does. They refuse
the lists `PlayRoundAt` would refuse (too many shots, too much work).

```json
{"version":1,"holed":false,"strokes":2,"bounces":0,"period":5920000,
 "path":[…],"air":"00…0","cause":"-…-","rest":[…]}
```

#### `SimulateCommit(hole string, ballX, ballY float64, stroke int, shots string, period int64) string`

One commit of a round under way, read-only: the shots the next `PlayRoundAt`
or `PlayRoundPro` would take, from the exact ball (`rest`) at stroke number
`stroke`, in the weather of `period`. It refuses what that commit would refuse
(too much work, past 60 strokes, a weather over: at stroke 0 the current
period or the one before, later a period not two behind), so a client can
check every commit of a long round before it signs any. Its JSON is `SimulateRound`'s, and `strokes` is the
round's count after the commit.

Use `SimulateCommit` or `SimulateFrom` after the first stroke, from the `rest`
the previous answer gave. Positions in paths are rounded to three decimals, and
after a bounce or two a rounding error is a different ball.

#### `Rounds(hole, after string, limit int) string`

A page of every round on a hole, as `State` lists them (no path). Paged like
`Records`.

### Records and rankings

Only players with a gno.land name (`r/sys/users`) enter the boards and the
course ranking: an address is free, a name is not, so a script can't fill the
boards with a thousand accounts. Every finish is still kept, named or not. A
player who takes a name later ranks at their next finish, and `Bests`,
`Standings`, `Records` and `Players` read anyone.

The course ranking adds up each player's best on each **current course hole**:
most holes first, then fewest strokes. It's kept in order as rounds finish, so
reading it doesn't get slower as more people play.

#### `Leaderboard(mode string) string`

A mode's course-wide top ten.

```json
{"version":1,"mode":"assisted","holes":74,"rows":[{"player":"g1…","holes":18,"strokes":61}, …]}
```

`holes` at the top is the number of slots in the course. A name deleted since
is skipped.

#### `Rank(mode string, player address) string`

A player's place in a mode's course ranking.

```json
{"version":1,"mode":"pro","player":"g1…","rank":7,"of":213,"holes":18,"strokes":64}
```

`rank` 1 is the top, out of `of` ranked players. It's 0 for a player the
ranking doesn't hold (unnamed, or no current course hole finished); `holes`
and `strokes` are still their standing. A ranked name deleted since keeps its
place until its next change, so a rank can be that many too low.

#### `HoleLeaderboard(hole, mode string, offset, limit int) string`

A page of one hole's board: each named player's best there, fewest strokes
first, from rank `offset+1` (clamped to 0..players), at most `limit` rows
(clamped to 1..100).

```json
{"version":1,"hole":"garden/3/v1","mode":"assisted","par":3,"players":57,"finished":80,
 "offset":0,"rows":[{"player":"g1…","strokes":2}, …],"next":10}
```

`players` is how many named players the board holds, `finished` how many
players finished the hole, named or not. `next` is the offset of the next page,
0 once there is none. A name deleted since is skipped, so a page can hold
fewer rows than it covers.

#### `Bests(hole, mode, players string) string`

The best finished round on one hole of each of the given players
(comma-separated addresses, named or not; at most 50, repeats and junk
skipped): a board of friends, where no stranger can push anyone off.

```json
{"version":1,"hole":"garden/3/v1","mode":"assisted","par":3,"rows":[{"player":"g1…","strokes":3}, …]}
```

#### `Standings(mode, players string) string`

Each given player's course-wide standing, with the same list rules as
`Bests`.

```json
{"version":1,"mode":"assisted","holes":74,"rows":[{"player":"g1…","holes":12,"strokes":40}, …]}
```

#### `BestOf(hole, mode string, player address) int` and `StandingOf(mode string, player address) (int, int)`

The same as plain values: a player's best on a hole (0 if none), and their
holes and strokes over the current course (0, 0 if none).

#### `Records(hole, mode, after string, limit int) string`

A page of every player's best on a hole, named or not.

```json
{"version":1,"hole":"garden/3/v1","mode":"assisted","rows":[{"player":"g1…","strokes":3}, …],"next":"g1…"}
```

`Records`, `Players`, `Rounds` and `Community` walk everything by key, so
anyone (an indexer, a successor realm carrying the records over) can read all
of it a page at a time: `after` is the last key of the page before (`""` for
the first), `limit` is clamped to 1..100, and `next` is the `after` of the next
page (`""` once there is none).

#### `Players(mode, after string, limit int) string`

A page of every course standing in a mode, named or not.

```json
{"version":1,"mode":"assisted","rows":[{"player":"g1…","holes":12,"strokes":40}, …],"next":""}
```

### The owner

#### `Owner() address` and `Pending() address`

The owner, `""` once renounced, and the address a `Transfer` offered the role
to, `""` if none.

## `Render(path string) string`

The gnoweb page, a second client that plays the same physics. `<hole>` is a
version's id or an alias.

| path | page |
|---|---|
| `""` | the hub: how to play, a card per cup (to its page), both leaderboards (by name), the community holes (with their authors), at most 20 archived course holes, and who can change what (folded) |
| `<world>` | a cup: its holes by number (par, best, shots played, data link) |
| `<address>` | the holes that address published, as their current versions |
| `<hole>` | the hole as a text board, its weather, a `Launch` form, a `Reset` form, and its best rounds per mode |
| `<hole>/<address>` | the same, drawn for that player's next stroke (on timed holes) and with their ball marked |
| `<hole>/data` | a version's provenance, every version of its alias, and its data in hex |

On gnoweb that's `/r/gnogolf/golf`, `/r/gnogolf/golf:garden`,
`/r/gnogolf/golf:g1…`, `/r/gnogolf/golf:garden/3`,
`/r/gnogolf/golf:garden/3/v1/g1…` and `/r/gnogolf/golf:garden/3/v1/data`:
every segment of gnoweb's breadcrumb leads somewhere. A query string
(`?ref=…`) is ignored. A course hole's page names its cup; a community hole's
page names its author, never a cup, whatever world its data says. A board
whose drawing would cost more than about 0.6e9 gas says "too detailed to draw
here" and links the 3D game instead (none of the course's comes near: the
heaviest is a seventh of that). Once a successor is set, every page opens
with a "This course has moved" banner.

Every link golf prints follows its own path, so the same code serves under any
namespace.

## The work budget

A commit's gas is mostly the physics, and a heavy hole can't replay 12 full
shots in one transaction. The physics counts what a stroke does as it goes,
`Shot.Work`: its substeps, moves, the walls and posts each move is swept
against and tested, and the zones and polygon points it looks at, in units of
about a thousand gas; and it ends a stroke once that reaches
`physics.MaxWork` (1e6), so no hole, however hostile, has a shot a
transaction can't finish. A commit's estimate of its work is, per shot,
`10M + 150K × walls + 1100 × Shot.Work` (walls: the hole's and its pulses').
Fitted on the 592 full-power shots of the 74 course holes (the most any took
of its estimate is 0.72; the heaviest measured 45M) and on hostile probes at
the format's limits (bumper walls across the whole board, the steepest hill
rolling a ball on for all its extra substeps, 512 polygon points, loops and
capped wind under every move: 0.92 at the most).

A hole's heaviest shot is bounded: `shotBound = 10M + 150K × walls + 1100 ×
(MaxWork + MaxWorkStep)`, 1.22e9 to 1.24e9 for the course holes. A hole whose
bound passes 1.3e9 is refused when it is published, and before the first
shot of a commit the bound must fit the 1.4e9 budget. Before each later shot,
a commit that would pass 1.4e9 with one more shot as heavy as its heaviest so
far is refused:
`golf: more shots than one transaction can replay on this hole: commit the
first N, then the rest`. `SimulateRound*` and `SimulateCommit` refuse the same
list the same way, so a client learns it before it signs. The rest of the 2e9
a wallet lets a transaction simulate is left for the forecast, decoding a data
hole, the package loads and the bookkeeping. The heaviest single shot the
probes found (`z_worst_shot_filetest`) is a Launch of 0.92e9, the hole's
decoding and forecast included.

## Gas and storage

Measured on the course holes; treat them as orders of magnitude:

- **Decoding a data hole** happens on every call. It measured 3.8M to 11.6M
  gas on its own, and a data hole's call costs 95–99% of the same hole held
  as a stored object. On a local node, decoding plus one full-power shot came
  to about 45–47M on the heaviest holes. A hole at every limit of the format
  decodes in about 71M.
- **Publishing** is where the checks land: on the two heaviest holes, decoding
  the hex argument measured 32–45M and the length check (`course.Exact`)
  21–36M, once per version.
- **Storage**: the first publish into a fresh realm stores about 17 KB (the
  data, its entry, and the first leaf of each index it opens). A later one
  stores the data (1–3 KB for the course holes) and about 3.2 KB more (its
  entry and index keys): nothing for rounds or records until someone plays.
  A version's own trees (rounds, bests, board) are B+ trees with leaves of 16,
  made at their first stroke or finish: the first finisher on a version pays
  their first leaves (about 17 KB with the round and the standing, measured
  in a filetest), a later player's first finish about 3.2 KB (1.9 KB on a
  further hole), at 50 players. The first stroke of a round stores about
  1.5 KB, a replay after `Reset` nothing. The decoded hole is never stored.
- **Reads** are free as queries, within the node's query gas limit.

## Updating after the deploy

Nothing on gno.land is edited in place: a published package is frozen at its
path. An update is a new package at a new path, and the rules below keep every
score honest through it.

- **The physics never changes under a hole.** A hole plays on the physics
  golf imports, which is frozen, so scores stay comparable forever. A new physics goes to a new path
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
- **The hub itself** is replaced by a new realm (a sibling path, such as
  `r/gnogolf/golf2`), which can read the v1's public state (`Holes`,
  `Versions`, `HoleData`, `BestOf`, `StandingOf`, `Records`, `Players`) and
  carry it over or show it as history. The v1's owner then calls
  `SetSuccessor` once: every v1 page says where the course went, and v1 goes
  on playing.
- **The dapp** (the web client) is not on-chain and can be updated at any time.
  It lists the current holes (`"next"` is empty in `Holes()`) and links the
  archived ones.
