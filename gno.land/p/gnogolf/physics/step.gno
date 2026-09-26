package physics

import (
	"math"
	"strings"
)

// The model is a rigid ball on the board's plane, stepped at a fixed
// timestep (the substep), with a height that only a renderer draws. Its laws
// are the textbook ones a rigid-body engine (Box2D, cannon.js) uses:
//
//	gravity        G, along a hill: its Vec, which is G·sin θ downhill
//	rolling        a constant deceleration Crr·G·cos θ against the velocity
//	contacts       an impulse: restitution e along the normal, Coulomb
//	               friction µ along the tangent, clamped to what stops the
//	               contact point of a rolling ball (TangentMass)
//	flight         ballistic under G off a crest the ball is too fast for
//
// Units: board units and substeps, so G is in board units per substep².

// G is gravity, in board units per substep squared. It sets how steep a
// hill's Vec is (sin θ = |Vec| / G), how long a ball flies off a crest and
// how fast one may cross the cup and still drop.
const G = 1.0

// The calibration of rolling resistance. Friction (the field's) and a
// Surface's Scale were the two rules of a speed-dependent drag: each substep
// a ball kept a share keep of its speed and lost a fixed Drag/Scale. Rolling
// maps them onto a rolling-resistance coefficient Crr, fitted (least squares)
// so that a full stroke stops where it did on every Friction and Scale the
// course uses, within about 3%:
//
//	keep = min((Friction + keepBonus) · Scale, maxKeep)
//	Crr  = ((1 − keep) · RollSpeed + RollDrag / Scale) / G
//
// A green of Friction 0.87 has Crr 0.224, sand (Scale 0.5) 1.13, brick
// (0.92) 0.36, ice (1.18) 0.104.
const (
	RollSpeed = 1.8
	RollDrag  = 0.08
	keepBonus = 0.05
	maxKeep   = 0.98
)

// Rolling is the rolling-resistance coefficient Crr of a green of the given
// Friction under a Surface of the given Scale (1 is plain grass). A Scale of
// 0 or less holds the ball where it is: an infinite Crr.
func Rolling(friction, scale float64) float64 {
	if !(scale > 0) {
		return math.Inf(1)
	}
	keep := (friction + keepBonus) * scale
	if keep > maxKeep {
		keep = maxKeep
	}
	return ((1-keep)*RollSpeed + RollDrag/scale) / G
}

// The contact rules, as a rigid-body engine has them, for walls and posts.
const (
	// WallFriction is the Coulomb µ between the ball and a wall or post:
	// the tangential impulse is at most µ times the normal one.
	WallFriction = 0.05
	// TangentMass is the share of its speed along a surface a solid ball
	// (moment of inertia 2/5·m·r²) loses when the friction grips it: the
	// tangential impulse that stops its contact point from slipping is
	// m·v·2/7, and no more is ever applied.
	TangentMass = 2.0 / 7
	// RestSpeed is the speed into a surface, per substep, under which a
	// contact is resting, not an impact: no restitution, no bounce counted
	// (Box2D's velocity threshold). It is above what the steepest course
	// hill (0.35) adds in a substep, so a ball pressed into a rail by a hill
	// slides along it and does not jitter off it; a bounce it drops would
	// have rolled the ball back a fifth of a unit.
	RestSpeed = 0.35
	// MaxBounce is the most restitution a passive piece plays: a Bounce
	// above it, up to 1, is played at it. Nothing passive adds energy.
	MaxBounce = 0.92
	// MaxKick is the most restitution a bumper plays. A piece whose Bounce
	// is above 1 is a bumper: an active one, like a pinball's, that kicks
	// the ball back at Bounce times the speed it came in at (at most
	// MaxKick, the most course.Decode accepts). The ball stays under
	// SpeedCap.
	MaxKick = 1.5
)

