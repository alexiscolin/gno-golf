// Package golf routes shots to holes and keeps the players' rounds. It knows
// nothing about any particular course: a hole is a realm that registered
// itself, and the only thing golf understands about it is course.Hole.
//
// There is no administrator here. No owner, no pause, no upgrade, no way to
// delist a course — five writes (Register, Launch, PlayRound, PlayRoundAt,
// Reset), all open to anyone. The other half of that
// is that a bad course cannot be taken down.
//
// PlayRound continues the caller's round where it stands. SimulateRound
// always starts from the tee, so a client that previews with it must record
// with Reset + PlayRound in one transaction, as the 3D client does.
//
// A hole's id is the pkgpath of the realm that registered it. Nothing to
// claim, so nothing to squat: gno.land/r/alice/marsh can only ever be alice's.
package golf

import (
	"chain"
	"math"
	"strconv"
	"strings"

	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
	"gno.land/p/nt/avl/v0"
	"gno.land/p/nt/ufmt/v0"
)

const (
	maxPower = 10.0
	maxShots = 12 // bounds a commit: ~150M VM gas a full-power shot on the maze, ~1.8B at most
)

type entry struct {
	world  string  // "garden", "island", "town": read once, at Register
	order  float64 // its place in its world, read once too
	id     string  // pkgpath of the realm that registered it
	name   string  // the hole's name, frozen and cleaned when it registered
	par    int     // its par, read once at Register like the name
	h      course.Hole
	rounds *avl.Tree // player address -> *round
	bests  *avl.Tree // player address -> int: their best finished round here, kept across replays
	plays  int
	bestBy address
	best   int // strokes of the best completed round, 0 if never completed
}

type round struct {
	ball    physics.Vec2
	strokes int
	done    bool
	path    []float64 // the last shot, x,y,x,y…, for whoever is animating it: one flat array, not an object per point
	air     string    // one '0' or '1' per path point: '1' where the ball was in the air
	period  int64     // the weather it is played in: set by its first stroke
	shots   []string  // the decisions so far, "angle,power,tick": the round, replayable
}

var (
	holes  = avl.NewTree() // id -> *entry
	totals = avl.NewTree() // player -> *row: their standing over the official holes
	top    []*row          // the course-wide top ten, kept up to date on every finish
)

// row is one player's standing across the course.
type row struct {
	player         string
	holes, strokes int
}

const topSize = 10

// improve moves a player's running standing by a new best on one official
// hole (was is their old best there, 0 if none) and re-ranks them. Only the
// course's own holes count toward the course-wide ranking: registration is
// open, and a hole decides its own results, so anyone's hole would otherwise
// be a way to the top. (This leans on the chain reserving the gnogolf
// namespace, as gno.land's does.) The standing is kept, not recomputed: a
// finish costs the same however many holes there are.
// A best on anyone else's hole still ranks the player, standing unchanged.
func improve(player string, official bool, was, best int) {
	r := &row{player: player}
	if v := totals.Get(player); v != nil {
		r = v.(*row)
	} else {
		totals.Set(player, r)
	}
	if official && was == 0 {
		r.holes++
		r.strokes += best
	} else if official {
		r.strokes += best - was
	}
	rank(r)
}

// rank puts a player's row in its place in the top ten.
func rank(r *row) {
	player := r.player
	out := make([]*row, 0, topSize+1)
	placed := false
	for _, x := range top {
		if x.player == player {
			continue
		}
		if !placed && better(r, x) {
			out = append(out, r)
			placed = true
		}
		out = append(out, x)
	}
	if !placed {
		out = append(out, r)
	}
	if len(out) > topSize {
		out = out[:topSize]
	}
	top = out
}

func better(a, b *row) bool {
	return a.holes > b.holes || (a.holes == b.holes && a.strokes < b.strokes)
}

