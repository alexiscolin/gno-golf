package golf

import (
	"chain/runtime"
	"strconv"
	"strings"
	"testing"

	"gno.land/p/nt/testutils/v0"
	"gno.land/p/nt/uassert/v0"
	"gno.land/p/nt/urequire/v0"
)

// The course ranking against a reference model: plain code that keeps what
// happened (every best, per hole and mode, and the finishes that moved a
// standing) and derives the ranking from it the obvious way, as docs/golf.md
// says it:
//
//   - a standing is, over the current course holes, the holes a player has a
//     best on, the strokes of those bests, and the pars of those holes;
//   - the ranking is the named players with a hole, most holes first, then
//     the lowest score against par (strokes - par), then the earliest height
//     of the finish that last improved the standing, then the address;
//   - a named player is ranked from their first finish or Claim with the name.
//
// Every read of the standings must say the same as the model at every step.

type refBest struct {
	strokes int
	height  int64
}

type refHole struct {
	id      string
	par     int
	current bool
	bests   [modes]map[string]refBest
}

type ref struct {
	holes   []*refHole
	players []string
	named   map[string]bool
	moved   [modes]map[string]int64 // the height of the last finish that moved a standing
	seen    [modes]map[string]bool  // a standing row exists (a first finish that counted)
	ranked  [modes]map[string]bool  // seated in the ranking
}

func newRef() *ref {
	r := &ref{named: map[string]bool{}}
	for m := 0; m < modes; m++ {
		r.moved[m], r.seen[m], r.ranked[m] = map[string]int64{}, map[string]bool{}, map[string]bool{}
	}
	return r
}

func (r *ref) addHole(id string, par int) *refHole {
	h := &refHole{id: id, par: par, current: true}
	for m := 0; m < modes; m++ {
		h.bests[m] = map[string]refBest{}
	}
	r.holes = append(r.holes, h)
	return h
}

// standing is a player's standing, from their bests on the current holes.
func (r *ref) standing(m int, p string) (holes, strokes, par int) {
	for _, h := range r.holes {
		if b, ok := h.bests[m][p]; ok && h.current {
			holes, strokes, par = holes+1, strokes+b.strokes, par+h.par
		}
	}
	return
}

// before is the ranking's order: most holes, the lowest score against par,
// the earliest last move, the address.
func (r *ref) before(m int, a, b string) bool {
	ha, sa, pa := r.standing(m, a)
	hb, sb, pb := r.standing(m, b)
	if ha != hb {
		return ha > hb
	}
	if sa-pa != sb-pb {
		return sa-pa < sb-pb
	}
	if r.moved[m][a] != r.moved[m][b] {
		return r.moved[m][a] < r.moved[m][b]
	}
	return a < b
}

// ranking is the ranked players, in order.
func (r *ref) ranking(m int) []string {
	var out []string
	for _, p := range r.players {
		if h, _, _ := r.standing(m, p); h > 0 && r.ranked[m][p] {
			out = append(out, p)
		}
	}
	for i := 1; i < len(out); i++ { // insertion sort: a few players
		for j := i; j > 0 && r.before(m, out[j], out[j-1]); j-- {
			out[j], out[j-1] = out[j-1], out[j]
		}
	}
	return out
}

// settle is what a standing change does to the ranking: a named player with
// a hole ranks, anyone else not.
func (r *ref) settle(m int, p string) {
	h, _, _ := r.standing(m, p)
	r.ranked[m][p] = h > 0 && r.named[p]
}

// seat is a named player's finish or Claim: ranked if they have a hole.
func (r *ref) seat(m int, p string) {
	if h, _, _ := r.standing(m, p); h > 0 && r.named[p] {
		r.ranked[m][p] = true
	}
}

// finish is a holed round of n strokes: a better best is kept, and on a
// current hole it moves the standing, now.
func (r *ref) finish(h *refHole, m int, p string, n int) {
	b, had := h.bests[m][p]
	if !had || n < b.strokes {
		h.bests[m][p] = refBest{n, runtime.ChainHeight()}
		if h.current {
			r.moved[m][p], r.seen[m][p] = runtime.ChainHeight(), true
			r.settle(m, p)
		}
	}
	r.seat(m, p)
}

// archive is a hole replaced by a new version of par par: its bests leave
// the standings (the moves stay: no finish moved them).
func (r *ref) archive(h *refHole, id string, par int) *refHole {
	h.current = false
	for m := 0; m < modes; m++ {
		for p := range h.bests[m] {
			r.settle(m, p)
		}
	}
	return r.addHole(id, par)
}

