package golf

import (
	"math"
	"strconv"
	"strings"

	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
	bptree "gno.land/p/nt/bptree/v0"
	"gno.land/p/nt/ufmt/v0"
)

// State is the hole as data: geometry, skins, wear and the rounds in flight.
// hole is a version's id or an alias; "hole" in the answer is always the
// version's id, the one to write with. A data version also says its "slot"
// (its alias) and "v" (its number), and an archived one its "next".
//
// It exists for renderers that are not this file — a 3D client reads it over
// vm/qeval and draws a windmill where the geometry says "a bar with skin
// 'sail'". Nothing here decides how anything looks; Skin is a name to
// look up, and the client owns the lookup table.
//
// The rounds listed here carry no path: a client that animates one player's
// last shot reads it with Round, which replays it.
//
// A shot's `path` (Round, Simulate*) is the flight the chain computed. A
// client replays it. It must not re-simulate: the ball would drift away from
// where the chain says it is. Consecutive points far apart mean a tunnel — the
// ball is elsewhere, do not interpolate.
func State(hole string) string {
	e := readHole(hole)
	return stateJSON(e, e.hole(), true)
}

// HoleState is State without the rounds and the play count: the hole, its
// weather and its wear, all a client needs to draw it and aim.
func HoleState(hole string) string {
	e := readHole(hole)
	return stateJSON(e, e.hole(), false)
}

func stateJSON(e *entry, h course.Hole, rounds bool) string {
	f := h.Field()
	var sb strings.Builder
	sb.WriteString("{" + versionJSON +
		`,"hole":` + jstr(e.id) +
		`,"name":` + jstr(e.name) +
		`,"official":` + strconv.FormatBool(e.official))
	if e.slot != "" {
		sb.WriteString(`,"slot":` + jstr(e.slot) + `,"v":` + strconv.Itoa(e.version))
	}
	if e.next != "" {
		sb.WriteString(`,"next":` + jstr(e.next))
	}
	p := Period()
	sb.WriteString(boardJSON(h) +
		`,"par":` + strconv.Itoa(e.par) +
		`,"world":` + jstr(e.world) + `,"order":` + jnum(e.order) +
		`,"timed":` + strconv.FormatBool(isTimed(h)) +
		`,"period":` + strconv.FormatInt(p, 10) +
		`,"weather":` + forecastJSON("", weatherOf(e, h, p)) +
		`,"start":` + jvec(h.Start()) +
		`,"cup":` + jvec(h.Cup()))
	if rounds {
		sb.WriteString(`,"plays":` + strconv.Itoa(e.plays))
	}
	sb.WriteString(`,"walls":` + wallsJSON(f.Walls) + `,"posts":` + postsJSON(f.Posts))
	sb.WriteString(`,"zones":` + zonesJSON(f.Zones, true))
	sb.WriteString(`,"wear":{"w":` + strconv.Itoa(course.WearW) + `,"h":` + strconv.Itoa(course.WearH) + `,"cells":[`)
	for i, c := range h.Wear() {
		sb.WriteString(sep(i))
		sb.WriteString(strconv.Itoa(c))
	}
	if !rounds {
		sb.WriteString("]}}")
		return sb.String()
	}

	// Rounds are capped: every address that ever played keeps one, and a
	// popular hole would otherwise outgrow what one query can print. The total
	// is given; a client that wants one player's round asks Round().
	sb.WriteString(`]},"roundsTotal":` + strconv.Itoa(e.roundTree().Size()) + `,"rounds":[`)
	i := 0
	eachRound(e, roundsShown, func(player string, r *round) {
		sb.WriteString(sep(i))
		sb.WriteString(roundJSON(e, h, player, r, false))
		i++
	})
	sb.WriteString("]}")
	return sb.String()
}

// roundsShown is how many rounds State and the page list at most.
const roundsShown = 24

