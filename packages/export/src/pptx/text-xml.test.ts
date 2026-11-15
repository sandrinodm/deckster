import { describe, expect, it } from 'vite-plus/test';

import type { TextContext } from '#pptx/text-xml.ts';

import {
  layoutFrame,
  listStyleXml,
  paragraphXml,
  runXml,
  textDefaults,
  typefaceFor,
} from '#pptx/text-xml.ts';
import { opaque, surfaceThemeFixture } from '#pptx/theme.fixture.ts';
import { line, paragraph, run, runStyle } from '#scene/scene.fixture.ts';

/**
 * A text context on a light surface whose theme knows `#161920` as text and `#2d4ae0` as accent.
 */
function context(overrides: Partial<TextContext> = {}): TextContext {
  return {
    theme: surfaceThemeFixture(),
    families: { major: 'Bricolage Grotesque', minor: 'Inter' },
    link: (href) => ({ id: `rId-${href}` }),
    slideNumber: null,
    ...overrides,
  };
}

describe('layoutFrame', () => {
  it('puts the frame top where the first baseline lands in exact line spacing', () => {
    const layout = layoutFrame([paragraph([line('One', 140), line('Two', 190.4)])]);
    expect(layout.rect.x).toBe(128);
    // The baseline sits a fifth of the 36px size above the line bottom, not the font's descent.
    expect(layout.rect.y).toBeCloseTo(140 - (50.4 - 0.2 * 36), 5);
    expect(layout.paragraphs[0]?.lineSpacing).toBeCloseTo(50.4, 5);
    expect(layout.rect.height).toBeCloseTo(2.25 * 50.4, 5);
    expect(layout.wraps).toBe(true);
    expect(layout.rect.width).toBe(800);
  });

  it('places a tight display title by the font-independent descent of its largest run', () => {
    const big = runStyle({ size: 160, ascent: 148.8, descent: 43.2 });
    const title = paragraph([
      line('Why', 300, { runs: [run('Why', { style: big })], ascent: 148.8, descent: 43.2 }),
    ]);
    const layout = layoutFrame([{ ...title, lineHeight: 156.8 }]);
    // LibreOffice and PowerPoint put the baseline 156.8 - 32 below the top, 11.2px lower than the
    // font's own 43.2px descent would.
    expect(layout.rect.y).toBeCloseTo(300 - (156.8 - 32), 5);
  });

  it('wraps a paragraph in the width the page found, centred in its box', () => {
    const centred = paragraph([line('One', 140, { left: 428 })], {
      align: 'center',
      box: { x: 128, y: 106, width: 800, height: 50 },
      wrapWidth: 400,
    });
    const layout = layoutFrame([centred]);
    expect(layout.rect).toMatchObject({ x: 328, width: 400 });
  });

  it('does not wrap a frame whose paragraphs do not wrap', () => {
    const stat = paragraph([line('94%', 140)], { wrapWidth: null });
    const layout = layoutFrame([stat]);
    expect(layout.wraps).toBe(false);
    expect(layout.rect.width).toBeGreaterThan(3 * 18);
  });

  it('measures the space before a paragraph from the previous line bottom', () => {
    const layout = layoutFrame([paragraph([line('One', 140)]), paragraph([line('Two', 214.4)])]);
    expect(layout.paragraphs[1]?.spaceBefore).toBeCloseTo(24, 5);
  });

  it('hangs a marker left of the text', () => {
    const item = paragraph([line('Item', 140, { left: 168 })], {
      box: { x: 168, y: 106, width: 700, height: 50 },
      bullet: {
        kind: 'shape',
        rect: { x: 130, y: 120, width: 12, height: 12 },
        color: '#2d4ae0',
        radius: 2,
      },
    });
    const layout = layoutFrame([item]);
    expect(layout.rect.x).toBe(130);
    expect(layout.paragraphs[0]).toMatchObject({ marginLeft: 38, indent: -38 });
  });
});

