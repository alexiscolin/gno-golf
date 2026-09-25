// Package golf routes shots to holes and keeps the players' rounds. It knows
// nothing about any particular course: the only thing golf understands about
// a hole is course.Hole.
//
// Every hole is data: a GG1 string (see p/…/course). A course hole is
// published by the course's owner into a slot of a cup ("garden/7"), each
// version its own entry ("garden/7/v1", "garden/7/v2"). Anyone can publish
// data of their own the same way ("<address>/<slug>/v1", PublishMine): a
// community hole, playable and recorded, never part of the course or its
// ranking. No hole runs code of its own: golf decodes the data and plays it
// with p/…/physics. Who can change what is on the hub page (noAdmin); in
// short, the owner holds one power, the course itself.
//
// Reads take a version's id or its alias ("garden/7", "<address>/<slug>"),
// which is the current version. Writes take the exact id only, the one State
// or Holes gave: a round cannot be replayed on a version it was not played
// on.
//
// PlayRoundAt continues the caller's round where it stands. SimulateRound
// always starts from the tee, so a client that previews with it records with
// Reset + PlayRoundAt (or PlayRoundPro) in one transaction, as the 3D client
// does. SimulateFrom previews one shot from an exact ball, SimulateCommit a
// whole commit from one.
package golf

import (
	"chain"
	"chain/runtime"
	"math"
	"strconv"
	"strings"
	"unicode"

	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
	"gno.land/p/nt/avl/v0"
	bptree "gno.land/p/nt/bptree/v0"
	"gno.land/p/nt/ufmt/v0"
	"gno.land/r/sys/users"
)

const (
	maxPower = 10.0
	// maxShots is the longest shot list one commit takes. What really bounds a
	// commit is its work (see workBudget): on a heavy hole fewer shots fit.
	maxShots = 12
)

type entry struct {
	id    string // "<alias>/v<n>"
	name  string // the hole's name, cleaned; frozen when it was published
	par   int    // frozen like the name
	world string // "garden", "island", "town": frozen too
	order float64
	// official: one of the course's own holes, a version the owner published
	// into a slot, current or archived since. Only these count in the ranking.
	official bool
	// its provenance, set when it was published. Its hole is decoded afresh
	// for each call (hole()) and never stored.
	slot    string  // the alias it answers to: "garden/7", "<address>/<slug>"
	version int     // its number under that alias, from 1
	by      address // who published it
	height  int64
	sha     string // sha256 of its data, hex
	note    string
	wear    []byte // WearW*WearH little-endian u32 counters, made at its first play
	// What players add (rounds, bests, the board) is rows of the shared
	// indexes, under the version's id (roundTree, bests, board), not trees of
	// its own: a tree's first leaf is a few KB, which the version's first
	// player would pay.
	plays int
	// the assisted and the pro records (rec), flat: an array or a pointer is
	// an object of its own, a few hundred bytes more
	best, proBest     int
	bestBy, proBestBy address
	next              string // the version that took this one's place, "" while it is current
	// while archived players still count in the standings (see drain); nil
	// for a hole never archived
	out *draining
}

// record is the hole's record in one mode: who holds it, in how many
// strokes, 0 if never completed.
type record struct {
	by   address
	best int
}

// rec is the entry's record in mode m.
func (e *entry) rec(m int) record {
	if m == pro {
		return record{e.proBestBy, e.proBest}
	}
	return record{e.bestBy, e.best}
}

// roundTree is the version's rounds: player address -> *round.
func (e *entry) roundTree() view { return view{rounds, e.id + " "} }

// bests is the version's results in mode m: player address -> their best
// finished round there, kept across replays.
func (e *entry) bests(m int) view { return view{bests, e.id + " " + modeNames[m] + " "} }

// board is the version's board in mode m: boardKey(strokes, player) ->
// player, the named players' bests, fewest strokes first.
func (e *entry) board(m int) view { return view{boards, e.id + " " + modeNames[m] + " "} }

