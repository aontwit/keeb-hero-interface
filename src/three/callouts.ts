import * as THREE from 'three';
import { animate, utils } from 'animejs';
import { CALLOUTS } from '../content';

/**
 * Leader lines, drawn the way a parts diagram draws them: a dot on the part, a
 * long diagonal out to the margin, a short horizontal run, and the label parked
 * in a fixed column at the edge of the frame.
 *
 * The labels live in slots, not next to the parts they name. That is what keeps
 * the composition calm while the board tumbles around underneath — a slot never
 * moves, so nothing can collide, overlap the body copy, or fly off the edge,
 * and the anchors only have to sit ON the part rather than somewhere with room
 * for text beside it.
 *
 * The anchor is a point in the part's own space, so it rides the explode, the
 * orbit and the idle sway for free — projected once a frame into one <path>.
 *
 * Which callouts are up is decided by an IntersectionObserver over the sections
 * that declare `data-parts` — the page already knows which layer it is talking
 * about, so nothing has to re-derive it from scroll maths.
 */

const NS = 'http://www.w3.org/2000/svg';
const el = <K extends keyof SVGElementTagNameMap>(tag: K, cls?: string) => {
  const node = document.createElementNS(NS, tag);
  if (cls) node.setAttribute('class', cls);
  return node;
};

/** Label column geometry, px. */
const MARGIN = 44; // frame edge -> outer edge of the text
const LABEL_W = 138; // reserved for the text block, so the line always stops clear of it
const STUB = 64; // horizontal run between the diagonal and the label
const SLOT_TOP = 76; // first slot: under the nav, above every section's copy
const SLOT_H = 44;

interface Line {
  node: THREE.Object3D;
  at: THREE.Vector3;
  g: SVGGElement;
  path: SVGPathElement;
  dot: SVGCircleElement;
  label: SVGGElement;
  note: SVGTextElement;
  shown: boolean;
  slot: number;
  lastX: number;
  lastY: number;
}

export interface Callouts {
  update(): void;
  /** Retitle a live callout — the switch swap rewrites its own note. */
  setNote(part: string, note: string): void;
  dispose(): void;
}

