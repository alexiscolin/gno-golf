package gnomes

import (
	"chain"
	"chain/runtime/unsafe"
	"strconv"
	"strings"

	"gno.land/p/nt/bptree/v0"
	"gno.land/p/nt/grc721/v0"
	"gno.land/r/gnogolf/store"
)

// The nine gnomes players earn (web/lib/card.ts UNLOCKS), minted free once
// store proves the feat, and bound to their player (ADR-007). The proof
// reads store with golf/v2's own key layout and never calls golf/v2:
//
//   - a cup's holes: store's "slots", "<world rank><world>/<order>" -> the
//     slot's current version id (golf/v2 slotKey);
//   - a player's best on a version: "bests", "<id> <mode> <player>" ->
//     "<strokes> <height> <period> <shots>" (bestOf); a best with a
//     "copies" row (a record sent again) does not count, as golf's Claim
//     skips it;
//   - a version's par: "holes", "<id>" -> the entry, field 2 (encodeEntry).
//
// bests carry no format version, so the proof refuses while store's writer
// is not the rules it was built against: a later format can refuse a mint,
// never prove a false one.

// rules is the golf realm whose rows the proof reads (stage.sh rewrites it
// with the other paths).
const rules = "gno.land/r/gnogolf/golf/v2"

// Earned ids start above any id a catalogue can reach (64 series of 1,000
// rows end at 64,000).
const firstEarned = 1_000_001

// earnedTier is an earned token's tier: none of the sale's.
const earnedTier = -1

// earnedKinds are the earned gnomes in UNLOCKS order: a token's kind byte is
// the index + 1. earnedNames are theirs in GNOMES (web/lib/scene/gnome.ts),
// earnedNeeds what earns each (UNLOCKS' need). selfcheck.ts holds all three
// to the client's.
var (
	earnedKinds = []string{"wizard", "viking", "golden", "pirate", "diver", "baker", "mayor", "king", "miner"}
	earnedNames = []string{"The Wizard", "The Viking", "The Golden Gnome", "The Pirate", "The Diver", "The Baker", "The Mayor", "The Gnome King", "The Miner"}
	earnedNeeds = []string{"Finish the Garden Cup", "Garden Cup at par or under", "Five holes-in-one", "Finish the Island Cup",
		"Island Cup at par or under", "Finish Mushroom Town", "Mushroom Town at par or under", "The four cups at par or under", "Finish the Crystal Mines"}
)

var (
	earned     *bptree.BPTree // "<player> <kind>" -> id, once per player and kind
	kindOf     *bptree.BPTree // id -> kind
	nextEarned int64          // the next earned id; never reused
)

const (
	errEntry     = "gnomes: a hole entry not as golf/v2 keeps it: "
	errBest      = "gnomes: a best not as golf/v2 writes it: "
	errRules     = "rules changed"
	errKind      = "gnomes: no such earned gnome: "
	errEarned    = "gnomes: already minted: "
	errNotProven = "gnomes: not proven: "
	maxMissing   = 20
	maxCupSlots  = 300 // a store page (store maxPage): a cup the proof reads whole
)

// worlds are golf/v2's cups in its order: a slot key's first digit.
var worlds = []string{"garden", "island", "town", "mountain", "mines"}

// reader is what the proof reads of store; the tests put their own rows here.
type reader interface {
	Page(name, start, end string, limit int) string
	Get(name, key string) (string, bool)
	Has(name, key string) bool
	Writer() string
}

type storeReader struct{}

func (storeReader) Page(name, start, end string, limit int) string {
	return store.Page(name, start, end, limit)
}
func (storeReader) Get(name, key string) (string, bool) { return store.Get(name, key) }
func (storeReader) Has(name, key string) bool           { return store.Has(name, key) }
func (storeReader) Writer() string                      { return store.Writer() }

var rows reader = storeReader{}

