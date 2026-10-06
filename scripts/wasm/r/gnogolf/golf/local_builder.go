//go:build builder

package golf

// The hole builder's calls (builder.wasm), the other hand-written part of
// this package: PublishMine's checks of a hole before it is published, and
// a draft made publishable. golf_builder.go is golf's own code, extracted
// with these roots too (scripts/wasm.sh).

import (
	"strconv"
	"strings"

	"gno.land/gnovm/math"
	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/course/author"
	"gno.land/p/gnogolf/physics"
	"gno.land/p/gnogolf/physics/build"
)

// Check is PublishMine's checks of its arguments, in the order it makes them
// before it writes anything: the slug, the data (checkData), then the hole's
// name and the note, by the realm's own functions. Publishing being open, and
// data identical to the alias's current version, are the chain's to say.
// scripts/wasmparity.ts holds its refusals to PublishMine's, sentence for
// sentence.
//
// Its answer: the name and note as the chain keeps them; the data's bytes;
// its heaviest shot (newWork's bound) against maxShotGas; a commit's first
// shot in its dearest weather (worstGas) against workBudget; and room, the
// work that first shot may do there (work.next's cap, at most
// physics.MaxWork), against minShotWork.
func Check(slug, hexData, note string) string {
	if !validSlug(slug) {
		panic("golf: a slug is 1 to 32 of a-z, 0-9 and -")
	}
	h, data := checkData(hexData)
	name, kept := cleanName(h.Title), cleanText(note, maxNote)
	if linkish(name) || linkish(kept) {
		panic("golf: a community hole's name and note carry no web address")
	}
	w := newWork(h, nil)
	bound := w.bound
	w.fixed = decodeGas(len(data)) + storeGas + int64(course.WorstForecastWork(h))*workPerUnit
	w.next(h)
	return `{"name":` + jstr(name) + `,"note":` + jstr(kept) +
		`,"bytes":` + strconv.Itoa(len(data)) +
		`,"bound":` + strconv.FormatInt(bound, 10) + `,"maxShot":` + strconv.FormatInt(maxShotGas, 10) +
		`,"worst":` + strconv.FormatInt(worstGas(h, len(data)), 10) + `,"budget":` + strconv.FormatInt(workBudget, 10) +
		`,"room":` + strconv.Itoa(w.cap) + `,"minShot":` + strconv.Itoa(minShotWork) + "}"
}

// checkData is the realm's decodeData less its sha256, which a check has no
// use for: crypto/sha256 and encoding/hex would double builder.wasm (TinyGo
// links their FIPS module and fmt). The rest is decodeData's, step for step;
// the hex is read as encoding/hex reads it, capitals too.
func checkData(hexData string) (*course.Simple, string) {
	if len(hexData) > 2*maxData {
		panic("golf: the data is too long")
	}
	data := unhex(lower(hexData))
	h, err := course.DecodeChecked(data)
	if err != nil {
		panic("golf: " + err.Error())
	}
	if course.Encode(h) != data {
		panic("golf: the data is not as course.Encode writes it")
	}
	if newWork(h, nil).bound > maxShotGas {
		panic(errShotTooHeavy)
	}
	if worstGas(h, len(data)) > workBudget {
		panic(errTooStormy)
	}
	return h, data
}

// lower is s with A to F in lower case, every other byte as it is.
func lower(s string) string {
	b := []byte(s)
	for i, c := range b {
		if c >= 'A' && c <= 'F' {
			b[i] = c + 'a' - 'A'
		}
	}
	return string(b)
}

// Fit is a draft made the hole that will be published, by the chain's own
// code: GG1 as Decode reads it (its stored wall lengths read but never
// trusted), each bar's four placeholder walls made build.Bar's (bars: one
// line a bar, "ax ay bx by thickness wallIndex pulse", pulse -1 for the
// field's walls; the first placeholder gives the bar's mark, skin, bounce
// and timing), sized by author.Fit (margin round its pieces), its walls
// prepared, and written by Encode. The draft is kept in its frame (its
// extent's low corner at the margin): a shift is refused. Its answer: the
// data in hex, the shift (0, 0), the board (w, h) and the extent's low
// corner (lo). Check says whether it can be published.
func Fit(hexData, bars string, margin float64) string {
	h, err := course.Decode(unhex(lower(hexData)))
	if err != nil {
		panic("golf: " + err.Error())
	}
	placeBars(h, bars)
	tee := h.Tee
	author.Fit(h, margin)
	if h.Tee != tee {
		panic("builder: the draft is not in its frame")
	}
	lo := extentLo(h)
	return `{"hex":"` + tohex(course.Encode(h)) + `","dx":0,"dy":0` +
		`,"w":` + strconv.Itoa(h.W) + `,"h":` + strconv.Itoa(h.H) + `,"lo":[` + exact(lo.X) + "," + exact(lo.Y) + "]}"
}

