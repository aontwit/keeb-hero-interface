/**
 * Fig 5 — a keyswitch on a force bench, drawn with the Anatomy iso kit.
 *
 * One model drives everything: `forceAt(stem, mm)` is the force curve, and the
 * stem travel, spring length, dial needle, contact leaf, PCB trace, LED and the
 * chart dot are all read from the same `travel` each frame. Scale: 4 world
 * units = 1 mm, so the 15.6 mm housing is 62 units across.
 */
import * as k from '../iso/iso-kit';
import type { Plan, Point3, Projection } from '../iso/iso-kit';
import type { SwitchSpec } from '../content';

type StemId = SwitchSpec['id'];

// ── truth ──────────────────────────────────────────────
export const TRAVEL_MM = 4;
const PRE: Record<StemId, number> = { red: 2.0, brown: 2.0, blue: 2.2 };
// [centre mm, height g, width mm] of the tactile bump; red has none
const BUMP: Record<StemId, [number, number, number] | null> = {
  red: null,
  brown: [1.3, 15, 0.35],
  blue: [1.9, 6, 0.25],
};

/** grams at `mm` of travel: spring preload + rate, a bump, and the hard stop. */
export function forceAt(stem: StemId, mm: number) {
  const bump = BUMP[stem];
  let g = 30 + 7.5 * mm;
  if (bump) g += bump[1] * Math.exp(-(((mm - bump[0]) / bump[2]) ** 2));
  if (mm > 3.8) g += (mm - 3.8) * 150; // stem floor meets the housing
  return g;
}
export const actuationAt = (stem: StemId) => PRE[stem];

// ── world ──────────────────────────────────────────────
const U = 4; // units per mm
const W = 600;
const H = 420;
const SW: [number, number] = [-20, 0];

const BENCH: Plan = { x: -134, y: -70, w: 270, d: 140, r: 8 };
const BENCH_H = 10;
const FOOT_H = 5;
const PCB: Plan = { x: -72, y: -46, w: 150, d: 92, r: 2 };
const PCB_Z = 14;
const PCB_TOP = 20;
const PLATE: Plan = { x: -70, y: -44, w: 100, d: 88, r: 2 };
const PLATE_Z = 36;
const PLATE_TOP = 42;
const sq = (half: number, r: number): Plan => ({ x: SW[0] - half, y: SW[1] - half, w: half * 2, d: half * 2, r });
const LOWER = sq(28, 2);
const UPPER = sq(31, 3);
const FLOOR = 46; // top of the upper housing's base ring
const RIM_Z = 80;
const RIM_TOP = 84;
const FLANGE = 74; // stem body bottom at rest
const BODY_TOP = 92;
const CROSS_TOP = 102;
const DIAL_Z = 126;
const DIAL_H = 10;
const DIAL_R = 24;
const DIAL_TOP = DIAL_Z + DIAL_H;
const POST: [number, number] = [SW[0], -60];
const POST_TOP = 148;
const LED: [number, number] = [56, 30];
const RES: Plan = { x: 42, y: 8, w: 9, d: 4, r: 1 };
const PANEL: Plan = { x: 86, y: -58, w: 44, d: 5, r: 1 };
const PANEL_TOP = 62;

const P: Projection = k.fitProjection(
  [...k.boxCorners(BENCH, -BENCH_H - FOOT_H, 0), [POST[0], POST[1], POST_TOP + 4], [SW[0], SW[1] + DIAL_R, DIAL_TOP]],
  W,
  H,
  { pad: 26, azimuth: 42, elevation: 38 }, // a little higher than 30°, to see into the cut housing
);

const at = (p: Point3) => k.iso(p, P);
const S = k.solidSvg;
const L = k.lineSvg;
const D = k.dotsSvg;
const slab = (plan: Plan, z: number, h: number, bevel = 0.5, steps = 4) => k.slabOf(plan, z, h, P, steps, bevel);
const depth = (x: number, y: number) => k.depthOf([x - SW[0], y - SW[1], 0], P);
const byDepth = <T extends [number, number]>(pts: T[]) => [...pts].sort((a, b) => depth(a[0], a[1]) - depth(b[0], b[1]));

