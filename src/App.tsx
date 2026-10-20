import { Fragment, useEffect, useRef, useState } from 'react';
import { LAYERS, SWITCHES } from './content';
import type { SwitchSpec } from './content';
import { Keyswitch } from './figure/Keyswitch';
import { SVG as BOARD_SVG, mountBoard } from './figure/boardModel';
import type { Board, LayerId } from './figure/boardModel';
import { playSwitch } from './figure/switchSound';
import './iso/iso.css';

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const label = (code: string) => code.replace(/^(Key|Digit)/, '').toLowerCase();

/**
 * React owns the DOM shell. Fig 1 is an SVG string injected once; scroll,
 * presses and focus write straight onto it. React state is only the selected
 * switch.
 */
export default function App() {
  const stageRef = useRef<HTMLDivElement>(null);
  const readoutRef = useRef<HTMLSpanElement>(null);
  const boardRef = useRef<Board | null>(null);
  const [sw, setSw] = useState<SwitchSpec['id']>(SWITCHES[0].id);
  const swRef = useRef(sw);
  swRef.current = sw;

  // ── Fig 1: mount, scroll → explode, keys → presses + sound ─────────
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    // React never owns these children: the live code writes straight onto them
    stage.innerHTML = BOARD_SVG;
    const say = (text: string) => {
      if (readoutRef.current) readoutRef.current.textContent = text;
    };
    const board = mountBoard(stage, (down, code) => {
      playSwitch(swRef.current, down);
      if (down) say(`${swRef.current} · ${label(code)}`);
    });
    board.setStem(hex(SWITCHES[0].hex));
    boardRef.current = board;

    // apart while the layer sections scroll by; back together on the last hero
    const ac = new AbortController();
    const onScroll = () => {
      const vh = innerHeight;
      const open = clamp01(scrollY / (vh * 0.8));
      const end = document.querySelector('[data-reassemble]')?.getBoundingClientRect().top ?? Infinity;
      board.setExplode(Math.min(open, clamp01(end / (vh * 0.8))));
      const max = document.documentElement.scrollHeight - vh;
      document.documentElement.style.setProperty('--p', String(max > 0 ? clamp01(scrollY / max) : 0));
    };
    addEventListener('scroll', onScroll, { passive: true, signal: ac.signal });
    onScroll();

    // type on your own keyboard once the drawing has focus
    const key = (down: boolean) => (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) return;
      if (board.press(e.code, down) && e.code !== 'Tab') e.preventDefault();
    };
    stage.addEventListener('keydown', key(true), { signal: ac.signal });
    stage.addEventListener('keyup', key(false), { signal: ac.signal });
    // focus so typing works, without the keyboard focus ring a mouse user never asked for
    stage.addEventListener('pointerdown', () => stage.focus({ focusVisible: false } as FocusOptions), {
      signal: ac.signal,
    });

    return () => {
      ac.abort();
      board.dispose();
      boardRef.current = null;
    };
  }, []);

  // The section mid-screen names itself in the plate's readout and brings its
  // layer forward. Written straight to the DOM — not worth a re-render.
  useEffect(() => {
    const out = readoutRef.current;
    if (!out) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const el = e.target as HTMLElement;
          out.textContent = el.dataset.readout ?? '';
          boardRef.current?.setFocus((el.dataset.layer as LayerId | undefined) ?? null);
        }
      },
      { rootMargin: '-50% 0px -50% 0px' },
    );
    document.querySelectorAll('[data-readout]').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  const spec = SWITCHES.find((s) => s.id === sw)!;
  const pick = (id: SwitchSpec['id']) => {
    setSw(id);
    boardRef.current?.setStem(hex(SWITCHES.find((s) => s.id === id)!.hex));
  };

  return (
    <div className="iso page">
      {/* Fig 1: same plate, same corner labels, same iso kit as Fig 5 */}
      <div className="plate">
        <span data-corner="fig">Fig 1</span>
        <span data-corner="title">Seventy-five · exploded</span>
        <span data-corner="hint">Click, then type</span>
        <span data-corner="readout" ref={readoutRef}>
          assembled · 84 keys
        </span>
        <div
          ref={stageRef}
          className="kb-stage"
          tabIndex={0}
          role="application"
          aria-label="Keyboard drawing. Click a key, or focus it and type, to press keys."
        />
      </div>

      <nav>
        <span className="mark">SEVENTY-FIVE</span>
        <ul>
          <li>
            <a href="#layers">Layers</a>
          </li>
          <li>
            <a href="#specs">Specs</a>
          </li>
          <li>
            <a href="#anatomy">Anatomy</a>
          </li>
          <li>
            <a href="#">Buy</a>
          </li>
        </ul>
      </nav>

      <main>
        <section className="hero" data-readout="assembled · 84 keys">
          <span className="no">No. 00</span>
          <h1>
            Eighty&#8209;four
            <br />
            keys.
            <br />
            <em>One</em> stack.
          </h1>
          <p className="sub">
            A 75% high-profile board, taken apart and put back together while you scroll.
          </p>
          {/* the first thing you can do: pick a stem and hear it */}
          <div className="hero-stems" role="radiogroup" aria-label="Switch">
            {SWITCHES.map((s) => (
              <button
                key={s.id}
                type="button"
                role="radio"
                aria-checked={s.id === sw}
                onClick={() => {
                  pick(s.id);
                  playSwitch(s.id, true);
                  setTimeout(() => playSwitch(s.id, false), 90);
                }}
                style={{ ['--c' as string]: hex(s.hex) }}
              >
                {s.name}
              </button>
            ))}
          </div>
          <div className="meta">
            <span>
              Keys<b>84</b>
            </span>
            <span>
              Layers<b>13</b>
            </span>
            <span>
              Profile<b>High</b>
            </span>
          </div>
        </section>

        {LAYERS.map((l) => (
          <Fragment key={l.idx}>
            <section
              className="layer"
              id={l.anchor}
              data-layer={l.layer}
              data-readout={`${l.idx.toLowerCase()} · ${l.title.toLowerCase()}`}
            >
              <span className="idx">{l.idx}</span>
              <h2>{l.title}</h2>
              <p>{l.body}</p>
            </section>
            {/* the picker sits directly under the switch layer, because that is
                where the board is showing bare switches */}
            {l.title === 'Switches' && <SwitchPicker sw={sw} spec={spec} pick={pick} />}
          </Fragment>
        ))}

        <section className="hero" data-readout="reassembled · 84 keys" data-reassemble="">
          <span className="no">No. 04</span>
          <h1>
            Back
            <br />
            <em>together</em>.
          </h1>
          <p className="sub">Scroll up and it reassembles. Click any key to press it.</p>
        </section>

        <Keyswitch sw={sw} pick={pick} />
      </main>

      <div className="bar" />
    </div>
  );
}

