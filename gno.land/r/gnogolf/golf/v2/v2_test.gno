package golf

import (
	"strings"
	"testing"

	"gno.land/p/nt/uassert/v0"
)

// Reads for the tests: a view's value ("" if none), a standing (nil if none).
func get(v view, k string) string {
	x, _ := v.Get(k)
	return x
}

func rowFor(m int, p string) *row {
	x, ok := totals[m].Get(p)
	if !ok {
		return nil
	}
	return decodeRow(x)
}

// saved sends a test's own writes to store, as these rules (a call's writes go
// when it returns; a test that writes by hand sends its own)
func saved(cur realm) {
	testing.SetRealm(testing.NewCodeRealm(self))
	flush(cur)
}

// A row reads back field for field whatever its fields hold (a ":", digits, a
// newline: a name or note), and a row not as join writes it is refused.
func TestARowReadsBackByItsLengths(cur realm, t *testing.T) {
	e := newEntry("garden/1/v1", "12:3 \"odd\"\n", 3, "garden", 1.5)
	e.note, e.out = "a:b", &draining{from: [modes]string{"g1x", ""}, done: [modes]bool{true, false}}
	back := decodeEntry(encodeEntry(e))
	uassert.Equal(t, e.name, back.name)
	uassert.Equal(t, "a:b", back.note)
	uassert.Equal(t, 1.5, back.order)
	uassert.Equal(t, "g1x", back.out.from[assisted])
	uassert.True(t, back.out.done[assisted] && !back.out.done[pro])
	uassert.Equal(t, "1:11:a2:bc", join("a", "bc"))
	uassert.Equal(t, "a|bc", strings.Join(fields(join("a", "bc"), "row", 2), "|"))
	for _, bad := range []string{"", "1:1", "1:11:a", "1:11:a2:b", "1:11:a2:bc9:", "1:11:a2:bcx", "x:11:a2:bc", "1:21:a2:bc", "1:11:a2:bc1:d", "1:11:a99999999:x"} {
		uassert.PanicsContains(t, cur, "not as golf keeps it", func() { fields(bad, "row", 2) }, bad)
	}
}

// A view's walks, forward and back, bounded or not, read store's rows with
// this call's writes merged in as they stand (a set, a change, a removal),
// across store's pages (more rows than a first page); and the same once sent.
func TestAViewWalksStoreWithTheCallsWrites(cur realm, t *testing.T) {
	v := view{"meta", "wt "}
	begin()
	for i := 0; i <= 20; i++ {
		v.Set(pad(i, 2), itoa(i))
	}
	saved(cur)
	begin()
	v.Set("05", "x")
	v.Remove("07")
	v.Set("25", "new")
	walk := func(back bool, start, end string) string {
		s := ""
		cb := func(k, x string) bool { s += k + "=" + x + " "; return false }
		if back {
			v.ReverseIterate(start, end, cb)
		} else {
			v.Iterate(start, end, cb)
		}
		return s
	}
	var all []string
	for i := 0; i <= 20; i++ {
		switch i {
		case 5:
			all = append(all, "05=x")
		case 7:
		default:
			all = append(all, pad(i, 2)+"="+itoa(i))
		}
	}
	all = append(all, "25=new")
	fwd := strings.Join(all, " ") + " "
	rev := ""
	for i := len(all) - 1; i >= 0; i-- {
		rev += all[i] + " "
	}
	for _, sent := range []bool{false, true} {
		uassert.Equal(t, fwd, walk(false, "", ""), "forward")
		uassert.Equal(t, rev, walk(true, "", ""), "back")
		uassert.Equal(t, "03=3 04=4 05=x 06=6 08=8 09=9 ", walk(false, "03", "10"), "forward, [start, end)")
		uassert.Equal(t, "10=10 09=9 08=8 06=6 05=x 04=4 03=3 ", walk(true, "03", "10"), "back, end kept")
		if !sent {
			uassert.PanicsContains(t, cur, "after writing to it", func() { v.IterateByOffset(0, 3, func(_, _ string) bool { return false }) })
			saved(cur)
		}
	}
	n := 0
	v.IterateByOffset(2, 3, func(k, _ string) bool { n++; return false })
	uassert.Equal(t, 3, n, "by place, once sent")
	begin()
	for i := 0; i <= 25; i++ {
		v.Remove(pad(i, 2))
	}
	saved(cur)
	uassert.Equal(t, "", walk(false, "", ""))
}