// roundJSON is one player's round. ball is where it lies (3 decimals), rest
// the same ball exactly (shortest round-trip float), which SimulateFrom takes.
// With path, the last stroke's path, air and cause, replayed from where that
// stroke started: rounds store their shots, not their paths.
func roundJSON(e *entry, h course.Hole, player string, r *round, path bool) string {
	var sb strings.Builder
	sb.WriteString("{" + versionJSON + `,"player":` + jstr(player) +
		`,"ball":` + jvec(r.ball()) + `,"rest":` + jexact(r.ball()) +
		ufmt.Sprintf(`,"strokes":%d,"done":%t,"period":%d`, r.strokes, r.done, r.period) +
		`,"mode":` + jstr(modeNames[r.mode]) +
		`,"shots":` + jstr(r.shots))
	if path {
		shot := lastShot(e, h, r)
		sb.WriteString(`,"path":[` + pathJSON(shot.Path) + `],"air":` + jstr(airOf(shot)) + `,"cause":` + jstr(string(shot.Cause)))
	}
	sb.WriteString("}")
	return sb.String()
}

// lastShot replays a round's last stroke from where it started, read-only:
// the same hole, stroke number, tick and weather, so the same flight (a hole
// plays its Preview as its Play, less the wear). Nothing before a first stroke.
func lastShot(e *entry, h course.Hole, r *round) physics.Shot {
	if r.strokes == 0 || r.shots == "" {
		return physics.Shot{}
	}
	s := r.shots
	if i := strings.LastIndex(s, ";"); i >= 0 {
		s = s[i+1:]
	}
	angle, power, tick := parseShot(s)
	from := physics.Vec2{X: r.fx, Y: r.fy}
	shot, holed := previewAt(h, from, angle*math.Pi/180, power, r.strokes-1, tick, weatherOf(e, h, r.period).Zones)
	return back(h, from, shot, holed)
}

// pathJSON is a shot's path points, comma separated.
func pathJSON(ps []physics.Vec2) string {
	var sb strings.Builder
	for i, p := range ps {
		sb.WriteString(sep(i))
		sb.WriteString(jvec(p))
	}
	return sb.String()
}

// airOf is a shot's air flags, one character per path point: "0001100…".
func airOf(s physics.Shot) string {
	b := make([]byte, len(s.Path))
	for i := range b {
		b[i] = '0'
		if i < len(s.Air) && s.Air[i] {
			b[i] = '1'
		}
	}
	return string(b)
}

// Round is one player's round on a hole, or null if they have none (or Reset
// it) — what a client reads back after recording, whatever the size of the
// hole's history. Its path is the last stroke's, replayed: one stroke of gas.
func Round(hole string, player address) string {
	e := readHole(hole)
	v := e.roundTree().Get(player.String())
	if v == nil {
		return "null"
	}
	return roundJSON(e, e.hole(), player.String(), v.(*round), true)
}

func sep(i int) string {
	if i == 0 {
		return ""
	}
	return ","
}

// jnum is a number with 3 decimals, the bytes of ufmt's "%.3f" at a
// fraction of its gas (it formats most JSON numbers). It never prints NaN or
// Inf, which are not JSON: a hostile hole returning them breaks nothing but
// shows 0.
//
// v*1000 is off from the exact decimal by less than 1.2e-4 below 1e12, so the
// rounding is decided by the integer part unless the fraction lies within
// 1e-3 of a half: those, and huge numbers, go to strconv, which is exact.
func jnum(v float64) string {
	if math.IsNaN(v) || math.IsInf(v, 0) {
		return "0"
	}
	a := v * 1000
	if a < 0 {
		a = -a
	}
	if a >= 1e12 {
		return strconv.FormatFloat(v, 'f', 3, 64)
	}
	k := int64(a)
	switch f := a - float64(k); {
	case f > 0.499 && f < 0.501:
		return strconv.FormatFloat(v, 'f', 3, 64)
	case f > 0.5:
		k++
	}
	frac := k % 1000
	s := strconv.FormatInt(k/1000, 10) + "."
	if frac < 100 {
		s += "0"
	}
	if frac < 10 {
		s += "0"
	}
	s += strconv.FormatInt(frac, 10)
	if math.Signbit(v) { // "%.3f" keeps the sign of a negative that rounds to 0
		s = "-" + s
	}
	return s
}

// jexact is a point exactly, as the shortest decimals that read back as the
// same float64: what a client hands back to SimulateFrom.
func jexact(v physics.Vec2) string {
	return "[" + strconv.FormatFloat(v.X, 'g', -1, 64) + "," + strconv.FormatFloat(v.Y, 'g', -1, 64) + "]"
}

// versionJSON opens every object a read returns.
const versionJSON = `"version":1`

func jvec(v physics.Vec2) string { return "[" + jnum(v.X) + "," + jnum(v.Y) + "]" }

