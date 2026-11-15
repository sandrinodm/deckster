import fs from 'node:fs';
import { describe, expect, it } from 'vite-plus/test';

import { recolorSvg } from '#diagrams/svg-roles.ts';
import { parseSvg, sanitizeSvg } from '#diagrams/svg-sanitize-node.ts';
import { disallowedIn, SVG_ATTACKS } from '#diagrams/svg-sanitize.fixture.ts';

/**
 * The sample deck's drawing, which must come through unchanged.
 */
const WAREHOUSE = new URL('../../../../decks/diagrams-demo/assets/warehouse.svg', import.meta.url);

describe('sanitizeSvg', () => {
  it('does not rebuild a script from the pieces it removes', () => {
    const result = sanitizeSvg(
      '<svg><scr<script></script>ipt>alert(1)</scr<script></script>ipt></svg>',
    );
    expect(result.markup).not.toMatch(/<script/i);
    expect(disallowedIn(parseSvg(result.markup))).toEqual([]);
  });

  it('drops animation elements that retarget href to javascript:', () => {
    for (const markup of [
      '<svg><a href="#a"><animate attributeName="href" values="#a;javascript:alert(1)"/><text>x</text></a></svg>',
      '<svg><a><set attributeName="href" to="java&Tab;script:alert(1)"/><text>x</text></a></svg>',
      '<svg><a xlink:href="#a"><animate attributeName="xlink:href" to="javascript:alert(1)"/>x</a></svg>',
    ]) {
      const result = sanitizeSvg(markup);
      expect(result.markup, markup).not.toMatch(/javascript|animate|<set/i);
      expect(result.dropped.join(' '), markup).toMatch(/a <(?:animate|set)> element/);
    }
  });

  it.each(SVG_ATTACKS)('leaves nothing disallowed from %s', (_name, markup) => {
    const result = sanitizeSvg(markup);
    expect(disallowedIn(parseSvg(result.markup))).toEqual([]);
    expect(result.markup).not.toMatch(/<(?:script|style|foreignObject|iframe|img|animate|set)\b/i);
    expect(result.markup).not.toMatch(/javascript:|\son[a-z]+=/i);
  });

  it.each(SVG_ATTACKS)('is idempotent on %s', (_name, markup) => {
    const once = sanitizeSvg(markup).markup;
    expect(sanitizeSvg(once)).toEqual({ markup: once, dropped: [] });
  });

  it('keeps escaped markup in text as text', () => {
    expect(
      sanitizeSvg('<svg><text>&lt;script&gt;alert(1)&lt;/script&gt;</text></svg>').markup,
    ).toBe('<svg><text>&lt;script&gt;alert(1)&lt;/script&gt;</text></svg>');
  });

  it('escapes quotes in values and text, so recolor cannot reach inside them', () => {
    const { markup } = sanitizeSvg(
      `<svg><rect id='a"b' data-x="a fill='#e4572e'"/><text>fill="#e4572e"</text></svg>`,
    );
    expect(markup).toBe(
      '<svg><rect id="a&quot;b" data-x="a fill=&#39;#e4572e&#39;" /><text>fill=&quot;#e4572e&quot;</text></svg>',
    );
    expect(recolorSvg(markup, { '#e4572e': 'accent' })).toBe(markup);
  });

  it('drops scripts in any case, with their content, and keeps the drawing', () => {
    const result = sanitizeSvg(
      '<svg viewBox="0 0 10 10"><script>alert(1)</script><rect width="4"/><SCRIPT type="x">alert(2)</SCRIPT><script src="x.js"/></svg>',
    );
    expect(result.markup).toBe('<svg viewBox="0 0 10 10"><rect width="4" /></svg>');
    expect(result.dropped).toEqual([
      'a <script> element',
      'a <script> element',
      'a <script> element',
    ]);
  });

  it('drops an unclosed script to the end of the markup', () => {
    expect(sanitizeSvg('<svg><rect/><script>alert(1)').markup).toBe('<svg><rect /></svg>');
  });

  it('drops foreignObject and what breaks out of the drawing, as a browser parses it', () => {
    const result = sanitizeSvg(
      '<svg><foreignObject><div onclick="x()">hi</div></foreignObject><iframe src="https://x"></iframe><circle r="1"/><embed src="a"/><rect/></svg>',
    );
    expect(result.markup).toBe('<svg><circle r="1" /></svg>');
    expect(result.dropped).toEqual([
      'a <foreignObject> element',
      'a <iframe> element',
      'a <embed> element',
      'a <rect> element',
    ]);
  });

  it('drops every event handler, quoted either way, unquoted or after a slash', () => {
    const result = sanitizeSvg(
      `<svg/onload=alert(1) viewBox="0 0 1 1"><rect OnLoad='alert(2)' fill="red" onclick=go() /><g onmouseover="x"></g></svg>`,
    );
    expect(result.markup).toBe('<svg viewBox="0 0 1 1"><rect fill="red" /><g /></svg>');
    expect(result.dropped).toEqual([
      'the onload attribute on <svg>',
      'the onload attribute on <rect>',
      'the onclick attribute on <rect>',
      'the onmouseover attribute on <g>',
    ]);
  });

  it('drops javascript: URLs, however they are spaced or encoded', () => {
    const result = sanitizeSvg(
      `<svg><a href="javascript:alert(1)"><text>a</text></a><a xlink:href=' JaVa&#x53;cript:alert(2)'>b</a></svg>`,
    );
    expect(result.markup).toBe('<svg><a><text>a</text></a><a>b</a></svg>');
    expect(result.dropped).toEqual([
      'the href="javascript:alert(1)" attribute on <a>',
      `the xlink:href=" JaVaScript:alert(2)" attribute on <a>`,
    ]);
  });

  it('drops external references but keeps fragments and raster data URLs', () => {
    const result = sanitizeSvg(
      '<svg><use href="https://evil.test/x.svg#a"/><use href="#local"/><image href="http://x.test/y.png"/><image xlink:href="data:image/png;base64,AAAA"/><image href="data:image/svg+xml;base64,AAAA"/></svg>',
    );
    expect(result.markup).toBe(
      '<svg><use /><use href="#local" /><image /><image xlink:href="data:image/png;base64,AAAA" /><image /></svg>',
    );
    expect(result.dropped).toEqual([
      'the external href="https://evil.test/x.svg#a" on <use>',
      'the external href="http://x.test/y.png" on <image>',
      'the href="data:image/svg+xml;base64,AAAA" attribute on <image>',
    ]);
  });

  it('drops style elements, and filters style attributes to safe declarations', () => {
    const result = sanitizeSvg(
      '<svg><style>@import url(http://x.test/a.css); .a { fill: url(#g); }</style><rect style="fill: url(http://x.test/c.svg#p); stroke:url(#g) ; color: red; position: fixed"/></svg>',
    );
    expect(result.markup).toBe('<svg><rect style="stroke: url(#g); color: red" /></svg>');
    expect(result.dropped).toEqual([
      'a <style> element',
      'the external url(http://x.test/c.svg#p) in the style of <rect>',
      'the declaration "position: fixed" in the style of <rect>',
    ]);
  });

  it('removes the XML prologue, doctype, comments and editor metadata without a warning', () => {
    const result = sanitizeSvg(
      '<?xml version="1.0"?>\n<!DOCTYPE svg [<!ENTITY x "y">]>\n<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="x" inkscape:version="1" viewBox="0 0 1 1"><!-- c --><metadata><rdf:RDF/></metadata><sodipodi:namedview/></svg>',
    );
    expect(result).toEqual({ markup: '<svg viewBox="0 0 1 1" />', dropped: [] });
  });

  it('derives a viewBox from width and height and drops the fixed size', () => {
    expect(sanitizeSvg('<svg width="640px" height=\'360\' fill="none"><rect/></svg>').markup).toBe(
      '<svg viewBox="0 0 640 360" fill="none"><rect /></svg>',
    );
  });

  it('keeps width and height in percent, and an existing viewBox', () => {
    expect(sanitizeSvg('<svg width="100%" height="100%"/>').markup).toBe(
      '<svg width="100%" height="100%" />',
    );
    expect(sanitizeSvg('<svg width="10" height="10" viewBox="0 0 5 5"/>').markup).toBe(
      '<svg width="10" height="10" viewBox="0 0 5 5" />',
    );
  });

  it('leaves a clean drawing as it was, apart from self-closing spacing', () => {
    const svg = '<svg viewBox="0 0 4 4"><g id="a"><path d="M0 0h4" stroke="#999" /></g></svg>';
    expect(sanitizeSvg(svg)).toEqual({ markup: svg, dropped: [] });
  });

  it('keeps gradients, clip paths, masks, markers, filters and same-document uses', () => {
    const svg =
      '<svg viewBox="0 0 4 4"><defs><linearGradient id="g" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff" /></linearGradient><clipPath id="c"><rect width="4" height="4" /></clipPath><mask id="m"><rect fill="white" /></mask><marker id="k" refX="1" orient="auto"><path d="M0 0" /></marker><filter id="f"><feGaussianBlur stdDeviation="2" /></filter></defs><use href="#c" /><rect fill="url(#g)" clip-path="url(#c)" mask="url(&quot;#m&quot;)" filter="url(#f)" marker-end="url(#k)" /><text><tspan dx="1">a</tspan><title>t</title></text></svg>';
    expect(sanitizeSvg(svg)).toEqual({ markup: svg, dropped: [] });
  });

  it('keeps the sample deck drawing tree as it was', () => {
    const source = fs.readFileSync(WAREHOUSE, 'utf8');
    const result = sanitizeSvg(source);
    expect(result.dropped).toEqual([]);
    const withoutNamespace = parseSvg(source.replace(' xmlns="http://www.w3.org/2000/svg"', ''));
    expect(parseSvg(result.markup)).toEqual(
      withoutNamespace.filter((node) => node.type === 'element'),
    );
  });
});
