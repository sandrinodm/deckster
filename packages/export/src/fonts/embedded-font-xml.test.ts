import { describe, expect, it } from 'vite-plus/test';

import type { EmbeddedFamily, FontInstance } from '#fonts/font-plan.ts';

import { embeddedFontListXml, latinXml } from '#fonts/embedded-font-xml.ts';
import { systemFontsStyle } from '#fonts/system-fonts.ts';

/**
 * An instance with only the fields the writer reads.
 */
const INSTANCE = { postscriptName: 'InterDeckBody-Regular' } as FontInstance;

/**
 * A family with a regular and a bold face.
 */
const FAMILY: EmbeddedFamily = {
  typeface: 'Inter Deck Body',
  sourceFamily: 'Inter',
  panose: '020B0604020202020204',
  pitchFamily: 34,
  charset: 0,
  slots: { regular: INSTANCE, bold: { ...INSTANCE, postscriptName: 'InterDeckBody-Bold' } },
};

describe('embeddedFontListXml', () => {
  it('lists each family with its font attributes and a relationship per face, in schema order', () => {
    const xml = embeddedFontListXml([FAMILY], (instance) =>
      instance.postscriptName.endsWith('Bold') ? 'rId9' : 'rId8',
    );
    expect(xml).toBe(
      '<p:embeddedFontLst><p:embeddedFont><p:font typeface="Inter Deck Body" panose="020B0604020202020204" pitchFamily="34" charset="0"/><p:regular r:id="rId8"/><p:bold r:id="rId9"/></p:embeddedFont></p:embeddedFontLst>',
    );
    expect(embeddedFontListXml([], () => '')).toBe('');
  });

  it('writes a:latin for the embedded face or the substitute', () => {
    expect(
      latinXml(
        {
          typeface: 'Inter Deck Body',
          bold: false,
          italic: false,
          panose: FAMILY.panose,
          pitchFamily: 34,
          charset: 0,
        },
        null,
      ),
    ).toBe(
      '<a:latin typeface="Inter Deck Body" panose="020B0604020202020204" pitchFamily="34" charset="0"/>',
    );
    expect(
      latinXml(null, {
        family: 'Courier New',
        panose: '02070309020205020404',
        pitchFamily: 49,
        charset: 0,
        category: 'mono',
      }),
    ).toContain('typeface="Courier New"');
  });
});

describe('systemFontsStyle', () => {
  it('aliases each brand family to its substitute faces and cancels variations', () => {
    const css = systemFontsStyle({
      typography: {
        families: {
          display: { family: 'Fraunces', substitute: { family: 'Georgia' } },
          body: { family: 'Manrope', substitute: { family: 'Arial' } },
          mono: { family: 'IBM Plex Mono', substitute: { family: 'Courier New' } },
        },
      },
    } as never);
    expect(css).toContain('font-family: "Fraunces";\n  src: local("Georgia Bold Italic")');
    expect(css).toContain('local("CourierNew-Bold")');
    expect(css).toContain('font-variation-settings: normal !important');
    expect(css.match(/@font-face/g)).toHaveLength(12);
  });
});
