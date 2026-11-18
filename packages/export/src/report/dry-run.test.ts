import { describe, expect, it } from 'vite-plus/test';

import { dryRunReport, formatDryRun } from '#report/dry-run.ts';

/**
 * A plan with one native element.
 */
const PLAN = {
  items: [],
  background: { kind: 'master' },
  notes: [{ outcome: 'native', what: 'text', selector: 'p', why: '' }],
} as never;

describe('formatDryRun', () => {
  it('says that the art of a brand layout slide lives in the layout part', () => {
    const report = dryRunReport('hybrid', [
      { number: 1, id: 'cover', layout: 'brand-cover', step: null, plan: PLAN, layoutArt: 2 },
      { number: 2, id: 'plain', layout: 'content', step: null, plan: PLAN },
    ]);
    const lines = formatDryRun(report).split('\n');
    expect(lines[1]).toBe('01 cover [brand-cover, art in layout: 2]: 1 / 0 / 0 / 0');
    expect(lines[2]).toBe('02 plain [content]: 1 / 0 / 0 / 0');
  });
});
