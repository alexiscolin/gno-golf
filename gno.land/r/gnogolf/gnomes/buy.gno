package gnomes

import (
	"chain"
	"chain/banker"
	"chain/runtime/unsafe"
	"strings"

	"gno.land/p/nt/bptree/v0"
)

// Buy sells the caller the gnomes ids names, 1 to 5 catalogue ids
// separated by commas ("217,301"), and returns them as given. Each must be
// in a sale under way and unsold; the caller's caps hold for the whole list. Exactly the sum of
// their sale prices must be sent with the call (-send "<sum>ugnot"); it
// goes to the treasury before the call returns. Any refusal reverts the call,
// coins included.
//
// Only a direct user call (maketx call) is taken. That is what makes
// OriginSend the caller's own money: a realm or a run script in between
// could keep the coins it attached while OriginSend still reported them.
func Buy(cur realm, ids string) string {
	if !cur.Previous().IsUserCall() {
		panic(errNotUserCall)
	}
	buyer := cur.Previous().Address()
	o, _, why := check(buyer, ids, now())
	if why != "" {
		panic(why)
	}

	// The envelope is exactly the sum: one coin, the right denom, the right
	// amount. Anything else would underpay or leave coins behind.
	sent := unsafe.OriginSend()
	if len(sent) != 1 || sent[0].Denom != payDenom || sent[0].Amount != o.total {
		panic("gnomes: wrong payment, send exactly " + itoa(o.total) + payDenom)
	}

	// The state first, then the coins: nothing below calls out but the
	// banker, and it calls no code.
	for i := range tiers {
		o.had[i] += o.count[i]
	}
	bought.Set(buyer.String(), *o.had)
	for k, c := range o.windowCount {
		inWindow.Set(k, *c)
	}
	for i, g := range o.gnomes {
		mintTo(buyer, g)
		chain.Emit("GnomeBought", "id", itoa(g.id), "buyer", buyer.String(),
			"price", itoa(o.paid[i]), "treasury", treasury.String())
	}
	// Forwarded at once: an OriginSend banker spends this call's envelope
	// and nothing else.
	banker.NewBanker(banker.BankerTypeOriginSend, cur).
		SendCoins(cur.Address(), treasury, chain.NewCoins(chain.NewCoin(payDenom, o.total)))
	return ids
}

// order is a list Buy takes: its gnomes and what each costs, their sum, and
// the counts the buyer's caps keep, as they will be once it is sold.
type order struct {
	gnomes      []gnome
	paid        []int64
	count       [len(tiers)]int64             // per tier, in the list
	had         *[len(tiers)]int64            // the buyer's lifetime counts before it
	windowCount map[string]*[len(tiers)]int64 // per sale in its player window (windowKey), the list included
	total       int64
}

// check is Buy's every refusal but the caller's and the payment's, in Buy's
// order: buyer's ids at time t as an order, or why not, as a code (CanBuy's
// "reason") and the sentence Buy panics with. It writes nothing, so Buy and
// CanBuy ask the same question and can never answer it differently.
func check(buyer address, ids string, t int64) (o order, code, why string) {
	if !mintOpen {
		return o, "paused", errClosed
	}
	list, why := readIDs(ids)
	if why != "" {
		return o, "ids", why
	}
	player := false // asked of store once, only when a window needs it
	o.windowCount = map[string]*[len(tiers)]int64{}
	for _, id := range list {
		g, ok := gnomeAt(id)
		if !ok {
			return o, "unknown", errNoGnome
		}
		si := saleAt(id)
		if si < 0 {
			return o, "unlisted", "gnomes: gnome " + itoa(id) + " is not on sale"
		}
		s := sales[si]
		if t < s.start {
			return o, "later", "gnomes: gnome " + itoa(id) + " is not on sale yet"
		}
		if isSold(id) {
			return o, "taken", errSold
		}
		if isClosed(id) {
			return o, "closed", errClosedOn()
		}
		if t < s.playersUntil {
			if !player && !hasRecord(buyer) {
				return o, "players-only", "gnomes: players only until " + itoa(s.playersUntil) + ": finish a hole first"
			}
			player = true
			k := windowKey(s.series, buyer)
			if o.windowCount[k] == nil {
				o.windowCount[k] = counts(inWindow, k)
			}
			o.windowCount[k][g.tier]++
			if o.windowCount[k][g.tier] > playerCap[g.tier] {
				return o, "window-cap", "gnomes: the player window takes " + itoa(playerCap[g.tier]) + " " + tiers[g.tier].name + " a wallet"
			}
		}
		o.count[g.tier]++
		o.total += s.prices[g.tier] // at most 5 times maxPrice: no overflow
		o.gnomes, o.paid = append(o.gnomes, g), append(o.paid, s.prices[g.tier])
	}
	o.had = counts(bought, buyer.String())
	for i := range tiers {
		if o.count[i] > 0 && o.had[i]+o.count[i] > lifetimeCap[i] {
			return o, "cap", "gnomes: the cap is " + itoa(lifetimeCap[i]) + " " + tiers[i].name + " a wallet"
		}
	}
	return o, "", ""
}

// readIDs reads "1,2,3": 1 to maxBatch distinct decimal ids, no sign, no
// leading zero, no space; or the sentence refusing it.
func readIDs(ids string) ([]int64, string) {
	parts := strings.Split(ids, ",")
	if ids == "" || len(parts) > maxBatch {
		return nil, "gnomes: name 1 to 5 gnomes, as ids separated by commas"
	}
	list := make([]int64, 0, len(parts))
	for _, p := range parts {
		id := parseID(p)
		if id == 0 {
			return nil, "gnomes: not a gnome id: " + p
		}
		for _, seen := range list {
			if seen == id {
				return nil, "gnomes: gnome " + p + " is named twice"
			}
		}
		list = append(list, id)
	}
	return list, ""
}

// parseID reads a catalogue id in decimal, 0 for anything else.
func parseID(s string) int64 {
	if len(s) == 0 || len(s) > 9 || s[0] == '0' {
		return 0
	}
	n := int64(0)
	for i := 0; i < len(s); i++ {
		if s[i] < '0' || s[i] > '9' {
			return 0
		}
		n = n*10 + int64(s[i]-'0')
	}
	return n
}

// counts returns the per-tier counts tree keeps under key, as a copy to
// change and Set back.
func counts(tree *bptree.BPTree, key string) *[len(tiers)]int64 {
	c := &[len(tiers)]int64{}
	if v := tree.Get(key); v != nil {
		*c = v.([len(tiers)]int64)
	}
	return c
}

// windowKey is buyer's row in inWindow for series name's sale: under the
// series, which has one sale, not the sale's place in the list, which
// CancelSale moves.
func windowKey(name string, buyer address) string { return name + " " + buyer.String() }
