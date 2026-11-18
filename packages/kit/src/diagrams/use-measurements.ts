import { useCallback, useLayoutEffect, useState, type RefObject } from 'react';

import type { Size } from '#diagrams/flow-layout.ts';

import { EPSILON } from '#diagrams/geometry.ts';
import { maxOf } from '#foundation/lists.ts';

/**
 * The sizes a diagram's layout needs from the rendered text.
 */
export type Measurements = {
  /**
   * The tallest node content, which every node takes.
   */
  nodeHeight: number;

  /**
   * Each node's own content height, by node id; nodes in one grid row share the tallest.
   */
  nodeHeights: ReadonlyMap<string, number>;

  /**
   * Each edge label's size, by edge id.
   */
  labels: ReadonlyMap<string, Size>;

  /**
   * Each group label's size, by group id.
   */
  groupLabels: ReadonlyMap<string, Size>;
};

/**
 * Where a measurement was read: the hidden measuring copy (`[data-measuring]`), which is all that
 * exists before a layout does, or the drawing, which is what is on screen once there is one.
 */
type MeasureScope = 'hidden' | 'drawn';

/**
 * What a read of the diagram was, for {@link nextMeasurement}: from the hidden copy, from the
 * drawing, or from the drawing because one of its elements changed size on its own.
 */
export type MeasurementSource = MeasureScope | 'resized';

/**
 * How far a key's value has come: from the hidden copy (`hidden`), from the first read when that
 * was already of the drawing (`seeded`; the drawing was laid out without any value), or from a
 * drawn read that was compared with the value the drawing was laid out with (`drawn`).
 */
type MeasurementStage = 'hidden' | 'seeded' | 'drawn';

/**
 * A measurement read for one key.
 */
export type MeasurementRead = {
  /**
   * The key the diagram had when it was read.
   */
  key: string;

  /**
   * The sizes read.
   */
  value: Measurements;
};

/**
 * What the hook holds for the current key.
 */
export type MeasurementState = {
  /**
   * The key the value belongs to.
   */
  key: string;

  /**
   * The value the layout is computed from.
   */
  value: Measurements;

  /**
   * Whether the drawing has been measured against the value its layout was computed from.
   */
  settled: boolean;

  /**
   * Where the value came from.
   */
  stage: MeasurementStage;
};

/**
 * What {@link useMeasurementState} returns.
 */
export type MeasurementResult = {
  /**
   * The sizes; `undefined` before the first read for the current key.
   */
  measurements: Measurements | undefined;

  /**
   * Whether the drawing has been measured against the layout that was computed from the value, so
   * the diagram's final look is known. A late change of size (a web font arriving) does not
   * unsettle it.
   */
  settled: boolean;

  /**
   * Hands a read to the state, for {@link useMeasurementEffect}.
   */
  dispatch: MeasurementDispatch;
};

/**
 * Hands a read of the diagram to the state of {@link useMeasurementState}.
 */
export type MeasurementDispatch = (read: MeasurementRead, source: MeasurementSource) => void;

/**
 * Holds a diagram's measurements, in two hooks because the layout is computed from the value this
 * one returns and the drawing that the layout produces is what the other one reads: call this
 * before the layout is computed and {@link useMeasurementEffect} after it.
 *
 * @param key - Changes whenever the diagram's text or node width may have changed.
 * @returns The sizes (`undefined` before the first read), whether they are final, and the function
 *   the effect reports reads to.
 */
export function useMeasurementState(key: string): MeasurementResult {
  const [state, setState] = useState<MeasurementState>();
  const dispatch = useCallback<MeasurementDispatch>(
    (read, source) => setState((previous) => nextMeasurement(previous, read, source)),
    [],
  );
  return state?.key === key
    ? { measurements: state.value, settled: state.settled, dispatch }
    : { measurements: undefined, settled: false, dispatch };
}

/**
 * Measures a diagram's text after each render: the natural height of every node body
 * (`[data-measure="node"]`), and the size of every edge label (`[data-measure-label]`) and group
 * label (`[data-measure-group]`). Sizes are layout geometry in canvas pixels.
 *
 * Before there is a drawing it reads the hidden measuring copy, which knows nothing of shape insets
 * or labels. Once there is one it reads the drawing, once more after the layout that the hidden
 * numbers produced and once after the layout that the drawn numbers produced, and the state reports
 * `settled` after that, so a diagram holds its readiness for the one relayout the drawing needs. A
 * resize of a measured element (a web font arriving, a label changing) measures again.
 *
 * @param root - The diagram's root element.
 * @param key - Changes whenever the diagram's text or node width may have changed.
 * @param drawing - The identity of the drawing on screen (its layout); `undefined` while there is
 *   none, which reads the hidden copy. A new drawing reads the drawing.
 * @param dispatch - From {@link useMeasurementState}.
 */
