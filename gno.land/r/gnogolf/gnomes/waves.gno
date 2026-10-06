package gnomes

import (
	"chain"
	"errors"
	"time"
)

// The sale comes in waves (ADR-007): the owner opens a range of ids at a
// time, a world's gnomes say, from a start, its first hours for players only
// (a record in store), at the prices of the day it was published. A wave is
// never changed nor withdrawn, so its ids stay on sale at its prices: a
// later SetPrice moves the next waves, never undercuts anyone who bought.
type wave struct {
	first, last  int64
	start        int64             // block time, unix seconds
	playersUntil int64             // the end of its player window; start when none
	prices       [len(tiers)]int64 // ugnot, per tier, as published
}

// prices is what the next wave is published at, per tier; the auction
// tier's is the reserve of the next auction.
var prices [len(tiers)]int64

// maxWaves bounds the waves, which every sale walks.
const maxWaves = 64

// SetPrice sets a tier's price for the waves published from now on (the
// reserve of the next auctions, for the auction tier). Owner only.
func SetPrice(cur realm, tierName string, ugnot int64) {
	assertOwner(0, cur)
	i := tierAt(tierName)
	if i < 0 {
		panic("gnomes: unknown tier " + tierName)
	}
	if ugnot < minPrice || ugnot > maxPrice {
		panic("gnomes: a price is between " + itoa(minPrice) + " and " + itoa(maxPrice) + " ugnot")
	}
	prices[i] = ugnot
	chain.Emit("PriceSet", "tier", tierName, "price", itoa(ugnot))
}

// AddWave puts ids first to last on sale from start (unix seconds, block
// time), to wallets with a record only for its first playerHours (0 for
// none), at today's prices. Owner only; not once the genesis sale has
// closed, for its ids (close.gno).
func AddWave(cur realm, first, last, start, playerHours int64) {
	assertOwner(0, cur)
	if err := addWave(first, last, start, playerHours); err != nil {
		panic(err)
	}
	chain.Emit("WaveAdded", "first", itoa(first), "last", itoa(last), "start", itoa(start),
		"playersUntil", itoa(waves[len(waves)-1].playersUntil))
}

func addWave(first, last, start, playerHours int64) error {
	if len(waves) >= maxWaves {
		return errors.New("gnomes: at most 64 waves")
	}
	if first < 1 || first > last || last > lastID() {
		return errors.New("gnomes: a wave is ids first to last of the catalogue")
	}
	if err := checkNotClosed(first, last); err != nil {
		return err
	}
	if playerHours < 0 || playerHours > maxHours {
		return errors.New("gnomes: a player window is 0 to 168 hours")
	}
	for _, w := range waves {
		if first <= w.last && w.first <= last {
			return errors.New("gnomes: ids " + itoa(w.first) + " to " + itoa(w.last) + " are in a wave already")
		}
	}
	waves = append(waves, wave{first: first, last: last, start: start,
		playersUntil: start + playerHours*3600, prices: prices})
	return nil
}

// waveAt returns the index of the wave gnome id is sold in, -1 when none.
func waveAt(id int64) int {
	for i, w := range waves {
		if id >= w.first && id <= w.last {
			return i
		}
	}
	return -1
}

func now() int64 { return time.Now().Unix() }
