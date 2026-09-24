package golf

import (
	"strconv"
	"strings"
	"testing"

	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
	"gno.land/p/nt/testutils/v0"
	"gno.land/p/nt/uassert/v0"
	"gno.land/p/nt/ufmt/v0"
	"gno.land/p/nt/urequire/v0"
	"gno.land/r/sys/users"
)

// flat is a hole with nothing in it but its walls — enough to exercise golf
// without depending on a real course.
type flat struct{ course.Marks }

var flatField = &physics.Field{
	Walls:    physics.Box(physics.Vec2{X: 0, Y: 0}, physics.Vec2{X: 32, Y: 16}),
	Friction: 0.8,
	Bounce:   0.9,
}

func (h *flat) Name() string          { return "Flat" }
func (h *flat) Start() physics.Vec2   { return physics.Vec2{X: 2, Y: 8} }
func (h *flat) Cup() physics.Vec2     { return physics.Vec2{X: 20, Y: 8} }
func (h *flat) Field() *physics.Field { return flatField }

func (h *flat) Preview(ball physics.Vec2, angle, power float64) (physics.Shot, bool) {
	shot := flatField.Step(ball, physics.FromPolar(angle, power), 14)
	return shot, shot.Rest().Sub(h.Cup()).Len() <= 1.5
}

func (h *flat) Play(ball physics.Vec2, angle, power float64) (physics.Shot, bool) {
	shot, holed := h.Preview(ball, angle, power)
	h.Mark(shot.Rest())
	return shot, holed
}

var player = testutils.TestAddress("user")

// giveName registers a gno.land name for addr in r/sys/users, as its
// controller does on a dev chain: the rankings take named players only, and
// the tests go through the real lookup. Registering twice is a no-op.
func giveName(cur realm, addr address, name string) {
	if !users.ResolveAddress(addr).IsDeleted() {
		return
	}
	testing.SetRealm(testing.NewCodeRealm("gno.land/r/sys/users/init"))
	if err := users.RegisterUser(cross(cur), name, addr); err != nil {
		panic(err.Error())
	}
}

// course registers a flat hole as one of the course's own, under r/gnogolf/.
func courseHole(cur realm, name string) string {
	id := "gno.land/r/gnogolf/" + name
	testing.SetRealm(testing.NewCodeRealm(id))
	Register(cross(cur), &flat{})
	return id
}

// register deploys a flat hole as gno.land/r/test/<name> and returns its id.
func register(cur realm, name string) string {
	id := "gno.land/r/test/" + name
	testing.SetRealm(testing.NewCodeRealm(id))
	Register(cross(cur), &flat{})
	return id
}

func TestRegisterNeedsARealm(cur realm, t *testing.T) {
	testing.SetRealm(testing.NewUserRealm(player))
	urequire.AbortsContains(t, cur, "a hole registers itself", func() {
		Register(cross(cur), &flat{})
	})
}

// The id is the caller's pkgpath: a realm registers once, and cannot register
// under anybody else's name.
func TestRegisterIsKeyedByPkgpath(cur realm, t *testing.T) {
	id := register(cur, "dup")
	uassert.Equal(t, id, mustHole(id).id)
	urequire.AbortsContains(t, cur, "already registered", func() {
		Register(cross(cur), &flat{})
	})
}

// A hole nested under another hole's path must not leak its rounds into it.
func TestNestedPathsKeepTheirOwnRounds(cur realm, t *testing.T) {
	outer := register(cur, "nest")
	inner := register(cur, "nest/inner")
	testing.SetRealm(testing.NewUserRealm(player))
	Launch(cross(cur), inner, 0, 1)
	n := 0
	eachRound(mustHole(outer), roundsShown, func(string, *round) { n++ })
	uassert.Equal(t, 0, n)
}

// TestPreviewMatchesPlay pins the invariant the whole client model rests on: a
// shot resolved by the free query and the same shot committed must land in the
// same place, or players animate something that did not happen.
func TestPreviewMatchesPlay(cur realm, t *testing.T) {
	h := &flat{}
	ball := physics.Vec2{X: 2, Y: 8}

	preview, previewHoled := h.Preview(ball, 0.3, 5)
	played, playedHoled := h.Play(ball, 0.3, 5)

	uassert.Equal(t, preview.Rest().X, played.Rest().X)
	uassert.Equal(t, preview.Rest().Y, played.Rest().Y)
	uassert.Equal(t, len(preview.Path), len(played.Path))
	uassert.Equal(t, previewHoled, playedHoled)
}