export function useMeasurementEffect(
  root: RefObject<HTMLElement | null>,
  key: string,
  drawing: object | undefined,
  dispatch: MeasurementDispatch,
): void {
  useLayoutEffect(() => {
    const element = root.current;
    if (element === null) {
      return undefined;
    }

    const scope: MeasureScope = drawing === undefined ? 'hidden' : 'drawn';
    const targets = measuredElements(element, scope);
    const recorded = new Map(targets.map((target) => [target, sizeOf(target)]));

    /**
     * Reads the current scope and hands the read to the state.
     */
    const measure = (source: MeasurementSource): void => {
      dispatch({ key, value: readMeasurements(element, scope) }, source);
    };
    measure(scope);
    const observer = new ResizeObserver((entries) => {
      if (resizedEntries(entries, recorded)) {
        measure(scope === 'hidden' ? 'hidden' : 'resized');
      }
    });
    for (const target of targets) {
      observer.observe(target);
    }

    return () => observer.disconnect();
  }, [root, key, drawing, dispatch]);
}

/**
 * Folds a read into the state of a key. The hidden copy's numbers are the first value. The first
 * read of the drawing is compared with it: the same value settles, a different one (a shape inset,
 * a label) replaces it, for the layout it produces to be drawn and read again, which settles
 * whatever that read says. A read of the hidden copy after the drawing was read is the drawing
 * being replaced during a relayout and is ignored, and a read of the drawing that follows a resize
 * replaces the value without unsettling it. A read for another key starts over.
 *
 * @param state - The state so far; `undefined` before the first read.
 * @param read - The sizes just read.
 * @param source - What was read.
 * @returns The next state; the same object when nothing changes.
 */
export function nextMeasurement(
  state: MeasurementState | undefined,
  read: MeasurementRead,
  source: MeasurementSource,
): MeasurementState {
  if (state === undefined || state.key !== read.key) {
    return {
      key: read.key,
      value: read.value,
      settled: false,
      stage: source === 'hidden' ? 'hidden' : 'seeded',
    };
  }

  switch (source) {
    case 'hidden':
      return nextHidden(state, read);
    case 'drawn':
      return nextDrawn(state, read);
    case 'resized':
      return sameMeasurements(state.value, read.value) ? state : { ...state, value: read.value };
  }
}

/**
 * The state after a read of the hidden copy: the drawing's numbers are never replaced by it.
 *
 * @param state - The state so far.
 * @param read - The sizes just read.
 */
function nextHidden(state: MeasurementState, read: MeasurementRead): MeasurementState {
  if (state.stage !== 'hidden' || sameMeasurements(state.value, read.value)) {
    return state;
  }

  return { ...state, value: read.value };
}

/**
 * The state after a read of the drawing.
 *
 * @param state - The state so far.
 * @param read - The sizes just read.
 */
function nextDrawn(state: MeasurementState, read: MeasurementRead): MeasurementState {
  if (state.stage === 'drawn') {
    return state.settled ? state : { ...state, settled: true };
  }

  if (sameMeasurements(state.value, read.value)) {
    return { ...state, settled: true, stage: 'drawn' };
  }

  return { ...state, value: read.value, settled: false, stage: 'drawn' };
}

/**
 * The measured elements of one scope, which a resize observer watches.
 *
 * @param element - The diagram's root.
 * @param scope - Whether to take the hidden copy's elements or the drawing's.
 */
function measuredElements(element: HTMLElement, scope: MeasureScope): HTMLElement[] {
  return Array.from(
    element.querySelectorAll<HTMLElement>(
      '[data-measure="node"], [data-measure-label], [data-measure-group]',
    ),
  ).filter((target) => inScope(target, scope));
}

/**
 * Whether an element is in a scope: inside the hidden measuring copy, or outside it.
 *
 * @param target - The element.
 * @param scope - The scope.
 */
function inScope(target: HTMLElement, scope: MeasureScope): boolean {
  return (target.closest('[data-measuring]') !== null) === (scope === 'hidden');
}

/**
 * An element's border-box size.
 *
 * @param target - The element.
 */
function sizeOf(target: HTMLElement): Size {
  return { width: target.offsetWidth, height: target.offsetHeight };
}

