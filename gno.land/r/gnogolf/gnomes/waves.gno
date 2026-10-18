package gnomes

import (
	"chain"
	"errors"
	"time"
)

// The sale comes in waves (ADR-007): the owner opens a range of ids at a
// time, a world's gnomes say, from a start (a day back to a year ahead), its
// first hours for players only (a record in store), at the prices of the
// day it was published. A wave is never changed, and withdrawn only before
// it opens (CancelWave), so once on sale its ids stay on sale at its prices:
// a later SetPrice moves the next waves, never undercuts anyone who bought.
type wave struct {
	first, last  int64
	start        int64             // block time, unix seconds
	playersUntil int64             // the end of its player window; start when none
	prices       [len(tiers)]int64 // ugnot, per tier, as published
}

// prices is what the next wave is published at, per tier.
var prices [len(tiers)]int64

// maxWaves bounds the waves, which every sale walks.
const maxWaves = 64

// SetPrice sets a tier's price for the waves published from now on. Owner
// only.
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
// time, from a day before now to a year after), to wallets with a record only for its first playerHours (0 for
// none), at today's prices. Owner only; for the genesis's ids, refused
// before its closing date is set, once its sale has closed, or from a start
// at or after its closing date (close.gno).
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
	// (a start in milliseconds would hold every genesis close after it)
	if t := now(); start < t-maxWaveBehind || start > t+maxWaveAhead {
		return errors.New("gnomes: a wave starts from a day before now to a year after (unix seconds)")
	}
	if err := checkCloseFor(first, start); err != nil {
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
		playersUntil: start + playerHours*3600, prices: prices}) // (start and hours bounded: no overflow)
	return nil
}

// CancelWave withdraws the wave of ids from first, before it opens: the
// owner's way back from a wrong start or range. Its ids are in no wave
// again, free for another; the waves after it keep their windows (counted
// under their first id). A wave under way, or one with a sale, is never
// withdrawn: a buyer may have counted on it. Owner only.
func CancelWave(cur realm, first int64) {
	assertOwner(0, cur)
	w, err := cancelWave(first)
	if err != nil {
		panic(err)
	}
	chain.Emit("WaveCancelled", "first", itoa(w.first), "last", itoa(w.last), "start", itoa(w.start))
}

func cancelWave(first int64) (wave, error) {
	i := waveAt(first)
	if i < 0 || waves[i].first != first {
		return wave{}, errors.New("gnomes: no wave starts at id " + itoa(first))
	}
	w := waves[i]
	if now() >= w.start || soldIn(w.first, w.last) > 0 {
		return w, errors.New("gnomes: ids " + itoa(w.first) + " to " + itoa(w.last) + " are on sale since " +
			dateOf(w.start) + ": a wave is withdrawn only before it opens")
	}
	rest := make([]wave, 0, len(waves)-1)
	waves = append(append(rest, waves[:i]...), waves[i+1:]...)
	return w, nil
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
