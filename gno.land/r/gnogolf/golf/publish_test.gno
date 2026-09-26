package golf

import (
	"math"
	"strconv"
	"strings"
	"testing"

	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
	"gno.land/p/nt/testutils/v0"
	"gno.land/p/nt/uassert/v0"
	"gno.land/p/nt/urequire/v0"
)

// The course as data: publishing, versions, the owner's power, and that a
// data hole plays, wears and reads as a hole.

func TestOnlyTheOwnerPublishes(cur realm, t *testing.T) {
	h := cupHole("garden", 60, "Owned")
	data := hexOf(h)
	setOwner(deployer)
	testing.SetRealm(testing.NewUserRealm(player))
	urequire.AbortsContains(t, cur, "only the owner", func() { Publish(cross(cur), "garden/60", data, "") })
	// a realm the owner calls is not the owner, even signed by them
	testing.SetOriginCaller(deployer)
	testing.SetRealm(testing.NewCodeRealm("gno.land/r/test/phish"))
	urequire.AbortsContains(t, cur, "only the owner", func() { Publish(cross(cur), "garden/60", data, "") })
	testing.SetOriginCaller("")
	// an offer is not the role
	testing.SetRealm(testing.NewUserRealm(deployer))
	Transfer(cross(cur), heir)
	testing.SetRealm(testing.NewUserRealm(heir))
	urequire.AbortsContains(t, cur, "only the owner", func() { Publish(cross(cur), "garden/60", data, "") })
	testing.SetRealm(testing.NewUserRealm(heir))
	Accept(cross(cur))
	testing.SetRealm(testing.NewUserRealm(heir))
	uassert.Equal(t, "garden/60/v1", Publish(cross(cur), "garden/60", data, "by the heir"))
	uassert.Equal(t, heir, mustHole("garden/60/v1").by)
	// and once renounced, nobody
	testing.SetRealm(testing.NewUserRealm(heir))
	Renounce(cross(cur))
	for _, who := range []address{heir, deployer, ""} {
		testing.SetRealm(testing.NewUserRealm(who))
		urequire.AbortsContains(t, cur, "only the owner", func() { Publish(cross(cur), "garden/60", hexOf(cupHole("garden", 60, "Again")), "") })
	}
	setOwner(deployer)
}

func TestPublishChecksItsData(cur realm, t *testing.T) {
	h := cupHole("garden", 64, "Checked")
	half := cupHole("garden", 64, "Half")
	half.Order = 64.5
	// a stored length one ulp off its wall's own
	data := course.Encode(h)
	l, _, _ := physics.Lengths(h.Course.Walls[0].Seg, h.Course.Radius)
	i := strings.Index(data, le64(l))
	urequire.True(t, i > 0, "the first wall's length is in the data")
	off := data[:i] + le64(math.Nextafter(l, 2*l)) + data[i+8:]
	// a zero-length wall's offset lengths are never read: any value passes
	// Exact, and only the one Encode writes is taken
	dot := cupHole("garden", 64, "Dotted")
	dot.Course.Walls = append(dot.Course.Walls, physics.Wall{Seg: physics.Segment{A: physics.V(10, 10), B: physics.V(10, 10)}})
	dd := course.Encode(dot)
	at := strings.Index(dd, le64(10)+le64(10)+le64(10)+le64(10)+le64(0)+le64(0))
	urequire.True(t, at > 0, "the zero-length wall is in the data")
	loose := dd[:at+40] + le64(1) + dd[at+48:]
	loosened, _ := course.Decode(loose)
	urequire.True(t, loosened != nil && course.Exact(loosened), "Exact cannot see it")
	for _, c := range [][3]string{
		{"garden/64", hexOf2(loose), "not as course.Encode writes it"},
		{"garden/65", hexOf(h), "this data is garden/64, not garden/65"},
		{"garden/064", hexOf(h), "not garden/064"},
		{"garden/64", hexOf(half), "a whole number from 1 to 999"},
		{"garden/0", hexOf(cupHole("garden", 0, "Nowhere")), "a whole number from 1 to 999"},
		{"garden/64", "zz", "not hex"},
		{"garden/64", "474731", "course:"},
		{"garden/64", hexOf2(off), "stored wall lengths"},
	} {
		setOwner(deployer)
		testing.SetRealm(testing.NewUserRealm(deployer))
		urequire.AbortsContains(t, cur, c[2], func() { Publish(cross(cur), c[0], c[1], "") })
	}
	id := publish(cur, h)
	testing.SetRealm(testing.NewUserRealm(deployer))
	urequire.AbortsContains(t, cur, "already "+id+": nothing to publish", func() { Publish(cross(cur), "garden/64", hexOf(h), "") })
}