/**
 * Whether any reported element's own size differs from the one recorded when it was read by at
 * least {@link EPSILON}, and records the new sizes. A browser reports every element once when it is
 * first observed; those reports match what was recorded and do nothing.
 *
 * @param entries - The observer's reports.
 * @param recorded - The size each element had when it was read.
 */
function resizedEntries(
  entries: readonly ResizeObserverEntry[],
  recorded: Map<Element, Size>,
): boolean {
  let resized = false;
  for (const entry of entries) {
    const before = recorded.get(entry.target);
    if (before === undefined || !(entry.target instanceof HTMLElement)) {
      continue;
    }

    const box = entry.borderBoxSize?.[0];
    const now =
      box === undefined
        ? sizeOf(entry.target)
        : { width: Math.round(box.inlineSize), height: Math.round(box.blockSize) };
    if (
      Math.abs(now.width - before.width) >= EPSILON ||
      Math.abs(now.height - before.height) >= EPSILON
    ) {
      recorded.set(entry.target, now);
      resized = true;
    }
  }

  return resized;
}

/**
 * Reads the sizes from one scope of the rendered diagram.
 *
 * @param element - The diagram's root.
 * @param scope - Whether to read the hidden measuring copy or the drawing.
 */
function readMeasurements(element: HTMLElement, scope: MeasureScope): Measurements {
  const bodies = elementsIn(element, '[data-measure="node"]', scope);
  /**
   * The size of every element with an attribute, by its value.
   */
  const sizes = (attribute: string): Map<string, Size> =>
    new Map(
      elementsIn(element, `[${attribute}]`, scope).map((label) => [
        label.getAttribute(attribute) ?? '',
        sizeOf(label),
      ]),
    );
  const heights = new Map(
    bodies.map((body) => [
      body.parentElement?.getAttribute('data-node') ?? '',
      body.offsetHeight + verticalSpace(body),
    ]),
  );
  return {
    nodeHeight: maxOf([...heights.values()], 0),
    nodeHeights: heights,
    labels: sizes('data-measure-label'),
    groupLabels: sizes('data-measure-group'),
  };
}

/**
 * The elements matching a selector in one scope.
 *
 * @param element - The diagram's root.
 * @param selector - The selector.
 * @param scope - The scope.
 */
function elementsIn(element: HTMLElement, selector: string, scope: MeasureScope): HTMLElement[] {
  return Array.from(element.querySelectorAll<HTMLElement>(selector)).filter((target) =>
    inScope(target, scope),
  );
}

/**
 * The room above and below a node body (its margins, which keep it clear of its shape's curved
 * ends), which the node's height must include.
 *
 * @param body - A node body.
 */
function verticalSpace(body: HTMLElement): number {
  const style = getComputedStyle(body);
  return Number.parseFloat(style.marginTop) + Number.parseFloat(style.marginBottom);
}

/**
 * Whether two measurements agree within {@link EPSILON}, so a sub-pixel change is not a new
 * measurement.
 *
 * @param left - A measurement.
 * @param right - Another.
 */
function sameMeasurements(left: Measurements, right: Measurements): boolean {
  return (
    sameHeights(left.nodeHeights, right.nodeHeights) &&
    Math.abs(left.nodeHeight - right.nodeHeight) < EPSILON &&
    sameSizes(left.labels, right.labels) &&
    sameSizes(left.groupLabels, right.groupLabels)
  );
}

/**
 * Whether two maps of node heights have the same nodes at the same heights, within {@link EPSILON}.
 *
 * @param left - Heights by node id.
 * @param right - Another map.
 */
function sameHeights(
  left: ReadonlyMap<string, number>,
  right: ReadonlyMap<string, number>,
): boolean {
  return (
    left.size === right.size &&
    [...left].every(([id, height]) => Math.abs((right.get(id) ?? -1) - height) < EPSILON)
  );
}

/**
 * Whether two maps of sizes have the same keys with sizes that agree within {@link EPSILON}.
 *
 * @param left - Sizes by id.
 * @param right - Another map.
 */
function sameSizes(left: ReadonlyMap<string, Size>, right: ReadonlyMap<string, Size>): boolean {
  return (
    left.size === right.size &&
    [...left].every(([id, size]) => {
      const other = right.get(id);
      return (
        other !== undefined &&
        Math.abs(other.width - size.width) < EPSILON &&
        Math.abs(other.height - size.height) < EPSILON
      );
    })
  );
}
