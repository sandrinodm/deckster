import { Effect } from 'effect';

import type { DeckToolsApi } from '#mcp/deck-tools.ts';

import { agentError } from '#errors.ts';

/**
 * A one-pixel PNG, base64 encoded, the fake's screenshot.
 */
export const PIXEL_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

/**
 * One call a fake tool received.
 */
export type FakeCall = {
  /**
   * The operation's name.
   */
  readonly tool: string;

  /**
   * The decoded input.
   */
  readonly input: unknown;
};

/**
 * A fake {@link DeckToolsApi} with canned answers and the calls it received.
 */
export type FakeDeckTools = {
  /**
   * The operations.
   */
  readonly api: DeckToolsApi;

  /**
   * Every call, in order.
   */
  readonly calls: FakeCall[];
};

/**
 * Makes a fake that answers like a small deck: `title` and `closing` slides. Asking for a slide
 * named `missing` fails with an {@link AgentError}.
 */
export function fakeDeckTools(): FakeDeckTools {
  const calls: FakeCall[] = [];
  /**
   * Records a call.
   *
   * @param tool - The operation's name.
   * @param input - Its input.
   */
  const record = (tool: string, input: unknown): void => {
    calls.push({ tool, input });
  };
  const api: DeckToolsApi = {
    currentSlide: Effect.sync(() => {
      record('currentSlide', undefined);
      return {
        connected: true,
        slide: {
          id: 'title',
          number: 1,
          file: 'decks/hello/slides/title.mdx',
          layout: 'title',
          title: 'Hello',
        },
        step: 0,
        stepCount: 1,
        brand: 'default',
        selection: '',
        pages: 1,
      } as const;
    }),
    deckOutline: Effect.sync(() => {
      record('deckOutline', undefined);
      return {
        deck: 'hello',
        title: 'Hello',
        slides: [
          {
            id: 'title',
            number: 1,
            file: 'decks/hello/slides/title.mdx',
            title: 'Hello',
            layout: 'title',
            steps: 1,
            budgetSeconds: null,
            notesChars: 10,
            hidden: false,
          },
        ],
      };
    }),
    slideFile: (id) => Effect.succeed(id === 'title' ? 'decks/hello/slides/title.mdx' : undefined),
    brandName: Effect.succeed('default'),
    deckLint: (input) => {
      record('deckLint', input);
      return Effect.succeed({ ok: true, summary: { errors: 0, warnings: 0 }, findings: [] });
    },
    deckScreenshot: (input) => {
      record('deckScreenshot', input);
      return input.slide === 'missing'
        ? Effect.fail(agentError('The deck has no slide "missing".', 'Use deck_outline.'))
        : Effect.succeed({
            path: '/work/.deck/agent/hello/shots/01-title.png',
            slide: input.slide,
            step: input.step ?? null,
            width: 1,
            height: 1,
            error: null,
            data: PIXEL_PNG,
          });
    },
    catalog: (input) => {
      record('catalog', input);
      return Effect.succeed({ kind: input.kind, name: input.name ?? null });
    },
    comments: (input) => {
      record('comments', input);
      return Effect.succeed({ action: input.action, comments: [] });
    },
    goto: (input) => {
      record('goto', input);
      return Effect.succeed({ slide: input.slide, step: input.step ?? 0 });
    },
    newSlide: (input) => {
      record('newSlide', input);
      return Effect.succeed({
        id: input.id,
        file: `decks/hello/slides/${input.id}.mdx`,
        layout: input.layout,
        after: input.after ?? null,
      });
    },
    reorderSlides: (input) => {
      record('reorderSlides', input);
      return Effect.succeed({ slides: input.slides, removed: null });
    },
    removeSlide: (input) => {
      record('removeSlide', input);
      return Effect.succeed({ slides: [], removed: `decks/hello/slides/${input.id}.mdx` });
    },
  };
  return { api, calls };
}
