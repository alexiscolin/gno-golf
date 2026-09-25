# `gno.land/r/gnogolf/golf`

The game realm. It keeps a registry of holes, every player's round on each
hole, and a leaderboard. It routes shots to holes. It knows nothing about any
particular course: a hole is a realm that registered itself, and `golf` only
understands it through [`course.Hole`](course.md).

There's no administrator: no owner, no pause, no upgrade, no delisting. Every
write is open to anyone.

For how a client calls all this (the `vm/qeval` query, the double unwrap,
animating a path, the rules a client must follow), see
[CLIENT.md](../CLIENT.md). This page is the API reference.

## Units and formats

- **Angle**: degrees, 0 = +X, 90 = +Y (down). `golf` turns it into radians.
  Before use it goes through `math.Mod(angle, 360)`, so a negative angle stays
  negative, even though the code comment says `[0, 360)`. Both work the same
  in the physics.
- **Power**: above 0 and at most 10. NaN, infinities and anything out of
  range panic.
- **Shot list**: `"angle,power;angle,power;…"`, and each shot can have a
  third field, `"angle,power,tick"`. The tick is where the timed pieces were
  when the player let go. It's clamped to `0..1023`, and a missing tick is 0.
  A string is used because `MsgCall` can't carry a slice. At most 12 shots
  per call (`maxShots`), and empty entries are skipped.
- **Numbers in JSON** are printed with `%.3f`. NaN and Inf are printed as `0`.
  A vector is `[x,y]`.
- **Strings** that come from a hole author (names, skins) are escaped. Skins
  are cut down to `[a-z0-9 _-]`, at most 24 bytes. Names are at most 40 runes,
  with no control characters and none of ``|[]<>`*_#\``, and fall back to
  `"Untitled hole"`.
- **Hole id**: the pkgpath of the realm that registered it, for example
  `gno.land/r/gnogolf/hole3`.

## Writes

### `Register(cur realm, h course.Hole)`

Called by a hole realm from its own crossing function, never by a user
(`MsgCall` can't build a `course.Hole`):

```go
func Register(cur realm) { golf.Register(cross(cur), me) }
```

The id is `cur.Previous().PkgPath()`. It panics if the caller has no pkgpath,
if the path doesn't start with `gno.land/r/` (so a `MsgRun` can't register a
hole), if the id is already registered, or if `h` is nil. The name, world and
order are read **once**, here, and kept, so listing holes never calls into
hole code. Emits `hole_registered` with `id`.

(CLIENT.md shows an older form with an `id` argument. The code takes no id.)

### `Launch(cur realm, hole string, angle, power float64) string`

One shot, one transaction, with tick 0. Returns `"holed in N strokes"` or
`"ball at X.X,Y.Y after N strokes"`. The first stroke of a round fixes the
round's weather period to `Period()`.

### `PlayRound(cur realm, hole string, shots string) string`

### `PlayRoundAt(cur realm, hole string, shots string, period int64) string`

Commits several shots in one transaction by replaying them. The client sends
decisions, never outcomes. They **continue the caller's round from where it
is**. They don't start from the tee, so to record what `SimulateRound`
showed, send `Reset` and `PlayRoundAt` in the same transaction (the web client
does this through Adena).

- On a round's first stroke, the period has to be the current one or the one
  before, or it panics. `PlayRound` passes `Period()`.
- On a round that's already under way, the period has to equal the round's
  own period, or it panics.
- It stops at the shot that holes the ball. Returns `"holed in N strokes"` or
  `"K shots replayed, ball at X.X,Y.Y after N strokes"`. It panics on an empty
  list.

### `Reset(cur realm, hole string)`

Puts the caller's ball back on the tee with a fresh round (no strokes, no
period). Their best score on the hole is kept.

A finished round (`done`) can't be played again until it's `Reset`.

### Events

| Event | Keys |
|---|---|
| `hole_registered` | `id` |
| `shot` | `hole`, `player`, `strokes` |
| `holed` | `hole`, `player`, `strokes` |

## Reads

These are all free as `vm/qeval` queries and return JSON strings. An unknown
hole panics with `golf: unknown hole: <id>`.

### `Holes() string`

The registered holes in course order (world by world, then by order), at most
120.

```json
[{"id":"gno.land/r/gnogolf/hole1","name":"The Shelf","by":"gno.land/r/gnogolf/hole1",
  "plays":12,"best":3,"par":3,"world":"garden","order":1.000}, …]
```

`best` is the fewest strokes anyone has holed it in, or 0 if nobody has.

### `State(hole string) string`

Everything needed to draw the hole.

```json
{"hole":"…","name":"…","by":"…",
 "board":{"w":50,"h":15},"par":3,"world":"garden","order":1.000,
 "timed":false,
 "period":5920000,
 "weather":{"period":5920000,"kind":"wind","wind":[0.1,-0.04],"zones":[…]},
 "start":[5,6],"cup":[44,6],"plays":12,
 "walls":[{"a":[0,0],"b":[32,0],"skin":""},
          {"a":[…],"b":[…],"skin":"plank","every":8,"on":4,"phase":0}],
 "posts":[{"c":[12,6.3],"r":0.7,"skin":"stump"}],
 "zones":[{"kind":"surface","min":[…],"max":[…],"vec":[0,0],"scale":0.55,"round":false,"skin":"sand"},
          {"kind":"hazard","min":[0,0],"max":[50,18],"vec":[5,6],"scale":0,"round":false,
           "poly":[[…],…],"outside":true,"skin":"sea"}],
 "wear":{"w":16,"h":8,"cells":[0,0,1,…]},
 "roundsTotal":40,
 "rounds":[<round>, …]}
```