// le64 is a float's 8 bytes as GG1 writes them.
func le64(x float64) string {
	u := math.Float64bits(x)
	b := make([]byte, 8)
	for i := range b {
		b[i] = byte(u >> (8 * i))
	}
	return string(b)
}

func hexOf2(data string) string {
	const digits = "0123456789abcdef"
	b := make([]byte, 0, 2*len(data))
	for i := 0; i < len(data); i++ {
		b = append(b, digits[data[i]>>4], digits[data[i]&15])
	}
	return string(b)
}

// Writes take a version's exact id; reads take its alias too, and answer
// with the id to write with.
func TestWritesTakeExactIds(cur realm, t *testing.T) {
	id := publish(cur, cupHole("garden", 61, "Exact"))
	for _, write := range []func(){
		func() { Launch(cross(cur), "garden/61", 0, 1) },
		func() { PlayRoundAt(cross(cur), "garden/61", "0,1", Period()) },
		func() { PlayRoundPro(cross(cur), "garden/61", "0,1", Period()) },
		func() { PlayRound(cross(cur), "garden/61", "0,1") },
		func() { Reset(cross(cur), "garden/61") },
	} {
		testing.SetRealm(testing.NewUserRealm(player))
		urequire.AbortsContains(t, cur, "garden/61 is an alias: play its version by id, "+id, write)
	}
	uassert.True(t, strings.Contains(State("garden/61"), `"hole":"`+id+`"`), "a read by alias answers with the id")
	uassert.True(t, strings.Contains(State("garden/61"), `"slot":"garden/61","v":1,`))
	uassert.Equal(t, SimulateRound(id, "0,1"), SimulateRound("garden/61", "0,1"))
	testing.SetRealm(testing.NewUserRealm(player))
	uassert.True(t, strings.Contains(Launch(cross(cur), id, 0, 0.001), "on "+id+":"), "Launch says the version")
	uassert.PanicsContains(t, cur, "unknown hole", func() { State("garden/62") })
}

// A course hole's life: published, played and worn; a new version archives
// it, resets the ranking and wears afresh; both stay readable.
func TestPublishPlayWearRepublish(cur realm, t *testing.T) {
	fan := testutils.TestAddress("fan")
	giveName(cur, fan, "fan")
	h1 := cupHole("mountain", 62, "First")
	v1 := publish(cur, h1)
	testing.SetRealm(testing.NewUserRealm(fan))
	PlayRoundAt(cross(cur), v1, "0,0.001;0,1", Period())
	uassert.Equal(t, 2, BestOf(v1, "assisted", fan))
	holes, strokes := StandingOf("assisted", fan)
	uassert.True(t, holes >= 1 && strokes >= 2, "the course hole counts")
	uassert.True(t, strings.Contains(Leaderboard("assisted"), fan.String()))
	uassert.Equal(t, 2, sumWear(mustHole(v1)), "two strokes, two marks on the version's wear")

	h2 := cupHole("mountain", 62, "Second")
	v2 := publish(cur, h2)
	uassert.Equal(t, "mountain/62/v2", v2)
	uassert.Equal(t, v2, mustHole(v1).next)
	uassert.Equal(t, v2, Current("mountain/62"))
	was := holes
	holes, _ = StandingOf("assisted", fan)
	uassert.Equal(t, was-1, holes, "the old version's best leaves the standing")
	uassert.Equal(t, 2, BestOf(v1, "assisted", fan), "and stays its record")
	uassert.Equal(t, 0, BestOf("mountain/62", "assisted", fan), "the new version starts afresh")
	uassert.Equal(t, 0, sumWear(mustHole(v2)), "and its wear too")
	uassert.True(t, strings.Contains(State("mountain/62"), `"hole":"`+v2+`"`))
	uassert.True(t, strings.Contains(State(v1), `"next":"`+v2+`"`), "an archived version says what took its place")

	vs := Versions("mountain/62")
	uassert.True(t, strings.HasPrefix(vs, `{"version":1,"slot":"mountain/62","versions":[{"id":"mountain/62/v1","v":1,`), vs)
	uassert.True(t, strings.Contains(vs, `"next":"mountain/62/v2"},{"id":"mountain/62/v2","v":2,`), vs)
	uassert.Equal(t, hexOf(h1), HoleData(v1))
	uassert.Equal(t, hexOf(h2), HoleData("mountain/62"))

	// the archived version is still played, and wears, and ranks nothing
	testing.SetRealm(testing.NewUserRealm(fan))
	Reset(cross(cur), v1)
	testing.SetRealm(testing.NewUserRealm(fan))
	PlayRoundAt(cross(cur), v1, "0,1", Period())
	uassert.Equal(t, 1, BestOf(v1, "assisted", fan))
	holes, _ = StandingOf("assisted", fan)
	uassert.Equal(t, was-1, holes)
	uassert.Equal(t, 3, sumWear(mustHole(v1)))
}

