import { describe, expect, it } from 'vite-plus/test';

import { xmpPacket } from '#pdf/pdf-metadata.ts';

describe('xmpPacket', () => {
  it('escapes the title and leaves the creator out without an author', () => {
    const packet = xmpPacket({
      title: 'Q4 <launch> & more',
      author: null,
      language: 'de-DE',
      date: new Date('2026-01-02T03:04:05.678Z'),
    });
    expect(packet).toContain('Q4 &lt;launch&gt; &amp; more');
    expect(packet).not.toContain('dc:creator');
    expect(packet).toContain('<rdf:li>de-DE</rdf:li>');
    expect(packet).toContain('<xmp:ModifyDate>2026-01-02T03:04:05Z</xmp:ModifyDate>');
    expect(packet.startsWith('<?xpacket begin="﻿"')).toBe(true);
    expect(packet.endsWith('<?xpacket end="w"?>')).toBe(true);
  });

  it('drops characters XML 1.0 forbids so the packet stays well formed', () => {
    const packet = xmpPacket({
      title: 'Q1\u0001\u000b',
      author: 'A\u0000B\ufffe',
      language: 'en-US',
      date: new Date('2026-01-02T03:04:05.678Z'),
    });
    expect(packet).toContain('>Q1</rdf:li>');
    expect(packet).toContain('<rdf:li>AB</rdf:li>');
    // eslint-disable-next-line no-control-regex
    expect(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/.test(packet)).toBe(false);
  });
});
