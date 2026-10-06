package golf

// The realm's side of the wasm parity test (scripts/wasmparity.ts copies it
// into a scratch copy of golf, with wasmHoles, and compares): every hole of
// wasmHoles published as the course publishes it, then played through
// SimulateFrom and simulateRound (SimulateRoundAt's replay) in 19 weathers:
// its plans stroke by stroke (every prefix replayed from the tee, and each
// stroke from the exact ball the one before left), and wasmRandom random
// shots from the tee, from the plans' balls and from anywhere on the board,
// at any stroke number (pulses) and tick (timed pieces), some refused. Each
// answer's sha256 is printed with its call, for the wasm to answer the same.

import (
	"crypto/sha256"
	"encoding/hex"
	"strconv"
	"strings"
	"testing"

	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/course/author"
	"gno.land/p/gnogolf/physics"
	"gno.land/p/gnogolf/physics/build"
)

const wasmRandom = 240

func TestWasmParity(cur realm, t *testing.T) {
	setOwner(deployer)
	for _, d := range wasmHoles {
		testing.SetRealm(testing.NewUserRealm(deployer))
		id := Publish(cross(cur), d[0], d[1], "")
		println("WP\tH\t" + d[0] + "\t" + id)
		e := mustHole(id)
		h := e.hole()
		periods := weathers(e, h)
		var balls [][2]float64
		for _, plan := range strings.Split(d[2], "|") {
			if plan == "" {
				continue
			}
			shots := strings.Split(plan, ";")
			for _, p := range periods {
				start := h.Start()
				x, y := start.X, start.Y
				for i, s := range shots {
					wpRound("R", id, strings.Join(shots[:i+1], ";"), p)
					out := wpFrom("F", id, x, y, s, i, p)
					var ok bool
					if x, y, ok = restOf(out); !ok {
						break
					}
					balls = append(balls, [2]float64{x, y})
				}
			}
		}
		r := &lcg{s: uint64(len(d[1]))}
		for k := 0; k < wasmRandom; k++ {
			p := periods[k%len(periods)]
			start := h.Start()
			x, y := start.X, start.Y
			switch k % 3 {
			case 1:
				if len(balls) > 0 {
					b := balls[r.next()%uint64(len(balls))]
					x, y = b[0], b[1]
				}
			case 2:
				x, y = r.unit()*float64(h.W), r.unit()*float64(h.H)
			}
			wpFrom("f", id, x, y, r.shot(), int(r.next()%60), p)
			if k%6 == 0 {
				n := 1 + int(r.next()%4)
				list := make([]string, n)
				for i := range list {
					list[i] = r.shot()
				}
				wpRound("r", id, strings.Join(list, ";"), p)
			}
		}
	}
}

// weathers is 19 periods up to the test's clock, five of each kind of
// weather the hole's climate has at most, so every kind is played.
func weathers(e *entry, h *course.Simple) []int64 {
	seen := map[string]int{}
	var ps []int64
	for p := Period(); len(ps) < 19; p-- {
		k := weatherOf(e, h, p).Kind
		if seen[k] < 5 {
			seen[k]++
			ps = append(ps, p)
		}
	}
	return ps
}

// wpFrom and wpRound print a call and its answer's sum, tagged: F and R a
// plan's, f and r a random one's.
func wpFrom(tag, id string, x, y float64, shot string, stroke int, p int64) string {
	out := wpCall(func() string { return SimulateFrom(id, x, y, shot, stroke, p) })
	println("WP\t" + tag + "\t" + id + "\t" + strconv.FormatFloat(x, 'g', -1, 64) + "\t" + strconv.FormatFloat(y, 'g', -1, 64) +
		"\t" + shot + "\t" + strconv.Itoa(stroke) + "\t" + strconv.FormatInt(p, 10) + "\t" + wpSum(out))
	return out
}

func wpRound(tag, id, shots string, p int64) {
	out := wpCall(func() string { return simulateRound(id, nil, 0, shots, p) })
	println("WP\t" + tag + "\t" + id + "\t" + shots + "\t" + strconv.FormatInt(p, 10) + "\t" + wpSum(out))
}

// wpCall is an answer, or "panic: " and the refusal, as the wasm says it.
func wpCall(f func() string) (out string) {
	defer func() {
		if r := recover(); r != nil {
			s, _ := r.(string)
			if e, ok := r.(error); ok {
				s = e.Error()
			}
			out = "panic: " + s
		}
	}()
	return f()
}