function SwitchPicker({
  sw,
  spec,
  pick,
}: {
  sw: SwitchSpec['id'];
  spec: SwitchSpec;
  pick: (id: SwitchSpec['id']) => void;
}) {
  // data-parts lists the highest switch first: callout slots fill top-down, and
  // matching that order to the diagonal keeps the leader lines from crossing
  return (
    <section
      className="picker"
      id="switches"
      data-layer="switches"
      data-readout={`layer 05 · ${spec.name.toLowerCase()} stem`}
    >
          <span className="idx">LAYER 05 — PICK ONE</span>
          <h2>Three stems.</h2>
          {/* same control as Fig 5's stem list, so the two pickers read as one */}
          <div className="an-stems" role="radiogroup" aria-label="Stem">
            {SWITCHES.map((s) => (
              <button
                key={s.id}
                type="button"
                role="radio"
                aria-checked={s.id === sw}
                onClick={() => pick(s.id)}
                style={{ ['--c' as string]: hex(s.hex) }}
              >
                <b>{s.name}</b>
                <span>
                  {s.feel} · {s.force}
                </span>
              </button>
            ))}
          </div>
          <p>{spec.body}</p>
          <dl>
            <div>
              <dt>Feel</dt>
              <dd>{spec.feel}</dd>
            </div>
            <div>
              <dt>Force</dt>
              <dd>{spec.force}</dd>
            </div>
            <div>
              <dt>Travel</dt>
              <dd>{spec.travel}</dd>
            </div>
          </dl>
    </section>
  );
}
