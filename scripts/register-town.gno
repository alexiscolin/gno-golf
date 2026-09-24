// Registers the town holes with the golf hub, in one transaction. Run it
// once after a fresh chain (gnodev without its old state): a hole cannot
// register from init(), there is no `cur` there.
package main

import (
	"gno.land/r/gnogolf/town1"
	"gno.land/r/gnogolf/town2"
	"gno.land/r/gnogolf/town3"
	"gno.land/r/gnogolf/town4"
	"gno.land/r/gnogolf/town5"
	"gno.land/r/gnogolf/town6"
	"gno.land/r/gnogolf/town7"
	"gno.land/r/gnogolf/town8"
	"gno.land/r/gnogolf/town9"
	"gno.land/r/gnogolf/town10"
	"gno.land/r/gnogolf/town11"
	"gno.land/r/gnogolf/town12"
	"gno.land/r/gnogolf/town13"
	"gno.land/r/gnogolf/town14"
	"gno.land/r/gnogolf/town15"
	"gno.land/r/gnogolf/town16"
	"gno.land/r/gnogolf/town17"
	"gno.land/r/gnogolf/town18"
)

func main(cur realm) {
	town1.Register(cross(cur))
	town2.Register(cross(cur))
	town3.Register(cross(cur))
	town4.Register(cross(cur))
	town5.Register(cross(cur))
	town6.Register(cross(cur))
	town7.Register(cross(cur))
	town8.Register(cross(cur))
	town9.Register(cross(cur))
	town10.Register(cross(cur))
	town11.Register(cross(cur))
	town12.Register(cross(cur))
	town13.Register(cross(cur))
	town14.Register(cross(cur))
	town15.Register(cross(cur))
	town16.Register(cross(cur))
	town17.Register(cross(cur))
	town18.Register(cross(cur))
}
