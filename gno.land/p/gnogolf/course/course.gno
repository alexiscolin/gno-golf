// Package course is the contract every hole implements: the only thing golf
// and a hole have to agree on.
package course

import (
	"math"
	"strconv"

	"gno.land/p/gnogolf/physics"
)

// BoardW and BoardH are the default board, in board units (also the text
// renderer's character grid).
const BoardW, BoardH = 32, 16

// WearW and WearH are the wear grid, stretched over any board: 128 counters.
const WearW, WearH = 16, 8

// MaxBoard is the longest side a board may have: it bounds the text board
// and the flood a client runs.
const MaxBoard = 96

// Sized is what a hole implements to play on a board other than 32x16.
// Optional.
type Sized interface {
	Board() (w, h int)
}

// Parred is what a hole implements to say how many strokes a good round
// takes. Optional; a hole that does not say is a par 3.
type Parred interface {
	Par() int
}

// ParOf is the hole's par: 3 unless it says 1 to 19. It calls the method once
// and checks that value: a hole is anyone's code, and may answer differently
// each time.
func ParOf(h Hole) int {
	if p, ok := h.(Parred); ok {
		if n := p.Par(); n > 0 && n < 20 {
			return n
		}
	}
	return 3
}

// BoardOf is the board a hole plays on: the default unless it says 1 to
// MaxBoard a side. Like ParOf, it calls the method once.
func BoardOf(h Hole) (int, int) {
	if s, ok := h.(Sized); ok {
		w, hh := s.Board()
		if w > 0 && hh > 0 && w <= MaxBoard && hh <= MaxBoard {
			return w, hh
		}
	}
	return BoardW, BoardH
}

// Hole is one course. No method takes `cur realm`: an interface cannot carry a
// capability token, so a hole never learns who is playing.
type Hole interface {
	Name() string
	Start() physics.Vec2
	Cup() physics.Vec2

	// Field is the geometry, for renderers and for inspecting the hole.
	Field() *physics.Field
}

// WearIndexOn maps a position on a w x h board to its wear cell, clamped.
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

// Timed is what a hole implements when part of it changes from one stroke to
// the next. The clock is the stroke number in the player's own round (0 is
// the first shot), never shared between players: previewing shot N and
// committing it meet the same course.
type Timed interface {
	// Varies says whether anything actually changes.
	Varies() bool
	// Extras are the pieces present at a stroke, on top of Field().
	Extras(stroke int) ([]physics.Wall, []physics.Post)
}

// Pulse is pieces that come and go: present on the strokes where
// (stroke+Phase) % Every < On, a timed wall's rule applied per stroke.
type Pulse struct {
	Every, On, Phase int
	Walls            []physics.Wall
	Posts            []physics.Post
	Zones            []physics.Zone
}

// Weatherable is what a hole implements to be played in the weather golf
// chooses: PreviewWith plays a stroke under the weather's zones, MaxWind is
// the strongest wind the design can stand (0: no limit of its own).
type Weatherable interface {
	// tick is where the timed pieces were when the player let go
	// (physics.WithTick).
	PreviewWith(ball physics.Vec2, angle, power float64, stroke, tick int, weather []physics.Zone) (physics.Shot, bool)
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

// climates is each world's chance of each kind, out of 100; a world not
// listed has the garden's. Unexported so nothing can change it.
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
	// ice (much more and every board turns to pinball).
	RainScale = 1.025
	// WetIce is how much quicker again the rain makes ice.
	WetIce = 1.06
	// SnowScale is how much slower the green is in the snow.
	SnowScale = 0.9
)

// Forecast is one hole's weather for one period. Whole-board zones lie under
// the hole's own; the rest (puddles, wet ice) lie over it.
type Forecast struct {
	Period int64
	Kind   string
	Wind   physics.Vec2
	Zones  []physics.Zone
	// Work is what drawing it cost, in physics.MaxWork's units (about a
	// thousand gas); golf counts it in a commit's budget.
	Work int
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
	f := Forecast{Period: period, Kind: kind, Work: forecastWork}
	f.Wind, f.Zones = weatherFor(kind, h, seed, &f.Work)
	return f
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
	var work int
	return weatherFor(kind, h, seed, &work)
}