func wpSum(s string) string {
	sum := sha256.Sum256([]byte(s))
	return hex.EncodeToString(sum[:])
}

// restOf is an answer's exact "rest".
func restOf(out string) (float64, float64, bool) {
	i := strings.LastIndex(out, `"rest":[`)
	if i < 0 {
		return 0, 0, false
	}
	xy := strings.Split(strings.TrimSuffix(out[i+8:], "]}"), ",")
	x, err1 := strconv.ParseFloat(xy[0], 64)
	y, err2 := strconv.ParseFloat(xy[1], 64)
	return x, y, err1 == nil && err2 == nil
}

type lcg struct{ s uint64 }

func (r *lcg) next() uint64 {
	r.s = r.s*6364136223846793005 + 1442695040888963407
	return r.s >> 17
}

func (r *lcg) unit() float64 { return float64(r.next()%1000001) / 1000000 }

// shot is a shot as a client sends it ("angle,power" in steps of 0.01, or
// with a tick), now and then one the realm refuses or clamps.
func (r *lcg) shot() string {
	a := strconv.FormatFloat(r.unit()*720-360, 'f', 2, 64)
	pw := strconv.FormatFloat(0.01+r.unit()*9.99, 'f', 2, 64)
	switch r.next() % 40 {
	case 0:
		pw = "10.5" // too strong
	case 1:
		pw = "0.00004" // nothing once recorded
	case 2:
		return a + "," + pw + ",-3"
	case 3:
		return a + "," + pw + ",99999"
	case 4:
		return a + "5," + pw // finer than the game's steps
	}
	if r.next()%3 == 0 {
		return a + "," + pw
	}
	return a + "," + pw + "," + strconv.Itoa(int(r.next()%1024))
}

// TestBuilderParity is builder.wasm's side: PublishMine itself, as anyone
// calls it, on every hole of wasmHoles and wasmMutations changes of its
// data, with slugs and notes it refuses, and on holes past GG1's bounds or
// at the work limits (wpLimits, in every shard); and author.Fit then Encode
// on each hole at two margins. Each answer is printed whole: the refusal, or
// "ok" and what builder.wasm's check says of the hole.
func TestBuilderParity(cur realm, t *testing.T) {
	setOwner(deployer)
	testing.SetRealm(testing.NewUserRealm(deployer))
	SetPublishing(cross(cur), true)
	for i, d := range wasmHoles {
		r := &lcg{s: uint64(len(d[1])) + 7}
		slug := "c" + strconv.Itoa(i)
		cases := [][3]string{
			{slug + "a", "same", ""}, {slug + "b", "upper", ""}, {slug + "c", "odd", ""}, {slug + "d", "extra", ""},
			{slug + "e", "cut:" + strconv.Itoa(int(r.next()%uint64(len(d[1])/2))), ""},
			{"Bad_" + slug, "same", ""}, {strings.Repeat("x", 33), "same", ""},
			{slug + "f", "same", "my best www.example.com"}, {slug + "g", "same", "a quiet one"},
		}
		for k := 0; k < wasmMutations; k++ {
			at := int(r.next() % uint64(len(d[1])/2))
			b := hex.EncodeToString([]byte{byte(r.next())})
			cases = append(cases, [3]string{slug + "m" + strconv.Itoa(k), "set:" + strconv.Itoa(at) + ":" + b, ""})
		}
		for _, c := range cases {
			wpCheck(cur, c[0], d[0], mutate(d[1], c[1]), c[1], c[2])
		}
		h, err := course.Decode(unhex(d[1]))
		if err != nil {
			panic(err)
		}
		tee := h.Tee
		author.Fit(h, 1.5) // the course's margin: every course hole is in its frame
		println("WP\tT\t" + d[0] + "\t1.5\t" + strconv.FormatFloat(h.Tee.X-tee.X, 'g', -1, 64) + "\t" + strconv.FormatFloat(h.Tee.Y-tee.Y, 'g', -1, 64) +
			"\t" + strconv.Itoa(h.W) + "\t" + strconv.Itoa(h.H) + "\t" + wpSum(hex.EncodeToString([]byte(course.Encode(h)))))
		// bars as the builder places them (on the grid, at the lattice's angles), build.Bar's corners
		for k := 0; k < wasmBars; k++ {
			a := physics.V(float64(r.next()%384)/4, float64(r.next()%384)/4)
			dirs := [][2]float64{{1, 0}, {0, 1}, {1, 1}, {1, -1}, {1, 2}, {2, 1}, {1, 3}, {3, 1}, {2, -1}, {1, -3}}
			dir, n := dirs[r.next()%uint64(len(dirs))], float64(1+r.next()%32)/4
			b := physics.V(a.X+dir[0]*n, a.Y+dir[1]*n)
			t := float64(1+r.next()%6) / 4
			line := wpNum(a.X) + " " + wpNum(a.Y) + " " + wpNum(b.X) + " " + wpNum(b.Y) + " " + wpNum(t)
			corners := ""
			for i, w := range build.Bar(a, b, t, 0, "") {
				if i > 0 {
					corners += ","
				}
				corners += "[" + wpNum(w.Seg.A.X) + "," + wpNum(w.Seg.A.Y) + "]"
			}
			println("WP\tB\t" + line + "\t[" + corners + "]")
		}
	}
	// holes past a limit by one, or at the work limits (their data printed
	// whole): too stormy, as heavy as golf takes, a shot no transaction
	// could replay, and every bounce a bumper's
	xs := []string{wpUnusedSkin()}
	for _, h := range wpLimits() {
		xs = append(xs, hexOf(h))
	}
	for i, x := range xs {
		wpCheck(cur, "w"+strconv.Itoa(i), "="+x, x, "same", "")
	}
}

