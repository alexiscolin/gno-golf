package golf

import (
	"encoding/hex"
	"math"
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

// flatHole is a box with nothing in it but its walls, the cup 18 units from
// the tee: enough to exercise golf without depending on a real course.
func flatHole(title string) *course.Simple {
	return &course.Simple{W: 32, H: 16, World: "garden", Title: title, Strokes: 3,
		Tee: physics.V(2, 8), Pin: physics.V(20, 8), Substeps: 14, CupRadius: 1.5, Shelter: 0.01,
		Course: &physics.Field{Walls: physics.Box(physics.V(0, 0), physics.V(32, 16)), Friction: 0.8, Bounce: 0.9}}
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

// cupHole is a small course hole: a box with the cup two units from the
// tee, so a soft "0,1" stops in it whatever the weather (sheltered from
// the wind), and "0,0.001" hardly moves.
func cupHole(world string, order int, title string) *course.Simple {
	return &course.Simple{W: 32, H: 16, World: world, Order: float64(order), Title: title, Strokes: 3,
		Tee: physics.V(2, 8), Pin: physics.V(4, 8), Substeps: 14, CupRadius: 1.2, Shelter: 0.01,
		Course: &physics.Field{Walls: physics.Box(physics.V(0, 0), physics.V(32, 16)), Friction: 0.8, Bounce: 0.9, Radius: 0.5}}
}

// hexOf is a hole as Publish takes it.
func hexOf(h *course.Simple) string { return hex.EncodeToString([]byte(course.Encode(h))) }

// publish puts h into its slot as the owner (deployer) and returns the
// version's id.
func publish(cur realm, h *course.Simple) string {
	setOwner(deployer)
	testing.SetRealm(testing.NewUserRealm(deployer))
	return Publish(cross(cur), h.World+"/"+strconv.Itoa(int(h.Order)), hexOf(h), "")
}

// courseHole publishes a small course hole in its own garden slot.
func courseHole(cur realm, order int) string {
	return publish(cur, cupHole("garden", order, "Cup "+strconv.Itoa(order)))
}

// roundIn is a player's round on a hole, made if they have none.
func roundIn(id string, p address) *round {
	e := mustHole(id)
	return roundOf(e, e.hole(), p)
}

// mine publishes h as the community hole <slug> of an author of its
// own, and returns its id.
func mine(cur realm, slug string, h *course.Simple) string {
	testing.SetRealm(testing.NewUserRealm(testutils.TestAddress("au" + slug)))
	return PublishMine(cross(cur), slug, hexOf(h), "")
}

// holeIt is a power that holes a flat hole from its tee, straight at the
// cup, and holeShot the same as a shot.
const (
	holeIt   = 7.0
	holeShot = "0,7"
)

// register publishes a flat community hole and returns its id.
func register(cur realm, slug string) string { return mine(cur, slug, flatHole("Flat")) }

// simAt is SimulateRoundAt in any period, old ones included: what the
// weather tests compare.
func simAt(id, shots string, period int64) string {
	e := readHole(id)
	h := e.hole()
	return simulateRound(e, h, h.Start(), 0, shots, period)
}

// TestPreviewMatchesPlay pins the invariant the whole client model rests on: a
// shot resolved by the free query and the same shot committed must land in the
// same place, or players animate something that did not happen.
func TestPreviewMatchesPlay(cur realm, t *testing.T) {
	id := register(cur, "mirror1")
	preview := Simulate(id, 2, 8, 17, 5)
	testing.SetRealm(testing.NewUserRealm(player))
	Launch(cross(cur), id, 17, 5)
	uassert.True(t, strings.HasSuffix(preview, `"rest":`+jexact(roundIn(id, player).ball())+"}"), preview)
}

func TestRoundCountsStrokesAndFinishes(cur realm, t *testing.T) {
	count := register(cur, "count")
	testing.SetRealm(testing.NewUserRealm(player))

	// two soft shots, well short of the cup, so the round is still open
	Launch(cross(cur), count, 0, 1)
	Launch(cross(cur), count, 0, 1)

	r := roundIn(count, player)
	uassert.Equal(t, 2, r.strokes)
	uassert.False(t, r.done)
	uassert.True(t, strings.Contains(Round(count, player), `"path":[[`), "a shot must leave a path to animate: "+Round(count, player))

	// straight at the cup from the tee, 18 units away
	testing.SetRealm(testing.NewUserRealm(player))
	Reset(cross(cur), count)
	testing.SetRealm(testing.NewUserRealm(player))
	Launch(cross(cur), count, 0, holeIt)

	r = roundIn(count, player)
	uassert.True(t, r.done, "a shot down the line should hole out")
	uassert.Equal(t, 1, mustHole(count).rec(pro).best)
}

// TestPlayRoundEqualsTheSameShotsOneByOne is what makes committing a whole hole
// safe: the replay is not a shortcut, it is the same strokes.
func TestPlayRoundEqualsTheSameShotsOneByOne(cur realm, t *testing.T) {
	// one hole, so one weather: two players, one commit and two strokes
	id := register(cur, "batch")
	other := testutils.TestAddress("single")

	testing.SetRealm(testing.NewUserRealm(player))
	PlayRoundPro(cross(cur), id, "10,2 ; -20,3", Period())

	testing.SetRealm(testing.NewUserRealm(other))
	Launch(cross(cur), id, 10, 2)
	testing.SetRealm(testing.NewUserRealm(other))
	Launch(cross(cur), id, -20, 3)

	a := roundIn(id, player)
	b := roundIn(id, other)
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
	r := roundIn(id, player)

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
	uassert.Equal(t, "Azwnj;B", cleanName("A&zwnj;B")) // no HTML entity: no hidden or turned-around text
	uassert.Equal(t, "rlm; note", cleanText("&rlm; note", maxNote))
	uassert.Equal(t, "turning bladescript", cleanSkin("turning blade<script>")) // no tag survives
	// nothing that looks blank, strikes through, mentions or mails
	uassert.Equal(t, "Untitled hole", cleanName(strings.Repeat("\u3164", 40)))
	uassert.Equal(t, "Untitled hole", cleanName("\u115f\u1160\uffa0\u2800 \u00ad\u034f\u2060\ufe0f\U000e0041"))
	uassert.Equal(t, "Untitled hole", cleanName("--- ..."))
	uassert.Equal(t, "Garden Cup", cleanName("~~Garden~~ Cup"))
	uassert.Equal(t, "g1abc x.y", cleanName("@g1abc x@.y"))
	uassert.Equal(t, "ab", cleanText("a\u0085\u2028b", maxNote))
	// format characters and nonspacing marks: Mongolian variation
	// selectors, interlinear annotation, musical formatting, shorthand
	// format controls, a stack of combining accents; a precomposed é stays
	uassert.Equal(t, "Untitled hole", cleanName("\u180b\u180c\u180d\u180f\ufff9\ufffa\ufffb\U0001d173\U0001d17a\U0001bca0\U0001bca3"))
	uassert.Equal(t, "Zalgo", cleanName("Z\u0301\u0302\u0303a\u0336lgo"))
	uassert.Equal(t, "Café Élysée", cleanName("Café Élysée"))
}

// timedHole is a flat hole with a gate across it on odd strokes only.
func timedHole() *course.Simple {
	h := flatHole("Timed")
	h.Pulses = []course.Pulse{{Every: 2, On: 1, Phase: 1, Walls: physics.Bar(physics.V(10, 0), physics.V(10, 16), 0.8, 0, "")}}
	return h
}

// A timed hole meets the same course in the preview and in the record, stroke
// by stroke, and the course depends on the player's own stroke count only.
func TestTimedHoleFollowsTheRoundsStrokes(cur realm, t *testing.T) {
	id := mine(cur, "timed", timedHole())

	// stroke 0 is open: a soft shot rolls past x=10; stroke 1 meets the gate
	shots := "0,3 ; 0,3"
	preview := SimulateRound(id, shots)
	testing.SetRealm(testing.NewUserRealm(player))
	PlayRound(cross(cur), id, shots)
	r := roundIn(id, player)
	uassert.True(t, strings.Contains(preview, `"rest":`+jexact(r.ball())+"}"), "preview and record differ: "+preview)

	testing.SetRealm(testing.NewUserRealm(player))
	Reset(cross(cur), id)
	testing.SetRealm(testing.NewUserRealm(player))
	Launch(cross(cur), id, 0, 9)
	uassert.True(t, roundIn(id, player).bx > 10, "the first stroke must find the gate open")
	uassert.Equal(t, `{"version":1,"walls":[],"posts":[],"zones":[]}`, Extras(id, 0))
	uassert.True(t, strings.Contains(Extras(id, 1), `"a":[`), "stroke 1 has the gate")
}

func TestLeaderboardRanksFinishedRounds(cur realm, t *testing.T) {
	giveName(cur, player, "golfer")
	id := courseHole(cur, 31)
	testing.SetRealm(testing.NewUserRealm(player))
	Launch(cross(cur), id, 0, 1) // holes out
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
	PlayRoundAt(cross(cur), id, holeShot, Period())
	uassert.True(t, mustHole(id).rec(assisted).best > 0, "the finish is kept")
	uassert.False(t, strings.Contains(Leaderboard("assisted"), loner.String()), "not on the course board")
	uassert.True(t, totals[assisted].Get(loner.String()) == nil, "no standing row")
	uassert.True(t, strings.Contains(HoleLeaderboard(id, "assisted", 0, 10), loner.String()), "on the hole's own board")
}

// A replay never erases a player's best, and the board reads its top ten.
func TestLeaderboardKeepsBests(cur realm, t *testing.T) {
	giveName(cur, player, "golfer")
	id := courseHole(cur, 32)
	testing.SetRealm(testing.NewUserRealm(player))
	Launch(cross(cur), id, 0, 1) // holes out
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

// Holes lists the course world by world, then by order within one, then
// anyone's, and says which is which.
func TestHolesAreListedWorldByWorld(cur realm, t *testing.T) {
	islet := flatHole("Flat")
	islet.World, islet.Order = "island", 1
	id := mine(cur, "islet9", islet)
	island := publish(cur, cupHole("island", 41, "Isle"))
	garden := publish(cur, cupHole("garden", 941, "Late garden"))
	list := Holes()
	uassert.True(t, strings.HasPrefix(list, `{"version":1,"play":"`+playURL+`","successor":"","holes":[{`), list)
	gi, ii, ci := strings.Index(list, `"id":"`+garden+`"`), strings.Index(list, `"id":"`+island+`"`), strings.Index(list, `"id":"`+id+`"`)
	uassert.True(t, gi >= 0 && ii > gi && ci > ii, "the garden, then the island, then anyone's: "+list)
	uassert.True(t, strings.Contains(list, `"world":"island","order":41.000,"next":"","slot":"island/41"}`), "the island hole says where it is")
	uassert.True(t, strings.Contains(State(id), `"world":"island"`), "State says the world too")
	uassert.True(t, strings.Contains(list, `"id":"`+id+`","name":"Flat","official":false`), "Holes says it is not the course's")
	hub := Render("")
	uassert.True(t, strings.Contains(hub, "## Community holes"), "anyone's holes have their own section")
	uassert.True(t, strings.Contains(hub, "### [Island Cup](/r/gnogolf/golf:island)"), "the course has a card per cup, to its page")
	uassert.True(t, strings.Index(hub, "Island Cup") < strings.Index(hub, "## Community holes"), "the course first")
	uassert.True(t, strings.Contains(Render("island"), "| 41 | [Isle](/r/gnogolf/golf:island/41) |"), "a cup's page lists its holes by their number")
	uassert.True(t, strings.Contains(Render(id), "Community hole by [g1"), "a community hole has no cup, whatever its world")
	uassert.False(t, strings.Contains(Render(id), "Island Cup"))
}

// a hole open to the wind
var windy = &course.Simple{
	W: 44, H: 16, World: "island", Title: "Windy", Tee: physics.V(2, 8), Pin: physics.V(40, 8), Substeps: 20, CupRadius: 1,
	Course: &physics.Field{Walls: physics.Box(physics.V(0, 0), physics.V(44, 16)), Friction: 0.9, Radius: 0.5},
}

// The weather is a function of (hole, period): the same for everyone, it
// changes the shot, and a recorded round cannot pick an old one.
func TestWeatherOfTheMoment(cur realm, t *testing.T) {
	id := mine(cur, "windy", windy)

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
	calm, blown := simAt(id, "0,4", clearAt), simAt(id, "0,4", windyAt)
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
	W: 32, H: 16, World: "garden", Title: "Swing", Tee: physics.V(2, 3), Pin: physics.V(26, 3), Substeps: 20, CupRadius: 1,
	Course: &physics.Field{
		Walls:    physics.Walls(physics.Box(physics.V(0, 0), physics.V(30, 6)), physics.Timed(physics.Bar(physics.V(10, 0), physics.V(10, 6), 0.5, '=', "gate"), 8, 4, 0)),
		Friction: 0.95,
		Radius:   0.5,
	},
}

// The third field of a shot is the player's timing: it decides whether the
// gate is there, replays the same, and is kept with the round.
func TestTimingIsPartOfTheShot(cur realm, t *testing.T) {
	id := mine(cur, "swing", swing)
	e := mustHole(id)
	p := periodOf(id, e.world, e.hole(), course.Clear) // in calm weather
	past := 0
	for tick := 0; tick < 8; tick++ {
		out := simAt(id, ufmt.Sprintf("0,5,%d", tick), p)
		if !strings.Contains(out, `"path":[[2.000,3.000],[5.000`) {
			continue
		}
		last := out[strings.LastIndex(out, "[")+1:]
		if x, _ := strconv.ParseFloat(last[:strings.Index(last, ",")], 64); x > 10 {
			past++
		}
	}
	uassert.True(t, past > 0 && past < 8, "some timings get past the gate, some do not")
	uassert.Equal(t, simAt(id, "0,5", p), simAt(id, "0,5,0", p), "no tick is tick 0")
	uassert.Equal(t, simAt(id, "0,5,2000", p), simAt(id, "0,5,1023", p), "the tick is clamped")

	testing.SetRealm(testing.NewUserRealm(player))
	PlayRoundAt(cross(cur), id, "0,5,3", Period())
	uassert.True(t, strings.Contains(Round(id, player), `"shots":"0.0000,5.0000,3"`), "the round keeps the timing")
}

// A newer version in the same slot archives the old one: its records stay,
// its bests leave the course-wide standing, and it no longer ranks.
func TestNewerHoleTakesTheSlot(cur realm, t *testing.T) {
	old := publish(cur, cupHole("island", 47, "Old seven"))
	testing.SetRealm(testing.NewUserRealm(player))
	Launch(cross(cur), old, 0, 1) // holes out
	was := totals[pro].Get(player.String()).(*row).holes

	next := publish(cur, cupHole("island", 47, "New seven"))
	uassert.Equal(t, "island/47/v1", old)
	uassert.Equal(t, "island/47/v2", next)
	uassert.Equal(t, next, mustHole(old).next)
	uassert.Equal(t, "", mustHole(next).next)
	uassert.Equal(t, was-1, totals[pro].Get(player.String()).(*row).holes)
	uassert.True(t, mustHole(old).rec(pro).best > 0, "the old hole keeps its record")

	// replaying the archived hole ranks nothing
	testing.SetRealm(testing.NewUserRealm(player))
	Reset(cross(cur), old)
	testing.SetRealm(testing.NewUserRealm(player))
	Launch(cross(cur), old, 0, 1)
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
		PlayRoundAt(cross(cur), id, strings.Repeat("0,0.001;", 2-i)+holeShot, Period())
	}
	testing.SetRealm(testing.NewUserRealm(stranger)) // unnamed: finished, not on the board
	PlayRoundAt(cross(cur), id, holeShot, Period())
	row := func(p address, n int) string { return ufmt.Sprintf(`{"player":"%s","strokes":%d}`, p.String(), n) }
	head := `{"version":1,"hole":"` + id + `","mode":"assisted","par":3,"players":3,"finished":4,`
	uassert.Equal(t, head+`"offset":0,"rows":[`+row(a, 1)+","+row(b, 2)+","+row(c, 3)+`],"next":0}`, HoleLeaderboard(id, "assisted", 0, 10))
	uassert.True(t, strings.Contains(Render(id), "| 1 | [@hba](/r/gnogolf/golf:"+id+"/"+a.String()+") | 1 |\n| 2 | [@hbb]"), "the page shows the best rounds, best first")
	// a page at a time: next is where the following page starts
	uassert.Equal(t, head+`"offset":1,"rows":[`+row(b, 2)+`],"next":2}`, HoleLeaderboard(id, "assisted", 1, 1))
	// an offset past the board is the board's end, however large
	uassert.Equal(t, head+`"offset":3,"rows":[],"next":0}`, HoleLeaderboard(id, "assisted", 50, 10))
	uassert.Equal(t, head+`"offset":3,"rows":[],"next":0}`, HoleLeaderboard(id, "assisted", math.MaxInt, 100))

	// c improves to 1: its old row goes, the new one sorts by address among the 1s
	testing.SetRealm(testing.NewUserRealm(c))
	Reset(cross(cur), id)
	testing.SetRealm(testing.NewUserRealm(c))
	PlayRoundAt(cross(cur), id, holeShot, Period())
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
	PlayRoundPro(cross(cur), id, holeShot, Period())
	e := mustHole(id)
	uassert.True(t, e.rec(pro).best > 0, "the pro record is set")
	uassert.Equal(t, 0, e.rec(assisted).best)
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
	id := courseHole(cur, 33)
	testing.SetRealm(testing.NewUserRealm(stranger))
	PlayRoundAt(cross(cur), id, "0,1", Period())
	uassert.True(t, mustHole(id).rec(assisted).best > 0, "the finish is kept")
	uassert.False(t, strings.Contains(HoleLeaderboard(id, "assisted", 0, 100), stranger.String()), "not on the hole's board")
	uassert.False(t, strings.Contains(Leaderboard("assisted"), stranger.String()), "not on the course's board")
	uassert.True(t, strings.Contains(Bests(id, "assisted", " g1nobody, "+stranger.String()), `"player":"`+stranger.String()+`"`), "friends see it")
	uassert.True(t, strings.Contains(Standings("assisted", stranger.String()), stranger.String()), "and its standing")
}
