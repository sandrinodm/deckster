import { describe, expect, it } from 'vite-plus/test';

import { absoluteUrls } from '#apps/app-brand.ts';

describe('absoluteUrls', () => {
  it('resolves relative font URLs against the stylesheet, so an app under apps/ finds them', () => {
    const rule =
      '@font-face { font-family: "Bricolage"; src: url("./bricolage-abc.woff2") format("woff2"), ' +
      "url(../fonts/b.woff) format('woff'); }";
    expect(absoluteUrls(rule, 'https://deck.test/talk/assets/index-1.css')).toBe(
      '@font-face { font-family: "Bricolage"; src: ' +
        'url("https://deck.test/talk/assets/bricolage-abc.woff2") format("woff2"), ' +
        "url(https://deck.test/talk/fonts/b.woff) format('woff'); }",
    );
  });

  it('keeps data, blob and absolute URLs as they are', () => {
    const rule =
      'src: url(data:font/woff2;base64,AAAA), url("https://cdn.test/a.woff2"), url(blob:x)';
    expect(absoluteUrls(rule, 'https://deck.test/')).toBe(rule);
  });
});
