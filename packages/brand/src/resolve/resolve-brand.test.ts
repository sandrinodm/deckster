import { describe, expect, it } from '@effect/vitest';
import { Effect } from 'effect';

import { fromHex } from '#color/color.ts';
import { contrastRatio } from '#color/contrast.ts';
import { resolveBrand } from '#resolve/resolve-brand.ts';
import { testBrand } from '#test-brand.fixture.ts';

/**
 * The error a brand fails with; the test fails when the brand resolves.
 */
function failure(input: unknown) {
  return Effect.flip(resolveBrand(input, { source: 'brands/test/brand.ts' }));
}

describe('resolveBrand surfaces', () => {
  it.effect('remaps every role on a surface and keeps the rest from the base roles', () =>
    Effect.gen(function* () {
      const { tokens } = yield* resolveBrand(
        testBrand({
          'color.surfaces.inverse': {
            bg: 'gray.900',
            surface: '#25262c',
            fg: 'gray.0',
            muted: 'gray.300',
            accent: 'blue.300',
            'accent-fg': 'gray.900',
            positive: '#4fd19c',
            negative: '#ff7d6b',
          },
        }),
      );
      const base = tokens.surfaces.default!;
      const inverse = tokens.surfaces.inverse!;
      expect(base.roles.bg).toBe('#ffffff');
      expect(inverse.roles).toMatchObject({ bg: '#18191d', fg: '#ffffff', muted: '#c4c5cc' });
      expect(inverse.roles.border).toBe(base.roles.border);
      expect(inverse.roles.heading).toBe('#ffffff');
      expect(inverse.scheme).toBe('dark');
      expect(base.scheme).toBe('light');
    }),
  );

  it.effect(
    'derives inverse, accent and gradient surfaces that pass the checks when left out',
    () =>
      Effect.gen(function* () {
        const { tokens } = yield* resolveBrand(testBrand());
        expect(Object.keys(tokens.surfaces)).toEqual(['default', 'inverse', 'accent', 'gradient']);
        const { inverse, accent, gradient } = tokens.surfaces;
        expect(inverse?.roles.bg).toBe('#18191d');
        expect(accent?.roles.bg).toBe('#2f4fd8');
        expect(gradient?.gradient).toBe('derived');
        expect(gradient?.background).toContain('linear-gradient(135deg, #2f4fd8');
        for (const surface of [inverse, accent, gradient]) {
          const fg = fromHex(surface!.roles.fg);
          expect(contrastRatio(fg, fromHex(surface!.roles.bg))).toBeGreaterThanOrEqual(4.5);
        }
      }),
  );

  it.effect(
    'paints a gradient surface with its gradient and checks text against every color of it',
    () =>
      Effect.gen(function* () {
        const error = yield* failure(
          testBrand({
            gradients: { dusk: { type: 'linear', angle: 90, stops: ['blue.800', 'blue.100'] } },
            'color.surfaces.gradient': { gradient: 'dusk', fg: 'gray.0', muted: 'gray.0' },
          }),
        );
        expect(error.problems[0]).toEqual({
          path: 'color.surfaces.gradient.fg',
          message:
            'On the gradient surface, fg #ffffff on the gradient #dde6ff has contrast 1.25:1; ' +
            'text needs 4.5:1.',
          fix: 'No single fg color passes on every background; change gradients.dusk.',
        });
      }),
  );
});

describe('resolveBrand contrast', () => {
  it.effect('fails with the measured ratio and a passing color to use instead', () =>
    Effect.gen(function* () {
      const error = yield* failure(testBrand({ 'color.roles.muted': 'gray.300' }));
      expect(error.summary).toBe('The brand fails contrast or color-vision checks');
      expect(error.problems[0]).toEqual({
        path: 'color.roles.muted',
        message:
          'On the default surface, muted #c4c5cc on bg #ffffff has contrast 1.72:1; ' +
          'secondary text needs 4.5:1.',
        fix: 'Change muted to a color such as "#74757c", or change color.roles.bg.',
      });
      expect(error.message).toContain('in brands/test/brand.ts:');
    }),
  );

  it.effect('holds headings to the large-text ratio of 3:1', () =>
    Effect.gen(function* () {
      const passes = yield* resolveBrand(testBrand({ 'color.roles.heading': '#8c8d96' }));
      expect(passes.tokens.surfaces.default?.roles.heading).toBe('#8c8d96');
      const error = yield* failure(testBrand({ 'color.roles.heading': '#a9aab2' }));
      expect(error.problems[0]?.message).toContain('headings (large text) needs 3:1');
    }),
  );

  it.effect('turns a waived pair into a warning that carries the reason, but never below 3:1', () =>
    Effect.gen(function* () {
      const waiver = { color: 'accent-fg', on: 'accent', reason: 'Matches the source deck' };
      const midTone = { 'color.roles.accent': '#5b7cff', 'color.waivers': [waiver] };
      const { warnings } = yield* resolveBrand(testBrand(midTone));
      expect(warnings.map((warning) => warning.path)).toContain('color.roles.accent-fg');
      expect(warnings[0]?.message).toContain('waived: Matches the source deck');

      const error = yield* failure(testBrand({ ...midTone, 'color.roles.accent': '#93acff' }));
      expect(error.problems[0]?.message).toContain(
        'text on accent fills needs 3:1 even with its waiver',
      );
    }),
  );

  it.effect('rejects a waiver for a pair that has no 4.5:1 requirement', () =>
    Effect.gen(function* () {
      const error = yield* failure(
        testBrand({ 'color.waivers': [{ color: 'accent', on: 'bg', reason: 'Large only' }] }),
      );
      expect(error.problems[0]).toMatchObject({
        path: 'color.waivers[0]',
        message: 'accent on bg is not a pair that needs 4.5:1.',
      });
    }),
  );
});

