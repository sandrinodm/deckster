import type { BrandLayoutTokens, BrandTokens } from '@deckster/brand';
import type { AnyLayoutContract } from '@deckster/engine/layout';

import { loadBrand } from '@deckster/brand/node';
import kit, { brandLayoutCatalog } from '@deckster/kit/catalog';
import { NodeServices } from '@effect/platform-node';
import { expect, layer } from '@effect/vitest';
import { Effect } from 'effect';
import path from 'node:path';

import type { ScenePlan } from '#plan/plan-scene.ts';
import type { PptxSlideInput } from '#pptx/deck-input.ts';
import type { ImageNode, ScenePaint } from '#scene/scene.ts';

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

/**
 * A brand layout with art, a title, a body and a photo box, as the brand brings it.
 */
const PHOTO_LAYOUT = {
  name: 'brand-photo',
  label: 'Brand photo right',
  title: { box: [144, 204, 820, 300] },
  regions: [
    { bind: { slot: 'body' }, kind: 'text', box: [144, 540, 800, 250] },
    { bind: { slot: 'media' }, kind: 'media', box: [1056, 0, 864, 1080] },
  ],
  layers: { '*': [{ type: 'image', file: 'layouts/frame.svg' }] },
  layersMode: 'replace',
  chrome: {},
} as unknown as BrandLayoutTokens;

/**
 * The contract of {@link PHOTO_LAYOUT}.
 */
const PHOTO_CONTRACT = {
  name: 'brand-photo',
  pptx: {
    type: 'content',
    placeholders: [
      { kind: 'title', from: { selector: '.kit-title' } },
      { kind: 'body', from: { slot: 'body' } },
      { kind: 'picture', from: { slot: 'media' } },
    ],
  },
} as unknown as AnyLayoutContract;

/**
 * An image of a slide's backdrop or media.
 *
 * @param id - The node id.
 * @param src - Where the page loaded it from.
 * @param overrides - Fields that differ.
 */
function imageOf(id: number, src: string, overrides: Partial<ImageNode>): ImageNode {
  return { ...logoNode(id), selector: `img:nth-of-type(${id})`, src, ...overrides };
}

/**
 * How a slide on the brand photo layout differs from the plain one: with a background image of its
 * own, with the logo (other chrome than the layout), with no art (`background: none`), or with a
 * gradient background it paints itself.
 */
type PhotoKind = 'plain' | 'image' | 'chrome' | 'none' | 'gradient';

/**
 * A slide on the brand photo layout: the layout's art (unless it hides it), its title and the
 * photo, and what makes it differ.
 *
 * @param index - The deck slide index.
 * @param kind - How the slide differs.
 */
function photoSlide(index: number, kind: PhotoKind): PptxSlideInput {
  const slide = slideInput(
    index,
    [
      ...(kind === 'none'
        ? []
        : [imageOf(1, '/art/frame.png', { backdrop: true, rect: fullSlide() })]),
      ...(kind === 'image'
        ? [imageOf(2, '/art/slide-bg.png', { backdrop: true, slideImage: true, rect: fullSlide() })]
        : []),
      ...(kind === 'chrome' ? [logoNode(20)] : []),
      titleNode(10, `Photo ${index}`),
      imageOf(11, '/photo.png', {
        slot: 'media',
        rect: { x: 1056, y: 0, width: 864, height: 1080 },
      }),
    ],
    { layout: 'brand-photo' },
  );
  const images = new Map(slide.assets.images);
  for (const src of ['/art/frame.png', '/art/slide-bg.png', '/photo.png']) {
    images.set(src, { data: PIXEL_PNG, extension: 'png' });
  }

  const assets = { ...slide.assets, images };
  if (kind !== 'gradient') {
    return { ...slide, assets };
  }

  const plan: ScenePlan = {
    ...slide.plan,
    background: {
      kind: 'paint',
      paint: { kind: 'linear', angle: 0, stops: [] } as unknown as ScenePaint,
      grain: false,
    },
  };
  return { ...slide, plan, assets: { ...assets, background: PIXEL_PNG } };
}

/**
 * The whole slide as a rectangle.
 */
function fullSlide() {
  return { x: 0, y: 0, width: 1920, height: 1080 };
}

/**
 * The deck input of slides on the brand photo layout, in the default brand: two plain slides, so
 * the layout draws what they draw, then the given kinds.
 *
 * @param brand - The default brand's tokens.
 * @param kinds - How each slide after the plain ones differs.
 */
function photoDeck(brand: BrandTokens, kinds: readonly PhotoKind[] = []) {
  return deckInput(
    { ...brand, layouts: [PHOTO_LAYOUT] },
    (['plain', 'plain', ...kinds] as const).map((kind, index) => photoSlide(index, kind)),
    { layouts: [PHOTO_CONTRACT] },
  );
}

/**
 * Counts the pictures of a part that show the layout's art.
 *
 * @param xml - The part.
 */
function artPictures(xml: string): number {
  return xml.match(/descr="Picture \(frame\.png\)"/g)?.length ?? 0;
}

/**
 * A slide number field and the text it caches.
 */
const SLIDE_NUMBER_FIELD = /<a:fld [^>]*type="slidenum"[^>]*>.*?<a:t>([^<]*)<\/a:t><\/a:fld>/;

/**
 * The cached text of a part's slide number field, or `null` when it has none.
 *
 * @param xml - The part.
 */
function slideNumberField(xml: string): string | null {
  return SLIDE_NUMBER_FIELD.exec(xml)?.[1] ?? null;
}

