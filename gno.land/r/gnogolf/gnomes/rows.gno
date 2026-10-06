package gnomes

import (
	"errors"
	"strconv"
	"strings"
)

// A series' rows are read in place. Its ids follow on with no gap, so the
// row of an id is found by bisection on the string's offsets: from any
// offset, its line starts at most a line back. About ten steps for the
// genesis, where walking it from the top would read every line.

// rowOf returns the line of gnome id in rows, "" when there is none.
func rowOf(rows string, id int64) string {
	lo, hi := 0, len(rows)
	for lo < hi {
		mid := lo + (hi-lo)/2
		start := lineStart(rows, mid)
		end := lineEnd(rows, start)
		at := idOf(rows[start:end])
		switch {
		case at == id:
			return rows[start:end]
		case at < id:
			lo = end + 1
		default:
			hi = start
		}
	}
	return ""
}

// lineStart is the first byte of the line containing offset i.
func lineStart(rows string, i int) int {
	return strings.LastIndexByte(rows[:i], '\n') + 1
}

// lineEnd is the offset of the newline ending the line starting at start,
// or len(rows) for the last line.
func lineEnd(rows string, start int) int {
	if n := strings.IndexByte(rows[start:], '\n'); n >= 0 {
		return start + n
	}
	return len(rows)
}

// idOf reads the id at the start of a row, 0 when there is none.
func idOf(row string) int64 {
	n := strings.IndexByte(row, '|')
	if n < 0 {
		return 0
	}
	id, err := strconv.ParseInt(row[:n], 10, 64)
	if err != nil {
		return 0
	}
	return id
}

// parseRow reads "id|tier|name|traits", checking every field.
func parseRow(row string) (gnome, error) {
	f := strings.Split(row, "|")
	if len(f) != 4 {
		return gnome{}, errors.New("gnomes: a row is id|tier|name|traits")
	}
	id := idOf(row)
	if id < 1 || f[0] != itoa(id) {
		return gnome{}, errors.New("gnomes: a row starts with its id")
	}
	ti := tierAt(f[1])
	if ti < 0 {
		return gnome{}, errors.New("gnomes: unknown tier " + f[1])
	}
	if !printable(f[2], maxGnomeName) {
		return gnome{}, errors.New("gnomes: a name is 1 to 48 printable bytes")
	}
	if !printable(f[3], maxTraits) {
		return gnome{}, errors.New("gnomes: traits are 1 to 256 printable bytes")
	}
	return gnome{id: id, tier: ti, name: f[2], traits: f[3]}, nil
}

// printable: 1 to max bytes, none of them a control character.
func printable(s string, max int) bool {
	if s == "" || len(s) > max {
		return false
	}
	for i := 0; i < len(s); i++ {
		if s[i] < 0x20 || s[i] == 0x7f {
			return false
		}
	}
	return true
}
