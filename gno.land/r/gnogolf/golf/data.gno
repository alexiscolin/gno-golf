package golf

import (
	"chain"
	"chain/runtime"
	"crypto/sha256"
	"encoding/hex"
	"math"
	"strconv"
	"strings"
	"unicode"
	"unicode/utf8"

	"gno.land/p/gnogolf/course"
)

// Holes as data. A version is a GG1 string (course.Encode), sent as hex,
// checked once when it is published — it decodes within the format's limits
// and its stored wall lengths are its walls' own (course.Exact) — and kept as
// bytes. Each call decodes it again into a *course.Simple that lives for that
// call only: nothing of it is ever stored, so a hole costs its data and its
// records, not its geometry.
//
// A version is never edited or removed. A new one takes the alias (a slot
// of the course, or "<address>/<slug>"), and the old one is archived: still
// playable, its records kept, and, on the course, out of the ranking.

// dataHole is a decoded data version for one call. It plays as its Simple,
// and reads its wear from its entry: the Simple's own Marks would be lost
// with it. golf's stroke marks the wear where the round's ball rests, never
// the Simple's own Play, PlayAt and PlayWith.
type dataHole struct {
	*course.Simple
	e *entry
}

// Wear is the entry's wear.
func (d *dataHole) Wear() []int {
	out := make([]int, wearCells)
	if b := d.e.wear; b != nil {
		for i := range out {
			out[i] = int(uint32(b[4*i]) | uint32(b[4*i+1])<<8 | uint32(b[4*i+2])<<16 | uint32(b[4*i+3])<<24)
		}
	}
	return out
}

const wearCells = course.WearW * course.WearH

// mark counts a ball come to rest in wear cell i.
func (e *entry) mark(i int) {
	if i < 0 || i >= wearCells {
		return // course.WearIndexOn never gives one
	}
	if e.wear == nil {
		e.wear = make([]byte, 4*wearCells)
	}
	b := e.wear
	n := uint32(b[4*i]) | uint32(b[4*i+1])<<8 | uint32(b[4*i+2])<<16 | uint32(b[4*i+3])<<24
	n++
	b[4*i], b[4*i+1], b[4*i+2], b[4*i+3] = byte(n), byte(n>>8), byte(n>>16), byte(n>>24)
}

// maxData bounds a version's data: a hole at every limit of the format is
// about 21 KB.
const maxData = 32 << 10

// Publish puts a course hole's data into its slot, as its next version, and
// returns the new version's id ("garden/7/v2"). Only the owner can.
//
// hexData is the hole as course.Encode wrote it, in hex. The slot must be the
// data's own world and order ("garden/7"), so a mis-edited file cannot
// replace the wrong hole; the order is a whole number from 1 to 999. The name,
// par, world and order are frozen with the version. Data identical to the
// current version's is refused: it would reset the hole's ranking for
// nothing.
//
// A version already in the slot is archived: its records stay, its bests
// leave the course-wide standing (a batch now, the rest as players finish or
// anyone Drains), and the new version starts the ranking afresh. note (140
// characters at most, cleaned) says why, on the hole's data page.
func Publish(cur realm, slot, hexData, note string) string {
	by := cur.Previous().Address()
	if !isOwner(by) {
		panic("golf: only the owner can publish a course hole")
	}
	h, data, sum := decodeData(hexData)
	if h.Order < 1 || h.Order != math.Trunc(h.Order) {
		panic("golf: a course hole's order is a whole number from 1 to 999")
	}
	own := h.World + "/" + strconv.Itoa(int(h.Order))
	if slot != own {
		panic("golf: this data is " + own + ", not " + slot)
	}
	key, _ := slotKeyOf(slot)
	var old *entry
	n := 1
	if v := slots.Get(key); v != nil {
		old = find(v.(string))
		if old.sha == sum {
			panic(nothingNew(old))
		}
		n = old.version + 1
	}
	e := dataEntry(slot, n, h, by, sum, note)
	e.official = true
	courseHoles.Set(e.id, e)
	holeData.Set(e.id, data)
	slots.Set(key, e.id)
	chain.Emit(EventHolePublished, "hole", e.id, "slot", slot, "sha", sum, "by", by.String(), "official", "true")
	if old != nil {
		retire(old, e.id)
	}
	return e.id
}

