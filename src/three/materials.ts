import * as THREE from 'three';
import { IS_MOBILE } from './scene';

/**
 * Shading pass over the .glb materials.
 *
 * glTF carries base colour, metalness and roughness and stops there, so every
 * surface arrives as the same dry plastic-or-metal lobe. What separates brass
 * from anodised aluminium from PBT is the second lobe — clearcoat, sheen,
 * transmission — and that is a handful of numbers per material, not geometry.
 * Cheaper than any amount of extra mesh detail and it survives a model rebuild,
 * because the lookup is by material name.
 *
 * ponytail: no textures anywhere. Real caps have a fine mould grain that a
 * noise roughnessMap would sell; add one when the board is shot in close-up.
 */

type Tweak = THREE.MeshPhysicalMaterialParameters;

const SHADING: Record<string, Tweak> = {
  // anodised aluminium: metal underneath, a thin matte skin on top
  KB_Mat_Case: { metalness: 0.86, roughness: 0.36, clearcoat: 0.18, clearcoatRoughness: 0.55 },

  // PBT. The sheen lobe is the powdery edge you get on moulded keycaps — it is
  // what stops them reading as painted resin.
  // sheen stays low: on a light cap it is a rim, and anything above ~0.15
  // lifts the whole face and the alphas go to paper white
  KB_Mat_Cap_Alpha: { roughness: 0.66, clearcoat: 0.16, clearcoatRoughness: 0.62, sheen: 0.14 },
  KB_Mat_Cap_Mod: { roughness: 0.68, clearcoat: 0.14, clearcoatRoughness: 0.65, sheen: 0.13 },
  KB_Mat_Cap_Esc: { roughness: 0.58, clearcoat: 0.22, clearcoatRoughness: 0.5, sheen: 0.12 },

  // nylon housing, POM stem — the stem is the slick one, and the one the
  // blue/red/brown swap recolours
  KB_Mat_SwitchLower: { roughness: 0.55, clearcoat: 0.1 },
  KB_Mat_Stem: { roughness: 0.32, clearcoat: 0.28, clearcoatRoughness: 0.3 },

  // polycarbonate top. Real transmission, so the stem colour actually shows
  // through the housing instead of being a lighter shade of grey.
  // ponytail: transmission costs one extra scene render per frame. It is on one
  // merged mesh and desktop-only; drop to `opacity` if the frame budget bites.
  KB_Mat_SwitchUpper: IS_MOBILE
    ? { roughness: 0.16, transparent: true, opacity: 0.86 }
    : { roughness: 0.14, transmission: 0.62, thickness: 0.5, ior: 1.52 },

  KB_Mat_Plate: { metalness: 1, roughness: 0.26, envMapIntensity: 1.35 },
  // solder mask is matte with a faint gloss, not the wet-look slab a high
  // clearcoat turns it into against a bright environment
  KB_Mat_PCB: {
    metalness: 0.08,
    roughness: 0.58,
    clearcoat: 0.12,
    clearcoatRoughness: 0.6,
    envMapIntensity: 0.7,
  },
  KB_Mat_Port: { metalness: 0.7, roughness: 0.5 },
};

/**
 * Swap every named material for a MeshPhysicalMaterial carrying its tweaks.
 *
 * Run this BEFORE mergeSwitches — the merge buckets geometry by material
 * identity, so swapping after would leave the merged meshes pointing at the
 * originals.
 */
export function shadeModel(root: THREE.Object3D): { shaded: number; unknown: string[] } {
  const swapped = new Map<THREE.Material, THREE.Material>();
  const unknown: string[] = [];

  const upgrade = (src: THREE.Material): THREE.Material => {
    const hit = swapped.get(src);
    if (hit) return hit;

    const tweak = SHADING[src.name];
    if (!tweak) {
      if (src.name) unknown.push(src.name);
      swapped.set(src, src);
      return src;
    }

    const std = src as THREE.MeshStandardMaterial;
    const next = new THREE.MeshPhysicalMaterial({
      color: std.color?.clone(),
      metalness: std.metalness ?? 0,
      roughness: std.roughness ?? 0.5,
      ...tweak,
    });
    next.name = src.name;
    swapped.set(src, next);
    src.dispose();
    return next;
  };

  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.material = Array.isArray(mesh.material)
      ? mesh.material.map(upgrade)
      : upgrade(mesh.material);
  });

  return { shaded: swapped.size, unknown: [...new Set(unknown)] };
}

/** Find one material by its Blender name — the swap and the callouts need it. */
export function findMaterial(root: THREE.Object3D, name: string): THREE.Material | null {
  let found: THREE.Material | null = null;
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (found || !mesh.isMesh) return;
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (m.name === name) found = m;
    }
  });
  return found;
}