// jstr quotes a string that a course author controls, so it cannot break out of
// the JSON it lands in.
//
// Every byte below 0x20 is escaped, not only \n and \t: publishing is open,
// and one raw control character in one hole's name would make Holes() invalid
// JSON for every client of every hole.
func jstr(s string) string {
	const hex = "0123456789abcdef"
	b := make([]byte, 0, len(s)+2)
	b = append(b, '"')
	for i := 0; i < len(s); i++ {
		c := s[i]
		switch {
		case c == '"' || c == '\\':
			b = append(b, '\\', c)
		case c < 0x20:
			b = append(b, '\\', 'u', '0', '0', hex[c>>4], hex[c&15])
		default:
			b = append(b, c)
		}
	}
	return string(append(b, '"'))
}

// Holes lists the holes, for a client building a menu: the course's
// current holes first, in course order (world by world, then by order), then
// its maxArchived latest archived versions, latest first, then everyone
// else's current versions, newest first — at most perAuthor of one
// address's, the rest in Community — up to maxListed in all (see listed). official is whether a hole is the
// course's: only those have a cup number and count in the course-wide
// ranking. next is the version that took an archived hole's place, slot the
// version's alias. play is the 3D client's link, successor the realm that
// took the course over ("" if none). Read-only; it decodes nothing.
func Holes() string {
	var sb strings.Builder
	sb.WriteString("{" + versionJSON + `,"play":` + jstr(playURL) + `,"successor":` + jstr(successor) + `,"holes":[`)
	for i, e := range listed() {
		sb.WriteString(sep(i) + holeRow(e))
	}
	sb.WriteString("]}")
	return sb.String()
}

// holeRow is one hole as Holes and Community list it.
func holeRow(e *entry) string {
	s := `{"id":` + jstr(e.id) +
		`,"name":` + jstr(e.name) +
		`,"official":` + strconv.FormatBool(e.official) +
		`,"plays":` + strconv.Itoa(e.plays) +
		`,"best":` + strconv.Itoa(e.rec(assisted).best) +
		`,"proBest":` + strconv.Itoa(e.rec(pro).best) +
		`,"par":` + strconv.Itoa(e.par) +
		`,"world":` + jstr(e.world) + `,"order":` + jnum(e.order) + `,"next":` + jstr(e.next)
	if e.slot != "" {
		s += `,"slot":` + jstr(e.slot)
	}
	return s + "}"
}

// Community is a page of every community hole, every version of each, by id:
// all that Holes leaves out. It is paged like Records.
func Community(after string, limit int) string {
	var sb strings.Builder
	sb.WriteString("{" + versionJSON + `,"rows":[`)
	next := page(bpWalk(community), after, limit, func(i int, _ string, v any) {
		sb.WriteString(sep(i) + holeRow(v.(*entry)))
	})
	sb.WriteString(`],"next":` + jstr(next) + "}")
	return sb.String()
}

// perAuthor is the most published holes of one address Holes and the hub
// list: one address publishing a hundred cannot push everyone else's out.
const perAuthor = 3