// PublishMine publishes a hole of one's own, as data, and returns its id:
// "<caller>/<slug>/v1" the first time, then v2 and on. Anyone can while the
// owner has publishing open (SetPublishing), and only the same address can
// add versions to it. slug is 1 to 32 of a-z, 0-9 and "-". It is a community
// hole: playable, recorded and on its own board, in no cup and not in the
// course ranking. The data is held to what Publish holds it to, but its world
// and order are its author's own business. A new version of a hidden hole
// (Hide) stays hidden.
//
// The publisher pays the storage deposit for the bytes it adds, about half a
// GNOT a version, and nothing published can be deleted.
func PublishMine(cur realm, slug, hexData, note string) string {
	if !publishing {
		panic("golf: publishing community holes is not open yet")
	}
	by := cur.Previous().Address()
	if !validSlug(slug) {
		panic("golf: a slug is 1 to 32 of a-z, 0-9 and -")
	}
	alias := by.String() + "/" + slug
	h, data, sum := decodeData(hexData)
	var old *entry
	n := 1
	if v := aliases.Get(alias); v != nil {
		old = find(v.(string))
		if old.sha == sum {
			panic(nothingNew(old))
		}
		n = old.version + 1
	}
	e := dataEntry(alias, n, h, by, sum, note)
	if linkish(e.name) || linkish(e.note) {
		panic("golf: a community hole's name and note carry no web address")
	}
	community.Set(e.id, e)
	holeData.Set(e.id, data)
	aliases.Set(alias, e.id)
	if old != nil {
		old.next = e.id // archived; it never counted anywhere
	}
	if !hidden.Has(alias) { // a hidden hole has no row (Hide)
		a := by.String()
		// the newest row: the author's own moves to its height
		moveAuthor(a, newestRow(a), pad(int(e.height), 12))
		if old != nil {
			byAuthor.Remove(a + " " + recentKey(old.height, slug))
		}
		byAuthor.Set(a+" "+recentKey(e.height, slug), e.id)
	}
	chain.Emit(EventHolePublished, "hole", e.id, "slot", alias, "sha", sum, "by", by.String(), "official", "false")
	return e.id
}

// newestRow is the height of an author's newest row in byAuthor
// ("<address> <height> <slug>"), "" if they have none.
func newestRow(a string) string {
	latest := ""
	byAuthor.ReverseIterate(a+" ", a+"!", func(k string, _ any) bool {
		latest = k[len(a)+1 : len(a)+13]
		return true
	})
	return latest
}

// moveAuthor moves an author's own row in byAuthor (recentKey(height,
// address)) from the height was to now, "" for none: it stays at their
// newest row's, and goes with their last.
func moveAuthor(a, was, now string) {
	if was == now {
		return
	}
	if was != "" {
		byAuthor.Remove(was + " " + a)
	}
	if now != "" {
		byAuthor.Set(now+" "+a, nil)
	}
}

