// Package course is the contract every hole realm implements. It is the only
// thing golf and a hole have to agree on.
package course

import (
	"math"
	"strconv"

	"gno.land/p/gnogolf/physics"
)

// BoardW and BoardH are the board a hole plays on unless it says otherwise,
// in board units: also the character grid the text renderer draws.
const BoardW, BoardH = 32, 16

// WearW and WearH are the wear grid, stretched over whatever board the hole
// has, so a hole always stores 128 counters.
const WearW, WearH = 16, 8

// MaxBoard is the longest side a board may have: it bounds the text board
// and the flood a client runs.
const MaxBoard = 96

// Sized is what a hole implements to play on a board other than 32x16 — a long
// corridor, a narrow lane. It is optional, so every hole written before it
// still plays on the default board.
type Sized interface {
	Board() (w, h int)
}

// Parred is what a hole implements to say how many strokes a good round
// takes. Optional; a hole that does not say is a par 3.
type Parred interface {
	Par() int
}

// Ordered is what a hole implements to choose its place in the course: holes
// are listed by it, lowest first, so a hole 1.5 slots between 1 and 2.
// Optional; a hole that does not say is placed by the number in its path.
type Ordered interface {
	Position() float64
}

// OrderOf is the hole's place in the course, or fallback when it has none.
//
// OrderOf, WorldOf and ParOf call the hole's method once and check the value
// they return: a hole is anyone's code, and may answer differently each time.
func OrderOf(h Hole, fallback float64) float64 {
	if o, ok := h.(Ordered); ok {
		if n := o.Position(); n > 0 {
			return n
		}
	}
	return fallback
}

// Worlded is what a hole implements to say which world of the course it
// belongs to — "garden", "island", "town": a client dresses the whole scene
// (sea, sky, decor) from it. Optional; a hole that does not say is "garden".
type Worlded interface {
	WorldName() string
}

// WorldOf is the hole's world.
func WorldOf(h Hole) string {
	if w, ok := h.(Worlded); ok {
		if n := w.WorldName(); n != "" {
			return n
		}
	}
	return "garden"
}

// ParOf is the hole's par.
func ParOf(h Hole) int {
	if p, ok := h.(Parred); ok {
		if n := p.Par(); n > 0 && n < 20 {
			return n
		}
	}
	return 3
}

// BoardOf is the board a hole plays on.
func BoardOf(h Hole) (int, int) {
	if s, ok := h.(Sized); ok {
		w, hh := s.Board()
		if w > 0 && hh > 0 && w <= MaxBoard && hh <= MaxBoard {
			return w, hh
		}
	}
	return BoardW, BoardH
}

// Hole is one course.
//
// No method takes `cur realm`: an interface cannot carry a capability token, so
// a hole never learns who is playing. Identity stays with golf, the only realm
// the player calls.
type Hole interface {
	Name() string
	Start() physics.Vec2
	Cup() physics.Vec2

	// Field is the geometry, for whoever draws it: the text board and the 3D
	// client. It is also what makes a hole inspectable before you play it.
	Field() *physics.Field

	// Preview resolves a shot and changes nothing. It exists so a client can
	// ask the chain what a shot would do — over a read-only query, free and
	// without waiting for a block — instead of reimplementing the physics and
	// drifting away from it.
	Preview(ball physics.Vec2, angle, power float64) (physics.Shot, bool)

	// Play resolves one shot and marks the course. It returns the whole flight,
	// so a renderer can replay it instead of recomputing it, and whether the
	// ball was holed. Everything a hole invents lives here.
	Play(ball physics.Vec2, angle, power float64) (physics.Shot, bool)

	// Wear is the WearW*WearH grid, row-major.
	Wear() []int
}

// WearIndex maps a position on the default board to its wear cell.
func WearIndex(p physics.Vec2) int { return WearIndexOn(p, BoardW, BoardH) }

// WearIndexOn maps a position on a w x h board to its wear cell, so every hole
// marks the course the same way whatever its size.
func WearIndexOn(p physics.Vec2, w, h int) int {
	x := int(p.X * WearW / float64(w))
	y := int(p.Y * WearH / float64(h))
	if x < 0 {
		x = 0
	}
	if x >= WearW {
		x = WearW - 1
	}
	if y < 0 {
		y = 0
	}
	if y >= WearH {
		y = WearH - 1
	}
	return y*WearW + x
}

