import * as THREE from 'three';
import { animate } from 'animejs';
import { SWITCHES } from '../content';
import type { SwitchSpec } from '../content';

/**
 * Three switches that climb out of the board and hold still to be looked at.
 *
 * They are the same three primitives as the 84 in the plate — cloned, so the
 * geometry is shared and the whole trio costs three nodes and one extra
 * material each. Only the stem colour differs, which is exactly what differs on
 * a real board.
 *
 * The leader-line labels come from the callout layer: each node is registered
 * under `HERO_<id>`, and the picker section names those in its `data-parts`.
 */

/** Where each one parks, in model cm. A rising diagonal, so the labels stack. */
const SPOT: Record<SwitchSpec['id'], [number, number, number]> = {
  blue: [-11.5, 0.5, 10],
  red: [-7.5, 4.5, 10],
  brown: [-3.5, 8.5, 10],
};
const SCALE = 2.4;
const PICKED = 1.18; // the selected one leans forward

export interface HeroSwitches {
  /** Callout lookup: HERO_blue -> node. */
  nodes: Record<string, THREE.Object3D>;
  show(on: boolean): void;
  select(id: SwitchSpec['id']): void;
  update(dt: number): void;
}

export function createHeroSwitches(
  template: THREE.Object3D | null,
  parent: THREE.Object3D,
  reduced: boolean,
): HeroSwitches {
  // No template means mobile (or a model with no switches): the picker still
  // recolours the board, it just does not stage the trio. At phone width the
  // labels are off anyway and three floating switches would land on the copy.
  if (!template) return { nodes: {}, show() {}, select() {}, update() {} };

  const nodes: Record<string, THREE.Object3D> = {};
  const group = new THREE.Group();
  group.name = 'KB_HeroSwitches';
  group.visible = false;
  parent.add(group);

  const rise = SWITCHES.map((spec) => {
    const node = template ? template.clone() : new THREE.Group();
    node.name = `KB_Hero_${spec.id}`;

    // clone only the stem material — housing and base stay shared with the board
    const recolour = (m: THREE.Material) => {
      if (m.name !== 'KB_Mat_Stem') return m;
      const copy = m.clone() as THREE.MeshStandardMaterial;
      copy.name = `KB_Mat_Stem_${spec.id}`; // renamed, or the board swap would find this one
      copy.color.setHex(spec.hex);
      return copy;
    };
    node.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map(recolour)
        : recolour(mesh.material);
    });

    const [x, y, z] = SPOT[spec.id];
    node.scale.setScalar(SCALE);
    node.position.set(x, y, z);
    group.add(node);
    nodes[`HERO_${spec.id}`] = node;
    return { spec, node, home: new THREE.Vector3(x, y, z) };
  });

  let shown = false;
  let picked: SwitchSpec['id'] = SWITCHES[0].id;
  let spin = 0;
  const scaleFor = (spec: SwitchSpec) => SCALE * (spec.id === picked ? PICKED : 1);

  const show = (on: boolean) => {
    if (on === shown) return;
    shown = on;
    if (on) group.visible = true;

    rise.forEach(({ spec, node, home }, i) => {
      const big = scaleFor(spec);
      if (reduced) {
        node.position.copy(home);
        node.scale.setScalar(big);
        if (!on) group.visible = false;
        return;
      }
      // out of the plate and up: start low, near the board's own switch layer
      animate(node.position, {
        x: on ? home.x : home.x * 0.35,
        y: on ? home.y : 2,
        z: on ? home.z : 0,
        duration: on ? 900 : 420,
        delay: on ? i * 110 : 0,
        ease: on ? 'outElastic(1, .72)' : 'inQuad',
      });
      animate(node.scale, {
        x: on ? big : 0.01,
        y: on ? big : 0.01,
        z: on ? big : 0.01,
        duration: on ? 620 : 360,
        delay: on ? i * 110 : 0,
        ease: on ? 'outBack' : 'inQuad',
        onComplete: () => {
          if (!on && i === rise.length - 1) group.visible = false;
        },
      });
    });
  };

  const select = (id: SwitchSpec['id']) => {
    picked = id;
    if (!shown) return; // scale is applied on the way out instead
    for (const { spec, node } of rise) {
      const s = scaleFor(spec);
      if (reduced) node.scale.setScalar(s);
      else animate(node.scale, { x: s, y: s, z: s, duration: 380, ease: 'outQuad' });
    }
  };

  return {
    nodes,
    show,
    select,
    update(dt) {
      if (!group.visible || reduced) return;
      // slow turntable so the stem reads from more than one angle
      spin += dt * 0.42;
      for (const { spec, node } of rise) {
        node.rotation.y = spin + (spec.id === picked ? 0 : 0.5);
        node.rotation.x = -0.22;
      }
    },
  };
}