func sumWear(e *entry) int {
	n := 0
	for _, c := range e.hole().Wear() {
		n += c
	}
	return n
}

// A data hole is decoded for each call and kept nowhere: its entry has no
// hole, and every read and write works from its data alone.
func TestADataHoleIsNeverStored(cur realm, t *testing.T) {
	h := cupHole("town", 63, "Stored")
	h.Pulses = []course.Pulse{{Every: 2, On: 1, Walls: physics.Bar(physics.V(10, 4), physics.V(10, 12), 0.5, '=', "gate")}}
	id := publish(cur, h)
	e := mustHole(id)
	_, isData := e.hole().(*dataHole)
	uassert.True(t, isData)
	testing.SetRealm(testing.NewUserRealm(player))
	Launch(cross(cur), id, 180, 1)
	testing.SetRealm(testing.NewUserRealm(player))
	PlayRoundPro(cross(cur), id, "0,2", Period()) // Launch made it a pro round
	r := roundIn(id, player)
	for _, read := range []string{
		State(id), HoleState(id), Render(id), Render(id + "/" + player.String()), Render(id + "/data"),
		Extras(id, 1), Round(id, player), SimulateFrom(id, r.bx, r.by, "0,1", r.strokes, Period()),
		SimulateCommit(id, r.bx, r.by, r.strokes, "0,1;0,1", Period()), Rounds(id, "", 10), Weather(id, Period()),
	} {
		uassert.True(t, len(read) > 0)
	}
	uassert.True(t, strings.Contains(Extras(id, 0), `"skin":"gate"`), "the pulse is there at stroke 0")
	uassert.Equal(t, `{"version":1,"walls":[],"posts":[],"zones":[]}`, Extras(id, 1), "and gone at stroke 1")
	uassert.Equal(t, 2, sumWear(e))
}

// The work of a hole at every limit of the format: a commit of twelve shots
// is refused before it could run out of gas.
func TestTheEstimatorRefusesAHoleAtTheLimits(cur realm, t *testing.T) {
	h := limitsHole()
	testing.SetRealm(testing.NewUserRealm(player))
	id := PublishMine(cross(cur), "limits", hexOf(h), "every limit at once")
	w := newWork(mustHole(id).hole(), nil)
	uassert.Equal(t, int64(course.MaxWalls), w.walls, "fixed and pulsed walls")
	uassert.Equal(t, int64(course.MaxWalls+course.MaxPosts+course.MaxZones+course.MaxPolyTotal), w.pieces, "pieces and polygon edges")
	uassert.True(t, w.bound <= maxShotGas && w.bound <= workBudget, "its heaviest shot fits one transaction")
	shots := strings.TrimSuffix(strings.Repeat("30,10;", maxShots), ";")
	uassert.PanicsContains(t, cur, "commit the first", func() { SimulateRound(id, shots) })
	testing.SetRealm(testing.NewUserRealm(player))
	urequire.AbortsContains(t, cur, "commit the first", func() { PlayRoundAt(cross(cur), id, shots, Period()) })
	uassert.True(t, strings.Contains(HoleState(id), `"board":{"w":96,"h":48}`))
}

