package golf

import (
	"math"
	"strconv"
	"strings"

	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
	"gno.land/p/nt/avl/v0"
	"gno.land/p/nt/ufmt/v0"
)

// State is the hole as data: geometry, skins, wear and every round in flight.
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
	e := mustHole(hole)
	f := e.h.Field()

	b := "{" + versionJSON +
		`,"hole":` + jstr(e.id) +
		`,"name":` + jstr(e.name) +
		ufmt.Sprintf(`,"official":%t`, e.official) +
		boardJSON(e.h) +
		ufmt.Sprintf(`,"par":%d`, e.par) +
		`,"world":` + jstr(e.world) + `,"order":` + jnum(e.order) +
		ufmt.Sprintf(`,"timed":%t`, isTimed(e.h)) +
		ufmt.Sprintf(`,"period":%d`, Period()) +
		`,"weather":` + forecastJSON(weatherOf(e, Period())) +
		`,"start":` + jvec(e.h.Start()) +
		`,"cup":` + jvec(e.h.Cup()) +
		ufmt.Sprintf(`,"plays":%d`, e.plays)

	var sb strings.Builder
	sb.WriteString(b)
	sb.WriteString(`,"walls":` + wallsJSON(f.Walls) + `,"posts":` + postsJSON(f.Posts))
	sb.WriteString(`,"zones":` + zonesJSON(f.Zones))
	sb.WriteString(ufmt.Sprintf(`,"wear":{"w":%d,"h":%d,"cells":[`, course.WearW, course.WearH))
	for i, c := range e.h.Wear() {
		sb.WriteString(sep(i))
		sb.WriteString(strconv.Itoa(c))
	}

	// Rounds are capped: every address that ever played keeps one, and a
	// popular hole would otherwise outgrow what one query can print. The total
	// is given; a client that wants one player's round asks Round().
	sb.WriteString(ufmt.Sprintf(`]},"roundsTotal":%d,"rounds":[`, e.rounds.Size()))
	i := 0
	eachRound(e, roundsShown, func(player string, r *round) {
		sb.WriteString(sep(i))
		sb.WriteString(roundJSON(e, player, r, false))
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
func roundJSON(e *entry, player string, r *round, path bool) string {
	var sb strings.Builder
	sb.WriteString("{" + versionJSON + `,"player":` + jstr(player) +
		`,"ball":` + jvec(r.ball()) + `,"rest":` + jexact(r.ball()) +
		ufmt.Sprintf(`,"strokes":%d,"done":%t,"period":%d`, r.strokes, r.done, r.period) +
		`,"mode":` + jstr(modeNames[r.mode]) +
		`,"shots":` + jstr(r.shots))
	if path {
		shot := lastShot(e, r)
		sb.WriteString(`,"path":[` + pathJSON(shot.Path) + `],"air":` + jstr(airOf(shot)) + `,"cause":` + jstr(string(shot.Cause)))
	}
	sb.WriteString("}")
	return sb.String()
}

// lastShot replays a round's last stroke from where it started, read-only:
// the same hole, stroke number, tick and weather, so the same flight (a hole
// plays its Preview as its Play, less the wear). Nothing before a first stroke.
func lastShot(e *entry, r *round) physics.Shot {
	if r.strokes == 0 || r.shots == "" {
		return physics.Shot{}
	}
	s := r.shots
	if i := strings.LastIndex(s, ";"); i >= 0 {
		s = s[i+1:]
	}
	angle, power, tick := parseShot(s)
	shot, _ := previewAt(e.h, physics.Vec2{X: r.fx, Y: r.fy}, angle*math.Pi/180, power, r.strokes-1, tick, weatherOf(e, r.period).Zones)
	return shot
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
	e := mustHole(hole)
	v := e.rounds.Get(player.String())
	if v == nil {
		return "null"
	}
	return roundJSON(e, player.String(), v.(*round), true)
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
// Every byte below 0x20 is escaped, not only \n and \t: registration is open,
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

// Holes lists what is registered, for a client building a menu: the
// course's own holes first, in course order, then anyone's. official is
// whether a hole is one of the course's (see official()); only those have a
// cup number and count in the course-wide ranking. Read-only.
func Holes() string {
	var sb strings.Builder
	sb.WriteString("[")
	for i, e := range listed() {
		sb.WriteString(sep(i) + "{" + `"id":` + jstr(e.id) +
			`,"name":` + jstr(e.name) +
			ufmt.Sprintf(`,"official":%t,"plays":%d,"best":%d,"proBest":%d,"par":%d`, e.official, e.plays, e.best[assisted], e.best[pro], e.par) +
			`,"world":` + jstr(e.world) + `,"order":` + jnum(e.order) + `,"next":` + jstr(e.next) + "}")
	}
	sb.WriteString("]")
	return sb.String()
}

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
	return simulateFrom(mustHole(hole), ballX, ballY, angle, power, 0, 0, Period())
}

// SimulateFrom previews one shot from an exact ball state, read-only: the
// ball (as Round, SimulateRound or SimulateFrom returned it in "rest"), the
// shot "angle,power,tick", the stroke number it would be (0 is the first:
// timed and pulse holes change with it) and the weather period. It is
// exactly what PlayRoundAt would play for that stroke, for one shot's gas
// where SimulateRound replays the whole round. Its JSON is Simulate's.
func SimulateFrom(hole string, ballX, ballY float64, shot string, stroke int, period int64) string {
	notAhead(period)
	if stroke < 0 || stroke >= maxRoundStrokes {
		panic("golf: a stroke is between 0 and 59")
	}
	angle, power, tick := parseShot(shot)
	return simulateFrom(mustHole(hole), ballX, ballY, angle, power, stroke, tick, period)
}

func simulateFrom(e *entry, ballX, ballY, angle, power float64, stroke, tick int, period int64) string {
	if math.IsNaN(ballX) || math.IsNaN(ballY) || math.IsInf(ballX, 0) || math.IsInf(ballY, 0) {
		panic("golf: the ball must be on the board")
	}
	angle, power = validShot(angle, power)
	shot, holed := resolve(previewAt(e.h, physics.Vec2{X: ballX, Y: ballY}, angle*math.Pi/180, power, stroke, tick, weatherOf(e, period).Zones))
	return "{" + versionJSON + ufmt.Sprintf(`,"holed":%t,"bounces":%d`, holed, shot.Bounces) + shotJSON(shot) + "}"
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
	return simulateRound(mustHole(hole), shots, Period())
}

// SimulateRoundAt is SimulateRound in the weather of a given period — the one
// the client shows, so the preview and a PlayRoundAt of it agree.
func SimulateRoundAt(hole string, shots string, period int64) string {
	notAhead(period)
	return simulateRound(mustHole(hole), shots, period)
}

func simulateRound(e *entry, shots string, period int64) string {
	weather := weatherOf(e, period).Zones
	list := strings.Split(shots, ";")
	if len(list) > maxShots {
		panic("golf: too many shots in one round")
	}
	w := newWork(e, weather)
	ball, strokes, holed := e.h.Start(), 0, false
	var last physics.Shot
	for _, s := range list {
		s = strings.TrimSpace(s)
		if s == "" {
			continue
		}
		w.next()
		angle, power, tick := parseShot(s)
		angle, power = validShot(angle, power)
		last, holed = resolve(previewAt(e.h, ball, angle*math.Pi/180, power, strokes, tick, weather))
		w.add(last)
		ball = last.Rest()
		strokes++
		if holed {
			break
		}
	}
	return "{" + versionJSON + ufmt.Sprintf(`,"holed":%t,"strokes":%d,"bounces":%d,"period":%d`, holed, strokes, last.Bounces, period) +
		shotJSON(last) + "}"
}

func boardJSON(h course.Hole) string {
	w, hh := course.BoardOf(h)
	return ufmt.Sprintf(`,"board":{"w":%d,"h":%d}`, w, hh)
}

func wallsJSON(ws []physics.Wall) string {
	var sb strings.Builder
	sb.WriteString("[")
	for i := range ws {
		w := &ws[i]
		sb.WriteString(sep(i) + "{" + `"a":` + jvec(w.Seg.A) + `,"b":` + jvec(w.Seg.B) +
			`,"skin":` + jstr(cleanSkin(w.Skin)))
		if w.Every > 0 { // a wall that comes and goes within the stroke
			sb.WriteString(ufmt.Sprintf(`,"every":%d,"on":%d,"phase":%d`, w.Every, w.On, w.Phase))
		}
		sb.WriteString("}")
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

func zonesJSON(zs []physics.Zone) string {
	var sb strings.Builder
	sb.WriteString("[")
	for i := range zs {
		z := &zs[i]
		sb.WriteString(sep(i) + "{" + `"kind":` + jstr(z.Kind.String()) +
			`,"min":` + jvec(z.Min) + `,"max":` + jvec(z.Max) +
			`,"vec":` + jvec(z.Vec) + `,"scale":` + jnum(z.Scale) +
			ufmt.Sprintf(`,"round":%t`, z.Round) + polyJSON(z) + zoneTiming(z) +
			`,"skin":` + jstr(cleanSkin(z.Skin)) + "}")
	}
	sb.WriteString("]")
	return sb.String()
}

// zoneTiming is a timed zone's clock (a storm's gusts), as walls have theirs.
func zoneTiming(z *physics.Zone) string {
	if z.Every <= 0 {
		return ""
	}
	return ufmt.Sprintf(`,"every":%d,"on":%d,"phase":%d`, z.Every, z.On, z.Phase)
}

// polyJSON is a polygon zone's outline, and whether it is the outside of it;
// nothing for the usual rectangle or ellipse.
func polyJSON(z *physics.Zone) string {
	if len(z.Poly) < 3 {
		return ""
	}
	poly := z.Poly
	if len(poly) > 256 {
		poly = poly[:256] // an outline a query can print
	}
	return `,"poly":[` + pathJSON(poly) + ufmt.Sprintf(`],"outside":%t`, z.Outside)
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
	e := mustHole(hole)
	t, ok := e.h.(course.Timed)
	if !ok || stroke < 0 {
		return "{" + versionJSON + `,"walls":[],"posts":[],"zones":[]}`
	}
	ws, ps := t.Extras(stroke)
	return "{" + versionJSON + `,"walls":` + wallsJSON(ws) + `,"posts":` + postsJSON(ps) + `,"zones":` + zonesJSON(extraZones(e.h, stroke)) + "}"
}

// Leaderboard is a mode's course-wide top ten ("assisted" or "pro"): each
// named player's best finish on each current course hole, summed; most holes
// first, then fewest strokes. It reads the first rows of a ranking kept in
// order as rounds finish, so it costs nothing that grows with the players.
func Leaderboard(mode string) string {
	m := modeOf(mode)
	var sb strings.Builder
	// out of the course's current holes: archived and anyone's do not count
	sb.WriteString("{" + versionJSON + `,"mode":` + jstr(modeNames[m]) + ufmt.Sprintf(`,"holes":%d,"rows":[`, slots.Size()))
	n := 0
	ranks[m].Iterate("", "", func(_ string, v any) bool {
		p := v.(string)
		if !named(p) {
			return false // a name deleted since: skipped, not shown
		}
		r := totals[m].Get(p).(*row)
		sb.WriteString(sep(n) + "{" + `"player":` + jstr(p) + ufmt.Sprintf(`,"holes":%d,"strokes":%d}`, r.holes, r.strokes))
		n++
		return n >= topSize
	})
	sb.WriteString("]}")
	return sb.String()
}

// maxListed bounds Holes() and the hub: registration is open.
const maxListed = 120

// HoleLeaderboard is a page of one hole's board in a mode: each named
// player's best finished round there, fewest strokes first, from rank
// offset+1, at most limit rows (clamped to 1..100). players is how many
// named players the board holds (what a client pages through), finished how
// many players finished it, named or not. A client loads it ten by ten; a
// page reads its own rows only, however long the board.
func HoleLeaderboard(hole, mode string, offset, limit int) string {
	e, m := mustHole(hole), modeOf(mode)
	if offset < 0 {
		offset = 0
	}
	if limit < 1 {
		limit = 1
	}
	if limit > pageMax {
		limit = pageMax
	}
	board := e.board[m]
	if board == nil {
		board = avl.NewTree() // nobody named has finished it yet
	}
	var sb strings.Builder
	sb.WriteString("{" + versionJSON + ufmt.Sprintf(`,"hole":%s,"mode":%s,"par":%d,"players":%d,"finished":%d,"offset":%d,"rows":[`,
		jstr(e.id), jstr(modeNames[m]), e.par, board.Size(), e.bests[m].Size(), offset))
	n := 0
	board.IterateByOffset(offset, limit, func(_ string, v any) bool {
		p := v.(string)
		if !named(p) {
			return false // a name deleted since
		}
		sb.WriteString(sep(n) + "{" + `"player":` + jstr(p) + ufmt.Sprintf(`,"strokes":%d}`, e.bests[m].Get(p).(int)))
		n++
		return false
	})
	sb.WriteString("]}")
	return sb.String()
}

// pageMax is the most rows one page of a read returns.
const pageMax = 100

// maxFriends bounds the addresses one Bests or Standings read takes.
const maxFriends = 50

// friends splits a comma-separated list of addresses, at most maxFriends.
func friends(list string) []string {
	var out []string
	for _, p := range strings.Split(list, ",") {
		if p = strings.TrimSpace(p); p != "" && len(out) < maxFriends {
			out = append(out, p)
		}
	}
	return out
}

// Bests is the best finished round on one hole, in a mode, of each of the
// given players (comma-separated addresses, named or not): a board of
// friends, where no stranger and no bot can push anyone off.
func Bests(hole, mode, players string) string {
	e, m := mustHole(hole), modeOf(mode)
	var sb strings.Builder
	sb.WriteString("{" + versionJSON + `,"hole":` + jstr(e.id) + `,"mode":` + jstr(modeNames[m]) + ufmt.Sprintf(`,"par":%d,"rows":[`, e.par))
	n := 0
	for _, p := range friends(players) {
		if v := e.bests[m].Get(p); v != nil {
			sb.WriteString(sep(n) + "{" + `"player":` + jstr(p) + ufmt.Sprintf(`,"strokes":%d}`, v.(int)))
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
	sb.WriteString("{" + versionJSON + ufmt.Sprintf(`,"mode":%s,"holes":%d,"rows":[`, jstr(modeNames[m]), slots.Size()))
	n := 0
	for _, p := range friends(players) {
		if v := totals[m].Get(p); v != nil {
			r := v.(*row)
			sb.WriteString(sep(n) + "{" + `"player":` + jstr(p) + ufmt.Sprintf(`,"holes":%d,"strokes":%d}`, r.holes, r.strokes))
			n++
		}
	}
	sb.WriteString("]}")
	return sb.String()
}

// The paged reads walk everything by address, so that anyone — a friends'
// board, an indexer, a golf/v2 carrying the records over — can read all of it
// a page at a time: after is the last address of the page before ("" for the
// first), limit is clamped to 1..100, and next is the after of the next page
// ("" once there is none).

// Records is a page of every player's best on a hole in a mode, named or not.
func Records(hole, mode, after string, limit int) string {
	e, m := mustHole(hole), modeOf(mode)
	var sb strings.Builder
	sb.WriteString("{" + versionJSON + `,"hole":` + jstr(e.id) + `,"mode":` + jstr(modeNames[m]) + `,"rows":[`)
	next := page(e.bests[m], after, limit, func(i int, p string, v any) {
		sb.WriteString(sep(i) + "{" + `"player":` + jstr(p) + ufmt.Sprintf(`,"strokes":%d}`, v.(int)))
	})
	sb.WriteString(`],"next":` + jstr(next) + "}")
	return sb.String()
}

// Players is a page of every course standing in a mode, named or not: the
// holes finished among the current course holes, and their strokes.
func Players(mode, after string, limit int) string {
	m := modeOf(mode)
	var sb strings.Builder
	sb.WriteString("{" + versionJSON + `,"mode":` + jstr(modeNames[m]) + `,"rows":[`)
	next := page(totals[m], after, limit, func(i int, p string, v any) {
		r := v.(*row)
		sb.WriteString(sep(i) + "{" + `"player":` + jstr(p) + ufmt.Sprintf(`,"holes":%d,"strokes":%d}`, r.holes, r.strokes))
	})
	sb.WriteString(`],"next":` + jstr(next) + "}")
	return sb.String()
}

// Rounds is a page of every round on a hole, as State lists them (no path).
func Rounds(hole, after string, limit int) string {
	e := mustHole(hole)
	var sb strings.Builder
	sb.WriteString("{" + versionJSON + `,"hole":` + jstr(e.id) + `,"rows":[`)
	next := page(e.rounds, after, limit, func(i int, p string, v any) {
		sb.WriteString(sep(i) + roundJSON(e, p, v.(*round), false))
	})
	sb.WriteString(`],"next":` + jstr(next) + "}")
	return sb.String()
}

// page walks up to limit entries of t after the key after, and returns the
// key to continue from, "" at the end.
func page(t *avl.Tree, after string, limit int, fn func(i int, key string, v any)) string {
	if limit < 1 {
		limit = 1
	}
	if limit > pageMax {
		limit = pageMax
	}
	start := ""
	if after != "" {
		start = after + "\x00" // the first key past after
	}
	n, next, last := 0, "", ""
	t.Iterate(start, "", func(k string, v any) bool {
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