// Marks is the wear grid a hole embeds. The methods are declared here but the
// array belongs to the hole realm that allocated it, so the writes land in that
// realm's own storage.
type Marks struct {
	cells [WearW * WearH]int
}

// Mark records that a ball came to rest at p, on the default board.
func (m *Marks) Mark(p physics.Vec2) { m.cells[WearIndex(p)]++ }

// MarkOn is Mark for a hole with its own board size.
func (m *Marks) MarkOn(p physics.Vec2, w, h int) { m.cells[WearIndexOn(p, w, h)]++ }

// Wear is the rest counters, one per cell of the WearW by WearH grid.
func (m *Marks) Wear() []int {
	out := make([]int, len(m.cells))
	for i, v := range m.cells {
		out[i] = v
	}
	return out
}

// Timed is what a hole implements when part of it changes from one stroke to
// the next: a blade that turns, a gate that opens, a mole that pops up.
//
// The clock is the stroke number within the player's own round — 0 for the
// first shot — never a count shared by all players. That keeps a hole a
// function of the round: previewing shot N and committing it meet the same
// course, whoever else is playing. golf asks for PreviewAt/PlayAt whenever a
// hole has them; Preview and Play are then the first stroke.
type Timed interface {
	// Varies says whether anything actually changes: a Simple hole has the
	// methods whether or not it has pulses.
	Varies() bool
	// Extras are the pieces present at a stroke, on top of Field(). A renderer
	// reads them to draw the hole as it is for the shot being aimed.
	Extras(stroke int) ([]physics.Wall, []physics.Post)
	PreviewAt(ball physics.Vec2, angle, power float64, stroke int) (physics.Shot, bool)
	PlayAt(ball physics.Vec2, angle, power float64, stroke int) (physics.Shot, bool)
}

// Pulse is a piece that comes and goes: present on the strokes where
// (stroke+Phase) % Every < On, the same rule as a timed wall's within a
// stroke. Every 2, On 1 is every other stroke; Every 3, On 1 is one stroke in
// three.
type Pulse struct {
	Every, On, Phase int
	Walls            []physics.Wall
	Posts            []physics.Post
	Zones            []physics.Zone // a puddle a sprinkler leaves, a bridge let down
}

// Weatherable is what a hole implements to be played in the weather: the
// same stroke as PreviewAt/PlayAt, with whole-board weather zones laid over the
// course first (the hole's own sand, ice and slopes still count where they
// are). The weather is the golf realm's to choose; a hole only says, through
// MaxWind, how much wind its design can stand (0 is no limit of its own).
type Weatherable interface {
	// tick is where the timed pieces were when the player let go: the
	// field's clock starts there (physics.WithTick).
	PreviewWith(ball physics.Vec2, angle, power float64, stroke, tick int, weather []physics.Zone) (physics.Shot, bool)
	PlayWith(ball physics.Vec2, angle, power float64, stroke, tick int, weather []physics.Zone) (physics.Shot, bool)
	MaxWind() float64
}

// The weather kinds. Each but Clear is also the skin of its whole-board zones.
const (
	Clear = ""      // Clear is no weather at all
	Wind  = "wind"  // Wind is a Slope: a steady push, Vec per substep
	Rain  = "rain"  // Rain is a Surface a little quicker than dry grass
	Fog   = "fog"   // Fog is a Surface of scale 1: it only hides the far end
	Storm = "storm" // Storm is rain and wind in gusts, and lightning to look at
	Snow  = "snow"  // Snow is a Surface a little slower
)

// chance is one kind of weather in a climate, out of 100.
type chance struct {
	percent int
	kind    string
}

