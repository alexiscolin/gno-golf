//go:build builder

package golf

// The hole builder's calls (builder.wasm), the other hand-written part of
// this package: PublishMine's checks of a hole before it is published, and
// a draft made publishable. golf_builder.go is golf's own code, extracted
// with these roots too (scripts/wasm.sh).

import (
	"strconv"

	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/course/author"
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

// Fit is a draft hole made publishable, by the chain's own code: GG1 as
// Decode reads it (its stored wall lengths read but never trusted), moved
// and sized by author.Fit (margin round its pieces), its walls prepared, and
// written by Encode. Its answer: the data in hex, the shift Fit applied
// (dx, dy), and the board it sized (w, h). Check says whether it can be
// published.
func Fit(hexData string, margin float64) string {
	h, err := course.Decode(unhex(lower(hexData)))
	if err != nil {
		panic("golf: " + err.Error())
	}
	tee := h.Tee
	author.Fit(h, margin)
	d := h.Tee.Sub(tee)
	return `{"hex":"` + tohex(course.Encode(h)) + `","dx":` + exact(d.X) + `,"dy":` + exact(d.Y) +
		`,"w":` + strconv.Itoa(h.W) + `,"h":` + strconv.Itoa(h.H) + "}"
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