// The flight rules. A ball goes over a hill's crest (its uphill edge) and
// leaves the ground when the ground curves away faster than gravity can
// hold it: v² > G·R at the crest, with v its speed up the hill and R the
// crest's radius. It flies a ballistic arc, and lands at the height it took
// off from, with restitution and friction.
const (
	// CrestRadius is the radius of a hill's rounded lip, in board units (a
	// kicker's lip is sharp: a quarter of the ball's width): a ball needs
	// sqrt(G·CrestRadius), 0.71 per substep, to take off, so a ball that
	// makes the top of a ramp at any real pace flies off it.
	CrestRadius = 0.5
	// MinRamp is the gentlest hill (|Vec|) that launches: a gentler one is
	// a lawn's undulation, and a ball rolls over it.
	MinRamp = 0.12
	// GroundBounce is the restitution of the ground when a ball lands.
	GroundBounce = 0.4
	// LandFriction is the Coulomb µ between a landing ball and the ground.
	LandFriction = 0.3
	// HopSpeed is the vertical speed, per substep, under which a landing
	// ball stays down: slower, the rebound is a roll, not a hop.
	HopSpeed = 0.25
	// MaxSin is the steepest grade a hill plays, sin θ (about 72°): its
	// push is G·sin θ, so course.Decode holds a Slope's |Vec| to G·MaxSin,
	// and newHill caps the grade there (tan θ ≤ 3.05, a flight that ends);
	// no course hill is steeper than 20°.
	MaxSin = 0.95
)

// MaxRollOn caps the substeps a ball may roll on past its stroke's own while
// a slope keeps it moving, or while it is still in the air.
const MaxRollOn = 120

// pinCheck and pinMove: a ball rolling on that moves less than pinMove in
// pinCheck substeps is pinned, and stops.
const (
	pinCheck = 8
	pinMove  = 0.1
)

// MaxWork caps what one stroke may cost, whatever the field, in work units
// of about a thousand gas each (Shot.Work): a stroke that reaches it ends
// where the ball is. The units are counted as the stroke goes, from what
// it does (the weights below, measured in the GnoVM). No course shot comes
// near it; it holds a hostile hole's stroke (bumper walls across the whole
// board, a hill that keeps the ball rolling on, polygons under every move)
// to about 1.2e9 gas.
const MaxWork = 1000000

// The work weights, in units: a substep, a move, a wall or post a move's
// broad phase looks at, a wall and a post it tests for a contact, a zone
// and a polygon point a move or a rest check looks at, and a zone that
// takes a square root there (a loop's mouth, capped wind), and a wall a
// timed bar's push is checked against, per side. Fitted on the
// GnoVM's gas over course shots and hostile probes, then raised by about a
// third.
const (
	substepWork  = 700
	moveWork     = 15
	broadWork    = 6
	wallTestWork = 200
	postTestWork = 300
	zoneWork     = 8
	zonePtWork   = 3
	rootWork     = 200
	unstickWork  = 20
)

// MaxWorkStep is the most a stroke's Work passes MaxWork by: it is checked
// before each timed bar's push, each move and each contact, and one move's
// zones and sweep over a Decode-limited field cost less.
const MaxWorkStep = 100000

// maxHits is the most contacts one move resolves: a move that hits spends
// what is left of it from the contact, and a ball in a corner may meet the
// other wall in the same move.
const maxHits = 4

// Shot is everything a stroke did: where the ball was at every substep, and how
// many barriers it met on the way.
//
// The path exists so that nothing else has to recompute the flight. A renderer
// replays these points; it never simulates. That keeps the chain the only place
// the physics runs, which is the only way a client and a validator can agree on
// where the ball landed.
//
// A Tunnel puts two consecutive points far apart on purpose — that
// discontinuity is the ball being somewhere else, and a renderer should draw it
// as such rather than interpolating across the board.
type Shot struct {
	Path    []Vec2
	Bounces int
	// Air marks the path points where the ball is off the ground, after
	// taking off from the top of a slope. In the air it meets walls but no
	// zone — it flies over water and sand — and it cannot drop into a cup.
	// Same length as Path.
	Air []bool
	// Cause says, per path point, what most acted on the ball in the substep
	// that ended there: 'b' a bounce, 's' a hill, 'w' wind or a gust, 'i' a
	// slippery surface (ice, rain), '-' nothing but friction. Same length as
	// Path.
	Cause []byte
	why   byte // this substep's cause so far
	// Work is what the stroke cost, in units of MaxWork: see there.
	Work int
}

func (s *Shot) add(p Vec2, air bool) {
	s.Path = append(s.Path, p)
	s.Air = append(s.Air, air)
	s.Cause = append(s.Cause, '-')
}

// mark records c as this substep's cause if it outranks what is there.
func (s *Shot) mark(c byte) {
	if strings.IndexByte(causes, c) > strings.IndexByte(causes, s.why) {
		s.why = c
	}
}

// causes is the Cause letters, weakest first.
const causes = "-iwsb"

