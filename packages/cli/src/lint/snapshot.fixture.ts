import type { BrandTokens } from '@deckster/brand';
import type { AnyLayoutContract } from '@deckster/engine/layout';

import { FRAMEWORK_ROOT, loadBrand } from '@deckster/brand/node';
import { Effect, type FileSystem } from 'effect';

import type { CollectedPage } from '#browser/collect-snapshot.ts';
import type {
  DeckRuleInput,
  ElementSnapshot,
  SlideContext,
  SlideRuleInput,
  StepSnapshot,
} from '#lint/types.ts';

import { brandContext } from '#lint/brand-context.ts';

/**
 * A measured element with neutral defaults: a 100x100 box at the top-left, black 40px Inter text on
 * white, no text of its own.
 *
 * @param overrides - The fields that matter to the test.
 */
export function element(overrides: Partial<ElementSnapshot> = {}): ElementSnapshot {
  const rect = overrides.rect ?? { x: 0, y: 0, width: 100, height: 100 };
  return {
    index: 0,
    parent: null,
    selector: 'div',
    tag: 'div',
    text: '',
    words: 0,
    lines: 0,
    textLines: [],
    rect,
    innerRect: rect,
    fontFamily: 'Inter',
    fontSizePx: 40,
    renderedFontSizePx: overrides.fontSizePx ?? 40,
    lineHeightPx: null,
    fontWeight: 400,
    color: '#161920',
    backgroundColor: '#00000000',
    paint: { fill: null, stroke: null },
    background: { kind: 'colors', colors: ['#fcfcfd'] },
    opacity: 1,
    position: 'static',
    display: 'block',
    overflowX: 'visible',
    overflowY: 'visible',
    clientWidth: rect.width,
    clientHeight: rect.height,
    scrollWidth: rect.width,
    scrollHeight: rect.height,
    spacing: { padding: [0, 0, 0, 0], margin: [0, 0, 0, 0], gap: [0, 0] },
    data: {},
    decorative: false,
    isMedia: false,
    inSvg: false,
    image: null,
    truncation: null,
    ...overrides,
  };
}

/**
 * A text element whose one line fills its box.
 *
 * @param text - The text.
 * @param overrides - The fields that matter to the test.
 */
export function textElement(
  text: string,
  overrides: Partial<ElementSnapshot> = {},
): ElementSnapshot {
  const rect = overrides.rect ?? { x: 0, y: 0, width: 400, height: 56 };
  return element({
    text,
    words: text.split(' ').length,
    lines: 1,
    textLines: [rect],
    rect,
    ...overrides,
  });
}

/**
 * A measured page of the default surface with the given elements.
 *
 * @param overrides - The fields that matter to the test.
 */
export function collectedPage(overrides: Partial<CollectedPage> = {}): CollectedPage {
  return {
    canvas: { width: 1920, height: 1080 },
    surface: 'default',
    elements: [],
    slots: [],
    renderError: null,
    ...overrides,
  };
}

/**
 * A slide as the rules see it, with defaults.
 *
 * @param overrides - The fields that matter to the test.
 */
export function slideContext(overrides: Partial<SlideContext> = {}): SlideContext {
  return {
    index: 0,
    id: 's',
    file: 'decks/test/slides/s.mdx',
    title: 'S',
    layout: 'default',
    surface: 'default',
    frontmatter: { layout: 'default' },
    notes: 'Say this.',
    budgetSeconds: undefined,
    stepCount: 1,
    ...overrides,
  };
}

/**
 * The resolved tokens of a brand in the framework's own workspace.
 *
 * @param name - The brand folder name.
 */
export const testBrandTokens = Effect.fn('testBrandTokens')(function* (
  name: string,
): Effect.fn.Return<BrandTokens, never, FileSystem.FileSystem> {
  const brand = yield* Effect.orDie(loadBrand(FRAMEWORK_ROOT, name));
  return brand.tokens;
});

/**
 * What a slide rule gets, for one step of one slide.
 *
 * @param tokens - The brand's tokens.
 * @param page - The measured page.
 * @param options - The slide, its step and errors, and its layout.
 */
export function slideRuleInput(
  tokens: BrandTokens,
  page: Partial<CollectedPage>,
  options: {
    slide?: Partial<SlideContext>;
    step?: number;
    pageErrors?: readonly string[];
    layout?: AnyLayoutContract;
  } = {},
): SlideRuleInput {
  const slide = slideContext(options.slide);
  const snapshot: StepSnapshot = {
    step: options.step ?? 0,
    ...collectedPage(page),
    pageErrors: options.pageErrors ?? [],
  };
  return {
    snapshot,
    slide,
    neighbours: { previous: undefined, next: undefined },
    deck: deckInput(tokens, [slide]).deck,
    brand: brandContext(tokens.name, tokens, slide.surface),
    layout: options.layout,
  };
}

/**
 * What a deck rule gets, for a deck of the given slides.
 *
 * @param tokens - The brand's tokens.
 * @param slides - The slides, each with the fields that matter to the test.
 * @param options - The deck's duration, load errors and open comments by slide.
 */
export function deckInput(
  tokens: BrandTokens,
  slides: readonly Partial<SlideContext>[],
  options: {
    durationSeconds?: number;
    pageErrors?: readonly string[];
    openComments?: Readonly<Record<string, number>>;
  } = {},
): DeckRuleInput {
  return {
    deck: {
      id: 'test',
      title: 'Test',
      configFile: 'decks/test/deck.config.ts',
      slides: slides.map((slide, index) => slideContext({ index, id: `s${index + 1}`, ...slide })),
      durationSeconds: options.durationSeconds,
      pageErrors: options.pageErrors ?? [],
      openComments: options.openComments ?? {},
    },
    brand: brandContext(tokens.name, tokens, 'default'),
  };
}
