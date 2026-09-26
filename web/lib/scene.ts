// Building the diorama.
//
// Flat-shaded volumes with dark contours, no gradients, no cast shadows: depth
// comes from the contrast between faces, the way a flat illustration does it.
// Everything here is built from the hole's own geometry — this file knows the
// shapes, never the rules.
//
// The pieces live under scene/; this file is the public face engine.ts and
// the picker import.

export { motion, setTime, at, disposeCourse, quality } from "./scene/materials";
export { maxDpr, makeRenderer, makeScene, setLighting, courseBox, laneBox, applyRig, overviewRig, farRig, ORBIT, focusRig } from "./scene/camera";
export { buildHole, finishHole, buildExtras } from "./scene/course";
export { GNOMES, gnomeById, makeBall, makePreview } from "./scene/gnome";
export { makeSplash, makeConfetti, cheer, makeBand, bandTo, makeAim, aimAlong } from "./scene/fx";