func TestRoundCountsStrokesAndFinishes(cur realm, t *testing.T) {
	count := register(cur, "count")
	testing.SetRealm(testing.NewUserRealm(player))

	// two soft shots: 9 units short of the cup, so the round is still open
	Launch(cross(cur), count, 0, 1)
	Launch(cross(cur), count, 0, 1)

	r := roundOf(mustHole(count), player)
	uassert.Equal(t, 2, r.strokes)
	uassert.False(t, r.done)
	uassert.True(t, strings.Contains(Round(count, player), `"path":[[`), "a shot must leave a path to animate: "+Round(count, player))

	// straight at the cup from the tee, 18 units away
	testing.SetRealm(testing.NewUserRealm(player))
	Reset(cross(cur), count)
	testing.SetRealm(testing.NewUserRealm(player))
	Launch(cross(cur), count, 0, 4)

	r = roundOf(mustHole(count), player)
	uassert.True(t, r.done, "a 4-power shot down the line should hole out")
	uassert.Equal(t, 1, mustHole(count).best[pro])
}

// TestPlayRoundEqualsTheSameShotsOneByOne is what makes committing a whole hole
// safe: the replay is not a shortcut, it is the same strokes.
func TestPlayRoundEqualsTheSameShotsOneByOne(cur realm, t *testing.T) {
	batch := register(cur, "batch")
	single := register(cur, "single")

	testing.SetRealm(testing.NewUserRealm(player))
	PlayRound(cross(cur), batch, "10,2 ; -20,3")

	testing.SetRealm(testing.NewUserRealm(player))
	Launch(cross(cur), single, 10, 2)
	testing.SetRealm(testing.NewUserRealm(player))
	Launch(cross(cur), single, -20, 3)

	a := roundOf(mustHole(batch), player)
	b := roundOf(mustHole(single), player)
	uassert.Equal(t, a.strokes, b.strokes)
	uassert.Equal(t, a.bx, b.bx)
	uassert.Equal(t, a.by, b.by)
}

func TestPlayRoundRejectsGarbage(cur realm, t *testing.T) {
	junk := register(cur, "junk")
	testing.SetRealm(testing.NewUserRealm(player))
	urequire.AbortsContains(t, cur, "angle,power", func() {
		PlayRound(cross(cur), junk, "straight and hard")
	})
}

func TestPowerIsBounded(cur realm, t *testing.T) {
	power := register(cur, "power")
	testing.SetRealm(testing.NewUserRealm(player))
	urequire.AbortsContains(t, cur, "a shot is", func() {
		Launch(cross(cur), power, 0, 99)
	})
}

// SimulateRound is what the client animates; PlayRound is what gets recorded.
// If they disagree, a player watches one round and signs another.
func TestSimulateRoundEqualsPlayRound(cur realm, t *testing.T) {
	id := register(cur, "mirror")
	shots := "10,2 ; -20,3 ; 5,4"
	preview := SimulateRound(id, shots)

	testing.SetRealm(testing.NewUserRealm(player))
	PlayRound(cross(cur), id, shots)
	r := roundOf(mustHole(id), player)

	want := ufmt.Sprintf(`"strokes":%d`, r.strokes)
	uassert.True(t, strings.Contains(preview, want), preview)
	uassert.True(t, strings.Contains(preview, `"rest":`+jexact(r.ball())+"}"), "same resting point, exactly: "+preview)
	// and the path Round replays is the one the preview showed
	path := func(s string) string { return s[strings.Index(s, `"path"`):strings.Index(s, `,"cause"`)] }
	uassert.Equal(t, path(preview), path(Round(id, player)))
}

// A hole's name is author-controlled; whatever it holds, the JSON must parse.
func TestJstrEscapesControlCharacters(t *testing.T) {
	uassert.Equal(t, `"a\u000db\u0001\"c\\"`, jstr("a\rb\x01\"c\\"))
}

// NaN and infinities pass every comparison; they must be refused by name, or
// one shot stores a NaN ball that every client of the hole then receives.
func TestPoisonShotsAreRefused(cur realm, t *testing.T) {
	id := register(cur, "poison")
	testing.SetRealm(testing.NewUserRealm(player))
	urequire.AbortsContains(t, cur, "a shot is", func() {
		PlayRound(cross(cur), id, "0,NaN")
	})
	testing.SetRealm(testing.NewUserRealm(player))
	urequire.AbortsContains(t, cur, "a shot is", func() {
		PlayRound(cross(cur), id, "Inf,5")
	})
}

