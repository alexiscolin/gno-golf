package physics

import (
	"math"
	"strings"
)

// MaxRollOn caps the substeps a ball may roll on past its stroke's own while
// a slope keeps it moving.
const MaxRollOn = 120

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
// the top of a slope. Past it, it flies Lift times its speed over that times
// the slope's steepness: faster and off a steeper hill, further.
const (
	JumpSpeed = 1.5
	Lift      = 12
)

// Rest is where the ball stopped.
func (s Shot) Rest() Vec2 {
	if len(s.Path) == 0 {
		return Vec2{}
	}
	return s.Path[len(s.Path)-1]
}

// MaxMove is the longest single move inside a substep. Every zone is at least
// twice this wide on the holes as built, so none can be crossed unseen.
const MaxMove = 1.5

// Along is how much of its speed along a wall a ball keeps when it bounces.
const Along = 0.97

// MaxBounce is the most of its speed into a surface a ball ever gets back.
// Nothing on a mini-golf course adds energy: a rubber bumper is the liveliest
// thing there is, and it still loses some. A Bounce above this (the "lively"
// bumpers some holes ask for, up to 1.3) is played at this.
const MaxBounce = 0.92

// Push is the kick a bumper gave, per unit of its restitution above 1 (kept
// for the record; nothing adds energy any more, see MaxBounce):
// a 1.25 bumper pushes the ball out at about 0.9.
const Push = 3.5

// Drag is the fixed speed a rolling ball loses every substep, on grass.
const Drag = 0.12

// SpeedCap is the fastest a ball may go, in board units per substep. A full
// stroke starts at 6; bumpers that add energy may push it a little past that,
// never further.
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
	// radius — are computed once per shot rather than once per move: the same
	// collisions for a fraction of the gas. Walls are rebuilt between shots
	// by holes that move them, so per shot is as often as they can change.
	// Everything a move asks of a wall is here, so the loop never copies the
	// Wall itself: its timing, its bounce, the two lines' normals.
	type offset struct {
		plus, minus      Segment
		pn, mn           Vec2 // plus.Normal(), minus.Normal()
		a, n             Vec2
		length, bounce   float64
		every, on, phase int
	}
	offs := make([]offset, len(f.Walls))
	for j := range f.Walls {
		w := &f.Walls[j]
		n := w.Seg.Normal()
		o := &offs[j]
		o.plus = w.Seg.Toward(w.Seg.A.Add(n), f.Radius)
		o.minus = w.Seg.Toward(w.Seg.A.Sub(n), f.Radius)
		o.pn, o.mn = o.plus.Normal(), o.minus.Normal()
		o.a, o.n = w.Seg.A, n
		o.length = w.Seg.B.Sub(w.Seg.A).Len()
		o.bounce = orDefault(w.Bounce, f.Bounce)
		o.every, o.on, o.phase = w.Every, w.On, w.Phase
	}
	slopes := f.groundSlopes()

	// A ball does not stop on a slope steeper than the drag: when the stroke's
	// substeps run out while it is still on one, it rolls on (up to
	// MaxRollOn more) until it comes off it — a gnome left on a hill slides
	// down, it does not wait there for the next stroke.
	extra := 0
	for i := 0; i < substeps; i++ {
		if i == substeps-1 && extra < MaxRollOn && air <= 0 && pull(slopes, pos) > Drag {
			substeps++
			extra++
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
			climb := 0.0
			if air <= 0 {
				if f.zonesAt(&pos, &vel, &surface, n, i+f.Tick, &out) {
					return out
				}
				climb = climbing(slopes, pos, vel)
			}

			move := vel.Scale(1 / float64(n))
			next := pos.Add(move)
			best, normal, restitution, hit := 1.0, Vec2{}, f.Bounce, false
			for j := range offs {
				o := &offs[j]
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
						if u >= -f.Radius && u <= o.length+f.Radius {
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
							}
							continue
						}
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
				if t, nn, ok := c.Hit(pos, next); ok && t < best {
					best, normal, hit = t, nn, true
					restitution = orDefault(p.Bounce, f.Bounce)
				}
			}

			if hit {
				pos = pos.Add(move.Scale(best)).Add(normal.Scale(skin))
				// the part of the speed into the surface bounces back by the
				// restitution; the part along it keeps almost all of itself —
				// a ball running along a rail is not braked by it. A bumper
				// (restitution above 1) kicks the ball out with a fixed push
				// instead of multiplying its speed, so a graze adds little.
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
			} else if climb > 0 && !hit && climbing(slopes, pos, vel) == 0 {
				// it went over the top of the slope fast: it takes off (a
				// bounce back down the slope is not a take-off)
				if l := vel.Len(); l > JumpSpeed {
					air = (l - JumpSpeed) * climb * Lift
				}
			}
		}
		if surface > 1 {
			out.mark('i')
		}
		out.add(pos, air > 0)
		out.Cause[len(out.Cause)-1] = out.why

		// friction never pushes: ice lets the ball run on, it does not speed it up
		// Rolling resistance: a share of the speed goes each substep, and a
		// fixed amount too, so a ball comes to a real stop instead of creeping
		// on until the substeps run out. Sand brakes harder, ice less.
		keep := (f.Friction + 0.05) * surface
		if keep > 0.98 {
			keep = 0.98
		}
		if air > 0 {
			continue // no rolling resistance off the ground
		}
		l := vel.Len()
		sp := l*keep - Drag/surface
		if sp <= 0.02 {
			// on a slope steeper than the drag a ball does not stay put: it
			// stops, then rolls back down (the slope pushes it next substep)
			if pull(slopes, pos) > Drag {
				vel = Vec2{}
				continue
			}
			break
		}
		vel = vel.Scale(sp / l)
	}

	// A ball that came to rest in the water or in a tunnel's mouth is resolved
	// now, not on the player's next stroke.
	// a ball at rest is on the ground, whatever was left of its flight
	out.Air[len(out.Air)-1] = false
	var still Vec2
	surface := 1.0
	f.zonesAt(&pos, &still, &surface, 1, substeps+f.Tick, &out)
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
			*surface = z.Scale // the surface the ball last rolled on this substep
		case Slope:
			v0 := vel.Len()
			if isAir(z) {
				out.mark('w')
			} else {
				out.mark('s')
			}
			*vel = vel.Add(z.Vec.Scale(1 / float64(n)))
			// the weather's wind bends a rolling ball and brakes it, but never
			// speeds it up: stronger than Drag, it kept a ball drifting for
			// ever on the flat, and sped it up on ice
			if l := vel.Len(); z.Skin == "wind" && l > v0 {
				if v0 == 0 {
					*vel = Vec2{}
				} else {
					*vel = vel.Scale(v0 / l)
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
			if vel.Dot(in) <= sp*0.7071 {
				continue // not heading into the mouth: it rolls across
			}
			// slanted in (more than 25° off straight), it rides up the side of
			// the track and falls off it: put down in front of the mouth, still
			slanted := vel.Dot(in) <= sp*0.9063
			front := z.Min.Dot(axis) - 0.01
			if sign < 0 {
				front = z.Max.Dot(axis) + 0.01
			}
			side := pos.Sub(axis.Scale(pos.Dot(axis)))
			switch {
			case slanted || (sp > z.Scale*LoopOver && !closedLoop(z)):
				// off the top of the track: down in front of the mouth, still
				*pos = mid.Sub(axis.Scale(mid.Dot(axis))).Add(axis.Scale(front - sign*1.5))
				out.add(*pos, false)
				return true
			case sp >= z.Scale:
				*pos = z.Vec
				*vel = in.Scale(sp * LoopKeep)
			default:
				*pos = side.Add(axis.Scale(front))
				*vel = vel.Scale(-0.5)
			}
			out.add(*pos, false)
		}
	}
	return false
}