// check reads every standing read the realm has and holds it to the model.
func (r *ref) check(t *testing.T, step string) {
	t.Helper()
	all := strings.Join(r.players, ",")
	for m := 0; m < modes; m++ {
		mode := modeNames[m]
		fields := func(p string) string {
			h, s, par := r.standing(m, p)
			return `"holes":` + strconv.Itoa(h) + `,"strokes":` + strconv.Itoa(s) + `,"par":` + strconv.Itoa(par)
		}
		// StandingOf, Standings, Rank, Players: every player's numbers
		rows := ""
		for _, p := range r.players {
			h, s, par := r.standing(m, p)
			gh, gs, gp := StandingOf(mode, address(p))
			urequire.True(t, gh == h && gs == s && gp == par, step+": StandingOf "+mode+" "+p+": "+fields(p))
			if r.seen[m][p] {
				if rows != "" {
					rows += ","
				}
				rows += `{"player":"` + p + `",` + fields(p) + "}"
			}
			rk := Rank(mode, address(p))
			urequire.True(t, strings.HasSuffix(rk, ","+fields(p)+"}"), step+": "+rk)
			urequire.Equal(t, r.ranked[m][p] && h > 0, jfield(rk, "rank") != "0", step+": ranked? "+rk)
		}
		urequire.Equal(t, `{"version":1,"mode":"`+mode+`","holes":`+strconv.Itoa(slots.Size())+`,"rows":[`+rows+`]}`, Standings(mode, all), step)
		players := ""
		for after := ""; ; {
			pg := Players(mode, after, 100)
			players += pg
			if after = jfield(pg, "next"); after == "" {
				break
			}
		}
		for _, p := range r.players {
			if r.seen[m][p] {
				want := `{"player":"` + p + `",` + fields(p) + `,"height":` + strconv.FormatInt(r.moved[m][p], 10) + "}"
				urequire.True(t, strings.Contains(players, want), step+": Players has "+want)
			}
		}
		// CourseLeaderboard, every page: the model's players in the model's
		// order, and Rank's places in that order
		want := r.ranking(m)
		var got []string
		board := ""
		for off := 0; ; {
			pg := CourseLeaderboard(mode, off, 100)
			board += pg
			for _, s := range strings.Split(pg, `{"player":"`)[1:] {
				if p := s[:strings.Index(s, `"`)]; r.has(p) {
					got = append(got, p)
				}
			}
			if off, _ = strconv.Atoi(jfield(pg, "next")); off == 0 {
				break
			}
		}
		urequire.Equal(t, strings.Join(want, " "), strings.Join(got, " "), step+": the "+mode+" ranking")
		last := 0
		for _, p := range want {
			urequire.True(t, strings.Contains(board, `{"player":"`+p+`","name":"`+nameOf(p)+`",`+fields(p)+"}"), step+": its row, "+p)
			n, _ := strconv.Atoi(jfield(Rank(mode, address(p)), "rank"))
			urequire.True(t, n > last, step+": Rank in the ranking's order")
			last = n
		}
		// the top ten is the ranking's first page
		top, first := Leaderboard(mode), CourseLeaderboard(mode, 0, 10)
		urequire.Equal(t, first[strings.Index(first, `"rows":`):strings.Index(first, `],"next"`)+1], top[strings.Index(top, `"rows":`):len(top)-1], step+": the top ten")
		// Records: every best, current or archived
		for _, h := range r.holes {
			rows := ""
			for _, p := range r.sorted() {
				if b, ok := h.bests[m][p]; ok {
					if rows != "" {
						rows += ","
					}
					rows += `{"player":"` + p + `","strokes":` + strconv.Itoa(b.strokes) + `,"height":` + strconv.FormatInt(b.height, 10) + "}"
				}
			}
			urequire.Equal(t, `{"version":1,"hole":"`+h.id+`","mode":"`+mode+`","rows":[`+rows+`],"next":""}`, Records(h.id, mode, "", 100), step)
		}
	}
}

func (r *ref) has(p string) bool {
	for _, x := range r.players {
		if x == p {
			return true
		}
	}
	return false
}

// sorted is the players by address, as the realm's trees keep them.
func (r *ref) sorted() []string {
	out := append([]string{}, r.players...)
	for i := 1; i < len(out); i++ {
		for j := i; j > 0 && out[j] < out[j-1]; j-- {
			out[j], out[j-1] = out[j-1], out[j]
		}
	}
	return out
}

// rng is a fixed sequence (an LCG): the same run every time.
type rng struct{ s uint64 }

func (g *rng) n(k int) int {
	g.s = g.s*6364136223846793005 + 1442695040888963407
	return int((g.s >> 33) % uint64(k))
}

