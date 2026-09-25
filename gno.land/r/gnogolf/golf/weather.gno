package golf

import (
	"strconv"
	"time"

	"gno.land/p/gnogolf/course"
	"gno.land/p/nt/ufmt/v0"
)

// The weather of the moment. It changes every five minutes of chain time,
// differs from hole to hole, and is the same for everyone: course.ForecastFor
// hashes (hole, period) into the world's climate. Nobody chooses it — a round
// is played in the weather of the period it started in, and a recorded round
// says which that was, so anyone can replay it.

// PeriodSeconds is how long one weather lasts.
const PeriodSeconds = 5 * 60

// Period is the weather period of the chain's current block time.
func Period() int64 { return time.Now().Unix() / PeriodSeconds }

// weatherOf is the hole's weather in a period: seeded by its id, so each
// version of a slot has weather of its own.
func weatherOf(e *entry, h course.Hole, period int64) course.Forecast {
	return course.ForecastFor(e.id, e.world, h, period)
}

// forecastJSON is a forecast as an object, head its first fields if any
// (as `"version":1,`). A weather zone's air and capped are not printed: the
// wind is always both, and no other weather zone is either.
func forecastJSON(head string, f course.Forecast) string {
	return "{" + head + `"period":` + strconv.FormatInt(f.Period, 10) + `,"kind":` + jstr(f.Kind) +
		`,"wind":` + jvec(f.Wind) + `,"zones":` + zonesJSON(f.Zones, false) + "}"
}

// Weather is a hole's weather in a period, as the zones a client draws and
// the chain plays under. Read-only.
func Weather(hole string, period int64) string {
	notAhead(period)
	e := readHole(hole)
	return forecastJSON(versionJSON+",", weatherOf(e, e.hole(), period))
}

// notAhead refuses a period still to come: the hub does not serve the
// weather ahead. It is no secret (course.ForecastFor is a pure function
// anyone can run), so this only keeps the reads to the weather a round can
// be played in.
func notAhead(period int64) {
	if period > Period() {
		panic("golf: that weather has not come yet")
	}
}

// playablePeriod checks the period a round is recorded under: the current
// one, or the one just gone — a round that ran over the turn of the period is
// recorded in the weather it was played in, and no older. stroke holds every
// later stroke of a round to the same rule.
func playablePeriod(period int64) {
	now := Period()
	if period != now && period != now-1 {
		panic(ufmt.Sprintf("golf: period %d is not the current weather (%d) or the one before", period, now))
	}
}
