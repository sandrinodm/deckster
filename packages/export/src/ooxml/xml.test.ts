import { describe, expect, it } from 'vite-plus/test';

import { el, escapeXml } from '#ooxml/xml.ts';

describe('xml', () => {
  it('escapes markup and drops characters XML cannot hold', () => {
    expect(escapeXml('<Step at={n}> & "x"\u0007')).toBe('&lt;Step at={n}&gt; &amp; &quot;x&quot;');
  });

  it('writes attributes in order and leaves out empty ones', () => {
    expect(el('a:off', { x: 1, y: undefined, z: false, w: true })).toBe('<a:off x="1" w="1"/>');
    expect(el('a:p', {}, '', null, '<a:r/>')).toBe('<a:p><a:r/></a:p>');
  });
});
