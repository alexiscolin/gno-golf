// An image (or any read) that failed, asked again: after how long, or never.
// The playground's site restarting, a phone's network gone a moment: a
// gallery's thumbnails come back instead of staying broken icons.

/** How long before try number tries + 1 (tries: the ones failed so far, from 0): later each time, null once max are spent. */
export const retryIn = (tries: number, max = 2, base = 1500): number | null => (tries < max ? base * (tries + 1) : null);
