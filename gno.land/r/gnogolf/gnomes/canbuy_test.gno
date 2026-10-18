package gnomes

import (
	"strings"
	"testing"

	"gno.land/p/nt/testutils/v0"
	"gno.land/p/nt/uassert/v0"
	"gno.land/p/nt/urequire/v0"
	"gno.land/r/gnogolf/store"
)

// CanBuy answers the mint page before any signature, from Buy's own checks:
// it must never refuse what Buy takes, nor take what Buy refuses, and it
// must say Buy's reason.

// windowOf opens the genesis's sale anew from start with a player window of
// hours.
func windowOf(start, hours int64) {
	sales = nil
	if err := openSale(genesisName, start, hours); err != nil {
		panic(err)
	}
}

// saidIn is CanBuy's "said" (the tests' sentences hold no quote).
func saidIn(answer string) string {
	s := answer[strings.Index(answer, `"said":"`)+len(`"said":"`):]
	return s[:strings.Index(s, `"`)]
}

// idsOf is the n first catalogue ids of tier i, as Buy takes them.
func idsOf(i, n int) string {
	ids := make([]string, n)
	for k := range ids {
		ids[k] = itoa(nthOfTier(i, k))
	}
	return strings.Join(ids, ",")
}

// Each refusal Buy has but the payment's, and CanBuy giving it first: its
// code, and Buy's own sentence, which Buy then panics with to the letter.
func TestCanBuyAndBuyNeverDisagree(cur realm, t *testing.T) {
	player := testutils.TestAddress("canbuy player") // store is not reset between tests
	testing.SetRealm(testing.NewCodeRealm(rules))
	store.Set(cross(cur), "totals", "pro "+player.String(), "1")
	testing.SetRealm(testing.NewCodeRealm("gno.land/r/gnogolf/gnomes"))

	for _, c := range []struct {
		code, said string
		buyer      address
		ids        func() string
		setUp      func()
	}{
		{"ids", "gnome 1 is named twice", alice, func() string { return "1,1" }, nil},
		{"ids", "name 1 to 5 gnomes, as ids separated by commas", alice, func() string { return "" }, nil},
		{"ids", "not a gnome id: +1", alice, func() string { return "+1" }, nil},
		{"paused", "the sale is closed", alice, func() string { return "1,1" }, func() { mintOpen = false }},
		{"unknown", "no such gnome", alice, func() string { return itoa(lastID() + 1) }, nil},
		{"unlisted", "gnome 721 is not on sale", alice, func() string { return "1,721" },
			func() { addSeries("winter-2027", placeholderRows(721, [len(tiers)]int64{3})) }},
		{"later", "gnome 1 is not on sale yet", alice, func() string { return "1" },
			func() { windowOf(now()+3600, 0) }},
		{"taken", "this gnome is already sold", alice, func() string { return "1" },
			func() { mintTo(bob, mustGnome(1)) }},
		{"closed", "the genesis sale closed on " + dateOf(now()), alice, func() string { return "1" },
			func() { closeAt = now() }},
		{"players-only", "players only until " + itoa(now()+48*3600) + ": finish a hole first", bob,
			func() string { return "1" }, func() { windowOf(now(), 48) }},
		{"window-cap", "the player window takes 3 common a wallet", player,
			func() string { return idsOf(0, 4) }, func() { windowOf(now(), 48) }},
		{"cap", "the cap is 2 epic a wallet", alice, func() string { return idsOf(2, 3) }, nil},
	} {
		testing.SetRealm(testing.NewCodeRealm("gno.land/r/gnogolf/gnomes")) // the last case's buyer gone
		fresh(t, cur)
		if c.setUp != nil {
			c.setUp()
		}
		ids := c.ids()
		got := CanBuy(c.buyer, ids)
		uassert.True(t, strings.Contains(got, `"ok":false,"reason":"`+c.code+`"`), c.code+": "+got)
		uassert.True(t, strings.Contains(got, `"total":0,`), c.code+": nothing to send")
		uassert.Equal(t, c.said, saidIn(got), c.code)
		testing.SetRealm(asUser(c.buyer, ugnot(priceOf(common())*5)))
		urequire.AbortsWithMessage(t, cur, "gnomes: "+saidIn(got), func() { Buy(cross(cur), ids) }, c.code)
	}
}

