import { NodeServices } from '@effect/platform-node';
import { expect, layer } from '@effect/vitest';
import { Effect } from 'effect';

import { appExternalSrcRule } from '#lint/rules/app-external-src.ts';
import { appMissingPosterRule } from '#lint/rules/app-missing-poster.ts';
import { appMissingRule } from '#lint/rules/app-missing.ts';
import { videoCuePostersRule } from '#lint/rules/video-cue-posters.ts';
import { element, slideRuleInput, testBrandTokens } from '#lint/snapshot.fixture.ts';

layer(NodeServices.layer)('app lint rules', (it) => {
  it.effect('app-missing-poster is an error on a frame that drew the placeholder', () =>
    Effect.gen(function* () {
      const tokens = yield* testBrandTokens('default');
      const bare = element({
        index: 0,
        selector: 'div.kit-app-poster',
        data: { 'app-missing-poster': '' },
      });
      const fine = element({ index: 1, selector: 'div.kit-app-poster', data: {} });
      const violations = appMissingPosterRule.check(
        slideRuleInput(tokens, { elements: [bare, fine] }),
      );
      expect(appMissingPosterRule.severity).toBe('error');
      expect(violations.map((violation) => violation.selector)).toEqual(['div.kit-app-poster']);
      expect(violations[0]?.fix).toContain('poster=');
    }),
  );

  it.effect('app-external-src warns about an external frame without a fallback video', () =>
    Effect.gen(function* () {
      const tokens = yield* testBrandTokens('default');
      const bare = element({ index: 0, selector: 'div.kit-app', data: { 'app-external': '' } });
      const recorded = element({
        index: 1,
        selector: 'div.kit-app:nth-of-type(2)',
        data: { 'app-external': '', 'app-has-fallback': '' },
      });
      const bundled = element({ index: 2, selector: 'div.kit-app:nth-of-type(3)', data: {} });
      const violations = appExternalSrcRule.check(
        slideRuleInput(tokens, { elements: [bare, recorded, bundled] }),
      );
      expect(appExternalSrcRule.severity).toBe('warning');
      expect(violations.map((violation) => violation.selector)).toEqual(['div.kit-app']);
      expect(violations[0]?.message).toContain('venue Wi-Fi');
      expect(violations[0]?.fix).toContain('fallback=');
    }),
  );

  it.effect('app-missing is an error on a frame whose app the deck answered 404 for', () =>
    Effect.gen(function* () {
      const tokens = yield* testBrandTokens('default');
      const missing = element({
        index: 0,
        selector: 'div.kit-app',
        data: { 'app-missing': '', 'app-name': 'agnet-demo' },
      });
      const fine = element({
        index: 1,
        selector: 'div.kit-app:nth-of-type(2)',
        data: { 'app-name': 'agent-demo' },
      });
      const violations = appMissingRule.check(
        slideRuleInput(tokens, { elements: [missing, fine] }),
      );
      expect(appMissingRule.severity).toBe('error');
      expect(violations.map((violation) => violation.selector)).toEqual(['div.kit-app']);
      expect(violations[0]?.message).toContain('app="agnet-demo"');
      expect(violations[0]?.fix).toContain('deck new app');
    }),
  );

  it.effect('video-cue-posters warns about a cued video with one poster for every step', () =>
    Effect.gen(function* () {
      const tokens = yield* testBrandTokens('default');
      const cued = element({
        index: 0,
        selector: 'figure.kit-video',
        data: { 'video-parts': '3', 'video-posters': '0' },
      });
      const covered = element({
        index: 1,
        selector: 'figure.kit-video:nth-of-type(2)',
        data: { 'video-parts': '3', 'video-posters': '3' },
      });
      const plain = element({
        index: 2,
        selector: 'figure.kit-video:nth-of-type(3)',
        data: { 'video-parts': '1', 'video-posters': '0' },
      });
      const violations = videoCuePostersRule.check(
        slideRuleInput(tokens, { elements: [cued, covered, plain] }),
      );
      expect(videoCuePostersRule.severity).toBe('warning');
      expect(violations.map((violation) => violation.selector)).toEqual(['figure.kit-video']);
      expect(violations[0]?.fix).toContain('posters=');
    }),
  );
});