// A name is frozen at registration and kept to one line of plain text.
func TestNamesAreCleaned(cur realm, t *testing.T) {
	uassert.Equal(t, "Fake  row", cleanName("Fake |\n| row"))
	uassert.Equal(t, "Untitled hole", cleanName("\x01\x02"))
	uassert.Equal(t, "turning bladescript", cleanSkin("turning blade<script>")) // no tag survives
}

// timed is a flat hole with a wall across it on odd strokes only.
type timed struct{ flat }

var gate = physics.Bar(physics.Vec2{X: 10, Y: 0}, physics.Vec2{X: 10, Y: 16}, 0.8, 0, "")

func (h *timed) Varies() bool { return true }

func (h *timed) Extras(stroke int) ([]physics.Wall, []physics.Post) {
	if stroke%2 == 1 {
		return gate, nil
	}
	return nil, nil
}

func (h *timed) PreviewAt(ball physics.Vec2, angle, power float64, stroke int) (physics.Shot, bool) {
	ws, _ := h.Extras(stroke)
	f := course.WithExtras(flatField, ws, nil)
	shot := f.Step(ball, course.Launch(angle, power), 14)
	return shot, false
}

func (h *timed) PlayAt(ball physics.Vec2, angle, power float64, stroke int) (physics.Shot, bool) {
	return h.PreviewAt(ball, angle, power, stroke)
}

// A timed hole meets the same course in the preview and in the record, stroke
// by stroke, and the course depends on the player's own stroke count only.
func TestTimedHoleFollowsTheRoundsStrokes(cur realm, t *testing.T) {
	id := "gno.land/r/test/timed"
	testing.SetRealm(testing.NewCodeRealm(id))
	Register(cross(cur), &timed{})

	// stroke 0 is open: a soft shot rolls past x=10; stroke 1 meets the gate
	shots := "0,3 ; 0,3"
	preview := SimulateRound(id, shots)
	testing.SetRealm(testing.NewUserRealm(player))
	PlayRound(cross(cur), id, shots)
	r := roundOf(mustHole(id), player)
	uassert.True(t, strings.Contains(preview, `"rest":`+jexact(r.ball())+"}"), "preview and record differ: "+preview)

	testing.SetRealm(testing.NewUserRealm(player))
	Reset(cross(cur), id)
	testing.SetRealm(testing.NewUserRealm(player))
	Launch(cross(cur), id, 0, 9)
	uassert.True(t, roundOf(mustHole(id), player).bx > 10, "the first stroke must find the gate open")
	uassert.Equal(t, `{"version":1,"walls":[],"posts":[],"zones":[]}`, Extras(id, 0))
	uassert.True(t, strings.Contains(Extras(id, 1), `"a":[`), "stroke 1 has the gate")
}

func TestLeaderboardRanksFinishedRounds(cur realm, t *testing.T) {
	giveName(cur, player, "golfer")
	id := courseHole(cur, "board31")
	testing.SetRealm(testing.NewUserRealm(player))
	Launch(cross(cur), id, 0, 4) // holes out on the flat test hole
	lb := Leaderboard("pro")
	uassert.True(t, strings.Contains(lb, `"player":"`+player.String()+`"`), lb)
	uassert.True(t, strings.HasPrefix(lb, `{"version":1,"mode":"pro","holes":`), lb)
}

// A finish on anyone's hole keeps no standing and ranks nobody: no 0-hole
// rows in the top ten, and no totals row to inflate.
func TestAnyonesHoleRanksNobody(cur realm, t *testing.T) {
	loner := testutils.TestAddress("loner")
	giveName(cur, loner, "loner")
	id := register(cur, "anyones")
	testing.SetRealm(testing.NewUserRealm(loner))
	PlayRoundAt(cross(cur), id, "0,4", Period())
	uassert.True(t, mustHole(id).best[assisted] > 0, "the finish is kept")
	uassert.False(t, strings.Contains(Leaderboard("assisted"), loner.String()), "not on the course board")
	uassert.True(t, totals[assisted].Get(loner.String()) == nil, "no standing row")
	uassert.True(t, strings.Contains(HoleLeaderboard(id, "assisted", 0, 10), loner.String()), "on the hole's own board")
}

