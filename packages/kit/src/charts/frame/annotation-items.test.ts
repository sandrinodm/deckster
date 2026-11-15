import { describe, expect, it } from 'vite-plus/test';

import type { CartesianGeometry } from '#charts/frame/annotation-items.ts';
import type { PathItem, SceneItem } from '#charts/frame/scene.ts';
import type { ResolvedAnnotation } from '#charts/insight/annotations.ts';

import { annotationLayers } from '#charts/frame/annotation-items.ts';
import { TEST_THEME, testMeasure } from '#charts/frame/chart-theme.fixture.ts';

const XS = [0, 200, 400, 600];

const VALUES = [10, 40, 25, 60];

/**
 * A line chart's geometry: points from the plot's left edge to its right, a category's span clamped
 * to the plot as plan-line clamps it.
 */
function lineGeometry(bracket: 'over' | 'side' = 'side'): CartesianGeometry {
  return {
    orientation: 'vertical',
    plot: { x: 0, y: 0, width: 600, height: 400 },
    span: (index) => {
      const centre = XS[index] ?? 0;
      return [Math.max(0, centre - 100), Math.min(600, centre + 100)];
    },
    value: (value) => 400 - value * 5,
    tip: (_series, index) => {
      const value = VALUES[index];
      return value === undefined ? null : { x: XS[index] ?? 0, y: 400 - value * 5 };
    },
    bracket,
  };
}

/**
 * The ringed dot each callout draws on its point.
 */
function calloutDot(items: readonly SceneItem[]): { cx: number; cy: number } | undefined {
  const dot = items.find((item) => item.kind === 'circle');
  return dot?.kind === 'circle' ? { cx: dot.cx, cy: dot.cy } : undefined;
}

/**
 * A callout at a category, pointing at the series' own value.
 */
function callout(index: number, label: string): ResolvedAnnotation {
  return {
    type: 'callout',
    index,
    value: VALUES[index] ?? null,
    series: 's',
    label,
    at: undefined,
  };
}

const CONTEXT = { theme: TEST_THEME, measure: testMeasure, obstacles: [] };

/**
 * The bar tips of the bracket case: a bar of 4 tops out at y 220, one of -2 ends at y 340.
 */
const TIPS = new Map([
  [1, { x: 200, y: 220 }],
  [2, { x: 350, y: 340 }],
]);

describe('annotationLayers', () => {
  it('sets callouts on the first and last categories on the series point, not a span middle', () => {
    const { front } = annotationLayers(
      [callout(0, 'Launch'), callout(3, 'Best month')],
      lineGeometry(),
      CONTEXT,
    );
    expect(calloutDot(front[0]?.items ?? [])).toEqual({ cx: 0, cy: 350 });
    expect(calloutDot(front[1]?.items ?? [])).toEqual({ cx: 600, cy: 100 });
  });

  it('places brackets before callouts, whatever order they are given in', () => {
    const bracket: ResolvedAnnotation = {
      type: 'bracket',
      from: { index: 1, value: 40 },
      to: { index: 3, value: 60 },
      series: 's',
      label: '+50%',
      tone: 'positive',
      at: 2,
    };
    const { front } = annotationLayers(
      [{ ...callout(1, 'Redesign'), at: 1 }, bracket],
      lineGeometry(),
      CONTEXT,
    );
    expect(front.map((layer) => layer.at)).toEqual([2, 1]);
  });

  it('routes an over bracket above a reference line and from the zero line of a bar below it', () => {
    // Bars: zero at y 300; a bar of 4 tops out at y 220, one of -2 ends at y 340.
    const geometry: CartesianGeometry = {
      orientation: 'vertical',
      plot: { x: 0, y: 0, width: 600, height: 400 },
      span: (index) => [index * 150, index * 150 + 100],
      value: (value) => 300 - value * 20,
      tip: (_series, index) => TIPS.get(index) ?? null,
      bracket: 'over',
    };
    const { front } = annotationLayers(
      [
        { type: 'reference', value: 7, label: 'Plan 7', at: undefined },
        {
          type: 'bracket',
          from: { index: 1, value: 4 },
          to: { index: 2, value: -2 },
          series: 's',
          label: '−6',
          tone: 'negative',
          at: undefined,
        },
      ],
      geometry,
      CONTEXT,
    );
    const path = front[1]?.items.find((item): item is PathItem => item.kind === 'path');
    const match = /^M[\d.]+,([\d.]+)V([\d.]+)H([\d.]+)V([\d.]+)$/u.exec(path?.d ?? '');
    expect(match).not.toBeNull();
    const [, start = '', top = '', , end = ''] = match ?? [];
    const referenceY = 300 - 7 * 20;
    expect(Number(top)).toBeLessThan(referenceY - TEST_THEME.lineWidth * 2);
    expect(Number(start)).toBeLessThanOrEqual(220);
    expect(Number(start)).toBeGreaterThan(Number(top));
    // The leg over the bar below zero starts above the zero line, not at the bar's far end.
    expect(Number(end)).toBeLessThan(300);
    const label = front[1]?.items.find((item) => item.kind === 'text');
    expect(label?.kind === 'text' ? label.y : Infinity).toBeLessThan(referenceY);
  });
});