// holeIn plays a round of n strokes (n-1 taps, then the soft putt a
// cupHole takes) in mode m, in commits of maxShots.
func holeIn(cur realm, p address, id string, m, n int) {
	testing.SetRealm(testing.NewUserRealm(p))
	Reset(cross(cur), id)
	shots := strings.Split(strokesOf(n), ";")
	for i := 0; i < len(shots); i += maxShots {
		j := i + maxShots
		if j > len(shots) {
			j = len(shots)
		}
		testing.SetRealm(testing.NewUserRealm(p))
		if m == pro {
			PlayRoundPro(cross(cur), id, strings.Join(shots[i:j], ";"), Period())
		} else {
			PlayRoundAt(cross(cur), id, strings.Join(shots[i:j], ";"), Period())
		}
	}
}

// Random runs of finishes (better, worse, tied, in both modes, at the
// extremes: 1 and 60 strokes on par 1 to 19), names taken late and Claims,
// community finishes and archived holes, the model checked after each step.
func TestTheRankingIsTheModel(cur realm, t *testing.T) {
	pars := []int{1, 2, 3, 5, 19}
	for run, seed := range []uint64{7, 1234567, 99} {
		g := &rng{seed}
		r := newRef()
		tag := "rm" + strconv.Itoa(run)
		var holes []*refHole
		for i, par := range pars {
			h := cupHole("mines", 100+10*run+i, "Model "+strconv.Itoa(i))
			h.Strokes = par
			holes = append(holes, r.addHole(publish(cur, h), par))
		}
		community := mine(cur, tag+"c", cupHole("pond", 1, "Model pond"))
		var ps []address
		for i := 0; i < 6; i++ {
			p := testutils.TestAddress(tag + "p" + strconv.Itoa(i))
			ps = append(ps, p)
			r.players = append(r.players, p.String())
			if i%2 == 0 { // half named from the start
				giveName(cur, p, tag+"p"+strconv.Itoa(i))
				r.named[p.String()] = true
			}
		}
		versions := 1
		r.check(t, tag+" start")
		// an unnamed player's finish keeps a standing, unranked; a name alone
		// does not rank it, Claim does
		late := ps[1]
		holeIn(cur, late, holes[run].id, run%modes, holes[run].par)
		r.finish(holes[run], run%modes, late.String(), holes[run].par)
		r.check(t, tag+" unnamed")
		giveName(cur, late, tag+"late")
		r.named[late.String()] = true
		r.check(t, tag+" named")
		testing.SetRealm(testing.NewUserRealm(late))
		Claim(cross(cur))
		r.seat(run%modes, late.String())
		uassert.True(t, r.ranked[run%modes][late.String()], "claimed")
		r.check(t, tag+" claimed")
		for step := 0; step < 70; step++ {
			p := ps[g.n(len(ps))]
			who := p.String()
			m := g.n(modes)
			what := ""
			switch k := g.n(100); {
			case k < 60: // a round on a current hole, near its par or at an extreme
				var h *refHole
				for h == nil || !h.current {
					h = holes[g.n(len(holes))]
				}
				n := h.par - 2 + g.n(5)
				switch g.n(10) {
				case 0:
					n = 1
				case 1:
					n = maxRoundStrokes
				}
				if n < 1 {
					n = 1
				}
				holeIn(cur, p, h.id, m, n)
				r.finish(h, m, who, n)
				what = "finish " + h.id + " " + strconv.Itoa(n)
			case k < 67: // a round on an archived hole: its record only
				var h *refHole
				for _, x := range holes {
					if !x.current {
						h = x
					}
				}
				if h == nil {
					continue
				}
				n := 1 + g.n(4)
				holeIn(cur, p, h.id, m, n)
				r.finish(h, m, who, n)
				what = "archived " + h.id + " " + strconv.Itoa(n)
			case k < 75:
				testing.SkipHeights(int64(1 + g.n(3)))
				what = "heights"
			case k < 82: // a name, taken late
				if r.named[who] {
					continue
				}
				giveName(cur, p, tag+"late"+strconv.Itoa(step))
				r.named[who] = true
				what = "named"
			case k < 88: // Claim
				if !r.named[who] {
					continue
				}
				testing.SetRealm(testing.NewUserRealm(p))
				Claim(cross(cur))
				for mm := 0; mm < modes; mm++ {
					for _, h := range holes {
						if _, ok := h.bests[mm][who]; ok && h.current {
							r.seat(mm, who)
						}
					}
				}
				what = "claim"
			case k < 93: // a community hole: no standing moves, a name seats
				holeIn(cur, p, community, m, 1)
				r.seat(m, who)
				what = "community"
			default: // a new version of a hole, at another par
				i := g.n(len(holes))
				for !holes[i].current {
					i = g.n(len(holes))
				}
				par := pars[g.n(len(pars))]
				versions++
				old := holes[i]
				h := cupHole("mines", int(mustHole(old.id).order), "Model v"+strconv.Itoa(versions))
				h.Strokes = par
				id := publish(cur, h)
				for len(archiving) > 0 {
					drain(drainMax)
				}
				holes = append(holes, r.archive(old, id, par))
				what = "archive " + old.id + " for " + id
			}
			r.check(t, tag+" step "+strconv.Itoa(step)+" ("+what+" by "+who+" "+modeNames[m]+")")
		}
	}
}

