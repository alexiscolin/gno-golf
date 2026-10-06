// The collection's wardrobe, as makeBall takes it (gnome.ts Wardrobe): its
// hats, patterned bodies, small things, Rares' pieces, Epics' props, matter
// and Legendaries' pieces, and where a headlamp clips on all of them. A chunk
// of its own, loaded only where a collection gnome is drawn (loadWardrobe):
// the title, the holes' pages and GNOMES' fourteen never fetch it. On import
// it gives itself to makeBall.
import * as THREE from "three";
import { setWardrobe, type Skin, type Wardrobe } from "./gnome";
import { isKitHat, kitHat, kitWear, kitPiece, hatTop, patternedBody, type KitHat } from "./gnome-kit";
import { propOf } from "./gnome-props";
import { dressMatter } from "./gnome-matter";
import { dressLegend } from "./gnome-legend";

/** The collection's traits onto a gnome makeBall has built: his small things,
 *  a Rare's piece, an Epic's prop, a Legendary's piece, then his material
 *  over all of it. Returns what moves. */
function dress(g: THREE.Group, hat: THREE.Group, skin: Skin, body: THREE.Mesh, beard: THREE.Group) {
  kitWear(g, hat, skin);
  kitPiece(g, hat, skin);
  const prop = propOf(skin);
  if (prop) {
    if (prop.at === "top") prop.group.position.y = hatTop(skin);
    (prop.at === "body" ? g : hat).add(prop.group);
  }
  const ticks = [dressLegend(g, hat, skin)];
  if (skin.material) {
    // the solids (not their ink) of a part: the hat's in the hat's colour, all of the beard
    const solids = (o: THREE.Object3D, keep: (m: THREE.MeshToonMaterial) => boolean) => {
      const out: THREE.Mesh[] = [];
      o.traverse((m) => m instanceof THREE.Mesh && m.material instanceof THREE.MeshToonMaterial && m.material.side !== THREE.BackSide && keep(m.material) && out.push(m as THREE.Mesh));
      return out;
    };
    const inProp = (m: THREE.Object3D) => !!prop && !!prop.group.getObjectById(m.id);
    ticks.push(dressMatter(g, skin, { body, hat: solids(hat, (m) => m.color.getHex() === skin.hat).filter((m) => !inProp(m)), beard: solids(beard, () => true), prop: prop ? prop.matter : [] }));
  }
  return ticks.filter((f): f is (t: number) => void => !!f);
}

/**
 * Where a lamp clips on a collection gnome: found, not guessed, his hats and
 * pieces being many. A ray from in front along the hat's centre line, from
 * just over the brim (over the brow and what he wears there) up, onto the
 * first surface that faces forward within the crown's width (a brim's edge
 * is wider: higher then): the hat, or what lies on its front (a band, a
 * badge). In the body's space, the lamp's centre just off the surface; null
 * when none is found.
 */
function lamp(g: THREE.Group, hat: THREE.Group) {
  const solids: THREE.Mesh[] = [];
  g.updateMatrixWorld(true);
  g.traverse((o) => void (o instanceof THREE.Mesh && (o.material as THREE.Material).side !== THREE.BackSide && solids.push(o as THREE.Mesh)));
  const back = hat.matrix.clone().invert(), dir = new THREE.Vector3(0, 0, -1).applyQuaternion(hat.quaternion), ray = new THREE.Raycaster();
  for (let y = -0.12; y <= 0.4; y += 0.02) {
    ray.set(new THREE.Vector3(0, y, 1.5).applyMatrix4(hat.matrix), dir);
    const hit = ray.intersectObjects(solids, false)[0];
    if (!hit || !hit.face) continue;
    const z = hit.point.clone().applyMatrix4(back).z, n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
    if (z < 0.12 || z > 0.5 || -n.dot(dir) < 0.5) continue;
    return hit.point.addScaledVector(n, 0.05);
  }
  return null;
}

export const wardrobe: Wardrobe = {
  body: patternedBody,
  hat: (hat, skin) => isKitHat(skin.shape) && (kitHat(hat, skin as Skin & { shape: KitHat }), true),
  top: hatTop,
  dress,
  lamp,
};
setWardrobe(wardrobe);
