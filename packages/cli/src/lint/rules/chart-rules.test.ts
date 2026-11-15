import { NodeServices } from '@effect/platform-node';
import { describe, expect, it, layer } from '@effect/vitest';
import { Effect } from 'effect';

import type { ElementSnapshot } from '#lint/types.ts';

import { chartEmptyRule } from '#lint/rules/chart-empty.ts';
import { chartFunnelGrowsRule } from '#lint/rules/chart-funnel-grows.ts';
import { chartLegendAvoidableRule } from '#lint/rules/chart-legend-avoidable.ts';
import { chartMissingUnitRule } from '#lint/rules/chart-missing-unit.ts';
import { chartNoHighlightRule } from '#lint/rules/chart-no-highlight.ts';
import { chartPieSlicesRule } from '#lint/rules/chart-pie-slices.ts';
import { chartTooManyCategoriesRule } from '#lint/rules/chart-too-many-categories.ts';
import { chartTooManySeriesRule } from '#lint/rules/chart-too-many-series.ts';
import { chartTopicTitleRule, isTakeawayTitle, topicShape } from '#lint/rules/chart-topic-title.ts';
import { chartTruncatedAxisRule } from '#lint/rules/chart-truncated-axis.ts';
import { element, slideRuleInput, testBrandTokens } from '#lint/snapshot.fixture.ts';

/**
 * A chart root as the kit writes it, with facts overridden.
 *
 * @param index - The element's index.
 * @param facts - The `data-chart-*` values to change, without the `chart-` prefix.
 */
function chart(index: number, facts: Record<string, string> = {}): ElementSnapshot {
  const defaults: Record<string, string> = {
    chart: 'bar',
    'chart-series': '1',
    'chart-categories': '4',
    'chart-highlight': 'true',
    'chart-axis': 'zero',
    'chart-unit': 'true',
    'chart-legend': 'false',
    'chart-legend-avoidable': 'false',
  };
  const data = Object.fromEntries(
    Object.entries({
      ...defaults,
      ...Object.fromEntries(
        Object.entries(facts).map(([key, value]) => [
          key === 'chart' ? key : `chart-${key}`,
          value,
        ]),
      ),
    }),
  );
  return element({ index, selector: `figure.kit-chart:nth-of-type(${index + 1})`, data });
}

layer(NodeServices.layer)('chart lint rules', (it) => {
  it.effect('each rule reports only the chart that breaks it, with its selector and a fix', () =>
    Effect.gen(function* () {
      const tokens = yield* testBrandTokens('default');
      const cases = [
        {
          rule: chartTooManySeriesRule,
          bad: { series: '7' },
          severity: 'warning',
          fix: 'highlight',
        },
        {
          rule: chartTooManyCategoriesRule,
          bad: { categories: '14' },
          severity: 'warning',
          fix: '"Other"',
        },
        {
          rule: chartPieSlicesRule,
          bad: { chart: 'donut', slices: '6' },
          severity: 'warning',
          fix: '"Other"',
        },
        {
          rule: chartTruncatedAxisRule,
          bad: { axis: 'refused' },
          severity: 'error',
          fix: 'truncate',
        },
        {
          rule: chartNoHighlightRule,
          bad: { highlight: 'false', series: '3' },
          severity: 'warning',
          fix: 'highlight',
        },
        { rule: chartMissingUnitRule, bad: { unit: 'false' }, severity: 'warning', fix: 'unit=' },
        {
          rule: chartLegendAvoidableRule,
          bad: { legend: 'true', 'legend-avoidable': 'true' },
          severity: 'warning',
          fix: 'legend',
        },
        { rule: chartEmptyRule, bad: { marks: '0' }, severity: 'error', fix: 'field names' },
        {
          rule: chartFunnelGrowsRule,
          bad: { chart: 'funnel', growth: '["Opened an article"]' },
          severity: 'warning',
          fix: '<BarChart>',
        },
      ] as const;
      for (const entry of cases) {
        const input = slideRuleInput(tokens, { elements: [chart(0), chart(1, entry.bad)] });
        const violations = entry.rule.check(input);
        expect(entry.rule.severity, entry.rule.id).toBe(entry.severity);
        expect(
          violations.map((violation) => violation.selector),
          entry.rule.id,
        ).toEqual(['figure.kit-chart:nth-of-type(2)']);
        expect(violations[0]?.fix, entry.rule.id).toContain(entry.fix);
      }
    }),
  );

  it.effect(
    'allowed cases pass: a truncated axis with the opt-in, a five-slice donut, a busy heatmap',
    () =>
      Effect.gen(function* () {
        const tokens = yield* testBrandTokens('default');
        const elements = [
          chart(0, { axis: 'truncated' }),
          chart(1, { chart: 'donut', slices: '5' }),
          chart(2, { chart: 'heatmap', series: '7', categories: '24', highlight: 'false' }),
          chart(3, { chart: 'line', categories: '52', series: '2', highlight: 'false' }),
        ];
        const input = slideRuleInput(tokens, { elements });
        expect(chartTruncatedAxisRule.check(input)).toEqual([]);
        expect(chartPieSlicesRule.check(input)).toEqual([]);
        expect(chartTooManySeriesRule.check(input)).toEqual([]);
        expect(chartTooManyCategoriesRule.check(input)).toEqual([]);
        expect(chartNoHighlightRule.check(input).map((violation) => violation.selector)).toEqual([
          'figure.kit-chart:nth-of-type(4)',
        ]);
      }),
  );

  it.effect(
    'chart-topic-title warns about a topic title on a chart slide only, and says it is a heuristic',
    () =>
      Effect.gen(function* () {
        const tokens = yield* testBrandTokens('default');
        const topic = slideRuleInput(
          tokens,
          { elements: [chart(0)] },
          { slide: { frontmatter: { layout: 'chart', title: 'Revenue by region' } } },
        );
        const [violation] = chartTopicTitleRule.check(topic);
        expect(chartTopicTitleRule.severity).toBe('warning');
        expect(violation?.message).toContain('heuristic');
        expect(violation?.message).toContain('looks like a topic');
        expect(violation?.message).not.toContain('verb');
        const takeaway = slideRuleInput(
          tokens,
          { elements: [chart(0)] },
          { slide: { frontmatter: { title: 'EMEA grew fastest' } } },
        );
        expect(chartTopicTitleRule.check(takeaway)).toEqual([]);
        const noChart = slideRuleInput(
          tokens,
          { elements: [] },
          { slide: { frontmatter: { title: 'Revenue by region' } } },
        );
        expect(chartTopicTitleRule.check(noChart)).toEqual([]);
      }),
  );
});

