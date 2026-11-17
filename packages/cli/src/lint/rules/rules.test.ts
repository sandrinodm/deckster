import type { BrandTokens } from '@deckster/brand';
import type { AnyLayoutContract } from '@deckster/engine/layout';

import kitCatalog from '@deckster/kit/catalog';
import { NodeServices } from '@effect/platform-node';
import { expect, layer } from '@effect/vitest';
import { Effect } from 'effect';

import type { ElementSnapshot, SlideRule } from '#lint/types.ts';

import { brokenImageRule } from '#lint/rules/broken-image.ts';
import { canvasOverflowRule } from '#lint/rules/canvas-overflow.ts';
import { containerOverflowRule } from '#lint/rules/container-overflow.ts';
import { contentBudgetRule } from '#lint/rules/content-budget.ts';
import { contrastRule } from '#lint/rules/contrast.ts';
import { fewBuildsRule } from '#lint/rules/few-builds.ts';
import { layoutRepetitionRule } from '#lint/rules/layout-repetition.ts';
import { lowResImageRule } from '#lint/rules/low-res-image.ts';
import { minFontSizeRule } from '#lint/rules/min-font-size.ts';
import { missingNotesRule } from '#lint/rules/missing-notes.ts';
import { offBrandRule } from '#lint/rules/off-brand.ts';
import { loadErrorRule, renderErrorRule } from '#lint/rules/render-error.ts';
import { slotContentRule } from '#lint/rules/slot-content.ts';
import { textOverlapRule } from '#lint/rules/text-overlap.ts';
import { timeBudgetRule } from '#lint/rules/time-budget.ts';
import {
  deckInput,
  element,
  slideRuleInput,
  testBrandTokens,
  textElement,
} from '#lint/snapshot.fixture.ts';

/**
 * The messages a slide rule reports for the given elements on the default brand's default surface.
 */
function messages(rule: SlideRule, tokens: BrandTokens, elements: ElementSnapshot[]): string[] {
  return rule.check(slideRuleInput(tokens, { elements })).map((violation) => violation.message);
}