// linkish spots a web address in a community hole's name or note, which the
// lists show on the course's front page: "www.", a dot between a letter or
// digit and two letters ("claim.xyz", "t.me"; not "e.g." nor a sentence's dot,
// which has a space after it), or an IP address ("1.2.3.4"), the dots written
// as look-alikes (．。․﹒) read as dots, letters in any case. Basic on purpose:
// what gets past it, the owner can Hide. And strict on purpose: a dot between
// letters is what a domain looks like, so "St.Andrews" is refused with
// "claim.xyz", and its author writes "St. Andrews".
//
// It reads s once, a byte at a time: every mark it looks for is ASCII, and
// the only characters that lower-case to ASCII are İ and the Kelvin sign, so
// a character past ASCII is decoded only to tell those, the look-alike dots
// and the spaces that end a word apart from the rest.
func linkish(s string) bool {
	var c1, c2, c3 byte // the three characters before c, lower-cased
	// the word so far, as strings.Fields splits: an IP address is only
	// digits and three dots
	word, ip, dots := false, true, 0
	for i := 0; i < len(s); {
		c, size, space := s[i], 1, false
		switch {
		case c >= 'A' && c <= 'Z':
			c += 'a' - 'A'
		case c >= utf8.RuneSelf:
			var r rune
			r, size = utf8.DecodeRuneInString(s[i:])
			switch r {
			case 'İ':
				c = 'i'
			case '\u212a': // the Kelvin sign
				c = 'k'
			case '．', '。', '․', '﹒':
				c = '.'
			default:
				c, space = utf8.RuneSelf, unicode.IsSpace(r) // none of the marks
			}
		case c == ' ' || c >= '\t' && c <= '\r':
			space = true
		}
		i += size
		switch {
		case c == '.' && c1 == 'w' && c2 == 'w' && c3 == 'w':
			return true
		case isLower(c) && isLower(c1) && c2 == '.' && (isLower(c3) || isDigit(c3)):
			return true
		}
		c1, c2, c3 = c, c1, c2
		if space {
			if word && ip && dots == 3 {
				return true
			}
			word, ip, dots = false, true, 0
			continue
		}
		word = true
		if c == '.' {
			dots++
		} else if !isDigit(c) {
			ip = false
		}
	}
	return word && ip && dots == 3
}

func isLower(c byte) bool { return c >= 'a' && c <= 'z' }
func isDigit(c byte) bool { return c >= '0' && c <= '9' }

// decodeData checks a version's data as it arrives: hex, GG1 within the
// format's limits, stored lengths bit-exact, and in the one form Encode
// gives. After this the lengths are
// trusted on every call (course.Decode does not check them; DecodeChecked,
// here, does).
func decodeData(hexData string) (*course.Simple, string, string) {
	if len(hexData) > 2*maxData {
		panic("golf: the data is too long")
	}
	b, err := hex.DecodeString(hexData)
	if err != nil {
		panic("golf: the data is not hex")
	}
	data := string(b)
	h, err := course.DecodeChecked(data)
	if err != nil {
		panic("golf: " + err.Error())
	}
	// one hole, one string: data that decodes to a hole Encode would write
	// otherwise (a skin never used, a style run split, a stored length a
	// zero-length wall never reads) is refused, so the same hole cannot come
	// back under another sha
	if course.Encode(h) != data {
		panic("golf: the data is not as course.Encode writes it")
	}
	// a hole whose heaviest shot a transaction could not replay is refused:
	// the physics ends a stroke at MaxWork, so this holds a hole's walls
	w := newWork(h, nil)
	if w.bound > maxShotGas {
		panic(errShotTooHeavy)
	}
	sum := sha256.Sum256(b)
	return h, data, hex.EncodeToString(sum[:])
}

// nothingNew refuses a version whose data is its alias's current one's: it
// would reset the hole's ranking for nothing.
func nothingNew(old *entry) string {
	return "golf: this data is already " + old.id + ": nothing to publish"
}

func dataEntry(alias string, n int, h *course.Simple, by address, sum, note string) *entry {
	e := newEntry(alias+"/v"+strconv.Itoa(n), cleanName(h.Title), course.ParOf(h), h.World, h.Order)
	e.slot, e.version, e.by, e.height, e.sha, e.note = alias, n, by, runtime.ChainHeight(), sum, cleanText(note, maxNote)
	return e
}

// worlds is the course's worlds, in the order a player goes through them,
// and what each is called on the page. A world not listed comes after them.
var worlds = []struct{ id, name string }{
	{"garden", "Garden Cup"},
	{"island", "Island Cup"},
	{"town", "Mushroom Town"},
	{"mountain", "Mountain Cup"},
}