/** A vertical coil spring split into the halves behind and in front of its axis. */
function spring(z0: number, z1: number, r: number, turns: number) {
  const back: string[] = [];
  const front: string[] = [];
  const n = Math.round(turns * 24);
  let run: [number, number][] = [];
  let near: boolean | null = null;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * turns * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const pt = at([SW[0] + r * c, SW[1] + r * s, z0 + ((z1 - z0) * i) / n]);
    const facing = k.depthOf([c, s, 0], P) > 0;
    if (near === null) near = facing;
    if (facing !== near) {
      run.push(pt);
      (near ? front : back).push(k.pathOf(run));
      run = [pt];
      near = facing;
      continue;
    }
    run.push(pt);
  }
  if (run.length > 1) (near ? front : back).push(k.pathOf(run));
  return { back: back.join(''), front: front.join('') };
}

// ── static art ─────────────────────────────────────────
function bench() {
  const out = [`<path class="iso-halo" d="${k.haloOf(BENCH, -BENCH_H - FOOT_H, BENCH_H, P)}"/>`];
  for (const [x, y] of byDepth(k.corners(BENCH, 22))) {
    out.push(S(k.cylinder(x, y, 7, -BENCH_H - FOOT_H, 1.6, P, 28), { tone: 'lo' }));
    out.push(S(k.cylinder(x, y, 5.4, -BENCH_H - FOOT_H + 1.6, FOOT_H - 1.6, P, 28), { tone: 'mid' }));
  }
  out.push(S(k.slabOf(BENCH, -BENCH_H, BENCH_H, P, 8, 1.6), { tone: 'mid' }));
  out.push(L(k.planOutline(k.insetPlan(BENCH, 5), 0, P), { tone: 'lo' }));
  const screws = k.corners(BENCH, 10);
  out.push(L(screws.map(([x, y]) => k.ring(x, y, 2.2, 0, P, 16)).join(''), { tone: 'lo' }));
  out.push(D(screws.map(([x, y]) => at([x, y, 0])), { size: 0.5 }));
  // millimetre rule along the front edge, one major per 5 mm
  const strip: Plan = { x: -116, y: BENCH.y + BENCH.d - 15, w: 232, d: 7, r: 1 };
  out.push(S(k.slabOf(strip, 0, 0.6, P, 3), { tone: 'lo', crease: 'none' }));
  const ticks = k.topTicks(strip.x + 4, strip.x + strip.w - 4, U, 5, strip.y + 0.8, 0.6, [2, 3.6], P);
  out.push(L(ticks.minor, { tone: 'lo' }), L(ticks.major, { tone: 'mid' }));
  out.push(D([at([strip.x + 2, strip.y + 3.5, 0.6]), at([strip.x + strip.w - 2, strip.y + 3.5, 0.6])], { size: 0.45 }));
  // label plate: three rule lines
  const label: Plan = { x: -120, y: 30, w: 34, d: 18, r: 1.5 };
  out.push(S(k.slabOf(label, 0, 0.8, P, 3), { tone: 'lo', crease: 'none' }));
  for (const [i, y] of [36, 40, 44].entries()) {
    out.push(L(k.lineOnTop([label.x + 4, y], [label.x + (i === 2 ? 18 : 30), y], 0.8, P), { tone: 'faint', free: true }));
  }
  out.push(D(k.corners(label, 2).map(([x, y]) => at([x, y, 0.8])), { size: 0.35, tone: 'lo' }));
  return out.join('');
}

function gaugeStand() {
  const out: string[] = [];
  const foot: Plan = { x: POST[0] - 12, y: -67, w: 24, d: 16, r: 2 };
  out.push(S(slab(foot, 0, 10, 0.8), { tone: 'mid' }));
  out.push(D(k.corners(foot, 3).map(([x, y]) => at([x, y, 10])), { size: 0.4, tone: 'lo' }));
  out.push(S(k.cylinder(POST[0], POST[1], 4, 10, POST_TOP - 10, P, 28), { tone: 'mid', crease: 'none' }));
  out.push(L([40, 70, 100].map((z) => k.sideArc(POST[0], POST[1], 4, z, P, 16)).join(''), { tone: 'faint' }));
  out.push(S(k.cylinder(POST[0], POST[1], 4.8, POST_TOP, 2, P, 28), { tone: 'mid' }));
  return out.join('');
}

