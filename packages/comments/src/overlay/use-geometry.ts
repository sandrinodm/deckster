import { useDeck } from '@deckster/engine';
import { useLayoutEffect, useState } from 'react';

import { readGeometry, type CanvasGeometry } from '#overlay/element-target.ts';

/**
 * How long after a slide or step change the overlay measures again, in milliseconds, for content
 * that settles late (images, fonts, entrance motion).
 */
const SETTLE_MS = 350;

/**
 * One measurement of the canvas, with a counter that changes each time one is taken.
 */
type Measurement = {
  /**
   * The canvas's place, or `undefined` before it renders.
   */
  geometry: CanvasGeometry | undefined;

  /**
   * Counts the measurements taken so far.
   */
  tick: number;
};

/**
 * Tracks where the main canvas is while the overlay draws on it: it measures after every slide or
 * step change, when the stage resizes (a docked panel opening, the window resizing) and when the
 * canvas's scale changes. Elements on the slide are measured in the same pass, so outlines and pins
 * drawn from the returned `tick` follow the slide.
 *
 * @param active - Whether anything is drawn; nothing is measured while it is `false`.
 * @returns The geometry, or `undefined` while inactive or before the canvas renders, and a counter
 *   that changes on every measurement.
 */
export function useGeometry(active: boolean): Measurement {
  const { position } = useDeck();
  const [measured, setMeasured] = useState<Measurement>({
    geometry: undefined,
    tick: 0,
  });

  useLayoutEffect(() => {
    if (!active) {
      return undefined;
    }

    /**
     * Reads the canvas's place again.
     */
    const measure = () =>
      setMeasured((last) => ({ geometry: readGeometry(), tick: last.tick + 1 }));
    measure();
    const canvas = document.querySelector('.deck-main .deck-canvas');
    const resize = new ResizeObserver(measure);
    const mutation = new MutationObserver(measure);
    if (canvas?.parentElement) {
      resize.observe(canvas.parentElement);
      mutation.observe(canvas, { attributes: true, attributeFilter: ['style'] });
    }

    window.addEventListener('resize', measure);
    const settle = window.setTimeout(measure, SETTLE_MS);
    return () => {
      resize.disconnect();
      mutation.disconnect();
      window.removeEventListener('resize', measure);
      window.clearTimeout(settle);
    };
  }, [active, position.slide, position.step]);

  return active ? measured : { geometry: undefined, tick: measured.tick };
}
