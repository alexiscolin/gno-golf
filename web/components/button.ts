// A button's look, by its variant and size (Button, components/ui.tsx), as
// class names: a link that looks like a button takes the same (buttonClass), a
// server page's too (no client code here). Their look is in globals.css under
// "shared controls".

/** variant: "primary" (green), "secondary" (paper), "gold" (the front's call to action: a duel's Race), "chain" (the
 *  one action that goes to the chain: Adena's blue), "chip" (a HUD card that is a button), "icon" (round, an icon or a
 *  sign in it: as wide as it is high). size: "l" (a screen's, the default), "m" (a toolbar's), "s" (a small one beside
 *  what it acts on): one height each, whatever is inside, so a row of one size lines up. */
const VARIANTS = { primary: "btn--main", secondary: "btn--ghost", gold: "btn--gold", chain: "btn--save", chip: "btn--chip", icon: "btn--ghost btn--icon" };
const SIZES = { l: "", m: "btn--m", s: "btn--s" };
export type ButtonLook = { variant?: keyof typeof VARIANTS; size?: keyof typeof SIZES };
/** A button's classes, its own after them (className). */
export const buttonClass = ({ variant = "secondary", size = "l" }: ButtonLook, className = "") => ["btn", VARIANTS[variant], SIZES[size], className].filter(Boolean).join(" ");
