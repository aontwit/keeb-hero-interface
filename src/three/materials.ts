import * as THREE from 'three';

/**
 * Ink pass: the board is drawn in the same hand as Fig 5.
 *
 * The Anatomy plate is an iso drawing — near-black fills, hairline edges, one
 * colour that means something. A photoreal board above it read as a different
 * product. So every material collapses to a matte fill one step off the page,
 * and `inkEdges` traces the creases. Colour is kept only where it carries
 * information: the Esc outline, and the three hero switches' stems.
 *
 * The lookup is by material name, so it survives a model rebuild.
 */

type Ink = { color: number; opacity?: number };

// Top-face tones. FACES below derives the two side faces from each, the way
// the iso kit pairs --anatomy-lit-top with its --anatomy-shade-* steps.
const INK: Record<string, Ink> = {
  KB_Mat_Case: { color: 0x262626 },
  KB_Mat_Cap_Alpha: { color: 0x303030 },
  KB_Mat_Cap_Mod: { color: 0x2a2a2a },
  KB_Mat_Cap_Esc: { color: 0x303030 },
  KB_Mat_SwitchLower: { color: 0x222222 },
  // smoked housing: the stem colour has to show through it
  KB_Mat_SwitchUpper: { color: 0x2a2a2a, opacity: 0.45 },
  KB_Mat_Plate: { color: 0x202020 },
  KB_Mat_PCB: { color: 0x1c1c1c },
  KB_Mat_Port: { color: 0x1c1c1c },
  // grey on the board: 84 coloured stems were noise. Colour lives on the three
  // hero switches only, which clone this and set their own.
  KB_Mat_Stem: { color: 0x303030 },
};

/**
 * A matcap of three flat faces: up-facing = full tone, left = 72%, right = 52%.
 * An iso drawing's faces are filled, not lit — so no lights, no falloff, the
 * same three values whatever the scene does. Fig 5 is built the same way.
 */
const FACES = (() => {
  const n = 64;
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d')!;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const nx = (x + 0.5) / n - 0.5;
      const ny = 0.5 - (y + 0.5) / n; // matcap v runs up
      const v = ny > 0.18 ? 255 : nx < 0 ? 184 : 133;
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.fillRect(x, y, 1, 1);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.minFilter = t.magFilter = THREE.NearestFilter;
  return t;
})();

/**
 * Swap every named material for a flat three-face matcap.
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

    const ink = INK[src.name];
    if (!ink) {
      if (src.name) unknown.push(src.name);
      swapped.set(src, src);
      return src;
    }

    const next = new THREE.MeshMatcapMaterial({
      color: ink.color,
      matcap: FACES,
      transparent: ink.opacity !== undefined,
      opacity: ink.opacity ?? 1,
      depthWrite: ink.opacity === undefined,
      // push fills back a hair so the ink lines win the depth test — without
      // it, a line lying on its own face z-fights into a dashed stutter
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
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

// --anatomy-mid lifted a step: on a moving 3D board the plate's 0.6px #6a6a6a
// line drops out entirely, it needs the extra contrast to hold.
const LINE = new THREE.LineBasicMaterial({ color: 0x8a8a8a, transparent: true, opacity: 0.8 });
const LINE_ACCENT = new THREE.LineBasicMaterial({ color: 0xe8500f, transparent: true });
LINE.name = 'KB_Ink_Line';
LINE_ACCENT.name = 'KB_Ink_Accent';

/**
 * Trace every mesh's creases as a child LineSegments, so the lines ride along
 * with the explode and the per-key press for free.
 *
 * ponytail: one extra draw call per mesh (~100 with per-key caps). Merge caps'
 * edges per row if the frame budget ever bites; press then needs a vertex range.
 */
export function inkEdges(root: THREE.Object3D, angle = 25): number {
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
  });
  for (const mesh of meshes) {
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const accent = mats.some((m) => m.name === 'KB_Mat_Cap_Esc');
    const line = new THREE.LineSegments(
      new THREE.EdgesGeometry(mesh.geometry, angle),
      accent ? LINE_ACCENT : LINE,
    );
    line.name = `${mesh.name}_ink`;
    mesh.add(line);
  }
  return meshes.length;
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
