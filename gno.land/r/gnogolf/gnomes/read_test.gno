package gnomes

import (
	"strings"
	"testing"

	"gno.land/p/nt/uassert/v0"
	"gno.land/p/nt/urequire/v0"
)

// The reads the screens call (mint page, gallery, token page, locker): JSON,
// one query each, every answer versioned.

func TestCollectionSaysWhatTheMintPageShows(cur realm, t *testing.T) {
	fresh(t, cur)
	w := waves[0]
	uassert.Equal(t,
		`{"version":1,"open":true,"closesAt":0,"owner":"`+deployer.String()+`","treasury":"`+deployer.String()+
			`","pendingTreasury":"","site":"","royaltyBps":500,`+
			`"tiers":[{"name":"common","price":36000000,"cap":10,"playerCap":3,"sold":0},`+
			`{"name":"rare","price":72000000,"cap":5,"playerCap":2,"sold":0},`+
			`{"name":"epic","price":336000000,"cap":2,"playerCap":1,"sold":0},`+
			`{"name":"legendary","price":1296000000,"cap":1,"playerCap":1,"sold":0}],`+
			`"series":[{"name":"genesis","first":1,"last":720,"sold":0,"closed":false}],`+
			`"waves":[{"first":1,"last":720,"start":`+itoa(w.start)+`,"playersUntil":`+itoa(w.playersUntil)+
			`,"prices":[36000000,72000000,336000000,1296000000]}]}`,
		Collection())
}

func TestGnomeSaysWhoOwnsItAndItsPrice(cur realm, t *testing.T) {
	fresh(t, cur)
	id := common()
	row := func(owner string, sold bool) string {
		s := "false"
		if sold {
			s = "true"
		}
		return `{"version":1,"id":"` + itoa(id) + `","series":"genesis","name":"Gnome ` + itoa(id) +
			`","tier":"common","traits":"v0.` + itoa(id) + `","owner":"` + owner + `","price":36000000,"sold":` + s + `,"closed":false}`
	}
	uassert.Equal(t, row("", false), Gnome(itoa(id)))
	testing.SetRealm(asUser(alice, ugnot(priceOf(id))))
	Buy(cross(cur), itoa(id))
	uassert.Equal(t, row(alice.String(), true), Gnome(itoa(id)))
	for _, none := range []string{itoa(lastID() + 1), "007", "0", "", "1000001"} {
		uassert.Equal(t, `{"version":1,"id":""}`, Gnome(none), none)
	}
}

// Sold is the gallery's one query: a bit per id, set once it is sold.
func TestSoldIsABitmapOfTheCatalogue(cur realm, t *testing.T) {
	fresh(t, cur)
	uassert.Equal(t, strings.Repeat("0", 180), Sold(), "90 bytes for the genesis, two hex digits each")
	testing.SetRealm(asUser(alice, ugnot(priceOf(1)+priceOf(8))))
	Buy(cross(cur), "1,8")
	s := Sold()
	uassert.Equal(t, "81", s[0:2], "bit id-1: the first byte's first and last")
	uassert.Equal(t, strings.Repeat("0", 178), s[2:])
}

func lockerRow(id int64) string {
	g := mustGnome(id)
	return `{"id":"` + itoa(id) + `","tier":"` + tiers[g.tier].name + `","traits":"` + g.traits + `"}`
}

func TestGnomesOfIsTheLocker(cur realm, t *testing.T) {
	fresh(t, cur)
	uassert.Equal(t, `{"version":1,"owner":"`+alice.String()+`","total":0,"next":-1,"rows":[]}`, GnomesOf(alice, 0))
	id := common()
	testing.SetRealm(asUser(alice, ugnot(priceOf(id))))
	Buy(cross(cur), itoa(id))
	uassert.Equal(t, `{"version":1,"owner":"`+alice.String()+`","total":1,"next":-1,"rows":[`+lockerRow(id)+`]}`, GnomesOf(alice, 0))

	// it follows a transfer
	testing.SetRealm(asUser(alice, nil))
	TransferFrom(cross(cur), alice, bob, itoa(id))
	uassert.Equal(t, `{"version":1,"owner":"`+alice.String()+`","total":0,"next":-1,"rows":[]}`, GnomesOf(alice, 0))
	uassert.Equal(t, `{"version":1,"owner":"`+bob.String()+`","total":1,"next":-1,"rows":[`+lockerRow(id)+`]}`, GnomesOf(bob, 0))
}

// The locker pages a wallet in id order, 100 rows a page, "next" the
// following page's offset or -1: a holder of many cannot make a read
// unbounded.
func TestGnomesOfPagesAWallet(cur realm, t *testing.T) {
	fresh(t, cur)
	for id := int64(1); id <= 205; id++ {
		mintTo(alice, mustGnome(id))
	}
	p0 := GnomesOf(alice, 0)
	uassert.True(t, strings.HasPrefix(p0, `{"version":1,"owner":"`+alice.String()+`","total":205,"next":100,"rows":[`+lockerRow(1)+","+lockerRow(2)+","))
	uassert.Equal(t, 100, countRows(p0))
	uassert.True(t, strings.Contains(GnomesOf(alice, 100), `"next":200,"rows":[`+lockerRow(101)+","))
	p2 := GnomesOf(alice, 200)
	uassert.True(t, strings.Contains(p2, `"next":-1`))
	uassert.Equal(t, 5, countRows(p2))
	uassert.True(t, strings.HasSuffix(p2, lockerRow(205)+"]}"))
	uassert.Equal(t, 0, countRows(GnomesOf(alice, 205)))
	uassert.Equal(t, p0, GnomesOf(alice, -3), "a negative offset reads from the start")
}

func countRows(s string) int { return strings.Count(s, `{"id":`) }

func TestAJSONStringIsEscaped(t *testing.T) {
	uassert.Equal(t, `"a\"b\\c\n\u0001"`, jsonString("a\"b\\c\n\x01"))
}

func TestReadsAreBounded(t *testing.T) {
	urequire.True(t, pageSize <= 100)
	urequire.True(t, maxPlayers <= 50)
}
