// Friends: addresses (or gno.land names, resolved once) kept in this browser.
import { isAddress } from "./chain";

const FRIENDS = "gnogolf.friends";
/** A friend: an address, and the gno.land name it was added by ("" for none). */
interface Friend {
  addr: string;
  name: string;
}
export const loadFriends = (): Friend[] => {
  try {
    const f: unknown = JSON.parse(localStorage.getItem(FRIENDS) || "[]");
    return Array.isArray(f) ? f.filter((x: unknown): x is Friend => !!x && typeof x === "object" && "addr" in x && isAddress(x.addr)) : [];
  } catch {
    return [];
  }
};
export const saveFriends = (f: Friend[]) => {
  try {
    localStorage.setItem(FRIENDS, JSON.stringify(f.slice(0, 49)));
  } catch {}
  return f;
};
export function addFriend(addr: string, name = "") {
  const f = loadFriends();
  if (!isAddress(addr) || f.some((x) => x.addr === addr)) return f;
  return saveFriends([...f, { addr, name }]);
}