// The loop's mouth: a ball heading in within 45° (loopIn, cos 45°) enters,
// one more than 25° off straight (loopStraight, cos 25°) rides up the side
// and is set down loopDrop in front, loopFront outside the mouth; one too
// slow to go round rolls back out at loopBack of its speed.
const (
	loopIn       = 0.7071
	loopStraight = 0.9063
	loopFront    = 0.01
	loopDrop     = 1.5
	loopBack     = 0.5
)

// Rest is where the ball stopped.
func (s Shot) Rest() Vec2 {
	if len(s.Path) == 0 {
		return Vec2{}
	}
	return s.Path[len(s.Path)-1]
}

// MaxMove is the longest single move inside a substep. Zones are sampled once
// per move, so a zone must be at least this deep along the way a ball crosses
// it, or a fast ball can step over it unseen.
const MaxMove = 1.5

// SpeedCap is the fastest a ball may go, in board units per substep: it is
// held at the start of every substep and after every bounce (within a
// substep, a slope can add up to its own Vec on top). A full stroke starts
// well under it, and only a bumper adds energy; it bounds a substep to 6
// moves on a hole that would run a ball down a slope on ice for ever, or
// between two bumpers.
const SpeedCap = 8

// Step rolls a ball through the field until it comes to rest or runs out of
// substeps (and past them while a slope keeps it rolling or it is still in
// the air, see MaxRollOn).
//
// With a Radius the ball is round: it meets walls and posts with its edge.
//
// Each substep is a semi-implicit Euler step, walked in moves of at most
// MaxMove: the zones under each move push the ball (a hill by its Vec, the
// wind by its own), it moves, and a move that meets a wall or a post takes
// the contact impulse there and spends what is left of it from the contact.
// Rolling resistance takes its toll once the substep is walked.
//
// Cost is O(moves * (walls + posts + zones)), where a substep is
// floor(speed / MaxMove) + 1 moves and is charged to the player on
// every shot, so both numbers are a hole's budget, not a free parameter.
func (f *Field) Step(pos, vel Vec2, substeps int) Shot {
	out := Shot{Path: make([]Vec2, 0, substeps+2), Air: make([]bool, 0, substeps+2)}
	out.add(pos, false)
	air := 0.0 // substeps left in the air; 0 on the ground
	vz := 0.0  // the vertical speed the ball took off (or bounced) with
	hop := 0.0 // a landing's rebound, up again once the zones under it are met

	// Each wall's two offset lines — one per side, pushed out by the ball's
	// radius — are worked out once per hole (Prepare) or, for walls that come
	// with the stroke, once per shot: never once per move. Everything a move
	// asks of a wall is here, so the loop never copies the Wall itself.
	offs := f.offsets()
	bars := f.timedBars()
	slopes := f.groundSlopes()
	// what one look at the zones costs, in work units
	zonesWork := zoneWork
	for j := range f.Zones {
		z := &f.Zones[j]
		zonesWork += zoneWork + zonePtWork*len(z.Poly)
		if z.Kind == Loop || z.Capped {
			zonesWork += rootWork // they take a square root
		}
	}

	// A ball does not stop on a slope steeper than its rolling resistance:
	// when the stroke's substeps run out while it is still on one, or still
	// in the air, it goes on (up to MaxRollOn more) until it is down and
	// off it — a gnome left on a hill slides down, it does not wait there
	// for the next stroke.
	extra := 0
	// the hill being climbed, and how far up it the climb began
	var ramp *hill
	rampFrom, from := 0.0, pos
	// rolling on, a ball pinned against a wall by the slope only jitters in
	// place: checked every pinCheck substeps, it stops once it has not got
	// anywhere (a real roll down gathers speed, it always gets somewhere)
	base, anchor := substeps, pos
	// the rolling deceleration the ball meets, per substep: where it starts,
	// then the last substep's
	drag := f.resistance(slopes, pos, f.Tick)
	for i := 0; i < substeps; i++ {
		tick := i + f.Tick
		if i >= base && (i-base)%pinCheck == 0 {
			if i > base && air <= 0 && pos.Sub(anchor).Len() < pinMove {
				break
			}
			anchor = pos
		}
		if i == substeps-1 && extra < MaxRollOn && (air > 0 || f.rolls(slopes, pos, -1)) {
			substeps++
			extra++
		}
		// A timed bar that comes back (a tram arriving, a plank swinging
		// in) where the ball is pushes it out through its nearest side, as
		// a piece appearing between strokes does (UnstickIn): a wall never
		// stands on the ball, nor pushes it through another. On the first
		// substep any bar standing counts.
		spent := false
		for _, j := range bars {
			w := &f.Walls[j]
			if there(tick, w.Every, w.On, w.Phase) && (i == 0 || !there(tick-1, w.Every, w.On, w.Phase)) {
				if spent = out.Work > MaxWork; spent {
					break
				}
				pos = UnstickIn(pos, f.Walls[j:j+4], nil, f.Radius, f.Walls)
				out.Work += 4 * unstickWork * len(f.Walls)
			}
		}
		if spent {
			if pos != out.Rest() {
				out.add(pos, false)
			}
			break
		}
		// A substep is walked in moves of at most MaxMove, so a fast ball
		// meets every zone and wall it crosses instead of jumping over them.
		// The path still gets one point per substep: it is what a renderer
		// replays.
		speed := vel.Len()
		if speed > SpeedCap {
			vel, speed = vel.Scale(SpeedCap/speed), SpeedCap
		}
		// Rolling resistance is a constant deceleration, applied as two
		// half-kicks around the substep's moves (velocity Verlet): the ball
		// covers v − a/2 in a substep that takes a off it, so it rolls
		// v²/2a, as a ball under a constant deceleration does. The first
		// half is the one it met at the end of the last substep. It never
		// reverses the ball: one it would stop, it stops.
		if air <= 0 && hop <= 0 {
			if dv := drag / 2; speed > dv {
				vel, speed = vel.Scale((speed-dv)/speed), speed-dv
			} else {
				vel, speed = Vec2{}, 0
				// at rest where no hill can move it, it stays (no creeping)
				if !f.rolls(slopes, pos, tick) {
					if pos != out.Rest() {
						out.add(pos, false) // where a timed bar put it
					}
					break
				}
			}
		}
		n := int(speed/MaxMove) + 1
		dt := 1 / float64(n)
		roll := 0.0 // the rolling deceleration, summed over the moves on the ground
		out.why = '-'
		for k := 0; k < n; k++ {
			if out.Work > MaxWork {
				spent = true // the stroke has cost all it may: it ends here
				break
			}
			out.Work += moveWork
			// in the air no zone acts: the ball flies over water, sand, a
			// tunnel's mouth
			var up *hill
			if air <= 0 {
				// the ground under this move: grass unless a zone says
				// otherwise (a ball that left the sand mid-substep is on grass)
				surface := 1.0
				var under *hill
				out.Work += 2 * zonesWork // the zones, and the ground's checks after the move
				if f.zonesAt(&pos, &vel, &surface, &under, slopes, n, tick, &out) {
					return out
				}
				if surface > 1 {
					out.mark('i')
				}
				if hop > 0 {
					// the rebound of a landing, once the ground it came down
					// on has had its say (water under it still catches it)
					vz, air, hop = hop, 2*hop/G, 0
				} else {
					c := 1.0
					if under != nil {
						c = under.cos
					}
					roll += Rolling(f.Friction, surface) * G * c
				}
				up = under
				if up != nil && vel.Dot(up.z.Vec) >= 0 {
					up = nil // on the hill, but not climbing it
				}
				if up != ramp {
					// a new climb: it counts from where the ball came onto
					// the hill (the start of the move that brought it here,
					// no further back than the hill's foot)
					ramp = up
					if up != nil {
						rampFrom = up.along(from)
					}
				}
			}
			from = pos

			// The move, from contact to contact: a move that hits spends
			// what is left of it from where it hit, with the velocity the
			// contact left it.
			hit, left := false, 1.0
			for h := 0; h < maxHits && left > 0; h++ {
				if h > 0 && out.Work > MaxWork {
					break // spent: the ball stops at the contact
				}
				move := vel.Scale(left * dt)
				next := pos.Add(move)
				best, normal, bounce, ok := f.sweep(offs, pos, next, move, tick, &out)
				if !ok {
					pos = next
					break
				}
				const skin = 1e-6
				pos = pos.Add(move.Scale(best)).Add(normal.Scale(skin))
				var impact bool
				vel, impact = contact(vel, normal, bounce)
				if l := vel.Len(); l > SpeedCap {
					vel = vel.Scale(SpeedCap / l) // two bumpers facing each other
				}
				if impact {
					out.Bounces++
					out.mark('b')
				}
				hit = true
				left *= 1 - best
			}
			if air > 0 {
				if air -= dt; air <= 0 {
					// down: the ground's impulse, restitution up and
					// Coulomb friction along, as at a wall
					air = 0
					j := (1 + GroundBounce) * vz
					if l := vel.Len(); l > 0 {
						dv := LandFriction * j
						if s := TangentMass * l; dv > s {
							dv = s
						}
						vel = vel.Scale((l - dv) / l)
					}
					if vz *= GroundBounce; vz > HopSpeed {
						hop = vz
					}
				}
			} else if up != nil && !hit && !f.climbs(slopes, pos, vel, tick) && up.overTheTop(from, pos, rampFrom) {
				// over the crest, faster than its curve can hold: it takes
				// off, and flies a ballistic arc, up at the hill's grade
				if vu := vel.Dot(up.u); vu > 0 && vu*vu > G*CrestRadius {
					vz = vu * up.tan
					air = 2 * vz / G
				}
			}
		}
		out.add(pos, air > 0)
		out.Cause[len(out.Cause)-1] = out.why
		if spent {
			break
		}
		out.Work += substepWork + 2*zonesWork // this substep, its rest and roll-on checks
		if air > 0 || hop > 0 {
			drag = 0
			continue // no rolling resistance off the ground
		}

		// the second half-kick, at the deceleration of the moves on the
		// ground (their share of the substep)
		drag = roll * dt
		l := vel.Len()
		if dv := drag / 2; l > dv {
			vel = vel.Scale((l - dv) / l)
			continue
		}
		vel = Vec2{}
		// on a hill steeper than its rolling resistance a ball does not stay
		// put: it stops, then rolls back down (the hill pulls it next substep)
		if f.rolls(slopes, pos, tick+1) {
			continue
		}
		break
	}

	// a ball at rest is on the ground, whatever was left of its flight
	out.Air[len(out.Air)-1] = false
	// A ball that came to rest in the water or in a tunnel's mouth is resolved
	// now, not on the player's next stroke.
	var still Vec2
	surface := 1.0
	var under *hill
	if f.zonesAt(&pos, &still, &surface, &under, slopes, 1, substeps+f.Tick, &out) {
		return out
	}
	// A ball at rest under a timed hazard or tunnel (falling ice, a
	// blowhole) waits there for the next stroke, and the hazard comes on
	// within its period, whatever the tick: it meets it. Checking the one
	// substep the stroke ended on let a lay-up under a serac survive.
	for j := range f.Zones {
		z := &f.Zones[j]
		if z.Every <= 0 || z.On <= 0 || (z.Kind != Hazard && z.Kind != Tunnel) || !z.contains(pos) {
			continue
		}
		if z.Kind == Hazard {
			out.add(z.Vec, false)
			return out
		}
		pos = z.Vec
		out.add(pos, false)
	}
	return out
}

