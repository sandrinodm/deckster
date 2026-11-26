import type { LayoutProblem } from '@deckster/vite-plugin';

import { describe, expect, it } from '@effect/vitest';
import path from 'node:path';

import { layoutProblemWarning } from '#layouts/load-brand-catalog.ts';

/**
 * The workspace the problems' files are relative to.
 */
const ROOT = path.resolve('/workspace');

/**
 * A layout problem on a file of the workspace.
 *
 * @param problem - The fields to set besides the file and fix.
 */
function problemOf(problem: Omit<LayoutProblem, 'file' | 'fix'>): LayoutProblem {
  return {
    ...problem,
    file: path.join(ROOT, 'brands/acme/layouts.ts'),
    fix: 'Make it load.',
  };
}

describe('layoutProblemWarning', () => {
  it('calls the layout of a code layout problem a code layout', () => {
    const warning = layoutProblemWarning(
      ROOT,
      problemOf({ code: 'layout-load-failed', layout: 'kpi-wall', message: 'It threw.' }),
    );
    expect(warning).toBe(
      'The code layout "kpi-wall" is left out (layout-load-failed in brands/acme/layouts.ts): ' +
        'It threw. Fix: Make it load.',
    );
  });

  it('calls the layout of an unavailable fallback a data layout', () => {
    const warning = layoutProblemWarning(
      ROOT,
      problemOf({
        code: 'layout-fallback-unavailable',
        layout: 'acme-split',
        message: 'The data layout "acme-split" falls back to "kpi-wall", which is not loaded.',
      }),
    );
    expect(warning).toMatch(
      /^The data layout "acme-split" is left out \(layout-fallback-unavailable/u,
    );
    expect(warning).not.toContain('The code layout');
  });

  it('names every code layout for a problem that has no layout', () => {
    const warning = layoutProblemWarning(
      ROOT,
      problemOf({ code: 'layout-version', message: 'Too old.' }),
    );
    expect(warning).toMatch(/^Code layouts are left out \(layout-version/u);
  });
});