// climates is the weather of each world: the chance of each kind, out of 100.
// A world not listed has the garden's. Read only through ForecastFor;
// unexported so nothing can reach it to change.
var climates = map[string][]chance{
	"garden":   {{55, Clear}, {20, Wind}, {15, Rain}, {10, Fog}},
	"island":   {{50, Clear}, {25, Wind}, {15, Rain}, {10, Storm}},
	"town":     {{50, Clear}, {20, Rain}, {15, Fog}, {15, Wind}},
	"mountain": {{40, Clear}, {25, Snow}, {20, Wind}, {15, Fog}},
}

// The weather's strengths.
const (
	// WindMin is the weakest wind, per substep.
	WindMin = 0.08
	// WindMax is the strongest wind, per substep.
	WindMax = 0.15
	// RainScale is how much quicker the green is in the rain: a touch, not
	// ice. On a 0.87 green the ball keeps 94% of its speed a substep instead
	// of 92%; much more and the keep cap turns every board to pinball.
	RainScale = 1.025
	// WetIce is how much quicker again the rain makes ice.
	WetIce = 1.06
	// SnowScale is how much slower the green is in the snow.
	SnowScale = 0.9
)

// Forecast is one hole's weather for one period: its kind, the wind (when it
// blows) and the zones the chain plays it under. Whole-board zones lie under
// the hole's own; the rest (puddles, wet ice) lie over it.
type Forecast struct {
	Period int64
	Kind   string
	Wind   physics.Vec2
	Zones  []physics.Zone
}

// hash is 64-bit FNV-1a: small, deterministic, the same on every validator.
func hash(s string) uint64 {
	h := uint64(14695981039346656037)
	for i := 0; i < len(s); i++ {
		h ^= uint64(s[i])
		h *= 1099511628211
	}
	return h
}

// ForecastFor is the weather of hole id (in world) for a period: a hash of
// the two looked up in the world's climate. Nobody picks it.
func ForecastFor(id, world string, h Hole, period int64) Forecast {
	seed := hash(id + "#" + strconv.FormatInt(period, 10))
	table, ok := climates[world]
	if !ok {
		table = climates["garden"]
	}
	roll, kind := int(seed%100), Clear
	for _, c := range table {
		if roll < c.percent {
			kind = c.kind
			break
		}
		roll -= c.percent
	}
	wind, zones := WeatherFor(kind, h, seed)
	return Forecast{Period: period, Kind: kind, Wind: wind, Zones: zones}
}

// rng is a tiny deterministic generator from a seed (Knuth's LCG).
type rng struct{ s uint64 }

func (r *rng) next() uint64 {
	r.s = r.s*6364136223846793005 + 1442695040888963407
	return r.s >> 11
}

func (r *rng) unit() float64 { return float64(r.next()%1000000) / 1000000 }

// WeatherFor is the wind and zones of one kind of weather on a hole, drawn
// from seed: the wind's side and strength, where the rain leaves its puddles.
func WeatherFor(kind string, h Hole, seed uint64) (physics.Vec2, []physics.Zone) {
	w, hh := BoardOf(h)
	W, H := float64(w), float64(hh)
	all := func(k physics.ZoneKind, skin string, scale float64, vec physics.Vec2) physics.Zone {
		// the wind is air, and never speeds the ball up
		air := k == physics.Slope
		return physics.Zone{Kind: k, Min: physics.V(0, 0), Max: physics.V(W, H), Scale: scale, Vec: vec, Skin: skin, Air: air, Capped: air}
	}
	r := &rng{s: seed}
	blow := func() physics.Vec2 {
		s := WindMin + r.unit()*(WindMax-WindMin)
		if x, ok := h.(Weatherable); ok && x.MaxWind() > 0 && s > x.MaxWind() {
			s = x.MaxWind()
		}
		return physics.FromPolar(r.unit()*2*math.Pi, s)
	}
	switch kind {
	case Wind:
		v := blow()
		return v, []physics.Zone{all(physics.Slope, Wind, 0, v)}
	case Rain:
		return physics.Vec2{}, wet(h, r, []physics.Zone{all(physics.Surface, Rain, RainScale, physics.Vec2{})})
	case Storm:
		// the storm's rain, and its wind in gusts: 40° one way for three
		// substeps, then 40° the other
		v := blow()
		a, s := math.Atan2(v.Y, v.X), v.Len()
		g1, g2 := all(physics.Slope, Wind, 0, physics.FromPolar(a+gustTurn, s)), all(physics.Slope, Wind, 0, physics.FromPolar(a-gustTurn, s))
		g1.Every, g1.On, g1.Phase = gustEvery, gustEvery/2, 0
		g2.Every, g2.On, g2.Phase = gustEvery, gustEvery/2, gustEvery/2
		zs := []physics.Zone{all(physics.Surface, Storm, 1, physics.Vec2{}), all(physics.Surface, Rain, RainScale, physics.Vec2{}), g1, g2}
		return v, wet(h, r, zs)
	case Fog:
		return physics.Vec2{}, []physics.Zone{all(physics.Surface, Fog, 1, physics.Vec2{})}
	case Snow:
		return physics.Vec2{}, []physics.Zone{all(physics.Surface, Snow, SnowScale, physics.Vec2{})}
	}
	return physics.Vec2{}, nil
}