// contact is a contact impulse on a ball moving at vel into a surface of
// unit normal n (pointing out of the surface, toward the ball) and the given
// Bounce: the part of the velocity into the surface comes back times the
// restitution e, and the part along it loses the Coulomb friction, at most
// WallFriction times the normal impulse and never more than stops a rolling
// ball's contact point (TangentMass). Slower into it than RestSpeed, it is a
// resting contact: e is 0, and it is no impact.
func contact(vel, n Vec2, bounce float64) (Vec2, bool) {
	vn := vel.Dot(n)
	if !(vn < 0) {
		return vel, false // not moving into it
	}
	e := bounce
	if e > 1 {
		if e > MaxKick {
			e = MaxKick
		}
	} else if e > MaxBounce {
		e = MaxBounce
	}
	impact := -vn >= RestSpeed
	if !impact {
		e = 0
	}
	jn := -(1 + e) * vn // the normal impulse, per unit mass
	vt := vel.Sub(n.Scale(vn))
	if lt := vt.Len(); lt > 0 {
		jt := WallFriction * jn
		if s := TangentMass * lt; jt > s {
			jt = s
		}
		vt = vt.Scale((lt - jt) / lt)
	}
	return vt.Add(n.Scale(-e * vn)), impact
}

// sweep is the first wall or post the move pos→next meets: how far along it
// (0 to 1), the surface's normal there (toward the ball), and its bounce.
func (f *Field) sweep(offs []offset, pos, next, move Vec2, tick int, out *Shot) (float64, Vec2, float64, bool) {
	const skin = 1e-6
	out.Work += broadWork * (len(offs) + len(f.Posts))
	// the move's box: a wall or post whose own box it misses cannot touch
	// it (the broad phase: a lane hole's ball is near a few of its walls,
	// and each test costs more than these four compares)
	lo, hi := pos, next
	if lo.X > hi.X {
		lo.X, hi.X = hi.X, lo.X
	}
	if lo.Y > hi.Y {
		lo.Y, hi.Y = hi.Y, lo.Y
	}
	best, normal, restitution, hit := 1.0, Vec2{}, f.Bounce, false
	for j := range offs {
		o := &offs[j]
		if o.hi.X < lo.X || o.lo.X > hi.X || o.hi.Y < lo.Y || o.lo.Y > hi.Y {
			continue
		}
		if !there(tick, o.every, o.on, o.phase) {
			continue // a timed wall that is not there this substep
		}
		out.Work += wallTestWork
		side := pos.Sub(o.a).Dot(o.n)
		seg, sn, facing := o.plus, o.pn, o.n
		if side < 0 {
			seg, sn, facing = o.minus, o.mn, o.n.Scale(-1)
		}
		// Already closer than the radius (a corner, a wall that moved onto
		// the ball): the offset line is behind it, so meet the wall now if
		// the ball is moving into it.
		if f.Radius > 0 {
			d := side
			if d < 0 {
				d = -d
			}
			if d <= f.Radius+skin/2 {
				along := Vec2{o.n.Y, -o.n.X}
				u := pos.Sub(o.a).Dot(along) // along the wall, from A toward B
				if u >= 0 && u <= o.length {
					if move.Dot(facing) < 0 {
						best, normal, hit = 0, facing, true
						restitution = o.bounce
					}
					continue
				}
				// past an end, the ball touches the wall's end point, not
				// its face: push back along the line from that point. The
				// face's normal there points across the next wall of a
				// corner and set the ball jittering between the two. Not
				// touching it yet, it may still meet it on the way: the end
				// is a round cap, swept like a post (skipping it let a ball
				// cut through a free wall end). That holds however far past
				// the end the ball is: a ball coming along the wall's line
				// meets nothing else.
				end := o.a
				if u > o.length {
					end = o.a.Add(along.Scale(o.length))
				}
				rv := pos.Sub(end)
				if l := rv.Len(); l > 0 && l <= f.Radius+skin/2 {
					if nrm := rv.Scale(1 / l); move.Dot(nrm) < 0 {
						best, normal, hit = 0, nrm, true
						restitution = o.bounce
					}
				} else if t, nn, ok := (Circle{C: end, R: f.Radius}).Hit(pos, next); ok && t < best {
					best, normal, hit = t, nn, true
					restitution = o.bounce
				}
				continue
			}
		}
		if t, nn, ok := seg.hitN(pos, next, sn); ok && t < best {
			best, normal, hit = t, nn, true
			restitution = o.bounce
		}
		// The offset lines are lengthened by the radius at each end: square
		// caps, with no end face, that leave a gap in front of an acute
		// corner's tip. The ends are round caps, swept like posts, from afar
		// too: a ball coming head-on at a tip, or diagonally at a free end,
		// meets the end point, not the solid behind it. A round cap lies
		// inside its square one, so a ball that the offset line stops first
		// is not touched.
		if f.Radius > 0 && o.length > 0 {
			along := Vec2{o.n.Y, -o.n.X}
			for _, end := range [2]Vec2{o.a, o.a.Add(along.Scale(o.length))} {
				if t, nn, ok := (Circle{C: end, R: f.Radius}).Hit(pos, next); ok && t < best {
					best, normal, hit = t, nn, true
					restitution = o.bounce
				}
			}
		}
	}
	for j := range f.Posts {
		p := &f.Posts[j]
		c := p.Circle
		c.R += f.Radius
		if reach := c.R + boxPad; c.C.X+reach < lo.X || c.C.X-reach > hi.X || c.C.Y+reach < lo.Y || c.C.Y-reach > hi.Y {
			continue
		}
		out.Work += postTestWork
		if t, nn, ok := c.Hit(pos, next); ok && t < best {
			best, normal, hit = t, nn, true
			restitution = orDefault(p.Bounce, f.Bounce)
		}
	}
	return best, normal, restitution, hit
}

