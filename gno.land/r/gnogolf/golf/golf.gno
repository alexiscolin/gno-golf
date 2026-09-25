// Package golf routes shots to holes and keeps the players' rounds. It knows
// nothing about any particular course: a hole is a realm that registered
// itself, and the only thing golf understands about it is course.Hole.
//
// There is no owner, no pause and no upgrade here, and no way to delete a
// hole or a record. The writes are Register, Launch, PlayRound, PlayRoundAt,
// PlayRoundPro and Reset, all open to anyone. The other half of that is that
// a bad hole cannot be taken down.
//
// One party does hold a real power: whoever may publish under r/gnogolf/ (the
// chain's namespace rule, not a key held here). A realm there that registers
// the same world and order as a course hole takes its place in the cup, so
// that party can archive any course hole and so shape the course-wide
// ranking, and can publish new course holes. The old hole is archived, never
// erased: still playable, its records kept and shown. On a public chain this
// rests on the chain enforcing namespaces (r/sys/names): see official().
//
// PlayRound continues the caller's round where it stands. SimulateRound
// always starts from the tee, so a client that previews with it records with
// Reset + PlayRoundAt (or PlayRoundPro) in one transaction, as the 3D client
// does. SimulateFrom previews one shot from an exact ball.
//
// A hole's id is the pkgpath of the realm that registered it. Nothing to
// claim, so nothing to squat: gno.land/r/alice/marsh can only ever be alice's.
package golf

import (
	"chain"
	"chain/runtime"
	"math"
	"strconv"
	"strings"

	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
	"gno.land/p/nt/avl/v0"
	"gno.land/p/nt/ufmt/v0"
	"gno.land/r/sys/names"
	"gno.land/r/sys/users"
)

const (
	maxPower = 10.0
	// maxShots is the longest shot list one commit takes. What really bounds a
	// commit is its work (see workBudget): on a heavy hole fewer shots fit.
	maxShots = 12
)

type entry struct {
	world string  // "garden", "island", "town": read once, at Register
	order float64 // its place in its world, read once too
	id    string  // pkgpath of the realm that registered it
	name  string  // the hole's name, frozen and cleaned when it registered
	par   int     // its par, read once at Register like the name
	// official: one of the course's own holes, decided once at Register (see
	// official()). Only these take a cup slot and count in the ranking.
	official bool
	h        course.Hole
	rounds   *avl.Tree // player address -> *round
	plays    int
	// per mode (assisted, pro): each player's best finished round here, kept
	// across replays, and the hole's record, 0 if never completed
	bests  [modes]*avl.Tree // player address -> int
	board  [modes]*avl.Tree // boardKey(strokes, player) -> player: the named players' bests, fewest strokes first; made at the first named finish
	bestBy [modes]address
	best   [modes]int
	next   string // the official hole that took this one's place, "" while it is current
	// while archived players still count in the standings (see drain); nil
	// for a hole never archived
	out *draining
}

// draining is how far an archived hole's players are out of the standings:
// per mode, the next player to take out, and whether all are out.
type draining struct {
	from [modes]string
	done [modes]bool
}

type round struct {
	bx, by  float64 // the ball, exactly: flat fields, not a nested Vec2 object
	fx, fy  float64 // where the last stroke started: its path is replayed from there
	strokes int
	done    bool
	period  int64  // the weather it is played in: set by its first stroke
	shots   string // the decisions so far, "angle,power,tick;…": the round, replayable
	mode    int    // assisted or pro: set by its first stroke, like the weather
}

func (r *round) ball() physics.Vec2 { return physics.Vec2{X: r.bx, Y: r.by} }

// A round is played in one of two modes, and each has its own records and
// rankings. Assisted is the 3D client with its full aim preview; pro is the
// same game with the preview cut short. The chain cannot see a screen: the
// mode is the player's word, like a handicap. Simulate stays open to all.
const (
	assisted = iota
	pro
	modes
)

// modeOf reads a mode's name: "assisted" (or ""), or "pro". Anything else is
// a mistake, and a read says so rather than answer for another mode.
func modeOf(name string) int {
	switch name {
	case "", "assisted":
		return assisted
	case "pro":
		return pro
	}
	panic(`golf: a mode is "assisted" or "pro", got: ` + name)
}

var modeNames = [modes]string{"assisted", "pro"}

