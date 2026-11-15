import { useLayoutEffect, useState, type RefObject } from 'react';

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
 * Measures a diagram's text after each render: the natural height of every node body
 * (`[data-measure="node"]`), and the size of every edge label (`[data-measure-label]`) and group
 * label (`[data-measure-group]`). Sizes are layout geometry in canvas pixels. A resize of any of
 * them (a web font arriving, a label changing) measures again.
 *
 * @param root - The diagram's root element.
 * @param key - Changes whenever the diagram's text or node width may have changed.
 * @returns The sizes; `undefined` before the first measurement.
 */
export function useMeasurements(
  root: RefObject<HTMLElement | null>,
  key: string,
): Measurements | undefined {
  const [measured, setMeasured] = useState<{ key: string; value: Measurements }>();
  useLayoutEffect(() => {
    const element = root.current;
    if (element === null) {
      return undefined;
    }

    /**
     * Measures the text and keeps the old value when nothing changed.
     */
    const measure = (): void => {
      const value = readMeasurements(element);
      setMeasured((previous) =>
        previous !== undefined && previous.key === key && sameMeasurements(previous.value, value)
          ? previous
          : { key, value },
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    for (const target of element.querySelectorAll(
      '[data-measure], [data-measure-label], [data-measure-group]',
    )) {
      observer.observe(target);
    }

    return () => observer.disconnect();
  }, [root, key]);
  return measured?.key === key ? measured.value : undefined;
}

/**
 * Reads the sizes from the rendered diagram.
 *
 * @param element - The diagram's root.
 */
function readMeasurements(element: HTMLElement): Measurements {
  const bodies = Array.from(element.querySelectorAll<HTMLElement>('[data-measure="node"]'));
  /**
   * The size of every element with an attribute, by its value.
   */
  const sizes = (attribute: string): Map<string, Size> =>
    new Map(
      Array.from(element.querySelectorAll<HTMLElement>(`[${attribute}]`)).map((label) => [
        label.getAttribute(attribute) ?? '',
        { width: label.offsetWidth, height: label.offsetHeight },
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
