// PKGPATH: gno.land/r/test/setterevents
package setterevents

import (
	"strconv"
	"strings"
	"testing"
	"time"

	gnomes "gno.land/r/gnogolf/gnomes"
)

// The owner's setters emit the events the spec lists for an indexer to
// follow, named as it names them and with the new value: here the closing
// date's, a wave added then withdrawn, the site's, and the earned gnomes'
// switch.
func main(cur realm) {
	testing.SetRealm(testing.NewUserRealm(gnomes.Owner()))
	gnomes.AddSeries(cross(cur), "genesis", genesis())
	gnomes.SetCloseAt(cross(cur), 4102444800)
	gnomes.AddWave(cross(cur), 1, 104, time.Now().Unix()+3600, 0)
	gnomes.CancelWave(cross(cur), 1)
	gnomes.SetSiteURL(cross(cur), "https://gnogolf.xyz/")
	gnomes.SetEarnedOpen(cross(cur), false)
}

// genesis is the genesis's 720 rows, each tier's in a run.
func genesis() string {
	var b strings.Builder
	id := 1
	for _, t := range []struct {
		name string
		n    int
	}{{"common", 504}, {"rare", 144}, {"epic", 65}, {"legendary", 7}} {
		for i := 0; i < t.n; i++ {
			s := strconv.Itoa(id)
			b.WriteString(s + "|" + t.name + "|Pip " + s + "|01" + strings.Repeat("0", 56-len(s)) + s + "\n")
			id++
		}
	}
	return strings.TrimSuffix(b.String(), "\n")
}

// Events:
// [
//   {
//     "type": "SeriesAdded",
//     "attrs": [
//       {
//         "key": "series",
//         "value": "genesis"
//       },
//       {
//         "key": "first",
//         "value": "1"
//       },
//       {
//         "key": "last",
//         "value": "720"
//       }
//     ],
//     "pkg_path": "gno.land/r/gnogolf/gnomes"
//   },
//   {
//     "type": "CloseAtSet",
//     "attrs": [
//       {
//         "key": "at",
//         "value": "4102444800"
//       }
//     ],
//     "pkg_path": "gno.land/r/gnogolf/gnomes"
//   },
//   {
//     "type": "WaveAdded",
//     "attrs": [
//       {
//         "key": "first",
//         "value": "1"
//       },
//       {
//         "key": "last",
//         "value": "104"
//       },
//       {
//         "key": "start",
//         "value": "1234571490"
//       },
//       {
//         "key": "playersUntil",
//         "value": "1234571490"
//       }
//     ],
//     "pkg_path": "gno.land/r/gnogolf/gnomes"
//   },
//   {
//     "type": "WaveCancelled",
//     "attrs": [
//       {
//         "key": "first",
//         "value": "1"
//       },
//       {
//         "key": "last",
//         "value": "104"
//       },
//       {
//         "key": "start",
//         "value": "1234571490"
//       }
//     ],
//     "pkg_path": "gno.land/r/gnogolf/gnomes"
//   },
//   {
//     "type": "SiteURLSet",
//     "attrs": [
//       {
//         "key": "url",
//         "value": "https://gnogolf.xyz/"
//       }
//     ],
//     "pkg_path": "gno.land/r/gnogolf/gnomes"
//   },
//   {
//     "type": "EarnedOpen",
//     "attrs": [
//       {
//         "key": "open",
//         "value": "false"
//       }
//     ],
//     "pkg_path": "gno.land/r/gnogolf/gnomes"
//   }
// ]
