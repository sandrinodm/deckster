import { describe, expect, it } from 'vite-plus/test';

import { slideSuggestions } from '#runtime/suggestions.ts';

describe('slideSuggestions', () => {
  it('offers generic examples for a slide without findings or comments', () => {
    expect(
      slideSuggestions({ title: 'Hello, deck', findings: [], comments: [] }).map(
        (one) => one.label,
      ),
    ).toEqual([
      'Shorten the title',
      'Turn the bullets into three cards',
      'Make it readable at a glance',
    ]);
  });

  it('puts lint errors and open comments first, at most three in all', () => {
    const suggestions = slideSuggestions({
      title: 'Hello',
      findings: [
        {
          slide: 'title',
          file: 'decks/hello/slides/title.mdx',
          step: null,
          rule: 'overflow',
          severity: 'warning',
          message: 'Text runs past the safe area.',
          fix: 'Cut it.',
        },
        {
          slide: 'title',
          file: 'decks/hello/slides/title.mdx',
          step: null,
          rule: 'contrast',
          severity: 'error',
          message: 'The caption is too faint.',
          fix: 'Use the text colour.',
        },
      ],
      comments: [{ id: 'c-1', number: 2, text: 'Shorter, please.' }],
    });
    expect(suggestions.map((one) => [one.source, one.label])).toEqual([
      ['lint', 'Fix: The caption is too faint.'],
      ['lint', 'Fix: Text runs past the safe area.'],
      ['comment', 'Address #2: Shorter, please.'],
    ]);
    expect(suggestions[0]?.prompt).toContain('contrast lint error');
    expect(suggestions[2]?.comment).toBe('c-1');
  });
});