// limitsHole is at every limit GG1 allows at once: a 96×48 board, 160 walls
// (28 of them in 16 pulses), 32 posts, 32 zones (8 of them 64-point
// polygons, 512 points in all) and 60 substeps.
func limitsHole() *course.Simple {
	walls := physics.Box(physics.V(0, 0), physics.V(96, 48))
	for i := 0; len(walls) < course.MaxWalls-28; i++ {
		x, y := 8+float64(i%16)*5, 6+float64(i/16)*5
		walls = append(walls, physics.Wall{Seg: physics.Segment{A: physics.V(x, y), B: physics.V(x+1, y+0.5)}, Bounce: 0.6})
	}
	var posts []physics.Post
	for i := 0; i < course.MaxPosts; i++ {
		posts = append(posts, physics.Post{Circle: physics.Circle{C: physics.V(10+float64(i%8)*10, 3+float64(i/8)*12), R: 0.4}, Skin: "rock"})
	}
	var zones []physics.Zone
	for i := 0; i < 8; i++ {
		c := physics.V(12+float64(i)*10, 24)
		var poly []physics.Vec2
		for k := 0; k < course.MaxPoly; k++ {
			poly = append(poly, c.Add(physics.FromPolar(float64(k)*2*math.Pi/course.MaxPoly, 2)))
		}
		zones = append(zones, physics.Zone{Kind: physics.Surface, Min: c.Sub(physics.V(2, 2)), Max: c.Add(physics.V(2, 2)), Scale: 0.9, Poly: poly, Skin: "sand"})
	}
	for i := 0; len(zones) < course.MaxZones; i++ {
		c := physics.V(6+float64(i)*3.5, 44)
		zones = append(zones, physics.Zone{Kind: physics.Slope, Min: c, Max: c.Add(physics.V(3, 3)), Vec: physics.V(0.01, 0), Skin: "slope"})
	}
	var pulses []course.Pulse
	for i := 0; i < course.MaxPulses; i++ {
		x := 5 + float64(i)*5.5
		p := course.Pulse{Every: 2, On: 1, Phase: i % 2, Walls: []physics.Wall{{Seg: physics.Segment{A: physics.V(x, 40), B: physics.V(x, 42)}}}}
		if i < 12 {
			p.Walls = append(p.Walls, physics.Wall{Seg: physics.Segment{A: physics.V(x+1, 40), B: physics.V(x+1, 42)}})
		}
		pulses = append(pulses, p)
	}
	return &course.Simple{W: 96, H: 48, World: "garden", Title: "At the limits", Strokes: 5,
		Tee: physics.V(3, 3), Pin: physics.V(93, 45), Substeps: course.MaxSubsteps, CupRadius: 1, Pulses: pulses,
		Course: &physics.Field{Walls: walls, Posts: posts, Zones: zones, Friction: 0.86, Bounce: 0.85, Radius: 0.5}}
}

// A community hole: anyone's, under their own address, never ranked.
func TestPublishMine(cur realm, t *testing.T) {
	bob := testutils.TestAddress("bob")
	giveName(cur, bob, "bob")
	h := cupHole("pond", 3, "Bob's")
	testing.SetRealm(testing.NewUserRealm(bob))
	urequire.AbortsContains(t, cur, "a slug is", func() { PublishMine(cross(cur), "Bob Pond", hexOf(h), "") })
	testing.SetRealm(testing.NewUserRealm(bob))
	id := PublishMine(cross(cur), "pond", hexOf(h), "my first")
	uassert.Equal(t, bob.String()+"/pond/v1", id)
	testing.SetRealm(testing.NewUserRealm(bob))
	urequire.AbortsContains(t, cur, "nothing to publish", func() { PublishMine(cross(cur), "pond", hexOf(h), "") })
	testing.SetRealm(testing.NewUserRealm(bob))
	PlayRoundAt(cross(cur), id, "0,1", Period())
	uassert.Equal(t, 1, BestOf(id, "assisted", bob))
	uassert.True(t, totals[assisted].Get(bob.String()) == nil, "no standing from anyone's hole")
	uassert.True(t, strings.Contains(HoleLeaderboard(bob.String()+"/pond", "assisted", 0, 10), bob.String()), "on its own board, by alias")
	// a second version, and someone else's hole of the same name is their own
	testing.SetRealm(testing.NewUserRealm(bob))
	v2 := PublishMine(cross(cur), "pond", hexOf(cupHole("pond", 3, "Bob's, deeper")), "")
	uassert.Equal(t, bob.String()+"/pond/v2", v2)
	uassert.Equal(t, v2, mustHole(id).next)
	testing.SetRealm(testing.NewUserRealm(player))
	uassert.Equal(t, player.String()+"/pond/v1", PublishMine(cross(cur), "pond", hexOf(h), ""))
	uassert.False(t, mustHole(v2).official)
	uassert.True(t, strings.Contains(playLink(mustHole(v2)), "?hole="+v2))
}

