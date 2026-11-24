import { NodeServices } from '@effect/platform-node';
import { expect, layer } from '@effect/vitest';
import { Effect, Layer } from 'effect';

import type { ElementSnapshot, SlideRuleInput } from '#lint/types.ts';

import { fakeDeckLayer, pageSlide, type FakeDeck } from '#browser/fake-deck.fixture.ts';
import { formatReport } from '#lint/format-report.ts';
import { FIXTURE_WORKSPACE } from '#lint/lint.fixtures.ts';
import { canvasOverflowRule } from '#lint/rules/canvas-overflow.ts';
import { decorativeElements } from '#lint/rules/elements.ts';
import {
  placedChromeRule,
  placedCountRule,
  placedCoversTextRule,
  placedOffCanvasRule,
  placedPixelsRule,
  placedSizeRule,
  placedWordsRule,
} from '#lint/rules/placed.ts';
import { textTruncatedRule } from '#lint/rules/text-truncated.ts';
import { lintDeck } from '#lint/run-lint.ts';
import {
  collectedPage,
  element,
  slideContext,
  slideRuleInput,
  testBrandTokens,
  textElement,
} from '#lint/snapshot.fixture.ts';
import { Workspace } from '#workspace.ts';

/**
 * Builds a placed root element snapshot with sensible defaults in the safe area.
 *
 * @param overrides - Fields to override on the element snapshot.
 */
function placedBox(overrides: Partial<ElementSnapshot> = {}): ElementSnapshot {
  const rect = overrides.rect ?? { x: 1400, y: 120, width: 320, height: 120 };
  return element({
    selector: 'div.deck-placed > div.kit-placed',
    position: 'absolute',
    rect,
    data: {
      placed: 'shape',
      'placed-zone': 'safe',
      'placed-mode': 'place',
      'placed-spec': 'top-right',
      ...overrides.data,
    },
    ...overrides,
  });
}

/**
 * Repeats a word `count` times, separated by spaces.
 *
 * @param count - Number of words.
 */
function words(count: number): string {
  return Array.from({ length: count }, (_, index) => `word${index + 1}`).join(' ');
}

/**
 * Builds a slide rule input positioned as slide 2 of a 2-slide deck so `skipFirst` does not hide
 * chrome on the checked slide.
 *
 * @param input - Base slide rule input.
 */
function secondSlideInput(input: SlideRuleInput): SlideRuleInput {
  const first = slideContext({ index: 0, id: 'title' });
  const second = slideContext({ ...input.slide, index: 1, id: 'content' });
  return {
    ...input,
    slide: second,
    deck: { ...input.deck, slides: [first, second] },
  };
}

