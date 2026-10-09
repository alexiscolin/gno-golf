package gnomes

import (
	"encoding/base64"
	"errors"
	"sort"
	"strconv"
	"strings"

	"gno.land/p/nt/grc721/v0"
)

// TokenURI returns the image of a minted gnome as an on-chain SVG, a data
// URI a wallet puts in an <img>. It is drawn on every read, nothing is
// stored per token: the gnome the game draws from its traits, as its
// thumbnail shows him (three-quarters, on his tier's plinth), from the
// traced art of art.gno.
func TokenURI(tid string) (string, error) {
	if _, err := Token.OwnerOf(grc721.TokenID(tid)); err != nil {
		return "", errors.New(errNoGnome)
	}
	g, ok := tokenAt(parseID(tid))
	if !ok {
		return "", errors.New(errNoGnome)
	}
	return portrait(g), nil
}

// portrait is gnome g drawn, as a data URI: TokenURI's for a minted gnome,
// and its page's for any.
func portrait(g gnome) string {
	return svgDataPrefix + base64.StdEncoding.EncodeToString([]byte(drawGnome(g)))
}

const svgDataPrefix = "data:image/svg+xml;base64,"

// ---------------------------------------------------------------- the look
//
// A token's traits as format 1 writes them (docs/gnomes/design.md, "The
// trait encoding"): a byte a field in hex, the format first. Read as the
// client reads them (web/lib/gnomes/codec.ts): a code past its table, a
// colour past the palette, a field the string is too short for, all plain;
// bytes past the fields ignored; another format, or not hex, the plain gnome
// (the Classic). Nothing a row holds can make it panic.

// The fields' bytes.
const (
	fTier       = 2
	fKind       = 3
	fHat        = 6
	fHatColour  = 7
	fBrim       = 8
	fBeard      = 9
	fHair       = 10
	fBody       = 11
	fPattern    = 12
	fPatColour  = 13
	fWear       = 14 // four bytes, big-endian, bit k the vocab's k-th thing worn
	fAccent     = 18
	fPiece      = 19
	fPieceCol   = 20
	fMaterial   = 21
	fMatColour  = 22
	fTrail      = 23
	fTrailCol   = 24
	fHoling     = 25 // what the cup does: never in a still
	fHolingCol  = 26
	fProp       = 27
	fPropColour = 28
	lookBytes   = 29
)

// The materials svg.gno reads apart (vocab MATERIALS' codes).
const (
	matNeon = 3
	matLava = 10
)

// noColour is a colour field with nothing in it.
const noColour = 255

// ink is the game's ink (materials.ts C.ink): his line, his shadow.
const ink = "144134"

// look is a token's traits read: its codes, 0 (the plain) for what it lacks,
// noColour for a colour it lacks.
type look [lookBytes]byte

// plainLook is the Classic: every code plain, every colour unset.
func plainLook() look {
	var l look
	l[0] = 1
	for _, f := range []int{fHatColour, fBrim, fHair, fBody, fPatColour, fAccent, fPieceCol, fMatColour, fTrailCol, fHolingCol, fPropColour} {
		l[f] = noColour
	}
	return l
}

// readLook reads traits; an earned gnome's are his kind, and his look the
// game's own (artEarned).
func readLook(traits string) look {
	l := plainLook()
	b, ok := hexBytes(traits)
	if !ok || len(b) == 0 || b[0] != 1 {
		return l
	}
	if len(b) > fKind && b[fTier] == 0 && b[fKind] >= 1 {
		if e := artEarned(int(b[fKind]) - 1); e != "" && e != traits {
			return readLook(e)
		}
	}
	for i := 0; i < len(b) && i < lookBytes; i++ {
		l[i] = b[i]
	}
	// a code past its table is the plain one (the cone, the full beard…)
	for _, t := range []struct{ f, n int }{{fHat, artHatsN}, {fBeard, artBeardsN}, {fPattern, artPatternsN},
		{fPiece, artPiecesN}, {fMaterial, artMaterialsN}, {fTrail, artTrailsN}, {fProp, artPropsN}} {
		if int(l[t.f]) >= t.n {
			l[t.f] = 0
		}
	}
	return l
}

