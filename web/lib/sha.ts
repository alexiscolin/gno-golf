// SHA-256 as lowercase hex, of bytes or of a string's UTF-8: a wasm build's
// sources, a hole's data (the realm's own Versions "sha"), a verdict's key.
const hexOf = (b: ArrayBuffer) => Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, "0")).join("");

export async function sha256(data: Uint8Array<ArrayBuffer> | string): Promise<string> {
  return hexOf(await crypto.subtle.digest("SHA-256", typeof data === "string" ? new TextEncoder().encode(data) : data));
}

/** Bytes from hex ("00ff"): what a hole's data is, as HoleData gives it. */
export const bytesOf = (hex: string): Uint8Array<ArrayBuffer> => Uint8Array.from(hex.match(/../g) ?? [], (b) => parseInt(b, 16));
