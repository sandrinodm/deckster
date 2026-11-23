import { NodeServices } from '@effect/platform-node';
import { expect, layer } from '@effect/vitest';
import { Effect } from 'effect';

import { openCommentsRule } from '#lint/rules/open-comments.ts';
import { deckInput, testBrandTokens } from '#lint/snapshot.fixture.ts';

const SLIDES = [{ id: 'intro' }, { id: 'steps' }, { id: 'closing' }];

layer(NodeServices.layer)('open-comments', (it) => {
  it.effect('warns once per slide with open comments, with the count', () =>
    Effect.gen(function* () {
      const tokens = yield* testBrandTokens('default');
      const input = deckInput(tokens, SLIDES, { openComments: { steps: 3, intro: 1 } });
      const violations = openCommentsRule.check(input);
      expect(violations.map(({ slide, message }) => ({ slide, message }))).toEqual([
        { slide: 'intro', message: '1 open review comment on this slide.' },
        { slide: 'steps', message: '3 open review comments on this slide.' },
      ]);
      expect(violations[1]?.fix).toContain('pnpm deckster comments test --slide steps');
      expect(openCommentsRule.severity).toBe('warning');
    }),
  );

  it.effect('passes a deck without open comments and ignores slides it no longer has', () =>
    Effect.gen(function* () {
      const tokens = yield* testBrandTokens('default');
      expect(openCommentsRule.check(deckInput(tokens, SLIDES))).toEqual([]);
      expect(
        openCommentsRule.check(deckInput(tokens, SLIDES, { openComments: { gone: 2 } })),
      ).toEqual([]);
    }),
  );

  it.effect('does not read inherited members for slides named like them', () =>
    Effect.gen(function* () {
      const tokens = yield* testBrandTokens('default');
      const slides = [{ id: 'constructor' }, { id: 'to-string' }, { id: 'has-own-property' }];
      expect(openCommentsRule.check(deckInput(tokens, slides))).toEqual([]);
      const named = [{ id: 'constructor' }, { id: 'valueOf' }, { id: '__proto__' }];
      expect(openCommentsRule.check(deckInput(tokens, named))).toEqual([]);
    }),
  );
});