// hexBytes decodes lowercase hex, false for anything else.
func hexBytes(s string) ([]byte, bool) {
	if len(s)%2 != 0 || len(s) > 2*maxTraits {
		return nil, false
	}
	out := make([]byte, len(s)/2)
	for i := range out {
		hi, lo := strings.IndexByte(hexDigits, s[2*i]), strings.IndexByte(hexDigits, s[2*i+1])
		if hi < 0 || lo < 0 {
			return nil, false
		}
		out[i] = byte(hi<<4 | lo)
	}
	return out, true
}

// colourOf is palette colour c as six hex digits, "" for none (or past the palette).
func colourOf(c byte) string {
	if int(c)*6+6 > len(artPalette) {
		return ""
	}
	return artPalette[int(c)*6 : int(c)*6+6]
}

// isDark reports whether palette colour c is too dark for ink eyes.
func isDark(c byte) bool { return int(c) < len(artDark) && artDark[c] == '1' }

// ---------------------------------------------------------------- shapes
//
// A trait's art is shapes split by "|", each "<key><kind><colour>:<path>":
//
//   - key, two hex digits, its depth: shapes are painted by key, nearest
//     last; 00 the body's fill, 01 its light;
//   - kind: i a fill under the ink line, f a fill without one, g lit (its
//     colour as is, no light), m a mark of its texture, k a lit one (lava's
//     cracks); d and e the light's overlays (no colour), l a polished
//     thing's shine;
//   - colour: "#rrggbb" its own, or a slot (H hat, R brim, A hair, B body,
//     P pattern, C accent, Q piece, O prop, M material, T trail, E eyes)
//     and what it is when the slot is unset (6 hex digits, or H: the hat's);
//     "~" and digits after it, its opacity's decimals (~5: 0.5);
//   - path: SVG path data in the viewBox's units.
//
// Art starting with ^, * or % moves with the hat (artShiftTop, Pom,
// Lamp: "dx,dy,dk" a hat, its move and its depth key's); one of
// artMaterials starting with ! is the body in its stead.

// shape is a shape to paint: its depth key, its art, how it is moved.
type shape struct {
	key   int
	art   string
	shift string // "dx dy", or ""
}

// byKey sorts shapes far to near.
type byKey []shape

func (s byKey) Len() int           { return len(s) }
func (s byKey) Less(i, j int) bool { return s[i].key < s[j].key }
func (s byKey) Swap(i, j int)      { s[i], s[j] = s[j], s[i] }

// shapesOf appends art line's shapes, moved for hat when the line says so.
func shapesOf(out []shape, line string, hat byte) []shape {
	shift, dk := "", 0
	if line != "" {
		table := ""
		switch line[0] {
		case '^':
			table = artShiftTop
		case '*':
			table = artShiftPom
		case '%':
			table = artShiftLamp
		}
		if f := strings.Split(fieldOf(table, int(hat)), ","); len(f) == 3 {
			shift = f[0] + " " + f[1]
			dk, _ = strconv.Atoi(f[2])
		}
		if strings.IndexByte("^*%!", line[0]) >= 0 {
			line = line[1:]
		}
	}
	for line != "" {
		s := line
		if n := strings.IndexByte(line, '|'); n >= 0 {
			s, line = line[:n], line[n+1:]
		} else {
			line = ""
		}
		if len(s) < 4 {
			continue
		}
		hi, lo := strings.IndexByte(hexDigits, s[0]), strings.IndexByte(hexDigits, s[1])
		if hi < 0 || lo < 0 {
			continue
		}
		key := hi<<4 | lo
		if key += dk; key < 2 {
			key = 2 // (moved, still over the body)
		}
		out = append(out, shape{key: key, art: s[2:], shift: shift})
	}
	return out
}

