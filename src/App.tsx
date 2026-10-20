import { Fragment, useEffect, useRef, useState } from 'react';
import { startEngine } from './three/engine';
import type { Engine } from './three/engine';
import { LAYERS, SWITCHES } from './content';
import type { SwitchSpec } from './content';
import { Keyswitch } from './figure/Keyswitch';

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

/**
 * React owns the DOM shell. It does NOT own anything that changes per frame —
 * the scroll progress bar reads a CSS custom property the render loop writes,
 * and every Object3D transform is mutated directly. Two pieces of state exist,
 * and each flips at most once: `ready` and `error`.
 */
export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // the only per-interaction state React owns: which switch is selected. The
  // colour tween itself runs in three.js, not in a re-render.
  const [sw, setSw] = useState<SwitchSpec['id']>(SWITCHES[0].id);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let engine: Engine | null = null;
    let cancelled = false;

    startEngine({
      canvas,
      stages: LAYERS.length + 1, // one scroll hold per layer section, plus the picker
      onReady: () => !cancelled && setReady(true),
    })
      .then((e) => {
        // StrictMode runs the effect twice; if cleanup already fired while the
        // .glb was loading, tear the second engine down immediately.
        if (cancelled) e.dispose();
        else {
          engine = e;
          engineRef.current = e;
        }
      })
      .catch((err: unknown) => {
        if (cancelled || (err as Error)?.name === 'AbortError') return;
        console.error('[keeb-hero]', err);
        setError(err instanceof Error ? err.message : String(err));
      });

    return () => {
      cancelled = true;
      engine?.dispose();
      engine = null;
      engineRef.current = null;
    };
  }, []);

  const spec = SWITCHES.find((s) => s.id === sw)!;
  const pick = (id: SwitchSpec['id']) => {
    setSw(id);
    engineRef.current?.switches.select(id);
  };

  return (
    <>
      <canvas id="app" ref={canvasRef} />

      {!ready && (
        <div className="boot" {...(error ? { 'data-error': '' } : {})}>
          {error ?? 'loading'}
        </div>
      )}

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
        <span style={{ opacity: 0.62 }}>press D</span>
      </nav>

      <main>
        <section className="hero">
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
            <section className="layer" id={l.anchor} data-parts={l.parts?.join(',')}>
              <span className="idx">{l.idx}</span>
              <h2>{l.title}</h2>
              <p>{l.body}</p>
            </section>
            {/* the picker sits directly under the switch layer, because that is
                where the board is showing bare switches */}
            {l.title === 'Switches' && <SwitchPicker sw={sw} spec={spec} pick={pick} />}
          </Fragment>
        ))}

        <section className="hero">
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
      <div className="hint">scroll to disassemble</div>
    </>
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
    <section className="picker" id="switches" data-parts="HERO_brown,HERO_red,HERO_blue">
          <span className="idx">LAYER 05 — PICK ONE</span>
          <h2>Three stems.</h2>
          <div className="swatches">
            {SWITCHES.map((s) => (
              <button
                key={s.id}
                type="button"
                aria-pressed={s.id === sw}
                onClick={() => pick(s.id)}
              >
                <i style={{ background: hex(s.hex) }} />
                <b>{s.name}</b>
                <span>{s.feel}</span>
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
