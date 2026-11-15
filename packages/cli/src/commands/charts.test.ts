import { expect, it } from '@effect/vitest';
import { Effect } from 'effect';

import { runCaptured } from '#cli.fixture.ts';

it.effect(
  'deck charts --json prints every chart with its use, messages, props, data, example and accessibility',
  () =>
    Effect.gen(function* () {
      const { code, output } = yield* runCaptured(['charts', '--json']);
      expect(code).toBe(0);
      const catalog = JSON.parse(output) as {
        shared: Record<string, { type: string; description: string }>;
        types: Record<string, Record<string, { type: string }>>;
        charts: {
          name: string;
          useWhen: string;
          messages: string[];
          shared: string[];
          props: Record<string, { type: string }>;
          limits: Record<string, number | string>;
          nulls: string;
          data: string;
          example: string;
          accessibility: string;
        }[];
        messages: Record<string, string[]>;
        insight: Record<string, string>;
        spec: { attribute: string; module: string };
      };
      expect(catalog.charts.map((chart) => chart.name)).toContain('Waterfall');
      const bar = catalog.charts.find((chart) => chart.name === 'BarChart');
      expect(bar?.messages).toEqual(['comparison', 'ranking', 'trend']);
      expect(bar?.shared).toContain('highlight');
      expect(bar?.props['highlight']).toBeUndefined();
      expect(catalog.shared['highlight']?.description).toContain('series');
      expect(bar?.props['orientation']?.type).toContain('horizontal');
      expect(bar?.limits['categories']).toBe(12);
      expect(bar?.nulls).toContain('missing value');
      const donut = catalog.charts.find((chart) => chart.name === 'Donut');
      expect(donut?.shared).not.toContain('annotations');
      expect(donut?.limits['slices']).toBe(5);
      expect(Object.keys(catalog.types['RowStat'] ?? {})).toContain('spark');
      expect(Object.keys(catalog.types['Annotation.bracket'] ?? {})).toContain('better');
      expect(catalog.insight['props']).toContain('throws');
      expect(catalog.messages['change between two points']).toContain('Slope');
      expect(catalog.spec).toEqual({
        attribute: 'data-chart-spec',
        module: '@deckster/kit/chart-spec',
        version: 1,
      });
    }),
);

it.effect('deck charts lists each chart with its messages and example in plain text', () =>
  Effect.gen(function* () {
    const { code, output } = yield* runCaptured(['charts']);
    expect(code).toBe(0);
    expect(output).toContain('<Donut>  part-to-whole');
    expect(output).toContain('Use when:');
  }),
);
