package gnomes

import (
	"errors"

	"gno.land/p/nt/grc721/v0"
)

// The GRC721 surface, what wallets and marketplaces call. Transfers and
// approvals go through the caller-scoped teller, which acts as
// cur.Previous() with the ledger's checks: a caller moves their own gnomes
// and the ones they were approved for, nothing else.

func TransferFrom(cur realm, from, to address, tid string) {
	if err := teller.TransferFrom(0, cur, from, to, grc721.TokenID(tid)); err != nil {
		panic(err)
	}
}

// Approve lets to move tid once; an earned gnome is refused, so no market
// lists it.
func Approve(cur realm, to address, tid string) {
	if isEarned(parseID(tid)) {
		panic(errBound)
	}
	if err := teller.Approve(0, cur, to, grc721.TokenID(tid)); err != nil {
		panic(err)
	}
}

// SetApprovalForAll lets operator move every gnome of the caller's; an
// earned one still refuses to move (holdings.gno).
func SetApprovalForAll(cur realm, operator address, approved bool) {
	if err := teller.SetApprovalForAll(0, cur, operator, approved); err != nil {
		panic(err)
	}
}

func Name() string                          { return Token.GetName() }
func Symbol() string                        { return Token.GetSymbol() }
func OwnerOf(tid string) (address, error)   { return Token.OwnerOf(grc721.TokenID(tid)) }
func BalanceOf(addr address) (int64, error) { return Token.BalanceOf(addr) }
func TotalSupply() int64                    { return Token.TotalSupply() }

func GetApproved(tid string) (address, error) { return Token.GetApproved(grc721.TokenID(tid)) }

func IsApprovedForAll(owner, operator address) bool {
	return Token.IsApprovedForAll(owner, operator)
}

// TokenOfOwnerByIndex is owner's i-th token in id order, from the locker's
// index (there is no TokenByIndex: no list of every token is kept).
func TokenOfOwnerByIndex(owner address, i int64) (string, error) {
	if i >= 0 {
		if ids, _ := heldPage(owner, i, 1); len(ids) == 1 {
			return itoa(ids[0]), nil
		}
	}
	return "", errors.New("gnomes: no such index")
}

// RoyaltyInfo returns who receives the royalty on a resale of tid at
// salePrice, and how much (EIP-2981: advisory, a marketplace pays it), in
// royalty/v0's shape.
func RoyaltyInfo(tid string, salePrice int64) (address, int64, error) {
	return Royalties.RoyaltyInfo(grc721.TokenID(tid), salePrice)
}
