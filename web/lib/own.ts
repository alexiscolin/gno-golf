// A table's entry for a key from the chain (a skin is any string a hole's
// author wrote): its own keys only. table[skin] would also answer
// "constructor" or "toString" with Object.prototype's, and draw with that.
export const own = <T>(table: Readonly<Record<string, T>>, key: string): T | undefined => (Object.hasOwn(table, key) ? table[key] : undefined);
