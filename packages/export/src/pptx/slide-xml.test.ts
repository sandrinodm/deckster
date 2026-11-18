import type { BrandTokens } from '@deckster/brand';

import { describe, expect, it } from 'vite-plus/test';

import type { LayoutSpec } from '#pptx/layout-specs.ts';
import type { SlideWriteOptions } from '#pptx/slide-xml.ts';

import { createPackage } from '#ooxml/opc-package.ts';
import { contentContract, PIXEL_PNG, logoNode, slideInput, titleNode } from '#pptx/deck.fixture.ts';
import { slideXml } from '#pptx/slide-xml.ts';
import { layoutFrame } from '#pptx/text-xml.ts';
import { surfaceThemeFixture } from '#pptx/theme.fixture.ts';
import { boxNode } from '#scene/scene.fixture.ts';

/**
 * The slide's title as the layout's placeholder has it.
 */
const TITLE = titleNode(10, 'Why Eastgate');

/**
 * A content layout whose title sits exactly where the slide draws it.
 */
function layout(): LayoutSpec {
  return {
    name: 'content',
    type: 'content',
    placeholders: [
      {
        kind: 'title',
        ref: { type: 'title', idx: undefined },
        rect: layoutFrame(TITLE.paragraphs).rect,
        defaults: null,
      },
    ],
    chrome: null,
    slideNumber: null,
    used: true,
  };
}

/**
 * Options of a slide on the default surface of that layout.
 *
 * @param overrides - Fields that differ.
 */
function options(overrides: Partial<SlideWriteOptions> = {}): SlideWriteOptions {
  return {
    mode: 'hybrid',
    brand: { label: 'Default' } as BrandTokens,
    theme: surfaceThemeFixture(),
    placeholders: layout(),
    contract: contentContract(),
    animate: true,
    outlineFonts: null,
    slideNumber: 3,
    resolveSlide: () => null,
    slideIds: [],
    ...overrides,
  };
}

describe('slideXml', () => {
  it('leaves a placeholder in its layout place to the layout and names it by its role', () => {
    const written = slideXml(
      createPackage(),
      'ppt/slides/slide1.xml',
      slideInput(2, [TITLE]),
      options(),
    );
    expect(written.placeholders).toEqual(['title']);
    expect(written.xml).toContain('<p:cNvPr id="2" name="Title"/>');
    expect(written.xml).toMatch(/<p:ph type="title"\/><\/p:nvPr><\/p:nvSpPr><p:spPr\/>/);
  });

  it('gives a picture without alt text its file name, and stores it once per package', () => {
    const pkg = createPackage();
    const logo = { ...logoNode(20), selector: 'img.photo' };
    const slide = slideInput(0, [logo, { ...logo, id: 21 }]);
    const written = slideXml(pkg, 'ppt/slides/slide1.xml', slide, options());
    expect(written.xml).toContain('descr="Picture (logo.png)"');
    expect(written.counts.images).toBe(2);
    const embeds = new Set(
      [...written.xml.matchAll(/r:embed="(rId\d+)"/g)].map((match) => match[1]),
    );
    expect(embeds.size).toBe(1);
  });

  it('marks shapes that appear at a step for click animations', () => {
    const box = boxNode(30, { step: 1 });
    const written = slideXml(
      createPackage(),
      'ppt/slides/slide1.xml',
      slideInput(0, [box]),
      options(),
    );
    expect(written.counts.animations).toBe(1);
    expect(written.xml).toContain('<p:timing>');
  });

  it('writes a hidden slide with show="0" and a shown slide exactly as before', () => {
    const write = (hidden: boolean | undefined) =>
      slideXml(
        createPackage(),
        'ppt/slides/slide1.xml',
        { ...slideInput(0, [TITLE]), ...(hidden === undefined ? {} : { hidden }) },
        options(),
      ).xml;
    const plain = write(undefined);
    expect(write(true)).toMatch(/<p:sld [^>]*show="0"/);
    expect(write(true).replace(' show="0"', '')).toBe(plain);
    expect(plain).not.toContain('show=');
    expect(write(false)).toBe(plain);
  });

  it('keeps the master chrome off a slide whose chrome differs from its layout', () => {
    const written = slideXml(
      createPackage(),
      'ppt/slides/slide1.xml',
      slideInput(0, [logoNode(20)]),
      options({ chrome: [] }),
    );
    expect(written.xml).toContain('showMasterSp="0"');
    expect(written.xml).toContain('name="Logo"');
    expect(PIXEL_PNG.length).toBeGreaterThan(0);
  });

  describe('step animation targets', () => {
    /**
     * The shape ids a slide declares.
     *
     * @param xml - The slide's XML.
     */
    function declaredIds(xml: string): Set<string> {
      return new Set([...xml.matchAll(/<p:cNvPr id="(\d+)"/g)].map((match) => match[1] ?? ''));
    }

    /**
     * The shape ids the slide's animations target.
     *
     * @param xml - The slide's XML.
     */
    function targetedIds(xml: string): string[] {
      return [...xml.matchAll(/<p:spTgt spid="(\d+)"/g)].map((match) => match[1] ?? '');
    }

    /**
     * A one-pixel-wide border on one side.
     */
    const EDGE = { width: 4, color: '#112233', style: 'solid' } as const;
    /**
     * Slides whose boxes take every path through `boxXml`, each revealed at a step.
     */
    const slides = {
      'a transparent box with one border': [
        boxNode(30, { step: 1, fill: null, borders: [null, null, null, EDGE] }),
      ],
      'a transparent box with two uneven borders': [
        boxNode(31, { step: 1, fill: null, borders: [EDGE, null, { ...EDGE, width: 2 }, null] }),
      ],
      'a filled box with one border': [boxNode(32, { step: 1, borders: [EDGE, null, null, null] })],
      'a filled box': [
        boxNode(33, { step: 2 }),
        boxNode(34, { step: 1, fill: null, borders: [null, EDGE, null, null] }),
      ],
      'a box with a uniform border': [
        boxNode(35, { step: 1, fill: null, borders: [EDGE, EDGE, EDGE, EDGE] }),
      ],
    };
    it.each(Object.entries(slides))('targets only ids that exist for %s', (_name, nodes) => {
      const written = slideXml(
        createPackage(),
        'ppt/slides/slide1.xml',
        slideInput(0, nodes),
        options(),
      );
      const targets = targetedIds(written.xml);
      expect(targets.length).toBeGreaterThan(0);
      const declared = declaredIds(written.xml);
      expect(targets.filter((id) => !declared.has(id))).toEqual([]);
    });
  });
});