// listed is the holes in list order, as many as a list shows (maxListed):
//   - every current course hole, from its slot, in course order;
//   - then, if they leave room for minCommunity more, up to maxArchived
//     archived course versions, the most recently archived first (every
//     version is on its slot's data page);
//   - then, in the room left, community holes, current versions only: the
//     newest of the holes that are among their author's perAuthor newest,
//     newest publish first (by block height; within one block, by alias,
//     last first).
//
// So a community hole is listed if and only if it is one of its author's
// perAuthor newest and fewer than that room of such holes, anyone's, were
// published after it. However many holes an author publishes, they fill
// perAuthor rows at most and push nobody else further down than that; the
// rest are in Community. How many addresses an author holds, or what they
// are, changes nothing but how many rows they fill.
//
// It reads no more than it lists, near enough: authors, the latest to
// publish first, each with their perAuthor newest holes, until the next
// author's latest is older than every row it keeps — at most room+1 authors,
// perAuthor keys each, however much anyone publishes.
func listed() []*entry {
	list := make([]*entry, 0, maxListed)
	full := func() bool { return len(list) >= maxListed }
	slots.Iterate("", "", func(_ string, v any) bool {
		list = append(list, find(v.(string)))
		return full()
	})
	if room := maxListed - minCommunity - len(list); room > 0 {
		if room > maxArchived {
			room = maxArchived
		}
		archived.ReverseIterate("", "", func(_ string, v any) bool {
			list = append(list, find(v.(string)))
			room--
			return room == 0
		})
	}
	room := maxListed - len(list)
	if room <= 0 {
		return list
	}
	// the newest room of the rows seen, newest first, by recentKey(height,
	// alias): an author walked later has only older holes than the one
	// before's latest, so a row past room never comes back
	type seen struct{ key, id string }
	top := make([]seen, 0, room)
	byAuthor.ReverseIterate("", authorRows, func(ak string, _ any) bool {
		if len(top) == room && ak < top[room-1].key {
			return true // their latest, and so all theirs, are older than all kept
		}
		a := ak[13:] + " "
		n := 0
		byAuthor.ReverseIterate(a, a[:len(a)-1]+"!", func(k string, v any) bool {
			// "<address> <height> <slug>" -> "<height> <address>/<slug>"
			key := k[len(a):len(a)+12] + " " + a[:len(a)-1] + "/" + k[len(a)+13:]
			i := len(top)
			for i > 0 && top[i-1].key < key {
				i--
			}
			if i < room {
				if len(top) < room {
					top = append(top, seen{})
				}
				copy(top[i+1:], top[i:len(top)-1])
				top[i] = seen{key, v.(string)}
			}
			n++
			return n == perAuthor
		})
		return false
	})
	for _, s := range top {
		list = append(list, find(s.id))
	}
	return list
}

// authorRows is past the last of byAuthor's author rows ("<height> <address>")
// and before its first hole ("g1…"): no key is ":".
const authorRows = ":"

// maxArchived bounds the archived course versions Holes and the hub list,
// and minCommunity is the room they leave for community holes.
const (
	maxArchived  = 20
	minCommunity = 20
)

// Simulate answers "what would this shot do" without changing anything: a
// first stroke (stroke 0, tick 0) from a ball, in the weather of the moment.
// SimulateFrom is the same with every input given.
//
// It is meant to be called as a read-only query (vm/qeval): no transaction, no
// gas, no block to wait for, no wallet. That is what lets a client animate a
// shot the instant the player releases, and it is also a whole hole playable by
// a visitor who has no account at all — the physics is the chain's either way.
// Nothing is recorded until someone sends a real Launch.
func Simulate(hole string, ballX, ballY, angle, power float64) string {
	e := readHole(hole)
	return simulateFrom(e, e.hole(), ballX, ballY, angle, power, 0, 0, Period())
}

// SimulateFrom previews one shot from an exact ball state, read-only: the
// ball (as Round, SimulateRound or SimulateFrom returned it in "rest"), the
// shot "angle,power,tick", the stroke number it would be (0 is the first:
// timed and pulse holes change with it) and the weather period. It is
// exactly what PlayRoundAt would play for that stroke, for one shot's gas
// where SimulateRound replays the whole round, and it also replays a stroke
// of an old round: any period not ahead is taken. Its JSON is Simulate's.
func SimulateFrom(hole string, ballX, ballY float64, shot string, stroke int, period int64) string {
	notAhead(period)
	validStroke(stroke)
	angle, power, tick := parseShot(shot)
	e := readHole(hole)
	return simulateFrom(e, e.hole(), ballX, ballY, angle, power, stroke, tick, period)
}

func validStroke(stroke int) {
	if stroke < 0 || stroke >= maxRoundStrokes {
		panic("golf: a stroke is between 0 and 59")
	}
}

// onBoard refuses a ball off the hole's board (or not a number): no round
// ever leaves one there, and a preview from one would answer anything.
func onBoard(h course.Hole, x, y float64) physics.Vec2 {
	w, hh := course.BoardOf(h)
	if !(x >= 0 && x <= float64(w) && y >= 0 && y <= float64(hh)) {
		panic("golf: the ball must be on the board")
	}
	return physics.Vec2{X: x, Y: y}
}

func simulateFrom(e *entry, h course.Hole, ballX, ballY, angle, power float64, stroke, tick int, period int64) string {
	ball := onBoard(h, ballX, ballY)
	angle, power = validShot(angle, power)
	shot, holed := resolve(previewAt(h, ball, angle*math.Pi/180, power, stroke, tick, weatherOf(e, h, period).Zones))
	shot = back(h, ball, shot, holed)
	return "{" + versionJSON + `,"holed":` + strconv.FormatBool(holed) + `,"bounces":` + strconv.Itoa(shot.Bounces) + shotJSON(shot) + "}"
}

