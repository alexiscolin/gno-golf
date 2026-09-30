// Package mines1 is the pithead. A narrow gantry winds out over the pit, with
// no rail; off it a narrow man-way curves down to the gallery, or gangways lead
// on to the headframe, where the cage stands a quarter of the time: arrive
// then and it drops you to the pit bottom, past the gallery's first half;
// arrive while it is away and you fall down the shaft. Rockfalls and a cart
// crossing choke the gallery, and a narrow stope climbs to the cup's ledge.
package mines1

import (
	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/course/author"
	"gno.land/p/gnogolf/physics"
	"gno.land/p/gnogolf/physics/build"
)

var v = physics.V

// tee is where every hazard sends a ball back to (the convention: unused).
var tee = v(4, 4)

// laneW and laneE are the ground, west and east of x = 36, each the Outside
// polygon of its own void zone: the tee's round deck and the narrow gantry
// out from it, the man-way, the gangways and their
// landing, the gallery with the pit bottom over it, the stope and the ledge.
// The rest of the board is the dark of the pit.
var laneW = []physics.Vec2{
	v(5.91, 0.62), v(5, 0.5), v(4.09, 0.62), v(3.25, 0.97), v(2.53, 1.53), v(1.97, 2.25), v(1.62, 3.09),
	v(1.5, 4), v(1.62, 4.91), v(1.97, 5.75), v(2.53, 6.47), v(3.25, 7.03), v(4.09, 7.38), v(5, 7.5),
	v(5.91, 7.38), v(6.75, 7.03), v(7.47, 6.47), v(8.24, 5.25), v(17.93, 4.8), v(19.9, 5.1), v(18.92, 11.78),
	v(19.9, 17.65), v(20, 21.35), v(17.96, 21.58), v(4.98, 20.55), v(4.23, 20.78), v(3.57, 21.2),
	v(3.04, 21.78), v(2.68, 22.47), v(2.51, 23.24), v(2.55, 24.02), v(2.78, 24.77), v(3.2, 25.43),
	v(3.78, 25.96), v(4.47, 26.32), v(5.24, 26.49), v(17.74, 27.59), v(30.05, 26.21), v(36, 26.71),
	v(36, 20.69), v(29.65, 20.22), v(22.99, 21), v(22.88, 17.23), v(21.92, 11.97), v(22.86, 5.55),
	v(36, 7.71), v(36, 4.78), v(18.21, 2.02), v(8.12, 2.45), v(7.47, 1.53), v(6.75, 0.97),
}

var laneE = []physics.Vec2{
	v(41.75, 27.19), v(54.06, 26.2), v(63.88, 26.6), v(64.82, 26.48), v(69.74, 24.97), v(70.82, 23.86),
	v(71.2, 22.35), v(70.77, 20.86), v(69.78, 19.87), v(69.95, 16.14), v(69.1, 12.94), v(70.34, 11.7),
	v(70.68, 10.88), v(70.8, 10), v(70.34, 8.3), v(69.1, 7.06), v(67.4, 6.6), v(65.7, 7.06), v(64.46, 8.3),
	v(64, 10), v(64.12, 10.88), v(65, 12.4), v(66.27, 13.18), v(67.19, 16.64), v(66.98, 19.63),
	v(63.64, 20.58), v(54.12, 20.2), v(45.8, 20.87), v(45.8, 19.27), v(46.48, 18.78), v(47.2, 17.52),
	v(47.3, 16.8), v(46.92, 15.4), v(46.48, 14.82), v(45.22, 14.1), v(44.5, 14), v(43.1, 14.38),
	v(42.08, 15.4), v(41.7, 16.8), v(42.08, 18.2), v(43.2, 19.27), v(43.2, 21.09), v(42, 21.19),
	v(36, 20.69), v(36, 26.71), v(41.75, 27.19), v(42.43, 10.73), v(42.75, 11.8), v(43.7, 12.75),
	v(45, 13.1), v(45.67, 13.01), v(46.84, 12.34), v(47.25, 11.8), v(47.57, 10.71), v(63.06, 3.27),
	v(61.94, 0.93), v(46.45, 8.36), v(45, 7.9), v(43.53, 8.37), v(36, 4.78), v(36, 7.71), v(42.43, 10.73),
	v(41.75, 27.19),
}