// weatherFor is WeatherFor, adding what it cost to *work (see wet).
func weatherFor(kind string, h Hole, seed uint64, work *int) (physics.Vec2, []physics.Zone) {
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
		return physics.Vec2{}, wet(h, r, []physics.Zone{all(physics.Surface, Rain, RainScale, physics.Vec2{})}, work)
	case Storm:
		// rain, and the wind in two alternating gusts
		*work += stormWork
		v := blow()
		a, s := math.Atan2(v.Y, v.X), v.Len()
		g1, g2 := all(physics.Slope, Wind, 0, physics.FromPolar(a+gustTurn, s)), all(physics.Slope, Wind, 0, physics.FromPolar(a-gustTurn, s))
		g1.Every, g1.On, g1.Phase = gustEvery, gustEvery/2, 0
		g2.Every, g2.On, g2.Phase = gustEvery, gustEvery/2, gustEvery/2
		zs := []physics.Zone{all(physics.Surface, Storm, 1, physics.Vec2{}), all(physics.Surface, Rain, RainScale, physics.Vec2{}), g1, g2}
		return v, wet(h, r, zs, work)
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

// The work of a forecast, in physics.MaxWork's units, measured on GnoVM gas:
// any forecast, a storm's gusts, a puddle try, and in it each post, zone,
// polygon edge and fixed wall dryLand tests, and each zone wet checks for ice.
const (
	forecastWork = 3000 // drawing any forecast, before the rain's tries
	stormWork    = 5000 // a storm's gusts, on top
	tryWork      = 35
	dryPostWork  = 22
	dryZoneWork  = 20
	dryEdgeWork  = 16
	dryWallWork  = 100
	iceWork      = 5
)

// WorstForecastWork bounds the Work of h's forecast in any period and world:
// a storm's, whose puddle tries all fail, each after dryLand has tested every
// piece (a try that fails sooner costs less, and one that places a puddle
// ends them sooner). Golf refuses a hole whose worst forecast leaves a commit
// no room for its heaviest shot.
func WorstForecastWork(h Hole) int {
	f := h.Field()
	try := tryWork + dryPostWork*len(f.Posts)
	for _, z := range f.Zones {
		try += dryZoneTest(z)
	}
	for _, wl := range f.Walls {
		if wl.Every <= 0 {
			try += dryWallWork
		}
	}
	return forecastWork + stormWork + iceWork*len(f.Zones) + puddleTries*try
}

// dryZoneTest is the work of dryLand's test of one zone: its polygon's edges
// too for any zone but plain ground (Contains, at its dearest).
func dryZoneTest(z physics.Zone) int {
	if (z.Kind != physics.Surface && z.Kind != physics.Slope) || (z.Kind == physics.Surface && z.Skin != "") {
		return dryZoneWork + dryEdgeWork*len(z.Poly)
	}
	return dryZoneWork
}

// wet adds what rain leaves on a hole: its ice quicker still, and two to four
// puddles on the lane, clear of the kerb, the pieces, the tee and the cup.
// What it costs goes in *work.
func wet(h Hole, r *rng, zs []physics.Zone, work *int) []physics.Zone {
	f := h.Field()
	*work += iceWork * len(f.Zones)
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
		*work += tryWork
		if !dryLand(h, c, rad, work) {
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

// dryLand says whether a puddle of radius rad can lie at c: inside the lane's
// outline (even-odd over the fixed walls, a ray to a far point at a slant no
// grid wall lies along), off any zone but plain ground, dryGap from any piece
// and dryTee from tee and cup. Cheap tests first, no square roots: on a lane
// hole every try fails.
func dryLand(h Hole, c physics.Vec2, rad float64, work *int) bool {
	f := h.Field()
	if c.Sub(h.Start()).LenCmp(rad+dryTee) < 0 || c.Sub(h.Cup()).LenCmp(rad+dryTee) < 0 {
		return false
	}
	for _, p := range f.Posts {
		*work += dryPostWork
		if p.C.Sub(c).LenCmp(p.R+rad+dryGap) < 0 {
			return false
		}
	}
	for _, z := range f.Zones {
		*work += dryZoneTest(z)
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
		*work += dryWallWork
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

// WithWeather lays weather over a field: the sky's whole-board zones go under
// its own (the sand stays sand in the rain), puddles and wet ice over them.
// It may return f itself: do not mutate what it returns.
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
// ground: the zones present at a stroke, on top of Field()'s. Optional.
type Zoned interface {
	ExtraZones(stroke int) []physics.Zone
}

// WithZones is the field with zones put first (a puddle over the sand is the
// puddle). It may return f itself: do not mutate what it returns.
func WithZones(f *physics.Field, zones []physics.Zone) *physics.Field {
	if len(zones) == 0 {
		return f
	}
	g := *f
	g.Zones = append(append(make([]physics.Zone, 0, len(f.Zones)+len(zones)), zones...), f.Zones...)
	return &g
}

// at is whether the pulse is there at a stroke (a sign-safe mod).
func (p Pulse) at(stroke int) bool {
	if p.Every <= 0 {
		return true
	}
	return ((stroke+p.Phase)%p.Every+p.Every)%p.Every < p.On
}

// WithExtras is the field plus one stroke's pieces, the hole's own left as
// is. It may return f itself: do not mutate what it returns.
func WithExtras(f *physics.Field, walls []physics.Wall, posts []physics.Post) *physics.Field {
	if len(walls) == 0 && len(posts) == 0 {
		return f
	}
	g := *f
	g.Walls = append(append(make([]physics.Wall, 0, len(f.Walls)+len(walls)), f.Walls...), walls...)
	g.Posts = append(append(make([]physics.Post, 0, len(f.Posts)+len(posts)), f.Posts...), posts...)
	return &g
}

// Simple is a hole that is only its geometry, and implements every interface
// here. Fields and methods pair up (Strokes/Par, Title/Name, Course/Field)
// because a field and a method cannot share a name.
type Simple struct {
	W, H      int // the board; 0 means the default 32x16
	Title     string
	Strokes   int // par: the strokes a good round takes (0 means 3)
	Tee, Pin  physics.Vec2
	Course    *physics.Field
	Pulses    []Pulse // pieces that come and go with the stroke number
	Substeps  int
	CupRadius float64
	// World is the hole's world ("" is "garden"); Order is its place there,
	// 1 first (0: the number in its path).
	World string
	Order float64
	// Shelter caps the wind the hole is played in (0: the world's own).
	Shelter float64
}

// MaxWind is the strongest wind the hole is played in (0: the world's own).
func (h *Simple) MaxWind() float64 { return h.Shelter }

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

// PreviewWith plays a stroke of a round in some weather, read-only, the timed
// pieces starting at tick. A pulse piece that came back on the ball pushes it
// out, never across the hole's own walls. A ball left where the next stroke
// brings a hazard back returns to where this stroke started, as under a timed
// hazard (else that hazard would cost a stroke for nothing).
func (h *Simple) PreviewWith(ball physics.Vec2, angle, power float64, stroke, tick int, weather []physics.Zone) (physics.Shot, bool) {
	ws, ps := h.Extras(stroke)
	ball = physics.UnstickIn(ball, ws, ps, h.Course.Radius, h.Course.Walls)
	f := WithZones(WithExtras(h.Course, ws, ps), h.ExtraZones(stroke))
	f = physics.WithTick(WithWeather(f, weather), tick)
	shot, holed := Sink(f.Step(ball, Launch(angle, power), h.Substeps), h.Pin, h.CupRadius, h.Course.Radius)
	if !holed && len(shot.Path) > 0 {
		for _, z := range h.ExtraZones(stroke + 1) {
			if z.Kind == physics.Hazard && z.Contains(shot.Rest()) {
				shot.Path = append(shot.Path, ball)
				shot.Air = append(shot.Air, false)
				shot.Cause = append(shot.Cause, '-')
				break
			}
		}
	}
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

// Kick turns a stroke's power (0 to 10) into the ball's speed per substep,
// Kick·p^(3/4), so the roll (v²/2a) grows as p^(3/2). A full stroke rolls 44
// on the usual green, a board's length. Calibrated to keep every hole's par.
const Kick = 0.79

// Launch is the ball's starting velocity for a stroke. Every hole should use
// it, so that the same pull means the same shot on every course.
func Launch(angle, power float64) physics.Vec2 {
	if !(power > 0) {
		return physics.Vec2{}
	}
	return physics.FromPolar(angle, Kick*math.Sqrt(power*math.Sqrt(power)))
}

// minDrop is the least a ball falls to drop: a smaller ball drops as one of
// 0.5, else a point ball would drop into any cup at any speed.
const minDrop = 0.5

// Capture is the fastest a ball of radius ball crossing a cup of radius cup,
// off its centre by off, can go and still drop, in board units per substep;
// 0 when it cannot drop at all. Holmes's criterion (Am. J. Phys. 59, 1991):
// (2·sqrt(R² − b²) − r) · sqrt(G / 2r).
func Capture(cup, ball, off float64) float64 {
	c := cup*cup - off*off
	if !(c > 0) {
		return 0
	}
	if !(ball >= minDrop) {
		ball = minDrop
	}
	chord := 2*math.Sqrt(c) - ball
	if !(chord > 0) {
		return 0
	}
	return chord * math.Sqrt(physics.G/(2*ball))
}

// jumpStep is how much longer than the fastest drop a step must be for the
// one after it to be the rest of a jump, not a slow ball.
const jumpStep = 1.5

// Sink decides whether a shot ends in the cup: it stops within radius of the
// pin, or crosses the cup no faster than Capture allows a ball of radius
// ball. When it drops, the path is cut there and ends on the pin.
func Sink(shot physics.Shot, pin physics.Vec2, radius, ball float64) (physics.Shot, bool) {
	p := shot.Path
	top := Capture(radius, ball, 0) // over the middle: the fastest drop
	for i := 0; i+1 < len(p); i++ {
		a, d := p[i], p[i+1].Sub(p[i])
		if d.LenCmp(top) > 0 {
			continue // too fast, or a tunnel jump
		}
		if airborne(shot, i) || airborne(shot, i+1) {
			continue // flying over the cup is not dropping into it
		}
		// a short step right after a long one is not a slow ball: it is the
		// rest of a substep after a tunnel exit or a bounce
		if i > 0 && p[i].Sub(p[i-1]).LenCmp(top*jumpStep) > 0 {
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
		// the step's nearest point to the pin is where it crosses the cup
		if off := at.Sub(pin).Len(); off <= radius && l <= Capture(radius, ball, off) {
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
