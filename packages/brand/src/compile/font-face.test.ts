import { describe, expect, it } from 'vite-plus/test';

import { fontFaceCss } from '#compile/font-face.ts';

describe('fontFaceCss', () => {
  it('names the format of an extension it does not know as written, never an inherited value', () => {
    for (const extension of ['constructor', 'tostring', 'valueof', 'hasownproperty']) {
      const css = fontFaceCss([
        {
          family: 'Acme',
          url: `fonts/acme.${extension}`,
          weight: 400,
          style: 'normal',
          unicodeRange: undefined,
        },
      ]);
      expect(css, extension).toContain(`format("${extension}")`);
    }
  });
});
