import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import type { QuizAnswer } from '#layouts/quiz-layout.contract.ts';

import { quizLayout } from '#layouts/quiz-layout.tsx';
import { QUIZ_LETTERS, QUIZ_TILE_MAX_CHARS } from '#layouts/quiz-values.ts';

/**
 * The requested reveal state and entrance mode; Step state is mocked independently of static mode.
 */
const view = vi.hoisted(() => ({ step: 0, isStatic: false, surface: 'default' }));

/**
 * Choices shared by the default render and its expected Step count.
 */
const CHOICES = ['First choice', 'Second choice'];

vi.mock('@deckster/engine', async (original) => ({
  ...(await original<typeof import('@deckster/engine')>()),
  useStatic: () => view.isStatic,
  useStepAt: (at: number | undefined) => {
    if (at === undefined) {
      return 'past';
    }

    return view.step < at ? 'hidden' : 'current';
  },
  useSlide: () => ({ state: 'current' }),
  useReadyHold: () => undefined,
}));

vi.mock('@deckster/brand/runtime', () => ({
  useBrand: () => ({ surface: { name: view.surface } }),
}));

vi.mock('#foundation/backdrop.tsx', () => ({ Backdrop: () => null }));

/**
 * Renders the real layout and Step markup with a requested engine view and a complete question.
 *
 * @param question - The reveal setting, answer letter and choices to exercise.
 */
function render({
  reveal = true,
  answer = 'B',
  options = CHOICES,
}: { reveal?: boolean; answer?: QuizAnswer; options?: string[] } = {}): string {
  const Component = quizLayout.component;
  return renderToStaticMarkup(
    <Component
      slideId="quiz-test"
      frontmatter={{
        layout: 'quiz',
        title: 'Which is right?',
        options,
        answer,
        explanation: 'The reason for B.',
        reveal,
        chrome: true,
      }}
      slots={{}}
    />,
  );
}

beforeEach(() => {
  view.step = 0;
  view.isStatic = false;
  view.surface = 'default';
});

describe('the quiz answer reveal', () => {
  for (const isStatic of [false, true]) {
    it(`hides answer and reason at step zero (static entrances: ${isStatic})`, () => {
      view.isStatic = isStatic;
      const html = render();
      expect(html).toContain('First choice');
      expect(html).toContain('Second choice');
      expect(html).toMatch(
        /data-step-state="hidden"[^>]*><div class="kit-quiz-result kit-quiz-answer"/u,
      );
      expect(html).toMatch(/data-step-state="hidden"[^>]*><p class="kit-quiz-explanation/u);
      expect(html.match(/data-step-state="hidden"/gu)).toHaveLength(CHOICES.length + 1);
      expect(html).not.toContain('data-reveal="shown"');
    });

    it(`marks the right choice on its answer step (static entrances: ${isStatic})`, () => {
      view.isStatic = isStatic;
      view.step = 1;
      const html = render();
      expect(html).not.toContain('data-step-state="hidden"');
      expect(html).toContain('aria-label="Correct answer"');
      expect(html).toContain('kit-quiz-answer" data-surface="accent"');
      expect(html).toContain('The reason for B.');
    });
  }

  it('shows the answered recap immediately without registering any Step markup', () => {
    const html = render({ reveal: false });
    expect(html).not.toContain('data-step=');
    expect(html).not.toContain('kit-quiz-choice');
    expect(html.match(/First choice/gu)).toHaveLength(1);
    expect(html.match(/Second choice/gu)).toHaveLength(1);
    expect(html.match(/data-flow="static"/gu)).toHaveLength(2);
    expect(html).toContain('aria-label="Correct answer"');
  });

  for (const surface of ['accent', 'gradient']) {
    it(`uses the inverse answer surface on a ${surface} slide`, () => {
      view.step = 1;
      view.surface = surface;
      expect(render()).toContain('kit-quiz-answer" data-surface="inverse"');
    });
  }

  it('keeps the first answer directly inside its hidden Step', () => {
    const html = render({ answer: 'A' });
    expect(html).toMatch(
      /data-step-state="hidden"[^>]*><div class="kit-quiz-result kit-quiz-answer"/u,
    );
    expect(html).toMatch(/data-step-state="hidden"[^>]*><p class="kit-quiz-explanation/u);
    expect(html.match(/data-step-state="hidden"/gu)).toHaveLength(CHOICES.length + 1);
  });

  it('uses tiles through the short-option boundary and rows beyond it', () => {
    const boundary = 'x'.repeat(QUIZ_TILE_MAX_CHARS);
    expect(render({ options: [boundary, 'Short'] })).toContain('data-form="tiles"');
    expect(render({ options: [boundary + 'x', 'Short'] })).toContain('data-form="rows"');
  });

  it('labels four options in contract order without duplicate recap letters', () => {
    const html = render({ reveal: false, options: ['One', 'Two', 'Three', 'Four'] });
    const letters = [...html.matchAll(/kit-quiz-letter[^>]*><span>([A-D])<\/span>/gu)];
    expect(letters.map((match) => match[1]).join('')).toBe(QUIZ_LETTERS.join(''));
  });
});
