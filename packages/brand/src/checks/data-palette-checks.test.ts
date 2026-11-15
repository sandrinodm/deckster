import { Effect } from 'effect';
import { describe, expect, it } from 'vite-plus/test';

import { CONTEXT_CONTRAST } from '#checks/data-thresholds.ts';
import { fromHex } from '#color/color.ts';
import { contrastRatio } from '#color/contrast.ts';
import { CHART_PLATE_CONTRAST } from '#resolve/derive-data.ts';
import { resolveBrand } from '#resolve/resolve-brand.ts';
import { testBrand } from '#test-brand.fixture.ts';

/**
 * The problems a brand with these overrides fails with; none when it resolves.
 */
function problems(overrides: Readonly<Record<string, unknown>>) {
  return Effect.runSync(
    resolveBrand(testBrand(overrides)).pipe(
      Effect.match({ onFailure: (error) => error.problems, onSuccess: () => [] }),
    ),
  );
}

describe('data palette checks', () => {
  it('fails neighbours that merge under deuteranopia, names both and suggests a swap', () => {
    const found = problems({
      'color.data.categorical': ['#1f6fd1', '#c0392b', '#2e8b57', '#6a3fb0'],
    });
    expect(found).toEqual([
      {
        path: 'color.data.categorical[2]',
        message:
          '#2e8b57 is too close to its neighbour #c0392b under deuteranopia (ΔE 5.7, wants 8).',
        fix: 'Swap it with position 3 (#6a3fb0); then every neighbour passes.',
      },
    ]);
  });

  it('warns, without failing, about neighbours that are apart but closer than comfortable', () => {
    const { warnings } = Effect.runSync(
      resolveBrand(testBrand({ 'color.data.categorical': ['#2f4fd8', '#5b78f0', '#b45f00'] })),
    );
    expect(warnings).toEqual([
      {
        path: 'color.data.categorical[1]',
        message: '#5b78f0 and its neighbour #2f4fd8 are close under normal (ΔE 12.1, wants 15).',
        fix: 'Swap it with position 2 (#b45f00); then every neighbour passes.',
      },
    ]);
  });

  it('fails marks under 3:1 against the background with a deeper shade to use', () => {
    const found = problems({ 'color.data.categorical': ['#2f4fd8', '#f5b53d', '#18191d'] });
    expect(found[0]).toMatchObject({
      path: 'color.data.categorical[1]',
      message:
        '#f5b53d has contrast 1.82:1 on the default background #ffffff; chart marks need 3:1.',
    });
    expect(found[0]?.fix).toMatch(/^Use a shade with more contrast, such as "#[0-9a-f]{6}"\.$/);
  });

  it('requires sequential lightness in one direction and a calm context color', () => {
    const found = problems({
      'color.data.sequential': ['blue.100', 'blue.600', 'blue.300'],
      'color.data.context': 'gray.900',
    });
    expect(found.map((problem) => problem.path)).toEqual([
      'color.data.sequential',
      'color.data.context',
    ]);
  });

  it('checks a surface that replaces its palettes against that surface', () => {
    const found = problems({
      'color.surfaces.inverse': {
        bg: 'gray.900',
        surface: '#25262c',
        fg: 'gray.0',
        muted: 'gray.300',
        accent: 'blue.300',
        'accent-fg': 'gray.900',
        positive: '#4fd19c',
        negative: '#ff7d6b',
        data: { categorical: ['blue.800', 'orange.300', 'gray.0'] },
      },
    });
    expect(found).toEqual([
      expect.objectContaining({
        path: 'color.surfaces.inverse.data.categorical[0]',
        message: expect.stringContaining('on the inverse background #18191d'),
      }),
    ]);
  });

  it('adjusts the brand palette in lightness on a surface where it falls short, in order', () => {
    const { tokens } = Effect.runSync(resolveBrand(testBrand()));
    const base = tokens.data.categorical;
    for (const surface of Object.values(tokens.surfaces)) {
      const plate = fromHex(surface.data.plate);
      expect(surface.data.categorical).toHaveLength(base.length);
      for (const color of surface.data.categorical) {
        expect(contrastRatio(fromHex(color), plate)).toBeGreaterThanOrEqual(3);
      }
    }

    expect(tokens.surfaces.default?.data.categorical).toEqual(base);
    expect(tokens.surfaces.inverse?.data.categorical).not.toEqual(base);
  });

  it('gives gradient and mid-tone surfaces a chart plate the text reads on at 10:1', () => {
    const { tokens } = Effect.runSync(resolveBrand(testBrand()));
    const { default: plain, accent, gradient } = tokens.surfaces;
    expect(plain?.data.plate).toBe(plain?.roles.bg);
    for (const surface of [accent!, gradient!]) {
      expect(surface.data.plate).not.toBe(surface.roles.bg);
      const ratio = contrastRatio(fromHex(surface.roles.fg), fromHex(surface.data.plate));
      expect(ratio).toBeGreaterThanOrEqual(CHART_PLATE_CONTRAST);
    }
  });

  it('uses a surface’s own list and plate as written, before any adjustment', () => {
    const { tokens } = Effect.runSync(
      resolveBrand(
        testBrand({
          'color.surfaces.accent': {
            data: { plate: 'gray.900', categorical: ['blue.300', 'orange.300', 'gray.0'] },
          },
        }),
      ),
    );
    expect(tokens.surfaces.accent?.data).toMatchObject({
      plate: '#18191d',
      categorical: ['#93acff', '#ffc078', '#ffffff'],
    });
  });

  it('checks a surface’s own plate against its own list', () => {
    const found = problems({
      'color.surfaces.accent': {
        data: { plate: 'gray.0', categorical: ['blue.300', 'blue.600', 'gray.900'] },
      },
    });
    expect(found).toContainEqual(
      expect.objectContaining({
        path: 'color.surfaces.accent.data.categorical[0]',
        message: expect.stringContaining('on the accent chart plate #ffffff'),
      }),
    );
  });

  it('holds the brand’s context color to 3:1 on every plate, the default one included', () => {
    const { tokens, warnings } = Effect.runSync(resolveBrand(testBrand()));
    // gray.300 is 1.72:1 on white: too faint for thin context lines, so it is fitted.
    expect(tokens.data.context).toBe('#c4c5cc');
    for (const surface of Object.values(tokens.surfaces)) {
      const ratio = contrastRatio(fromHex(surface.data.context), fromHex(surface.data.plate));
      expect(ratio).toBeGreaterThanOrEqual(CONTEXT_CONTRAST);
      expect(ratio).toBeLessThan(4.5);
    }

    expect(tokens.surfaces.default?.data.context).not.toBe('#c4c5cc');
    expect(warnings.filter((problem) => problem.path.endsWith('.context'))).toEqual([]);
  });

  it('warns about a context color a surface writes that stays under 3:1, without failing', () => {
    const { tokens, warnings } = Effect.runSync(
      resolveBrand(testBrand({ 'color.surfaces.default': { data: { context: 'gray.300' } } })),
    );
    expect(tokens.surfaces.default?.data.context).toBe('#c4c5cc');
    expect(warnings).toEqual([
      {
        path: 'color.surfaces.default.data.context',
        message:
          '#c4c5cc has contrast 1.72:1 on the default background #ffffff; context lines and ' +
          'muted marks fade under 3:1.',
        fix:
          'Use a low-chroma neutral between 3:1 and 4.5:1 against that plate, or leave the ' +
          "surface's context out so the brand's is fitted to it.",
      },
    ]);
  });
});