// Register is called BY a hole realm, never by a user: MsgCall cannot build a
// course.Hole argument, so a hole publishes itself from its own crossing
// function and golf reads the caller's pkgpath as its id.
func Register(cur realm, h course.Hole) {
	id := cur.Previous().PkgPath()
	if id == "" {
		panic("golf: a hole registers itself — call Register on the hole realm")
	}
	// a deployed realm, not a MsgRun: an ephemeral /e/ package would give
	// every address a free, sourceless hole
	if !strings.HasPrefix(id, "gno.land/r/") {
		panic("golf: only a deployed realm can register a hole")
	}
	if holes.Has(id) {
		panic("golf: already registered: " + id)
	}
	if h == nil {
		panic("golf: nil hole")
	}
	// The name is read once, here, and kept. Lists of every hole then never
	// call into hole code: one hole whose Name panics, loops or returns a
	// megabyte cannot take the hub down for all the others.
	// world and order are read here too, for the same reason
	world := cleanSkin(course.WorldOf(h))
	if world == "" {
		world = "garden"
	}
	order := course.OrderOf(h, float64(holeNo(id)))
	if order != order || order < -1e6 || order > 1e6 { // NaN or silly: by its number
		order = float64(holeNo(id))
	}
	par := course.ParOf(h)
	if par < 1 || par > 20 {
		par = 3
	}
	holes.Set(id, &entry{id: id, name: cleanName(h.Name()), par: par, world: world, order: order, h: h, rounds: avl.NewTree(), bests: avl.NewTree()})
	chain.Emit("hole_registered", "id", id)
}

// Launch is one shot, one transaction. Use it when a shot should land
// immediately; use PlayRound to commit a whole hole at once.
func Launch(cur realm, hole string, angle, power float64) string {
	e := mustHole(hole)
	player := cur.Previous().Address()
	r := playable(e, player)
	if r.strokes == 0 {
		r.period = Period() // a round starts in the weather of the moment, and keeps it
	}

	if stroke(e, r, player, hole, angle, power, 0, weatherOf(e, r.period).Zones) {
		return ufmt.Sprintf("Holed in %d! Your round: /r/gnogolf/golf:%s/%s", r.strokes, hole, player.String())
	}
	// what a player on gnoweb needs for the next shot, with no 3D to look at
	a, d := aim(r.ball, e.h.Cup())
	return ufmt.Sprintf("Stroke %d: the ball stopped %.1f from the cup, which is at %.0f° from it. Your round: /r/gnogolf/golf:%s/%s",
		r.strokes, d, a, hole, player.String())
}

// aim is the angle, in the shot's own degrees (0 = right, 90 = down), and the
// distance from a ball to the cup: a straight line, for a player with only a
// text board to go on — walls and slopes are theirs to allow for.
func aim(from, cup physics.Vec2) (float64, float64) {
	d := cup.Sub(from)
	a := math.Atan2(d.Y, d.X) * 180 / math.Pi
	if a < 0 {
		a += 360
	}
	return a, d.Len()
}

// PlayRound commits a whole hole in one transaction: the shots the player
// already watched resolve through Simulate, replayed here authoritatively.
// Replaying is what makes it unforgeable — the client sends decisions, never
// outcomes.
//
// shots is "angle,power;angle,power;…" because MsgCall cannot carry a slice.
func PlayRound(cur realm, hole string, shots string) string {
	return playRound(mustHole(hole), cur.Previous().Address(), hole, shots, Period())
}

// PlayRoundAt is PlayRound in the weather of a given period: the one the
// client showed while the shots were chosen. Only the current period or the
// one before is accepted, and a round already under way keeps its own.
func PlayRoundAt(cur realm, hole string, shots string, period int64) string {
	return playRound(mustHole(hole), cur.Previous().Address(), hole, shots, period)
}

