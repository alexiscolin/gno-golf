package physics

import (
	"math"
	"strings"
)

// MaxRollOn caps the substeps a ball may roll on past its stroke's own while
// a slope keeps it moving.
const MaxRollOn = 120

// pinCheck and pinMove: a ball rolling on that moves less than pinMove in
// pinCheck substeps is pinned, and stops.
const (
	pinCheck = 8
	pinMove  = 0.1
)

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

// JumpSpeed is the speed, per substep, a ball needs to leave the ground at
// the top of a slope.
const JumpSpeed = 1.5

// Lift is how far a ball past JumpSpeed flies: Lift times its speed over
// JumpSpeed times the slope's steepness, so faster and off a steeper hill,
// further.
const Lift = 12

// The rolling rules: a substep keeps Friction plus keepBonus of the speed,
// times the surface, at most maxKeep of it; a ball slower than stopSpeed has
// stopped.
const (
	keepBonus = 0.05
	maxKeep   = 0.98
	stopSpeed = 0.02
)

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

// Along is how much of its speed along a wall a ball keeps when it bounces.
const Along = 0.97

// MaxBounce is the most of its speed into a surface a ball ever gets back.
// Nothing on a mini-golf course adds energy: a rubber bumper is the liveliest
// thing there is, and it still loses some. A Bounce above this (the "lively"
// bumpers some holes ask for, up to 1.3) is played at this.
const MaxBounce = 0.92

// Drag is the fixed speed a rolling ball loses every substep, on grass.
const Drag = 0.12

// SpeedCap is the fastest a ball may go, in board units per substep. A full
// stroke starts at 6, and nothing adds energy (MaxBounce): a guard, not a
// rule anything reaches.
const SpeedCap = 8

