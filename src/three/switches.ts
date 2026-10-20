import * as THREE from 'three';
import { animate } from 'animejs';
import { SWITCHES } from '../content';
import type { SwitchSpec } from '../content';
import { findMaterial } from './materials';
import type { Interactions } from './interactions';

/**
 * Blue / red / brown.
 *
 * On a real board the three differ by one moulded part: the stem. Housing,
 * plate cutout and keycap are identical. So the swap is a colour tween on one
 * material — no second mesh, no second draw call, nothing to load — plus the
 * bottom-out easing, which is the part you can actually feel.
 */
export interface SwitchSwap {
  readonly current: SwitchSpec;
  select(id: SwitchSpec['id']): void;
}

export function createSwitchSwap(
  root: THREE.Object3D,
  interactions: Interactions,
  onChange?: (spec: SwitchSpec) => void,
): SwitchSwap {
  const stem = findMaterial(root, 'KB_Mat_Stem') as THREE.MeshStandardMaterial | null;
  let current = SWITCHES[0];

  const select = (id: SwitchSpec['id']) => {
    const spec = SWITCHES.find((s) => s.id === id);
    if (!spec || spec === current) return;
    current = spec;

    if (stem) {
      // THREE.Color converts sRGB hex into the working space on construction,
      // so the tween runs on the same numbers the shader reads.
      const to = new THREE.Color(spec.hex);
      animate(stem.color, { r: to.r, g: to.g, b: to.b, duration: 460, ease: 'outQuart' });
    }
    interactions.cfg.pressEase = spec.ease;
    interactions.cfg.pressDrop = spec.drop;
    interactions.press(); // let the new feel demonstrate itself
    onChange?.(spec);
  };

  if (stem) stem.color.setHex(current.hex);
  interactions.cfg.pressEase = current.ease;
  interactions.cfg.pressDrop = current.drop;

  return {
    get current() {
      return current;
    },
    select,
  };
}