// A storm's gusts turn gustTurn radians (about 40°) off its wind, one way
// then the other, each for half of gustEvery substeps.
const (
	gustTurn  = 0.7
	gustEvery = 6
)

// Where rain leaves its puddles: minPuddles plus up to morePuddles-1 more,
// in at most puddleTries tries; each puddleR plus up to puddleGrow wide,
// puddleAspect as deep, and puddleScale as quick as the grass, kept
// puddleGap clear of the one before.
const (
	minPuddles   = 2
	morePuddles  = 3
	puddleTries  = 60
	puddleR      = 1.1
	puddleGrow   = 0.7
	puddleAspect = 0.8
	puddleScale  = 0.6
	puddleGap    = 0.5
)

// wet adds what rain leaves on a hole: its ice quicker still, and two to four
// puddles on the lane, clear of the kerb, the pieces, the tee and the cup.
func wet(h Hole, r *rng, zs []physics.Zone) []physics.Zone {
	f := h.Field()
	for _, z := range f.Zones {
		if z.Kind == physics.Surface && z.Skin == "ice" {
			z.Scale *= WetIce
			zs = append(zs, z)
		}
	}
	w, hh := BoardOf(h)
	want, placed := minPuddles+int(r.next()%morePuddles), []physics.Zone{}
	for try := 0; try < puddleTries && len(placed) < want; try++ {
		c := physics.V(r.unit()*float64(w), r.unit()*float64(hh))
		rad := puddleR + r.unit()*puddleGrow
		if !dryLand(h, c, rad) {
			continue
		}
		clash := false
		for _, p := range placed {
			if p.Min.Add(p.Max).Scale(0.5).Sub(c).LenCmp(p.Max.X-p.Min.X+puddleGap) < 0 {
				clash = true
			}
		}
		if clash {
			continue
		}
		placed = append(placed, physics.Zone{Kind: physics.Surface, Min: c.Sub(physics.V(rad, rad*puddleAspect)), Max: c.Add(physics.V(rad, rad*puddleAspect)), Scale: puddleScale, Round: true, Skin: "puddle"})
	}
	return append(zs, placed...)
}

// dryLand says whether a puddle of radius rad can lie at c: on the lane
// (inside its outline, by the even-odd rule over the fixed walls), out of
// every zone that is not plain ground, clear of walls, posts, tee and cup.
// It is a pure conjunction, so the cheap tests go first and the walls last;
// no test takes a square root (LenCmp, Crosses): on a lane hole every one of
// the tries fails, and rain paid ~900M gas for them.
//
// A puddle keeps dryTee from the tee and the cup and dryGap from any piece.
// The outline test casts a ray to a far point, off any board and at a slant
// no wall of a grid lies along.
func dryLand(h Hole, c physics.Vec2, rad float64) bool {
	f := h.Field()
	if c.Sub(h.Start()).LenCmp(rad+dryTee) < 0 || c.Sub(h.Cup()).LenCmp(rad+dryTee) < 0 {
		return false
	}
	for _, p := range f.Posts {
		if p.C.Sub(c).LenCmp(p.R+rad+dryGap) < 0 {
			return false
		}
	}
	for _, z := range f.Zones {
		if z.Kind != physics.Surface && z.Kind != physics.Slope && z.Contains(c) {
			return false
		}
		if z.Kind == physics.Surface && z.Skin != "" && z.Contains(c) {
			return false // not on the sand or the ice: a puddle is on the green
		}
	}
	far, in := c.Add(physics.V(farX, farY)), false
	for _, wl := range f.Walls {
		if wl.Every > 0 {
			continue
		}
		if c.Sub(wl.Seg.Closest(c)).LenCmp(rad+dryGap) < 0 {
			return false
		}
		if wl.Seg.Crosses(c, far) {
			in = !in
		}
	}
	return in
}

