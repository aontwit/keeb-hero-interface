import * as THREE from 'three';
import { animate, utils } from 'animejs';
import { IS_MOBILE } from './scene';
import { allKeys } from './scrollExplode';
import type { KeyState, PartState } from './types';

export interface InteractionConfig {
  parallax: boolean;
  /** Radians at full deflection — a few degrees. */
  tiltX: number;
  tiltY: number;
  damping: number;
  /** Rad amplitude of the idle sway. */
  idleYaw: number;
  /** Rad/sec of the sine. */
  idleRate: number;
  /** cm of vertical float. */
  floatAmp: number;
  floatSpeed: number;
  idle: boolean;
  /**
   * Honour prefers-reduced-motion: the press becomes a short flat dip instead
   * of an elastic overshoot. Overshoot is the part people actually report as
   * nauseating, and WCAG 2.3.3 lets interaction-triggered motion be reduced.
   */
  reduced: boolean;
  /** Bottom-out easing — the switch swap writes the selected type's feel here. */
  pressEase: string;
  /** cm of cap travel on a press. */
  pressDrop: number;
}

export interface Interactions {
  cfg: InteractionConfig;
  /** Press one key at random — the debug panel and the switch picker use it. */
  press(): void;
  update(dt: number): void;
}

/**
 * Pointer parallax, idle sway, and the click micro-interaction.
 *
 * Parallax writes to a rig Object3D that wraps the model, so it never touches
 * the per-part transforms the timeline and scroll scrub own.
 */
export function createInteractions(
  rig: THREE.Object3D,
  camera: THREE.PerspectiveCamera,
  states: PartState[],
  signal: AbortSignal,
  { enableParallax = !IS_MOBILE }: { enableParallax?: boolean } = {},
): Interactions {
  const cfg: InteractionConfig = {
    parallax: enableParallax,
    tiltX: 0.075,
    tiltY: 0.13,
    damping: 0.075,
    // Theirs breathes and returns: per-frame change oscillates 0.03-0.34 and
    // comes back to where it started inside ~2s. An unbounded `elapsed * 0.16`
    // turntable is 15x the motion and never returns, so the composition never
    // actually holds still. Sine instead of ramp.
    idleYaw: 0.042,
    // Theirs cycles in ~2s, but that is a dot orbiting a small ring; on a
    // full-width board 2s reads as a wobble.
    idleRate: 1.2,
    floatAmp: 0.17,
    floatSpeed: 0.5,
    idle: true,
    reduced: false, // engine sets this from the media query, and on change
    pressEase: 'outElastic(1, .55)',
    pressDrop: 0.34,
  };

  let targetX = 0;
  let targetY = 0;
  let curX = 0;
  let curY = 0;

  if (enableParallax) {
    addEventListener(
      'pointermove',
      (e) => {
        targetY = (e.clientX / innerWidth - 0.5) * 2;
        targetX = (e.clientY / innerHeight - 0.5) * 2;
      },
      { passive: true, signal },
    );
    addEventListener('pointerleave', () => {
      targetX = targetY = 0;
    }, { signal });
  }

  // ── click: press the key under the pointer ─────────────────────────
  // The .glb carries one object per key, so the raycast can name the exact cap
  // that was clicked. Before that split a click pressed all fifteen caps in a
  // row, because a row was one merged mesh.
  const keys = allKeys(states);
  const meshes = keys.map((k) => k.node);
  const byNode = new Map(keys.map((k) => [k.node, k]));
  const pressing = new Set<KeyState>();

  const pressKey = (k: KeyState) => {
    if (pressing.has(k)) return; // already on its way down
    pressing.add(k);
    animate(k, {
      press: cfg.reduced
        ? [
            { to: cfg.pressDrop, duration: 60, ease: 'outQuad' },
            { to: 0, duration: 130, ease: 'outQuad' },
          ]
        : [
            { to: cfg.pressDrop, duration: 70, ease: 'outQuad' },
            // per switch type: blue snaps back off the click, red glides
            { to: 0, duration: 420, ease: cfg.pressEase },
          ],
      onComplete: () => pressing.delete(k),
    });
  };

  const press = () => {
    if (keys.length) pressKey(keys[Math.floor(utils.random(0, keys.length))] ?? keys[0]);
  };

  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  addEventListener(
    'pointerdown',
    (e: PointerEvent) => {
      // A miss presses nothing: clicking the copy or the background should not
      // fire a key somewhere off screen.
      ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const hit = ray.intersectObjects(meshes, false)[0];
      const k = hit && byNode.get(hit.object);
      if (k) pressKey(k);
    },
    { signal },
  );

  let elapsed = 0;
  return {
    cfg,
    press,
    update(dt) {
      elapsed += dt;
      const k = Math.min(1, cfg.damping * dt * 60);
      if (cfg.parallax) {
        curX += (targetX - curX) * k;
        curY += (targetY - curY) * k;
      } else {
        curX += (0 - curX) * k;
        curY += (0 - curY) * k;
      }
      rig.rotation.x = curX * cfg.tiltX;
      rig.rotation.z = -curY * cfg.tiltY * 0.35;
      rig.rotation.y =
        (cfg.idle ? Math.sin(elapsed * cfg.idleRate) * cfg.idleYaw : 0) + curY * cfg.tiltY;
      rig.position.y = cfg.idle ? Math.sin(elapsed * cfg.floatSpeed) * cfg.floatAmp : 0;
    },
  };
}
