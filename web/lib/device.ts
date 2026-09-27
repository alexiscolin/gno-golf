// What the device says of itself (its media queries): false where there is no
// window to ask (the build, the tests).
const says = (q: string) => typeof matchMedia !== "undefined" && matchMedia(q).matches;

/** A finger, not a mouse: the device's main pointer is coarse. */
export const isTouch = () => says("(pointer: coarse)");
/** The player asked their system for less motion. */
export const reducedMotion = () => says("(prefers-reduced-motion: reduce)");