// worldRank is a world's place among worlds; any other comes after.
func worldRank(w string) int {
	for i, x := range worlds {
		if x.id == w {
			return i
		}
	}
	return len(worlds)
}

// slotKey is the key a slot is kept under: its world's rank, the world, and
// the order in three digits, so that the slots tree is the course in course
// order.
func slotKey(world string, order int) string {
	return string(rune('0'+worldRank(world))) + world + "/" + pad(order, 3)
}

// slotKeyOf reads a slot, "world/order" (as "garden/7"), into its key.
func slotKeyOf(slot string) (string, bool) {
	i := strings.Index(slot, "/")
	if i < 0 || !isWorld(slot[:i]) {
		return "", false
	}
	n, err := strconv.Atoi(slot[i+1:])
	if err != nil || n < 1 || n > course.MaxOrder || strconv.Itoa(n) != slot[i+1:] {
		return "", false
	}
	return slotKey(slot[:i], n), true
}

// isWorld is whether w can name a world: 1 to 16 of a-z, as course.Decode
// holds data to.
func isWorld(w string) bool {
	if len(w) < 1 || len(w) > course.MaxWorld {
		return false
	}
	for i := 0; i < len(w); i++ {
		if w[i] < 'a' || w[i] > 'z' {
			return false
		}
	}
	return true
}

func validSlug(s string) bool {
	if len(s) < 1 || len(s) > 32 {
		return false
	}
	for i := 0; i < len(s); i++ {
		if c := s[i]; !(c >= 'a' && c <= 'z' || c >= '0' && c <= '9' || c == '-') {
			return false
		}
	}
	return true
}

// HoleData is a version's GG1, in hex, as it was published (an alias gives
// its current version's): what a golf/v2 or an auditor reads back.
func HoleData(hole string) string {
	e := readHole(hole)
	return hex.EncodeToString([]byte(holeData.Get(e.id).(string)))
}

// Current is the id of the version an alias ("garden/7", "<address>/<slug>")
// plays now, "" if the alias has none.
func Current(alias string) string { return current(alias) }

// Versions is every version of an alias, oldest first (the newest pageMax if
// there are more): its id, number, the height it was published at, by whom,
// its data's sha256, its note, and the version that took its place. slot is
// the alias, "" (and no versions) for one that has none.
func Versions(alias string) string {
	now := find(current(alias))
	slot := ""
	if now != nil {
		slot = now.slot // never the caller's own bytes
	}
	var sb strings.Builder
	sb.WriteString("{" + versionJSON + `,"slot":` + jstr(slot) + `,"versions":[`)
	if now != nil {
		from := 1
		if now.version > pageMax {
			from = now.version - pageMax + 1
		}
		for n := from; n <= now.version; n++ {
			e := find(now.slot + "/v" + strconv.Itoa(n))
			if n > from {
				sb.WriteString(",")
			}
			sb.WriteString(`{"id":` + jstr(e.id) + `,"v":` + strconv.Itoa(e.version) +
				`,"height":` + strconv.FormatInt(e.height, 10) + `,"by":` + jstr(e.by.String()) +
				`,"sha":` + jstr(e.sha) + `,"note":` + jstr(e.note) + `,"next":` + jstr(e.next) + "}")
		}
	}
	sb.WriteString("]}")
	return sb.String()
}

// BestOf is a player's best finished round on a hole in a mode, 0 if none.
func BestOf(hole, mode string, player address) int {
	e, m := readHole(hole), modeOf(mode)
	return bestStrokes(e.bests(m).Get(player.String()))
}

// StandingOf is a player's course-wide standing in a mode: how many current
// course holes they finished, and in how many strokes; 0, 0 if none.
func StandingOf(mode string, player address) (int, int) {
	if v := totals[modeOf(mode)].Get(player.String()); v != nil {
		r := v.(*row)
		return r.holes, r.strokes
	}
	return 0, 0
}
