import { describe, expect, it } from 'vite-plus/test';

import { BUDGET_PATTERN, budgetSeconds } from '#contract/slide-defaults.ts';

describe('budgetSeconds', () => {
  it('reads minutes and seconds', () => {
    expect(budgetSeconds('90s')).toBe(90);
    expect(budgetSeconds('2m')).toBe(120);
    expect(budgetSeconds('1m30s')).toBe(90);
    expect(budgetSeconds(undefined)).toBeUndefined();
  });

  it('rejects a run of digits that would become Infinity, and absurd durations', () => {
    for (const budget of [`${'9'.repeat(309)}s`, `${'9'.repeat(309)}m`, '99999s', '1000m']) {
      expect(BUDGET_PATTERN.test(budget), budget).toBe(false);
      expect(budgetSeconds(budget), budget).toBeUndefined();
    }
  });
});