// A replay never erases a player's best, and the board reads its top ten.
func TestLeaderboardKeepsBests(cur realm, t *testing.T) {
	giveName(cur, player, "golfer")
	id := courseHole(cur, "keep32")
	testing.SetRealm(testing.NewUserRealm(player))
	Launch(cross(cur), id, 0, 4) // holes out
	testing.SetRealm(testing.NewUserRealm(player))
	Reset(cross(cur), id) // a replay, not finished
	lb := Leaderboard("pro")
	uassert.True(t, strings.Contains(lb, `"player":"`+player.String()+`"`), lb)
}

// An unknown mode is a mistake, not the assisted board.
func TestAnUnknownModeIsRefused(cur realm, t *testing.T) {
	id := register(cur, "modes")
	for _, read := range []func(){
		func() { Leaderboard("xyz") },
		func() { HoleLeaderboard(id, "Pro", 0, 10) },
		func() { Bests(id, "xyz", "") },
		func() { Standings("xyz", "") },
		func() { Records(id, "xyz", "", 10) },
		func() { Players("xyz", "", 10) },
	} {
		uassert.PanicsContains(t, cur, `a mode is "assisted" or "pro"`, read)
	}
	uassert.True(t, strings.Contains(Leaderboard(""), `"mode":"assisted"`), `"" is assisted`)
}

func TestMarksCannotEscapeTheBoard(cur realm, t *testing.T) {
	uassert.Equal(t, '#', mark('`', '#'))
	uassert.Equal(t, '#', mark('\n', '#'))
	uassert.Equal(t, '~', mark('~', '#'))
}

// an island hole placed first in its world
type islet struct{ flat }

func (h *islet) WorldName() string { return "island" }
func (h *islet) Position() float64 { return 1 }

// Holes lists world by world, then by order within one, and says which.
func TestHolesAreListedWorldByWorld(cur realm, t *testing.T) {
	id := "gno.land/r/test/islet9"
	testing.SetRealm(testing.NewCodeRealm(id))
	Register(cross(cur), &islet{})
	garden := register(cur, "zgarden3")
	list := Holes()
	gi, ii := strings.Index(list, `"id":"`+garden+`"`), strings.Index(list, `"id":"`+id+`"`)
	uassert.True(t, gi >= 0 && ii > gi, "the garden comes before the island")
	uassert.True(t, strings.Contains(list, `"world":"island","order":1.000`), "the island hole says where it is")
	uassert.True(t, strings.Contains(State(id), `"world":"island"`), "State says the world too")
	uassert.True(t, strings.Contains(Render(""), "## Community holes"), "anyone's holes have their own section")
	uassert.True(t, strings.Contains(list, `"id":"`+id+`","name":"Flat","official":false`), "Holes says it is not the course's")
	testing.SetRealm(testing.NewCodeRealm("gno.land/r/gnogolf/islet4"))
	Register(cross(cur), &islet{})
	hub := Render("")
	uassert.True(t, strings.Contains(hub, "## Island Cup"), "the course has a table per cup")
	uassert.True(t, strings.Index(hub, "## Island Cup") < strings.Index(hub, "## Community holes"), "the course first")
}

// a real course.Simple, so it plays in the weather
var windy = &course.Simple{
	World: "island", Title: "Windy", Tee: physics.V(2, 8), Pin: physics.V(40, 8), Substeps: 20, CupRadius: 1,
	Course: &physics.Field{Walls: physics.Box(physics.V(0, 0), physics.V(44, 16)), Friction: 0.9, Radius: 0.5},
}

// The weather is a function of (hole, period): the same for everyone, it
// changes the shot, and a recorded round cannot pick an old one.
func TestWeatherOfTheMoment(cur realm, t *testing.T) {
	id := "gno.land/r/test/windy"
	testing.SetRealm(testing.NewCodeRealm(id))
	Register(cross(cur), windy)

	uassert.Equal(t, Weather(id, 7), Weather(id, 7))
	// find a windy period and a clear one
	windyAt, clearAt := int64(-1), int64(-1)
	for p := int64(0); p < 400 && (windyAt < 0 || clearAt < 0); p++ {
		w := Weather(id, p)
		if windyAt < 0 && strings.Contains(w, `"kind":"wind"`) {
			windyAt = p
		}
		if clearAt < 0 && strings.Contains(w, `"kind":""`) {
			clearAt = p
		}
	}
	uassert.True(t, windyAt >= 0 && clearAt >= 0, "an island has windy and clear spells")
	calm, blown := SimulateRoundAt(id, "0,4", clearAt), SimulateRoundAt(id, "0,4", windyAt)
	uassert.True(t, calm[strings.Index(calm, `"path"`):] != blown[strings.Index(blown, `"path"`):], "the wind moves the ball")

	testing.SetRealm(testing.NewUserRealm(player))
	uassert.AbortsContains(t, cur, "not the current weather", func() { PlayRoundAt(cross(cur), id, "0,4", Period()-2) })
	PlayRoundAt(cross(cur), id, "0,4", Period())
	uassert.True(t, strings.Contains(Round(id, player), ufmt.Sprintf(`"period":%d`, Period())), "the round says its weather")
	uassert.AbortsContains(t, cur, "is being played in the weather", func() { PlayRoundAt(cross(cur), id, "0,2", Period()-1) })
	uassert.True(t, strings.Contains(State(id), `"weather":{"period":`), "State gives the weather of the moment")
}