describe('paragraph and run XML', () => {
  it('joins wrapped lines with the space the browser dropped and keeps authored breaks', () => {
    const layout = layoutFrame([
      paragraph([line('One', 140), line('two', 190.4, { authored: true }), line('Three', 240.8)]),
    ]);
    const xml =
      layout.paragraphs[0] === undefined ? '' : paragraphXml(layout.paragraphs[0], context());
    expect(xml).toContain('<a:spcPts val="2520"/>');
    expect(xml.match(/<a:br>/g)).toHaveLength(1);
    expect(xml).toContain('<a:t>One two</a:t>');
    expect(xml).toContain('<a:t>Three</a:t>');
  });

  it('keeps every break of a paragraph whose breaks no width reproduces', () => {
    const layout = layoutFrame([
      paragraph([line('One', 140), line('Two', 190.4)], { keepBreaks: true }),
    ]);
    const xml =
      layout.paragraphs[0] === undefined ? '' : paragraphXml(layout.paragraphs[0], context());
    expect(xml.match(/<a:br>/g)).toHaveLength(1);
  });

  it('leaves out what a placeholder gives its runs', () => {
    const style = runStyle({ family: 'Inter', size: 36, color: '#161920' });
    const layout = layoutFrame([
      paragraph([line('Body', 140, { runs: [run('Body', { style })] })]),
    ]);
    const defaults = textDefaults(layout, context());
    const first = layout.paragraphs[0];
    const xml =
      first === undefined || defaults === null ? '' : paragraphXml(first, context({ defaults }));
    expect(xml).toContain('<a:rPr/>');
    expect(xml).not.toContain('<a:lnSpc>');
    expect(listStyleXml(defaults ?? ({} as never), surfaceThemeFixture())).toContain('sz="1800"');
  });

  it('draws a round marker as a round bullet and a square one as a square', () => {
    /**
     * A list item whose square marker has a corner radius.
     */
    const item = (radius: number) =>
      paragraph([line('Item', 140, { left: 168 })], {
        bullet: {
          kind: 'shape',
          rect: { x: 130, y: 120, width: 12, height: 12 },
          color: '#2d4ae0',
          radius,
        },
      });
    /**
     * The paragraph XML of such an item.
     */
    const xmlOf = (radius: number): string => {
      const layout = layoutFrame([item(radius)]);
      return layout.paragraphs[0] === undefined
        ? ''
        : paragraphXml(layout.paragraphs[0], context());
    };
    expect(xmlOf(6)).toContain('<a:buChar char="●"/>');
    expect(xmlOf(1)).toContain('<a:buChar char="■"/>');
    expect(xmlOf(6)).toContain('<a:buClr><a:schemeClr val="accent1"/></a:buClr>');
  });

  it('writes size, weight, tracking, caps, theme colors, theme fonts and links', () => {
    const style = runStyle({
      family: 'Bricolage Grotesque',
      size: 22,
      weight: 640,
      letterSpacing: 1.54,
      caps: 'all',
      color: '#2d4ae0',
    });
    const xml = runXml(run('Budget', { style, href: 'https://example.org' }), context());
    expect(xml).toContain('sz="1100" b="1"');
    expect(xml).not.toContain('kern=');
    expect(xml).not.toContain('lang=');
    expect(xml).toContain('cap="all" spc="77"');
    expect(xml).toContain('<a:schemeClr val="accent1"/>');
    expect(xml).toContain('<a:latin typeface="+mj-lt"/>');
    expect(xml).toContain('<a:hlinkClick r:id="rId-https://example.org"><a:extLst>');
  });

  it('keeps a link in its run`s color and underline instead of the theme`s hyperlink style', () => {
    const plain = runXml(
      run('Email', { style: runStyle({ color: '#161920' }), href: 'mailto:a@b.example' }),
      context(),
    );
    expect(plain).toContain(' u="none"');
    expect(plain).toContain(
      '<a:ext uri="{A12FA001-AC4F-418D-AE19-62706E023703}"><ahyp:hlinkClr xmlns:ahyp="http://schemas.microsoft.com/office/drawing/2018/hyperlinkcolor" val="tx"/></a:ext>',
    );
    const underlined = runXml(
      run('Slides', { style: runStyle({ underline: true }), href: 'https://example.org' }),
      context(),
    );
    expect(underlined).toContain(' u="sng"');
    expect(runXml(run('Plain'), context())).not.toContain(' u=');
  });

  it('writes translucent colors with alpha and unknown colors as RGB', () => {
    const xml = runXml(run('Muted', { style: runStyle({ color: '#ff000080' }) }), context());
    expect(xml).toContain('<a:srgbClr val="FF0000"><a:alpha val="50196"/></a:srgbClr>');
    expect(opaque('#ffffff80', '#000000')).toBe('808080');
  });

  it('escapes markup in run text', () => {
    expect(runXml(run('<Step at={n}> & more'), context())).toContain(
      '<a:t>&lt;Step at={n}&gt; &amp; more</a:t>',
    );
  });

  it("turns the slide number in chrome text into a field and the total into the file's", () => {
    const xml = runXml(run('9 / 16'), context({ slideNumber: 9 }));
    expect(xml).toContain('type="slidenum"');
    expect(xml).toContain('<a:t> / 16</a:t>');
    const subset = runXml(
      run('9 / 16'),
      context({ slideNumber: 9, totals: { deck: 16, file: 5 } }),
    );
    expect(subset).toContain('<a:t> / 5</a:t>');
  });

  it('refers to the brand families through the theme', () => {
    expect(typefaceFor('Inter', { major: 'Fraunces', minor: 'Inter' })).toBe('+mn-lt');
    expect(typefaceFor('JetBrains Mono', { major: 'Fraunces', minor: 'Inter' })).toBe(
      'JetBrains Mono',
    );
  });
});