// shotJSON is a shot's path, air, cause and exact resting point.
func shotJSON(shot physics.Shot) string {
	return `,"path":[` + pathJSON(shot.Path) + `],"air":` + jstr(airOf(shot)) + `,"cause":` + jstr(string(shot.Cause)) +
		`,"rest":` + jexact(shot.Rest())
}

// SimulateRound replays a round from the tee, read-only, and returns its last
// shot plus the stroke count: exactly what PlayRound would record for the same
// shot list, including its refusal of a list too heavy for one commit.
//
// A client can preview shot N this way, sending all N decisions, or with
// SimulateFrom from the exact ball ("rest") the previous answer gave, for the
// gas of one shot. The rounded "ball" and path points are for drawing only:
// after a bounce or two a rounding error is a different ball.
func SimulateRound(hole string, shots string) string {
	e := readHole(hole)
	h := e.hole()
	return simulateRound(e, h, h.Start(), 0, shots, Period())
}

// SimulateRoundAt is SimulateRound in the weather of a given period — the one
// the client shows, so the preview and a PlayRoundAt of it agree. Like a
// round's first stroke, it takes the current period or the one before.
func SimulateRoundAt(hole string, shots string, period int64) string {
	playablePeriod(period)
	e := readHole(hole)
	h := e.hole()
	return simulateRound(e, h, h.Start(), 0, shots, period)
}

// SimulateCommit previews one commit of a round under way, read-only: the
// shots the next PlayRoundAt (or PlayRoundPro) would take, from the exact
// ball ("rest") at stroke number stroke (0 is the first), in the weather of
// period. It refuses what that commit would refuse — too much work, too many
// strokes, a weather over (a first commit takes the current period or the
// one before, a later one a period not two behind) — so a client can check
// every commit of a long round before it signs any. Its JSON is
// SimulateRound's; strokes is the round's count after the commit.
func SimulateCommit(hole string, ballX, ballY float64, stroke int, shots string, period int64) string {
	if stroke == 0 {
		playablePeriod(period)
	} else {
		notAhead(period)
		notOver(period)
	}
	validStroke(stroke)
	e := readHole(hole)
	h := e.hole()
	return simulateRound(e, h, onBoard(h, ballX, ballY), stroke, shots, period)
}

func simulateRound(e *entry, h course.Hole, ball physics.Vec2, strokes int, shots string, period int64) string {
	fc := weatherOf(e, h, period)
	weather := fc.Zones
	list := shotList(shots)
	w := newWork(h, weather)
	w.fixed = fixedGas(e, fc)
	holed := false
	var last physics.Shot
	for _, s := range list {
		if strokes >= maxRoundStrokes {
			panic("golf: this round is over its stroke limit, Reset to play again")
		}
		w.next(h)
		angle, power, tick := parseShot(s)
		angle, power = validShot(angle, power)
		last, holed = resolve(previewAt(h, ball, angle*math.Pi/180, power, strokes, tick, weather))
		last = back(h, ball, last, holed)
		w.add(last)
		ball = last.Rest()
		strokes++
		if holed {
			break
		}
	}
	return "{" + versionJSON + `,"holed":` + strconv.FormatBool(holed) + `,"strokes":` + strconv.Itoa(strokes) +
		`,"bounces":` + strconv.Itoa(last.Bounces) + `,"period":` + strconv.FormatInt(period, 10) +
		shotJSON(last) + "}"
}

func boardJSON(h course.Hole) string {
	w, hh := course.BoardOf(h)
	return `,"board":{"w":` + strconv.Itoa(w) + `,"h":` + strconv.Itoa(hh) + "}"
}

func wallsJSON(ws []physics.Wall) string {
	var sb strings.Builder
	sb.WriteString("[")
	for i := range ws {
		w := &ws[i]
		sb.WriteString(sep(i) + "{" + `"a":` + jvec(w.Seg.A) + `,"b":` + jvec(w.Seg.B) +
			`,"skin":` + jstr(cleanSkin(w.Skin)) + timingJSON(w.Every, w.On, w.Phase) + "}")
	}
	sb.WriteString("]")
	return sb.String()
}