layer(NodeServices.layer)('placed element lint rules', (it) => {
  it.effect('placed-off-canvas reports placed boxes leaving their zone or the canvas', () =>
    Effect.gen(function* () {
      const tokens = yield* testBrandTokens('default');
      // Default brand safe zone: x=128..1792, y=112..968.
      const insideSafe = placedBox({
        index: 0,
        selector: 'div.ok',
        rect: { x: 1400, y: 120, width: 300, height: 120 },
      });
      const outsideSafe = placedBox({
        index: 1,
        selector: 'div.past-safe',
        rect: { x: 1650, y: 120, width: 200, height: 120 },
        data: {
          placed: 'shape',
          'placed-zone': 'safe',
          'placed-mode': 'place',
          'placed-spec': 'top-right',
          'placed-name': 'Overflow badge',
        },
      });
      const fullBleedCanvas = placedBox({
        index: 2,
        selector: 'div.bleed-ok',
        rect: { x: 0, y: 0, width: 1920, height: 100 },
        data: {
          placed: 'shape',
          'placed-zone': 'canvas',
          'placed-mode': 'place',
          'placed-spec': 'top',
        },
      });
      const offCanvas = placedBox({
        index: 3,
        selector: 'div.off-canvas',
        rect: { x: 1800, y: 120, width: 200, height: 120 },
        data: {
          placed: 'shape',
          'placed-zone': 'canvas',
          'placed-mode': 'box',
          'placed-spec': 'box=1800,120,200,120',
        },
      });
      const hiddenStep = placedBox({
        index: 4,
        selector: 'div.hidden-step',
        opacity: 0,
        rect: { x: 2000, y: 120, width: 200, height: 120 },
      });

      const violations = placedOffCanvasRule.check(
        slideRuleInput(tokens, {
          elements: [insideSafe, outsideSafe, fullBleedCanvas, offCanvas, hiddenStep],
        }),
      );
      expect(violations.map((v) => v.selector)).toEqual(['div.past-safe', 'div.off-canvas']);
      expect(violations[0]?.message).toContain('<Shape> "Overflow badge"');
      expect(violations[0]?.message).toContain('outside the safe zone');
      expect(violations[0]?.fix).toContain('zone="canvas"');
      expect(violations[1]?.message).toContain('past the canvas');
      expect(violations[1]?.message).toContain('80px past the right edge');
    }),
  );

  it.effect(
    'placed-covers-text reports overlap with slot text and ignores placed descendants',
    () =>
      Effect.gen(function* () {
        const tokens = yield* testBrandTokens('default');
        const slotHeading = textElement('Main headline', {
          index: 0,
          selector: 'header > h1',
          fontSizePx: 80,
          rect: { x: 128, y: 140, width: 800, height: 80 },
        });
        const covering = placedBox({
          index: 1,
          selector: 'div.covering',
          rect: { x: 400, y: 130, width: 320, height: 120 },
        });
        const ownText = textElement('Inside badge', {
          index: 2,
          parent: 1,
          selector: 'div.covering > p',
          rect: { x: 420, y: 150, width: 200, height: 40 },
        });
        const clear = placedBox({
          index: 3,
          selector: 'div.clear',
          rect: { x: 1400, y: 140, width: 300, height: 100 },
        });
        const clearText = textElement('Clean badge', {
          index: 4,
          parent: 3,
          selector: 'div.clear > p',
          rect: { x: 1420, y: 160, width: 200, height: 40 },
        });
        const unrevealed = placedBox({
          index: 5,
          selector: 'div.unrevealed',
          opacity: 0,
          rect: { x: 128, y: 140, width: 300, height: 100 },
        });

        const violations = placedCoversTextRule.check(
          slideRuleInput(tokens, {
            elements: [slotHeading, covering, ownText, clear, clearText, unrevealed],
          }),
        );
        expect(violations.map((v) => v.selector)).toEqual(['div.covering']);
        expect(violations[0]?.message).toContain('"Main headline"');
        expect(violations[0]?.fix).toContain('height');
      }),
  );

  it.effect('placed-chrome warns on direct chrome overlap and on occupied chrome corners', () =>
    Effect.gen(function* () {
      const tokens = yield* testBrandTokens('default');
      // Case (a): direct overlap with measured chrome item.
      const overlapping = placedBox({
        index: 0,
        selector: 'div.hit-chrome',
        rect: { x: 1700, y: 980, width: 150, height: 60 },
        data: {
          placed: 'text',
          'placed-zone': 'footer',
          'placed-mode': 'place',
          'placed-spec': 'bottom-right',
        },
      });
      const directHits = placedChromeRule.check(
        secondSlideInput(
          slideRuleInput(tokens, {
            elements: [overlapping],
            chrome: [
              {
                corner: 'bottom-right',
                kind: 'text',
                box: { x: 1740, y: 1000, width: 80, height: 28 },
              },
            ],
          }),
        ),
      );
      expect(directHits).toHaveLength(1);
      expect(directHits[0]?.message).toContain('overlaps slide chrome (text in bottom-right)');

      // Case (b): chrome yielded out of bottom-right (not present in snapshot.chrome), but brand
      // configures page number in bottom-right and logo in top-right; bottom-left has no chrome.
      const yieldedBottomRight = placedBox({
        index: 0,
        selector: 'div.footer-right',
        rect: { x: 1500, y: 990, width: 292, height: 60 },
        data: {
          placed: 'text',
          'placed-zone': 'footer',
          'placed-mode': 'place',
          'placed-spec': 'bottom-right',
        },
      });
      const safeBottomLeft = placedBox({
        index: 1,
        selector: 'div.footer-left',
        rect: { x: 128, y: 990, width: 320, height: 60 },
        data: {
          placed: 'text',
          'placed-zone': 'footer',
          'placed-mode': 'place',
          'placed-spec': 'bottom-left',
        },
      });
      const insideSafeFlush = placedBox({
        index: 2,
        selector: 'div.safe-bottom-right',
        rect: { x: 1500, y: 848, width: 292, height: 120 },
        data: {
          placed: 'shape',
          'placed-zone': 'safe',
          'placed-mode': 'place',
          'placed-spec': 'bottom-right',
        },
      });
      const yieldedHits = placedChromeRule.check(
        secondSlideInput(
          slideRuleInput(tokens, {
            elements: [yieldedBottomRight, safeBottomLeft, insideSafeFlush],
            chrome: [],
          }),
        ),
      );
      expect(yieldedHits.map((v) => v.selector)).toEqual(['div.footer-right']);
      expect(yieldedHits[0]?.message).toContain('bottom-right chrome corner');
      expect(yieldedHits[0]?.message).toContain('page number');

      // Slide with `chrome: false` should not trigger corner warnings.
      const suppressed = placedChromeRule.check(
        secondSlideInput(
          slideRuleInput(
            tokens,
            { elements: [yieldedBottomRight], chrome: [] },
            { slide: { frontmatter: { layout: 'default', chrome: false } } },
          ),
        ),
      );
      expect(suppressed).toEqual([]);
    }),
  );

  it.effect('placed-count passes at 4 placed elements and errors at 5, ignoring hidden steps', () =>
    Effect.gen(function* () {
      const tokens = yield* testBrandTokens('default');
      const four = Array.from({ length: 4 }, (_, index) =>
        placedBox({ index, selector: `div.p-${index}` }),
      );
      const hiddenFifth = placedBox({ index: 4, selector: 'div.p-hidden', opacity: 0 });
      expect(
        placedCountRule.check(slideRuleInput(tokens, { elements: [...four, hiddenFifth] })),
      ).toEqual([]);

      const five = [...four, placedBox({ index: 4, selector: 'div.p-4' })];
      const violations = placedCountRule.check(slideRuleInput(tokens, { elements: five }));
      expect(violations).toHaveLength(1);
      expect(violations[0]?.message).toContain('5 placed elements');
      expect(violations[0]?.selector).toBeNull();
    }),
  );

  it.effect('placed-words warns when one element exceeds 25 words or slide total exceeds 40', () =>
    Effect.gen(function* () {
      const tokens = yield* testBrandTokens('default');
      // 20 + 20 = 40 -> passes both caps.
      const a = placedBox({ index: 0, selector: 'div.a' });
      const aText = textElement(words(20), { index: 1, parent: 0, selector: 'div.a > p' });
      const b = placedBox({ index: 2, selector: 'div.b' });
      const bText = textElement(words(20), { index: 3, parent: 2, selector: 'div.b > p' });
      expect(
        placedWordsRule.check(slideRuleInput(tokens, { elements: [a, aText, b, bText] })),
      ).toEqual([]);

      // 26 words in one element + 20 in another = 46 total -> both warnings fire.
      const longText = textElement(words(26), { index: 1, parent: 0, selector: 'div.a > p' });
      const violations = placedWordsRule.check(
        slideRuleInput(tokens, { elements: [a, longText, b, bText] }),
      );
      expect(violations).toHaveLength(2);
      expect(violations[0]?.selector).toBe('div.a');
      expect(violations[0]?.message).toContain('26 words');
      expect(violations[1]?.selector).toBeNull();
      expect(violations[1]?.message).toContain('46 words in total');
    }),
  );

  it.effect('placed-size warns when a non-canvas box exceeds 35% of the safe area', () =>
    Effect.gen(function* () {
      const tokens = yield* testBrandTokens('default');
      // Default safe area: 1664 * 856 = 1,424,384 px^2; 35% ~= 498,534 px^2.
      const small = placedBox({
        index: 0,
        selector: 'div.small',
        rect: { x: 128, y: 112, width: 400, height: 200 },
      });
      const huge = placedBox({
        index: 1,
        selector: 'div.huge',
        rect: { x: 128, y: 112, width: 1000, height: 600 },
      });
      const fullBleed = placedBox({
        index: 2,
        selector: 'div.full-bleed',
        rect: { x: 0, y: 0, width: 1920, height: 1080 },
        data: {
          placed: 'shape',
          'placed-zone': 'canvas',
          'placed-mode': 'place',
          'placed-spec': 'center',
        },
      });

      const violations = placedSizeRule.check(
        slideRuleInput(tokens, { elements: [small, huge, fullBleed] }),
      );
      expect(violations.map((v) => v.selector)).toEqual(['div.huge']);
      expect(violations[0]?.message).toContain('42% of the safe area');
      expect(violations[0]?.fix).toContain('split');
    }),
  );

  it.effect('placed-pixels emits info with nearest place suggestion for box mode only', () =>
    Effect.gen(function* () {
      const tokens = yield* testBrandTokens('default');
      const named = placedBox({
        index: 0,
        selector: 'div.named',
        data: {
          placed: 'shape',
          'placed-zone': 'safe',
          'placed-mode': 'place',
          'placed-spec': 'top-right',
        },
      });
      const pixel = placedBox({
        index: 1,
        selector: 'div.pixel',
        rect: { x: 1472, y: 112, width: 320, height: 120 },
        data: {
          placed: 'shape',
          'placed-zone': 'canvas',
          'placed-mode': 'box',
          'placed-spec': 'box=1472,112,320,120',
        },
      });

      expect(placedPixelsRule.severity).toBe('info');
      const violations = placedPixelsRule.check(
        slideRuleInput(tokens, { elements: [named, pixel] }),
      );
      expect(violations).toHaveLength(1);
      expect(violations[0]?.selector).toBe('div.pixel');
      expect(violations[0]?.message).toContain('box={[1472, 112, 320, 120]}');
      expect(violations[0]?.fix).toMatch(/place=|cols=/);
    }),
  );

  it.effect(
    'decorativeElements keeps empty placed shapes and text-truncated flags data-fit=overflow',
    () =>
      Effect.gen(function* () {
        const tokens = yield* testBrandTokens('default');
        const layerDiv = element({
          index: 0,
          selector: 'div.deck-placed',
          position: 'absolute',
          rect: { x: 0, y: 0, width: 1920, height: 1080 },
        });
        const emptyPlacedShape = placedBox({
          index: 1,
          parent: 0,
          selector: 'div.deck-placed > div.kit-shape',
          rect: { x: 1850, y: 120, width: 200, height: 120 },
        });
        const emptyBgBlob = element({
          index: 2,
          selector: 'div.bg-blob',
          position: 'absolute',
          rect: { x: 1850, y: 500, width: 200, height: 120 },
        });

        const input = slideRuleInput(tokens, {
          elements: [layerDiv, emptyPlacedShape, emptyBgBlob],
        });
        const decorative = decorativeElements(input.snapshot);
        expect(decorative.has(0)).toBe(false);
        expect(decorative.has(1)).toBe(false);
        expect(decorative.has(2)).toBe(true);

        // Empty placed shape overflowing canvas is NOT skipped by canvas-overflow.
        const overflow = canvasOverflowRule.check(input);
        expect(overflow.map((v) => v.selector)).toEqual(['div.deck-placed > div.kit-shape']);

        // text-truncated flags FittedText data-fit="overflow" without duplicating ellipsis/clamp.
        const fittedOverflow = textElement('Too much text for a tiny badge', {
          index: 0,
          selector: 'div.kit-shape-text',
          data: { fit: 'overflow' },
        });
        const fittedOk = textElement('Fits fine', {
          index: 1,
          selector: 'div.kit-shape-text-ok',
          data: { fit: 'stepped' },
        });
        const truncated = textTruncatedRule.check(
          slideRuleInput(tokens, { elements: [fittedOverflow, fittedOk] }),
        );
        expect(truncated).toHaveLength(1);
        expect(truncated[0]?.selector).toBe('div.kit-shape-text');
        expect(truncated[0]?.message).toContain('did not fit its box');
      }),
  );

  it.effect('info findings do not fail lintDeck and are counted separately from warnings', () =>
    Effect.gen(function* () {
      const pixelBox = placedBox({
        index: 0,
        selector: 'div.deck-placed > div.kit-placed',
        rect: { x: 1472, y: 112, width: 320, height: 120 },
        data: {
          placed: 'shape',
          'placed-zone': 'canvas',
          'placed-mode': 'box',
          'placed-spec': 'box=1472,112,320,120',
        },
      });
      const deck: FakeDeck = {
        slides: [
          {
            page: pageSlide(0, 'eight-bullets', { notes: 'Speak clearly.' }),
            steps: [collectedPage({ elements: [pixelBox] })],
          },
        ],
      };
      const report = yield* lintDeck({
        deck: 'over-budget',
        brand: undefined,
        rules: [placedPixelsRule],
      }).pipe(
        Effect.provide(
          Layer.mergeAll(fakeDeckLayer(deck), Workspace.at(FIXTURE_WORKSPACE), NodeServices.layer),
        ),
      );

      expect(report.ok).toBe(true);
      expect(report.summary).toMatchObject({ errors: 0, warnings: 0, info: 1 });
      expect(report.findings).toHaveLength(1);
      expect(report.findings[0]?.severity).toBe('info');
      const formatted = formatReport(report);
      expect(formatted).toContain('  info    placed-pixels');
      expect(formatted).toContain('over-budget: 0 errors, 0 warnings, 1 info in 1 slide');
    }),
  );
});
