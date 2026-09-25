// Registers the garden holes with the golf hub, in one transaction. Run it
// once after a fresh chain (gnodev without its old state): a hole cannot
// register from init(), there is no `cur` there.
package main

import (
	"gno.land/r/gnogolf/hole1"
	"gno.land/r/gnogolf/hole2"
	"gno.land/r/gnogolf/hole3"
	"gno.land/r/gnogolf/hole4"
	"gno.land/r/gnogolf/hole5"
	"gno.land/r/gnogolf/hole6"
	"gno.land/r/gnogolf/hole7"
	"gno.land/r/gnogolf/hole8"
	"gno.land/r/gnogolf/hole9"
	"gno.land/r/gnogolf/hole10"
	"gno.land/r/gnogolf/hole11"
	"gno.land/r/gnogolf/hole12"
	"gno.land/r/gnogolf/hole13"
	"gno.land/r/gnogolf/hole14"
	"gno.land/r/gnogolf/hole15"
	"gno.land/r/gnogolf/hole16"
	"gno.land/r/gnogolf/hole17"
	"gno.land/r/gnogolf/hole18"
	"gno.land/r/gnogolf/hole19"
	"gno.land/r/gnogolf/hole20"
)

func main(cur realm) {
	hole1.Register(cross(cur))
	hole2.Register(cross(cur))
	hole3.Register(cross(cur))
	hole4.Register(cross(cur))
	hole5.Register(cross(cur))
	hole6.Register(cross(cur))
	hole7.Register(cross(cur))
	hole8.Register(cross(cur))
	hole9.Register(cross(cur))
	hole10.Register(cross(cur))
	hole11.Register(cross(cur))
	hole12.Register(cross(cur))
	hole13.Register(cross(cur))
	hole14.Register(cross(cur))
	hole15.Register(cross(cur))
	hole16.Register(cross(cur))
	hole17.Register(cross(cur))
	hole18.Register(cross(cur))
	hole19.Register(cross(cur))
	hole20.Register(cross(cur))
}