const (
	dryTee     = 2
	dryGap     = 0.3
	farX, farY = 1e4, 37
)

// WithWeather lays weather over a field: the sky's zones (wind, rain, fog,
// storm, snow — the whole board) go under its own, so the sand stays sand in
// the rain; what the rain leaves (puddles, wet ice) goes over them. It may
// return f itself: do not mutate what it returns.
func WithWeather(f *physics.Field, weather []physics.Zone) *physics.Field {
	if len(weather) == 0 {
		return f
	}
	under, over := []physics.Zone{}, []physics.Zone{}
	for _, z := range weather {
		switch z.Skin {
		case Wind, Rain, Fog, Storm, Snow:
			under = append(under, z)
		default:
			over = append(over, z)
		}
	}
	g := *f
	g.Zones = append(append(append(make([]physics.Zone, 0, len(f.Zones)+len(weather)), under...), f.Zones...), over...)
	return &g
}

// Zoned is what a timed hole implements when some of what comes and goes is
// ground rather than a piece: the zones present at a stroke, on top of
// Field()'s. Optional, beside Timed.
type Zoned interface {
	ExtraZones(stroke int) []physics.Zone
}

// WithZones is the field plus some zones. The extra zones come first: a
// puddle over the sand is the puddle. It may return f itself (no zones): do
// not mutate what it returns.
func WithZones(f *physics.Field, zones []physics.Zone) *physics.Field {
	if len(zones) == 0 {
		return f
	}
	g := *f
	g.Zones = append(append(make([]physics.Zone, 0, len(f.Zones)+len(zones)), zones...), f.Zones...)
	return &g
}

// at is whether the pulse is there at a stroke: the rule of a timed wall's
// Every/On/Phase, sign-safe.
func (p Pulse) at(stroke int) bool {
	if p.Every <= 0 {
		return true
	}
	return ((stroke+p.Phase)%p.Every+p.Every)%p.Every < p.On
}

// WithExtras is the field plus the pieces of one stroke: the hole's own is
// never modified, so nothing persists between shots. It may return f itself
// (no pieces): do not mutate what it returns.
func WithExtras(f *physics.Field, walls []physics.Wall, posts []physics.Post) *physics.Field {
	if len(walls) == 0 && len(posts) == 0 {
		return f
	}
	g := *f
	g.Walls = append(append(make([]physics.Wall, 0, len(f.Walls)+len(walls)), f.Walls...), walls...)
	g.Posts = append(append(make([]physics.Post, 0, len(f.Posts)+len(posts)), f.Posts...), posts...)
	return &g
}

// Simple is a hole that is only its geometry, which most holes are. It
// implements the whole interface, so a course realm gets to be its field and
// nothing else.
//
// The methods are declared here, in /p/, but the value is allocated by the hole
// realm that declares it — so the wear writes land in that realm's own storage,
// under its own authority. A hole that wants to invent something the field
// cannot express writes its own type instead. Pulses cover pieces that come
// and go with the stroke — town10's bridge, island14's log, hole5's gate.
//
// Its fields and methods come in pairs (Strokes and Par, Title and Name,
// Order and Position, World and WorldName, Course and Field) only because a
// field and a method cannot share a name.
type Simple struct {
	Marks
	W, H      int // the board; 0 means the default 32x16
	Title     string
	Strokes   int // par: the strokes a good round takes (0 means 3)
	Tee, Pin  physics.Vec2
	Course    *physics.Field
	Pulses    []Pulse // pieces that come and go with the stroke number
	Substeps  int
	CupRadius float64
	// World is the world the hole belongs to ("" is "garden"); Order places it
	// within that world, 1 first (0 leaves it to the number in its path).
	World string
	Order float64
	// Shelter caps the wind this hole is played in (0: the world's own); a
	// hole whose design a strong wind would break says so here.
	Shelter float64
}

