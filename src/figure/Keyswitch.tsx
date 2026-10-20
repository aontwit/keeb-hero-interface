import { useEffect, useRef, useState } from 'react';
// ponytail: SVG is injected in the effect, not via dangerouslySetInnerHTML — React re-applied the
// string after mount and left the live loop writing to detached nodes
import { SVG, mountKeyswitch, actuationAt, forceAt } from './switchModel';
import type { Reading } from './switchModel';
import { SWITCHES } from '../content';
import type { SwitchSpec } from '../content';
import '../iso/iso.css';
import './keyswitch.css';

type Id = SwitchSpec['id'];

/**
 * The Anatomy plate for the switch. The SVG is a static string built once at
 * module load; everything that moves is written by `mountKeyswitch` straight
 * onto the elements. React only re-renders the big number, and only when the
 * rounded value changes.
 */
export function Keyswitch({ sw, pick }: { sw: Id; pick: (id: Id) => void }) {
  const stage = useRef<HTMLDivElement>(null);
  const handle = useRef<ReturnType<typeof mountKeyswitch> | null>(null);
  const readout = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState({ g: 30, on: false });

  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    // React never owns these children: the live loop writes straight onto them
    el.innerHTML = SVG;
    const h = mountKeyswitch(el, (r: Reading) => {
      const text = `${r.stem} · ${r.mm.toFixed(1)} mm · ${Math.round(r.g)} g${r.on ? ' · on' : ''}`;
      if (readout.current && readout.current.textContent !== text) readout.current.textContent = text;
      const g = Math.round(r.g);
      setShown((s) => (s.g === g && s.on === r.on ? s : { g, on: r.on }));
    });
    handle.current = h;
    return () => {
      h.dispose();
      handle.current = null;
    };
  }, []);

  useEffect(() => handle.current?.setStem(sw), [sw]);

  const spec = SWITCHES.find((s) => s.id === sw)!;
  const pre = actuationAt(sw);

  return (
    <section className="anatomy iso" id="anatomy">
      <header className="an-head">
        <span className="an-no">No. 05</span>
        <h2>
          Keyswitch <em>under the cap</em>
        </h2>
        <p>
          Eighty-four of these sit in the plate. Here is one on a force bench, with the top of the
          housing cut away. Hold it down.
        </p>
      </header>

      <div className="an-grid">
        <figure className="iso-figure">
          <div className="iso-plate">
            <div className="iso-plate-corners" aria-hidden="true">
              <span className="iso-plate-corner" data-corner="fig">
                Fig 5
              </span>
              <span className="iso-plate-corner" data-corner="title">
                Keyswitch
              </span>
              <span className="iso-plate-corner" data-corner="hint">
                Press and hold
              </span>
              <span className="iso-plate-corner" data-corner="readout" ref={readout}>
                {sw} · 0.0 mm · {Math.round(forceAt(sw, 0))} g
              </span>
            </div>
            <div
              ref={stage}
              className="iso-stage"
              tabIndex={0}
              role="slider"
              aria-label="Keyswitch: hold Space or Enter to press the stem"
              aria-valuemin={0}
              aria-valuemax={4}
              aria-valuenow={0}
            />
          </div>
          <figcaption className="iso-legend">
            <span className="iso-caption">
              A {spec.name.toLowerCase()} stem pressed by a force gauge. The spring is preloaded to 30 g and
              adds 7.5 g per millimetre; the leaves touch at {pre.toFixed(1)} mm and the LED on SW1&rsquo;s
              trace lights. Past 3.8 mm the stem meets the housing floor.
            </span>
          </figcaption>
        </figure>

        <aside className="an-read" aria-live="polite">
          <span className="an-label">Force</span>
          <span className="an-big">
            {shown.g}
            <i>g</i>
          </span>
          <span className="an-meter" style={{ ['--v' as string]: Math.min(1, (shown.g - 20) / 70) }} />
          <span className="an-state" data-on={shown.on || undefined}>
            {shown.on ? 'actuated' : `actuates at ${pre.toFixed(1)} mm`}
          </span>

          <div className="an-stems" role="radiogroup" aria-label="Stem">
            {SWITCHES.map((s) => (
              <button
                key={s.id}
                type="button"
                role="radio"
                aria-checked={s.id === sw}
                onClick={() => pick(s.id)}
                style={{ ['--c' as string]: `var(--kf-${s.id})` }}
              >
                <b>{s.name}</b>
                <span>
                  {s.feel} · {s.force}
                </span>
              </button>
            ))}
          </div>
          <p>{spec.body}</p>
        </aside>
      </div>
    </section>
  );
}
