import { SWITCHES } from '../content';
import type { SwitchSpec } from '../content';
import type { Interactions } from './interactions';

/**
 * Blue / red / brown.
 *
 * On a real board the three differ by one moulded part: the stem. Housing,
 * plate cutout and keycap are identical. The board's 84 stems stay grey (Fig 1
 * is a drawing); the colour shows on the three hero switches. What the swap
 * changes here is the bottom-out easing, which is the part you can feel.
 */
export interface SwitchSwap {
  readonly current: SwitchSpec;
  select(id: SwitchSpec['id']): void;
}

export function createSwitchSwap(
  interactions: Interactions,
  onChange?: (spec: SwitchSpec) => void,
): SwitchSwap {
  let current = SWITCHES[0];

  const select = (id: SwitchSpec['id']) => {
    const spec = SWITCHES.find((s) => s.id === id);
    if (!spec || spec === current) return;
    current = spec;

    interactions.cfg.pressEase = spec.ease;
    interactions.cfg.pressDrop = spec.drop;
    interactions.press(); // let the new feel demonstrate itself
    onChange?.(spec);
  };

  interactions.cfg.pressEase = current.ease;
  interactions.cfg.pressDrop = current.drop;

  return {
    get current() {
      return current;
    },
    select,
  };
}