function gaugeArm() {
  const out: string[] = [];
  const clamp: Plan = { x: POST[0] - 7, y: POST[1] - 7, w: 14, d: 14, r: 2.5 };
  out.push(S(slab(clamp, DIAL_Z - 6, 14, 0.6), { tone: 'mid' }));
  const knob: [number, number] = [clamp.x - 3, POST[1]];
  out.push(S(k.cylinder(knob[0], knob[1], 3, DIAL_Z - 4, 7, P, 20), { tone: 'mid' }));
  out.push(L(k.knurl(knob[0], knob[1], 3, DIAL_Z - 4, DIAL_Z + 3, 18, P), { tone: 'lo' }));
  const arm: Plan = { x: SW[0] - 3, y: POST[1] + 7, w: 6, d: -POST[1] - 7 - DIAL_R + 2, r: 1.5 };
  out.push(S(slab(arm, DIAL_Z + 1, 4, 0.4), { tone: 'mid' }));
  out.push(D([at([SW[0], arm.y + 3, DIAL_Z + 5]), at([SW[0], arm.y + arm.d - 4, DIAL_Z + 5])], { size: 0.45 }));
  return out.join('');
}

function dial() {
  const [x, y] = SW;
  const out: string[] = [];
  out.push(S(k.cylinder(x, y, 3.2, DIAL_Z - 8, 8, P, 20), { tone: 'mid' }));
  out.push(S(k.cylinder(x, y, DIAL_R, DIAL_Z, DIAL_H, P, 64, 0.8), { tone: 'hi', crease: 'lo' }));
  out.push(L(k.knurl(x, y, DIAL_R, DIAL_TOP - 3.4, DIAL_TOP, 84, P, 0.3), { tone: 'lo' }));
  out.push(L(k.ring(x, y, DIAL_R - 2.2, DIAL_TOP, P, 64), { tone: 'lo' }));
  // 0–100 g per turn: a tick every 2 g, a major every 10 g
  const ticks = k.radialTicks(x, y, DIAL_R - 3, 50, 5, DIAL_TOP, [1.3, 2.8], P);
  out.push(L(ticks.minor, { tone: 'lo' }), L(ticks.major, { tone: 'mid' }));
  out.push(L(k.ring(x, y, 1.6, DIAL_TOP, P, 16), { tone: 'mid' }));
  out.push(k.faceTextSvg(k.topMatrix([x, y + 9], DIAL_TOP, P, 'x'), 'gf', { size: 2.6, tone: 'lo', anchor: 'middle' }));
  return out.join('');
}

function board() {
  const out: string[] = [];
  for (const [x, y] of byDepth(k.corners(PCB, 6))) {
    out.push(S(k.cylinder(x, y, 3, 0, PCB_Z, P, 20), { tone: 'mid', crease: 'none' }));
  }
  out.push(S(slab(PCB, PCB_Z, PCB_TOP - PCB_Z, 0.4, 6), { tone: 'mid' }));
  out.push(D(k.corners(PCB, 6).map(([x, y]) => at([x, y, PCB_TOP])), { size: 0.5 }));
  out.push(L(k.corners(PCB, 6).map(([x, y]) => k.ring(x, y, 2.4, PCB_TOP, P, 16)).join(''), { tone: 'lo' }));
  // the resistor that limits the LED, on its two pads
  const res = RES;
  out.push(S(slab(res, PCB_TOP, 2.4, 0.3), { tone: 'hi' }));
  out.push(L(k.lineOnTop([res.x + 3, res.y], [res.x + 3, res.y + res.d], PCB_TOP + 2.4, P) + k.lineOnTop([res.x + 6, res.y], [res.x + 6, res.y + res.d], PCB_TOP + 2.4, P), { tone: 'faint' }));
  out.push(k.faceTextSvg(k.topMatrix([PLATE.x + PLATE.w + 4, -38], PCB_TOP, P, 'x'), 'SW1', { size: 2.6, tone: 'lo' }));
  return out.join('');
}

