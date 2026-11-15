import { describe, expect, it } from 'vite-plus/test';

import {
  checkSvg,
  colorsInSvg,
  idsInSvg,
  normalizeHex,
  parseColor,
  recolorSvg,
} from '#diagrams/svg-roles.ts';

describe('recolorSvg', () => {
  it('marks fills and strokes of the mapped colors with their role, however the color is written', () => {
    const svg = '<svg><rect fill="#E4572E" stroke="#999"/><circle fill="#ffffff"/></svg>';
    expect(recolorSvg(svg, { '#e4572e': 'accent', '#999999': 'edge' })).toBe(
      '<svg><rect fill="#E4572E" data-fill="accent" stroke="#999" data-stroke="edge"/><circle fill="#ffffff"/></svg>',
    );
  });

  it('matches rgb(), named and upper-case colors in attributes, quoted either way', () => {
    const svg = `<svg><rect fill='rgb(228, 87, 46)'/><rect stroke="RED"/><rect fill="#FFF"/></svg>`;
    expect(recolorSvg(svg, { '#E4572E': 'accent', red: 'negative', white: 'bg' })).toBe(
      `<svg><rect fill='rgb(228, 87, 46)' data-fill="accent"/><rect stroke="RED" data-stroke="negative"/><rect fill="#FFF" data-fill="bg"/></svg>`,
    );
  });

  it('replaces colors in style attributes with the role’s custom property', () => {
    const svg = '<svg><rect style="fill: #abc; stroke: rgb(1,2,3); stroke-width: 2"/></svg>';
    expect(recolorSvg(svg, { '#aabbcc': 'accent', 'rgb(1 2 3)': 'edge' })).toBe(
      '<svg><rect style="fill: var(--brand-color-accent); stroke: var(--brand-diagram-edge); stroke-width: 2"/></svg>',
    );
  });

  it('replaces colors in <style> rules', () => {
    const svg = '<svg><style>.a{fill:#e4572e}.b { stroke: navy; }</style><rect class="a"/></svg>';
    expect(recolorSvg(svg, { '#e4572e': 'accent', '#000080': 'fg' })).toBe(
      '<svg><style>.a{fill:var(--brand-color-accent)}.b { stroke: var(--brand-color-fg); }</style><rect class="a"/></svg>',
    );
  });

  it('recolors gradient stops given as attributes and as styles', () => {
    const svg =
      '<svg><linearGradient id="g"><stop offset="0" stop-color="#e4572e"/><stop offset="1" style="stop-color: white"/></linearGradient></svg>';
    expect(recolorSvg(svg, { '#e4572e': 'accent', '#fff': 'bg' })).toBe(
      '<svg><linearGradient id="g"><stop offset="0" stop-color="#e4572e" data-stop="accent"/><stop offset="1" style="stop-color: var(--brand-color-bg)"/></linearGradient></svg>',
    );
  });

  it('leaves data-fill roles and unmapped colors alone', () => {
    const svg = '<svg><rect data-fill="accent" fill="#123456"/></svg>';
    expect(recolorSvg(svg, { '#e4572e': 'accent' })).toBe(svg);
  });

  it('leaves the markup alone with no map', () => {
    expect(recolorSvg('<svg fill="#000"/>', {})).toBe('<svg fill="#000"/>');
  });

  it('normalises short hex', () => {
    expect(normalizeHex('#F60')).toBe('#ff6600');
  });
});

describe('parseColor', () => {
  it('reads hex, rgb(), rgba() and names, and nothing else', () => {
    expect(parseColor('#F60')).toBe('#ff6600');
    expect(parseColor('#ff660080')).toBe('#ff6600');
    expect(parseColor('rgba(255, 102, 0, 0.5)')).toBe('#ff6600');
    expect(parseColor('rgb(100% 40% 0%)')).toBe('#ff6600');
    expect(parseColor('Orange')).toBe('#ffa500');
    expect(parseColor('none')).toBeUndefined();
    expect(parseColor('currentColor')).toBeUndefined();
    expect(parseColor('url(#g)')).toBeUndefined();
  });
});

describe('checkSvg', () => {
  const svg =
    '<svg><g id="inbound"><rect fill="#e4572e" data-stroke="brand"/></g><g id="sorting"/></svg>';

  it('lists the roles, nearest first, for an unknown role in recolor or in the file', () => {
    const { errors } = checkSvg(svg, { recolor: { '#e4572e': 'acent' } }, '<Svg src="./a.svg">');
    expect(errors[0]).toMatch(
      /^<Svg src="\.\/a\.svg"> maps "#e4572e" to "acent", which is not a color role\. Use one of: accent, /,
    );
    expect(errors[1]).toMatch(/has a shape with data-stroke="brand", which is not a color role/);
  });

  it('names the ids the drawing has, nearest first, for an unknown step id', () => {
    const { errors } = checkSvg(svg, { steps: { sortng: 1 } }, '<Svg>');
    expect(errors).toContain(
      '<Svg> reveals "sortng" in `steps`, which is not an id in the drawing. Ids it has: sorting, inbound.',
    );
  });

  it('rejects a key that is not a color and warns about a color the drawing does not use', () => {
    const { errors, warnings } = checkSvg(
      '<svg><rect fill="#e4572e"/></svg>',
      { recolor: { bluish: 'accent', '#123456': 'edge', '#E4572E': 'accent' } },
      '<Svg>',
    );
    expect(errors).toEqual([
      '<Svg> has recolor key "bluish", which is not a color. Write it as hex (#e4572e), rgb() or a CSS color name, as the file does.',
    ]);
    expect(warnings).toEqual([
      '<Svg> recolors "#123456", which no shape in the drawing uses. Check the color in the file, or remove it from `recolor`.',
    ]);
  });

  it('finds colors and ids', () => {
    expect([
      ...colorsInSvg('<svg fill="none"><rect fill="RGB(1,2,3)" stroke="#ABC"/></svg>'),
    ]).toEqual(['#010203', '#aabbcc']);
    expect(idsInSvg(`<svg><g id="a"/><g id='b'/><g data-id="c"/></svg>`)).toEqual(['a', 'b']);
  });
});