// placeBars replaces each bar's placeholders with build.Bar's four walls.
func placeBars(h *course.Simple, bars string) {
	for _, line := range strings.Split(bars, "\n") {
		if line == "" {
			continue
		}
		f := strings.Fields(line)
		if len(f) != 7 {
			panic("builder: a bar is ax ay bx by thickness wallIndex pulse")
		}
		a, b, t := physics.Vec2{X: num(f[0]), Y: num(f[1])}, physics.Vec2{X: num(f[2]), Y: num(f[3])}, num(f[4])
		i, p := whole(f[5]), whole(f[6])
		ws := h.Course.Walls
		if p >= 0 {
			if p >= len(h.Pulses) {
				panic("builder: a bar's pulse is not in the draft")
			}
			ws = h.Pulses[p].Walls
		}
		if i < 0 || i+4 > len(ws) {
			panic("builder: a bar's walls are not in the draft")
		}
		w := ws[i]
		got := build.Bar(a, b, t, w.Mark, w.Skin)
		if len(got) != 4 {
			panic("builder: a bar has no length")
		}
		for k := range got {
			got[k].Bounce, got[k].Every, got[k].On, got[k].Phase = w.Bounce, w.Every, w.On, w.Phase
		}
		copy(ws[i:i+4], got)
	}
}

// extentLo is the low corner of what author.Fit keeps inside the board:
// every wall end and post, fixed or pulsed, the tee and the pin.
func extentLo(h *course.Simple) physics.Vec2 {
	lo := physics.Vec2{X: math.Inf(1), Y: math.Inf(1)}
	grow := func(p physics.Vec2, r float64) { lo.X, lo.Y = math.Min(lo.X, p.X-r), math.Min(lo.Y, p.Y-r) }
	pieces := func(ws []physics.Wall, ps []physics.Post) {
		for _, w := range ws {
			grow(w.Seg.A, 0)
			grow(w.Seg.B, 0)
		}
		for _, p := range ps {
			grow(p.C, p.R)
		}
	}
	pieces(h.Course.Walls, h.Course.Posts)
	for _, p := range h.Pulses {
		pieces(p.Walls, p.Posts)
	}
	grow(h.Tee, 0)
	grow(h.Pin, 0)
	return lo
}

// Bar is build.Bar's four corners for "ax ay bx by thickness", as JSON
// ([] for a bar of no length): what the builder draws a bar as.
func Bar(line string) string {
	f := strings.Fields(line)
	if len(f) != 5 {
		panic("builder: a bar is ax ay bx by thickness")
	}
	ws := build.Bar(physics.Vec2{X: num(f[0]), Y: num(f[1])}, physics.Vec2{X: num(f[2]), Y: num(f[3])}, num(f[4]), 0, "")
	out := "["
	for k, w := range ws {
		if k > 0 {
			out += ","
		}
		out += "[" + exact(w.Seg.A.X) + "," + exact(w.Seg.A.Y) + "]"
	}
	return out + "]"
}

