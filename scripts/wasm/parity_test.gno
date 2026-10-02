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

// shot is a shot as a client sends it ("angle,power" or with a tick), now
// and then one the realm refuses or clamps.
func (r *lcg) shot() string {
	a := strconv.FormatFloat(r.unit()*720-360, 'f', 4, 64)
	pw := strconv.FormatFloat(0.0001+r.unit()*9.9999, 'f', 4, 64)
	switch r.next() % 40 {
	case 0:
		pw = "10.5" // too strong
	case 1:
		pw = "0.00004" // nothing once recorded
	case 2:
		return a + "," + pw + ",-3"
	case 3:
		return a + "," + pw + ",99999"
	}
	if r.next()%3 == 0 {
		return a + "," + pw
	}
	return a + "," + pw + "," + strconv.Itoa(int(r.next()%1024))
}