// MaxWind is the strongest wind the hole is played in (0: the world's own).
func (h *Simple) MaxWind() float64 { return h.Shelter }

// Position is the hole's place in its world.
func (h *Simple) Position() float64 { return h.Order }

// WorldName is the world the hole belongs to.
func (h *Simple) WorldName() string { return h.World }

// ExtraZones is the zones the hole's pulses lay down at a stroke.
func (h *Simple) ExtraZones(stroke int) []physics.Zone {
	var zs []physics.Zone
	for _, p := range h.Pulses {
		if p.at(stroke) {
			zs = append(zs, p.Zones...)
		}
	}
	return zs
}

// Varies says whether the hole has pulses: pieces that come and go.
func (h *Simple) Varies() bool { return len(h.Pulses) > 0 }

// Extras is the walls and posts the hole's pulses add at a stroke.
func (h *Simple) Extras(stroke int) ([]physics.Wall, []physics.Post) {
	var ws []physics.Wall
	var ps []physics.Post
	for _, p := range h.Pulses {
		if p.at(stroke) {
			ws = append(ws, p.Walls...)
			ps = append(ps, p.Posts...)
		}
	}
	return ws, ps
}

// PreviewAt is a stroke of a round in calm weather at tick 0, read-only.
func (h *Simple) PreviewAt(ball physics.Vec2, angle, power float64, stroke int) (physics.Shot, bool) {
	return h.PreviewWith(ball, angle, power, stroke, 0, nil)
}

// PlayAt is PreviewAt, and it marks the wear where the ball stops.
func (h *Simple) PlayAt(ball physics.Vec2, angle, power float64, stroke int) (physics.Shot, bool) {
	return h.PlayWith(ball, angle, power, stroke, 0, nil)
}

// PreviewWith is a stroke of a round in some weather, the timed pieces
// starting at tick: the stroke's pulses, then the weather, then the clock. Read-only.
// A pulse piece that came back on the ball pushes it out, never across one
// of the hole's own walls (physics.UnstickIn).
func (h *Simple) PreviewWith(ball physics.Vec2, angle, power float64, stroke, tick int, weather []physics.Zone) (physics.Shot, bool) {
	ws, ps := h.Extras(stroke)
	ball = physics.UnstickIn(ball, ws, ps, h.Course.Radius, h.Course.Walls)
	// the stroke's own pieces first, then the weather under everything
	f := WithZones(WithExtras(h.Course, ws, ps), h.ExtraZones(stroke))
	f = physics.WithTick(WithWeather(f, weather), tick)
	return Sink(f.Step(ball, Launch(angle, power), h.Substeps), h.Pin, h.CupRadius)
}

// PlayWith is PreviewWith, and it marks the wear where the ball stops.
func (h *Simple) PlayWith(ball physics.Vec2, angle, power float64, stroke, tick int, weather []physics.Zone) (physics.Shot, bool) {
	shot, holed := h.PreviewWith(ball, angle, power, stroke, tick, weather)
	w, hh := h.Board()
	h.MarkOn(shot.Rest(), w, hh)
	return shot, holed
}

// Name is the hole's title.
func (h *Simple) Name() string { return h.Title }

// Par is the strokes a good round takes.
func (h *Simple) Par() int { return h.Strokes }

// Start is the tee.
func (h *Simple) Start() physics.Vec2 { return h.Tee }

// Cup is where the cup is.
func (h *Simple) Cup() physics.Vec2 { return h.Pin }

// Field is the course as the physics sees it.
func (h *Simple) Field() *physics.Field { return h.Course }

// Board is the hole's board size: W by H, or the default when either is 0
// or past MaxBoard, as BoardOf has it.
func (h *Simple) Board() (int, int) {
	if h.W > 0 && h.H > 0 && h.W <= MaxBoard && h.H <= MaxBoard {
		return h.W, h.H
	}
	return BoardW, BoardH
}

