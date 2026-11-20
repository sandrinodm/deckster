import type { BrandTokens } from '@deckster/brand';

import { describe, expect, it } from 'vite-plus/test';

import type { LayoutSpec } from '#pptx/layout-specs.ts';
import type { SlideWriteOptions } from '#pptx/slide-xml.ts';
import type { DiagramNode, ImageNode, SvgNode } from '#scene/scene.ts';

import { describedDiagram, describedNode } from '#diagram/diagram.fixture.ts';
import { createPackage } from '#ooxml/opc-package.ts';
import { planScene } from '#plan/plan-scene.ts';
import { PIXEL_PNG, logoNode, slideInput, titleNode } from '#pptx/deck.fixture.ts';
import { slideXml } from '#pptx/slide-xml.ts';
import { layoutFrame } from '#pptx/text-xml.ts';
import { surfaceThemeFixture } from '#pptx/theme.fixture.ts';
import { boxNode, line, paragraph, textNode } from '#scene/scene.fixture.ts';

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
    label: null,
    art: null,
    type: 'content',
    placeholders: [
      {
        kind: 'title',
        from: { selector: '.kit-title' },
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

  it('crops a fetched picture but not the captured picture of one that could not be fetched', () => {
    const crop = { left: 0, top: 0.07, right: 0, bottom: 0.07 };
    const fetched = { ...logoNode(20), selector: 'img.photo', crop };
    const unfetched = { ...fetched, id: 21, src: '/missing.png' };
    const slide = slideInput(0, [fetched, unfetched]);
    const pictures = new Map([[unfetched.id, PIXEL_PNG]]);
    const written = slideXml(
      createPackage(),
      'ppt/slides/slide1.xml',
      { ...slide, assets: { ...slide.assets, pictures } },
      options(),
    );
    expect(written.counts.images).toBe(2);
    expect(written.xml.match(/<a:srcRect [^>]*\/>/g)).toEqual(['<a:srcRect t="7000" b="7000"/>']);
  });

  it.each(['native', 'hybrid'] as const)(
    'places diagram image icons and their editable frames in %s mode',
    (mode) => {
      const rect = { x: 120, y: 326, width: 26, height: 26 };
      const image: ImageNode = {
        ...logoNode(22),
        parent: 21,
        rect: { ...rect, y: 330, height: 18 },
        selector: 'img.diagram-icon',
        diagramIcon: true,
      };
      const border = { width: 3, style: 'dotted', color: '#448899' } as const;
      const frame = boxNode(21, {
        parent: 20,
        rect: { x: 112, y: 318, width: 42, height: 42 },
        borders: [border, border, border, border],
        radii: [12, 12, 12, 12],
      });
      const complex: SvgNode = {
        ...boxNode(23),
        parent: 20,
        rect: { x: 190, y: 340, width: 26, height: 26 },
        kind: 'svg',
        diagramIcon: true,
        shapes: null,
        markup: '<svg xmlns="http://www.w3.org/2000/svg"><text>Icon</text></svg>',
        href: null,
      };
      const api = describedNode('api', { x: 100, y: 300, width: 200, height: 100 });
      const diagram: DiagramNode = {
        ...boxNode(20),
        kind: 'diagram',
        diagram: describedDiagram({
          edges: [],
          nodes: [{ ...api, icon: { box: rect, color: null, svg: '', src: image.src } }],
        }),
      };
      const slide = slideInput(0, [diagram, frame, image, complex]);
      const plan = planScene(slide.scene, mode, {
        paint: { kind: 'solid', color: '#fcfcfd' },
        texture: null,
      });
      const pictures = new Map([[complex.id, PIXEL_PNG]]);
      const written = slideXml(
        createPackage(),
        'ppt/slides/slide1.xml',
        { ...slide, plan, assets: { ...slide.assets, pictures } },
        options({ mode }),
      );
      expect(plan.items).toHaveLength(1);
      expect(written.xml).toContain('name="Node: API"');
      expect(written.xml).toMatch(
        /name="Panel".*?<a:ln w="19050" cap="rnd">.*?<a:prstDash val="sysDot"\/>/,
      );
      expect(written.xml).toContain('descr="Picture (logo.png)"');
      expect(written.counts.images).toBe(1);
      expect(written.counts.rasterised).toBe(mode === 'native' ? 0 : 1);
    },
  );

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

  describe('content replaced at a step', () => {
    /**
     * A neutral copy that step 1 replaces: a filled box and its text, and the overlay that replaces
     * them, entered at step 1.
     */
    const copy = [
      boxNode(40, { replacedAt: 1, rect: { x: 100, y: 400, width: 800, height: 100 } }),
      textNode(
        41,
        paragraph([line('Neutral copy', 460)], {
          box: { x: 128, y: 420, width: 700, height: 50 },
          replacedAt: 1,
        }),
        { replacedAt: 1 },
      ),
      boxNode(42, { step: 1, rect: { x: 100, y: 400, width: 800, height: 100 } }),
      textNode(
        43,
        paragraph([line('Answer overlay', 460)], {
          box: { x: 128, y: 420, width: 700, height: 50 },
          step: 1,
        }),
        { step: 1 },
      ),
    ];

    /**
     * Writes the copy and its overlay.
     *
     * @param overrides - Write options that differ.
     */
    function write(overrides: Partial<SlideWriteOptions> = {}): string {
      return slideXml(
        createPackage(),
        'ppt/slides/slide1.xml',
        slideInput(0, copy),
        options(overrides),
      ).xml;
    }

    it('does not write the replaced content without animations', () => {
      const xml = write({ animate: false });
      expect(xml).not.toContain('Neutral copy');
      expect(xml).toContain('Answer overlay');
      expect(xml.match(/<a:t>/g)).toHaveLength(1);
      expect(xml).not.toContain('<p:timing>');
      expect(xml.match(/<p:sp>/g)).toHaveLength(2);
    });

    it('writes the replaced content and exits it on the click that enters its replacement', () => {
      const xml = write();
      expect(xml).toContain('Neutral copy');
      expect(xml).toContain('Answer overlay');
      expect(xml.match(/<p:cond delay="indefinite"\/>/g)).toHaveLength(1);
      expect(xml.match(/presetClass="exit"/g)).toHaveLength(2);
      expect(xml.match(/presetClass="entr"/g)).toHaveLength(2);
      expect(xml.lastIndexOf('presetClass="entr"')).toBeLessThan(xml.indexOf('presetClass="exit"'));
    });

    it('animates nothing in image mode', () => {
      const xml = write({ mode: 'image' });
      expect(xml).not.toContain('<p:timing>');
      expect(xml).not.toContain('presetClass');
    });

    it('drops only the replaced paragraphs of a frame, and exits only those when animated', () => {
      const mixed = textNode(50, paragraph([line('Kept', 140)]));
      mixed.paragraphs.push(paragraph([line('Replaced', 214)], { replacedAt: 1 }));
      const slide = slideInput(0, [mixed]);
      const still = slideXml(
        createPackage(),
        'ppt/slides/slide1.xml',
        slide,
        options({ animate: false }),
      );
      expect(still.xml).toContain('Kept');
      expect(still.xml).not.toContain('Replaced');
      const moving = slideXml(createPackage(), 'ppt/slides/slide1.xml', slide, options());
      expect(moving.xml).toContain('Replaced');
      expect(moving.xml).toContain('<p:pRg st="1" end="1"/>');
      expect(moving.xml.match(/presetClass="exit"/g)).toHaveLength(1);
    });
  });
});