layer(NodeServices.layer)('lint rules', (it) => {
  it.effect('canvas-overflow reports the outermost element past the edge, not decoration', () =>
    Effect.gen(function* () {
      const tokens = yield* testBrandTokens('default');
      const list = element({
        index: 0,
        selector: 'ul',
        rect: { x: 0, y: 900, width: 500, height: 400 },
      });
      const item = element({
        index: 1,
        parent: 0,
        selector: 'ul > li',
        rect: { x: 0, y: 1000, width: 500, height: 300 },
      });
      const blob = element({
        index: 2,
        selector: 'div.blob',
        decorative: true,
        rect: { x: 1700, y: 100, width: 600, height: 600 },
      });
      const shape = element({
        index: 3,
        selector: 'div.shape',
        position: 'absolute',
        rect: { x: -100, y: 0, width: 300, height: 300 },
      });
      const violations = canvasOverflowRule.check(
        slideRuleInput(tokens, { elements: [list, item, blob, shape] }),
      );
      expect(violations.map((violation) => violation.selector)).toEqual(['ul']);
      expect(violations[0]?.message).toContain('220px past the bottom edge');
    }),
  );

  it.effect('container-overflow reports clipped content but not glyphs, decoration or shapes', () =>
    Effect.gen(function* () {
      const tokens = yield* testBrandTokens('default');
      const box = element({
        index: 0,
        selector: 'div.box',
        overflowY: 'hidden',
        rect: { x: 0, y: 0, width: 700, height: 120 },
      });
      const paragraph = textElement('Too long', {
        index: 1,
        parent: 0,
        selector: 'div.box > p',
        rect: { x: 0, y: 0, width: 700, height: 150 },
      });
      const stat = textElement('42%', {
        index: 2,
        selector: 'div.stat',
        fontSizePx: 168,
        lineHeightPx: 159.6,
        rect: { x: 0, y: 300, width: 400, height: 159.6 },
        textLines: [{ x: 0, y: 280, width: 300, height: 200 }],
      });
      const card = element({
        index: 3,
        selector: 'div.card',
        overflowX: 'hidden',
        overflowY: 'hidden',
        rect: { x: 0, y: 600, width: 640, height: 200 },
      });
      const shape = element({
        index: 4,
        parent: 3,
        selector: 'div.card > div',
        position: 'absolute',
        rect: { x: 500, y: 700, width: 240, height: 240 },
      });
      const blob = element({
        index: 5,
        parent: 3,
        selector: 'div.card > div.blob',
        decorative: true,
        rect: { x: 560, y: 600, width: 400, height: 400 },
      });
      const violations = containerOverflowRule.check(
        slideRuleInput(tokens, { elements: [box, paragraph, stat, card, shape, blob] }),
      );
      expect(violations.map((violation) => violation.selector)).toEqual(['div.box']);
      expect(violations[0]?.message).toContain('30px more height than it has (clipped)');
    }),
  );

  it.effect('min-font-size checks the rendered size against the brand minimum', () =>
    Effect.gen(function* () {
      const tokens = yield* testBrandTokens('default');
      const scaledSvg = textElement('sixty', {
        index: 0,
        inSvg: true,
        fontSizePx: 6,
        renderedFontSizePx: 60,
      });
      const tinySvg = textElement('eight', { index: 1, inSvg: true, fontSizePx: 8 });
      const shrunk = textElement('shrunk', { index: 2, fontSizePx: 34, renderedFontSizePx: 10.2 });
      const caption = textElement('caption', { index: 3, fontSizePx: 20 });
      expect(messages(minFontSizeRule, tokens, [scaledSvg, tinySvg, shrunk, caption])).toEqual([
        '"eight" appears at 8px; the minimum is 20px.',
        '"shrunk" appears at 10.2px (font-size 34px scaled by 0.3); the minimum is 20px.',
      ]);
    }),
  );

  it.effect('text-overlap reports an overflowing code block once, not once per token', () =>
    Effect.gen(function* () {
      const tokens = yield* testBrandTokens('default');
      const block = element({
        index: 0,
        selector: 'figure.kit-code',
        data: { 'text-block': '' },
        rect: { x: 0, y: 0, width: 1400, height: 400 },
      });
      const token = (index: number, x: number) =>
        textElement(`token${index}`, {
          index,
          parent: 0,
          selector: `figure.kit-code span:nth-of-type(${index})`,
          fontSizePx: 28,
          rect: { x, y: 100, width: 120, height: 34 },
        });
      const aside = textElement('This aside has far more words than the block lets it hold', {
        index: 4,
        selector: 'aside p',
        fontSizePx: 28,
        rect: { x: 1000, y: 100, width: 700, height: 34 },
      });
      const violations = textOverlapRule.check(
        slideRuleInput(tokens, {
          elements: [block, token(1, 1000), token(2, 1130), token(3, 1260), aside],
        }),
      );
      expect(violations).toHaveLength(1);
      expect(violations[0]?.message).toContain('The code block `figure.kit-code`');
    }),
  );

  it.effect('text-overlap reports lines drawn over each other, not stacked ones', () =>
    Effect.gen(function* () {
      const tokens = yield* testBrandTokens('default');
      const line = (index: number, text: string, y: number, x = 0) =>
        textElement(text, {
          index,
          selector: `p:nth-of-type(${index + 1})`,
          fontSizePx: 34,
          rect: { x, y, width: 400, height: 41 },
        });
      const tightStack = [
        textElement('Display one', {
          index: 0,
          fontSizePx: 152,
          rect: { x: 0, y: 0, width: 900, height: 149 },
        }),
        textElement('Display two', {
          index: 1,
          fontSizePx: 152,
          rect: { x: 0, y: 149, width: 900, height: 149 },
        }),
      ];
      expect(messages(textOverlapRule, tokens, tightStack)).toEqual([]);
      expect(
        messages(textOverlapRule, tokens, [line(0, 'First', 0), line(1, 'Second', 20, 40)]),
      ).toEqual(['"First" and "Second" are drawn over each other.']);
      expect(
        messages(textOverlapRule, tokens, [line(0, 'First', 0), line(1, 'Second', 60)]),
      ).toEqual([]);
    }),
  );

  it.effect('contrast applies opacity and the large-text threshold, and skips images', () =>
    Effect.gen(function* () {
      const tokens = yield* testBrandTokens('default');
      const faded = textElement('faded', { index: 0, opacity: 0.3, fontSizePx: 34 });
      const muted = textElement('muted', {
        index: 1,
        color: tokens.surfaces['default']?.roles.muted ?? '',
      });
      const onImage = textElement('photo', {
        index: 2,
        color: '#ffffff',
        background: { kind: 'image' },
      });
      const lightGray = '#888888';
      const large = textElement('large', { index: 3, color: lightGray, fontSizePx: 34 });
      const small = textElement('small', { index: 4, color: lightGray, fontSizePx: 22 });
      const violations = contrastRule.check(
        slideRuleInput(tokens, { elements: [faded, muted, onImage, large, small] }),
      );
      expect(violations.map((violation) => violation.message)).toEqual([
        expect.stringMatching(
          /^"faded" has 1\.\d\d:1 contrast with its background; large text needs 3:1\.$/,
        ),
        expect.stringMatching(/^"small" has 3\.\d\d:1 contrast .* normal text needs 4\.5:1\.$/),
      ]);
      expect(violations[0]?.fix).toContain('`text-fg`');
    }),
  );

  it.effect('contrast measures text over a photo against the pixels under it', () =>
    Effect.gen(function* () {
      const tokens = yield* testBrandTokens('default');
      const caption = textElement('caption', {
        index: 0,
        color: '#454b6e',
        fontSizePx: 20,
        background: { kind: 'media', colors: ['#3c7a30', '#6aa85a'] },
      });
      const onScrim = textElement('title', {
        index: 1,
        color: '#ffffff',
        fontSizePx: 22,
        background: { kind: 'media', colors: ['#2b2b2b', '#6b6b6b'] },
      });
      const unsampled = textElement('unsampled', {
        index: 2,
        color: '#454b6e',
        background: { kind: 'media', colors: [] },
      });
      const image = kitCatalog.layouts.find((layout) => layout.name === 'image');
      const violations = contrastRule.check(
        slideRuleInput(
          tokens,
          { elements: [caption, onScrim, unsampled] },
          image === undefined ? {} : { layout: image },
        ),
      );
      expect(violations.map((violation) => violation.message)).toEqual([
        expect.stringMatching(
          /^"caption" has 1\.\d\d:1 contrast with the picture under it; normal text needs 4\.5:1\.$/,
        ),
      ]);
      expect(violations[0]?.fix).toContain('`text: left`');
      expect(violations[0]?.fix).toContain('`focal`');
      const plain = contrastRule.check(slideRuleInput(tokens, { elements: [caption] }));
      expect(plain[0]?.fix).toContain('Use the image layout');
    }),
  );

  it.effect('off-brand lets text over a photo be white, but no other color', () =>
    Effect.gen(function* () {
      const tokens = yield* testBrandTokens('default');
      const { families, scale } = tokens.typography;
      const body = { fontFamily: families.body.family, fontSizePx: scale.body.size };
      const media = { kind: 'media', colors: ['#202020'] } as const;
      const white = textElement('white', {
        ...body,
        index: 0,
        color: '#ffffff',
        background: media,
      });
      const pink = textElement('pink', { ...body, index: 1, color: '#ff00aa', background: media });
      expect(messages(offBrandRule, tokens, [white, pink])).toEqual([
        expect.stringContaining('"pink" uses the text color #ff00aa'),
      ]);
    }),
  );

  it.effect('off-brand reports hard-coded colors and fonts, and off-scale sizes and spacing', () =>
    Effect.gen(function* () {
      const tokens = yield* testBrandTokens('default');
      const roles = tokens.surfaces['default']?.roles;
      const { families, scale } = tokens.typography;
      const body = { fontFamily: families.body.family, fontSizePx: scale.body.size };
      const pink = textElement('pink', { ...body, index: 0, color: '#ff00aa' });
      const serif = textElement('serif', { ...body, index: 1, fontFamily: 'Georgia' });
      const odd = textElement('odd', { ...body, index: 2, fontSizePx: 37 });
      const padded = element({
        index: 3,
        spacing: { padding: [28, 28, 28, 28], margin: [0, 0, 0, 0], gap: [0, 0] },
      });
      const fine = textElement('fine', {
        index: 4,
        color: `${roles?.accent ?? ''}99`,
        backgroundColor: roles?.surface ?? '',
        fontFamily: families.display.family,
        fontSizePx: scale.display.size,
        spacing: { padding: [16, 16, 16, 16], margin: [0, 0, 0, 0], gap: [40, 40] },
      });
      const code = textElement('code', { ...body, index: 5, tag: 'code', fontSizePx: 27.88 });
      const fitted = textElement('230', {
        ...body,
        index: 6,
        data: { fit: 'shrunk' },
        fontSizePx: 230,
      });
      const unit = textElement('%', { ...body, index: 7, parent: 6, fontSizePx: 115 });
      const centered = element({
        index: 8,
        spacing: { padding: [0, 0, 0, 0], margin: [0, 960, 0, 960], gap: [0, 0] },
      });
      const violations = offBrandRule.check(
        slideRuleInput(tokens, {
          elements: [pink, serif, odd, padded, fine, code, fitted, unit, centered],
        }),
      );
      expect(violations.map(({ message, severity }) => [severity, message])).toEqual([
        ['warning', '`div` uses the padding 28px, which is not a default brand token.'],
        [
          'error',
          '"pink" uses the text color #ff00aa, which is not a default brand token on the "default" surface.',
        ],
        ['error', '"serif" uses the font family Georgia, which is not a default brand token.'],
        ['warning', '"odd" uses the font size 37px, which is not a default brand token.'],
      ]);
    }),
  );

  it.effect('off-brand checks the SVG paint a shape draws, not the black a group inherits', () =>
    Effect.gen(function* () {
      const tokens = yield* testBrandTokens('default');
      const black: ElementSnapshot['paint'] = { fill: '#000000', stroke: null };
      const svgElement = (index: number, tag: string, paint = black) =>
        element({ index, tag, selector: `svg > ${tag}`, inSvg: true, paint });
      const violations = offBrandRule.check(
        slideRuleInput(tokens, {
          elements: [
            svgElement(0, 'g'),
            svgElement(1, 'image'),
            svgElement(2, 'line'),
            svgElement(3, 'use', { fill: '#ff00aa', stroke: null }),
            svgElement(4, 'rect'),
            svgElement(5, 'line', { fill: '#000000', stroke: '#ff00aa' }),
          ],
        }),
      );
      expect(violations.map(({ message }) => message)).toEqual([
        '`svg > use` uses the fill #ff00aa, which is not a default brand token on the "default" ' +
          'surface.',
        '`svg > rect` uses the fill #000000, which is not a default brand token on the "default" ' +
          'surface. Black is the SVG default for a shape that sets no fill, and the slide draws it.',
        '`svg > line` uses the stroke #ff00aa, which is not a default brand token on the ' +
          '"default" surface.',
      ]);
      expect(violations[1]?.fix).toContain('data-fill="fg"');
      expect(violations[1]?.fix).toContain('fill="none"');
    }),
  );

  it.effect('low-res-image reports a raster drawn larger than its pixels, not an SVG', () =>
    Effect.gen(function* () {
      const tokens = yield* testBrandTokens('default');
      const rect = { x: 0, y: 0, width: 640, height: 360 };
      const small = element({
        index: 0,
        tag: 'img',
        rect,
        image: { src: '/photo.png', naturalWidth: 320, naturalHeight: 180, vector: false },
      });
      const sharp = element({
        index: 1,
        tag: 'img',
        rect,
        image: { src: '/big.png', naturalWidth: 1280, naturalHeight: 720, vector: false },
      });
      const vector = element({
        index: 2,
        tag: 'img',
        rect,
        image: { src: '/mark.svg', naturalWidth: 16, naturalHeight: 9, vector: true },
      });
      expect(messages(lowResImageRule, tokens, [small, sharp, vector])).toEqual([
        'photo.png is 320x180 pixels but is drawn at 640x360 canvas pixels.',
      ]);
    }),
  );

  it.effect('render-error reports the error marker, page errors and load errors', () =>
    Effect.gen(function* () {
      const tokens = yield* testBrandTokens('default');
      const broken = slideRuleInput(
        tokens,
        { renderError: { file: 'slides/s.tsx', message: 'boom\n  at Slide' } },
        { pageErrors: ['late'] },
      );
      expect(renderErrorRule.check(broken).map((violation) => violation.message)).toEqual([
        'The slide shows an error instead of its content: boom',
        'The page threw while this slide was shown: late',
      ]);
      expect(renderErrorRule.check(slideRuleInput(tokens, {}))).toEqual([]);
      const loaded = deckInput(tokens, [{}], { pageErrors: ['early'] });
      expect(loadErrorRule.check(loaded)).toEqual([
        expect.objectContaining({
          slide: null,
          message: 'The page threw while the deck loaded: early',
        }),
      ]);
    }),
  );

  it.effect("content-budget reports each limit a slot goes over the layout's budget", () =>
    Effect.gen(function* () {
      const tokens = yield* testBrandTokens('default');
      const layout = {
        budget: { body: { maxWords: 90, maxBullets: 6, maxLines: 9 } },
      } as unknown as AnyLayoutContract;
      const slots = [
        { name: 'body', words: 120, bullets: 3, lines: 9 },
        { name: 'left', words: 500, bullets: 40, lines: 60 },
      ];
      const violations = contentBudgetRule.check(slideRuleInput(tokens, { slots }, { layout }));
      expect(violations.map((violation) => violation.message)).toEqual([
        'The body slot holds 120 words; its layout allows 90.',
      ]);
      expect(violations[0]?.selector).toBe('[data-slot="body"] (maxWords)');
      expect(contentBudgetRule.check(slideRuleInput(tokens, { slots }))).toEqual([]);
    }),
  );

  it.effect('missing-notes warns about a slide without notes', () =>
    Effect.gen(function* () {
      const tokens = yield* testBrandTokens('default');
      expect(
        missingNotesRule.check(slideRuleInput(tokens, {}, { slide: { notes: ' \n' } })),
      ).toHaveLength(1);
      expect(missingNotesRule.check(slideRuleInput(tokens, {}))).toEqual([]);
    }),
  );

  it.effect('layout-repetition reports three slides in a row with one layout and surface', () =>
    Effect.gen(function* () {
      const tokens = yield* testBrandTokens('default');
      const alternating = deckInput(tokens, [
        { surface: 'default' },
        { surface: 'inverse' },
        { surface: 'default' },
        { surface: 'inverse' },
      ]);
      expect(layoutRepetitionRule.check(alternating)).toEqual([]);
      const repeated = deckInput(tokens, [{ surface: 'inverse' }, {}, {}, {}]);
      expect(layoutRepetitionRule.check(repeated)).toEqual([
        expect.objectContaining({
          slide: 's4',
          message: '3 slides in a row use the default layout on the default surface: s2, s3, s4.',
        }),
      ]);
    }),
  );

  it.effect('few-builds reports a deck whose chart, diagram and code slides rarely build', () =>
    Effect.gen(function* () {
      const tokens = yield* testBrandTokens('default');
      const figures = (stepCounts: readonly number[]) =>
        deckInput(tokens, [
          { layout: 'title' },
          ...stepCounts.map((stepCount, index) => ({
            layout: index % 2 === 0 ? 'chart' : 'diagram',
            stepCount,
          })),
          { layout: 'content', stepCount: 3 },
        ]);
      expect(fewBuildsRule.check(figures([1, 1, 1]))).toEqual([]);
      expect(fewBuildsRule.check(figures([3, 1, 1, 1]))).toEqual([]);
      expect(fewBuildsRule.check(figures([3, 1, 1, 1, 1]))).toEqual([
        expect.objectContaining({
          slide: null,
          message:
            '1 of 5 chart, diagram and code slides build in steps; these show everything at ' +
            'once: s3, s4, s5, s6.',
        }),
      ]);
      const threeOfFourteen = [3, 4, 6, ...Array.from({ length: 11 }, () => 1)];
      expect(fewBuildsRule.check(figures(threeOfFourteen))).toHaveLength(1);
    }),
  );

  it.effect('time-budget compares the slide budgets with the duration, when there is one', () =>
    Effect.gen(function* () {
      const tokens = yield* testBrandTokens('default');
      const slides = [{ budgetSeconds: 90 }, { budgetSeconds: 60 }, {}];
      expect(timeBudgetRule.check(deckInput(tokens, slides))).toEqual([]);
      expect(timeBudgetRule.check(deckInput(tokens, slides, { durationSeconds: 150 }))).toEqual([]);
      expect(timeBudgetRule.check(deckInput(tokens, slides, { durationSeconds: 120 }))).toEqual([
        expect.objectContaining({
          message:
            "The slides' budgets add up to 2:30 (1 slide has no budget, so it is more); the talk has 2:00.",
        }),
      ]);
    }),
  );
});