export function createCallouts(
  camera: THREE.PerspectiveCamera,
  nodes: Record<string, THREE.Object3D | null>,
  signal: AbortSignal,
  onActivate?: (keys: string[]) => void,
): Callouts {
  const svg = el('svg', 'callouts');
  svg.setAttribute('aria-hidden', 'true');
  document.body.append(svg);

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const lines = new Map<string, Line>();

  for (const [key, c] of Object.entries(CALLOUTS)) {
    const node = nodes[c.part];
    if (!node) continue;

    const g = el('g', 'co');
    const path = el('path', 'lead');
    path.setAttribute('pathLength', '1'); // normalised, so one dash rule fits every length
    const dot = el('circle', 'dot');
    dot.setAttribute('r', '3.5');
    const label = el('g', 'lbl');
    const title = el('text', 't');
    title.textContent = c.title;
    const note = el('text', 'n');
    note.setAttribute('y', '15');
    note.textContent = c.note;
    label.append(title, note);
    g.append(path, dot, label);
    svg.append(g);

    lines.set(key, {
      node,
      at: new THREE.Vector3(...c.at),
      g,
      path,
      dot,
      label,
      note,
      shown: false,
      slot: 0,
      lastX: NaN,
      lastY: NaN,
    });
  }

  // ── which set is live ───────────────────────────────────────────────
  const show = (l: Line) => {
    if (l.shown) return;
    l.shown = true;
    l.g.classList.add('on');
    if (reduced) {
      utils.set(l.path, { strokeDashoffset: 0 });
      utils.set([l.dot, l.label], { opacity: 1 });
      return;
    }
    // the line draws itself in from the part outwards, then the label lands
    animate(l.path, { strokeDashoffset: [1, 0], duration: 620, ease: 'outQuart' });
    animate(l.dot, { opacity: [0, 1], scale: [0.2, 1], duration: 340, ease: 'outBack' });
    animate(l.label, { opacity: [0, 1], duration: 420, delay: 280, ease: 'outQuad' });
  };

  const hide = (l: Line) => {
    if (!l.shown) return;
    l.shown = false;
    l.g.classList.remove('on');
    if (reduced) {
      utils.set(l.path, { strokeDashoffset: 1 });
      utils.set([l.dot, l.label], { opacity: 0 });
      return;
    }
    animate(l.path, { strokeDashoffset: 1, duration: 260, ease: 'inQuad' });
    animate([l.dot, l.label], { opacity: 0, duration: 200, ease: 'inQuad' });
  };

  const activate = (keys: string[]) => {
    // slots follow the declared order, not screen position: a slot that never
    // re-sorts is a slot that never jitters mid-scroll
    keys.forEach((k, i) => {
      const l = lines.get(k);
      if (l) l.slot = i;
    });
    for (const [key, l] of lines) (keys.includes(key) ? show : hide)(l);
    onActivate?.(keys);
  };

  // EVERY section is observed, not just the ones with callouts: scrolling into
  // a section that declares none has to clear the last set, or its labels hang
  // around pointing at parts nobody is reading about.
  const sections = [...document.querySelectorAll<HTMLElement>('main section')];
  const live = new Set<HTMLElement>();
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const s = e.target as HTMLElement;
        if (e.isIntersecting) live.add(s);
        else live.delete(s);
      }
      // A jump-scroll delivers several entries at once, so "the section being
      // read" is the one nearest the middle of the viewport — not whichever
      // entry happened to land last in the batch.
      const mid = innerHeight / 2;
      let best: HTMLElement | null = null;
      let bestD = Infinity;
      for (const s of live) {
        const r = s.getBoundingClientRect();
        const d = Math.abs(r.top + r.height / 2 - mid);
        if (d < bestD) {
          bestD = d;
          best = s;
        }
      }
      activate((best?.dataset.parts ?? '').split(',').filter(Boolean));
    },
    // only the section crossing the middle band counts as "the one being read"
    { rootMargin: '-45% 0px -45% 0px' },
  );
  for (const s of sections) io.observe(s);
  signal.addEventListener('abort', () => io.disconnect());

  // ── per-frame projection ────────────────────────────────────────────
  const v = new THREE.Vector3();

  return {
    update() {
      const w = innerWidth;
      const h = innerHeight;
      if (w < 900) return; // labels and body copy would fight for the same column

      for (const l of lines.values()) {
        if (!l.shown) continue;
        l.node.localToWorld(v.copy(l.at));
        v.project(camera);
        if (v.z > 1) {
          l.g.style.visibility = 'hidden';
          continue;
        }
        const x = Math.round((v.x * 0.5 + 0.5) * w);
        const y = Math.round((-v.y * 0.5 + 0.5) * h);
        if (x === l.lastX && y === l.lastY) continue;
        l.lastX = x;
        l.lastY = y;
        l.g.style.visibility = 'visible';

        // The column is always top-left: the board is panned into the right of
        // the frame at every scroll position, and the body copy is vertically
        // centred, so that corner is the one patch of dark nothing a label can
        // sit on in every section.
        const slotY = SLOT_TOP + l.slot * SLOT_H;
        const endX = MARGIN + LABEL_W;

        l.path.setAttribute('d', `M${x} ${y}L${endX + STUB} ${slotY}L${endX} ${slotY}`);
        l.dot.setAttribute('cx', String(x));
        l.dot.setAttribute('cy', String(y));
        l.label.setAttribute('transform', `translate(${MARGIN} ${slotY - 4})`);
      }
    },
    setNote(part, text) {
      const l = lines.get(part);
      if (l) l.note.textContent = text;
    },
    dispose() {
      io.disconnect();
      svg.remove();
    },
  };
}