// MintEarned mints the caller's earned gnome of kind ("wizard" … "miner")
// once store proves the feat, and returns its id. Free: nothing may be sent
// with it; the caller pays the deposit. Once per player and kind, until it
// is burned. A direct user call, as every call that could be paid for is;
// the switch over sales does not close it, since it sells nothing.
func MintEarned(cur realm, kind string) string {
	if !cur.Previous().IsUserCall() {
		panic(errNotUserCall)
	}
	if len(unsafe.OriginSend()) > 0 {
		panic("gnomes: an earned gnome is free: send nothing with it")
	}
	player := cur.Previous().Address()
	k := kindIndex(kind)
	if k == 0 {
		panic(errKind + kind)
	}
	key := player.String() + " " + kind
	if earned.Has(key) {
		panic(errEarned + kind)
	}
	ok, _, why := prove(kind, player.String())
	if why != "" {
		panic("gnomes: " + why)
	}
	if !ok {
		panic(errNotProven + kind)
	}
	id := nextEarned
	nextEarned++
	tid := itoa(id)
	earned.Set(key, tid)
	kindOf.Set(tid, kind)
	if err := ledger.Mint(player, grc721.TokenID(tid)); err != nil {
		panic(err)
	}
	chain.Emit("GnomeEarned", "id", tid, "kind", kind, "player", player.String())
	return tid
}

func kindIndex(kind string) int {
	for i, k := range earnedKinds {
		if k == kind {
			return i + 1
		}
	}
	return 0
}

// isEarned reports whether id is in the earned range.
func isEarned(id int64) bool { return id >= firstEarned }

// earnedAt is earned token id as a gnome, false when it was not minted (or
// was burned).
func earnedAt(id int64) (gnome, bool) {
	v := kindOf.Get(itoa(id))
	if v == nil {
		return gnome{}, false
	}
	k := kindIndex(v.(string))
	return gnome{id: id, series: "earned", tier: earnedTier, kind: k, name: earnedNames[k-1], traits: earnedTraits(k)}, true
}

// earnedTraits are an earned gnome's traits as the designer's codec writes
// them (web/lib/gnomes/codec.ts, format 1): tier 0, its kind, every other
// field plain. The client draws GNOMES' own gnome for the kind.
func earnedTraits(k int) string {
	return "010000" + string(hexDigits[k>>4]) + string(hexDigits[k&0xf]) + "000000ffff00ffff00ff00000000ff00ff00ff00ff00ff00ff"
}

// A cup is a player's results on its current versions.
type cup struct {
	holes, finished, strokes, par, aces int
	missing                             []string
}

func (c *cup) add(o cup) {
	c.holes += o.holes
	c.finished += o.finished
	c.strokes += o.strokes
	c.par += o.par
	c.aces += o.aces
	for _, m := range o.missing {
		if len(c.missing) < maxMissing {
			c.missing = append(c.missing, m)
		}
	}
}

func (c cup) all() bool   { return c.holes > 0 && c.finished == c.holes }
func (c cup) clean() bool { return c.all() && c.strokes <= c.par }

// prove is what MintEarned(kind) would find for player: whether it is
// proven, the cups' results, and why it cannot be asked ("" when it can).
func prove(kind, player string) (bool, cup, string) {
	if kindIndex(kind) == 0 {
		panic(errKind + kind)
	}
	if rows.Writer() != rules {
		return false, cup{}, errRules
	}
	switch kind {
	case "wizard", "pirate", "baker", "miner":
		c := cupOf(map[string]string{"wizard": "garden", "pirate": "island", "baker": "town", "miner": "mines"}[kind], player, false)
		return c.all(), c, ""
	case "viking", "diver", "mayor":
		c := cupOf(map[string]string{"viking": "garden", "diver": "island", "mayor": "town"}[kind], player, true)
		return c.clean(), c, ""
	case "golden":
		var c cup
		for _, w := range worlds {
			c.add(cupOf(w, player, false))
		}
		return c.aces >= 5, c, ""
	}
	// king: viking's proof on each of the four classic cups
	var c cup
	ok := true
	for _, w := range worlds[:4] {
		one := cupOf(w, player, true)
		ok = ok && one.clean()
		c.add(one)
	}
	return ok, c, ""
}

// cupOf reads a player's results on a cup's current versions: one page of
// slots, a best per mode a slot, and the pars when asked.
func cupOf(world, player string, withPar bool) cup {
	d := strconv.Itoa(worldRank(world))
	start, end := d+world+"/", d+world+"0"
	slots := pageRows(rows.Page("slots", start, end, maxCupSlots))
	// A cup the proof cannot read in one page is refused, never proven from
	// its first page (golf takes up to 999 slots a world).
	if len(slots) == maxCupSlots && rows.Page("slots", slots[maxCupSlots-1][0]+"\x00", end, 1) != "" {
		panic("gnomes: " + world + ": cup too large for the proof")
	}
	var c cup
	for _, kv := range slots {
		c.holes++
		if withPar {
			c.par += parOf(kv[1])
		}
		b := lowerBest(kv[1], player)
		if b == 0 {
			if len(c.missing) < maxMissing {
				c.missing = append(c.missing, slotName(kv[0]))
			}
			continue
		}
		c.finished++
		c.strokes += b
		if b == 1 {
			c.aces++
		}
	}
	return c
}