// PCB trace from under the plate edge, past the resistor, to the LED
const TRACE = k.onTop(
  [
    [PLATE.x + PLATE.w, 10],
    [RES.x, 10],
    [RES.x + RES.w, 10],
    [LED[0] - 6, 10],
    [LED[0], 16],
    [LED[0], LED[1] - 4],
  ],
  PCB_TOP,
  P,
);
function led() {
  const out: string[] = [];
  out.push(S(k.cylinder(LED[0], LED[1], 4, PCB_TOP, 2.5, P, 24), { tone: 'mid' }));
  out.push(S(k.cylinder(LED[0], LED[1], 3, PCB_TOP + 2.5, 4, P, 24, 0.6), { tone: 'hi' }));
  return out.join('');
}

function housingBelow() {
  const out: string[] = [];
  out.push(S(slab(LOWER, PCB_TOP, PLATE_Z - PCB_TOP, 0.5), { tone: 'hi' }));
  out.push(L(k.sideSeam(LOWER, PCB_TOP + 6, P, 4), { tone: 'faint' }));
  out.push(S(slab(PLATE, PLATE_Z, PLATE_TOP - PLATE_Z, 0.6, 6), { tone: 'mid' }));
  out.push(L(k.planOutline(k.insetPlan(PLATE, 4), PLATE_TOP, P, 4), { tone: 'faint' }));
  out.push(D(k.corners(PLATE, 5).map(([x, y]) => at([x, y, PLATE_TOP])), { size: 0.45 }));
  out.push(S(slab(UPPER, PLATE_TOP, FLOOR - PLATE_TOP, 0.6), { tone: 'hi' }));
  return out.join('');
}

// four corner pillars and a rim: the top housing with its walls cut away
const PILLARS: Plan[] = ([-31, 22] as const).flatMap((dx) =>
  ([-31, 22] as const).map((dy) => ({ x: SW[0] + dx, y: SW[1] + dy, w: 9, d: 9, r: 1.5 })),
);
const RIMS: Plan[] = [
  { x: UPPER.x, y: UPPER.y, w: UPPER.w, d: 8, r: 1 }, // back (−y)
  { x: UPPER.x, y: UPPER.y + 8, w: 8, d: UPPER.d - 16, r: 0.5 }, // left (−x)
  { x: UPPER.x + UPPER.w - 8, y: UPPER.y + 8, w: 8, d: UPPER.d - 16, r: 0.5 }, // right (+x)
  { x: UPPER.x, y: UPPER.y + UPPER.d - 8, w: UPPER.w, d: 8, r: 1 }, // front (+y)
];
const centreOf = (p: Plan): [number, number] => [p.x + p.w / 2, p.y + p.d / 2];
const behind = (p: Plan) => depth(...centreOf(p)) < 0;
// the cut: the pillar and the two rim bars nearest the viewer are left off
const cut = (p: Plan) => depth(...centreOf(p)) > 10;

function housingPart(p: Plan, z: number, h: number) {
  return S(slab(p, z, h, 0.4), { tone: 'hi' });
}

// leaf contacts on the +x side: the far one is fixed, the near one swings in
const LEAF_FIXED: Plan = { x: SW[0] + 19, y: -5, w: 1.2, d: 10, r: 0.3 };
const LEAF_MOVING: Plan = { x: SW[0] + 14.5, y: -4, w: 1.2, d: 8, r: 0.3 };
const LEAF_GAP = LEAF_FIXED.x - LEAF_MOVING.x - LEAF_MOVING.w;

function stemPole() {
  return S(k.cylinder(SW[0], SW[1], 2.6, FLOOR + TRAVEL_MM * U, FLANGE - FLOOR - TRAVEL_MM * U, P, 20), { tone: 'hi', lit: true, crease: 'none' });
}
function stemBody() {
  const out: string[] = [];
  out.push(S(slab(sq(11, 1.5), FLANGE, BODY_TOP - FLANGE, 0.5), { tone: 'hi', lit: true }));
  // the MX cross
  out.push(S(slab({ x: SW[0] - 2, y: SW[1] - 6, w: 4, d: 12, r: 0.4 }, BODY_TOP, CROSS_TOP - BODY_TOP, 0.3), { tone: 'hi', lit: true }));
  out.push(S(slab({ x: SW[0] - 6, y: SW[1] - 2, w: 12, d: 4, r: 0.4 }, BODY_TOP, CROSS_TOP - BODY_TOP, 0.3), { tone: 'hi', lit: true }));
  return out.join('');
}
function plunger() {
  return S(k.cylinder(SW[0], SW[1], 2, CROSS_TOP, DIAL_Z - 8 - CROSS_TOP + 1, P, 16), { tone: 'hi', crease: 'none' });
}

