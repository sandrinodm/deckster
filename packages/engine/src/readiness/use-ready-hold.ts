import { useLayoutEffect } from 'react';

import { useSlideContext } from '#steps/slide-context.ts';

/**
 * Holds the enclosing slide's readiness while `pending` is `true`: `window.__deck.ready()` (and so
 * `deck shot`, `deck lint` and export) waits until every hold on the slide on screen is released,
 * or on every slide in static mode. Use it in any component whose final look arrives late: async
 * code highlighting, diagram layout, chart data, an iframe, or steps registered after loading.
 * Release the hold in the same render that shows the final content, so steps it registers are
 * counted before `ready()` resolves.
 *
 * ```tsx
 * const [rows, setRows] = useState<Row[]>();
 * useReadyHold(rows === undefined);
 * ```
 *
 * @param pending - Whether the component is still loading.
 * @throws Error when called outside a slide.
 */
export function useReadyHold(pending: boolean): void {
  const { holdReady } = useSlideContext('useReadyHold()');
  useLayoutEffect(() => (pending ? holdReady() : undefined), [pending, holdReady]);
}
