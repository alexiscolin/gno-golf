// /build's two decisions, before anything of the editor loads (the GUI
// spec's B0): whether the Builder is out at all (NEXT_PUBLIC_BUILDER), and
// whether this is a computer (the editor) or a phone, a touch screen or a
// window under 900 px (one screen: the Builder is for a computer, and holes
// to play; neither the editor nor builder.wasm is downloaded).

/** A phone, a touch screen or under 900 px. */
export const PHONE_QUERY = "(max-width: 899px), (pointer: coarse)";

/** Whether the Builder is out on this build. */
export const builderOn = (flag: string | undefined = process.env.NEXT_PUBLIC_BUILDER) => flag === "1";

/** Whether the editor may load: nothing PHONE_QUERY matches (matches: the window's matchMedia). */
export const onComputer = (matches: (query: string) => boolean) => !matches(PHONE_QUERY);
