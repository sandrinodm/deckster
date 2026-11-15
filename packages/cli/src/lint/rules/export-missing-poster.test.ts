import { NodeServices } from '@effect/platform-node';
import { expect, layer } from '@effect/vitest';
import { Effect } from 'effect';

import { exportMissingPosterRule } from '#lint/rules/export-missing-poster.ts';
import { element, slideRuleInput, testBrandTokens } from '#lint/snapshot.fixture.ts';

layer(NodeServices.layer)('export-missing-poster', (it) => {
  it.effect('warns about raw live media and names the kit component to use', () =>
    Effect.gen(function* () {
      const tokens = yield* testBrandTokens('default');
      const video = element({ index: 0, tag: 'video', selector: 'video' });
      const frame = element({ index: 1, tag: 'iframe', selector: 'iframe' });
      const picture = element({ index: 2, tag: 'img', selector: 'img' });
      const violations = exportMissingPosterRule.check(
        slideRuleInput(tokens, { elements: [video, frame, picture] }),
      );
      expect(exportMissingPosterRule.severity).toBe('warning');
      expect(violations.map((violation) => violation.selector)).toEqual(['video', 'iframe']);
      expect(violations[0]?.fix).toContain('<Video');
      expect(violations[1]?.fix).toContain('<AppFrame');
    }),
  );

  it.effect('ignores decoration', () =>
    Effect.gen(function* () {
      const tokens = yield* testBrandTokens('default');
      const canvas = element({ tag: 'canvas', selector: 'canvas', decorative: true });
      expect(exportMissingPosterRule.check(slideRuleInput(tokens, { elements: [canvas] }))).toEqual(
        [],
      );
    }),
  );
});