func ore(c physics.Vec2, r float64) physics.Zone {
	return physics.Zone{Kind: physics.Surface, Min: c.Sub(v(r, r)), Max: c.Add(v(r, r)), Scale: 0.45, Round: true, Mark: ',', Skin: "ore"}
}

func prop(c physics.Vec2) physics.Post {
	return physics.Post{Circle: physics.Circle{C: c, R: 0.6}, Bounce: 0.6, Mark: 'o', Skin: "prop"}
}

func rock(ws []physics.Wall) []physics.Wall {
	return build.Soft(build.Skinned(ws, "rockface"), 0.5)
}

// fence is the rail guard along one side of the cart track at x, but for
// the crossing, 2.8 wide against the gallery's inner edge.
func fence(x float64) []physics.Wall {
	return build.Skinned(build.Polyline(v(x, 23.6), v(x, 27.2)), "railguard")
}

var me = author.Fit(&course.Simple{
	W: 73, H: 28,
	World:     "mines",
	Order:     1,
	Title:     "The Pithead",
	Strokes:   9, // par
	Tee:       tee,
	Pin:       v(67.4, 8.1),
	Substeps:  30,
	CupRadius: 1.2,
	Course: &physics.Field{
		Walls: build.Walls(
			build.Box(v(0, -1.5), v(73, 29)),
			// the shaft's collar, an iron grate behind the open shaft
			build.Skinned(build.Polyline(v(65.6, 1), v(65.6, 6)), "grate"),
			// two rockfalls choke the gallery from its inner edge, their gaps at
			// the outer one, and between them the cart track is fenced but for a
			// crossing at the inner edge: no two openings in line
			rock(build.Bar(v(33, 20), v(33, 21.8), 3, '#', "")),
			fence(38), fence(42),
			build.Timed(build.Bar(v(40, 21.6), v(40, 26.4), 3, '#', "cart"), 24, 8, 0),
			rock(build.Bar(v(47.5, 20), v(47.5, 21.8), 3, '#', "")),
		),
		Posts: []physics.Post{
			prop(v(10, 25.8)), prop(v(60, 21.6)),
			// the winch in the middle of the ledge, in the line of the stope, and
			// the headframe's two legs either side of the cup: the last putt
			// goes round the one and between the others
			{Circle: physics.Circle{C: v(67.4, 11), R: 0.8}, Bounce: 0.6, Mark: 'o', Skin: "prop"},
			prop(v(65.5, 9.3)), prop(v(69.3, 9.3)),
		},
		Zones: []physics.Zone{
			// the pit round the deck, the gangways, the gallery and the ledge
			{Kind: physics.Hazard, Min: v(-0.5, -2), Max: v(36, 29.5), Vec: tee, Poly: laneW, Outside: true, Skin: "void"},
			{Kind: physics.Hazard, Min: v(36, -2), Max: v(73.5, 29.5), Vec: tee, Poly: laneE, Outside: true, Skin: "void"},
			{Kind: physics.Hazard, Min: v(61.2, 1.4), Max: v(65.2, 5.4), Vec: tee, Round: true, Skin: "shaft"},
			// the cage, at the top of the shaft a quarter of the time: it
			// drops you to the pit bottom, past the cart track
			{Kind: physics.Tunnel, Min: v(58, 2), Max: v(61, 5), Vec: v(44.5, 16.5), Round: true, Skin: "cage", Every: 24, On: 6},
			// the man-way, curving down through the rock, rubble at its foot
			{Kind: physics.Slope, Min: v(18.5, 6.5), Max: v(23.5, 21), Vec: v(0, 0.1), Mark: 'v', Skin: "incline"},
			{Kind: physics.Surface, Min: v(18, 21), Max: v(25, 27), Scale: 0.6, Round: true, Skin: "rubble"},
			ore(v(44.5, 16.8), 2.3), ore(v(12, 24.3), 2.4),
		},
		Friction: 0.87,
		Radius:   0.5,
		Bounce:   0.85,
	},
}, 1.5)