// zonesAt applies the zones the ball is in, and reports whether a hazard
// ended the shot. The ground under the ball is one hill at most: the first
// ground Slope there (in field order) is the hill, its Vec pushes, and it is
// left in *under; moving air (Zone.Air) pushes on top of it.
func (f *Field) zonesAt(pos, vel *Vec2, surface *float64, under **hill, slopes []hill, n, tick int, out *Shot) bool {
	*under = nil
	hk := 0 // the next hill of slopes, in field order
	for j := range f.Zones {
		z := &f.Zones[j]
		ground := z.Kind == Slope && !z.Air
		var h *hill
		if ground {
			if hk < len(slopes) {
				h = &slopes[hk]
			}
			hk++
		}
		if !there(tick, z.Every, z.On, z.Phase) || !z.contains(*pos) {
			continue
		}
		switch z.Kind {
		case Surface:
			*surface = z.Scale // the surface under this move (the last listed wins)
		case Slope:
			if ground {
				if *under != nil || h == nil {
					continue // already on a hill: the first one is the ground
				}
				*under = h
				out.mark('s')
				*vel = vel.Add(z.Vec.Scale(1 / float64(n)))
				continue
			}
			out.mark('w')
			wind := z.Capped
			v2 := 0.0
			if wind {
				v2 = vel.Dot(*vel)
			}
			*vel = vel.Add(z.Vec.Scale(1 / float64(n)))
			// the weather's wind bends a rolling ball and brakes it, but never
			// speeds it up: on ice it would beat the rolling resistance and
			// keep a ball drifting. (Squared first: the roots are only taken
			// when it did speed up.)
			if l2 := vel.Dot(*vel); wind && l2 > v2 {
				if v0, l := math.Sqrt(v2), math.Sqrt(l2); l > v0 {
					if v0 == 0 {
						*vel = Vec2{}
					} else {
						*vel = vel.Scale(v0 / l)
					}
				}
			}
		case Tunnel:
			*pos = z.Vec
			out.add(*pos, false)
		case Hazard:
			out.add(z.Vec, false)
			return true
		case Loop:
			// decided at once, on the way in: the ball is put out of the
			// mouth — round, back, or down in front of it — so it never has
			// to remember being inside
			axis, sign := Vec2{1, 0}, 1.0
			mid := z.Min.Add(z.Max).Scale(0.5)
			if math.Abs(z.Vec.Y-mid.Y) > math.Abs(z.Vec.X-mid.X) {
				axis = Vec2{0, 1}
			}
			if z.Vec.Dot(axis) < mid.Dot(axis) {
				sign = -1
			}
			in := axis.Scale(sign) // the way into the loop
			sp := vel.Len()
			if vel.Dot(in) <= sp*loopIn {
				continue // not heading into the mouth: it rolls across
			}
			// slanted in (more than 25° off straight), it rides up the side of
			// the track and falls off it: put down in front of the mouth, still
			slanted := vel.Dot(in) <= sp*loopStraight
			front := z.Min.Dot(axis) - loopFront
			if sign < 0 {
				front = z.Max.Dot(axis) + loopFront
			}
			side := pos.Sub(axis.Scale(pos.Dot(axis)))
			switch {
			case slanted:
				// off the side of the track: down in front of the mouth, still
				*pos = mid.Sub(axis.Scale(mid.Dot(axis))).Add(axis.Scale(front - sign*loopDrop))
				out.add(*pos, false)
				return true
			case sp >= z.Scale:
				*pos = z.Vec
				*vel = in.Scale(sp * LoopKeep)
			default:
				*pos = side.Add(axis.Scale(front))
				*vel = vel.Scale(-loopBack)
			}
			out.add(*pos, false)
		}
	}
	return false
}