// wpUnusedSkin is cupHole's data with a skin in its table that no piece
// uses: it decodes, its lengths are its walls' own, and Encode would not
// write it. Its first wall is skinned "x" to put "x" in the table, then
// that wall's style run is pointed at the plain skin.
func wpUnusedSkin() string {
	h := cupHole("garden", 1, "Unused")
	h.Course.Walls[0].Skin = "x"
	b := []byte(course.Encode(h))
	at := strings.Index(string(b), "\x02\x00\x01x\x00") // two skins: "x", ""
	// past the table: the walls' count, the run's count, its bounce and mark, then its skin
	b[at+5+2+2+8+4] = 1
	return hex.EncodeToString(b)
}

// wpLimits is cupHole past each of GG1's bounds by a step, and holes at the
// work limits; Encode writes what it is given, Decode is the one to refuse.
func wpLimits() []*course.Simple {
	past := []func(h *course.Simple){
		func(h *course.Simple) { h.Course.Zones = []physics.Zone{{Kind: physics.Slope, Max: physics.V(8, 8), Vec: physics.V(0.951, 0)}} },
		func(h *course.Simple) { h.Course.Zones = []physics.Zone{{Kind: physics.Slope, Max: physics.V(8, 8), Vec: physics.V(0.95, 0)}} },
		func(h *course.Simple) { h.Course.Walls[0].Every, h.Course.Walls[0].On = 2, 3 },
		func(h *course.Simple) { h.Course.Walls[0].Every, h.Course.Walls[0].On = course.MaxTiming+1, 1 },
		func(h *course.Simple) { h.Course.Walls[0].Bounce = 1.51 },
		func(h *course.Simple) { h.Course.Posts = []physics.Post{{Circle: physics.Circle{C: physics.V(9, 8), R: 8.01}}} },
		func(h *course.Simple) { h.CupRadius = 2.01 },
		func(h *course.Simple) { h.Strokes = 20 },
		func(h *course.Simple) { h.Substeps = course.MaxSubsteps + 1 },
		func(h *course.Simple) { h.World = "Garden" },
		func(h *course.Simple) { h.Pin = physics.V(40, 8) },
		func(h *course.Simple) { h.Title = "see t.me/x" },
		func(h *course.Simple) { h.Title = "​" }, // cleaned to nothing: "Untitled hole"
		func(h *course.Simple) { // a zero-length wall
			h.Course.Walls = append(h.Course.Walls, physics.Wall{Seg: physics.Segment{A: physics.V(9, 9), B: physics.V(9, 9)}})
		},
		func(h *course.Simple) {
			for len(h.Course.Walls) <= course.MaxWalls {
				h.Course.Walls = append(h.Course.Walls, physics.Wall{Seg: physics.Segment{A: physics.V(9, 2), B: physics.V(9, 3)}})
			}
		},
		func(h *course.Simple) {
			for len(h.Course.Posts) <= course.MaxPosts {
				h.Course.Posts = append(h.Course.Posts, physics.Post{Circle: physics.Circle{C: physics.V(20, 8), R: 0.3}})
			}
		},
		func(h *course.Simple) { // 160 bumper walls
			for len(h.Course.Walls) < course.MaxWalls {
				h.Course.Walls = append(h.Course.Walls, physics.Wall{Seg: physics.Segment{A: physics.V(20, 2), B: physics.V(20, 3)}, Bounce: 1.5, Skin: "bumper"})
			}
		},
	}
	hs := []*course.Simple{limitsHole(), heavyHole(), wpPulsed(39), wpPulsed(16)}
	for _, f := range past {
		h := cupHole("garden", 1, "Past")
		f(h)
		hs = append(hs, h)
	}
	return hs
}

