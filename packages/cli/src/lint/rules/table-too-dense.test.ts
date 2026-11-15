import { NodeServices } from '@effect/platform-node';
import { expect, layer } from '@effect/vitest';
import { Effect } from 'effect';

import { tableTooDenseRule } from '#lint/rules/table-too-dense.ts';
import { element, slideRuleInput, testBrandTokens } from '#lint/snapshot.fixture.ts';

layer(NodeServices.layer)('table-too-dense', (it) => {
  it.effect('is an error on a table the layout could not fit, and asks for cuts', () =>
    Effect.gen(function* () {
      const tokens = yield* testBrandTokens('default');
      const dense = element({
        index: 0,
        selector: 'table.kit-table',
        data: { 'kit-table-fit': 'overflow' },
      });
      const stepped = element({
        index: 1,
        selector: 'table.kit-table:nth-of-type(2)',
        data: { 'kit-table-fit': 'stepped' },
      });
      const violations = tableTooDenseRule.check(
        slideRuleInput(tokens, { elements: [dense, stepped] }),
      );
      expect(tableTooDenseRule.severity).toBe('error');
      expect(violations.map((violation) => violation.selector)).toEqual(['table.kit-table']);
      expect(violations[0]?.fix).toContain('Cut the table');
      expect(violations[0]?.fix).toContain('Do not make the type smaller');
    }),
  );
});