// view is the rows of a shared index under one prefix, read and written
// without it: a version's rounds, a mode's standings. p ends with a space,
// which no id holds, so the rows are exactly the keys from p to p with the
// space made a "!".
type view struct {
	t *bptree.BPTree
	p string
}

func (v view) end() string                 { return v.p[:len(v.p)-1] + "!" }
func (v view) Get(k string) any            { return v.t.Get(v.p + k) }
func (v view) Has(k string) bool           { return v.t.Has(v.p + k) }
func (v view) Set(k string, x any) bool    { return v.t.Set(v.p+k, x) }
func (v view) Remove(k string) (any, bool) { return v.t.Remove(v.p + k) }
func (v view) Size() int                   { return before(v.t, v.end()) - before(v.t, v.p) }
func (v view) index(k string) int          { return before(v.t, v.p+k) - before(v.t, v.p) }
func (v view) strip(cb func(string, any) bool) func(string, any) bool {
	return func(k string, x any) bool { return cb(k[len(v.p):], x) }
}

// Iterate is the rows in [start, end) ascending, end "" for no bound.
func (v view) Iterate(start, end string, cb func(key string, x any) bool) bool {
	hi := v.end()
	if end != "" {
		hi = v.p + end
	}
	return v.t.Iterate(v.p+start, hi, v.strip(cb))
}

// IterateByOffset is count rows from the offset-th, fewer at the end.
func (v view) IterateByOffset(offset, count int, cb func(key string, x any) bool) bool {
	end := v.end()
	return v.t.IterateByOffset(before(v.t, v.p)+offset, count, func(k string, x any) bool {
		return k >= end || v.strip(cb)(k, x)
	})
}

// before is how many keys of t sort before k: a binary search by index.
func before(t *bptree.BPTree, k string) int {
	lo, hi := 0, t.Size()
	for lo < hi {
		mid := (lo + hi) / 2
		if key, _ := t.GetByIndex(mid); key < k {
			lo = mid + 1
		} else {
			hi = mid
		}
	}
	return lo
}

// seeded is a shared index with its first leaf made at init, paid by golf's
// deployer, not by the first player to write to it. Its one key, "", sorts
// before every view's rows, so no view sees it.
func seeded() *bptree.BPTree {
	t := bptree.NewBPTree32()
	t.Set("", nil)
	return t
}

func newEntry(id, name string, par int, world string, order float64) *entry {
	return &entry{id: id, name: name, par: par, world: world, order: order}
}

// hole is the entry's hole for this call, decoded from its data. A public
// call decodes it once and passes it down; nothing keeps it, so it is never
// stored.
func (e *entry) hole() course.Hole {
	s, err := course.Decode(holeData.Get(e.id).(string))
	if err != nil {
		panic("golf: the data of " + e.id + " does not decode: " + err.Error()) // checked at publish: cannot happen
	}
	return &dataHole{Simple: s, e: e}
}

