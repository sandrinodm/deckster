import { describe, expect, it } from 'vite-plus/test';

import type { DrawInput } from '#charts/frame/chart-frame.tsx';
import type { SceneLayer } from '#charts/frame/scene.ts';
import type { MarketMovementProps } from '#charts/market-movement/market-movement.tsx';

import { TEST_THEME, testMeasure } from '#charts/frame/chart-theme.fixture.ts';
import { planMarketMovement } from '#charts/market-movement/market-movement.tsx';

const INPUT: DrawInput = {
  size: { width: 1000, height: 450 },
  theme: TEST_THEME,
  measure: testMeasure,
  datasets: undefined,
  summaryId: 'summary',
  label: undefined,
};

const PROPS: MarketMovementProps = {
  data: [
    { date: '2026-10-31', entity: 'Wrenhaul', price: 3, punctual: 98 },
    { date: '2026-10-31', entity: 'Courier', price: 8, punctual: 91 },
    { date: '2026-06-30', entity: 'Courier', price: 7, punctual: 90 },
    { date: '2026-03-31', entity: 'Wrenhaul', price: 5, punctual: 89 },
  ],
  highlight: 'Wrenhaul',
  x: 'price',
  y: 'punctual',
};

describe('MarketMovement', () => {
  it('aligns sparse coordinates with dates and keeps the axes fixed across the build', () => {
    const built = planMarketMovement({ ...PROPS, buildFrom: 4 }, INPUT);
    const still = planMarketMovement(PROPS, INPUT);
    expect(built.scene.layers[0]).toEqual(still.scene.layers[0]);
    expect(built.spec.categories).toEqual(['Mar 31, 2026', 'Jun 30, 2026', 'Oct 31, 2026']);
    expect(built.spec.series.find(({ name }) => name === 'Wrenhaul')).toMatchObject({
      name: 'Wrenhaul',
      values: [89, null, 98],
      x: [5, null, 3],
      labels: ['2026-03-31', null, '2026-10-31'],
      highlighted: true,
    });
    expect(built.scene.layers.at(-2)).toMatchObject({ at: 4, until: 5 });
    expect(still.scene.layers.flatMap(textOf)).toEqual(
      expect.arrayContaining(['Start · Mar 31, 2026', 'Wrenhaul · Oct 31, 2026', 'Courier']),
    );
  });

  it('labels the selected entity at the last observed date when it misses the last period', () => {
    const data = [
      { date: '2026-03-31', entity: 'Wrenhaul', price: 5, punctual: 89 },
      { date: '2026-10-31', entity: 'Courier', price: 8, punctual: 91 },
    ];
    const { scene } = planMarketMovement({ ...PROPS, data }, INPUT);
    expect(scene.layers.at(-1)).toBeDefined();
    expect(scene.layers.flatMap(textOf)).toEqual(
      expect.arrayContaining(['Wrenhaul · Mar 31, 2026', 'Oct 31, 2026', 'Courier']),
    );
  });
});

/**
 * Lists the visible strings in an individual scene layer.
 */
function textOf(layer: SceneLayer): string[] {
  return layer.items.flatMap((item) => (item.kind === 'text' ? item.lines : []));
}
