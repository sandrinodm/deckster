import { SlideFrontmatter } from '@deckster/engine/frontmatter';
import { fieldLimitBreaches, slideFieldLimits } from '@deckster/engine/layout';
import { Schema } from 'effect';
import { createElement, Fragment, isValidElement } from 'react';
import { describe, expect, it } from 'vite-plus/test';

import {
  DASHBOARD_PANEL_TITLE_MAX_CHARS,
  DASHBOARD_PANEL_TITLE_MAX_CHARS_DENSE,
  dashboardLayoutContract,
} from '#layouts/dashboard-layout.contract.ts';
import {
  dashboardCharts,
  dashboardFitKey,
  validateDashboardCount,
} from '#layouts/dashboard-layout.tsx';

/**
 * Decodes the same common and layout fields as the build, rejecting misspellings.
 */
function decode(frontmatter: Record<string, unknown>): unknown {
  const schema = Schema.Struct({
    ...SlideFrontmatter.fields,
    ...dashboardLayoutContract.schema.fields,
  });
  return Schema.decodeUnknownSync(schema)(
    { layout: 'dashboard', ...frontmatter },
    { onExcessProperty: 'error' },
  );
}

describe('the dashboard layout', () => {
  it('takes two to four headed panels with shared defaults and named data', () => {
    const panels = [{ title: 'Volume' }, { title: 'Cost' }];
    expect(decode({ panels, data: { drops: [{ month: 'Oct', value: 182 }] } })).toMatchObject({
      panels,
      reveal: false,
      chrome: true,
    });
    expect(() => decode({ panels: panels.slice(0, 1) })).toThrow('at least 2 panels');
    expect(() => decode({ panels: [...panels, ...panels, panels[0]] })).toThrow('at most 4 panels');
    expect(() => decode({ panels: [{ title: '' }, panels[1]] })).toThrow('a length of at least 1');
    expect(() =>
      decode({ panels: [{ title: 'x'.repeat(DASHBOARD_PANEL_TITLE_MAX_CHARS + 1) }, panels[1]] }),
    ).toThrow('at most 24');
    expect(() => decode({ panels: [{ title: 'Volume', typo: true }, panels[1]] })).toThrow(
      'excess property',
    );
  });

  it('shortens headings in both dense grids on one published range variant', () => {
    const title = 'x'.repeat(DASHBOARD_PANEL_TITLE_MAX_CHARS_DENSE + 1);
    for (const count of [2, 3, 4]) {
      const panels = Array.from({ length: count }, () => ({ title }));
      const limits = slideFieldLimits(dashboardLayoutContract, {
        frontmatter: { panels },
        filled: [],
      });
      expect(fieldLimitBreaches({ panels }, limits)).toHaveLength(count === 2 ? 0 : count);
    }
  });

  it('pairs components through slots and fragments without consuming wrappers', () => {
    const first = createElement('figure', { key: 'first' });
    const second = createElement('figure', { key: 'second' });
    const body = createElement(
      'span',
      { 'data-slot': 'body' },
      first,
      '\n',
      createElement(Fragment, {}, second),
    );
    const charts = dashboardCharts(body);
    expect(charts).toHaveLength(2);
    expect(charts).toEqual([
      expect.objectContaining({ props: first.props }),
      expect.objectContaining({ props: second.props }),
    ]);
    expect(dashboardCharts(createElement('div', {}, first))).toHaveLength(1);
    expect(dashboardCharts(undefined)).toEqual([]);
  });

  it('explains a mismatch between headings and body components', () => {
    expect(() => validateDashboardCount(3, 2)).toThrow(
      'Dashboard has 3 panel headings but 2 body components. ' +
        'Write one direct chart or number component per panel, in heading order.',
    );
  });

  it('retains non-blank text as a panel so it cannot silently shift the pairing', () => {
    expect(dashboardCharts(['  ', 'Panel text'])).toEqual(['Panel text']);
  });

  it('builds a fit key for nested elements without visiting circular owners', () => {
    const owner: Record<string, unknown> = {};
    owner['current'] = owner;
    const nested = { ...createElement('figure', {}, createElement('div')), _owner: owner };
    const charts = dashboardCharts(createElement('div', {}, nested));
    const props = charts.map((chart) => (isValidElement(chart) ? chart.props : chart));
    expect(() => dashboardFitKey([props])).not.toThrow();
    expect(dashboardFitKey([{ children: nested, render: () => null }])).toBe(
      '[{"children":"<element>"}]',
    );
  });
});