// When a list is refused for several reasons, the reason is the first Buy
// meets: the switch, then the list, then each id in turn, the caps last.
func TestCanBuySaysTheFirstRefusal(cur realm, t *testing.T) {
	fresh(t, cur)
	mintOpen = false
	uassert.True(t, strings.Contains(CanBuy(alice, ""), `"reason":"paused"`), "the switch before the list")
	mintOpen = true
	ids := itoa(lastID()+1) + "," + itoa(common())
	uassert.True(t, strings.Contains(CanBuy(alice, ids), `"reason":"unknown"`), "the ids in their order")
	ids = idsOf(2, 3) + "," + itoa(lastID()+1)
	uassert.True(t, strings.Contains(CanBuy(alice, ids), `"reason":"unknown"`), "the ids before the caps")
}

func TestCanBuySaysWhatToSend(cur realm, t *testing.T) {
	fresh(t, cur)
	ids := itoa(nthOfTier(0, 0)) + "," + itoa(nthOfTier(1, 0))
	sum := priceOf(nthOfTier(0, 0)) + priceOf(nthOfTier(1, 0))
	uassert.Equal(t,
		`{"version":1,"ok":true,"reason":"","said":"","total":`+itoa(sum)+
			`,"left":{"common":10,"rare":5,"epic":2,"legendary":1},"window":{"until":0,"left":{"common":0,"rare":0,"epic":0,"legendary":0}}}`,
		CanBuy(alice, ids))
	testing.SetRealm(asUser(alice, ugnot(sum)))
	uassert.Equal(t, ids, Buy(cross(cur), ids), "Buy takes it at that sum")
	uassert.True(t, strings.Contains(CanBuy(alice, ids), `"reason":"taken"`))
	uassert.True(t, strings.Contains(CanBuy(alice, "1"), `"left":{"common":9,"rare":4,"epic":2,"legendary":1}`), "the caps left")
}

// "left" is the lifetime caps less what was bought; "window" the first id's
// sale's player window, its caps less what was bought in it, until it ends.
func TestCanBuyShowsTheCapsLeft(cur realm, t *testing.T) {
	player := testutils.TestAddress("canbuy window") // store is not reset between tests
	testing.SetRealm(testing.NewCodeRealm(rules))
	store.Set(cross(cur), "totals", "assisted "+player.String(), "1")
	testing.SetRealm(testing.NewCodeRealm("gno.land/r/gnogolf/gnomes"))
	fresh(t, cur)
	windowOf(now(), 48)
	until := itoa(sales[0].playersUntil)
	ids := idsOf(0, 2)
	testing.SetRealm(asUser(player, ugnot(2*priceOf(common()))))
	Buy(cross(cur), ids)

	next := itoa(nthOfTier(0, 2))
	uassert.Equal(t,
		`{"version":1,"ok":true,"reason":"","said":"","total":`+itoa(priceOf(common()))+
			`,"left":{"common":8,"rare":5,"epic":2,"legendary":1},"window":{"until":`+until+`,"left":{"common":1,"rare":2,"epic":1,"legendary":1}}}`,
		CanBuy(player, next))
	got := CanBuy(bob, next)
	uassert.True(t, strings.Contains(got, `"reason":"players-only"`), got)
	uassert.True(t, strings.Contains(got, `"window":{"until":`+until+`,"left":{"common":3,"rare":2,"epic":1,"legendary":1}}`), got)
	uassert.True(t, strings.Contains(CanBuy(player, "x"), `"window":{"until":0,`), "no id read, no window")

	skip(48 * 3600)
	uassert.True(t, strings.Contains(CanBuy(player, next),
		`"ok":true,"reason":"","said":"","total":`+itoa(priceOf(common()))+
			`,"left":{"common":8,"rare":5,"epic":2,"legendary":1},"window":{"until":0,"left":{"common":0,"rare":0,"epic":0,"legendary":0}}}`),
		"the window over: the lifetime caps alone")
}

// A read: whatever it is asked, it writes nothing and never panics.
func TestCanBuyWritesNothing(cur realm, t *testing.T) {
	fresh(t, cur)
	windowOf(now(), 48)
	for _, ids := range []string{"", ",", "1,1", "99999999999999999999", "\"", "1,2,3,4,5,6", "1"} {
		CanBuy(alice, ids)
	}
	uassert.Equal(t, 0, bought.Size()-seeded().Size())
	uassert.Equal(t, 0, inWindow.Size()-seeded().Size())
	uassert.Equal(t, int64(0), TotalSupply())
}

func TestParamsAreTheConfigs(t *testing.T) {
	uassert.Equal(t,
		`{"version":1,"maxHours":168,"maxBatch":5,"denom":"ugnot"}`,
		Params())
}
