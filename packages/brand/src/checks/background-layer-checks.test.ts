import { describe, expect, it } from '@effect/vitest';
import { Effect } from 'effect';

import { resolveBrand } from '#resolve/resolve-brand.ts';
import { testBrand } from '#test-brand.fixture.ts';

/**
 * A photo surface: a light `bg`, a photo under a white tint and a placed mark.
 */
const PHOTO = {
  bg: 'gray.0',
  background: [
    {
      type: 'image',
      file: 'backgrounds/city.jpg',
      tint: { color: 'gray.0', opacity: 0.6 },
    },
    { type: 'placed', file: 'backgrounds/mark.svg', aspect: 1, anchor: 'bottom-right', width: 160 },
  ],
};

describe('surface background layers', () => {
  it.effect('resolves layers with their defaults filled in and tints resolved to hex', () =>
    Effect.gen(function* () {
      const { tokens } = yield* resolveBrand(testBrand({ 'color.surfaces.photo': PHOTO }));
      const photo = tokens.surfaces['photo'];
      expect(photo?.layers).toEqual([
        {
          type: 'image',
          file: 'backgrounds/city.jpg',
          fit: 'cover',
          focal: { x: 50, y: 50 },
          opacity: 1,
          treatment: undefined,
          tint: { color: '#ffffff', opacity: 0.6 },
        },
        {
          type: 'placed',
          file: 'backgrounds/mark.svg',
          aspect: 1,
          anchor: 'bottom-right',
          width: 160,
          offset: { x: 0, y: 0 },
          opacity: 1,
          rotate: 0,
        },
      ]);
      expect(photo?.background).toBe(photo?.roles.bg);
      expect(tokens.surfaces['default']?.layers).toEqual([]);
    }),
  );

  it.effect('adds tints and gradient layers, painted over bg, to the backdrop', () =>
    Effect.gen(function* () {
      const { tokens } = yield* resolveBrand(
        testBrand({
          gradients: {
            scrim: { type: 'linear', angle: 180, stops: ['gray.0/0', 'gray.50'] },
          },
          'color.surfaces.photo': {
            ...PHOTO,
            background: [
              {
                type: 'image',
                file: 'backgrounds/city.jpg',
                tint: { color: 'gray.50', opacity: 0.9 },
              },
              { type: 'gradient', gradient: 'scrim', opacity: 0.5 },
            ],
          },
        }),
      );
      const photo = tokens.surfaces['photo'];
      expect(photo?.backdrop[0]).toBe(photo?.roles.bg);
      expect(photo?.backdrop.length).toBeGreaterThan(1);
      expect(photo?.layers[1]).toMatchObject({ type: 'gradient', gradient: 'scrim', opacity: 0.5 });
    }),
  );

  it.effect('requires its own bg on a surface an image or pattern covers', () =>
    Effect.gen(function* () {
      const { bg: _bg, ...withoutBg } = PHOTO;
      const error = yield* Effect.flip(
        resolveBrand(testBrand({ 'color.surfaces.photo': withoutBg })),
      );
      expect(error.problems).toContainEqual(
        expect.objectContaining({
          path: 'color.surfaces.photo.bg',
          fix: expect.stringContaining('Set `bg`'),
        }),
      );
    }),
  );

  it.effect('needs no bg of its own for a placed mark alone', () =>
    Effect.gen(function* () {
      const { tokens } = yield* resolveBrand(
        testBrand({
          'color.surfaces.marked': {
            background: [
              {
                type: 'placed',
                file: 'backgrounds/mark.svg',
                aspect: 1,
                anchor: 'top-right',
                width: 96,
              },
            ],
          },
        }),
      );
      expect(tokens.surfaces['marked']?.layers).toHaveLength(1);
    }),
  );

  it.effect('names an unknown gradient or treatment with the closest one', () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        resolveBrand(
          testBrand({
            gradients: { scrim: { type: 'linear', angle: 180, stops: ['gray.0/0', 'gray.50'] } },
            'color.surfaces.photo': {
              ...PHOTO,
              background: [
                { type: 'image', file: 'backgrounds/city.jpg', treatment: 'plane' },
                { type: 'gradient', gradient: 'scrimm' },
              ],
            },
          }),
        ),
      );
      expect(error.problems).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: 'color.surfaces.photo.background[0].treatment',
            message: 'There is no image treatment named "plane".',
          }),
          expect.objectContaining({
            path: 'color.surfaces.photo.background[1].gradient',
            message: 'There is no gradient named "scrimm".',
          }),
        ]),
      );
    }),
  );

  it.effect('refuses files outside the brand folder, unknown kinds and too many layers', () =>
    Effect.gen(function* () {
      const layer = (file: string) => ({ type: 'image', file });
      for (const file of ['../secret.jpg', '/etc/hosts.png', 'backgrounds/clip.gif']) {
        const error = yield* Effect.flip(
          resolveBrand(
            testBrand({ 'color.surfaces.photo': { ...PHOTO, background: [layer(file)] } }),
          ),
        );
        expect(String(error), file).toContain('color.surfaces.photo.background[0]');
      }

      const error = yield* Effect.flip(
        resolveBrand(
          testBrand({
            'color.surfaces.photo': {
              ...PHOTO,
              background: Array.from({ length: 7 }, () => layer('backgrounds/city.jpg')),
            },
          }),
        ),
      );
      expect(String(error)).toContain('Expected at most 6 background layers');
    }),
  );
});