var (
	holes = avl.NewTree() // id -> *entry
	slots = avl.NewTree() // "world/order" -> id of the current official hole there
	// per mode: player -> *row, their standing over the official holes (only
	// players with an official finish have one)
	totals = [modes]*avl.Tree{avl.NewTree(), avl.NewTree()}
	// per mode: rankKey(row) -> player, the named players with at least one
	// hole, best first. The course top ten is its first ten entries.
	ranks = [modes]*avl.Tree{avl.NewTree(), avl.NewTree()}
	// archived holes whose players still count in the standings, oldest
	// first: drain takes them out a batch at a time
	archiving []string
)

// row is one player's standing across the course.
type row struct {
	player         string
	holes, strokes int
}

const topSize = 10

// named reports whether a player has a gno.land name (r/sys/users). Only
// named players enter the rankings: an address is free, a name is not, so a
// script cannot fill the boards with a thousand accounts. Every finish is
// still kept, named or not — a player who takes a name later ranks on their
// next finish, and friends' boards (Bests, Standings) read anyone.
func named(player string) bool {
	return !users.ResolveAddress(address(player)).IsDeleted()
}

// official reports whether a hole's id makes it one of the course's own: it
// is under r/gnogolf/, and the chain enforces namespaces, so only the
// namespace's holder can publish there. Without enforcement anyone could
// deploy under r/gnogolf/ and take over the cups.
//
// Two local chains are let through without it, so a gnodev course is
// playable: "dev" and "test-gnogolf". On any public chain (pearl-1 and the
// rest) r/sys/names must be enabled and the gnogolf name registered to the
// course's author, or no hole is official there.
func official(id string) bool {
	if !strings.HasPrefix(id, officialPrefix) {
		return false
	}
	switch runtime.ChainID() {
	case "dev", "test-gnogolf":
		return true
	}
	return names.IsEnabled()
}

// pad writes n in width digits, zeros first: keys that sort as numbers.
func pad(n, width int) string {
	s := strconv.Itoa(n)
	for len(s) < width {
		s = "0" + s
	}
	return s
}

// rankKey orders the course ranking: most holes first, then fewest strokes,
// then the address.
func rankKey(r *row) string {
	return pad(9999-r.holes, 4) + "/" + pad(r.strokes, 7) + "/" + r.player
}

// boardKey orders a hole's board: fewest strokes first, then the address.
func boardKey(strokes int, player string) string { return pad(strokes, 3) + "/" + player }

// setRow moves a player's standing and keeps the ranking in step. A row
// with no hole left is removed: it ranks nowhere, and its storage is freed.
func setRow(m int, r *row, holes, strokes int) {
	ranks[m].Remove(rankKey(r))
	r.holes, r.strokes = holes, strokes
	if r.holes <= 0 {
		totals[m].Remove(r.player)
		return
	}
	if named(r.player) {
		ranks[m].Set(rankKey(r), r.player)
	}
}

// improve moves a player's standing by a new best on one official hole (was
// is their old best there, 0 if none). Only the course's own holes count
// toward the course-wide ranking: registration is open, and a hole decides
// its own results, so anyone's hole would otherwise be a way to the top. The
// standing is kept, not recomputed: a finish costs the same however many
// holes and players there are.
func improve(m int, player string, was, best int) {
	r := &row{player: player}
	if v := totals[m].Get(player); v != nil {
		r = v.(*row)
	} else {
		totals[m].Set(player, r)
	}
	if was == 0 {
		setRow(m, r, r.holes+1, r.strokes+best)
	} else {
		setRow(m, r, r.holes, r.strokes+best-was)
	}
}

// Register is called BY a hole realm, never by a user: MsgCall cannot build a
// course.Hole argument, so a hole publishes itself from its own code (its
// init(cur realm), or a crossing function of its own) and golf reads the
// caller's pkgpath as its id.
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
	// The name, world, order and par are read once, here, and kept. Lists of
	// every hole then never call into hole code: one hole whose Name panics,
	// loops or returns a megabyte cannot take the hub down for all the others.
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
	e := &entry{id: id, name: cleanName(h.Name()), par: par, world: world, order: order, official: official(id), h: h, rounds: avl.NewTree(),
		bests: [modes]*avl.Tree{avl.NewTree(), avl.NewTree()}}
	holes.Set(id, e)
	chain.Emit("hole_registered", "id", id)
	// a place in a cup is a world and a number: a hole with neither has none
	if e.official && order != float64(holeNo("")) {
		slot := world + "/" + strconv.FormatFloat(order, 'g', -1, 64)
		if old := slots.Get(slot); old != nil {
			retire(mustHole(old.(string)), id)
		}
		slots.Set(slot, id)
	}
}