describe('resolveBrand references', () => {
  it.effect('names the palette steps that exist for a reference to one that does not', () =>
    Effect.gen(function* () {
      const error = yield* failure(testBrand({ 'color.roles.accent': 'blue.650' }));
      expect(error.summary).toBe('The brand refers to things it does not define');
      expect(error.problems).toContainEqual({
        path: 'color.roles.accent',
        message: '"blue.650" refers to a step "650" that the "blue" palette does not have.',
        fix: 'Use "600".',
      });
    }),
  );

  it.effect('checks gradients, logo variants and motion names', () =>
    Effect.gen(function* () {
      const error = yield* failure(
        testBrand({
          'color.surfaces.inverse': { logo: 'reversed', gradient: 'aurora' },
          'motion.transition.easing': 'standrad',
        }),
      );
      expect(error.problems.map(({ path, fix }) => ({ path, fix }))).toEqual([
        { path: 'color.surfaces.inverse.gradient', fix: 'Use one of: derived.' },
        { path: 'color.surfaces.inverse.logo', fix: 'Use one of: primary.' },
        { path: 'motion.transition.easing', fix: 'Use "standard".' },
      ]);
    }),
  );
});

describe('resolveBrand translucent colors', () => {
  it.effect('rejects a translucent background with the opaque color to use', () =>
    Effect.gen(function* () {
      const error = yield* failure(
        testBrand({
          'color.roles.bg': '#ffffff80',
          'color.surfaces.default': { bg: 'gray.0/50' },
        }),
      );
      expect(error.problems).toEqual([
        {
          path: 'color.roles.bg',
          message:
            '"#ffffff80" is 50% opaque; a background must be opaque, since what shows through ' +
            'it is not part of the brand and its contrast cannot be checked.',
          fix:
            'Use an opaque color such as "#ffffff" (the same color without its alpha). For a ' +
            'tinted background, mix the tint yourself and write the result.',
        },
        expect.objectContaining({ path: 'color.surfaces.default.bg' }),
      ]);
    }),
  );

  it.effect('paints a translucent gradient stop over the color underneath before measuring', () =>
    Effect.gen(function* () {
      const { tokens } = yield* resolveBrand(
        testBrand({
          gradients: {
            night: { type: 'linear', angle: 90, stops: ['gray.900', 'blue.800'] },
            veil: { type: 'linear', angle: 90, stops: ['gray.0/10', 'gray.900'] },
          },
          'color.surfaces.inverse': {
            gradient: 'veil',
            bg: 'gray.900',
            surface: '#25262c',
            fg: 'gray.0',
            muted: 'gray.300',
            accent: 'blue.300',
            'accent-fg': 'gray.900',
            positive: '#5eead4',
            negative: '#ff7d6b',
          },
        }),
      );
      const inverse = tokens.surfaces.inverse!;
      expect(inverse.backdrop).toEqual(['#18191d', '#303034']);
      expect(inverse.background).toBe('linear-gradient(90deg, #ffffff1a, #18191d), #18191d');
    }),
  );

  it.effect('paints a translucent mesh glow over the mesh base before measuring', () =>
    Effect.gen(function* () {
      const error = yield* failure(
        testBrand({
          gradients: {
            haze: {
              type: 'mesh',
              base: 'gray.900',
              points: [{ color: 'gray.0/90', x: 50, y: 50 }],
            },
          },
        }),
      );
      expect(error.problems[0]).toMatchObject({
        path: 'color.surfaces.gradient',
        message: expect.stringContaining('derived from gradients.haze fails'),
      });
    }),
  );
});

