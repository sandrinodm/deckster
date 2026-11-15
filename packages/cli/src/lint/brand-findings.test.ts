import { describe, expect, it } from '@effect/vitest';

import type { LintReport } from '#lint/run-lint.ts';

import { BRAND_RULE_ID, findingsFromBrandWarnings } from '#lint/deck-problems.ts';
import { formatReport } from '#lint/format-report.ts';

/**
 * A brand warning repeated on two surfaces, as the brand checks may report it.
 */
const MERGED_PAIR = {
  path: 'color.roles.positive',
  message: 'On the default surface, positive #0a7a8a and negative #11804f look alike.',
  fix: 'Make them differ in lightness as well as hue.',
};

describe('brand findings in deck lint', () => {
  it('are brand findings at the brand file, each once, with the field and the fix', () => {
    const findings = findingsFromBrandWarnings('brands/acme/brand.ts', [MERGED_PAIR, MERGED_PAIR]);
    expect(findings).toEqual([
      {
        slide: null,
        file: 'brands/acme/brand.ts',
        step: null,
        rule: BRAND_RULE_ID,
        severity: 'warning',
        message: `color.roles.positive: ${MERGED_PAIR.message}`,
        fix: MERGED_PAIR.fix,
        selector: null,
      },
    ]);
  });

  it('sit under the brand file, marked as the brand’s, and are counted apart', () => {
    const report: LintReport = {
      deck: 'hello',
      brand: 'acme',
      ok: true,
      findings: findingsFromBrandWarnings('brands/acme/brand.ts', [MERGED_PAIR]),
      summary: { errors: 0, warnings: 1, slides: 4, steps: 8, budgetSeconds: null },
    };
    const text = formatReport(report);
    expect(text).toContain(
      'brands/acme/brand.ts (the brand "acme", for every slide; `pnpm deck brand check acme` lists these alone)',
    );
    expect(text).toContain('  warning brand: color.roles.positive:');
    expect(text).not.toContain('(null)');
    expect(text).toContain('hello: 0 errors, 1 warning (1 from the brand) in 4 slides');
  });
});