func worldRank(w string) int {
	for i, x := range worlds {
		if x == w {
			return i
		}
	}
	panic("gnomes: no such world: " + w)
}

// slotName is a slot key as the player knows the hole: "0garden/007" -> "garden/7".
func slotName(key string) string {
	s := key[1:]
	i := strings.LastIndexByte(s, '/') + 1
	return s[:i] + strings.TrimLeft(s[i:], "0")
}

// lowerBest is the player's lower best on a version, either mode, a copy not
// counting; 0 for none.
func lowerBest(id, player string) int {
	low := 0
	for _, mode := range []string{"assisted", "pro"} {
		k := id + " " + mode + " " + player
		b, ok := rows.Get("bests", k)
		if !ok || rows.Has("copies", k) {
			continue
		}
		if s := strokesOf(b); low == 0 || s < low {
			low = s
		}
	}
	return low
}

// strokesOf is a best's strokes: one to three digits, then a space (bestOf).
func strokesOf(b string) int {
	n, i := 0, 0
	for i < len(b) && i < 4 && b[i] >= '0' && b[i] <= '9' {
		n = n*10 + int(b[i]-'0')
		i++
	}
	if i == 0 || i > 3 || i >= len(b) || b[i] != ' ' || n == 0 {
		panic(errBest + strconv.Quote(b))
	}
	return n
}

// parOf is a version's par: field 2 of its entry, format "1" (encodeEntry).
func parOf(id string) int {
	s, ok := rows.Get("holes", id)
	if !ok {
		panic(errEntry + id)
	}
	f, i, ok := field(s, 0)
	if !ok || f != "1" {
		panic(errEntry + id)
	}
	var par string
	for k := 0; k < 3; k++ {
		if par, i, ok = field(s, i); !ok {
			panic(errEntry + id)
		}
	}
	n, err := strconv.Atoi(par)
	if err != nil || n < 1 {
		panic(errEntry + id)
	}
	return n
}

// pageRows is a store page's rows, key and value (store's row: each its
// length, ":" and itself).
func pageRows(p string) [][2]string {
	var out [][2]string
	for i := 0; i < len(p); {
		k, j, ok := field(p, i)
		v, l, ok2 := field(p, j)
		if !ok || !ok2 {
			panic("gnomes: a store page not as store writes it")
		}
		out = append(out, [2]string{k, v})
		i = l
	}
	return out
}

// field reads one "<len>:<value>" of s from i: the value and the next index.
func field(s string, i int) (string, int, bool) {
	n, j := 0, i
	for j < len(s) && j-i < 6 && s[j] >= '0' && s[j] <= '9' {
		n = n*10 + int(s[j]-'0')
		j++
	}
	if j == i || j >= len(s) || s[j] != ':' || len(s)-j-1 < n {
		return "", 0, false
	}
	return s[j+1 : j+1+n], j + 1 + n, true
}

// Proof says what MintEarned(kind) would find for player, free:
//
//	{"version":1,"kind":"viking","player":"g1…","ok":false,"minted":"",
//	 "holes":18,"finished":16,"strokes":48,"par":54,"missing":["garden/1",…]}
//
// with a "reason" when it cannot be asked ("rules changed").
func Proof(kind string, player address) string {
	ok, c, why := prove(kind, player.String())
	minted := ""
	if v := earned.Get(player.String() + " " + kind); v != nil {
		minted = v.(string)
	}
	var b strings.Builder
	b.WriteString(`{"version":1,"kind":"` + kind + `","player":` + jsonString(player.String()) + `,"ok":` + strconv.FormatBool(ok) +
		`,"minted":"` + minted + `","holes":` + strconv.Itoa(c.holes) + `,"finished":` + strconv.Itoa(c.finished) +
		`,"strokes":` + strconv.Itoa(c.strokes) + `,"par":` + strconv.Itoa(c.par) + `,"missing":[`)
	for i, m := range c.missing {
		if i > 0 {
			b.WriteString(",")
		}
		b.WriteString(jsonString(m))
	}
	b.WriteString("]")
	if why != "" {
		b.WriteString(`,"reason":"` + why + `"`)
	}
	b.WriteString("}")
	return b.String()
}