// One address publishing fifty holes shows perAuthor of them in Holes, and
// hides nobody else's; Community pages through every version of all of them.
func TestPublishMineSpamHidesNobody(cur realm, t *testing.T) {
	spam, other := testutils.TestAddress("spam"), testutils.TestAddress("spamfree")
	data := hexOf(cupHole("pond", 1, "Spam"))
	for i := 0; i < 50; i++ {
		testing.SetRealm(testing.NewUserRealm(spam))
		PublishMine(cross(cur), "s"+strconv.Itoa(i), data, "")
	}
	testing.SetRealm(testing.NewUserRealm(other))
	mine := PublishMine(cross(cur), "mine", hexOf(cupHole("pond", 2, "Mine")), "")
	testing.SetRealm(testing.NewUserRealm(other))
	v2 := PublishMine(cross(cur), "mine", hexOf(cupHole("pond", 2, "Mine, v2")), "")
	list := Holes()
	uassert.True(t, strings.Contains(list, `"id":"`+v2+`"`), "another author's hole is listed")
	uassert.False(t, strings.Contains(list, `"id":"`+mine+`"`), "an archived version is not")
	uassert.Equal(t, perAuthor, strings.Count(list, `"slot":"`+spam.String()+"/"))
	uassert.True(t, strings.Contains(Render(""), "Mine, v2"), "nor on the hub")
	// Community has them all, a page at a time
	seen, pages, after := 0, 0, ""
	for {
		p := Community(after, 7)
		seen += strings.Count(p, `{"id":`)
		pages++
		i := strings.LastIndex(p, `"next":"`)
		after = p[i+8 : len(p)-2]
		if after == "" {
			break
		}
	}
	uassert.Equal(t, community.Size(), seen)
	uassert.True(t, seen >= 52 && pages > 7)
}

// A first finish on an archived course hole, before the drain reaches its
// player, is kept as a record and never counted, so the drain leaves the
// player's standing alone; an improvement on it later does not count either.
func TestAFirstFinishOnAnArchivedHoleNeverCounts(cur realm, t *testing.T) {
	old := courseHole(cur, 66)
	e := mustHole(old)
	early := []address{testutils.TestAddress("n2a"), testutils.TestAddress("n2b")}
	for _, p := range early {
		testing.SetRealm(testing.NewUserRealm(p))
		PlayRoundAt(cross(cur), old, "0,1", Period())
	}
	// archived by hand, the drain not started: nobody is reached yet
	e.next, e.out = "garden/66/v9", &draining{}
	archiving = append(archiving, old)
	late := testutils.TestAddress("n2late")
	testing.SetRealm(testing.NewUserRealm(late))
	PlayRoundAt(cross(cur), old, "0,0.001;0,1", Period())
	uassert.Equal(t, 2, BestOf(old, "assisted", late), "the record is kept")
	holes, _ := StandingOf("assisted", late)
	uassert.Equal(t, 0, holes, "no hole counted on an archived hole")
	testing.SetRealm(testing.NewUserRealm(late))
	Reset(cross(cur), old)
	testing.SetRealm(testing.NewUserRealm(late))
	PlayRoundAt(cross(cur), old, "0,1", Period())
	drain(retireBatch)
	holes, _ = StandingOf("assisted", late)
	uassert.Equal(t, 0, holes, "nor after an improvement and the drain")
	for _, p := range early {
		holes, _ := StandingOf("assisted", p)
		uassert.Equal(t, 0, holes, "the early finishers were drained")
	}
}

// A player who takes a name after their best joins the boards at their next
// finish, improving or not.
func TestANameTakenLaterRanksAtTheNextFinish(cur realm, t *testing.T) {
	late := testutils.TestAddress("latename")
	id := courseHole(cur, 67)
	testing.SetRealm(testing.NewUserRealm(late))
	PlayRoundAt(cross(cur), id, "0,1", Period())
	uassert.False(t, strings.Contains(HoleLeaderboard(id, "", 0, 10), late.String()))
	giveName(cur, late, "latename")
	testing.SetRealm(testing.NewUserRealm(late))
	Reset(cross(cur), id)
	testing.SetRealm(testing.NewUserRealm(late))
	PlayRoundAt(cross(cur), id, "0,0.001;0,1", Period()) // worse than the best
	uassert.True(t, strings.Contains(HoleLeaderboard(id, "", 0, 10), `{"player":"`+late.String()+`","strokes":1}`))
	uassert.True(t, strings.Contains(Rank("", late), `"rank":`) && !strings.Contains(Rank("", late), `"rank":0,`), Rank("", late))
}

// Rank is a player's place in the course ranking.
func TestRankCountsThePlayersAhead(cur realm, t *testing.T) {
	a, b := testutils.TestAddress("rka"), testutils.TestAddress("rkb")
	giveName(cur, a, "rka")
	giveName(cur, b, "rkb")
	x, y := courseHole(cur, 71), courseHole(cur, 72)
	for _, id := range []string{x, y} { // a finishes two holes
		testing.SetRealm(testing.NewUserRealm(a))
		PlayRoundPro(cross(cur), id, "0,1", Period())
	}
	testing.SetRealm(testing.NewUserRealm(b)) // b one
	PlayRoundPro(cross(cur), x, "0,1", Period())
	rank := func(p address) int {
		s := Rank("pro", p)
		s = s[strings.Index(s, `"rank":`)+7:]
		n, _ := strconv.Atoi(s[:strings.Index(s, ",")])
		return n
	}
	uassert.True(t, rank(a) > 0 && rank(a) < rank(b), Rank("pro", a)+Rank("pro", b))
	uassert.True(t, strings.HasPrefix(Rank("pro", stranger), `{"version":1,"mode":"pro","player":"`+stranger.String()+`","rank":0,`), Rank("pro", stranger))
}