// draining is how far an archived hole's players are out of the standings:
// per mode, the next player to take out, whether all are out, and the
// players whose best there was never counted (a first finish on it after it
// was archived), whom the drain must not take out.
type draining struct {
	from  [modes]string
	done  [modes]bool
	fresh [modes]*avl.Tree // player -> true
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

// The indexes are B+ trees: a leaf holds 32 entries, so past the first few
// an entry costs about 410 bytes instead of an AVL node's 2,030. What players
// add is in five of them, shared by every version and both modes and seeded
// at init (views): a version's first player pays for their own rows only,
// like any other.
//
// A B+ tree must not change while it is iterated: no callback below writes
// to the tree it walks (drain walks a hole's bests and writes the standings).
var (
	// the course's versions, current and archived: id -> *entry
	courseHoles = bptree.NewBPTree32()
	// everyone else's published data: id -> *entry
	community = bptree.NewBPTree32()
	// a data version's GG1 string, apart from its entry, so that listing
	// holes never loads it: id -> string
	holeData = bptree.NewBPTree32()
	// slotKey(world, order) -> id of the current version there: the course,
	// in course order
	slots = bptree.NewBPTree32()
	// "<address>/<slug>" -> id of the current version of a community hole
	aliases = bptree.NewBPTree32()
	// the community holes by author, two kinds of rows in one tree (a tree's
	// first leaf is a few KB, which the first to publish would pay):
	//   - "<address> " + recentKey(its publish height, slug) -> id of the
	//     current version of a community hole: an author's own, newest last;
	//   - recentKey(their latest publish height, address) -> nil: one row per
	//     author, the latest to publish last (authorRows).
	// A height is digits and an address "g1…": the two never mix.
	byAuthor = bptree.NewBPTree32()
	// recentKey(the height it was archived at, id) -> id of an archived
	// course version: the latest last
	archived = bptree.NewBPTree32()
	// every version's rounds, bests and boards, under its id (roundTree,
	// bests, board)
	rounds, bests, boards = seeded(), seeded(), seeded()
	// per mode: player -> *row, their standing over the official holes (only
	// players with an official finish have one)
	allTotals = seeded()
	totals    = [modes]view{{allTotals, "assisted "}, {allTotals, "pro "}}
	// per mode: rankKey(row) -> player, the named players with at least one
	// hole, best first. The course top ten is its first ten entries.
	allRanks = seeded()
	ranks    = [modes]view{{allRanks, "assisted "}, {allRanks, "pro "}}
	// per mode: rankKey(row) -> player, the keys of those who had a ranking
	// key and have no hole left (setRow), which nothing ranks
	idle = [modes]view{{allRanks, "idle assisted "}, {allRanks, "idle pro "}}
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

// nameOf is a named player's name, "" for anyone else.
func nameOf(player string) string {
	if u := users.ResolveAddress(address(player)); !u.IsDeleted() {
		return u.Name()
	}
	return ""
}

// find is the hole with this exact id, nil if none.
func find(id string) *entry {
	if v := courseHoles.Get(id); v != nil {
		return v.(*entry)
	}
	if v := community.Get(id); v != nil {
		return v.(*entry)
	}
	return nil
}

// current is the id an alias points at now: a course slot's or a community
// hole's current version; "" if it is neither.
func current(alias string) string {
	if k, ok := slotKeyOf(alias); ok {
		if v := slots.Get(k); v != nil {
			return v.(string)
		}
		return ""
	}
	if v := aliases.Get(alias); v != nil {
		return v.(string)
	}
	return ""
}

// mustHole is the hole a write names: its exact id. An alias is refused: a
// new version may have taken its place since the round's shots were chosen.
func mustHole(id string) *entry {
	if e := find(id); e != nil {
		return e
	}
	if now := current(id); now != "" {
		panic("golf: " + id + " is an alias: play its version by id, " + now)
	}
	panic("golf: unknown hole: " + id)
}

// readHole is the hole a read names: an exact id, or an alias for its
// current version.
func readHole(id string) *entry {
	if e := find(id); e != nil {
		return e
	}
	if now := current(id); now != "" {
		return find(now)
	}
	panic("golf: unknown hole: " + id)
}

// recentKey orders by height, then by what is at that height.
func recentKey(height int64, what string) string { return pad(int(height), 12) + " " + what }

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

// setRow moves a player's standing and keeps the ranking in step. A
// standing with no hole left ranks nowhere, and neither it nor its ranking
// key is freed: the key moves to idle, apart from the ranking and 5 bytes
// longer, since its storage deposit is the player's, and freeing it would
// refund whoever drained it. It moves back at the player's next hole.
func setRow(m int, r *row, holes, strokes int) {
	k := rankKey(r)
	_, had := ranks[m].Remove(k)
	if _, ok := idle[m].Remove(k); ok {
		had = true
	}
	r.holes, r.strokes = holes, strokes
	switch {
	case r.holes > 0 && named(r.player):
		ranks[m].Set(rankKey(r), r.player)
	case had:
		idle[m].Set(rankKey(r), r.player)
	}
}

// improve moves a player's standing by a new best on one official hole (was
// is their old best there, 0 if none). Only the course's own holes count
// toward the course-wide ranking: anyone can publish a hole, and a hole
// decides its own results, so anyone's hole would otherwise be a way to the
// top. The standing is kept, not recomputed: a finish costs the same however
// many holes and players there are.
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

// retire archives an official hole replaced by a newer one: its players'
// bests there leave their course-wide standing, which the new hole starts
// afresh. The bests themselves stay on the old hole, shown as its records.
//
// Taking them out is done in batches (drain): the replacing Publish takes
// the first retireBatch, every finish after it takes a few more, and anyone
// can take more with Drain. Until the last one is out, a player not yet
// reached still counts the old hole.
func retire(old *entry, next string) {
	old.next, old.out = next, &draining{}
	archived.Set(recentKey(runtime.ChainHeight(), old.id), old.id)
	archiving = append(archiving, old.id)
	chain.Emit(EventHoleRetired, "hole", old.id, "next", next)
	drain(retireBatch)
}

// How many archived players a Publish, a finish on a course hole and one
// Drain take out of the standings. Each costs a standing read and write and
// a ranking key: about 0.43M of compute and 2 to 4M on chain. So a Publish
// stays under about 0.8B however many played the version it archives, and a
// finish pays 8 to 16M more while a drain is under way, not 32 to 64M.
const (
	retireBatch = 150
	finishBatch = 4
	drainMax    = 400
)

// drain takes up to n archived players out of the standings, oldest
// archived hole first.
func drain(n int) {
	for n > 0 && len(archiving) > 0 {
		e := find(archiving[0])
		d := e.out
		for m := 0; m < modes && n > 0; m++ {
			if d.done[m] {
				continue
			}
			stopped := e.bests(m).Iterate(d.from[m], "", func(p string, v any) bool {
				if n == 0 {
					d.from[m] = p
					return true
				}
				if d.fresh[m] == nil || !d.fresh[m].Has(p) {
					if r := totals[m].Get(p); r != nil {
						setRow(m, r.(*row), r.(*row).holes-1, r.(*row).strokes-v.(int))
					}
				}
				n--
				return false
			})
			if !stopped {
				d.done[m] = true
			}
		}
		if d.done[assisted] && d.done[pro] {
			if len(archiving) == 1 {
				archiving = nil // the backing array goes with it
			} else {
				archiving = archiving[1:]
			}
		}
	}
}

// Drain takes up to n players (1 to 400) of archived holes out of the
// course standings, for anyone who wants the ranking settled sooner than the
// finishes would settle it. It returns how many archived holes still have
// players in the standings. A standing it empties is kept at 0 holes, its
// ranking key kept aside (setRow), so no player's row is freed and refunded
// to the caller.
func Drain(cur realm, n int) int {
	if n < 1 {
		n = 1
	}
	if n > drainMax {
		n = drainMax
	}
	drain(n)
	return len(archiving)
}

// counts reports whether a best on e by player (was: their best there
// before, 0 if none) moves their standing: e is a current official hole, or
// an archived one whose drain has not yet reached them and on which they
// already counted (the drain takes the new best out with the rest). A first
// finish on an archived hole never counts.
func counts(e *entry, m int, player string, was int) bool {
	if !e.official {
		return false
	}
	if e.next == "" {
		return true
	}
	if was == 0 || e.out.done[m] || player < e.out.from[m] {
		return false
	}
	return e.out.fresh[m] == nil || !e.out.fresh[m].Has(player)
}

// Launch is one shot, one transaction, and always a pro round: it is how
// gnoweb plays, with no aim preview. Use it when a shot should land
// immediately; use PlayRoundAt to commit a whole hole at once. It answers
// with the version's id, as every link it gives does.
func Launch(cur realm, hole string, angle, power float64) string {
	e := mustHole(hole)
	h := e.hole()
	player := cur.Previous().Address()
	r := playable(e, h, player)
	if r.strokes == 0 {
		r.period = Period() // a round starts in the weather of the moment, and keeps it
		// one shot at a time from a text board, with no aim line to go on:
		// a pro round by construction
		r.mode = pro
	} else if r.mode != pro {
		panic("golf: this round is being played in " + modeNames[r.mode] + " mode")
	}

	if _, holed := stroke(e, h, r, player, angle, power, 0, weatherOf(e, h, r.period).Zones); holed {
		return ufmt.Sprintf("Holed in %d on %s! Your round: %s:%s/%s", r.strokes, e.id, hub, e.id, player.String())
	}
	// what a player on gnoweb needs for the next shot, with no 3D to look at
	a, d := aim(r.ball(), h.Cup())
	return ufmt.Sprintf("Stroke %d on %s: the ball stopped %.1f from the cup, which is at %.0f° from it. Your round: %s:%s/%s",
		r.strokes, e.id, d, a, hub, e.id, player.String())
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

// PlayRound is PlayRoundAt in the period of the moment, for a caller that
// has none to give (a form, a script): a round already under way keeps its
// own. Prefer PlayRoundAt: a commit included after the weather turned is
// played in the weather that was showing when its shots were chosen.
func PlayRound(cur realm, hole string, shots string) string {
	e, p := mustHole(hole), cur.Previous().Address()
	period := Period()
	if v := e.roundTree().Get(p.String()); v != nil && v.(*round).strokes > 0 {
		period = v.(*round).period // stroke() still refuses a stale one
	}
	return playRound(e, p, shots, period, assisted)
}

// PlayRoundAt commits shots, assisted, continuing the caller's round: the
// shots the player already watched, replayed here authoritatively, in the
// weather of the period the client showed while they were chosen. Replaying
// is what makes it unforgeable — the client sends decisions, never outcomes.
// Only the current period or the one before is accepted, and a round already
// under way keeps its own.
//
// shots is "angle,power;angle,power;…" because MsgCall cannot carry a slice;
// empty entries are skipped. A commit takes at most maxShots shots, and fewer
// on a heavy hole: past its work budget it is refused before the shot that
// would overrun it, with the number that fit, and the rest goes in the next
// commit.
func PlayRoundAt(cur realm, hole string, shots string, period int64) string {
	return playRound(mustHole(hole), cur.Previous().Address(), shots, period, assisted)
}

// PlayRoundPro is PlayRoundAt for a round played in pro mode: the aim
// preview cut short. It counts on the pro records and rankings only.
func PlayRoundPro(cur realm, hole string, shots string, period int64) string {
	return playRound(mustHole(hole), cur.Previous().Address(), shots, period, pro)
}

func playRound(e *entry, player address, shots string, period int64, mode int) string {
	h := e.hole()
	r := playable(e, h, player)
	if r.strokes == 0 {
		playablePeriod(period)
		r.period, r.mode = period, mode
	} else if r.period != period {
		panic(ufmt.Sprintf("golf: this round is being played in the weather of period %d", r.period))
	} else if r.mode != mode {
		panic("golf: this round is being played in " + modeNames[r.mode] + " mode")
	}

	list := shotList(shots)
	weather := weatherOf(e, h, r.period).Zones // once for the whole commit
	w := newWork(h, weather)
	for _, s := range list {
		w.next()
		angle, power, tick := parseShot(s)
		shot, holed := stroke(e, h, r, player, angle, power, tick, weather)
		w.add(shot)
		if holed {
			return ufmt.Sprintf("holed in %d strokes", r.strokes)
		}
	}
	return ufmt.Sprintf("%d shots replayed, ball at %.1f,%.1f after %d strokes",
		w.played, r.bx, r.by, r.strokes)
}

// shotList is a commit's shots: the non-empty entries of "a,p;a,p;…", at
// least one and at most maxShots.
func shotList(shots string) []string {
	var list []string
	for _, s := range strings.Split(shots, ";") {
		if s = strings.TrimSpace(s); s == "" {
			continue
		}
		if len(list) == maxShots {
			panic("golf: too many shots in one commit")
		}
		list = append(list, s)
	}
	if len(list) == 0 {
		panic("golf: no shots")
	}
	return list
}

// work is what a commit has cost so far, estimated from what its shots did.
//
// A stroke's gas is mostly the physics: a fixed part, a set-up per wall, then
// per path point (one per substep, roll-on included) a cost of its own and a
// test per piece on the board, each polygon edge a piece. The constants were
// fitted on the 592 full-power shots of the 74 holes (8 angles each, from the
// tee, the forecast's own gas taken out), as the tightest fit that is at
// least the measured gas of every one of them, then raised by a fifth. The
// heaviest shot measured 78M; its estimate is 125M.
//
// Before each shot but the first, a commit that would pass workBudget with
// one more shot as heavy as its heaviest so far is refused, with the number
// of shots that fit: a transaction the chain could not finish is refused with
// a clear sentence instead of running out of gas, and the rest goes in the
// next commit (PlayRound* continue the round). SimulateRound and
// SimulateCommit refuse the same list the same way, so a client learns it
// before it signs.
//
// It is an estimate, not a gas meter (gno has none). If the physics gets
// cheaper these constants only err on the safe side; refit them if it gets
// dearer.
type work struct {
	walls, pieces int64 // on the board this commit: walls, and every piece and polygon edge
	spent, most   int64
	played        int
}

// The budget: of the 2e9 gas Adena lets a transaction simulate, 1.4e9 for the
// shots, and the rest for one shot heavier than estimated, the forecast (up
// to 0.17e9 measured, in the rain on the lane holes), decoding a data hole
// (up to 0.07e9 at the format's limits), the package loads and the
// bookkeeping.
const (
	workBudget   = 1400000000
	workPerShot  = 10000000
	workPerWall  = 150000
	workPerPoint = 1200000
	workPerPiece = 15000
)

// newWork is a commit's work on a hole, before any shot: its walls and
// pieces, a pulse's as if always there, and the weather's.
func newWork(h course.Hole, weather []physics.Zone) *work {
	w := &work{}
	if f := h.Field(); f != nil {
		w.walls = int64(len(f.Walls))
		w.pieces = pieces(f.Walls, f.Posts, f.Zones)
	}
	for _, p := range pulsesOf(h) {
		w.walls += int64(len(p.Walls))
		w.pieces += pieces(p.Walls, p.Posts, p.Zones)
	}
	w.pieces += pieces(nil, nil, weather)
	return w
}

// pieces counts what a ball is tested against: each wall, post and zone, and
// each edge of a zone's polygon.
func pieces(ws []physics.Wall, ps []physics.Post, zs []physics.Zone) int64 {
	n := len(ws) + len(ps) + len(zs)
	for i := range zs {
		n += len(zs[i].Poly)
	}
	return int64(n)
}

// pulsesOf is a hole's pulses: the pieces it adds at some strokes.
func pulsesOf(h course.Hole) []course.Pulse {
	switch s := h.(type) {
	case *course.Simple:
		return s.Pulses
	case *dataHole:
		return s.Pulses
	}
	return nil
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
	e.roundTree().Remove(player)
	chain.Emit(EventRoundReset, "hole", e.id, "player", player)
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

// resolve checks what the physics returned for a stroke: a path a read may
// print, and a ball that is a number. A hole is anyone's data.
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

// back is the shot, with a ball that came to rest off the board brought back
// to from, where the shot started: a leak in a hole's walls must not leave a
// round in the void. The stroke counts, as a hazard's does, with no penalty.
// Every stroke golf plays or replays goes through it, so a record replays.
func back(h course.Hole, from physics.Vec2, shot physics.Shot, holed bool) physics.Shot {
	rest := shot.Rest()
	w, hh := course.BoardOf(h)
	if holed || len(shot.Path) == 0 || (rest.X >= 0 && rest.X <= float64(w) && rest.Y >= 0 && rest.Y <= float64(hh)) {
		return shot
	}
	// copies: the hole's own slices are the hole's
	shot.Path = append(append(make([]physics.Vec2, 0, len(shot.Path)+1), shot.Path...), from)
	shot.Air = append(append(make([]bool, 0, len(shot.Air)+1), shot.Air...), false)
	shot.Cause = append(append(make([]byte, 0, len(shot.Cause)+1), shot.Cause...), '-')
	return shot
}

// stroke resolves one shot into the round and reports whether it was holed.
func stroke(e *entry, h course.Hole, r *round, player address, angle, power float64, tick int, weather []physics.Zone) (physics.Shot, bool) {
	if r.strokes >= maxRoundStrokes {
		panic("golf: this round is over its stroke limit, Reset to play again")
	}
	notOver(r.period) // every stroke, not only the first
	// played exactly as it is recorded, so the record replays
	angle, power = validShot(angle, power)

	from := r.ball()
	shot, holed := resolve(playAt(h, from, angle*math.Pi/180, power, r.strokes, tick, weather))
	shot = back(h, from, shot, holed)
	// the decisions, as played: what anyone needs to replay the round
	if r.shots != "" {
		r.shots += ";"
	}
	played := ufmt.Sprintf("%.4f,%.4f,%d", angle, power, tick)
	r.shots += played
	rest := shot.Rest()
	r.fx, r.fy, r.bx, r.by = from.X, from.Y, rest.X, rest.Y
	r.strokes++
	e.plays++

	if !holed {
		chain.Emit(EventShot, "hole", e.id, "player", player.String(),
			"strokes", strconv.Itoa(r.strokes), "mode", modeNames[r.mode], "shot", played)
		return shot, false
	}
	r.done = true
	m := r.mode
	if rec := e.rec(m); rec.best == 0 || r.strokes < rec.best {
		if m == pro {
			e.proBest, e.proBestBy = r.strokes, player
		} else {
			e.best, e.bestBy = r.strokes, player
		}
	}
	// a player's best stays theirs: replaying the hole never erases it
	p := player.String()
	if v := e.bests(m).Get(p); v == nil || r.strokes < v.(int) {
		was := 0
		if v != nil {
			was = v.(int)
			e.board(m).Remove(boardKey(was, p))
		}
		e.bests(m).Set(p, r.strokes)
		if counts(e, m, p, was) {
			improve(m, p, was, r.strokes)
		} else if was == 0 && e.official && e.next != "" && !e.out.done[m] && p >= e.out.from[m] {
			// the drain has yet to reach this first finish: it was never
			// counted, so it must not be taken out
			if e.out.fresh[m] == nil {
				e.out.fresh[m] = avl.NewTree()
			}
			e.out.fresh[m].Set(p, true)
		}
	}
	if named(p) {
		seat(e, m, p)
	}
	if e.official {
		drain(finishBatch) // only the course's finishes pay for the course's drain
	}
	chain.Emit(EventHoled, "hole", e.id, "player", p,
		"strokes", strconv.Itoa(r.strokes), "mode", modeNames[m], "shots", r.shots)
	return shot, true
}

// seat puts a named player where their best puts them: on the hole's board,
// and in the course ranking if they stand in it. A finish does it whether or
// not it improved, so a player who took a name after their best ranks at
// their next finish.
func seat(e *entry, m int, p string) {
	k := boardKey(e.bests(m).Get(p).(int), p)
	if !e.board(m).Has(k) {
		e.board(m).Set(k, p)
	}
	if v := totals[m].Get(p); v != nil && v.(*row).holes > 0 {
		if rk := rankKey(v.(*row)); !ranks[m].Has(rk) {
			ranks[m].Set(rk, p)
		}
	}
}

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
// by their timing at release; without it they start from 0. It is a whole
// number, clamped to 0..maxTick, however long.
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
		tick = clampTick(strings.TrimSpace(parts[2]), s)
	}
	return angle, power, tick
}

// clampTick reads a tick: an optional sign and digits, clamped to
// 0..maxTick, even past what an int holds.
func clampTick(t, shot string) int {
	digits := strings.TrimPrefix(strings.TrimPrefix(t, "-"), "+")
	if digits == "" {
		panic("golf: bad tick: " + shot)
	}
	for i := 0; i < len(digits); i++ {
		if digits[i] < '0' || digits[i] > '9' {
			panic("golf: bad tick: " + shot)
		}
	}
	if strings.HasPrefix(t, "-") {
		return 0
	}
	if digits = strings.TrimLeft(digits, "0"); len(digits) > 4 {
		return maxTick
	}
	n, _ := strconv.Atoi("0" + digits)
	if n > maxTick {
		return maxTick
	}
	return n
}

func playable(e *entry, h course.Hole, player address) *round {
	r := roundOf(e, h, player)
	if r.done {
		panic("golf: this hole is finished — Reset it to play again")
	}
	return r
}

func roundOf(e *entry, h course.Hole, player address) *round {
	if v := e.roundTree().Get(player.String()); v != nil {
		return v.(*round)
	}
	s := h.Start()
	r := &round{bx: s.X, by: s.Y}
	e.roundTree().Set(player.String(), r)
	return r
}

// maxName and maxNote bound a hole's name and a version's note.
const (
	maxName = 40
	maxNote = 140
)

// cleanName keeps a hole's name to one short line of plain text
// (cleanText), with at least a letter or a digit in it.
func cleanName(n string) string {
	s := cleanText(n, maxName)
	for _, c := range s {
		if unicode.IsLetter(c) || unicode.IsDigit(c) {
			return s
		}
	}
	return "Untitled hole"
}

// cleanText keeps an author's text to one line of plain text of at most max
// characters: no control characters, no format characters (Cf: bidi,
// zero-width, tags, interlinear annotation), no nonspacing marks (Mn:
// combining accents stacked without end, variation selectors), no
// blank-looking ones (they turn a line around, hide what it says, or name a
// hole with nothing), nothing that ends a markdown table cell or opens a
// link, a tag, an HTML entity ("&zwnj;" is a zero-width one), a
// strikethrough, a mention or an email link.
func cleanText(n string, max int) string {
	b := make([]rune, 0, max)
	for _, c := range n {
		if len(b) >= max {
			break
		}
		switch {
		case c < 0x20 || c >= 0x7f && c < 0xa0:
			continue
		case c == 0xad, c == 0x34f, c == 0x61c, c == 0x115f, c == 0x1160, c == 0x17b4, c == 0x17b5, c == 0x180e,
			c >= 0x200b && c <= 0x200f, c >= 0x2028 && c <= 0x202e, c >= 0x2060 && c <= 0x206f,
			c == 0x2800, c == 0x3164, c >= 0xfe00 && c <= 0xfe0f, c == 0xfeff, c == 0xffa0,
			c >= 0xe0000 && c <= 0xe0fff:
			continue
		case unicode.In(c, unicode.Mn, unicode.Cf):
			// an accented letter typed as one (NFC, as keyboards give it) is
			// neither: é stays; a script written with combining marks
			// (Devanagari, Thai) loses them
			continue
		case strings.ContainsRune("|[]<>`*_#\\&~@", c):
			continue
		}
		b = append(b, c)
	}
	return strings.TrimSpace(string(b))
}

// maxSkin bounds a skin's length.
const maxSkin = 24

// cleanSkin keeps a skin to what it is meant to be: a short lower-case id.
func cleanSkin(s string) string {
	b := make([]byte, 0, maxSkin)
	for i := 0; i < len(s) && len(b) < maxSkin; i++ {
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