func orDefault(v, def float64) float64 {
	if v == 0 {
		return def
	}
	return v
}

// hill is a ground slope: its steepness |Vec| (G·sin θ), cos θ and tan θ of
// its grade, and its crest: u is the unit uphill (against Vec); the crest is
// the zone's edge u points at, on the axis u mostly runs along (every hill on
// the holes is a rectangle square to the board, so that edge is the whole
// top).
type hill struct {
	z        *Zone
	g        float64
	cos, tan float64
	u        Vec2
	onX      bool    // the crest is an edge across X (u mostly along X)
	crest    float64 // where it is, on that axis
	foot     float64 // the opposite edge, where a climb starts
	depth    float64 // foot to crest
	upward   float64 // +1 when uphill runs toward +X (or +Y), -1 the other way
}

func newHill(z *Zone) hill {
	h := hill{z: z, g: z.Vec.Len(), cos: 1}
	if h.g == 0 {
		return h // decor: never climbed
	}
	sin := h.g / G
	if sin > MaxSin {
		sin = MaxSin
	}
	h.cos = math.Sqrt(1 - sin*sin)
	h.tan = sin / h.cos
	h.u = z.Vec.Scale(-1 / h.g)
	h.onX = math.Abs(h.u.X) >= math.Abs(h.u.Y)
	lo, hi, dir := z.Min.Y, z.Max.Y, h.u.Y
	if h.onX {
		lo, hi, dir = z.Min.X, z.Max.X, h.u.X
	}
	h.crest, h.foot, h.upward = hi, lo, 1
	if dir < 0 {
		h.crest, h.foot, h.upward = lo, hi, -1
	}
	h.depth = hi - lo
	return h
}