// retire archives an official hole replaced by a newer one: its players'
// bests there leave their course-wide standing, which the new hole starts
// afresh. The bests themselves stay on the old hole, shown as its records.
//
// Taking them out is done in batches (drain): the replacing Register takes
// the first retireBatch, and every finish after it takes a few more. Until
// the last one is out, a player not yet reached still counts the old hole.
func retire(old *entry, next string) {
	old.next, old.out = next, &draining{}
	archiving = append(archiving, old.id)
	chain.Emit("hole_retired", "id", old.id, "next", next)
	drain(retireBatch)
}

// How many archived players a Register and a finish take out of the
// standings: each costs a standing read and write and a ranking key.
const (
	retireBatch = 400
	finishBatch = 16
)

// drain takes up to n archived players out of the standings, oldest
// archived hole first.
func drain(n int) {
	for n > 0 && len(archiving) > 0 {
		e := mustHole(archiving[0])
		d := e.out
		for m := 0; m < modes && n > 0; m++ {
			if d.done[m] {
				continue
			}
			stopped := e.bests[m].Iterate(d.from[m], "", func(p string, v any) bool {
				if n == 0 {
					d.from[m] = p
					return true
				}
				if r := totals[m].Get(p); r != nil {
					setRow(m, r.(*row), r.(*row).holes-1, r.(*row).strokes-v.(int))
				}
				n--
				return false
			})
			if !stopped {
				d.done[m] = true
			}
		}
		if d.done[assisted] && d.done[pro] {
			archiving = archiving[1:]
		}
	}
}

// counts reports whether a best on e by player still moves their standing:
// e is a current official hole, or an archived one whose drain has not yet
// reached them (it will take the new best out with the rest).
func counts(e *entry, m int, player string) bool {
	if !e.official {
		return false
	}
	return e.next == "" || !(e.out.done[m] || player < e.out.from[m])
}