(The values are illustrative, not from one real hole.)

- `timed`: the hole implements `course.Timed` and `Varies()` is true. Read
  `Extras` for each stroke.
- `walls[].every/on/phase` only appear on timed walls. `zones[].poly` and
  `outside` only appear on polygon zones (at most 256 points are printed), and
  `zones[].every/on/phase` only on timed zones.
- `zones[].kind` is `surface`, `slope`, `tunnel`, `hazard` or `loop`. For what
  `vec` and `scale` mean for each kind, see [physics.md](physics.md#zone).
- `rounds` shows at most 24 rounds, in address order. `roundsTotal` is the
  real count. Use `Round` to get one player's round.
- `weather` is the forecast for the current period. See `Weather`.

### `<round>` (in `State` and `Round`)

```json
{"player":"g1…","ball":[26,0.04],"strokes":2,"done":false,"period":5920000,
 "shots":"12.0000,6.5000,0;350.0000,3.0000,4",
 "path":[[3,13],…],"air":"000110…0"}
```

`path` and `air` are the last shot's. `air` has one `0`/`1` per path point.
`shots` is the round as played, which is enough to replay it.

### `Round(hole string, player address) string`

One player's round, or `null`.

### `Simulate(hole string, ballX, ballY, angle, power float64) string`

What one shot from `(ballX, ballY)` would do, in the current weather, as
**stroke 0 with tick 0**. On a timed hole or with a timed tick, use
`SimulateRound` instead.

```json
{"holed":false,"bounces":1,"path":[[3,8],[9,8],…,[4.301,8]],"air":"000…0"}
```

### `SimulateRound(hole string, shots string) string`

### `SimulateRoundAt(hole string, shots string, period int64) string`

Replays a shot list **from the tee**, read-only (stroke numbers, ticks and
the given period's weather included), and returns the last shot. It stops at
the first holed shot. `SimulateRound` uses `Period()`. `SimulateRoundAt`
accepts any period.

```json
{"holed":false,"strokes":2,"bounces":0,"period":5920000,"path":[…],"air":"00…0"}
```

Use it rather than `Simulate` after the first stroke. Positions come back
rounded to three decimals, and replaying the decisions keeps the preview
identical to what `PlayRoundAt` will record.

### `Extras(hole string, stroke int) string`

What a timed hole adds at stroke N of a round (0 = first shot):

```json
{"walls":[…],"posts":[…],"zones":[…]}
```

All three lists are empty for a hole that isn't `course.Timed`, and for
`stroke < 0`. `zones` come from `course.Zoned`.

### `Leaderboard() string`

The top ten players across the course. For each player, their best finish on
each hole is added up. Most holes wins, then fewest strokes. It's updated
whenever a player improves a best, so reading it doesn't get slower as more
people play.

```json
{"holes":74,"rows":[{"player":"g1…","holes":18,"strokes":61}, …]}
```

`holes` at the top is the number of registered holes.

## Weather

```go
const PeriodSeconds = 5 * 60
func Period() int64                            // block time (Unix seconds) / PeriodSeconds
func Weather(hole string, period int64) string // the forecast for any period
```

The weather is `course.ForecastFor(id, world, h, period)` (see
[course.md](course.md#weather)), so it's the same for everyone, it's
different from hole to hole, and nobody chooses it. A round keeps the period
of its first stroke from start to finish.

```json
{"period":5920000,"kind":"storm","wind":[0.09,0.05],
 "zones":[{"kind":"surface",…,"skin":"storm"},{"kind":"surface",…,"skin":"rain"},
          {"kind":"slope",…,"every":6,"on":3,"phase":0,"skin":"wind"}, …]}
```

`kind` is `""` when it's clear, and `wind` is `[0,0]` unless the kind is wind
or storm.

## `Render(path string) string`

The gnoweb page, a second client that plays the same physics:

| path | page |
|---|---|
| `""` | the hub: a table of holes per world (par, best, shots played, source link), the leaderboard, and a note that there's no admin |
| `<hole id>` | the hole as a text board, a `Launch` form, a `Reset` form, and its rounds |
| `<hole id>/<address>` | the same, drawn for that player's next stroke (on timed holes) and with their ball marked |

On gnoweb that's `/r/gnogolf/golf`, `/r/gnogolf/golf:gno.land/r/gnogolf/hole3`,
and `/r/gnogolf/golf:gno.land/r/gnogolf/hole3/g1…`.

## Gas and limits

Measured on a local node, on earlier versions of the holes:

- a `Simulate` preview takes about 44 ms and 0 gas;
- a committed shot costs about 0.02 to 0.03 GNOT at the price floor;
- one `PlayRound` of five shots used 49.9M gas, against 114.6M for five
  `Launch` calls.

`maxShots = 12` bounds one commit. The code comment puts a full-power shot on
the maze at about 150M VM gas.
