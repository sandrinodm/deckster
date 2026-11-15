import { loadBrand } from '@deckster/brand/node';
import { NodeServices } from '@effect/platform-node';
import { describe, expect, it, layer } from '@effect/vitest';
import { Effect } from 'effect';
import path from 'node:path';

import {
  COLOR_MAP,
  colorXml,
  paintFill,
  premultipliedStops,
  surfaceThemes,
  themeXml,
} from '#pptx/theme.ts';

/**
 * The framework's workspace, with the shipped brands.
 */
const WORKSPACE_ROOT = path.resolve(import.meta.dirname, '../../../..');

layer(NodeServices.layer)('brand themes', (it) => {
  it.effect(
    'maps every surface of the default brand to theme colors, with its background in lt1',
    () =>
      Effect.gen(function* () {
        const brand = yield* loadBrand(WORKSPACE_ROOT, 'default');
        const themes = surfaceThemes(brand.tokens);
        expect(themes.map((theme) => theme.surface)).toEqual([
          'default',
          'inverse',
          'accent',
          'gradient',
        ]);
        const [light, dark] = themes;
        expect(light?.colors).toMatchObject({ dk1: '161920', lt1: 'FCFCFD', accent1: '2D4AE0' });
        expect(dark?.colors).toMatchObject({ dk1: 'F4F5F8', lt1: '0C0E13', accent1: '6283FF' });
        expect(dark?.lookup.get('#F4F5F8')).toBe('tx1');
        expect(COLOR_MAP).toMatchObject({ bg1: 'lt1', tx1: 'dk1' });
        const gradient = themes[3];
        expect(gradient?.texture).toBe('grain');
        expect(gradient?.background).toMatchObject({ kind: 'linear', angle: 160 });
      }),
  );

  it.effect(
    'writes theme fonts from the brand families and the categorical palette as accents',
    () =>
      Effect.gen(function* () {
        const brand = yield* loadBrand(WORKSPACE_ROOT, 'nocturne');
        const [theme] = surfaceThemes(brand.tokens);
        const xml = theme === undefined ? '' : themeXml(theme, 'Nocturne');
        expect(xml).toContain('<a:majorFont><a:latin typeface="Fraunces"/>');
        expect(xml).toContain('<a:minorFont><a:latin typeface="Manrope"/>');
        expect(xml.match(/<a:accent\d>/g)).toHaveLength(6);
      }),
  );

  it.effect('writes gradients from structured stops and theme colors as scheme references', () =>
    Effect.gen(function* () {
      const brand = yield* loadBrand(WORKSPACE_ROOT, 'default');
      const [light, , , gradient] = surfaceThemes(brand.tokens);
      const fill = gradient === undefined ? '' : paintFill(gradient.background, null);
      expect(fill).toContain('<a:lin ang="4200000" scaled="0"/>');
      expect(fill).toContain('<a:gs pos="55000"><a:srgbClr val="1B286B"/></a:gs>');
      expect(light === undefined ? '' : colorXml('#2d4ae0cc', light)).toBe(
        '<a:schemeClr val="accent1"><a:alpha val="80000"/></a:schemeClr>',
      );
    }),
  );
});

describe('premultipliedStops', () => {
  it('fades a scrim out in its own color, not the transparent stop`s black', () => {
    const stops = premultipliedStops([
      { color: '#0c0e139e', at: 0 },
      { color: '#0c0e138c', at: 0.4 },
      { color: '#00000000', at: 1 },
    ]);
    expect(stops).toEqual([
      { color: '#0c0e139e', at: 0 },
      { color: '#0c0e138c', at: 0.4 },
      { color: '#0c0e1300', at: 1 },
    ]);
    const fill = paintFill({ kind: 'linear', angle: 0, stops }, null);
    expect(fill).toContain('<a:gs pos="100000"><a:srgbClr val="0C0E13"><a:alpha val="0"/>');
  });

  it('splits a transparent stop between two colors into one stop per side', () => {
    expect(
      premultipliedStops([
        { color: '#ff0000', at: 0 },
        { color: '#00000000', at: 0.5 },
        { color: '#0000ff', at: 1 },
      ]),
    ).toEqual([
      { color: '#ff0000', at: 0 },
      { color: '#ff000000', at: 0.5 },
      { color: '#0000ff00', at: 0.5 },
      { color: '#0000ff', at: 1 },
    ]);
  });

  it('leaves opaque and fully transparent gradients as they are', () => {
    const opaque = [
      { color: '#ffffff', at: 0 },
      { color: '#000000', at: 1 },
    ];
    expect(premultipliedStops(opaque)).toEqual(opaque);
    const clear = [
      { color: '#00000000', at: 0 },
      { color: '#ffffff00', at: 1 },
    ];
    expect(premultipliedStops(clear)).toEqual(clear);
  });
});
