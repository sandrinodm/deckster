// @vitest-environment happy-dom
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vite-plus/test';

import { parseSvgInBrowser, sanitizeSvgInBrowser } from '#diagrams/svg-sanitize-dom.ts';
import { sanitizeSvg } from '#diagrams/svg-sanitize-node.ts';
import { disallowedIn, SVG_ATTACKS } from '#diagrams/svg-sanitize.fixture.ts';

/**
 * The sample deck's drawing.
 */
const WAREHOUSE = path.join(
  import.meta.dirname,
  '../../../../decks/diagrams-demo/assets/warehouse.svg',
);

/*
 * happy-dom's HTML parser is not the WHATWG one (it keeps HTML inside <foreignObject> in the SVG
 * namespace and swallows what follows an SVG <script>), so these tests check the allowlist walk on
 * what it parses; parity with parse5 on every attack is checked in Chromium.
 */
describe('sanitizeSvgInBrowser', () => {
  it.each(SVG_ATTACKS)('leaves nothing disallowed from %s', (_name, markup) => {
    const result = sanitizeSvgInBrowser(markup);
    expect(disallowedIn(parseSvgInBrowser(result.markup))).toEqual([]);
    expect(result.markup).not.toMatch(/<(?:script|style|foreignObject|iframe|img|animate|set)\b/i);
    expect(result.markup).not.toMatch(/javascript:|\son[a-z]+=/i);
  });

  it('cleans what the build already cleaned to the same markup, with nothing to warn about', () => {
    const built = sanitizeSvg(fs.readFileSync(WAREHOUSE, 'utf8')).markup;
    expect(sanitizeSvgInBrowser(built)).toEqual({ markup: built, dropped: [] });
  });

  it('drops handlers and external references the way the build does', () => {
    const markup =
      '<svg width="40" height="20"><a href="java\tscript:x"><rect onload="x()" fill="#e4572e"/></a><use href="https://evil.test/x#a"/></svg>';
    expect(sanitizeSvgInBrowser(markup)).toEqual(sanitizeSvg(markup));
  });
});
