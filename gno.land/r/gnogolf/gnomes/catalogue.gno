package gnomes

import (
	"chain"
	"errors"
)

// The catalogue: every gnome that can be minted, published by the owner a
// series at a time (ADR-007). The genesis comes first, as the config says;
// a later drop is one more AddSeries, of any size, with no new code. A
// series is never changed once published: its gnomes may be owned.
//
// A series is its rows as published, one gnome per line,
//
//	id|tier|name|traits
//
// ids following on from the last series with no gap, tier one of the
// config's, traits the designer's compact encoding (version-prefixed, opaque
// here: the client reads it). The rows are kept as one string, read in place
// (rows.gno): as structs they would cost several times the deposit.
type series struct {
	name        string
	first, last int64 // the ids of its first and last rows
	rows        string
	sold        int64 // how many of its gnomes were sold, for good
}

// A gnome is one row of the catalogue, or an earned gnome (earned.gno).
type gnome struct {
	id     int64
	series string
	tier   int // index in tiers, earnedTier for an earned one
	kind   int // an earned one's: 1 to 9 (earnedKinds); 0 otherwise
	name   string
	traits string
}

// The bounds of the catalogue: the series, which every read walks, and the
// rows of one, which AddSeries checks in one call.
const (
	maxSeries     = 64
	maxSeriesRows = 1000
	maxSeriesName = 32
	maxGnomeName  = 48
	maxTraits     = 256
)

// AddSeries publishes the next series of the catalogue. Owner only. It is
// refused whole if any row is wrong.
func AddSeries(cur realm, name, data string) {
	assertOwner(0, cur)
	if err := addSeries(name, data); err != nil {
		panic(err)
	}
	s := catalogue[len(catalogue)-1]
	chain.Emit("SeriesAdded", "series", name, "first", itoa(s.first), "last", itoa(s.last))
}

func addSeries(name, data string) error {
	if len(catalogue) >= maxSeries {
		return errors.New("gnomes: at most 64 series")
	}
	if !validSlug(name) {
		return errors.New("gnomes: a series name is 1 to 32 of [a-z0-9-]")
	}
	for _, s := range catalogue {
		if s.name == name {
			return errors.New("gnomes: series " + name + " is already published")
		}
	}
	if (len(catalogue) == 0) != (name == genesisName) {
		return errors.New("gnomes: the genesis first, and once")
	}
	if data == "" {
		return errors.New("gnomes: a series has rows")
	}
	first := lastID() + 1
	next := first
	var count [len(tiers)]int64
	for start := 0; start <= len(data); {
		end := lineEnd(data, start)
		g, err := parseRow(data[start:end])
		if err != nil {
			return errors.New(err.Error() + ", row " + itoa(next))
		}
		if g.id != next {
			return errors.New("gnomes: row " + itoa(g.id) + " where " + itoa(next) + " was due")
		}
		count[g.tier]++
		next++
		if next-first > maxSeriesRows {
			return errors.New("gnomes: a series has at most 1000 rows")
		}
		start = end + 1
	}
	if name == genesisName {
		for i, tr := range tiers {
			if count[i] != genesisSupply[i] {
				return errors.New("gnomes: the genesis has " + itoa(count[i]) + " " + tr.name +
					", the config says " + itoa(genesisSupply[i]))
			}
		}
	}
	catalogue = append(catalogue, series{name: name, first: first, last: next - 1, rows: data})
	return nil
}

// lastID is the id of the catalogue's last gnome, 0 before the genesis.
func lastID() int64 {
	if len(catalogue) == 0 {
		return 0
	}
	return catalogue[len(catalogue)-1].last
}

// gnomeAt returns gnome id from the catalogue, false when there is none.
func gnomeAt(id int64) (gnome, bool) {
	si := seriesAt(id)
	if si < 0 {
		return gnome{}, false
	}
	s := catalogue[si]
	g, err := parseRow(rowOf(s.rows, id))
	if err != nil {
		return gnome{}, false
	}
	g.series = s.name
	return g, true
}

// seriesAt returns the index of the series gnome id is in, -1 when none.
func seriesAt(id int64) int {
	for i, s := range catalogue {
		if id >= s.first && id <= s.last {
			return i
		}
	}
	return -1
}

func validSlug(s string) bool {
	if s == "" || len(s) > maxSeriesName {
		return false
	}
	for i := 0; i < len(s); i++ {
		c := s[i]
		if !(c >= 'a' && c <= 'z' || c >= '0' && c <= '9' || c == '-') {
			return false
		}
	}
	return true
}
