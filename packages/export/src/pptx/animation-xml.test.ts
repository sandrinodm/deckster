import { describe, expect, it } from 'vite-plus/test';

import { timingXml } from '#pptx/animation-xml.ts';

describe('timingXml', () => {
  it('writes nothing without reveals', () => {
    expect(timingXml([])).toBe('');
    expect(timingXml([[]])).toBe('');
  });

  it('writes one click per step, in order, with a build entry per text shape', () => {
    const xml = timingXml([
      [{ shapeId: 4, paragraphs: null, hasText: true }],
      [
        { shapeId: 5, paragraphs: { start: 1, end: 1 }, hasText: true },
        { shapeId: 6, paragraphs: null, hasText: false },
      ],
    ]);
    expect(xml.match(/<p:cond delay="indefinite"\/>/g)).toHaveLength(2);
    expect(xml.indexOf('spid="4"')).toBeLessThan(xml.indexOf('spid="5"'));
    expect(xml).toContain('<p:bldP spid="4" grpId="0" animBg="1"/>');
    expect(xml).toContain('<p:bldP spid="5" grpId="0" build="p"/>');
    expect(xml).not.toContain('<p:bldP spid="6"');
    expect(xml).toContain('nodeType="mainSeq"');
  });
});