function panel() {
  const out: string[] = [];
  const foot: Plan = { x: PANEL.x - 4, y: PANEL.y - 6, w: PANEL.w + 8, d: 16, r: 2 };
  out.push(S(slab(foot, 0, 4, 0.5), { tone: 'mid' }));
  out.push(S(slab(PANEL, 4, PANEL_TOP - 4, 0.5), { tone: 'mid' }));
  return out.join('');
}

// chart on the panel's front face, in face-local units (u → +x, v ↓)
const FACE = k.sideMatrix([PANEL.x, PANEL.y + PANEL.d], PANEL_TOP, P, 'left');
const CH = { u0: 5, u1: 39, v0: 6, v1: 44 };
const chartU = (mm: number) => CH.u0 + (mm / TRAVEL_MM) * (CH.u1 - CH.u0);
const chartV = (g: number) => CH.v1 - ((Math.min(g, 100) - 20) / 80) * (CH.v1 - CH.v0);
function curvePath(stem: StemId) {
  const pts: string[] = [];
  for (let i = 0; i <= 80; i++) {
    const mm = (i / 80) * TRAVEL_MM;
    pts.push(`${i ? 'L' : 'M'}${chartU(mm).toFixed(2)} ${chartV(forceAt(stem, mm)).toFixed(2)}`);
  }
  return pts.join('');
}
function chart() {
  const grid: string[] = [];
  for (let g = 20; g <= 100; g += 20) grid.push(`M${CH.u0} ${chartV(g)}H${CH.u1}`);
  for (let mm = 0; mm <= TRAVEL_MM; mm++) grid.push(`M${chartU(mm)} ${CH.v0}V${CH.v1}`);
  return `<g transform="${FACE}">
    <rect x="3" y="3" width="38" height="44" rx="1" class="iso-line" data-tone="lo" style="fill:var(--anatomy-shade-0)"/>
    <path class="iso-line" data-tone="faint" d="${grid.join('')}"/>
    <path data-part="act" class="iso-line" data-tone="mid" data-dashed d=""/>
    <path data-part="curve" class="iso-line" data-tone="lit" d=""/>
    <circle data-part="dot" r="1.1" class="kf-dot"/>
    <text class="iso-face-text" data-tone="lo" x="${CH.u0}" y="${CH.v1 + 2.4}" font-size="1.8">0</text>
    <text class="iso-face-text" data-tone="lo" x="${CH.u1}" y="${CH.v1 + 2.4}" font-size="1.8" text-anchor="end">4 mm</text>
  </g>`;
}

// ── assemble ───────────────────────────────────────────
const zAlong = (mm: number) => k.translateAlong(P, [0, 0, -mm * U]);