// a gate that swings across the lane within each stroke
var swing = &course.Simple{
	Title: "Swing", Tee: physics.V(2, 3), Pin: physics.V(26, 3), Substeps: 20, CupRadius: 1,
	Course: &physics.Field{
		Walls:    physics.Walls(physics.Box(physics.V(0, 0), physics.V(30, 6)), physics.Timed(physics.Bar(physics.V(10, 0), physics.V(10, 6), 0.5, '=', "gate"), 8, 4, 0)),
		Friction: 0.95,
		Radius:   0.5,
	},
}

// The third field of a shot is the player's timing: it decides whether the
// gate is there, replays the same, and is kept with the round.
func TestTimingIsPartOfTheShot(cur realm, t *testing.T) {
	id := "gno.land/r/test/swing"
	testing.SetRealm(testing.NewCodeRealm(id))
	Register(cross(cur), swing)
	p := Period()
	past := 0
	for tick := 0; tick < 8; tick++ {
		out := SimulateRoundAt(id, ufmt.Sprintf("0,5,%d", tick), p)
		if !strings.Contains(out, `"path":[[2.000,3.000],[5.000`) {
			continue
		}
		last := out[strings.LastIndex(out, "[")+1:]
		if x, _ := strconv.ParseFloat(last[:strings.Index(last, ",")], 64); x > 10 {
			past++
		}
	}
	uassert.True(t, past > 0 && past < 8, "some timings get past the gate, some do not")
	uassert.Equal(t, SimulateRoundAt(id, "0,5", p), SimulateRoundAt(id, "0,5,0", p), "no tick is tick 0")
	uassert.Equal(t, SimulateRoundAt(id, "0,5,2000", p), SimulateRoundAt(id, "0,5,1023", p), "the tick is clamped")

	testing.SetRealm(testing.NewUserRealm(player))
	PlayRoundAt(cross(cur), id, "0,5,3", p)
	uassert.True(t, strings.Contains(Round(id, player), `"shots":"0.0000,5.0000,3"`), "the round keeps the timing")
}

// A newer course hole in the same place archives the old one: its records
// stay, its bests leave the course-wide standing, and it no longer ranks.
func TestNewerHoleTakesTheSlot(cur realm, t *testing.T) {
	old, next := "gno.land/r/gnogolf/slot_old7", "gno.land/r/gnogolf/slot_new7"
	testing.SetRealm(testing.NewCodeRealm(old))
	Register(cross(cur), &islet{})
	testing.SetRealm(testing.NewUserRealm(player))
	Launch(cross(cur), old, 0, 4) // holes out
	was := totals[pro].Get(player.String()).(*row).holes

	testing.SetRealm(testing.NewCodeRealm(next))
	Register(cross(cur), &islet{})
	uassert.Equal(t, next, mustHole(old).next)
	uassert.Equal(t, "", mustHole(next).next)
	uassert.Equal(t, was-1, totals[pro].Get(player.String()).(*row).holes)
	uassert.True(t, mustHole(old).best[pro] > 0, "the old hole keeps its record")

	// replaying the archived hole ranks nothing
	testing.SetRealm(testing.NewUserRealm(player))
	Reset(cross(cur), old)
	testing.SetRealm(testing.NewUserRealm(player))
	Launch(cross(cur), old, 0, 4)
	uassert.Equal(t, was-1, totals[pro].Get(player.String()).(*row).holes)
	uassert.True(t, strings.Contains(Holes(), `"next":"`+next+`"`), "Holes says where it went")
}

