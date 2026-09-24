package golf

import (
	"math"
	"strconv"
	"strings"

	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
	"gno.land/p/nt/ufmt/v0"
)

// State is the hole as data: geometry, skins, wear and every round in flight.
//
// It exists for renderers that are not this file — a 3D client reads it over
// vm/qeval and draws a windmill where the geometry says "a bar with skin
// 'sail'". Nothing here decides how anything looks; Skin is a name to
// look up, and the client owns the lookup table.
//
// A shot's `path` is the flight the chain computed. A client replays it. It
// must not re-simulate: the ball would drift away from where the chain says it
// is. Consecutive points far apart mean a tunnel — the ball is elsewhere, do
// not interpolate.
func State(hole string) string {
	e := mustHole(hole)
	f := e.h.Field()

	b := "{" +
		`"hole":` + jstr(e.id) +
		`,"name":` + jstr(e.name) +
		`,"by":` + jstr(e.id) +
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
		sb.WriteString(roundJSON(player, r))
		i++
	})
	sb.WriteString("]}")
	return sb.String()
}

// roundsShown is how many rounds State and the page list at most.
const roundsShown = 24

func roundJSON(player string, r *round) string {
	b := "{" + `"player":` + jstr(player) +
		`,"ball":` + jvec(r.ball) +
		ufmt.Sprintf(`,"strokes":%d,"done":%t,"period":%d`, r.strokes, r.done, r.period) +
		`,"mode":` + jstr(modeNames[r.mode]) +
		`,"shots":` + jstr(strings.Join(r.shots, ";")) +
		`,"path":[`
	var sb strings.Builder
	sb.WriteString(b)
	for j := 0; j+1 < len(r.path); j += 2 {
		sb.WriteString(sep(j / 2))
		sb.WriteString(jvec(physics.Vec2{X: r.path[j], Y: r.path[j+1]}))
	}
	sb.WriteString(`],"air":` + jstr(r.air) + "}")
	return sb.String()
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

// Round is one player's round on a hole, or null if they have none — what a
// client reads back after recording, whatever the size of the hole's history.
func Round(hole string, player address) string {
	e := mustHole(hole)
	v := e.rounds.Get(player.String())
	if v == nil {
		return "null"
	}
	return roundJSON(player.String(), v.(*round))
}

func sep(i int) string {
	if i == 0 {
		return ""
	}
	return ","
}

// jnum never prints NaN or Inf, which are not JSON: a hostile hole returning
// them breaks nothing but shows 0.
func jnum(v float64) string {
	if math.IsNaN(v) || math.IsInf(v, 0) {
		return "0"
	}
	return ufmt.Sprintf("%.3f", v)
}

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

// Holes lists what is registered, for a client building a menu. Read-only.
func Holes() string {
	var sb strings.Builder
	sb.WriteString("[")
	for i, e := range listed() {
		sb.WriteString(sep(i) + "{" + `"id":` + jstr(e.id) +
			`,"name":` + jstr(e.name) +
			`,"by":` + jstr(e.id) +
			ufmt.Sprintf(`,"plays":%d,"best":%d,"proBest":%d,"par":%d`, e.plays, e.best[assisted], e.best[pro], e.par) +
			`,"world":` + jstr(e.world) + `,"order":` + jnum(e.order) + `,"next":` + jstr(e.next) + "}")
	}
	sb.WriteString("]")
	return sb.String()
}

// Simulate answers "what would this shot do" without changing anything.
//
// It is meant to be called as a read-only query (vm/qeval): no transaction, no
// gas, no block to wait for, no wallet. That is what lets a client animate a
// shot the instant the player releases, and it is also a whole hole playable by
// a visitor who has no account at all — the physics is the chain's either way.
// Nothing is recorded until someone sends a real Launch.
func Simulate(hole string, ballX, ballY, angle, power float64) string {
	e := mustHole(hole)
	if math.IsNaN(ballX) || math.IsNaN(ballY) || math.IsInf(ballX, 0) || math.IsInf(ballY, 0) {
		panic("golf: the ball must be on the board")
	}
	angle = validShot(angle, power)
	shot, holed := previewAt(e.h, physics.Vec2{X: ballX, Y: ballY}, angle*math.Pi/180, power, 0, 0, weatherOf(e, Period()).Zones)

	return ufmt.Sprintf(`{"holed":%t,"bounces":%d,"path":[`, holed, shot.Bounces) +
		pathJSON(shot.Path) + `],"air":` + jstr(airOf(shot)) + `,"cause":` + jstr(string(shot.Cause)) + "}"
}

// SimulateRound replays a round from the tee, read-only, and returns its last
// shot plus the stroke count: exactly what PlayRound would record for the same
// shot list.
//
// A client previews shot N this way, sending all N decisions, rather than
// asking Simulate from the ball position it was shown — that position comes
// back rounded, and after a bounce or two a rounding error is a different
// ball. Replaying from the tee is what keeps the free game and the recorded one
// the same game.
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
	ball, strokes, holed := e.h.Start(), 0, false
	var last physics.Shot
	for _, s := range list {
		s = strings.TrimSpace(s)
		if s == "" {
			continue
		}
		angle, power, tick := parseShot(s)
		angle, power = q4(validShot(angle, power)), q4(power)
		last, holed = previewAt(e.h, ball, angle*math.Pi/180, power, strokes, tick, weather)
		ball = last.Rest()
		strokes++
		if holed {
			break
		}
	}
	return ufmt.Sprintf(`{"holed":%t,"strokes":%d,"bounces":%d,"period":%d,"path":[`, holed, strokes, last.Bounces, period) +
		pathJSON(last.Path) + `],"air":` + jstr(airOf(last)) + `,"cause":` + jstr(string(last.Cause)) + "}"
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
		return `{"walls":[],"posts":[],"zones":[]}`
	}
	ws, ps := t.Extras(stroke)
	return `{"walls":` + wallsJSON(ws) + `,"posts":` + postsJSON(ps) + `,"zones":` + zonesJSON(extraZones(e.h, stroke)) + "}"
}