// Decode is a hole's data as JSON, course.Simple field for field
// (web/lib/builder/types.ts GHole): every float as Go prints it shortest,
// so read back exactly; skins as stored (jstr: quoted, never cleaned).
func Decode(hexData string) string {
	h, err := course.Decode(unhex(lower(hexData)))
	if err != nil {
		panic("golf: " + err.Error())
	}
	f := h.Field()
	var b strings.Builder
	b.WriteString(`{"w":` + strconv.Itoa(h.W) + `,"h":` + strconv.Itoa(h.H) + `,"title":` + jstr(h.Title) +
		`,"par":` + strconv.Itoa(h.Strokes) + `,"tee":` + vec(h.Tee) + `,"pin":` + vec(h.Pin) +
		`,"substeps":` + strconv.Itoa(h.Substeps) + `,"cupR":` + exact(h.CupRadius) + `,"world":` + jstr(h.World) +
		`,"order":` + exact(h.Order) + `,"shelter":` + exact(h.Shelter) + `,"friction":` + exact(f.Friction) +
		`,"bounce":` + exact(f.Bounce) + `,"ballR":` + exact(f.Radius))
	piecesJSON(&b, f.Walls, f.Posts, f.Zones)
	b.WriteString(`,"pulses":[`)
	for i, p := range h.Pulses {
		if i > 0 {
			b.WriteString(",")
		}
		b.WriteString(`{` + timing(p.Every, p.On, p.Phase)[1:])
		piecesJSON(&b, p.Walls, p.Posts, p.Zones)
		b.WriteString("}")
	}
	b.WriteString("]}")
	return b.String()
}

func vec(v physics.Vec2) string { return "[" + exact(v.X) + "," + exact(v.Y) + "]" }

// timing is `,"every":…,"on":…,"phase":…`.
func timing(every, on, phase int) string {
	return `,"every":` + strconv.Itoa(every) + `,"on":` + strconv.Itoa(on) + `,"phase":` + strconv.Itoa(phase)
}

// piecesJSON writes `,"walls":[…],"posts":[…],"zones":[…]`.
func piecesJSON(b *strings.Builder, ws []physics.Wall, ps []physics.Post, zs []physics.Zone) {
	b.WriteString(`,"walls":[`)
	for i, w := range ws {
		if i > 0 {
			b.WriteString(",")
		}
		b.WriteString(`{"a":` + vec(w.Seg.A) + `,"b":` + vec(w.Seg.B) + `,"bounce":` + exact(w.Bounce) +
			`,"mark":` + strconv.Itoa(int(w.Mark)) + `,"skin":` + jstr(w.Skin) + timing(w.Every, w.On, w.Phase) + "}")
	}
	b.WriteString(`],"posts":[`)
	for i, p := range ps {
		if i > 0 {
			b.WriteString(",")
		}
		b.WriteString(`{"c":` + vec(p.C) + `,"r":` + exact(p.R) + `,"bounce":` + exact(p.Bounce) +
			`,"mark":` + strconv.Itoa(int(p.Mark)) + `,"skin":` + jstr(p.Skin) + "}")
	}
	b.WriteString(`],"zones":[`)
	kinds := [...]string{"surface", "slope", "tunnel", "hazard", "loop"}
	for i, z := range zs {
		if i > 0 {
			b.WriteString(",")
		}
		b.WriteString(`{"kind":"` + kinds[z.Kind] + `","min":` + vec(z.Min) + `,"max":` + vec(z.Max) + `,"vec":` + vec(z.Vec) +
			`,"scale":` + exact(z.Scale) + `,"mark":` + strconv.Itoa(int(z.Mark)) + `,"skin":` + jstr(z.Skin) +
			`,"round":` + strconv.FormatBool(z.Round) + `,"poly":[`)
		for k, p := range z.Poly {
			if k > 0 {
				b.WriteString(",")
			}
			b.WriteString(vec(p))
		}
		b.WriteString(`],"outside":` + strconv.FormatBool(z.Outside) + `,"air":` + strconv.FormatBool(z.Air) +
			`,"capped":` + strconv.FormatBool(z.Capped) + timing(z.Every, z.On, z.Phase) + "}")
	}
	b.WriteString("]")
}

func num(s string) float64 {
	x, err := strconv.ParseFloat(s, 64)
	if err != nil || x-x != 0 {
		panic("builder: not a number: " + s)
	}
	return x
}

func whole(s string) int {
	n, err := strconv.Atoi(s)
	if err != nil {
		panic("builder: not a whole number: " + s)
	}
	return n
}

func exact(x float64) string { return strconv.FormatFloat(x, 'g', -1, 64) }

func tohex(s string) string {
	const digits = "0123456789abcdef"
	b := make([]byte, 2*len(s))
	for i := 0; i < len(s); i++ {
		b[2*i], b[2*i+1] = digits[s[i]>>4], digits[s[i]&15]
	}
	return string(b)
}