// Step rolls a ball through the field until it comes to rest or runs out of
// substeps (and past them while a slope keeps it rolling, see MaxRollOn).
//
// With a Radius the ball is round: it meets walls and posts with its edge.
//
// Cost is O(moves * (walls + posts + zones)), where a substep is
// floor(speed / MaxMove) + 1 moves and is charged to the player on
// every shot, so both numbers are a hole's budget, not a free parameter.
func (f *Field) Step(pos, vel Vec2, substeps int) Shot {
	const skin = 1e-6
	out := Shot{Path: make([]Vec2, 0, substeps+2), Air: make([]bool, 0, substeps+2)}
	out.add(pos, false)
	air := 0.0 // distance left to fly; 0 on the ground

	// Each wall's two offset lines — one per side, pushed out by the ball's
	// radius — are worked out once per hole (Prepare) or, for walls that come
	// with the stroke, once per shot: never once per move. Everything a move
	// asks of a wall is here, so the loop never copies the Wall itself.
	offs := f.offsets()
	bars := f.timedBars()
	slopes := f.groundSlopes()

	// A ball does not stop on a slope steeper than the drag: when the stroke's
	// substeps run out while it is still on one, it rolls on (up to
	// MaxRollOn more) until it comes off it — a gnome left on a hill slides
	// down, it does not wait there for the next stroke.
	extra := 0
	// the hill being climbed, and how far up it the climb began
	var ramp *hill
	rampFrom, from := 0.0, pos
	// rolling on, a ball pinned against a wall by the slope only jitters in
	// place: checked every pinCheck substeps, it stops once it has not got
	// anywhere (a real roll down gathers speed, it always gets somewhere)
	base, anchor := substeps, pos
	for i := 0; i < substeps; i++ {
		if i >= base && (i-base)%pinCheck == 0 {
			if i > base && pos.Sub(anchor).Len() < pinMove {
				break
			}
			anchor = pos
		}
		if i == substeps-1 && extra < MaxRollOn && air <= 0 && pull(slopes, pos, -1) > Drag {
			substeps++
			extra++
		}
		// A timed bar that comes back (a tram arriving, a plank swinging
		// in) where the ball is pushes it out through its nearest side, as
		// a piece appearing between strokes does (Unstick): a wall never
		// stands on the ball, nor pushes it through another. On the first
		// substep any bar standing counts.
		for _, j := range bars {
			w := &f.Walls[j]
			if there(i+f.Tick, w.Every, w.On, w.Phase) && (i == 0 || !there(i-1+f.Tick, w.Every, w.On, w.Phase)) {
				pos = unstick(pos, f.Walls[j:j+4], nil, f.Radius, f.Walls)
			}
		}
		// A substep is walked in moves of at most MaxMove, so a fast ball
		// meets every zone and wall it crosses instead of jumping over them,
		// and a bounce keeps what is left of the substep. The path still gets
		// one point per substep: it is what a renderer replays.
		n := int(vel.Len()/MaxMove) + 1
		surface := 1.0
		out.why = '-'
		for k := 0; k < n; k++ {
			// in the air no zone acts: the ball flies over water, sand, a
			// tunnel's mouth
			var up *hill
			if air <= 0 {
				// the ground under this move: grass unless a zone says
				// otherwise (a ball that left the sand mid-substep is on grass)
				surface = 1.0
				if f.zonesAt(&pos, &vel, &surface, n, i+f.Tick, &out) {
					return out
				}
				up = climbing(slopes, pos, vel, i+f.Tick)
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

			move := vel.Scale(1 / float64(n))
			next := pos.Add(move)
			// the move's box: a wall or post whose own box it misses cannot
			// touch it (the broad phase: a lane hole's ball is near a few of
			// its walls, and each test costs more than these four compares)
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
				if !there(i+f.Tick, o.every, o.on, o.phase) {
					continue // a timed wall that is not there this substep
				}
				side := pos.Sub(o.a).Dot(o.n)
				seg, sn, facing := o.plus, o.pn, o.n
				if side < 0 {
					seg, sn, facing = o.minus, o.mn, o.n.Scale(-1)
				}
				// Already closer than the radius (a corner, a wall that moved
				// onto the ball): the offset line is behind it, so meet the
				// wall now if the ball is moving into it.
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
						// corner and set the ball jittering between the two.
						// Not touching it yet, it may still meet it on the way:
						// the end is a round cap, swept like a post (skipping it
						// let a ball cut through a free wall end).
						// That holds however far past the end the ball is: a ball
						// coming along the wall's line meets nothing else.
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
			}
			for j := range f.Posts {
				p := &f.Posts[j]
				c := p.Circle
				c.R += f.Radius
				if reach := c.R + boxPad; c.C.X+reach < lo.X || c.C.X-reach > hi.X || c.C.Y+reach < lo.Y || c.C.Y-reach > hi.Y {
					continue
				}
				if t, nn, ok := c.Hit(pos, next); ok && t < best {
					best, normal, hit = t, nn, true
					restitution = orDefault(p.Bounce, f.Bounce)
				}
			}

			if hit {
				pos = pos.Add(move.Scale(best)).Add(normal.Scale(skin))
				// the part of the speed into the surface bounces back by the
				// restitution (at most MaxBounce); the part along it keeps
				// almost all of itself — a ball running along a rail is not
				// braked by it.
				vn := normal.Scale(vel.Dot(normal))
				vt := vel.Sub(vn)
				if restitution > MaxBounce {
					restitution = MaxBounce // never more speed out than in
				}
				vel = vt.Scale(Along).Sub(vn.Scale(restitution))
				// two bumpers facing each other must not add speed forever
				if l := vel.Len(); l > SpeedCap {
					vel = vel.Scale(SpeedCap / l)
				}
				out.Bounces++
				out.mark('b')
			} else {
				pos = next
			}
			if air > 0 {
				air -= move.Len()
			} else if up != nil && !hit && climbing(slopes, pos, vel, i+f.Tick) == nil && up.overTheTop(from, pos, rampFrom) {
				// it went over the top of the hill fast: it takes off, and
				// flies further the faster it went up and the steeper the
				// hill (a bounce back down the slope is not a take-off)
				if vu := vel.Dot(up.u); vu > JumpSpeed {
					air = (vu - JumpSpeed) * up.g * Lift
				}
			}
		}
		if surface > 1 {
			out.mark('i')
		}
		out.add(pos, air > 0)
		out.Cause[len(out.Cause)-1] = out.why

		// Rolling resistance: a share of the speed goes each substep, and a
		// fixed amount too, so a ball comes to a real stop instead of creeping
		// on until the substeps run out. Sand brakes harder, ice less.
		keep := (f.Friction + keepBonus) * surface
		// friction never pushes: ice lets the ball run on, it does not speed it up
		if keep > maxKeep {
			keep = maxKeep
		}
		if air > 0 {
			continue // no rolling resistance off the ground
		}
		l := vel.Len()
		sp := l*keep - Drag/surface
		if sp <= stopSpeed {
			// on a slope steeper than the drag a ball does not stay put: it
			// stops, then rolls back down (the slope pushes it next substep)
			if pull(slopes, pos, i+f.Tick) > Drag {
				vel = Vec2{}
				continue
			}
			break
		}
		vel = vel.Scale(sp / l)
	}

	// a ball at rest is on the ground, whatever was left of its flight
	out.Air[len(out.Air)-1] = false
	// A ball that came to rest in the water or in a tunnel's mouth is resolved
	// now, not on the player's next stroke.
	var still Vec2
	surface := 1.0
	if f.zonesAt(&pos, &still, &surface, 1, substeps+f.Tick, &out) {
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

// zonesAt applies the zones the ball is in, and reports whether a hazard
// ended the shot.
func (f *Field) zonesAt(pos, vel *Vec2, surface *float64, n, tick int, out *Shot) bool {
	for j := range f.Zones {
		z := &f.Zones[j]
		if !there(tick, z.Every, z.On, z.Phase) || !z.contains(*pos) {
			continue
		}
		switch z.Kind {
		case Surface:
			*surface = z.Scale // the surface under this move (the last listed wins)
		case Slope:
			if z.Air {
				out.mark('w')
			} else {
				out.mark('s')
			}
			wind := z.Air && z.Capped
			v2 := 0.0
			if wind {
				v2 = vel.Dot(*vel)
			}
			*vel = vel.Add(z.Vec.Scale(1 / float64(n)))
			// the weather's wind bends a rolling ball and brakes it, but never
			// speeds it up: stronger than Drag, it kept a ball drifting for
			// ever on the flat, and sped it up on ice. (Squared first: the
			// roots are only taken when it did speed up.)
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

// hill is a ground slope, its steepness |Vec|, and its crest: u is the unit
// uphill (against Vec); the crest is the zone's edge u points at, on the
// axis u mostly runs along (every hill on the holes is a rectangle square to
// the board, so that edge is the whole top).
type hill struct {
	z      *Zone
	g      float64
	u      Vec2
	onX    bool    // the crest is an edge across X (u mostly along X)
	crest  float64 // where it is, on that axis
	foot   float64 // the opposite edge, where a climb starts
	depth  float64 // foot to crest
	upward float64 // +1 when uphill runs toward +X (or +Y), -1 the other way
}

func newHill(z *Zone) hill {
	h := hill{z: z, g: z.Vec.Len()}
	if h.g == 0 {
		return h // decor: never climbed
	}
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
// Drag launches nothing: it cannot even start a ball rolling.
func (h *hill) overTheTop(a, b Vec2, rampFrom float64) bool {
	if h.g <= Drag || h.z.contains(b) {
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

// groundSlopes is the field's hills, in field order: the only zones climbing
// and pull look at, found (and measured) once per shot. A timed one counts
// only in the substeps it is there.
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

// climbing is the hill the ball is moving up, or nil when it is not
// climbing one.
func climbing(slopes []hill, pos, vel Vec2, tick int) *hill {
	for j := range slopes {
		s := &slopes[j]
		if there(tick, s.z.Every, s.z.On, s.z.Phase) && s.z.contains(pos) && vel.Dot(s.z.Vec) < 0 {
			return s
		}
	}
	return nil
}

// pull is how hard the slope under the ball pulls it at tick, 0 off a slope.
// A tick below 0 asks for the untimed hills only: rolling on past the
// stroke's substeps is for a ball left on a hill, not on a rocking plank
// (it would rock there for all MaxRollOn substeps).
func pull(slopes []hill, pos Vec2, tick int) float64 {
	for _, s := range slopes {
		if (tick < 0 && s.z.Every > 0) || (tick >= 0 && !there(tick, s.z.Every, s.z.On, s.z.Phase)) {
			continue
		}
		if s.z.contains(pos) {
			return s.g
		}
	}
	return 0
}