function figure() {
  const rest = spring(FLOOR, FLANGE, 9, 6);
  const back = [...PILLARS.filter(behind).map((p) => housingPart(p, FLOOR, RIM_Z - FLOOR)), ...RIMS.filter(behind).map((p) => housingPart(p, RIM_Z, RIM_TOP - RIM_Z))];
  const front = [...PILLARS.filter((p) => !behind(p) && !cut(p)).map((p) => housingPart(p, FLOOR, RIM_Z - FLOOR)), ...RIMS.filter((p) => !behind(p) && !cut(p)).map((p) => housingPart(p, RIM_Z, RIM_TOP - RIM_Z))];
  const ledAt = at([LED[0], LED[1], PCB_TOP + 6]);
  return k.figureSvg({
    width: W,
    height: H,
    className: 'kf-svg',
    label:
      'A keyswitch on a force bench. The switch sits in a plate on a small PCB; its top housing is cut away to show the stem, the spring and the two leaf contacts. A force gauge on a post presses the stem through a plunger, and a chart on the side panel traces force against travel. When the stem passes the actuation point the leaves touch and the LED on the PCB lights.',
    body: [
      `<defs><radialGradient id="kf-glow"><stop offset="0" stop-color="#ffd18a" stop-opacity=".95"/><stop offset=".35" stop-color="#ff9a3c" stop-opacity=".45"/><stop offset="1" stop-color="#ff7a1a" stop-opacity="0"/></radialGradient></defs>`,
      bench(),
      gaugeStand(),
      panel(),
      chart(),
      board(),
      `<path data-part="trace" class="iso-line" data-tone="lo" d="${TRACE}" style="stroke-width:1.2"/>`,
      D([at([PLATE.x + PLATE.w, 10, PCB_TOP])], { size: 0.6, tone: 'mid' }),
      led(),
      `<circle data-part="glow" cx="${ledAt[0]}" cy="${ledAt[1]}" r="16" fill="url(#kf-glow)" opacity="0" style="mix-blend-mode:screen"/>`,
      housingBelow(),
      ...back,
      `<path data-part="spring-back" class="iso-line" data-tone="mid" d="${rest.back}" style="stroke-width:1.1"/>`,
      `<g data-part="pole" class="kf-stem" transform="${zAlong(0)}">${stemPole()}</g>`,
      `<path data-part="spring-front" class="iso-line" data-tone="hi" d="${rest.front}" style="stroke-width:1.3"/>`,
      `<g data-part="body" class="kf-stem" transform="${zAlong(0)}">${stemBody()}</g>`,
      S(slab(LEAF_FIXED, FLOOR, 16, 0.2), { tone: 'hi', crease: 'none' }),
      `<g data-part="leaf">${S(slab(LEAF_MOVING, FLOOR, 14, 0.2), { tone: 'hi', crease: 'none' })}</g>`,
      ...front,
      `<g data-part="plunger" transform="${zAlong(0)}">${plunger()}</g>`,
      gaugeArm(),
      dial(),
      `<path data-part="needle" class="iso-line" data-tone="lit" data-free="start" d="" style="stroke-width:1.1"/>`,
    ],
  });
}

export const SVG = figure();

// ── live ───────────────────────────────────────────────
export interface Reading {
  stem: StemId;
  mm: number;
  g: number;
  on: boolean;
}

const needleAt = (g: number) => {
  const a = (g / 100) * Math.PI * 2;
  const [x, y] = SW;
  return k.lineOnTop(
    [x - Math.sin(a) * 3.4, y + Math.cos(a) * 3.4],
    [x + Math.sin(a) * (DIAL_R - 4), y - Math.cos(a) * (DIAL_R - 4)],
    DIAL_TOP + 0.2,
    P,
  );
};

/**
 * Mount the moving parts on an already-rendered SVG. Press and hold (pointer,
 * Space or Enter) bottoms the stem; release lets the spring return it. Idle,
 * it presses itself every few seconds. Returns a handle to swap stems.
 */
