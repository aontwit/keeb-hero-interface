/**
 * Fig 1 — the board, drawn with the same Anatomy iso kit as Fig 5.
 *
 * Six layers stacked on z. Explode is one scalar `e` (0 = assembled, 1 = apart)
 * that slides each layer group up its own z-axis; nothing is re-projected per
 * frame, it is a transform on six <g>s. Scale: 1 unit = 1 mm. Layout and
 * heights come from build_keyboard_75.py.
 */
import * as k from '../iso/iso-kit';
import type { Plan, Point3, Projection } from '../iso/iso-kit';

export type LayerId = 'case' | 'pcb' | 'plate' | 'switches' | 'caps' | 'frame';
const ORDER: LayerId[] = ['case', 'pcb', 'plate', 'switches', 'caps', 'frame'];

// ── truth ──────────────────────────────────────────────
const U = 18.75; // key pitch, mm
type Role = 'a' | 'm' | 'e';
const a = (w = 1): [number, Role] => [w, 'a'];
const m = (w = 1): [number, Role] => [w, 'm'];
const times = (n: number, key: [number, Role]) => Array.from({ length: n }, () => key);
const LAYOUT: [number, Role][][] = [
  [[1, 'e'], ...times(15, m())],
  [...times(13, a()), m(2), m()],
  [m(1.5), ...times(12, a()), m(1.5), m()],
  [m(1.75), ...times(11, a()), m(2.25), m()],
  [m(2.25), ...times(10, a()), m(1.75), m(), m()],
  [m(1.25), m(1.25), m(1.25), a(6.25), ...times(6, m())],
];
/** KeyboardEvent.code for every key, same order as LAYOUT. */
const CODES = [
  ['Escape', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12', 'PrintScreen', 'Insert', 'Delete'],
  ['Backquote', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0', 'Minus', 'Equal', 'Backspace', 'Home'],
  ['Tab', 'KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP', 'BracketLeft', 'BracketRight', 'Backslash', 'PageUp'],
  ['CapsLock', 'KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon', 'Quote', 'Enter', 'PageDown'],
  ['ShiftLeft', 'KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN', 'KeyM', 'Comma', 'Period', 'Slash', 'ShiftRight', 'ArrowUp', 'End'],
  ['ControlLeft', 'MetaLeft', 'AltLeft', 'Space', 'AltRight', 'MetaRight', 'ControlRight', 'ArrowLeft', 'ArrowDown', 'ArrowRight'],
];
const CAP_H = [8.8, 11, 10.2, 9.4, 9.8, 10.6]; // sculpted rows, back to front

interface Key {
  i: number;
  code: string;
  cx: number;
  cy: number;
  w: number;
  row: number;
  role: Role;
}
const KEYS: Key[] = LAYOUT.flatMap((row, r) => {
  let cursor = -8 * U;
  return row.map(([w, role], c) => {
    const key = { i: 0, code: CODES[r][c], cx: cursor + (w * U) / 2, cy: (r - 2.5) * U, w, row: r, role };
    cursor += w * U;
    return key;
  });
}).map((key, i) => ({ ...key, i }));

const CASE: Plan = { x: -156.5, y: -61.5, w: 313, d: 123, r: 9 };
const TUB_H = 14;
const PCB: Plan = { x: -151, y: -57, w: 302, d: 114, r: 3 };
const PCB_Z = 8;
const PLATE: Plan = { x: -152, y: -58, w: 304, d: 116, r: 3 };
const PLATE_Z = 13;
const SW_Z = 14.5;
const SW_H = 7.5;
const STEM_Z = SW_Z + SW_H;
const CAP_Z = 24;
const FRAME_Z = TUB_H;
const FRAME_H = 16;
const RIM = 5.5;
const GAP = 44; // mm between layers when fully apart
const TRAVEL = 4; // key press, mm

const Z_OF: Record<LayerId, number> = { case: 0, pcb: PCB_Z, plate: PLATE_Z, switches: SW_Z, caps: CAP_Z, frame: FRAME_Z };
const lift = (id: LayerId, e: number) => ORDER.indexOf(id) * GAP * e;

// ── projection ─────────────────────────────────────────
const W = 900;
const H = 760;
// Fig 5's elevation; turned further than its 42° because a board is 2.5:1 —
// at 42° the long side runs down the frame instead of across it
const VIEW = { azimuth: 60, elevation: 38 };
const corners = (top: number): Point3[] => k.boxCorners(CASE, 0, top);
const P: Projection = k.fitProjection(corners(FRAME_Z + FRAME_H + GAP * 5), W, H, { pad: 40, ...VIEW });
const PA: Projection = k.fitProjection(corners(CAP_Z + 11), W, H, { pad: 70, ...VIEW });

const at = (p: Point3) => k.iso(p, P);
const S = k.solidSvg;
const L = k.lineSvg;
const D = k.dotsSvg;
const slab = (plan: Plan, z: number, h: number, bevel = 0.4, steps = 4) => k.slabOf(plan, z, h, P, steps, bevel);
// Painter's order for a grid of boxes seen from +x/+y: back row first, then
// along the row. Sorting by centre depth put the spacebar (centre far back on
// a 6.25u cap) under its neighbours.
const byDepth = <T extends { cx: number; row: number }>(list: T[]) =>
  [...list].sort((p, q) => p.row - q.row || p.cx - q.cx);
const square = (cx: number, cy: number, half: number, r: number): Plan => ({ x: cx - half, y: cy - half, w: half * 2, d: half * 2, r });
const capPlan = (key: Key): Plan => ({ x: key.cx - (key.w * U) / 2 + 0.9, y: key.cy - U / 2 + 0.9, w: key.w * U - 1.8, d: U - 1.8, r: 2.2 });

// ── layers ─────────────────────────────────────────────
function tub() {
  const cavity = k.insetPlan(CASE, 4.5);
  return [
    S(slab(CASE, 0, TUB_H, 1.4, 8), { tone: 'mid' }),
    S(slab(cavity, TUB_H, 0.01, 0, 8), { tone: 'lo', flat: true, crease: 'none' }),
    D(k.corners(cavity, 6).map(([x, y]) => at([x, y, TUB_H])), { size: 0.5, tone: 'lo' }),
  ].join('');
}

function pcb() {
  const top = PCB_Z + 1.6;
  const screws = k.corners(PCB, 7);
  return [
    S(slab(PCB, PCB_Z, 1.6, 0.3, 6), { tone: 'mid' }),
    // a hot-swap socket under every key
    D(KEYS.map((key) => at([key.cx, key.cy, top])), { size: 0.55, tone: 'lo' }),
    L(screws.map(([x, y]) => k.ring(x, y, 2.2, top, P, 16)).join(''), { tone: 'lo' }),
    D(screws.map(([x, y]) => at([x, y, top])), { size: 0.45 }),
    k.faceTextSvg(k.topMatrix([PCB.x + 8, PCB.y + PCB.d - 6], top, P, 'x'), 'SEVENTY-FIVE  REV 2', { size: 3.2, tone: 'lo' }),
  ].join('');
}

function plate() {
  const top = PLATE_Z + 1.5;
  return [
    S(slab(PLATE, PLATE_Z, 1.5, 0.4, 6), { tone: 'mid' }),
    L(KEYS.map((key) => k.planOutline(square(key.cx, key.cy, 7, 0.8), top, P, 2)).join(''), { tone: 'lo' }),
  ].join('');
}

function switches() {
  return byDepth(KEYS)
    .map((key) =>
      [
        S(slab(square(key.cx, key.cy, 7.5, 1.5), SW_Z, SW_H, 0.5, 3), { tone: 'mid' }),
        S(slab(square(key.cx, key.cy, 2.4, 0.4), STEM_Z, 3.4, 0.2, 2), { tone: 'hi', lit: true, className: 'kb-stem' }),
      ].join(''),
    )
    .join('');
}

function caps() {
  return byDepth(KEYS)
    .map((key) => {
      const plan = capPlan(key);
      const h = CAP_H[key.row];
      const esc = key.role === 'e';
      return `<g class="kb-cap" data-key="${key.i}">${S(slab(plan, CAP_Z, h, 1.6, 4), {
        tone: 'hi',
        lit: esc,
        className: esc ? 'kb-esc' : undefined,
      })}${L(k.planOutline(k.insetPlan(plan, 2.6), CAP_Z + h, P, 4), { tone: 'faint' })}</g>`;
    })
    .join('');
}

// the frame is four bars, split by which side of the board faces the viewer:
// the back two draw under the caps, the front two over them
const BARS: Plan[] = [
  { x: CASE.x, y: CASE.y, w: CASE.w, d: RIM, r: 3 },
  { x: CASE.x, y: CASE.y + CASE.d - RIM, w: CASE.w, d: RIM, r: 3 },
  { x: CASE.x, y: CASE.y + RIM - 0.5, w: RIM, d: CASE.d - RIM * 2 + 1, r: 0.6 },
  { x: CASE.x + CASE.w - RIM, y: CASE.y + RIM - 0.5, w: RIM, d: CASE.d - RIM * 2 + 1, r: 0.6 },
];
const facing = (p: Plan) => k.depthOf([p.x + p.w / 2, p.y + p.d / 2, 0], P) > 0;
const bars = (front: boolean) =>
  BARS.filter((p) => facing(p) === front)
    .map((p) => S(slab(p, FRAME_Z, FRAME_H, 0.8, 4), { tone: 'mid' }))
    .join('');

const layer = (id: LayerId, body: string, part?: string) =>
  `<g data-layer="${id}"${part ? ` data-part="${part}"` : ''}>${body}</g>`;

export const SVG = k.figureSvg({
  width: W,
  height: H,
  className: 'kb-svg',
  label:
    'A 75 percent keyboard drawn in isometric: case, PCB, plate, eighty-four switches, keycaps and frame, stacked in six layers that separate as you scroll.',
  body: [
    `<g data-part="root">`,
    `<path class="iso-halo" d="${k.haloOf(CASE, 0, TUB_H, P)}"/>`,
    layer('case', tub()),
    layer('pcb', pcb()),
    layer('plate', plate()),
    layer('switches', switches()),
    layer('frame', bars(false), 'frame-back'),
    layer('caps', caps()),
    layer('frame', bars(true), 'frame-front'),
    `</g>`,
  ],
});

// ── live ───────────────────────────────────────────────
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export interface Board {
  /** 0 = assembled, 1 = apart. The drawing eases toward it. */
  setExplode(e: number): void;
  /** Dim every layer but this one. null = none dimmed. */
  setFocus(id: LayerId | null): void;
  setStem(hex: string): void;
  /** Press / release a key by KeyboardEvent.code or index. Returns false if the board has no such key. */
  press(code: string | number, down: boolean): boolean;
  dispose(): void;
}

export function mountBoard(stage: HTMLElement, onPress?: (down: boolean, code: string) => void): Board {
  const svg = stage.querySelector('svg')!;
  const root = svg.querySelector<SVGGElement>('[data-part="root"]')!;
  const groups = [...svg.querySelectorAll<SVGGElement>('[data-layer]')];
  const caps = svg.querySelector('[data-layer="caps"]')!;
  const frameBack = svg.querySelector('[data-part="frame-back"]')!;
  const capEls = new Map<number, SVGGElement>();
  svg.querySelectorAll<SVGGElement>('.kb-cap').forEach((g) => capEls.set(Number(g.dataset.key), g));
  const byCode = new Map(KEYS.map((key) => [key.code, key.i]));

  const still = matchMedia('(prefers-reduced-motion: reduce)');
  // the assembled view is framed tighter: lerp a root transform between the two fits
  const r = PA.scale / P.scale;
  const tx = PA.origin[0] - r * P.origin[0];
  const ty = PA.origin[1] - r * P.origin[1];

  let shown = still.matches ? 0 : 1; // lands apart and assembles itself: the intro
  let target = 0;
  let frame = 0;
  let last = 0;
  let backAbove = false;

  function draw(e: number) {
    const s = r + (1 - r) * e;
    root.setAttribute('transform', `matrix(${s} 0 0 ${s} ${tx * (1 - e)} ${ty * (1 - e)})`);
    for (const g of groups) {
      const id = g.dataset.layer as LayerId;
      g.setAttribute('transform', k.translateAlong(P, [0, 0, lift(id, e)]));
    }
    // inside the tub when assembled: hidden, then they surface as it opens
    const inner = String(smooth(0.06, 0.22, e));
    for (const g of groups) {
      const id = g.dataset.layer;
      if (id === 'pcb' || id === 'plate' || id === 'switches') g.style.opacity = inner;
    }
    // once the frame clears the cap tops, its back bars have to draw over them
    const above = Z_OF.frame + lift('frame', e) > CAP_Z + 11 + lift('caps', e);
    if (above !== backAbove) {
      backAbove = above;
      if (above) caps.after(frameBack);
      else caps.before(frameBack);
    }
  }

  function tick(now: number) {
    const dt = last ? Math.min((now - last) / 1000, 1 / 20) : 1 / 60;
    last = now;
    shown += (target - shown) * (1 - Math.exp(-dt / 0.16));
    if (Math.abs(target - shown) < 0.0005) shown = target;
    draw(shown);
    frame = shown === target ? 0 : requestAnimationFrame(tick);
  }
  const run = () => {
    if (frame) return;
    if (still.matches) {
      shown = target;
      draw(shown);
      return;
    }
    last = 0;
    frame = requestAnimationFrame(tick);
  };

  const pressVec = k.axisVector(P, [0, 0, -TRAVEL]);
  const press = (code: string | number, down: boolean) => {
    const i = typeof code === 'number' ? code : byCode.get(code);
    const el = i === undefined ? undefined : capEls.get(i);
    if (!el || i === undefined) return false;
    if (down === el.hasAttribute('data-down')) return true; // key repeat
    el.toggleAttribute('data-down', down);
    el.style.transform = down ? `translate(${pressVec[0]}px, ${pressVec[1]}px)` : '';
    onPress?.(down, KEYS[i].code);
    return true;
  };

  // pointer: press whichever cap is under the finger, release anywhere
  const ac = new AbortController();
  const o = { signal: ac.signal };
  let held: number | null = null;
  svg.addEventListener(
    'pointerdown',
    (e) => {
      const cap = (e.target as Element).closest<SVGGElement>('.kb-cap');
      if (!cap) return;
      held = Number(cap.dataset.key);
      press(held, true);
    },
    o,
  );
  const up = () => {
    if (held !== null) press(held, false);
    held = null;
  };
  addEventListener('pointerup', up, o);
  addEventListener('pointercancel', up, o);

  draw(shown);
  run();

  return {
    setExplode(e) {
      target = Math.min(1, Math.max(0, e));
      run();
    },
    setFocus(id) {
      for (const g of groups) g.toggleAttribute('data-dim', id !== null && g.dataset.layer !== id);
    },
    setStem(hex) {
      svg.style.setProperty('--kb-stem', hex);
    },
    press,
    dispose() {
      ac.abort();
      cancelAnimationFrame(frame);
    },
  };
}