// SimulateCommit is the next commit of a round under way, as PlayRoundAt
// plays it, refusals included.
func TestSimulateCommitIsTheNextCommit(cur realm, t *testing.T) {
	id := courseHole(cur, 68)
	testing.SetRealm(testing.NewUserRealm(player))
	PlayRoundAt(cross(cur), id, "90,2;90,1", Period())
	r := roundIn(id, player)
	sim := SimulateCommit(id, r.bx, r.by, r.strokes, "0,1;0,1", Period())
	testing.SetRealm(testing.NewUserRealm(player))
	PlayRoundAt(cross(cur), id, "0,1;0,1", Period())
	r = roundIn(id, player)
	uassert.True(t, strings.Contains(sim, `"strokes":`+strconv.Itoa(r.strokes)+`,`), sim)
	uassert.True(t, strings.HasSuffix(sim, `"rest":`+jexact(r.ball())+"}"), sim)
	uassert.PanicsContains(t, cur, "stroke limit", func() { SimulateCommit(id, 2, 8, maxRoundStrokes-1, "180,1;180,1", Period()) })
	uassert.PanicsContains(t, cur, "on the board", func() { SimulateCommit(id, -1, 8, 0, "0,1", Period()) })
}

// The fixes of the second bug hunt, on the reads.
func TestTheReadsRefuseWhatTheWritesRefuse(cur realm, t *testing.T) {
	id := register(cur, "reads")
	for _, shots := range []string{"", ";;", " ; "} {
		uassert.PanicsContains(t, cur, "no shots", func() { SimulateRound(id, shots) })
	}
	twelve := strings.Repeat("180,0.2;", maxShots) // with a trailing ;
	uassert.True(t, strings.Contains(SimulateRound(id, twelve), `"strokes":12`), "empty entries do not count")
	uassert.True(t, strings.Contains(SimulateRound(id, "0,0.2"+strings.Repeat(";", 12)), `"strokes":1`))
	uassert.PanicsContains(t, cur, "too many shots in one commit", func() { SimulateRound(id, twelve+"0,1") })
	for _, ball := range [][2]float64{{-1000, -1000}, {1e308, 1e308}, {33, 8}, {2, -0.1}} {
		uassert.PanicsContains(t, cur, "on the board", func() { SimulateFrom(id, ball[0], ball[1], "0,1", 0, Period()) })
	}
	uassert.True(t, len(SimulateFrom(id, 32, 16, "180,1", 0, Period())) > 0, "the far corner is on the board")
	// ticks: a whole number, clamped however long
	for in, want := range map[string]int{"99999999999999999999": maxTick, "-99999999999999999999": 0, "0012": 12, "+7": 7, "1024": maxTick} {
		if _, _, k := parseShot("0,5," + in); k != want {
			t.Errorf("tick %s is %d, want %d", in, k, want)
		}
	}
	for _, bad := range []string{"1x", "", "-", "0x10"} {
		uassert.PanicsContains(t, cur, "bad tick", func() { parseShot("0,5," + bad) })
	}
	// friends: each valid address once
	uassert.Equal(t, 1, len(friends(player.String()+", "+player.String()+",garbage,,g1nope")))
}

func TestHoleStateHasNoRounds(cur realm, t *testing.T) {
	h := cupHole("garden", 69, "Windy spot")
	h.Course.Zones = []physics.Zone{{Kind: physics.Slope, Min: physics.V(10, 0), Max: physics.V(14, 16), Vec: physics.V(0, 0.05), Skin: "fan", Air: true, Capped: true}}
	id := publish(cur, h)
	testing.SetRealm(testing.NewUserRealm(player))
	Launch(cross(cur), id, 180, 1)
	st, hs := State(id), HoleState(id)
	uassert.True(t, strings.Contains(st, `"rounds":[{`) && !strings.Contains(hs, `"rounds"`) && !strings.Contains(hs, `"plays"`), hs)
	uassert.Equal(t, st[:strings.Index(st, `,"plays"`)], hs[:strings.Index(hs, `,"walls"`)])
	uassert.True(t, strings.HasSuffix(hs, "]}}"), hs)
	uassert.True(t, strings.Contains(hs, `"scale":0.000,"round":false,"air":true,"capped":true,"skin":"fan"}`), "a hole's air says so: "+hs)
}