// fieldOf is the i-th space-separated field of s, "" past its end.
func fieldOf(s string, i int) string {
	f := strings.Fields(s)
	if i < 0 || i >= len(f) {
		return ""
	}
	return f[i]
}

// ---------------------------------------------------------------- drawing

// drawGnome draws gnome g: his tier's ground and plinth, his trail behind
// him, then every shape of his look, far to near.
func drawGnome(g gnome) string {
	l := readLook(g.traits)
	var b strings.Builder
	b.WriteString(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ` + artSize + ` ` + artSize + `"><title>`)
	b.WriteString(xmlEscape(g.name))
	b.WriteString(`</title><style>`)
	b.WriteString(inkStyle(l))
	b.WriteString(artLight)
	b.WriteString(`</style>`)
	drawFrame(&b, g.tier)

	var shapes []shape
	pal := palette(l)
	trail := shapesOf(nil, artTrails(int(l[fTrail])), 0)
	material := artMaterials(int(l[fMaterial]))
	for _, s := range shapesOf(nil, artCore, 0) {
		if s.key < 2 && strings.HasPrefix(material, "!") {
			continue // the material's own body stands in
		}
		shapes = append(shapes, s)
	}
	if l[fBody] != noColour && isDark(l[fBody]) && l[fMaterial] != matLava {
		shapes = shapesOf(shapes, artWhites, 0)
	}
	shapes = shapesOf(shapes, artPatterns(int(l[fPattern])), 0)
	shapes = shapesOf(shapes, material, 0)
	shapes = shapesOf(shapes, artHats(int(l[fHat])), l[fHat])
	shapes = shapesOf(shapes, artBeards(int(l[fBeard])), 0)
	wear := uint32(l[fWear])<<24 | uint32(l[fWear+1])<<16 | uint32(l[fWear+2])<<8 | uint32(l[fWear+3])
	for k := 0; k < 32; k++ {
		if wear&(1<<uint(k)) != 0 {
			shapes = shapesOf(shapes, artWear(k), l[fHat])
		}
	}
	shapes = shapesOf(shapes, artPieces(int(l[fPiece])), 0)
	shapes = shapesOf(shapes, artProps(int(l[fProp])), l[fHat])
	sort.Stable(byKey(shapes))

	for _, s := range trail {
		drawShape(&b, s, pal)
	}
	for _, s := range shapes {
		drawShape(&b, s, pal)
	}
	b.WriteString(`</svg>`)
	return b.String()
}

// inkStyle is the ink line's class: the gnome's thin hull, or a neon
// gnome's, lit in his material's colour and heavier (gnome-matter.ts).
func inkStyle(l look) string {
	colour, width := ink, artInkWidth
	if l[fMaterial] == matNeon {
		colour, width = "ffffff", artInkWidth*10/7
		if c := colourOf(l[fMatColour]); c != "" {
			colour = c
		}
	}
	return `.i{stroke:#` + colour + `;stroke-width:` + tenths(width) + `;stroke-linejoin:round}`
}

// tenths writes n tenths as a decimal.
func tenths(n int) string { return itoa(int64(n/10)) + "." + itoa(int64(n%10)) }

// drawFrame draws the thumbnails' ground: the tier's colour, a disc of its
// plinth colour, ringed once for a Rare, twice for an Epic or a Legendary,
// rayed for a Legendary; and the gnome's shadow on it.
func drawFrame(b *strings.Builder, tier int) {
	look := artTiers[(tier+1)*18 : (tier+2)*18] // ground, plinth, frame
	ground, plinth, frame := look[:6], look[6:12], look[12:]
	b.WriteString(`<rect width="` + artSize + `" height="` + artSize + `" fill="#` + ground + `"/>`)
	b.WriteString(ellipse(artPlinth, `fill="#`+plinth+`"`))
	rings := []int{0, 0, 1, 2, 2}[tier+1] // earned, common, rare, epic, legendary
	for _, r := range []string{artRing1, artRing2}[:rings] {
		b.WriteString(ellipse(r, `fill="none" stroke="#`+frame+`" stroke-width="`+artRingWidth+`"`))
	}
	if tier == len(tiers)-1 {
		b.WriteString(`<path fill="#` + frame + `" d="` + artRays + `"/>`)
	}
	b.WriteString(ellipse(artShade, `fill="#`+ink+`" opacity=".18"`))
}

// ellipse is an <ellipse> at "cx cy rx ry", with attrs.
func ellipse(at, attrs string) string {
	f := strings.Fields(at)
	return `<ellipse cx="` + f[0] + `" cy="` + f[1] + `" rx="` + f[2] + `" ry="` + f[3] + `" ` + attrs + `/>`
}

// slots are the colours a look gives its art, by slot letter: six hex
// digits, "" for unset.
type slots map[byte]string

// palette is look l's slots. An unset hat is the Classic's red (the
// client's skinOf); the eyes are lit on a dark lava body.
func palette(l look) slots {
	s := slots{
		'H': colourOf(l[fHatColour]), 'R': colourOf(l[fBrim]), 'A': colourOf(l[fHair]), 'B': colourOf(l[fBody]),
		'P': colourOf(l[fPatColour]), 'C': colourOf(l[fAccent]), 'Q': colourOf(l[fPieceCol]), 'O': colourOf(l[fPropColour]),
		'M': colourOf(l[fMatColour]), 'T': colourOf(l[fTrailCol]),
	}
	if s['H'] == "" {
		s['H'] = colourOf(0) // "cap"
	}
	if l[fBody] != noColour && isDark(l[fBody]) && l[fMaterial] == matLava {
		s['E'] = artLitEye
	}
	return s
}

// drawShape writes shape s, its colour from pal.
func drawShape(b *strings.Builder, s shape, pal slots) {
	kind, rest := s.art[0], s.art[1:]
	at := strings.IndexByte(rest, ':')
	if at < 0 {
		return
	}
	colour, d := rest[:at], rest[at+1:]
	b.WriteString(`<path d="` + d + `"`)
	if s.shift != "" && s.shift != "0 0" {
		b.WriteString(` transform="translate(` + s.shift + `)"`)
	}
	switch kind {
	case 'd', 'e', 'l':
		b.WriteString(` class="` + string(kind) + `"/>`)
		return
	}
	opacity := ""
	if n := strings.IndexByte(colour, '~'); n >= 0 {
		colour, opacity = colour[:n], colour[n+1:]
	}
	c := slotColour(colour, pal)
	if kind != 'g' && kind != 'k' {
		c = litColour(c)
	}
	b.WriteString(` fill="#` + c + `"`)
	if opacity != "" {
		b.WriteString(` fill-opacity=".` + opacity + `"`)
	}
	if kind == 'i' {
		b.WriteString(` class="i"`)
	}
	b.WriteString(`/>`)
}

// slotColour is a shape's colour: its own, or its slot's (else the slot's
// default, which may be the hat's).
func slotColour(tok string, pal slots) string {
	if len(tok) == 7 && tok[0] == '#' {
		return tok[1:]
	}
	if len(tok) < 2 {
		return ink
	}
	if c := pal[tok[0]]; c != "" {
		return c
	}
	if tok[1:] == "H" {
		return pal['H']
	}
	return tok[1:]
}

// litColour is colour c under the game's light, a lit top (art.gno's litR…).
func litColour(c string) string {
	if len(c) != 6 {
		return c
	}
	out := make([]byte, 6)
	for i, k := range []int{litR, litG, litB} {
		hi, lo := strings.IndexByte(hexDigits, c[2*i]), strings.IndexByte(hexDigits, c[2*i+1])
		if hi < 0 || lo < 0 {
			return c
		}
		v := (hi<<4 | lo) * k / 256
		out[2*i], out[2*i+1] = hexDigits[v>>4], hexDigits[v&0xf]
	}
	return string(out)
}

var xmlEscaper = strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;", `"`, "&quot;", "'", "&#39;")

func xmlEscape(s string) string { return xmlEscaper.Replace(s) }
