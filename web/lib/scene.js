// Building the diorama.
//
// Flat-shaded volumes with dark contours, no gradients, no cast shadows: depth
// comes from the contrast between faces, the way a flat illustration does it.
// Everything here is built from the hole's own geometry — this file knows the
// shapes, never the rules.
//
// The pieces live under scene/; this file is the public face engine.js and
// the picker import.

export { motion, setTime, at, disposeCourse, quality } from "./scene/materials.js";
export { maxDpr, makeRenderer, makeScene, setLighting, courseBox, applyRig, overviewRig, farRig, ORBIT, focusRig } from "./scene/camera.js";
export { buildHole, finishHole, buildExtras } from "./scene/course.js";
export { GNOMES, gnomeById, makeBall, makePreview } from "./scene/gnome.js";
export { makeSplash, makeConfetti, makeBand, bandTo, makeAim, aimAlong } from "./scene/fx.js";