func playRound(e *entry, player address, hole, shots string, period int64) string {
	r := playable(e, player)
	if r.strokes == 0 {
		playablePeriod(period)
		r.period = period
	} else if r.period != period {
		panic(ufmt.Sprintf("golf: this round is being played in the weather of period %d", r.period))
	}

	list := strings.Split(shots, ";")
	if len(list) > maxShots {
		panic("golf: too many shots in one commit")
	}

	weather := weatherOf(e, r.period).Zones // once for the whole commit
	played := 0
	for _, s := range list {
		s = strings.TrimSpace(s)
		if s == "" {
			continue
		}
		angle, power, tick := parseShot(s)
		played++
		if stroke(e, r, player, hole, angle, power, tick, weather) {
			return ufmt.Sprintf("holed in %d strokes", r.strokes)
		}
	}
	if played == 0 {
		panic("golf: no shots")
	}
	return ufmt.Sprintf("%d shots replayed, ball at %.1f,%.1f after %d strokes",
		played, r.ball.X, r.ball.Y, r.strokes)
}

// Reset puts the caller's ball back on the tee.
func Reset(cur realm, hole string) {
	e := mustHole(hole)
	player := cur.Previous().Address().String()
	e.rounds.Set(player, &round{ball: e.h.Start()})
	chain.Emit("reset", "hole", hole, "player", player)
}

// validShot rejects what would poison a round: NaN and infinities pass every
// comparison, so they are refused by name, and the angle is brought into
// (-360, 360) so a huge one cannot overflow to NaN inside the physics.
func validShot(angle, power float64) float64 {
	if math.IsNaN(angle) || math.IsInf(angle, 0) || math.IsNaN(power) || !(power > 0 && power <= maxPower) {
		panic("golf: a shot is an angle and a power between 0 and 10")
	}
	return math.Mod(angle, 360)
}

// stroke resolves one shot into the round and reports whether it was holed.
func stroke(e *entry, r *round, player address, hole string, angle, power float64, tick int, weather []physics.Zone) bool {
	if r.strokes >= maxRoundStrokes {
		panic("golf: this round is over its stroke limit, Reset to play again")
	}
	// played exactly as it is recorded, so the record replays
	angle, power = q4(validShot(angle, power)), q4(power)

	shot, holed := playAt(e.h, r.ball, angle*math.Pi/180, power, r.strokes, tick, weather)
	// the decisions, as played: what anyone needs to replay the round
	if len(shot.Path) > maxPath {
		panic("golf: the hole returned an oversized path")
	}
	r.shots = append(r.shots, ufmt.Sprintf("%.4f,%.4f,%d", angle, power, tick))
	r.path = r.path[:0]
	for _, p := range shot.Path {
		r.path = append(r.path, p.X, p.Y)
	}
	r.ball, r.air = shot.Rest(), airOf(shot)
	r.strokes++
	e.plays++

	if holed {
		r.done = true
		if e.best == 0 || r.strokes < e.best {
			e.best, e.bestBy = r.strokes, player
		}
		// a player's best stays theirs: replaying the hole never erases it
		if v := e.bests.Get(player.String()); v == nil || r.strokes < v.(int) {
			was := 0
			if v != nil {
				was = v.(int)
			}
			e.bests.Set(player.String(), r.strokes)
			improve(player.String(), strings.HasPrefix(e.id, official), was, r.strokes)
		}
		chain.Emit("holed", "hole", hole, "player", player.String(),
			"strokes", ufmt.Sprintf("%d", r.strokes))
		return true
	}
	chain.Emit("shot", "hole", hole, "player", player.String(),
		"strokes", ufmt.Sprintf("%d", r.strokes))
	return false
}

// official is the range of the course's own holes (the realms under
// r/gnogolf/): they are listed first and are the only ones ranked.
const (
	official    = "gno.land/r/gnogolf/"
	officialEnd = "gno.land/r/gnogolf0" // the key just past every official hole ('/'+1)
)

// maxRoundStrokes bounds one round's history (State shows it); maxPath the
// path a hole may return for one stroke — an honest one is its substeps plus
// a roll-on, a few hundred points at most.
const (
	maxRoundStrokes = 60
	maxPath         = 512
)

