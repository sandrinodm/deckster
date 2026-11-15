import { NodeServices } from '@effect/platform-node';
import { expect, layer } from '@effect/vitest';
import { Effect } from 'effect';

import { containerOverflowRule } from '#lint/rules/container-overflow.ts';
import { textTruncatedRule } from '#lint/rules/text-truncated.ts';
import { element, slideRuleInput, testBrandTokens, textElement } from '#lint/snapshot.fixture.ts';

layer(NodeServices.layer)('text a reader cannot see in full', (it) => {
  it.effect('text-truncated reports CSS ellipses, line clamps and labels a chart cut', () =>
    Effect.gen(function* () {
      const tokens = yield* testBrandTokens('default');
      const file = textElement('checkout-service.config.ts', {
        index: 0,
        selector: 'div.kit-code-file',
        truncation: 'ellipsis',
        clientWidth: 200,
        scrollWidth: 340,
      });
      const message = textElement('A long error message', {
        index: 1,
        selector: 'p.message',
        truncation: 'clamp',
        clientHeight: 120,
        scrollHeight: 200,
      });
      const label = element({
        index: 2,
        selector: 'svg > text',
        tag: 'text',
        inSvg: true,
        data: { truncated: 'of every 10 SRE hours go to cluster operations' },
      });
      const decoration = textElement('Ticker', {
        index: 3,
        selector: 'div.ticker',
        truncation: 'ellipsis',
        decorative: true,
      });
      const whole = textElement('Fits', { index: 4, selector: 'p.whole' });
      const violations = textTruncatedRule.check(
        slideRuleInput(tokens, { elements: [file, message, label, decoration, whole] }),
      );
      expect(violations.map((violation) => violation.selector)).toEqual([
        'div.kit-code-file',
        'p.message',
        'svg > text',
      ]);
      expect(violations.map((violation) => violation.message)).toEqual([
        '"checkout-service.config.ts" is cut short with an ellipsis: it needs 340px and its box is 200px wide.',
        '"A long error message" is cut to its line clamp: it needs 200px and its box shows 120px.',
        '"of every 10 SRE hours go to cluster operations" did not fit its room and is shown cut short with an ellipsis.',
      ]);
    }),
  );

  it.effect('container-overflow counts SVG text past the box that holds the drawing', () =>
    Effect.gen(function* () {
      const tokens = yield* testBrandTokens('default');
      // A pictogram's figure in a media column that ends at x=1792, the safe margin.
      const svg = element({
        index: 0,
        selector: 'figure.kit-split-media > svg',
        tag: 'svg',
        isMedia: true,
        rect: { x: 866, y: 140, width: 926, height: 800 },
      });
      const grid = element({
        index: 1,
        parent: 0,
        selector: 'svg > path',
        tag: 'path',
        inSvg: true,
        rect: { x: 866, y: 140, width: 2000, height: 800 },
      });
      const figure = textElement('4 in 10', {
        index: 2,
        parent: 0,
        selector: 'svg > text',
        tag: 'text',
        inSvg: true,
        rect: { x: 1435, y: 380, width: 440, height: 160 },
      });
      const violations = containerOverflowRule.check(
        slideRuleInput(tokens, { elements: [svg, grid, figure] }),
      );
      expect(violations.map((violation) => violation.selector)).toEqual([
        'figure.kit-split-media > svg',
      ]);
      expect(violations[0]?.message).toContain('83px more width than it has (spills out of it)');
      expect(violations[0]?.message).toContain('"4 in 10" reaches furthest');
    }),
  );
});