func TestPlayLinks(cur realm, t *testing.T) {
	v1 := publish(cur, cupHole("island", 70, "Linked"))
	uassert.Equal(t, playURL+"?cup=island&hole=70", playLink(mustHole(v1)))
	v2 := publish(cur, cupHole("island", 70, "Linked again"))
	uassert.Equal(t, playURL+"?hole="+v1, playLink(mustHole(v1)), "an archived version links by id")
	uassert.Equal(t, playURL+"?cup=island&hole=70", playLink(mustHole(v2)))
	linked := register(cur, "linked")
	uassert.Equal(t, playURL+"?hole="+linked, playLink(mustHole(linked)))
}

func TestDrainIsOpen(cur realm, t *testing.T) {
	testing.SetRealm(testing.NewUserRealm(stranger))
	left := Drain(cross(cur), 1000)
	uassert.Equal(t, len(archiving), left)
}

// The pages: the hub says who can change what, a hole's page and its data
// page say where it comes from.
func TestThePagesSayWhoHoldsPower(cur realm, t *testing.T) {
	id := publish(cur, cupHole("town", 73, "Paged"))
	hub := Render("")
	uassert.True(t, strings.Contains(hub, "One party holds a real power: the course's owner, now [g1"), hub)
	uassert.True(t, strings.Contains(Render("town"), "| [data](/r/gnogolf/golf:"+id+"/data) |"), "a course hole links its data")
	page := Render("town/73")
	uassert.True(t, strings.Contains(page, `value="`+id+`"`), "the page plays the version by id")
	data := Render(id + "/data")
	uassert.True(t, strings.Contains(data, "version 1 of [town/73](/r/gnogolf/golf:town/73)"), data)
	uassert.True(t, strings.Contains(data, hexOf(cupHole("town", 73, "Paged"))), "the data, as published")
	uassert.True(t, strings.Contains(Render("town/73/data"), "**"+id+"**"), "by alias too")
	uassert.True(t, strings.Contains(Render("no/such"), "# No such hole"))
	uassert.True(t, strings.Contains(Render("[[["), "That page is not a hole here"))
	setOwner("")
	uassert.True(t, strings.Contains(Render(""), "now nobody: the role was given up"))
	setOwner(deployer)
}

// The note and the name are cleaned once, at publish: no bidi or zero-width
// characters, nothing that breaks the page.
func TestTextIsCleanedAtPublish(cur realm, t *testing.T) {
	h := cupHole("garden", 74, "Evil‮eman|​[x]")
	setOwner(deployer)
	testing.SetRealm(testing.NewUserRealm(deployer))
	id := Publish(cross(cur), "garden/74", hexOf(h), "note⁦ with `code` and a very long tail "+strings.Repeat("x", 200))
	e := mustHole(id)
	uassert.Equal(t, "Evilemanx", e.name)
	uassert.Equal(t, maxNote, len([]rune(e.note)))
	uassert.False(t, strings.ContainsAny(e.note, "`⁦"))
}

// However often the course is republished, the list keeps room for
// everyone else's holes, and shows a few archived versions only.
func TestArchivedVersionsLeaveRoomInTheList(cur realm, t *testing.T) {
	for i := 0; i < maxArchived+5; i++ {
		publish(cur, cupHole("garden", 85, "Again "+strconv.Itoa(i)))
	}
	for i := 0; i < minCommunity; i++ {
		register(cur, "room"+strconv.Itoa(i))
	}
	archived, others := 0, 0
	for _, e := range listed() {
		switch {
		case e.official && e.next != "":
			archived++
		case !e.official:
			others++
		}
	}
	uassert.True(t, archived <= maxArchived, strconv.Itoa(archived))
	uassert.True(t, others >= minCommunity, strconv.Itoa(others))
}