// q4 rounds to the precision a shot is recorded at.
func q4(x float64) float64 { return math.Round(x*1e4) / 1e4 }

// maxTick bounds the third field of a shot: any timed piece turns in fewer.
const maxTick = 1023

// parseShot reads "angle,power" or "angle,power,tick". The tick is where the
// timed pieces (tram, sails, clock hand) were when the player let go, chosen
// by their timing at release; without it they start from 0.
func parseShot(s string) (float64, float64, int) {
	parts := strings.Split(s, ",")
	if len(parts) != 2 && len(parts) != 3 {
		panic(`golf: a shot is "angle,power" or "angle,power,tick", got: ` + s)
	}
	angle, err := strconv.ParseFloat(strings.TrimSpace(parts[0]), 64)
	if err != nil {
		panic("golf: bad angle: " + s)
	}
	power, err := strconv.ParseFloat(strings.TrimSpace(parts[1]), 64)
	if err != nil {
		panic("golf: bad power: " + s)
	}
	tick := 0
	if len(parts) == 3 {
		n, err := strconv.Atoi(strings.TrimSpace(parts[2]))
		if err != nil {
			panic("golf: bad tick: " + s)
		}
		if n < 0 {
			n = 0
		}
		if n > maxTick {
			n = maxTick
		}
		tick = n
	}
	return angle, power, tick
}

func mustHole(id string) *entry {
	v := holes.Get(id)
	if v == nil {
		panic("golf: unknown hole: " + id)
	}
	return v.(*entry)
}

func playable(e *entry, player address) *round {
	r := roundOf(e, player)
	if r.done {
		panic("golf: this hole is finished — Reset it to play again")
	}
	return r
}

func roundOf(e *entry, player address) *round {
	if v := e.rounds.Get(player.String()); v != nil {
		return v.(*round)
	}
	r := &round{ball: e.h.Start()}
	e.rounds.Set(player.String(), r)
	return r
}

// cleanName keeps a hole's name to one short line of plain text: no control
// characters, nothing that ends a markdown table cell or opens a link or a tag.
func cleanName(n string) string {
	b := make([]rune, 0, 40)
	for _, c := range n {
		if len(b) >= 40 {
			break
		}
		switch {
		case c < 0x20 || c == 0x7f:
			continue
		case strings.ContainsRune("|[]<>`*_#\\", c):
			continue
		}
		b = append(b, c)
	}
	s := strings.TrimSpace(string(b))
	if s == "" {
		return "Untitled hole"
	}
	return s
}

// cleanSkin keeps a skin to what it is meant to be: a short lower-case id.
func cleanSkin(s string) string {
	b := make([]byte, 0, 24)
	for i := 0; i < len(s) && len(b) < 24; i++ {
		c := s[i]
		if (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == ' ' || c == '-' || c == '_' {
			b = append(b, c)
		}
	}
	return string(b)
}

// previewAt and playAt resolve a stroke of a round: a timed hole is given the
// stroke number, any other hole is played as it always was.
func previewAt(h course.Hole, ball physics.Vec2, angle, power float64, stroke, tick int, weather []physics.Zone) (physics.Shot, bool) {
	if w, ok := h.(course.Weatherable); ok {
		return w.PreviewWith(ball, angle, power, stroke, tick, weather)
	}
	if t, ok := h.(course.Timed); ok {
		return t.PreviewAt(ball, angle, power, stroke)
	}
	return h.Preview(ball, angle, power)
}

func playAt(h course.Hole, ball physics.Vec2, angle, power float64, stroke, tick int, weather []physics.Zone) (physics.Shot, bool) {
	if w, ok := h.(course.Weatherable); ok {
		return w.PlayWith(ball, angle, power, stroke, tick, weather)
	}
	if t, ok := h.(course.Timed); ok {
		return t.PlayAt(ball, angle, power, stroke)
	}
	return h.Play(ball, angle, power)
}
