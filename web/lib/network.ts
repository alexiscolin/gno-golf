// Which deployment this build is, and where the other one is: one code, two
// sites (Netlify env). The testnet plays with free faucet GNOT; mainnet's GNOT
// is real (the faucet hub drips a little of it).
export const NETWORK: "testnet" | "mainnet" = process.env.NEXT_PUBLIC_NETWORK === "mainnet" ? "mainnet" : "testnet";
/** Where a testnet's players get free GNOT (NEXT_PUBLIC_FAUCET). */
export const FAUCET = process.env.NEXT_PUBLIC_FAUCET || "https://faucet.gno.land";
/** Where mainnet players get GNOT (NEXT_PUBLIC_GNOT_URL): the faucet hub's small drip by default. */
export const GNOT_URL = process.env.NEXT_PUBLIC_GNOT_URL || FAUCET;
/** The other deployment's address ("" when there is none yet). */
export const OTHER_URL = process.env.NEXT_PUBLIC_OTHER_URL || "";

/** What the page is playing on, from its RPC: a node on this machine, or this build's network. */
export const networkOf = (rpc: string): "local" | "testnet" | "mainnet" => (/\/\/(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(rpc) ? "local" : NETWORK);