// wasmMutations is how many of a hole's bytes each check changes, one each;
// wasmBars how many bars each hole's run places.
const (
	wasmMutations = 8
	wasmBars      = 8
)

func wpNum(x float64) string { return strconv.FormatFloat(x, 'g', -1, 64) }

// wpCheck prints PublishMine's answer on (slug, data, note) as the page
// reads builder.wasm's: the refusal, or "ok" and the hole's cost (wpCost).
// hole is the data's slot, or "=" and the data itself.
func wpCheck(cur realm, slug, hole, data, mutation, note string) {
	testing.SetRealm(testing.NewUserRealm(player))
	out := "ok"
	if r := revive(func() { PublishMine(cross(cur), slug, data, note) }); r != nil {
		s, _ := r.(string)
		if e, ok := r.(error); ok {
			s = e.Error()
		}
		out = "panic: " + s
	} else {
		out += "\t" + wpCost(unhex(data), note)
	}
	println("WP\tC\t" + slug + "\t" + hole + "\t" + mutation + "\t" + note + "\t" + out)
}

// wpCost is what builder.wasm's check answers for a hole PublishMine took,
// the realm's way: the name and note it kept, the data's bytes, the
// heaviest shot's bound, worstGas, and the room work.next leaves a first
// shot in the dearest weather; tab separated.
func wpCost(data, note string) string {
	h, _ := course.Decode(data)
	w := newWork(h, nil)
	bound := w.bound
	w.fixed = decodeGas(len(data)) + storeGas + int64(course.WorstForecastWork(h))*workPerUnit
	w.next(h)
	return strings.Join([]string{
		cleanName(h.Title), cleanText(note, maxNote), strconv.Itoa(len(data)), strconv.FormatInt(bound, 10),
		strconv.FormatInt(worstGas(h, len(data)), 10), strconv.Itoa(w.cap),
	}, "\t")
}

// mutate is a hole's data (hex) as a check case changes it: "same",
// "upper" (in capitals), "odd" (half a byte more), "extra" (a byte more),
// "cut:n" (its first n bytes), "set:i:bb" (byte i made bb).
func mutate(x, m string) string {
	f := strings.Split(m, ":")
	switch f[0] {
	case "upper":
		return strings.ToUpper(x)
	case "odd":
		return x + "0"
	case "extra":
		return x + "00"
	case "cut":
		n, _ := strconv.Atoi(f[1])
		return x[:2*n]
	case "set":
		i, _ := strconv.Atoi(f[1])
		return x[:2*i] + f[2] + x[2*i+2:]
	}
	return x
}

func unhex(x string) string {
	b, err := hex.DecodeString(x)
	if err != nil {
		panic(err)
	}
	return string(b)
}

// wpPulsed is a hole whose pulse holds bars bars and the format's posts,
// set up afresh for each shot (as publish_test's pulsed): at 39 bars, its
// heaviest shot is more than a transaction can replay.
func wpPulsed(bars int) *course.Simple {
	h := cupHole("garden", 1, "Pulsed")
	h.W, h.H, h.Pin = 96, 96, physics.V(90, 90)
	h.Course.Walls = build.Box(physics.V(0, 0), physics.V(96, 96))
	p := course.Pulse{Every: 1, On: 1}
	for i := 0; i < bars; i++ {
		y := 10 + float64(i)*2
		p.Walls = append(p.Walls, build.Bar(physics.V(30, y), physics.V(80, y), 0.5, 0, "")...)
	}
	for i := 0; i < course.MaxPosts; i++ {
		p.Posts = append(p.Posts, physics.Post{Circle: physics.Circle{C: physics.V(85, 3+float64(i)*2.8), R: 0.6}})
	}
	h.Pulses = []course.Pulse{p}
	return h
}