// along is how far up the hill p is from its foot (0 at the foot or below).
func (h *hill) along(p Vec2) float64 {
	c := p.Y
	if h.onX {
		c = p.X
	}
	if d := (c - h.foot) * h.upward; d > 0 {
		return d
	}
	return 0
}

// JumpRun is the share of a hill's depth a ball must have climbed to take off
// at its top: one that only clipped the hill near its crest has not ridden it.
const JumpRun = 0.5

// overTheTop reports whether the move a→b, from on the hill, left it through
// its crest — not a side, not its foot — after a climb from rampFrom (a
// height along it) of at least JumpRun of the hill. A hill no steeper than
// MinRamp launches nothing.
func (h *hill) overTheTop(a, b Vec2, rampFrom float64) bool {
	if h.g <= MinRamp || h.z.contains(b) {
		return false
	}
	ac, bc, oa, ob := a.Y, b.Y, a.X, b.X
	lo, hi := h.z.Min.X, h.z.Max.X
	if h.onX {
		ac, bc, oa, ob = a.X, b.X, a.Y, b.Y
		lo, hi = h.z.Min.Y, h.z.Max.Y
	}
	if (bc-h.crest)*h.upward < 0 || ac == bc {
		return false // it did not get past the crest's line
	}
	// where the move crosses the crest's line must be on the crest
	if o := oa + (h.crest-ac)/(bc-ac)*(ob-oa); o < lo || o >= hi {
		return false
	}
	return h.depth-rampFrom >= JumpRun*h.depth
}

