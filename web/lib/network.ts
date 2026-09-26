// Which deployment this build is, and where the other one is: one code, two
// sites (Netlify env). The testnet plays for free with faucet GNOT; mainnet's
// GNOT is real and it has no faucet.
export const NETWORK: "testnet" | "mainnet" = process.env.NEXT_PUBLIC_NETWORK === "mainnet" ? "mainnet" : "testnet";
/** The other deployment's address ("" when there is none yet). */
export const OTHER_URL = process.env.NEXT_PUBLIC_OTHER_URL || "";

/** What the page is playing on, from its RPC: a node on this machine, or this build's network. */
export const networkOf = (rpc: string): "local" | "testnet" | "mainnet" => (/\/\/(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(rpc) ? "local" : NETWORK);