// Launch is one shot, one transaction, and always a pro round: it is how
// gnoweb plays, with no aim preview. Use it when a shot should land
// immediately; use PlayRoundAt to commit a whole hole at once.
func Launch(cur realm, hole string, angle, power float64) string {
	e := mustHole(hole)
	player := cur.Previous().Address()
	r := playable(e, player)
	if r.strokes == 0 {
		r.period = Period() // a round starts in the weather of the moment, and keeps it
		// one shot at a time from a text board, with no aim line to go on:
		// a pro round by construction
		r.mode = pro
	} else if r.mode != pro {
		panic("golf: this round is being played in " + modeNames[r.mode] + " mode")
	}

	if _, holed := stroke(e, r, player, hole, angle, power, 0, weatherOf(e, r.period).Zones); holed {
		return ufmt.Sprintf("Holed in %d! Your round: /r/gnogolf/golf:%s/%s", r.strokes, hole, player.String())
	}
	// what a player on gnoweb needs for the next shot, with no 3D to look at
	a, d := aim(r.ball(), e.h.Cup())
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

// PlayRound commits shots in the current weather, assisted, continuing the
// caller's round: the shots the player already watched, replayed here
// authoritatively. Replaying is what makes it unforgeable — the client sends
// decisions, never outcomes.
//
// shots is "angle,power;angle,power;…" because MsgCall cannot carry a slice.
// A commit takes at most maxShots shots, and fewer on a heavy hole: past its
// work budget it is refused before the shot that would overrun it, with the
// number that fit, and the rest goes in the next commit.
func PlayRound(cur realm, hole string, shots string) string {
	return playRound(mustHole(hole), cur.Previous().Address(), hole, shots, Period(), assisted)
}

// PlayRoundAt is PlayRound in the weather of a given period: the one the
// client showed while the shots were chosen. Only the current period or the
// one before is accepted, and a round already under way keeps its own.
func PlayRoundAt(cur realm, hole string, shots string, period int64) string {
	return playRound(mustHole(hole), cur.Previous().Address(), hole, shots, period, assisted)
}

// PlayRoundPro is PlayRoundAt for a round played in pro mode: the aim
// preview cut short. It counts on the pro records and rankings only.
func PlayRoundPro(cur realm, hole string, shots string, period int64) string {
	return playRound(mustHole(hole), cur.Previous().Address(), hole, shots, period, pro)
}

func playRound(e *entry, player address, hole, shots string, period int64, mode int) string {
	r := playable(e, player)
	if r.strokes == 0 {
		playablePeriod(period)
		r.period, r.mode = period, mode
	} else if r.period != period {
		panic(ufmt.Sprintf("golf: this round is being played in the weather of period %d", r.period))
	} else if r.mode != mode {
		panic("golf: this round is being played in " + modeNames[r.mode] + " mode")
	}

	list := strings.Split(shots, ";")
	if len(list) > maxShots {
		panic("golf: too many shots in one commit")
	}

	weather := weatherOf(e, r.period).Zones // once for the whole commit
	w := newWork(e, weather)
	for _, s := range list {
		s = strings.TrimSpace(s)
		if s == "" {
			continue
		}
		w.next()
		angle, power, tick := parseShot(s)
		shot, holed := stroke(e, r, player, hole, angle, power, tick, weather)
		w.add(shot)
		if holed {
			return ufmt.Sprintf("holed in %d strokes", r.strokes)
		}
	}
	if w.played == 0 {
		panic("golf: no shots")
	}
	return ufmt.Sprintf("%d shots replayed, ball at %.1f,%.1f after %d strokes",
		w.played, r.bx, r.by, r.strokes)
}

// work is what a commit has cost so far, estimated from what its shots did.
//
// A stroke's gas is mostly the physics: a fixed part, a set-up per wall, then
// per path point (one per substep, roll-on included) a cost of its own and a
// test per piece on the board. The constants were fitted on the 592 full-power
// shots of the 74 holes (8 angles each, from the tee, the forecast's own gas
// taken out), as the tightest fit that is at least
// the measured gas of every one of them, then raised by a fifth. The heaviest
// shot measured 78M; its estimate is 125M.
//
// Before each shot but the first, a commit that would pass workBudget with
// one more shot as heavy as its heaviest so far is refused, with the number
// of shots that fit: a transaction the chain could not finish is refused with
// a clear sentence instead of running out of gas, and the rest goes in the
// next commit (PlayRound* continue the round). SimulateRound refuses the same
// list the same way, so a client learns it before it signs.
//
// Note: an estimate, not a gas meter (gno has none). If the physics gets
// cheaper these constants only err on the safe side; refit them if it gets
// dearer.
type work struct {
	walls, pieces int64 // on the board this commit: walls, and walls+posts+zones
	spent, most   int64
	played        int
}

// The budget: of the 2e9 gas Adena lets a transaction simulate, 1.4e9 for the
// shots, and the rest for one shot heavier than estimated, the forecast (up
// to 0.17e9 measured, in the rain on the lane holes), the package loads and
// the bookkeeping.
const (
	workBudget   = 1400000000
	workPerShot  = 10000000
	workPerWall  = 150000
	workPerPoint = 1200000
	workPerPiece = 15000
)

func newWork(e *entry, weather []physics.Zone) *work {
	f := e.h.Field()
	w := &work{}
	if f != nil {
		w.walls = int64(len(f.Walls))
		w.pieces = int64(len(f.Walls) + len(f.Posts) + len(f.Zones))
	}
	w.pieces += int64(len(weather))
	return w
}

// next refuses the next shot if it could overrun the budget.
func (w *work) next() {
	if w.played > 0 && w.spent+w.most > workBudget {
		panic(ufmt.Sprintf("golf: more shots than one transaction can replay on this hole: commit the first %d, then the rest", w.played))
	}
}

func (w *work) add(s physics.Shot) {
	c := workPerShot + w.walls*workPerWall + int64(len(s.Path))*(workPerPoint+w.pieces*workPerPiece)
	w.spent += c
	if c > w.most {
		w.most = c
	}
	w.played++
}

// Reset puts the caller's ball back on the tee: their round is dropped (and
// its storage freed), and the next stroke starts a new one.
func Reset(cur realm, hole string) {
	e := mustHole(hole)
	player := cur.Previous().Address().String()
	e.rounds.Remove(player)
	chain.Emit("reset", "hole", hole, "player", player)
}

// validShot rejects what would poison a round, and returns the shot as it
// is recorded. NaN and infinities pass every comparison, so they are refused
// by name. The power is quantized before it is checked, so what passes is
// what is recorded and replayed (a power of 0.00001 would round to 0). The
// angle is brought into (-360, 360), so a huge one cannot overflow to NaN
// inside the physics, and after rounding too, so a -359.99996 is recorded as
// the -0 it is played at, not as -360.
func validShot(angle, power float64) (float64, float64) {
	if math.IsNaN(angle) || math.IsInf(angle, 0) || math.IsNaN(power) {
		panic("golf: a shot is an angle and a power between 0 and 10")
	}
	power = q4(power)
	if !(power > 0 && power <= maxPower) {
		panic("golf: a shot is an angle and a power between 0 and 10")
	}
	angle = q4(math.Mod(angle, 360))
	if angle <= -360 || angle >= 360 {
		angle = math.Mod(angle, 360)
	}
	return angle, power
}

// resolve checks what a hole returned for a stroke: a path it may print, and
// a ball that ends on the board. A hole is anyone's code.
func resolve(shot physics.Shot, holed bool) (physics.Shot, bool) {
	if len(shot.Path) > maxPath {
		panic("golf: the hole returned an oversized path")
	}
	rest := shot.Rest()
	if math.IsNaN(rest.X) || math.IsNaN(rest.Y) || math.IsInf(rest.X, 0) || math.IsInf(rest.Y, 0) {
		panic("golf: the hole returned a ball off the board")
	}
	return shot, holed
}

// stroke resolves one shot into the round and reports whether it was holed.
func stroke(e *entry, r *round, player address, hole string, angle, power float64, tick int, weather []physics.Zone) (physics.Shot, bool) {
	if r.strokes >= maxRoundStrokes {
		panic("golf: this round is over its stroke limit, Reset to play again")
	}
	// every stroke, not only the first: a round left for later cannot be
	// finished days on in the weather it picked
	if r.period < Period()-1 {
		panic(ufmt.Sprintf("golf: this round's weather (period %d) is over: Reset to play again", r.period))
	}
	// played exactly as it is recorded, so the record replays
	angle, power = validShot(angle, power)

	from := r.ball()
	shot, holed := resolve(playAt(e.h, from, angle*math.Pi/180, power, r.strokes, tick, weather))
	// the decisions, as played: what anyone needs to replay the round
	if r.shots != "" {
		r.shots += ";"
	}
	r.shots += ufmt.Sprintf("%.4f,%.4f,%d", angle, power, tick)
	rest := shot.Rest()
	r.fx, r.fy, r.bx, r.by = from.X, from.Y, rest.X, rest.Y
	r.strokes++
	e.plays++

	if holed {
		r.done = true
		m := r.mode
		if e.best[m] == 0 || r.strokes < e.best[m] {
			e.best[m], e.bestBy[m] = r.strokes, player
		}
		// a player's best stays theirs: replaying the hole never erases it
		p := player.String()
		if v := e.bests[m].Get(p); v == nil || r.strokes < v.(int) {
			was := 0
			if v != nil {
				was = v.(int)
				if e.board[m] != nil {
					e.board[m].Remove(boardKey(was, p))
				}
			}
			e.bests[m].Set(p, r.strokes)
			if named(p) {
				if e.board[m] == nil {
					e.board[m] = avl.NewTree()
				}
				e.board[m].Set(boardKey(r.strokes, p), p)
			}
			if counts(e, m, p) {
				improve(m, p, was, r.strokes)
			}
		}
		drain(finishBatch)
		chain.Emit("holed", "hole", hole, "player", p,
			"strokes", strconv.Itoa(r.strokes), "mode", modeNames[m])
		return shot, true
	}
	chain.Emit("shot", "hole", hole, "player", player.String(),
		"strokes", strconv.Itoa(r.strokes))
	return shot, false
}

// officialPrefix is the range of the course's own holes (the realms under
// r/gnogolf/): they are listed first, and on a chain that enforces
// namespaces they are the only ones ranked.
const (
	officialPrefix = "gno.land/r/gnogolf/"
	officialEnd    = "gno.land/r/gnogolf0" // the key just past every official hole ('/'+1)
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
	s := e.h.Start()
	r := &round{bx: s.X, by: s.Y}
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