// groundSlopes is the field's hills, in field order: the only zones the
// ground rules look at, found (and measured) once per shot. A timed one
// counts only in the substeps it is there.
func (f *Field) groundSlopes() []hill {
	var out []hill
	for j := range f.Zones {
		// air (Zone.Air) is no hill; a timed hill (a seesaw) is still a hill,
		// while it is there
		if z := &f.Zones[j]; z.Kind == Slope && !z.Air {
			out = append(out, newHill(z))
		}
	}
	return out
}

// ground is the hill under the ball at tick: the first there, in field
// order, as zonesAt has it; nil off every hill. A tick below 0 asks for the
// untimed hills only.
func (f *Field) ground(slopes []hill, pos Vec2, tick int) *hill {
	for j := range slopes {
		s := &slopes[j]
		if (tick < 0 && s.z.Every > 0) || (tick >= 0 && !there(tick, s.z.Every, s.z.On, s.z.Phase)) {
			continue
		}
		if s.z.contains(pos) {
			return s
		}
	}
	return nil
}

// climbs reports whether the ball is moving up the hill under it.
func (f *Field) climbs(slopes []hill, pos, vel Vec2, tick int) bool {
	h := f.ground(slopes, pos, tick)
	return h != nil && vel.Dot(h.z.Vec) < 0
}

// resistance is the rolling deceleration of a ball at rest at pos at tick:
// Crr·G·cos θ, with Crr the green's under the Surface there (the last listed)
// and θ the grade of the hill there. A tick below 0 asks for the untimed
// zones only.
func (f *Field) resistance(slopes []hill, pos Vec2, tick int) float64 {
	t := tick
	if t < 0 {
		t = 0
	}
	surface := 1.0
	for j := range f.Zones {
		if z := &f.Zones[j]; z.Kind == Surface && (tick >= 0 || z.Every <= 0) && there(t, z.Every, z.On, z.Phase) && z.contains(pos) {
			surface = z.Scale
		}
	}
	c := 1.0
	if h := f.ground(slopes, pos, tick); h != nil {
		c = h.cos
	}
	return Rolling(f.Friction, surface) * G * c
}

// rolls reports whether a ball at rest at pos rolls away at tick: it is on
// a hill that pulls harder than its rolling resistance holds, G·sin θ above
// Crr·G·cos θ (tan θ above Crr). A tick below 0 asks for the untimed hills
// only: rolling on past the stroke's substeps is for a ball left on a hill,
// not on a rocking plank (it would rock there for all MaxRollOn substeps).
func (f *Field) rolls(slopes []hill, pos Vec2, tick int) bool {
	h := f.ground(slopes, pos, tick)
	return h != nil && h.g > f.resistance(slopes, pos, tick)
}
