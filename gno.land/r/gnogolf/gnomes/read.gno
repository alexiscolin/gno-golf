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
// the reserve of the next auction for the auction tier; the next wave's when
// in none yet; 0 for an earned one).
//
//	{"version":1,"id":"217","series":"genesis","name":"…","tier":"common",
//	 "traits":"…","owner":"","price":30000000,"sold":false}
func Gnome(tid string) string {
	g, ok := tokenAt(parseID(tid))
	if !ok {
		return noneJSON
	}
	price := int64(0)
	if g.tier != earnedTier {
		price = prices[g.tier]
		if wi := waveAt(g.id); wi >= 0 && g.tier != auctionTier {
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