func postsJSON(ps []physics.Post) string {
	var sb strings.Builder
	sb.WriteString("[")
	for i := range ps {
		p := &ps[i]
		sb.WriteString(sep(i) + "{" + `"c":` + jvec(p.C) + `,"r":` + jnum(p.R) +
			`,"skin":` + jstr(cleanSkin(p.Skin)) + "}")
	}
	sb.WriteString("]")
	return sb.String()
}

// zonesJSON is a hole's zones, or the weather's. With flags, a zone that is
// air or capped air says so ("air":true, "capped":true), only when it is: a
// client draws moving air as air whatever its skin. The weather's are always
// printed without (see forecastJSON).
func zonesJSON(zs []physics.Zone, flags bool) string {
	var sb strings.Builder
	sb.WriteString("[")
	for i := range zs {
		z := &zs[i]
		sb.WriteString(sep(i) + "{" + `"kind":` + jstr(z.Kind.String()) +
			`,"min":` + jvec(z.Min) + `,"max":` + jvec(z.Max) +
			`,"vec":` + jvec(z.Vec) + `,"scale":` + jnum(z.Scale) +
			`,"round":` + strconv.FormatBool(z.Round) + polyJSON(z) + timingJSON(z.Every, z.On, z.Phase))
		if flags && z.Air {
			sb.WriteString(`,"air":true`)
		}
		if flags && z.Capped {
			sb.WriteString(`,"capped":true`)
		}
		sb.WriteString(`,"skin":` + jstr(cleanSkin(z.Skin)) + "}")
	}
	sb.WriteString("]")
	return sb.String()
}

// timingJSON is a timed piece's clock (a tram, a storm's gusts); nothing for
// an untimed one.
func timingJSON(every, on, phase int) string {
	if every <= 0 {
		return ""
	}
	return `,"every":` + strconv.Itoa(every) + `,"on":` + strconv.Itoa(on) + `,"phase":` + strconv.Itoa(phase)
}

// polyJSON is a polygon zone's outline, and whether it is the outside of it;
// nothing for the usual rectangle or ellipse.
func polyJSON(z *physics.Zone) string {
	if len(z.Poly) < 3 {
		return ""
	}
	return `,"poly":[` + pathJSON(z.Poly) + `],"outside":` + strconv.FormatBool(z.Outside)
}

// extraZones is what a timed hole lays down at a stroke, if it lays anything.
func extraZones(h course.Hole, stroke int) []physics.Zone {
	if z, ok := h.(course.Zoned); ok {
		return z.ExtraZones(stroke)
	}
	return nil
}

func isTimed(h course.Hole) bool {
	t, ok := h.(course.Timed)
	return ok && t.Varies()
}

// Extras is what a timed hole adds at one stroke of a round (0 is the first
// shot): the blade where it stands, the gate if it is closed. A client draws
// these over State's field for the shot being aimed. Empty for other holes.
func Extras(hole string, stroke int) string {
	h := readHole(hole).hole()
	t, ok := h.(course.Timed)
	if !ok || stroke < 0 {
		return "{" + versionJSON + `,"walls":[],"posts":[],"zones":[]}`
	}
	ws, ps := t.Extras(stroke)
	return "{" + versionJSON + `,"walls":` + wallsJSON(ws) + `,"posts":` + postsJSON(ps) + `,"zones":` + zonesJSON(extraZones(h, stroke), true) + "}"
}

// Leaderboard is a mode's course-wide top ten ("assisted" or "pro"): each
// named player's best finish on each current course hole, summed; most holes
// first, then fewest strokes. It reads the first rows of a ranking kept in
// order as rounds finish, so it costs nothing that grows with the players.
func Leaderboard(mode string) string {
	m := modeOf(mode)
	var sb strings.Builder
	// out of the course's current holes: archived and anyone's do not count
	sb.WriteString("{" + versionJSON + `,"mode":` + jstr(modeNames[m]) + `,"holes":` + strconv.Itoa(slots.Size()) + `,"rows":[`)
	n := 0
	eachRanked(m, func(r *row, _ string) {
		sb.WriteString(sep(n) + standingRow(r.player, r.holes, r.strokes))
		n++
	})
	sb.WriteString("]}")
	return sb.String()
}

// eachRanked walks a mode's top ten: the first named players of its ranking,
// with their names. A name deleted since is skipped, not shown.
func eachRanked(m int, fn func(r *row, name string)) {
	n := 0
	ranks[m].Iterate("", "", func(_ string, v any) bool {
		p := v.(string)
		name := nameOf(p)
		if name == "" {
			return false
		}
		fn(totals[m].Get(p).(*row), name)
		n++
		return n >= topSize
	})
}