// Preview is the first stroke of a round, read-only.
func (h *Simple) Preview(ball physics.Vec2, angle, power float64) (physics.Shot, bool) {
	return h.PreviewAt(ball, angle, power, 0)
}

// Play is the first stroke of a round, marking the wear.
func (h *Simple) Play(ball physics.Vec2, angle, power float64) (physics.Shot, bool) {
	return h.PlayAt(ball, angle, power, 0)
}

// Kick turns a stroke's power (0 to 10) into the ball's speed per substep: a
// full stroke on the usual friction rolls about a board's length.
const Kick = 0.6

// Launch is the ball's starting velocity for a stroke. Every hole should use
// it, so that the same pull means the same shot on every course.
func Launch(angle, power float64) physics.Vec2 { return physics.FromPolar(angle, power*Kick) }

// CaptureSpeed is the fastest a ball can cross the cup and still drop, in board
// units per substep — a ball barely rolling. Faster, it skims over — as it does on a real green.
const CaptureSpeed = 1.3

// jumpStep is how much longer than CaptureSpeed a step must be for the one
// after it to be the rest of a jump, not a slow ball.
const jumpStep = 1.5

// Sink decides whether a shot ends in the cup: it stops within radius of the
// pin, or it rolls across the cup no faster than CaptureSpeed. When it drops
// the path is cut there and ends on the pin, so a renderer shows the ball
// falling in rather than rolling on. Both Preview and Play go through it, so
// the preview still equals the commit.
func Sink(shot physics.Shot, pin physics.Vec2, radius float64) (physics.Shot, bool) {
	p := shot.Path
	for i := 0; i+1 < len(p); i++ {
		a, d := p[i], p[i+1].Sub(p[i])
		if d.LenCmp(CaptureSpeed) > 0 {
			continue // too fast, or a tunnel jump
		}
		if airborne(shot, i) || airborne(shot, i+1) {
			continue // flying over the cup is not dropping into it
		}
		// a short step right after a long one is not a slow ball: it is the
		// rest of a substep after a tunnel exit or a bounce
		if i > 0 && p[i].Sub(p[i-1]).LenCmp(CaptureSpeed*jumpStep) > 0 {
			continue
		}
		// a step whose box is more than radius from the pin cannot drop
		if b, r := p[i+1], radius+1e-9; (pin.X < a.X-r && pin.X < b.X-r) || (pin.X > a.X+r && pin.X > b.X+r) ||
			(pin.Y < a.Y-r && pin.Y < b.Y-r) || (pin.Y > a.Y+r && pin.Y > b.Y+r) {
			continue
		}
		l := d.Len()
		t := 0.0
		if l > 0 {
			t = pin.Sub(a).Dot(d) / (l * l)
			if t < 0 {
				t = 0
			} else if t > 1 {
				t = 1
			}
		}
		at := a.Add(d.Scale(t))
		// over the middle of the cup a ball drops up to CaptureSpeed; nearer
		// the rim it has to be slower — a graze is not a hole
		off := at.Sub(pin).Len()
		if off <= radius && l <= CaptureSpeed*math.Sqrt(1-(off*off)/(radius*radius)) {
			cut := make([]physics.Vec2, 0, i+3)
			cut = append(cut, p[:i+1]...)
			shot.Path = append(cut, at, pin)
			if len(shot.Air) > i {
				shot.Air = append(append(make([]bool, 0, i+3), shot.Air[:i+1]...), false, false)
			}
			if len(shot.Cause) > i {
				shot.Cause = append(append(make([]byte, 0, i+3), shot.Cause[:i+1]...), '-', '-')
			}
			return shot, true
		}
	}
	if shot.Rest().Sub(pin).LenCmp(radius) <= 0 {
		shot.Path = append(shot.Path, pin)
		if shot.Air != nil {
			shot.Air = append(shot.Air, false)
		}
		if shot.Cause != nil {
			shot.Cause = append(shot.Cause, '-')
		}
		return shot, true
	}
	return shot, false
}

func airborne(s physics.Shot, i int) bool { return i < len(s.Air) && s.Air[i] }