layer(NodeServices.layer)('lint rules for layouts and media', (it) => {
  it.effect('broken-image reports an image that loaded no pixels, not one that loaded', () =>
    Effect.gen(function* () {
      const tokens = yield* testBrandTokens('default');
      const image = (index: number, src: string, size: number) =>
        element({
          index,
          tag: 'img',
          selector: `img:nth-of-type(${index + 1})`,
          isMedia: true,
          image: { src, naturalWidth: size, naturalHeight: size, vector: false },
        });
      expect(
        messages(brokenImageRule, tokens, [
          image(0, 'http://localhost/street.jpg', 0),
          image(1, 'http://localhost/park.jpg', 800),
        ]),
      ).toEqual(['street.jpg did not load (http://localhost/street.jpg).']);
    }),
  );

  it.effect('slot-content reports a list in a slot whose layout does not take bullets', () =>
    Effect.gen(function* () {
      const tokens = yield* testBrandTokens('default');
      const layout = {
        name: 'statement',
        slots: { body: { description: 'One sentence.', accepts: ['text', 'quote'] } },
        budget: {},
      } as unknown as AnyLayoutContract;
      const list = [{ name: 'body', words: 4, bullets: 2, lines: 2 }];
      const text = [{ name: 'body', words: 4, bullets: 0, lines: 1 }];
      expect(
        slotContentRule
          .check(slideRuleInput(tokens, { slots: list }, { layout }))
          .map((v) => v.message),
      ).toEqual([
        'The body slot holds a list of 2 items; the statement layout sets it as text or quote.',
      ]);
      expect(slotContentRule.check(slideRuleInput(tokens, { slots: text }, { layout }))).toEqual(
        [],
      );
    }),
  );

  it.effect('content-budget holds a slide to the tightest variant it matches, and names it', () =>
    Effect.gen(function* () {
      const tokens = yield* testBrandTokens('default');
      const layout = {
        budget: { body: { maxWords: 56 } },
        variants: [
          {
            name: 'ratio 5:7',
            when: { fields: { ratio: '5:7' } },
            budget: { body: { maxWords: 30 } },
          },
        ],
      } as unknown as AnyLayoutContract;
      const slots = [{ name: 'body', words: 40, bullets: 0, lines: 6 }];
      const narrow = { frontmatter: { layout: 'split', ratio: '5:7' } };
      const wide = { frontmatter: { layout: 'split', ratio: '7:5' } };
      expect(
        contentBudgetRule
          .check(slideRuleInput(tokens, { slots }, { layout, slide: narrow }))
          .map((v) => v.message),
      ).toEqual(['The body slot holds 40 words; its layout allows 30 (ratio 5:7).']);
      expect(
        contentBudgetRule.check(slideRuleInput(tokens, { slots }, { layout, slide: wide })),
      ).toEqual([]);
    }),
  );

  it.effect('container-overflow reports a box that spills far more than a box inside it', () =>
    Effect.gen(function* () {
      const tokens = yield* testBrandTokens('default');
      const column = element({
        index: 0,
        selector: 'div.column',
        rect: { x: 0, y: 0, width: 600, height: 500 },
      });
      const eyebrow = element({
        index: 1,
        parent: 0,
        selector: 'div.column > p.eyebrow',
        rect: { x: 0, y: 0, width: 300, height: 30 },
      });
      const label = textElement('A long eyebrow', {
        index: 2,
        parent: 1,
        selector: 'div.column > p.eyebrow > span',
        rect: { x: 0, y: 0, width: 303, height: 30 },
      });
      const body = element({
        index: 3,
        parent: 0,
        selector: 'div.column > div.body',
        rect: { x: 0, y: 40, width: 600, height: 545 },
      });
      const found = messages(containerOverflowRule, tokens, [column, eyebrow, label, body]);
      expect(found).toHaveLength(2);
      expect(found[0]).toContain('div.column');
      expect(found[0]).toContain('85px more height');
      expect(found[1]).toContain('p.eyebrow');
    }),
  );
});