// strokesRow and standingRow are the rows the reads list: a player and a
// best, or a player and a standing.
func strokesRow(p string, strokes int) string {
	return `{"player":` + jstr(p) + `,"strokes":` + strconv.Itoa(strokes) + "}"
}

func standingRow(p string, holes, strokes int) string {
	return `{"player":` + jstr(p) + `,"holes":` + strconv.Itoa(holes) + `,"strokes":` + strconv.Itoa(strokes) + "}"
}

// Rank is a player's place in a mode's course ranking: "rank" 1 is the top,
// out of "of" ranked players, with their standing. It is 0 for a player the
// ranking does not hold: unnamed, or with no current course hole finished.
// A ranked name deleted since still takes its place until its next change,
// so the rank may be that many too low; Leaderboard skips such names.
func Rank(mode string, player address) string {
	m := modeOf(mode)
	p := player.String()
	rank, holes, strokes := 0, 0, 0
	if v := totals[m].Get(p); v != nil {
		r := v.(*row)
		holes, strokes = r.holes, r.strokes
		key := rankKey(r)
		if ranks[m].Has(key) {
			rank = ranks[m].index(key) + 1
		}
	}
	return "{" + versionJSON + `,"mode":` + jstr(modeNames[m]) + `,"player":` + jstr(p) +
		`,"rank":` + strconv.Itoa(rank) + `,"of":` + strconv.Itoa(ranks[m].Size()) +
		`,"holes":` + strconv.Itoa(holes) + `,"strokes":` + strconv.Itoa(strokes) + "}"
}

// maxListed bounds Holes() and the hub: anyone can add a hole.
const maxListed = 120

// HoleLeaderboard is a page of one hole's board in a mode: each named
// player's best finished round there, fewest strokes first, from rank
// offset+1 (clamped to 0..players), at most limit rows (clamped to 1..100). players is how many
// named players the board holds (what a client pages through), finished how
// many players finished it, named or not. next is the offset of the next
// page, 0 once there is none: a name deleted since is skipped, so a page may
// hold fewer rows than it covers. A page reads its own rows only, however
// long the board.
func HoleLeaderboard(hole, mode string, offset, limit int) string {
	e, m := readHole(hole), modeOf(mode)
	limit = clampLimit(limit)
	board := e.board(m)
	size := board.Size()
	if offset < 0 {
		offset = 0
	}
	if offset > size {
		offset = size // and offset+limit cannot overflow
	}
	var sb strings.Builder
	sb.WriteString("{" + versionJSON + `,"hole":` + jstr(e.id) + `,"mode":` + jstr(modeNames[m]) +
		`,"par":` + strconv.Itoa(e.par) + `,"players":` + strconv.Itoa(size) + `,"finished":` + strconv.Itoa(e.bests(m).Size()) +
		`,"offset":` + strconv.Itoa(offset) + `,"rows":[`)
	n := 0
	board.IterateByOffset(offset, limit, func(_ string, v any) bool {
		p := v.(string)
		if !named(p) {
			return false // a name deleted since
		}
		sb.WriteString(sep(n) + strokesRow(p, e.bests(m).Get(p).(int)))
		n++
		return false
	})
	next := 0
	if offset+limit < size {
		next = offset + limit
	}
	sb.WriteString(`],"next":` + strconv.Itoa(next) + "}")
	return sb.String()
}

// pageMax is the most rows one page of a read returns.
const pageMax = 100

// clampLimit keeps a page's size to 1..pageMax.
func clampLimit(n int) int {
	if n < 1 {
		return 1
	}
	if n > pageMax {
		return pageMax
	}
	return n
}

// maxFriends bounds the addresses one Bests or Standings read takes.
const maxFriends = 50

// friends splits a comma-separated list of addresses: each valid one once,
// at most maxFriends. Junk and repeats are skipped and use up nothing.
func friends(list string) []string {
	var out []string
	seen := map[string]bool{}
	for _, p := range strings.Split(list, ",") {
		if len(out) == maxFriends {
			break
		}
		if p = strings.TrimSpace(p); p != "" && !seen[p] && address(p).IsValid() {
			seen[p] = true
			out = append(out, p)
		}
	}
	return out
}

