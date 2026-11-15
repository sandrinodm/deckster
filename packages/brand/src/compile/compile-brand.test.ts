import { Effect } from 'effect';
import { createHighlighter } from 'shiki';
import { describe, expect, it } from 'vite-plus/test';

import { compileBrand } from '#compile/compile-brand.ts';
import { resolveBrand } from '#resolve/resolve-brand.ts';
import { testBrand } from '#test-brand.fixture.ts';

const { tokens } = Effect.runSync(
  resolveBrand(
    testBrand({
      'shape.shadow.md': [
        { y: 8, blur: 24, spread: -8, color: 'gray.900/14' },
        { y: 2, blur: 6, color: 'gray.900/5' },
      ],
      'color.surfaces.inverse': {
        shadow: { md: [{ y: 24, blur: 60, color: 'oklch(0 0 0 / 0.7)' }] },
      },
    }),
  ),
);
const compiled = compileBrand(tokens, [
  {
    family: 'Body',
    url: '/fonts/body.woff2',
    weight: [100, 900],
    style: 'normal',
    unicodeRange: 'U+0000-00FF',
  },
]);

describe('compileBrand CSS', () => {
  it('scopes brand-wide tokens to [data-brand] and roles to each [data-surface]', () => {
    expect(compiled.css).toContain('[data-brand="test"] {');
    expect(compiled.css).toContain('  --brand-palette-blue-600: #2f4fd8;');
    expect(compiled.css).toContain('  --brand-type-display-size: 140px;');
    expect(compiled.css).toContain('  --brand-type-label-case: uppercase;');
    expect(compiled.css).toContain(
      '[data-brand="test"] [data-surface="inverse"],\n[data-brand="test"][data-surface="inverse"] {',
    );
  });

  it('remaps the role variables per surface and paints the surface', () => {
    const inverse = surfaceRule('inverse');
    expect(inverse).toContain('  color-scheme: dark;');
    expect(inverse).toContain('  --brand-color-bg: #18191d;');
    expect(inverse).toContain('  --brand-background: #18191d;');
    expect(inverse).toContain('  background: var(--brand-background);');
    expect(inverse).toContain('  color: var(--brand-color-fg);');
    expect(surfaceRule('default')).toContain('  --brand-color-bg: #ffffff;');
    expect(surfaceRule('gradient')).toContain('  --brand-background: linear-gradient(135deg,');
  });

  it('writes @font-face rules for the faces it is given', () => {
    expect(compiled.fontFaces).toBe(
      [
        '@font-face {',
        '  font-family: "Body";',
        '  src: url("/fonts/body.woff2") format("woff2");',
        '  font-weight: 100 900;',
        '  font-style: normal;',
        '  font-display: swap;',
        '  unicode-range: U+0000-00FF;',
        '}',
      ].join('\n'),
    );
  });
});

describe('compileBrand shadows, chart plate and chart colors', () => {
  it('writes shadow layers as box-shadow values on every surface, with surface overrides', () => {
    const md = '0 8px 24px -8px rgb(24 25 29 / 0.14), 0 2px 6px rgb(24 25 29 / 0.05)';
    expect(surfaceRule('default')).toContain(`  --brand-shadow-md: ${md};`);
    expect(surfaceRule('default')).toContain('  --brand-shadow-sm: none;');
    expect(surfaceRule('inverse')).toContain('  --brand-shadow-md: 0 24px 60px rgb(0 0 0 / 0.7);');
    expect(tokens.shape.shadow.md.layers[0]).toEqual({
      x: 0,
      y: 8,
      blur: 24,
      spread: -8,
      color: '#18191d',
      alpha: 0.14,
      inset: false,
    });
  });

  it('gives each surface its chart plate and chart colors, and the brand its chart line widths', () => {
    expect(surfaceRule('default')).toContain('  --brand-data-plate: #ffffff;');
    expect(surfaceRule('accent')).toContain(
      `  --brand-data-plate: ${tokens.surfaces.accent!.data.plate};`,
    );
    expect(surfaceRule('default')).toContain('  --brand-chart-grid: #dddde1;');
    expect(compiled.css).toContain('  --brand-chart-grid-width: 1px;');
    expect(compiled.tailwind).toContain('  --color-data-plate: var(--brand-data-plate);');
    expect(compiled.tailwind).toContain('  --color-chart-label: var(--brand-chart-label);');
  });
});

describe('compileBrand Tailwind theme', () => {
  it('maps Tailwind namespaces onto the brand variables and resets the defaults', () => {
    expect(compiled.tailwind).toMatch(/^@theme inline \{\n  --color-\*: initial;/);
    expect(compiled.tailwind).toContain('  --color-fg: var(--brand-color-fg);');
    expect(compiled.tailwind).toContain('  --color-blue-600: var(--brand-palette-blue-600);');
    expect(compiled.tailwind).toContain('  --font-display: var(--brand-font-display);');
    expect(compiled.tailwind).toContain(
      '  --text-body--line-height: var(--brand-type-body-line-height);',
    );
    expect(compiled.tailwind).toContain('  --spacing-margin-x: var(--brand-margin-x);');
    expect(compiled.tailwind).toContain('  --color-data-3: var(--brand-data-3);');
  });

  it('adds a type-<step> utility that sets every property of the step', () => {
    expect(compiled.tailwind).toContain(
      [
        '@utility type-label {',
        '  font-family: var(--brand-type-label-family);',
        '  font-size: var(--brand-type-label-size);',
      ].join('\n'),
    );
    expect(compiled.tailwind).toContain('  text-transform: var(--brand-type-label-case);');
  });
});

describe('compileBrand Shiki themes', () => {
  it('builds one theme per surface that Shiki can highlight with', async () => {
    expect(Object.keys(compiled.shikiThemes)).toEqual(['default', 'inverse', 'accent', 'gradient']);
    const theme = compiled.shikiThemes.inverse!;
    expect(theme).toMatchObject({
      name: 'test-inverse',
      type: 'dark',
      bg: tokens.surfaces.inverse!.code.background,
    });
    const highlighter = await createHighlighter({ themes: [theme], langs: ['ts'] });
    const html = highlighter.codeToHtml('const answer = 42;', {
      lang: 'ts',
      theme: 'test-inverse',
    });
    expect(html).toContain(`background-color:${theme.bg}`);
    expect(html).toContain(`color:${tokens.surfaces.inverse!.code.keyword.toUpperCase()}`);
    highlighter.dispose();
  });
});

function surfaceRule(surface: string): string {
  const start = compiled.css.indexOf(`[data-brand="test"] [data-surface="${surface}"]`);
  return compiled.css.slice(start, compiled.css.indexOf('}', start));
}