// The ranking's key sorts as the rule at its extremes: every hole of a full
// course (maxCourse) at 60 strokes on par 1 (the most over par a standing
// can be), or holed in one on par 19 (the most under), a standing past the
// slots while republished holes drain (maxCourse+1, +2), and rows drawn at
// random in between; its numbers keep their widths.
func TestTheRankingKeySortsAsTheRule(t *testing.T) {
	rows := []*row{
		{player: "g1a", holes: maxCourse, strokes: 60 * maxCourse, par: maxCourse, height: 1},
		{player: "g1b", holes: maxCourse, strokes: maxCourse, par: 19 * maxCourse, height: 999999999999},
		{player: "g1i", holes: maxCourse, strokes: maxCourse, par: 18 * maxCourse, height: 1},
		{player: "g1j", holes: maxCourse, strokes: 59 * maxCourse, par: maxCourse, height: 1},
		{player: "g1c", holes: maxCourse, strokes: maxCourse, par: maxCourse, height: 5},
		{player: "g1d", holes: 1, strokes: 1, par: 19, height: 5},
		{player: "g1e", holes: 1, strokes: 60, par: 1, height: 5},
		{player: "g1f", holes: 1, strokes: 2, par: 2, height: 4},
		{player: "g1g", holes: 1, strokes: 5, par: 5, height: 4}, // level with g1f: the address
		{player: "g1h", holes: 0, strokes: 0, par: 0, height: 9},
		{player: "g1k", holes: maxCourse + 1, strokes: 60 * (maxCourse + 1), par: maxCourse + 1, height: 9},
		{player: "g1l", holes: maxCourse + 2, strokes: 60 * (maxCourse + 2), par: maxCourse + 2, height: 9},
		{player: "g1m", holes: maxCourse + 2, strokes: maxCourse + 2, par: 19 * (maxCourse + 2), height: 9},
	}
	g := &rng{42}
	for i := 0; i < 300; i++ {
		h := g.n(maxCourse + 3)
		if i%2 == 0 { // as many holes as others: the score decides
			h = []int{1, 2, 74, 92, maxCourse, maxCourse + 1, maxCourse + 2}[g.n(7)]
		}
		par := h + g.n(18*h+1) // 1 to 19 a hole
		rows = append(rows, &row{player: "g1r" + strconv.Itoa(i), holes: h, strokes: h + g.n(59*h+1), par: par, height: int64(g.n(1000))})
	}
	rule := func(a, b *row) bool {
		if a.holes != b.holes {
			return a.holes > b.holes
		}
		if a.strokes-a.par != b.strokes-b.par {
			return a.strokes-a.par < b.strokes-b.par
		}
		if a.height != b.height {
			return a.height < b.height
		}
		return a.player < b.player
	}
	width := len(rankKey(rows[0])) - len(rows[0].player)
	for _, a := range rows {
		uassert.Equal(t, width, len(rankKey(a))-len(a.player), "fixed widths: "+rankKey(a))
		for _, b := range rows {
			if a != b {
				uassert.Equal(t, rule(a, b), rankKey(a) < rankKey(b), rankKey(a)+" and "+rankKey(b))
			}
		}
	}
	uassert.True(t, rankKey(rows[5]) < rankKey(rows[6]), "a hole at par counts the same whatever its par")
}

// The course holds at most maxCourse slots: the ranking's key has room for
// them and for the archived versions a standing still counts while they
// drain.
func TestTheCourseIsBounded(cur realm, t *testing.T) {
	var fill []string
	for i := slots.Size(); i < maxCourse; i++ {
		k := "~" + pad(i, 5) // after every world's slots
		slots.Set(k, "")
		fill = append(fill, k)
	}
	defer func() {
		for _, k := range fill {
			slots.Remove(k)
		}
	}()
	h := cupHole("mines", 999, "One too many")
	urequire.AbortsContains(t, cur, "the course is full", func() { publish(cur, h) })
}
