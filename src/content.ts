/**
 * Section copy, split out so the scroll stage count and the section list can
 * never drift apart: `LAYERS.length` is what `scroll.cfg.stages` is set from.
 */
export interface LayerCopy {
  idx: string;
  title: string;
  body: string;
  anchor?: string;
  /** Callout anchors this section lights up. Keys of CALLOUTS. */
  parts?: string[];
  /** The Fig 1 layer this section brings forward. */
  layer: 'case' | 'pcb' | 'plate' | 'switches' | 'caps';
}

export const LAYERS: LayerCopy[] = [
  {
    idx: 'LAYER 06',
    title: 'Keycaps',
    body: 'Six sculpted rows, each at its own angle. One orange key, and it is the one you reach for when something has gone wrong.',
    anchor: 'layers',
    parts: ['KB_Keycaps_Row0'],
    layer: 'caps',
  },
  {
    idx: 'LAYER 05',
    title: 'Switches',
    body: 'Eighty-four of them, one under every cap. The stem is the only part that differs between a blue, a red and a brown.',
    parts: ['KB_Switches_Group'],
    layer: 'switches',
  },
  {
    idx: 'LAYER 04',
    title: 'Plate',
    body: '1.5 mm, cut with eighty-four 14 mm windows. The part nobody sees and everybody hears.',
    parts: ['KB_Plate'],
    layer: 'plate',
  },
  {
    idx: 'LAYER 03',
    title: 'PCB',
    body: 'Hot-swap everywhere. Pull a switch, drop in another, keep the board.',
    parts: ['KB_PCB'],
    layer: 'pcb',
  },
  {
    idx: 'LAYER 01 — 02',
    title: 'The case',
    body: '313 × 123 mm of dark aluminium, walls high enough that only the keycap tops show. Flip-out feet set a 6° typing angle.',
    anchor: 'specs',
    parts: ['KB_Case_Bottom', 'KB_Feet'],
    layer: 'case',
  },
];

/**
 * The three switches, and the only thing that physically differs between them:
 * the stem. Housing, plate cutout and keycap are identical, which is why the
 * model swaps a colour rather than a mesh.
 */
export interface SwitchSpec {
  id: 'blue' | 'red' | 'brown';
  name: string;
  /** Stem colour, the one material the swap writes to. */
  hex: number;
  feel: string;
  force: string;
  travel: string;
  body: string;
  /** Bottom-out easing for the click micro-interaction. */
  ease: string;
  /** cm of cap travel — red bottoms out furthest, blue stops on the click. */
  drop: number;
}

export const SWITCHES: SwitchSpec[] = [
  {
    id: 'blue',
    name: 'Blue',
    hex: 0x2fa8e0,
    feel: 'Clicky',
    force: '50 g',
    travel: '2.2 mm to actuate',
    body: 'A click jacket on the stem fires on the way down. Loudest of the three, and the only one you can hear from the next room.',
    ease: 'outElastic(1, .38)',
    drop: 0.3,
  },
  {
    id: 'red',
    name: 'Red',
    hex: 0xd8322f,
    feel: 'Linear',
    force: '45 g',
    travel: '2.0 mm to actuate',
    body: 'No bump, no click — the same weight the whole way down. Lightest to hold at rest, easiest to bottom out by accident.',
    ease: 'outQuad',
    drop: 0.38,
  },
  {
    id: 'brown',
    name: 'Brown',
    hex: 0x7a4a2b,
    feel: 'Tactile',
    force: '55 g',
    travel: '2.0 mm to actuate',
    body: 'A bump where actuation happens, and nothing after it. The compromise switch, which is why it is the one most people keep.',
    ease: 'outElastic(1, .62)',
    drop: 0.34,
  },
];

/**
 * Leader-line anchors: a part, a point on it (model cm), and what to call it.
 *
 * `at` is hand-placed so the two callouts a section shows never land on top of
 * each other — cheaper and steadier than a runtime layout solver, and there are
 * only ever two on screen.
 */
export interface Callout {
  part: string;
  title: string;
  note: string;
  /** Offset from the part origin, in model space — a point ON the part. */
  at: [number, number, number];
}

export const CALLOUTS: Record<string, Callout> = {
  // every anchor sits on the side OPPOSITE this section's copy column — the
  // layer sections alternate left/right, and a label under body text is noise
  KB_Keycaps_Row0: { part: 'KB_Keycaps_Row0', title: 'Keycaps', note: 'PBT · 6 sculpted rows', at: [-11, 0.5, 0] },
  KB_Switches_Group: { part: 'KB_Switches_Group', title: 'Switches', note: '84 · clicky', at: [-12, 0.6, 0] },
  KB_Plate: { part: 'KB_Plate', title: 'Plate', note: 'brass · 84 × 14 mm cutouts', at: [-12, 0.1, 3.5] },
  KB_PCB: { part: 'KB_PCB', title: 'PCB', note: 'hot-swap sockets', at: [-11, -0.1, 0] },
  KB_Case_Bottom: { part: 'KB_Case_Bottom', title: 'Case', note: 'aluminium · 313 × 123 mm', at: [-13, 0.2, -4] },
  KB_Feet: { part: 'KB_Feet', title: 'Feet', note: 'flip-out · 6°', at: [0, -0.4, 0] },

  // The three switches that climb out of the board in the picker section. They
  // park on a diagonal rising to the right, so the default left-hand elbow
  // points into clear space instead of onto the next switch along.
  ...Object.fromEntries(
    SWITCHES.map((s): [string, Callout] => [
      `HERO_${s.id}`,
      {
        part: `HERO_${s.id}`,
        title: s.name,
        note: `${s.feel} · ${s.force}`,
        at: [0, 0.9, 0],
      },
    ]),
  ),
};
