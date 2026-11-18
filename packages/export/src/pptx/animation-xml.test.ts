import { describe, expect, it } from 'vite-plus/test';

import { timingXml } from '#pptx/animation-xml.ts';

/**
 * How long a fade-in takes, which an exit waits for.
 */
const FADE_MS = 300;

describe('timingXml', () => {
  it('writes nothing without reveals', () => {
    expect(timingXml([])).toBe('');
    expect(timingXml([[]])).toBe('');
  });

  it('writes one click per step, in order, with a build entry per text shape', () => {
    const xml = timingXml([
      [{ shapeId: 4, paragraphs: null, hasText: true, effect: 'in' }],
      [
        { shapeId: 5, paragraphs: { start: 1, end: 1 }, hasText: true, effect: 'in' },
        { shapeId: 6, paragraphs: null, hasText: false, effect: 'in' },
      ],
    ]);
    expect(xml.match(/<p:cond delay="indefinite"\/>/g)).toHaveLength(2);
    expect(xml.indexOf('spid="4"')).toBeLessThan(xml.indexOf('spid="5"'));
    expect(xml).toContain('<p:bldP spid="4" grpId="0" animBg="1"/>');
    expect(xml).toContain('<p:bldP spid="5" grpId="0" build="p"/>');
    expect(xml).not.toContain('<p:bldP spid="6"');
    expect(xml).toContain('nodeType="mainSeq"');
  });

  it('writes an out target as a Disappear that starts when the fade-ins end', () => {
    const xml = timingXml([
      [
        { shapeId: 7, paragraphs: null, hasText: true, effect: 'in' },
        { shapeId: 8, paragraphs: null, hasText: true, effect: 'out' },
      ],
    ]);
    const exit = xml.slice(xml.indexOf('presetClass="exit"') - 40);
    expect(exit).toContain('presetID="1" presetClass="exit" presetSubtype="0" fill="hold"');
    expect(exit).toContain('nodeType="withEffect"');
    expect(exit).toContain(`<p:cond delay="${FADE_MS}"/>`);
    expect(exit).toContain('<p:attrName>style.visibility</p:attrName>');
    expect(exit).toContain('<p:strVal val="hidden"/>');
    expect(exit).toContain('spid="8"');
    expect(exit).not.toContain('<p:animEffect');
    expect(xml.match(/presetClass="exit"/g)).toHaveLength(1);
    expect(xml).toContain('<p:bldP spid="8" grpId="0" animBg="1"/>');
  });

  it('keeps an in and an out target in one click, with the entrance starting it', () => {
    const xml = timingXml([
      [
        { shapeId: 8, paragraphs: { start: 0, end: 0 }, hasText: true, effect: 'out' },
        { shapeId: 7, paragraphs: null, hasText: true, effect: 'in' },
      ],
    ]);
    expect(xml.match(/<p:cond delay="indefinite"\/>/g)).toHaveLength(1);
    expect(xml.match(/nodeType="clickEffect"/g)).toHaveLength(1);
    const entrance = xml.indexOf('presetClass="entr"');
    const exit = xml.indexOf('presetClass="exit"');
    expect(entrance).toBeGreaterThan(-1);
    expect(entrance).toBeLessThan(exit);
    expect(xml.slice(entrance, exit)).toContain('nodeType="clickEffect"');
    expect(xml).toContain('<p:pRg st="0" end="0"/>');
  });

  it('starts a click that only exits with its first exit and no delay', () => {
    const xml = timingXml([[{ shapeId: 8, paragraphs: null, hasText: false, effect: 'out' }]]);
    expect(xml).toContain('nodeType="clickEffect"');
    expect(xml).not.toContain(`delay="${FADE_MS}"`);
    expect(xml).not.toContain('<p:bldP');
  });
});