export function mountKeyswitch(stage: HTMLElement, onRead: (r: Reading) => void) {
  const svg = stage.querySelector('svg')!;
  const q = (name: string) => svg.querySelector<SVGGraphicsElement>(`[data-part="${name}"]`)!;
  const parts = {
    pole: q('pole'),
    body: q('body'),
    plunger: q('plunger'),
    back: q('spring-back'),
    front: q('spring-front'),
    needle: q('needle'),
    leaf: q('leaf'),
    trace: q('trace'),
    glow: q('glow'),
    curve: q('curve'),
    act: q('act'),
    dot: q('dot'),
  };
  const still = matchMedia('(prefers-reduced-motion: reduce)');
  let stem: StemId = 'red';
  let mm = 0;
  let rate = 0;
  let target = 0;
  let held = false;
  let touring = !still.matches;
  let clock = 0;
  let last = 0;
  let frame = 0;
  let visible = false;
  let idle = 0;
  let glow = 0;

  const setStem = (id: StemId) => {
    stem = id;
    parts.curve.setAttribute('d', curvePath(id));
    const u = chartU(PRE[id]);
    parts.act.setAttribute('d', `M${u} ${CH.v0}V${CH.v1}`);
    stage.style.setProperty('--kf-stem', `var(--kf-${id})`);
    draw();
    run();
  };

  function draw() {
    const shift = zAlong(mm);
    parts.pole.setAttribute('transform', shift);
    parts.body.setAttribute('transform', shift);
    parts.plunger.setAttribute('transform', shift);
    const s = spring(FLOOR, FLANGE - mm * U, 9, 6);
    parts.back.setAttribute('d', s.back);
    parts.front.setAttribute('d', s.front);
    const g = forceAt(stem, mm);
    parts.needle.setAttribute('d', needleAt(g));
    const on = mm >= PRE[stem];
    // the leaf closes over the last 0.3 mm before actuation
    const close = Math.min(1, Math.max(0, (mm - PRE[stem] + 0.3) / 0.3));
    parts.leaf.setAttribute('transform', k.translateAlong(P, [close * LEAF_GAP, 0, 0]));
    parts.trace.setAttribute('data-tone', on ? 'lit' : 'lo');
    parts.glow.setAttribute('opacity', glow.toFixed(3));
    parts.dot.setAttribute('cx', chartU(mm).toFixed(2));
    parts.dot.setAttribute('cy', chartV(g).toFixed(2));
    stage.setAttribute('aria-valuenow', mm.toFixed(1));
    stage.setAttribute('aria-valuetext', `${mm.toFixed(1)} mm, ${Math.round(g)} grams${on ? ', actuated' : ''}`);
    onRead({ stem, mm, g, on });
  }

  function tick(now: number) {
    const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
    last = now;
    if (touring) {
      clock += dt;
      target = clock % 3.2 < 1.4 ? TRAVEL_MM : 0;
    } else target = held ? TRAVEL_MM : target;
    if (still.matches) {
      mm = target;
      rate = 0;
    } else {
      // a stiff, slightly underdamped spring: fingers are fast, stems settle
      for (let i = 0; i < 4; i++) {
        rate += (((target - mm) * 260 - rate * 24) * dt) / 4;
        mm += (rate * dt) / 4;
      }
      mm = Math.min(TRAVEL_MM, Math.max(0, mm));
    }
    const want = mm >= PRE[stem] ? 1 : 0;
    glow += (want - glow) * (1 - Math.exp(-dt / (want ? 0.05 : 0.25)));
    draw();
    const settled = !touring && Math.abs(target - mm) < 0.002 && Math.abs(rate) < 0.002 && Math.abs(want - glow) < 0.01;
    if (settled) {
      mm = target;
      glow = want;
      draw();
    }
    frame = visible && !settled ? requestAnimationFrame(tick) : 0;
  }
  const run = () => {
    if (!frame && visible) {
      last = 0;
      frame = requestAnimationFrame(tick);
    }
  };
  const steer = (down: boolean) => {
    touring = false;
    held = down;
    target = down ? TRAVEL_MM : 0;
    clearTimeout(idle);
    if (!down)
      idle = window.setTimeout(() => {
        touring = !still.matches;
        clock = 1.5;
        run();
      }, 5000);
    run();
  };

  const io = new IntersectionObserver(
    (entries) => {
      visible = entries[entries.length - 1]!.isIntersecting;
      if (visible) run();
    },
    { rootMargin: '120px 0px' },
  );
  io.observe(stage);
  const ac = new AbortController();
  const o = { signal: ac.signal };
  stage.addEventListener('pointerdown', (e) => {
    stage.setPointerCapture(e.pointerId);
    steer(true);
  }, o);
  stage.addEventListener('pointerup', () => steer(false), o);
  stage.addEventListener('pointercancel', () => steer(false), o);
  stage.addEventListener('keydown', (e) => {
    if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
      e.preventDefault();
      steer(true);
    }
  }, o);
  stage.addEventListener('keyup', (e) => {
    if (e.key === ' ' || e.key === 'Enter') steer(false);
  }, o);

  setStem(stem);
  return {
    setStem,
    dispose() {
      ac.abort();
      io.disconnect();
      clearTimeout(idle);
      cancelAnimationFrame(frame);
    },
  };
}