// Leaderboard is the course-wide ranking of recorded rounds: each player's
// best finish on each hole, summed; most holes first, then fewest strokes.
// It is kept up to date as rounds finish, so reading it costs nothing that
// grows with the number of players.
// Leaderboard is a mode's course-wide top ten ("assisted" or "pro").
func Leaderboard(mode string) string {
	m := modeOf(mode)
	var sb strings.Builder
	// out of the course's current holes: archived and anyone's do not count
	sb.WriteString(ufmt.Sprintf(`{"holes":%d,"rows":[`, slots.Size()))
	for i, r := range top[m] {
		sb.WriteString(sep(i) + "{" + `"player":` + jstr(r.player) + ufmt.Sprintf(`,"holes":%d,"strokes":%d}`, r.holes, r.strokes))
	}
	sb.WriteString("]}")
	return sb.String()
}

// maxListed bounds Holes() and the hub: registration is open.
const maxListed = 120

// HoleLeaderboard is a page of one hole's top hundred named players: each one's best
// finished round there, fewest strokes first, from rank offset+1, at most
// limit rows (clamped to 1..100 and to the top hundred), and how many players
// have finished it. A client loads it ten by ten.
// ponytail: a full pass over the hole's players per read, free as a query;
// keep a sorted top hundred per hole if a hole ever has tens of thousands.
func HoleLeaderboard(hole, mode string, offset, limit int) string {
	e, m := mustHole(hole), modeOf(mode)
	if offset < 0 {
		offset = 0
	}
	if limit < 1 {
		limit = 1
	}
	if limit > holeTop {
		limit = holeTop
	}
	keep := offset + limit
	if keep > holeTop {
		keep = holeTop
	}
	type best struct {
		player  string
		strokes int
	}
	var list []best
	e.bests[m].Iterate("", "", func(p string, v any) bool {
		if !named(p) {
			return false // ranked names only; Bests reads anyone
		}
		b := best{p, v.(int)}
		i := len(list)
		for i > 0 && list[i-1].strokes > b.strokes {
			i--
		}
		if i < keep {
			list = append(list, best{})
			copy(list[i+1:], list[i:])
			list[i] = b
			if len(list) > keep {
				list = list[:keep]
			}
		}
		return false
	})
	if offset > len(list) {
		offset = len(list)
	}
	var sb strings.Builder
	sb.WriteString(ufmt.Sprintf(`{"hole":%s,"mode":%s,"par":%d,"players":%d,"offset":%d,"rows":[`, jstr(e.id), jstr(modeNames[m]), e.par, e.bests[m].Size(), offset))
	for i, b := range list[offset:] {
		sb.WriteString(sep(i) + "{" + `"player":` + jstr(b.player) + ufmt.Sprintf(`,"strokes":%d}`, b.strokes))
	}
	sb.WriteString("]}")
	return sb.String()
}

// holeTop is how deep a hole's leaderboard goes.
const holeTop = 100

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
	sb.WriteString(`{"hole":` + jstr(e.id) + `,"mode":` + jstr(modeNames[m]) + ufmt.Sprintf(`,"par":%d,"rows":[`, e.par))
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
	sb.WriteString(ufmt.Sprintf(`{"mode":%s,"holes":%d,"rows":[`, jstr(modeNames[m]), slots.Size()))
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
