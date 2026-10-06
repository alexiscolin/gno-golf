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
// in a wave under way, unsold, and of a tier Buy sells (a Legendary is
// auctioned); the caller's caps hold for the whole list. Exactly the sum of
// their wave prices must be sent with the call (-send "<sum>ugnot"); it
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
	if !mintOpen {
		panic(errClosed)
	}
	list := parseIDs(ids)
	t := now()
	player := false // asked of store once, only when a window needs it
	var gnomes []gnome
	var paid []int64
	var count [len(tiers)]int64
	windowCount := map[int]*[len(tiers)]int64{}
	total := int64(0)
	for _, id := range list {
		g, ok := gnomeAt(id)
		if !ok {
			panic(errNoGnome)
		}
		if g.tier == auctionTier {
			panic("gnomes: a " + tiers[auctionTier].name + " is sold by auction")
		}
		wi := waveAt(id)
		if wi < 0 {
			panic("gnomes: gnome " + itoa(id) + " is not on sale")
		}
		w := waves[wi]
		if t < w.start {
			panic("gnomes: gnome " + itoa(id) + " is not on sale yet")
		}
		if isSold(id) {
			panic(errSold)
		}
		assertNotClosed(id)
		if t < w.playersUntil {
			if !player && !hasRecord(buyer) {
				panic("gnomes: players only until " + itoa(w.playersUntil) + ": finish a hole first")
			}
			player = true
			if windowCount[wi] == nil {
				windowCount[wi] = counts(inWindow, windowKey(wi, buyer))
			}
			windowCount[wi][g.tier]++
			if windowCount[wi][g.tier] > playerCap[g.tier] {
				panic("gnomes: the player window takes " + itoa(playerCap[g.tier]) + " " + tiers[g.tier].name + " a wallet")
			}
		}
		count[g.tier]++
		total += w.prices[g.tier] // at most 5 times maxPrice: no overflow
		gnomes, paid = append(gnomes, g), append(paid, w.prices[g.tier])
	}
	had := counts(bought, buyer.String())
	for i := range tiers {
		if count[i] > 0 && had[i]+count[i] > lifetimeCap[i] {
			panic("gnomes: the cap is " + itoa(lifetimeCap[i]) + " " + tiers[i].name + " a wallet")
		}
	}

	// The envelope is exactly the sum: one coin, the right denom, the right
	// amount. Anything else would underpay or leave coins behind.
	sent := unsafe.OriginSend()
	if len(sent) != 1 || sent[0].Denom != payDenom || sent[0].Amount != total {
		panic("gnomes: wrong payment, send exactly " + itoa(total) + payDenom)
	}

	// The state first, then the coins: nothing below calls out but the
	// banker, and it calls no code.
	for i := range tiers {
		had[i] += count[i]
	}
	bought.Set(buyer.String(), *had)
	for wi, c := range windowCount {
		inWindow.Set(windowKey(wi, buyer), *c)
	}
	for i, g := range gnomes {
		mintTo(buyer, g)
		chain.Emit("GnomeBought", "id", itoa(g.id), "buyer", buyer.String(),
			"price", itoa(paid[i]), "treasury", treasury.String())
	}
	// Forwarded at once: an OriginSend banker spends this call's envelope
	// and nothing else.
	banker.NewBanker(banker.BankerTypeOriginSend, cur).
		SendCoins(cur.Address(), treasury, chain.NewCoins(chain.NewCoin(payDenom, total)))
	return ids
}

// parseIDs reads "1,2,3": 1 to maxBatch distinct decimal ids, no sign, no
// leading zero, no space.
func parseIDs(ids string) []int64 {
	parts := strings.Split(ids, ",")
	if ids == "" || len(parts) > maxBatch {
		panic("gnomes: name 1 to 5 gnomes, as ids separated by commas")
	}
	list := make([]int64, 0, len(parts))
	for _, p := range parts {
		id := parseID(p)
		if id == 0 {
			panic("gnomes: not a gnome id: " + p)
		}
		for _, seen := range list {
			if seen == id {
				panic("gnomes: gnome " + p + " is named twice")
			}
		}
		list = append(list, id)
	}
	return list
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

func windowKey(wave int, buyer address) string { return itoa(int64(wave)) + " " + buyer.String() }