// A hole's board lists its named players' bests, fewest strokes first, a
// page at a time; players counts the board's rows, finished every finisher.
func TestHoleLeaderboardSortsBests(cur realm, t *testing.T) {
	id := register(cur, "holeboard")
	a, b, c := testutils.TestAddress("hba"), testutils.TestAddress("hbb"), testutils.TestAddress("hbc")
	giveName(cur, a, "hba")
	giveName(cur, b, "hbb")
	giveName(cur, c, "hbc")
	// three finishes, the worst first: 3 strokes, 2, then 1
	for i, p := range []address{c, b, a} {
		testing.SetRealm(testing.NewUserRealm(p))
		PlayRoundAt(cross(cur), id, strings.Repeat("0,0.001;", 2-i)+"0,4", Period())
	}
	testing.SetRealm(testing.NewUserRealm(stranger)) // unnamed: finished, not on the board
	PlayRoundAt(cross(cur), id, "0,4", Period())
	row := func(p address, n int) string { return ufmt.Sprintf(`{"player":"%s","strokes":%d}`, p.String(), n) }
	head := `{"version":1,"hole":"` + id + `","mode":"assisted","par":3,"players":3,"finished":4,`
	uassert.Equal(t, head+`"offset":0,"rows":[`+row(a, 1)+","+row(b, 2)+","+row(c, 3)+"]}", HoleLeaderboard(id, "assisted", 0, 10))
	// ten by ten: the second page starts where the first ended
	uassert.Equal(t, head+`"offset":1,"rows":[`+row(b, 2)+"]}", HoleLeaderboard(id, "assisted", 1, 1))
	uassert.Equal(t, head+`"offset":50,"rows":[]}`, HoleLeaderboard(id, "assisted", 50, 10))

	// c improves to 1: its old row goes, the new one sorts by address among the 1s
	testing.SetRealm(testing.NewUserRealm(c))
	Reset(cross(cur), id)
	testing.SetRealm(testing.NewUserRealm(c))
	PlayRoundAt(cross(cur), id, "0,4", Period())
	lb := HoleLeaderboard(id, "assisted", 0, 10)
	uassert.Equal(t, 1, strings.Count(lb, c.String()), lb)
	uassert.True(t, strings.Index(lb, row(c, 1)) < strings.Index(lb, row(b, 2)), lb)
}

// A pro round counts on the pro records only, and a round keeps its mode.
// (Launch plays pro; the assisted board is PlayRoundAt's.)
func TestProRoundsRankApart(cur realm, t *testing.T) {
	giveName(cur, player, "golfer")
	id := register(cur, "promode")
	testing.SetRealm(testing.NewUserRealm(player))
	PlayRoundPro(cross(cur), id, "0,4", Period())
	e := mustHole(id)
	uassert.True(t, e.best[pro] > 0, "the pro record is set")
	uassert.Equal(t, 0, e.best[assisted])
	uassert.True(t, strings.Contains(HoleLeaderboard(id, "pro", 0, 10), player.String()), "on the pro board")
	uassert.False(t, strings.Contains(HoleLeaderboard(id, "assisted", 0, 10), player.String()), "not on the assisted one")

	testing.SetRealm(testing.NewUserRealm(player))
	Reset(cross(cur), id)
	testing.SetRealm(testing.NewUserRealm(player))
	PlayRoundPro(cross(cur), id, "0,1", Period()) // not holed: the round is under way
	testing.SetRealm(testing.NewUserRealm(player))
	urequire.AbortsContains(t, cur, "pro mode", func() {
		PlayRoundAt(cross(cur), id, "0,1", Period())
	})
}

// stranger never takes a gno.land name.
var stranger = testutils.TestAddress("stranger")

// An unnamed player's finish is kept, and friends see it, but no ranking
// lists them.
func TestOnlyNamedPlayersRank(cur realm, t *testing.T) {
	id := courseHole(cur, "names33")
	testing.SetRealm(testing.NewUserRealm(stranger))
	PlayRoundAt(cross(cur), id, "0,4", Period())
	uassert.True(t, mustHole(id).best[assisted] > 0, "the finish is kept")
	uassert.False(t, strings.Contains(HoleLeaderboard(id, "assisted", 0, 100), stranger.String()), "not on the hole's board")
	uassert.False(t, strings.Contains(Leaderboard("assisted"), stranger.String()), "not on the course's board")
	uassert.True(t, strings.Contains(Bests(id, "assisted", " g1nobody, "+stranger.String()), `"player":"`+stranger.String()+`"`), "friends see it")
	uassert.True(t, strings.Contains(Standings("assisted", stranger.String()), stranger.String()), "and its standing")
}
