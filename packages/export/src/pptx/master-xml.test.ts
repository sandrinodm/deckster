import type { BrandTokens } from '@deckster/brand';

import { describe, expect, it } from 'vite-plus/test';

import type { LayoutSpec } from '#pptx/layout-specs.ts';

import { layoutXml, masterXml, notesSlideXml } from '#pptx/master-xml.ts';
import { surfaceThemeFixture } from '#pptx/theme.fixture.ts';

/**
 * The parts of a brand the master reads.
 */
function brand(): BrandTokens {
  return {
    spacing: { margin: { x: 128, y: 112 }, scale: { lg: 40 } },
    typography: {
      scale: {
        headline: { size: 80, lineHeight: 1.02, weight: 620, tracking: -0.012 },
        body: { size: 36, lineHeight: 1.5 },
      },
    },
  } as unknown as BrandTokens;
}

/**
 * A title-and-body layout whose title has its measured style.
 */
function layout(): LayoutSpec {
  return {
    name: 'content',
    type: 'content',
    placeholders: [
      {
        kind: 'title',
        ref: { type: 'title', idx: undefined },
        rect: { x: 128, y: 150, width: 1664, height: 100 },
        defaults: {
          size: 80,
          color: '#161920',
          font: { typeface: '+mj-lt', bold: true, italic: false },
          letterSpacing: -1,
          caps: 'none',
          align: 'left',
          lineSpacing: 82,
        },
      },
    ],
    chrome: null,
    slideNumber: null,
    used: true,
  };
}

describe('slide masters and layouts', () => {
  it('writes the master with its shapes, wrapping placeholders and the deck language', () => {
    const xml = masterXml(
      surfaceThemeFixture(),
      brand(),
      '<a:noFill/>',
      [{ id: 1, rId: 'rId1' }],
      '<p:sp/>',
      'de-DE',
    );
    expect(xml).toContain('<p:sp/>');
    expect(xml).toContain('lang="de-DE"');
    expect(xml).toContain('wrap="square"');
    expect(xml).toContain('<a:normAutofit/>');
    expect(xml).toContain('<p:sldLayoutId id="1" r:id="rId1"/>');
  });

  it("writes the text styles' line spacing as a share of the 1.2 em single line", () => {
    const xml = masterXml(surfaceThemeFixture(), brand(), '<a:noFill/>', [], '', 'en-US');
    // CSS 1.02 is 85% of PowerPoint's single line; 102% would set the headline at 1.22 em.
    expect(xml).toContain('<a:lnSpc><a:spcPct val="85000"/></a:lnSpc>');
    expect(xml).toContain('<a:lnSpc><a:spcPct val="125000"/></a:lnSpc>');
    expect(xml).not.toContain('val="102000"');
  });

  it('gives a layout placeholder its measured place and first-level style', () => {
    const xml = layoutXml(layout(), surfaceThemeFixture());
    expect(xml).toContain('<a:off x="812800" y="952500"/>');
    expect(xml).toContain('<a:lvl1pPr marL="0" indent="0" algn="l">');
    expect(xml).toContain('sz="4000" b="1" i="0" kern="0" spc="-50"');
    expect(xml).toContain('<a:schemeClr val="tx1"/>');
    expect(xml).not.toContain('showMasterSp');
  });

  it('hides the master shapes on a layout with its own chrome', () => {
    expect(layoutXml({ ...layout(), chrome: [] }, surfaceThemeFixture())).toContain(
      'showMasterSp="0"',
    );
  });

  it('writes notes as one paragraph per block', () => {
    const xml = notesSlideXml('First line\nsame block.\n\nSecond block.');
    expect(xml).toContain('<a:t>First line same block.</a:t>');
    expect(xml).toContain('<a:t>Second block.</a:t>');
  });
});
