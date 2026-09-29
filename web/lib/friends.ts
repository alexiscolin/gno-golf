// Friends: addresses (or gno.land names, resolved once) kept in this browser;
// one added by its address alone (a friend link, a dare) takes its name once found (nameFriends).
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
    return Array.isArray(f) ? f.filter((x: unknown): x is Friend => !!x && typeof x === "object" && "addr" in x && isAddress(x.addr) && (!("name" in x) || typeof x.name === "string")) : [];
  } catch {
    return [];
  }
};
export const saveFriends = (all: Friend[]) => {
  const f = all.slice(-49); // (the latest kept: one added now is never the one dropped)
  try {
    localStorage.setItem(FRIENDS, JSON.stringify(f));
  } catch {}
  return f;
};
export function addFriend(addr: string, name = "") {
  const f = loadFriends();
  if (!isAddress(addr) || f.some((x) => x.addr === addr)) return f;
  return saveFriends([...f, { addr, name }]);
}
/** The names found for friends kept by their address alone (names: by address, "" for none), kept with them. */
export function nameFriends(names: Readonly<Record<string, string>>) {
  const f = loadFriends(), found = (x: Friend) => !x.name && !!names[x.addr];
  return f.some(found) ? saveFriends(f.map((x) => (found(x) ? { ...x, name: names[x.addr] } : x))) : f;
}
