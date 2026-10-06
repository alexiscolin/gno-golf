package gnomes

import (
	"strconv"
	"strings"

	"gno.land/p/nt/grc721/v0"
)

// The reads the screens call (the mint page, the gallery, a gnome's page,
// the locker), as JSON, one query each (vm/qeval), each with a "version".

// pageSize is a GnomesOf page.
const pageSize = 100

// Collection is the mint page's header: the switch, the genesis's closing
// date (0 for none), the owner, the treasury and the one offered it, the
// site, the tiers (the price of the next wave, the
// caps, how many sold), the series (how many sold; "closed" once the sale
// closed, so its final supply is "sold") and the waves.
func Collection() string {
	var b strings.Builder
	b.WriteString(`{"version":1,"open":` + strconv.FormatBool(mintOpen) + `,"closesAt":` + itoa(closeAt) +
		`,"owner":` + jsonString(owner.String()) + `,"treasury":` + jsonString(treasury.String()) +
		`,"pendingTreasury":` + jsonString(pendingTreasury.String()) + `,"site":` + jsonString(siteURL) +
		`,"royaltyBps":` + itoa(royaltyBps) + `,"tiers":[`)
	for i, tr := range tiers {
		if i > 0 {
			b.WriteString(",")
		}
		b.WriteString(`{"name":"` + tr.name + `","price":` + itoa(prices[i]) + `,"cap":` + itoa(lifetimeCap[i]) +
			`,"playerCap":` + itoa(playerCap[i]) + `,"sold":` + itoa(soldTier[i]) + `}`)
	}
	b.WriteString(`],"series":[`)
	for i, s := range catalogue {
		if i > 0 {
			b.WriteString(",")
		}
		b.WriteString(`{"name":"` + s.name + `","first":` + itoa(s.first) + `,"last":` + itoa(s.last) +
			`,"sold":` + itoa(soldIn(s.first, s.last)) + `,"closed":` + strconv.FormatBool(i == 0 && genesisClosed()) + `}`)
	}
	b.WriteString(`],"waves":[`)
	for i, w := range waves {
		if i > 0 {
			b.WriteString(",")
		}
		b.WriteString(`{"first":` + itoa(w.first) + `,"last":` + itoa(w.last) + `,"start":` + itoa(w.start) +
			`,"playersUntil":` + itoa(w.playersUntil) + `,"prices":[`)
		for j, p := range w.prices {
			if j > 0 {
				b.WriteString(",")
			}
			b.WriteString(itoa(p))
		}
		b.WriteString(`]}`)
	}
	b.WriteString(`]}`)
	return b.String()
}

// Gnome is gnome tid, of the catalogue or earned, `{"version":1,"id":""}`
// when there is none: its owner ("" while unsold) and its price (its wave's;
// the next wave's when in none yet; 0 for an earned one).
//
//	{"version":1,"id":"217","series":"genesis","name":"…","tier":"common",
//	 "traits":"…","owner":"","price":36000000,"sold":false}
func Gnome(tid string) string {
	g, ok := tokenAt(parseID(tid))
	if !ok {
		return noneJSON
	}
	price := int64(0)
	if g.tier != earnedTier {
		price = prices[g.tier]
		if wi := waveAt(g.id); wi >= 0 {
			price = waves[wi].prices[g.tier]
		}
	}
	owner, err := Token.OwnerOf(grc721.TokenID(tid))
	return `{"version":1,"id":"` + tid + `","series":"` + g.series + `","name":` + jsonString(g.name) +
		`,"tier":"` + tierName(g.tier) + `","traits":` + jsonString(g.traits) + `,"owner":` + jsonString(owner.String()) +
		`,"price":` + itoa(price) + `,"sold":` + strconv.FormatBool(err == nil || isSold(g.id)) +
		`,"closed":` + strconv.FormatBool(isClosed(g.id)) + `}`
}

// noneJSON is the answer for a thing that does not exist: still versioned.
const noneJSON = `{"version":1,"id":""}`

// Sold is the gallery's one query: a bit per catalogue id, bit id-1 set once
// it is sold, the bytes in hex.
func Sold() string {
	n := (lastID() + 7) / 8
	out := make([]byte, 0, 2*n)
	for i := int64(0); i < n; i++ {
		c := byte(0)
		if i < int64(len(sold)) {
			c = sold[i]
		}
		out = append(out, hexDigits[c>>4], hexDigits[c&0xf])
	}
	return string(out)
}