// Bests is the best finished round on one hole, in a mode, of each of the
// given players (comma-separated addresses, named or not): a board of
// friends, where no stranger and no bot can push anyone off.
func Bests(hole, mode, players string) string {
	e, m := readHole(hole), modeOf(mode)
	var sb strings.Builder
	sb.WriteString("{" + versionJSON + `,"hole":` + jstr(e.id) + `,"mode":` + jstr(modeNames[m]) + `,"par":` + strconv.Itoa(e.par) + `,"rows":[`)
	n := 0
	for _, p := range friends(players) {
		if v := e.bests(m).Get(p); v != nil {
			sb.WriteString(sep(n) + strokesRow(p, v.(int)))
			n++
		}
	}
	sb.WriteString("]}")
	return sb.String()
}

// Standings is each given player's course-wide standing in a mode: how many
// of the course's current holes they finished, and in how many strokes.
func Standings(mode, players string) string {
	m := modeOf(mode)
	var sb strings.Builder
	sb.WriteString("{" + versionJSON + `,"mode":` + jstr(modeNames[m]) + `,"holes":` + strconv.Itoa(slots.Size()) + `,"rows":[`)
	n := 0
	for _, p := range friends(players) {
		if v := totals[m].Get(p); v != nil {
			r := v.(*row)
			sb.WriteString(sep(n) + standingRow(p, r.holes, r.strokes))
			n++
		}
	}
	sb.WriteString("]}")
	return sb.String()
}

// Records is a page of every player's best on a hole in a mode, named or not.
//
// The paged reads (Records, Players, Rounds) walk everything by address, so
// that anyone — a friends' board, an indexer, a golf/v2 carrying the records
// over — can read all of it a page at a time: after is the last address of
// the page before ("" for the first), limit is clamped to 1..100, and next is
// the after of the next page ("" once there is none).
func Records(hole, mode, after string, limit int) string {
	e, m := readHole(hole), modeOf(mode)
	var sb strings.Builder
	sb.WriteString("{" + versionJSON + `,"hole":` + jstr(e.id) + `,"mode":` + jstr(modeNames[m]) + `,"rows":[`)
	next := page(e.bests(m).Iterate, after, limit, func(i int, p string, v any) {
		sb.WriteString(sep(i) + strokesRow(p, v.(int)))
	})
	sb.WriteString(`],"next":` + jstr(next) + "}")
	return sb.String()
}

// Players is a page of every course standing in a mode, named or not: the
// holes finished among the current course holes, and their strokes. It is
// paged like Records.
func Players(mode, after string, limit int) string {
	m := modeOf(mode)
	var sb strings.Builder
	sb.WriteString("{" + versionJSON + `,"mode":` + jstr(modeNames[m]) + `,"rows":[`)
	next := page(totals[m].Iterate, after, limit, func(i int, p string, v any) {
		r := v.(*row)
		sb.WriteString(sep(i) + standingRow(p, r.holes, r.strokes))
	})
	sb.WriteString(`],"next":` + jstr(next) + "}")
	return sb.String()
}

// Rounds is a page of every round on a hole, as State lists them (no path).
// It is paged like Records.
func Rounds(hole, after string, limit int) string {
	e := readHole(hole)
	var sb strings.Builder
	sb.WriteString("{" + versionJSON + `,"hole":` + jstr(e.id) + `,"rows":[`)
	next := page(e.roundTree().Iterate, after, limit, func(i int, p string, v any) {
		sb.WriteString(sep(i) + roundJSON(e, nil, p, v.(*round), false)) // no path: no hole needed
	})
	sb.WriteString(`],"next":` + jstr(next) + "}")
	return sb.String()
}

// walk is a tree's Iterate: what page reads.
type walk func(start, end string, cb func(key string, v any) bool) bool

func bpWalk(t *bptree.BPTree) walk {
	return func(start, end string, cb func(string, any) bool) bool { return t.Iterate(start, end, cb) }
}

// page walks up to limit entries of t after the key after, and returns the
// key to continue from, "" at the end.
func page(t walk, after string, limit int, fn func(i int, key string, v any)) string {
	limit = clampLimit(limit)
	start := ""
	if after != "" {
		start = after + "\x00" // the first key past after
	}
	n, next, last := 0, "", ""
	t(start, "", func(k string, v any) bool {
		if n == limit {
			next = last
			return true
		}
		fn(n, k, v)
		last = k
		n++
		return false
	})
	return next
}