describe('resolveBrand gradients as data', () => {
  it.effect('fills in stop positions as CSS does and keeps the CSS as written', () =>
    Effect.gen(function* () {
      const { tokens } = yield* resolveBrand(
        testBrand({
          gradients: {
            dawn: {
              type: 'linear',
              angle: 120,
              stops: ['gray.900', { color: 'blue.800', at: 40 }, 'gray.900', 'blue.800'],
            },
            glow: { type: 'radial', stops: ['blue.100', 'gray.0'] },
          },
        }),
      );
      expect(tokens.gradients.dawn).toMatchObject({
        type: 'linear',
        angle: 120,
        stops: [
          { color: '#18191d', at: 0 },
          { color: '#1c2f84', at: 40 },
          { color: '#18191d', at: 70 },
          { color: '#1c2f84', at: 100 },
        ],
        css: 'linear-gradient(120deg, #18191d, #1c2f84 40%, #18191d, #1c2f84)',
      });
      expect(tokens.gradients.glow).toMatchObject({
        type: 'radial',
        shape: 'ellipse',
        center: { x: 50, y: 50 },
      });
    }),
  );
});

describe('resolveBrand palette references', () => {
  it.effect('rejects an opacity above 100%', () =>
    Effect.gen(function* () {
      const error = yield* failure(testBrand({ 'color.roles.border': 'gray.200/250' }));
      expect(error.problems).toEqual([
        {
          path: 'color.roles.border',
          message: '"gray.200/250" asks for 250% opacity; opacity runs from 0 to 100.',
          fix: 'Write an opacity from 0 to 100, such as "gray.200/25", or leave it out for an opaque color.',
        },
      ]);
    }),
  );
});

describe('resolveBrand positive and negative', () => {
  it.effect('warns when they look alike under a color-vision deficiency, once per pair', () =>
    Effect.gen(function* () {
      const { warnings } = yield* resolveBrand(testBrand({ 'color.roles.positive': '#157a4a' }));
      expect(warnings).toEqual([
        {
          path: 'color.roles.positive',
          message:
            'On the default surface, positive #157a4a and negative #c8331f look alike under ' +
            'protanopia (ΔE 9.2, wants 12), deuteranopia (ΔE 8.9, wants 12).',
          fix:
            'Make them differ in lightness as well as hue (a blue-green against an orange-red ' +
            'survives every deficiency), and show a sign or an arrow beside colored values.',
        },
      ]);
    }),
  );
});

describe('resolveBrand names inherited from Object', () => {
  it.effect('reports a gradient, duration, easing or palette named like an object property', () =>
    Effect.gen(function* () {
      for (const [path, value, field] of [
        [
          'color.surfaces.gradient',
          { gradient: 'constructor' },
          'color.surfaces.gradient.gradient',
        ],
        ['motion.transition.duration', 'constructor', 'motion.transition.duration'],
        ['motion.transition.easing', 'constructor', 'motion.transition.easing'],
        ['color.roles.border', 'constructor.length', 'color.roles.border'],
        ['logo.default', 'constructor', 'logo.default'],
        ['imagery.default', 'constructor', 'imagery.default'],
      ] as const) {
        const error = yield* Effect.flip(resolveBrand(testBrand({ [path]: value })));
        expect(error.summary, path).toBe('The brand refers to things it does not define');
        expect(
          error.problems.map((problem) => problem.path),
          path,
        ).toContain(field);
      }
    }),
  );
});

describe('resolveBrand image treatments', () => {
  it.effect('gives every brand the plain treatment, which draws a picture as it is', () =>
    Effect.gen(function* () {
      const { tokens } = yield* resolveBrand(
        testBrand({
          'imagery.treatments': { soft: { type: 'rounded', radius: 'lg' } },
          'imagery.default': 'soft',
        }),
      );
      expect(tokens.imagery.treatments['plain']).toEqual({ type: 'none' });
      expect(Object.keys(tokens.imagery.treatments)).toEqual(['soft', 'plain']);
    }),
  );

  it.effect('takes plain as a default even when the brand does not define it', () =>
    Effect.gen(function* () {
      const { tokens } = yield* resolveBrand(
        testBrand({ 'imagery.treatments': { mono: { type: 'grayscale' } } }),
      );
      expect(tokens.imagery.default).toBe('plain');
    }),
  );

  it.effect('refuses a plain treatment that changes the picture', () =>
    Effect.gen(function* () {
      const error = yield* failure(
        testBrand({ 'imagery.treatments': { plain: { type: 'grayscale' } } }),
      );
      expect(error.problems.map((problem) => problem.path)).toContain('imagery.treatments.plain');
    }),
  );
});

describe('resolveBrand spacing grid', () => {
  it.effect('defaults spacing.grid.rows to 6 when omitted', () =>
    Effect.gen(function* () {
      const { tokens } = yield* resolveBrand(testBrand());
      expect(tokens.spacing.grid).toEqual({ columns: 12, rows: 6, gutter: 32 });
    }),
  );

  it.effect('keeps a custom spacing.grid.rows override', () =>
    Effect.gen(function* () {
      const { tokens } = yield* resolveBrand(testBrand({ 'spacing.grid.rows': 8 }));
      expect(tokens.spacing.grid).toEqual({ columns: 12, rows: 8, gutter: 32 });
    }),
  );
});