layer(NodeServices.layer)('buildPptx', (it) => {
  it.effect('writes and fills both body placeholders of a brand two-content layout', () =>
    Effect.gen(function* () {
      const brand = yield* loadBrand(WORKSPACE_ROOT, 'fieldnote');
      const { layouts } = brandLayoutCatalog(brand.tokens, kit.layouts);
      const left = textNode(10, paragraph([line('Left column', 380)]), { slot: 'body' });
      const right = textNode(11, paragraph([line('Right column', 380)]), { slot: 'aside' });
      const slides = [
        slideInput(0, [left, right], { layout: 'fieldnote-columns' }),
        slideInput(1, [right], { layout: 'fieldnote-columns' }),
      ];
      const result = yield* buildPptx(deckInput(brand.tokens, slides, { layouts, mode: 'native' }));
      const parts = partsOf(result.bytes);
      const layoutXml = Object.values(parts).find((xml) =>
        xml.includes('<p:cSld name="Fieldnote two columns"'),
      );
      expect(layoutXml).toContain('type="twoObj"');
      expect(layoutXml).toContain('<p:ph type="body" idx="1"/>');
      expect(layoutXml).toContain('<p:ph type="body" idx="2"/>');

      const filled = parts['ppt/slides/slide1.xml'];
      const bodies = filled
        ?.match(/<p:sp>.*?<\/p:sp>/gsu)
        ?.filter((shape) => shape.includes('<p:ph type="body"'));
      expect(bodies).toHaveLength(2);
      expect(bodies?.[0]).toContain('<p:ph type="body" idx="1"/>');
      expect(bodies?.[0]).toContain('<a:t>Left column</a:t>');
      expect(bodies?.[1]).toContain('<p:ph type="body" idx="2"/>');
      expect(bodies?.[1]).toContain('<a:t>Right column</a:t>');
      expect(parts['ppt/slides/slide2.xml']).not.toContain('<p:ph type="body" idx="1"/>');
      expect(parts['ppt/slides/slide2.xml']).toContain('<p:ph type="body" idx="2"/>');
    }),
  );

  it.effect(
    'writes a brand layout as a layout part with its label, art and picture placeholder',
    () =>
      Effect.gen(function* () {
        const brand = yield* loadBrand(WORKSPACE_ROOT, 'default');
        const result = yield* buildPptx(photoDeck(brand.tokens));
        const parts = partsOf(result.bytes);
        const layouts = Object.entries(parts).filter(([name]) =>
          /^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(name),
        );
        const named = layouts.filter(([, xml]) => xml.includes('<p:cSld name="Brand photo right"'));
        expect(named).toHaveLength(1);
        const [path, xml] = named[0] ?? ['', ''];
        expect(xml).toContain('<p:ph type="pic" idx="2"/>');
        expect(xml).toContain('showMasterSp="0"');
        const rels = parts[path.replace('slideLayouts/', 'slideLayouts/_rels/') + '.rels'] ?? '';
        expect(xml.match(/<p:pic>/g)).toHaveLength(1);
        expect(rels).toContain('media-');
        expect(result.layouts).toContain('brand-photo');
      }),
  );

  it.effect('leaves the art to the layout on a slide that shows the layout as it is', () =>
    Effect.gen(function* () {
      const brand = yield* loadBrand(WORKSPACE_ROOT, 'default');
      const parts = partsOf((yield* buildPptx(photoDeck(brand.tokens))).bytes);
      const slide = parts['ppt/slides/slide1.xml'] ?? '';
      expect(artPictures(slide)).toBe(0);
      expect(slide).not.toContain('showMasterSp');
      expect(slide).toContain('<p:ph type="pic" idx="2"/>');
      const layout = Object.values(parts).find((xml) => xml.includes('name="Brand photo right"'));
      expect(artPictures(layout ?? '')).toBe(1);
    }),
  );

  it.effect('draws the art on the slide and hides the layout when the slide differs from it', () =>
    Effect.gen(function* () {
      const brand = yield* loadBrand(WORKSPACE_ROOT, 'default');
      const kinds: PhotoKind[] = ['image', 'chrome', 'none', 'gradient'];
      const parts = partsOf((yield* buildPptx(photoDeck(brand.tokens, kinds))).bytes);
      const expected = [
        ['image', 1],
        ['chrome', 1],
        ['none', 0],
        ['gradient', 1],
      ] as const;
      for (const [offset, [kind, art]] of expected.entries()) {
        const xml = parts[`ppt/slides/slide${offset + 3}.xml`] ?? '';
        expect([kind, xml.includes('showMasterSp="0"')]).toEqual([kind, true]);
        expect([kind, artPictures(xml)]).toEqual([kind, art]);
      }
    }),
  );

  it.effect('stamps the document properties with the application and its version', () =>
    Effect.gen(function* () {
      const brand = yield* loadBrand(WORKSPACE_ROOT, 'default');
      const input = deckInput(brand.tokens, [slideInput(0, [titleNode(10, 'Hello')])]);
      const stamped = partsOf((yield* buildPptx({ ...input, appVersion: '0.5.2' })).bytes);
      expect(stamped['docProps/app.xml']).toContain('<Application>deckster</Application>');
      expect(stamped['docProps/app.xml']).toContain('<AppVersion>0.0502</AppVersion>');
      const plain = partsOf((yield* buildPptx(input)).bytes);
      expect(plain['docProps/app.xml']).toContain('<Application>deckster</Application>');
      expect(plain['docProps/app.xml']).not.toContain('AppVersion');
    }),
  );

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
        expect(slideNumberField(slide)).toBe('1');
        expect(slideNumberField(parts['ppt/slides/slide2.xml'] ?? '')).toBe('2');
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