// GnomesOf is the locker: owner's tokens from offset, at most 100, in id
// order; "total" is how many they hold, "next" the offset of the following
// page, or -1.
//
//	{"version":1,"owner":"g1…","total":3,"next":-1,
//	 "rows":[{"id":"217","tier":"common","traits":"…"},…]}
func GnomesOf(owner address, offset int64) string {
	if offset < 0 {
		offset = 0
	}
	total, _ := Token.BalanceOf(owner)
	ids, more := heldPage(owner, offset, pageSize)
	next := int64(-1)
	if more {
		next = offset + pageSize
	}
	var b strings.Builder
	b.WriteString(`{"version":1,"owner":` + jsonString(owner.String()) + `,"total":` + itoa(total) +
		`,"next":` + itoa(next) + `,"rows":[`)
	for i, id := range ids {
		g, _ := tokenAt(id)
		if i > 0 {
			b.WriteString(",")
		}
		b.WriteString(`{"id":"` + itoa(id) + `","tier":"` + tierName(g.tier) + `","traits":` + jsonString(g.traits) + `}`)
	}
	b.WriteString(`]}`)
	return b.String()
}

// CanBuy is the mint page's answer before any signature: whether buyer may
// buy ids (as Buy takes them) now, and if not why. It asks Buy's own checks
// (check), so it never says other than Buy would. "reason" is a code for
// the screen, the first refusal Buy would meet ("" when ok): ids, paused,
// unknown, unlisted, later, taken, closed, players-only, wave-cap,
// cap; "said" is Buy's sentence for it, "" when ok. "total" is the ugnot to
// send, 0 when not ok. Neither the payment nor the direct call is checked: a
// read has no coins and no caller. "left" is what buyer's lifetime caps
// leave per tier Buy sells, this list not counted. "window" is the player
// window of the first id's wave until it ends (a wave yet to start
// included): its end and what its caps leave buyer per tier, this list not
// counted; with no such window (none, over, or no id read) "until" is 0 and
// its "left" all 0, the lifetime caps alone holding.
//
//	{"version":1,"ok":false,"reason":"wave-cap","said":"the player window takes 3 common a wallet",
//	 "total":0,"left":{"common":7,"rare":5,"epic":2,"legendary":1},
//	 "window":{"until":1767225600,"left":{"common":0,"rare":2,"epic":1,"legendary":1}}}
func CanBuy(buyer address, ids string) string {
	t := now()
	o, code, why := check(buyer, ids, t)
	total := int64(0)
	if code == "" {
		total = o.total
	}
	until := int64(0)
	var inWin *[len(tiers)]int64 // nil: no window
	if list, _ := readIDs(ids); len(list) > 0 {
		if wi := waveAt(list[0]); wi >= 0 && t < waves[wi].playersUntil {
			until, inWin = waves[wi].playersUntil, counts(inWindow, windowKey(wi, buyer))
		}
	}
	return `{"version":1,"ok":` + strconv.FormatBool(code == "") + `,"reason":"` + code +
		`","said":` + jsonString(strings.TrimPrefix(why, "gnomes: ")) + `,"total":` + itoa(total) +
		`,"left":` + capsLeft(lifetimeCap, counts(bought, buyer.String())) +
		`,"window":{"until":` + itoa(until) + `,"left":` + capsLeft(playerCap, inWin) + `}}`
}

// capsLeft writes what caps leave once had is counted, per tier,
// as {"common":n,…}; all 0 for had nil.
func capsLeft(caps [len(tiers)]int64, had *[len(tiers)]int64) string {
	var b strings.Builder
	b.WriteString("{")
	for i := range tiers {
		n := int64(0)
		if had != nil {
			n = caps[i] - had[i]
		}
		if i > 0 {
			b.WriteString(",")
		}
		b.WriteString(`"` + tiers[i].name + `":` + itoa(n))
	}
	b.WriteString("}")
	return b.String()
}

// Params is the rules a screen explains, from config.gno: the longest
// player window (hours), the ids one Buy takes, the coin.
func Params() string {
	return `{"version":1,"maxHours":` + itoa(maxHours) + `,"maxBatch":` + itoa(maxBatch) + `,"denom":"` + payDenom + `"}`
}

const hexDigits = "0123456789abcdef"

// jsonString quotes s as a JSON string.
func jsonString(s string) string {
	var b strings.Builder
	b.WriteByte('"')
	for i := 0; i < len(s); i++ {
		switch c := s[i]; {
		case c == '"' || c == '\\':
			b.WriteByte('\\')
			b.WriteByte(c)
		case c == '\n':
			b.WriteString(`\n`)
		case c < 0x20:
			b.WriteString(`\u00`)
			b.WriteByte(hexDigits[c>>4])
			b.WriteByte(hexDigits[c&0xf])
		default:
			b.WriteByte(c)
		}
	}
	b.WriteByte('"')
	return b.String()
}