// closedLoop reports whether a loop is a closed tube (its skin says "tube"):
// a ball cannot fly off one, so any speed from Scale up goes round.
func closedLoop(z *Zone) bool { return strings.Contains(z.Skin, "tube") }

func orDefault(v, def float64) float64 {
	if v == 0 {
		return def
	}
	return v
}

// isAir reports whether a slope is moving air (weather wind, a cannon's gust,
// anything timed) rather than a hill: it pushes the ball but is no hill to
// take off from or roll back down, and it must not hide the one under it.
func isAir(z *Zone) bool { return z.Skin == "wind" || z.Skin == "gust" || z.Every > 0 }

// groundSlopes is the field's hills, in field order: the only zones climbing
// and pull look at, found once per shot.
func (f *Field) groundSlopes() []*Zone {
	var out []*Zone
	for j := range f.Zones {
		if z := &f.Zones[j]; z.Kind == Slope && !isAir(z) {
			out = append(out, z)
		}
	}
	return out
}

// climbing is how steep the slope the ball is moving up is, or 0 when it is
// not climbing one.
func climbing(slopes []*Zone, pos, vel Vec2) float64 {
	for _, z := range slopes {
		if z.contains(pos) && vel.Dot(z.Vec) < 0 {
			return z.Vec.Len()
		}
	}
	return 0
}

// pull is how hard the slope under the ball pulls it, 0 off a slope.
func pull(slopes []*Zone, pos Vec2) float64 {
	for _, z := range slopes {
		if z.contains(pos) {
			return z.Vec.Len()
		}
	}
	return 0
}
