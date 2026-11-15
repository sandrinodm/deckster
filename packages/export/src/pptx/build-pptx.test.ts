import { loadBrand } from '@deckster/brand/node';
import { NodeServices } from '@effect/platform-node';
import { expect, layer } from '@effect/vitest';
import { Effect } from 'effect';
import path from 'node:path';

import { buildPptx } from '#pptx/build-pptx.ts';
import {
  deckInput,
  logoNode,
  pageNode,
  partsOf,
  PIXEL_PNG,
  slideInput,
  titleNode,
} from '#pptx/deck.fixture.ts';
import { boxNode, line, paragraph, run, textNode } from '#scene/scene.fixture.ts';

/**
 * The framework's workspace, with the shipped brands.
 */
const WORKSPACE_ROOT = path.resolve(import.meta.dirname, '../../../..');

layer(NodeServices.layer)('buildPptx', (it) => {
  it.effect(
    'puts the chrome on the master, a slide number placeholder on each slide, and media once',
    () =>
      Effect.gen(function* () {
        const brand = yield* loadBrand(WORKSPACE_ROOT, 'default');
        const slides = [1, 2].map((index) =>
          slideInput(index, [
            titleNode(10, `Slide ${index + 1} title`),
            logoNode(20),
            pageNode(30, `${index + 1} / 16`),
          ]),
        );
        const result = yield* buildPptx(deckInput(brand.tokens, slides));
        const parts = partsOf(result.bytes);
        const media = Object.keys(parts).filter((name) => name.startsWith('ppt/media/'));
        expect(media).toHaveLength(1);
        expect(result.masters).toEqual(['default']);
        const master = parts['ppt/slideMasters/slideMaster1.xml'] ?? '';
        expect(master).toContain('name="Logo"');
        expect(master).toContain('descr="Default logo"');
        expect(master).toContain('type="sldNum"');
        expect(master).toContain('lang="en-GB"');
        const slide = parts['ppt/slides/slide1.xml'] ?? '';
        expect(slide).not.toContain('name="Logo"');
        expect(slide).not.toContain('showMasterSp');
        expect(slide).toContain('<p:ph type="sldNum" idx="12"/>');
        expect(slide).toContain('type="slidenum"');
        expect(slide).toContain('<a:t> / 2</a:t>');
        expect(slide).toContain('<p:ph type="title"/>');
        expect(slide).toContain('wrap="square"');
        expect(slide).not.toContain('kern=');
        const presentation = parts['ppt/presentation.xml'] ?? '';
        expect(presentation).toContain('<a:defRPr lang="en-GB" kern="0"/>');
        expect(presentation).not.toContain('embeddedFontLst');
      }),
  );

  it.effect('writes numeric and named links to the first exported slide part', () =>
    Effect.gen(function* () {
      const brand = yield* loadBrand(WORKSPACE_ROOT, 'default');
      const valid = ['#/3', '#/closing', '#/closing/2/', '#/3/1/'];
      const external = 'https://example.org/#/closing';
      const cases = [
        [0, 1, 2],
        [0, 2],
        [0, 0, 2, 2],
      ];
      for (const indices of cases) {
        const omitted = indices.includes(1) ? [] : ['#/2', '#/details/1/'];
        const invalid = ['#/missing', '#/99', '#/0', '#/closing/bad', ...omitted];
        const hrefs = [...valid, ...invalid, external];
        const nodes = hrefs.map((href, index) =>
          textNode(
            index + 10,
            paragraph([line(href, 200 + index * 30, { runs: [run(href, { href })] })]),
          ),
        );
        const slides = indices.map((index) => slideInput(index, nodes));
        const result = yield* buildPptx(
          deckInput(brand.tokens, slides, {
            slideIds: ['intro', 'details', 'closing'],
          }),
        );
        const parts = partsOf(result.bytes);
        const xml = parts['ppt/slides/slide1.xml'] ?? '';
        const relationships = parts['ppt/slides/_rels/slide1.xml.rels'] ?? '';
        const target = indices.indexOf(2) + 1;
        const jumps = [
          ...xml.matchAll(/<a:hlinkClick r:id="([^"]+)" action="ppaction:\/\/hlinksldjump"/g),
        ];
        expect(jumps).toHaveLength(valid.length);
        for (const jump of jumps) {
          expect(relationships).toContain(
            `Id="${jump[1]}" ` +
              'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" ' +
              `Target="slide${target}.xml"`,
          );
        }

        expect(xml.match(/<a:hlinkClick /g)).toHaveLength(valid.length + 1);
        expect(relationships).toContain(`Target="${external}" TargetMode="External"`);
      }
    }),
  );

  it.effect('hides the master chrome on a slide that draws none, and keeps its own shapes', () =>
    Effect.gen(function* () {
      const brand = yield* loadBrand(WORKSPACE_ROOT, 'default');
      const plain = slideInput(1, [titleNode(10, 'Plain')]);
      const chromed = slideInput(2, [titleNode(10, 'Chromed'), logoNode(20)]);
      const parts = partsOf((yield* buildPptx(deckInput(brand.tokens, [chromed, plain]))).bytes);
      expect(parts['ppt/slides/slide2.xml']).toContain('showMasterSp="0"');
      expect(parts['ppt/slides/slide1.xml']).not.toContain('showMasterSp');
    }),
  );

  it.effect('writes only the masters of the surfaces in use, each with the basic layouts', () =>
    Effect.gen(function* () {
      const brand = yield* loadBrand(WORKSPACE_ROOT, 'default');
      const dark = slideInput(0, [titleNode(10, 'Dark')], { surface: 'inverse' });
      const result = yield* buildPptx(deckInput(brand.tokens, [dark]));
      expect(result.masters).toEqual(['inverse']);
      expect(result.layouts).toEqual(['content']);
    }),
  );

  it.effect('embeds fonts and names them in the embedded font list', () =>
    Effect.gen(function* () {
      const brand = yield* loadBrand(WORKSPACE_ROOT, 'default');
      const body = textNode(10, paragraph([line('Hello', 200)]));
      const result = yield* buildPptx(
        deckInput(brand.tokens, [slideInput(0, [body])], {
          fonts: {
            resolve: () => ({ typeface: 'Inter Deck Body', bold: false, italic: false }),
            theme: {
              major: { typeface: 'Bricolage Deck Headline', bold: true, italic: false },
              minor: { typeface: 'Inter Deck Body', bold: false, italic: false },
            },
            embedded: [
              {
                typeface: 'Inter Deck Body',
                panose: '020B0604020202020204',
                pitchFamily: 34,
                charset: 0,
                styles: { regular: PIXEL_PNG, bold: PIXEL_PNG },
              },
            ],
          },
        }),
      );
      const parts = partsOf(result.bytes);
      expect(result.embeddedFonts).toEqual(['Inter Deck Body']);
      expect(Object.keys(parts)).toContain('ppt/fonts/font1.fntdata');
      expect(Object.keys(parts)).toContain('ppt/fonts/font2.fntdata');
      const presentation = parts['ppt/presentation.xml'] ?? '';
      expect(presentation).toContain('embedTrueTypeFonts="1"');
      expect(presentation).toMatch(
        /<p:embeddedFont><p:font typeface="Inter Deck Body" panose="020B0604020202020204" pitchFamily="34" charset="0"\/><p:regular r:id="rId\d+"\/><p:bold r:id="rId\d+"\/><\/p:embeddedFont>/,
      );
      expect(parts['[Content_Types].xml']).toContain('application/x-fontdata');
      expect(parts['ppt/theme/theme1.xml']).toContain('<a:latin typeface="Inter Deck Body"/>');
    }),
  );

  it.effect('names boxes after their shape and tiles the grain over a grained fill', () =>
    Effect.gen(function* () {
      const brand = yield* loadBrand(WORKSPACE_ROOT, 'default');
      const rule = boxNode(10, { rect: { x: 128, y: 300, width: 400, height: 2 } });
      const grained = boxNode(11, {
        hints: [
          { reason: 'background-image', scope: 'paint', detail: 'background-image: grain texture' },
        ],
      });
      const slide = slideInput(0, [rule, grained]);
      const parts = partsOf(
        (yield* buildPptx(
          deckInput(brand.tokens, [
            { ...slide, assets: { ...slide.assets, grain: { data: PIXEL_PNG, size: 280 } } },
          ]),
        )).bytes,
      );
      const xml = parts['ppt/slides/slide1.xml'] ?? '';
      expect(xml).toContain('name="Rule"');
      expect(xml).toContain('name="Panel"');
      expect(xml).toContain('name="Grain"');
      expect(xml).toContain('<a:tile tx="0" ty="0" sx="66667" sy="66667" flip="none" algn="tl"/>');
    }),
  );
});
