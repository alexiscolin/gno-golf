// The collection's wardrobe, as makeBall takes it (gnome.ts Wardrobe): its
// hats and small things (gnome-kit.ts), the Epics' props (gnome-props.ts), the
// materials (gnome-matter.ts) and the Legendaries' pieces (gnome-legend.ts).
// Its own chunk, loaded by loadWardrobe() where a collection gnome is first
// shown: the title screen and the holes' pages, which draw only GNOMES', never
// carry it. Importing this module puts it on (wear).
import * as THREE from "three";
import { wear, type Skin } from "./gnome";
import { isKitHat, kitHat, kitLamp, kitWear, kitPiece, hatTop, patternedBody, type KitHat } from "./gnome-kit";
import { propOf } from "./gnome-props";
import { dressMatter } from "./gnome-matter";
import { dressLegend } from "./gnome-legend";

/** The collection's traits onto a gnome makeBall has built (none of them on
 *  GNOMES' fourteen): his small things, a Rare's piece, an Epic's prop, a
 *  Legendary's piece, then his material over all of it. Returns what moves. */
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

wear({
  hat: (hat, skin) => (isKitHat(skin.shape) ? (kitHat(hat, skin as Skin & { shape: KitHat }), true) : false),
  lamp: (skin) => (isKitHat(skin.shape) ? kitLamp(skin.shape) : null),
  top: (skin) => (isKitHat(skin.shape) ? hatTop(skin) : null),
  body: (skin) => (skin.pattern ? patternedBody(skin) : null),
  dress,
});