// The pages gnoweb links: a query string is ignored, a cup and an author
// have a page, a community hole names its author, and a board too detailed
// to draw says so.
func TestThePagesGnowebLinks(cur realm, t *testing.T) {
	h := cupHole("pond", 5, "Hedged")
	h.Course.Walls = append(h.Course.Walls, physics.Bar(physics.V(10, 2), physics.V(10, 6), 0.5, 0, "hedge")...)
	author := testutils.TestAddress("pager")
	testing.SetRealm(testing.NewUserRealm(author))
	id := PublishMine(cross(cur), "hedged", hexOf(h), "")
	uassert.Equal(t, Render(id), Render(id+"?ref=x&b=[a](c)"))
	uassert.Equal(t, Render(""), Render("?utm=1"))
	page := Render(id)
	uassert.True(t, strings.Contains(page, "· Community hole by [g1"), "the author, not a cup")
	uassert.True(t, strings.Contains(page, "`#` wall (hedge)") && !strings.Contains(page, "`#` hedge"), "the wall's skins go with the wall, once")
	uassert.True(t, strings.Contains(Render(author.String()), "| [Hedged](/r/gnogolf/golf:"+author.String()+"/hedged) | 1 |"), "the author's page")
	uassert.True(t, strings.Contains(Render(testutils.TestAddress("nobody").String()), "published no hole"))
	uassert.True(t, strings.Contains(Render("nosuchcup"), "No course hole in this cup"))
	// a board past the budget is not drawn
	big := flatHole("Big")
	big.W, big.H = 96, 96
	for i := 0; i < 100; i++ {
		big.Course.Zones = append(big.Course.Zones, physics.Zone{Kind: physics.Surface, Min: physics.V(0, 0), Max: physics.V(96, 96), Scale: 1})
	}
	uassert.True(t, boardWork(big.Course, big) > maxBoardWork)
	e := mustHole(id)
	uassert.True(t, strings.Contains(renderHole(e, big, ""), "too detailed to draw here"))
	uassert.False(t, strings.Contains(page, "too detailed"))
}

// Community rows are the newest first: sixteen addresses that sort low
// (bech32 "g1qqq…", cheap to grind for) publishing three holes each, on a
// course of 74, cannot keep a later author's hole off the list or the hub.
func TestNewestCommunityHolesAreListed(cur realm, t *testing.T) {
	for i := slots.Size(); i < 74; i++ {
		publish(cur, cupHole("filler", i+1, "Filler"))
	}
	data := hexOf(cupHole("pond", 1, "Low"))
	for i := 0; i < 16; i++ {
		low := testutils.TestAddress("\x00\x00\x00\x00" + string([]byte{byte(i)}))
		for j := 0; j < perAuthor; j++ {
			testing.SetRealm(testing.NewUserRealm(low))
			PublishMine(cross(cur), "low"+strconv.Itoa(j), data, "")
		}
	}
	testing.SkipHeights(1)
	testing.SetRealm(testing.NewUserRealm(testutils.TestAddress("latecomer")))
	late := PublishMine(cross(cur), "late", hexOf(cupHole("pond", 2, "Latecomer")), "")
	list := Holes()
	uassert.True(t, strings.Contains(list, `"id":"`+late+`"`), "the newest hole is listed")
	low := strings.Index(list, `"slot":"g1qqqqqqq`)
	uassert.True(t, low < 0 || strings.Index(list, `"id":"`+late+`"`) < low, "ahead of the older ones")
	uassert.True(t, strings.Contains(Render(""), "Latecomer"), "and on the hub")
}

// One author publishing as many holes as they like fills perAuthor rows and
// no more: everyone else's, older or newer, stay listed. 1000 is the bound
// the list once scanned (maxScanned): as many newer holes of one author
// took every older one off the list and the hub.
func TestOneAuthorCannotFloodTheList(cur realm, t *testing.T) {
	data := hexOf(cupHole("pond", 1, "Flood"))
	testing.SkipHeights(1)
	var early []string
	for _, name := range []string{"early1", "early2"} {
		testing.SetRealm(testing.NewUserRealm(testutils.TestAddress(name)))
		early = append(early, PublishMine(cross(cur), "old", data, ""))
	}
	testing.SkipHeights(1)
	flooder := testutils.TestAddress("flooder")
	for i := 0; i < 1000; i++ {
		testing.SetRealm(testing.NewUserRealm(flooder))
		PublishMine(cross(cur), "f"+strconv.Itoa(i), data, "")
	}
	testing.SkipHeights(1)
	testing.SetRealm(testing.NewUserRealm(testutils.TestAddress("late1")))
	late := PublishMine(cross(cur), "new", data, "")
	var ids []string
	flood := 0
	for _, e := range listed() {
		if !e.official {
			ids = append(ids, e.id)
		}
		if e.by == flooder {
			flood++
		}
	}
	uassert.Equal(t, perAuthor, flood, "the flooder's rows")
	list := strings.Join(ids, " ")
	at := func(id string) int {
		i := strings.Index(list, id)
		uassert.True(t, i >= 0, id+" is listed")
		return i
	}
	uassert.True(t, at(late) < at(flooder.String()+"/f999/v1"), "newest first")
	uassert.True(t, at(flooder.String()+"/f997/v1") < at(early[0]) && at(early[1]) >= 0, "and the older authors after the flood")
	uassert.True(t, strings.Contains(Holes(), `"id":"`+early[0]+`"`) && strings.Contains(Render(""), ":"+strings.TrimSuffix(early[1], "/v1")+")"), "in Holes and on the hub")
}