describe('isTakeawayTitle', () => {
  it('accepts sentences, whatever verbs they use, and "Label: value" figures', () => {
    for (const title of [
      'Churn: 4.2%',
      'Billing is the only queue still growing',
      'Support tickets doubled after launch',
      'Price explains little of the rating once you drop the outlier',
      'Latency spikes on the first weekend of every month',
      'Four numbers sum up the quarter',
      'EMEA grew fastest of the four regions',
      'Tickets fell 38% after the redesign',
      'Tickets fell by 38% after the redesign',
      'Seven channels split the conversations',
      'Billing dominates',
    ]) {
      expect(isTakeawayTitle(title), title).toBe(true);
    }
  });

  it('flags topic shapes, numbers or not', () => {
    const cases = {
      'Revenue by region': '"X by Y"',
      'Revenue by region 2026': '"X by Y"',
      'Market share by region': '"X by Y"',
      'Support tickets by month': '"X by Y"',
      'Tickets by queue': '"X by Y"',
      'Chat vs email response times in the second half': '"X vs Y"',
      'Plan A versus plan B': '"X vs Y"',
      'Quarterly revenue overview': '"X overview"',
      'Overview of support load': '"X overview"',
      'Cost breakdown for the platform team in 2026': '"X breakdown"',
      'Active users over time': '"X over time"',
      'Market share': 'a short noun phrase',
      'Q3 revenue': 'a short noun phrase',
    };
    for (const [title, shape] of Object.entries(cases)) {
      expect(topicShape(title), title).toBe(shape);
    }
  });
});

layer(NodeServices.layer)('chart rules on the new facts', (it) => {
  it.effect('chart-empty reports a chart with no marks and a single-point line, not others', () =>
    Effect.gen(function* () {
      const tokens = yield* testBrandTokens('default');
      const elements = [
        chart(0, { marks: '4' }),
        chart(1, { chart: 'line', categories: '1', marks: '1' }),
        chart(2, { chart: 'bar', categories: '1', marks: '1' }),
        chart(3, { chart: 'area', categories: '6', marks: '6' }),
        chart(4),
      ];
      const violations = chartEmptyRule.check(slideRuleInput(tokens, { elements }));
      expect(violations.map((violation) => violation.selector)).toEqual([
        'figure.kit-chart:nth-of-type(2)',
      ]);
      expect(violations[0]?.fix).toContain('<BigNumber>');
    }),
  );

  it.effect(
    'chart-too-many-series counts colored series, so a highlight among many lines passes',
    () =>
      Effect.gen(function* () {
        const tokens = yield* testBrandTokens('default');
        const elements = [
          chart(0, { chart: 'line', series: '9', colored: '1', highlight: 'true' }),
          chart(1, { chart: 'slope', series: '12', colored: '2', highlight: 'true' }),
          chart(2, { chart: 'line', series: '9', colored: '9', highlight: 'false' }),
          chart(3, { chart: 'bar', series: '9', colored: '9', highlight: 'true' }),
        ];
        const violations = chartTooManySeriesRule.check(slideRuleInput(tokens, { elements }));
        expect(violations.map((violation) => violation.selector)).toEqual([
          'figure.kit-chart:nth-of-type(3)',
          'figure.kit-chart:nth-of-type(4)',
        ]);
        expect(violations[0]?.fix).toContain('highlight one');
        expect(violations[1]?.fix).not.toContain('highlight one');
        expect(violations[1]?.fix).toContain('narrow the highlight');
      }),
  );

  it.effect('chart-funnel-grows names every stage that grows, and bad JSON counts as none', () =>
    Effect.gen(function* () {
      const tokens = yield* testBrandTokens('default');
      const elements = [
        chart(0, { chart: 'funnel', growth: '["Signed up", "Paid"]' }),
        chart(1, { chart: 'funnel', growth: 'not json' }),
        chart(2, { chart: 'funnel' }),
      ];
      const violations = chartFunnelGrowsRule.check(slideRuleInput(tokens, { elements }));
      expect(violations).toHaveLength(1);
      expect(violations[0]?.message).toContain('"Signed up", "Paid"');
    }),
  );
});
