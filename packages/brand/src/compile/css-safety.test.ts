import { Effect, Result } from 'effect';
import { describe, expect, it } from 'vite-plus/test';

import type { FontFaceRule } from '#compile/font-face.ts';
import type { BrandTokens } from '#resolve/brand-tokens.ts';

import { compileBrand } from '#compile/compile-brand.ts';
import { cssStructure } from '#compile/css-structure.fixture.ts';
import { resolveBrand } from '#resolve/resolve-brand.ts';
import { testBrand } from '#test-brand.fixture.ts';

/**
 * Strings that end a CSS string, block, declaration or comment, open a URL or an import, or end the
 * `<style>` element the CSS may sit in.
 */
const PAYLOADS = [
  '"',
  "'",
  '\\',
  '\n',
  '\0',
  '}',
  '{',
  ';',
  '*/',
  '</style>',
  'url(https://evil.example/x)',
  '@import "https://evil.example/x.css";',
  'expression(alert(1))',
  '\u2028',
  '\u2029',
  '"; } body { background: url(https://evil.example/x) } x { y: "',
] as const;

/**
 * A brand that uses every part of the schema that can reach CSS: font files with a unicode range,
 * multi-word family and fallback names, features and axes, every gradient kind, shadows, waivers, a
 * footer and number formats.
 */
const RICH_BRAND = testBrand({
  'typography.families.display': {
    family: 'Acme Display',
    fallback: ['Helvetica Neue', 'sans-serif'],
    source: {
      kind: 'files',
      files: [
        {
          path: 'fonts/acme-display.woff2',
          weight: [100, 900],
          style: 'normal',
          unicodeRange: 'U+0000-00FF, U+0131',
        },
      ],
    },
    substitute: { family: 'Arial Black' },
  },
  'typography.families.body': {
    family: 'Acme Text',
    fallback: ['Segoe UI', 'sans-serif'],
    source: { kind: 'unavailable', reason: 'licence pending' },
  },
  'typography.families.mono': {
    family: 'Acme Mono',
    fallback: ['Menlo Regular', 'monospace'],
    source: { kind: 'system' },
  },
  'typography.scale.stat': {
    family: 'display',
    size: 160,
    lineHeight: 0.95,
    tracking: -0.04,
    weight: 700,
    features: ['tnum', 'ss01'],
    axes: { wght: 700, opsz: 96 },
  },
  gradients: {
    dawn: { type: 'linear', angle: 135, stops: ['blue.600', { color: 'blue.800', at: 80 }] },
    halo: { type: 'radial', at: { x: 30, y: 40 }, stops: ['blue.100', 'blue.300'], grain: 0.1 },
    mist: { type: 'mesh', base: 'gray.0', points: [{ color: 'blue.100', x: 20, y: 20 }] },
  },
  'shape.shadow.md': [{ x: 1, y: 8, blur: 24, spread: -8, color: 'gray.900/14' }],
  'chrome.footer': { show: true, text: 'Acme confidential', corner: 'top-right' },
  'color.waivers': [{ color: 'muted', on: 'bg', reason: 'brand grey' }],
  charts: { numbers: { locale: 'en-US', currency: 'USD' } },
});

/**
 * The faces `loadBrand` would declare for a brand's `files` sources, with the paths as written.
 *
 * @param brand - The brand as written.
 */
function writtenFaces(brand: unknown): FontFaceRule[] {
  const families = Object.values(
    Object(Reflect.get(Object(Reflect.get(Object(brand), 'typography')), 'families')),
  );
  return families.flatMap((family) => {
    const source: unknown = Reflect.get(Object(family), 'source');
    if (Reflect.get(Object(source), 'kind') !== 'files') {
      return [];
    }

    const files: unknown[] = Reflect.get(Object(source), 'files');
    return files.map((file) => ({
      family: String(Reflect.get(Object(family), 'family')),
      url: String(Reflect.get(Object(file), 'path')),
      weight: Reflect.get(Object(file), 'weight'),
      style: Reflect.get(Object(file), 'style') ?? 'normal',
      unicodeRange: Reflect.get(Object(file), 'unicodeRange'),
    }));
  });
}

/**
 * The tokens of a brand, or `undefined` when it does not validate.
 *
 * @param brand - The brand as written.
 */
function tokensOf(brand: unknown): BrandTokens | undefined {
  const result = Effect.runSync(Effect.result(resolveBrand(brand)));
  return Result.isSuccess(result) ? result.success.tokens : undefined;
}

/**
 * The structure of everything the compiler writes for a brand: its custom properties, its
 * `@font-face` rules and its Tailwind theme.
 *
 * @param tokens - The brand's tokens.
 * @param faces - Its font faces.
 */
function compiledStructure(tokens: BrandTokens, faces: readonly FontFaceRule[]): string[] {
  const compiled = compileBrand(tokens, faces);
  return [compiled.css, compiled.fontFaces, compiled.tailwind].map(cssStructure);
}

/**
 * Every place in a JSON-like value that holds a string, and every object key, as a path of keys.
 *
 * @param value - The value to walk.
 * @param at - The path so far.
 */
function stringPlaces(
  value: unknown,
  at: readonly string[] = [],
): { path: string[]; key: boolean }[] {
  if (typeof value === 'string') {
    return [{ path: [...at], key: false }];
  }

  if (typeof value !== 'object' || value === null) {
    return [];
  }

  return Object.entries(value).flatMap(([key, child]) => [
    ...(Array.isArray(value) ? [] : [{ path: [...at, key], key: true }]),
    ...stringPlaces(child, [...at, key]),
  ]);
}

/**
 * A copy of a brand with the string at a path, or the key that ends the path, extended by a
 * payload.
 *
 * @param brand - The brand as written.
 * @param place - Where to put the payload.
 * @param payload - The hostile text.
 */
function withPayload(
  brand: unknown,
  place: { path: string[]; key: boolean },
  payload: string,
): unknown {
  const copy: unknown = structuredClone(brand);
  const keys = [...place.path];
  const last = keys.pop() ?? '';
  const parent: unknown = keys.reduce<unknown>((node, key) => Reflect.get(Object(node), key), copy);
  const value: unknown = Reflect.get(Object(parent), last);
  if (place.key) {
    Reflect.deleteProperty(Object(parent), last);
    Reflect.set(Object(parent), `${last}${payload}`, value);
  } else {
    Reflect.set(Object(parent), last, `${String(value)}${payload}`);
  }

  return copy;
}

describe('hostile brand strings', () => {
  it('reject a feature tag that closes the declaration and opens a rule', () => {
    const tokens = tokensOf(
      testBrand({
        'typography.scale.body.features': ['tnum"; } body{background:url(https://evil/x)} x{y:"'],
      }),
    );
    expect(tokens).toBeUndefined();
  });

  it('reject a family name that breaks out of its quotes with a newline', () => {
    const tokens = tokensOf(
      testBrand({
        'typography.families.body.family': 'Foo\nBar}\nhtml{background:url(//evil)}\n.x{',
      }),
    );
    expect(tokens).toBeUndefined();
  });

  it('reject axis tags, unicode ranges, font file paths and fallbacks outside their grammar', () => {
    for (const [path, value] of [
      ['typography.scale.body.axes', { 'wght" 1; } body { x: "': 400 }],
      ['typography.scale.body.axes', { wgh: 400 }],
      ['typography.scale.body.features', ['tnu']],
      ['typography.families.body.fallback', ['Foo\\', 'sans-serif']],
      ['typography.families.body.fallback', ['Foo</style>', 'sans-serif']],
      [
        'typography.families.body.source',
        { kind: 'files', files: [{ path: 'a.woff2', weight: 400, unicodeRange: 'U+0; } x {' }] },
      ],
      [
        'typography.families.body.source',
        { kind: 'files', files: [{ path: 'a.woff2") ; } x { y: url("', weight: 400 }] },
      ],
      [
        'typography.families.body.source',
        { kind: 'files', files: [{ path: 'https://evil.example/a.woff2', weight: 400 }] },
      ],
    ] as const) {
      expect(tokensOf(testBrand({ [path]: value })), JSON.stringify(value)).toBeUndefined();
    }
  });

  it('accept the benign brand the property test starts from', () => {
    expect(tokensOf(RICH_BRAND)).toBeDefined();
  });

  it('either fail validation or compile to exactly the rules and declarations of the benign brand', () => {
    const benign = tokensOf(RICH_BRAND);
    if (benign === undefined) {
      throw new Error('The benign brand does not validate.');
    }

    const expected = compiledStructure(benign, writtenFaces(RICH_BRAND));
    let accepted = 0;
    for (const place of stringPlaces(RICH_BRAND)) {
      for (const payload of PAYLOADS) {
        const hostile = withPayload(RICH_BRAND, place, payload);
        const tokens = tokensOf(hostile);
        if (tokens === undefined) {
          continue;
        }

        accepted += 1;
        const where = `${place.key ? 'key ' : ''}${place.path.join('.')} + ${JSON.stringify(payload)}`;
        expect(compiledStructure(tokens, writtenFaces(hostile)), where).toEqual(expected);
      }
    }

    // Free text such as the label and the footer reaches no CSS and is accepted.
    expect(accepted).toBeGreaterThan(0);
  }, 120_000);
});

describe('the compiler on tampered tokens', () => {
  const benign = tokensOf(RICH_BRAND);
  if (benign === undefined) {
    throw new Error('The benign brand does not validate.');
  }

  const faces = writtenFaces(RICH_BRAND);
  const expected = compiledStructure(benign, faces);

  /**
   * The structure of the compiled output, or `rejected` when the compiler refuses the tokens.
   */
  const outcome = (
    tokens: BrandTokens,
    withFaces: readonly FontFaceRule[],
  ): string[] | 'rejected' => {
    try {
      return compiledStructure(tokens, withFaces);
    } catch (error) {
      if (error instanceof TypeError) {
        return 'rejected';
      }

      throw error;
    }
  };

  it('keeps a feature, an axis or a family that skipped validation inside its string', () => {
    for (const payload of PAYLOADS) {
      const tokens = structuredClone(benign);
      tokens.typography.scale.stat.features = [`tnum${payload}`, 'ss01'];
      tokens.typography.scale.stat.axes = { [`wght${payload}`]: 700, opsz: 96 };
      const result = outcome(tokens, faces);
      expect(result === 'rejected' || result.join() === expected.join(), payload).toBe(true);
    }
  });

  it('writes @font-face rules whose family, URL and range cannot leave their tokens', () => {
    for (const payload of PAYLOADS) {
      for (const face of [
        { family: `Acme Display${payload}` },
        { url: `fonts/acme-display.woff2${payload}` },
        { unicodeRange: `U+0000-00FF, U+0131${payload}` },
      ]) {
        const hostile = faces.map((rule) => ({ ...rule, ...face }));
        const result = outcome(benign, hostile);
        expect(
          result === 'rejected' || result.join() === expected.join(),
          `${JSON.stringify(face)}`,
        ).toBe(true);
      }
    }
  });

  it('refuses a family stack, gradient or shadow token that would end its declaration', () => {
    const stack = structuredClone(benign);
    stack.typography.families.body.stack = '"Acme"; } html { color: red } x { y: z';
    expect(outcome(stack, faces)).toBe('rejected');
    const gradient = structuredClone(benign);
    const dawn = gradient.gradients['dawn'];
    if (dawn !== undefined) {
      dawn.css = 'red; } html { color: red } x { y: z';
    }

    expect(outcome(gradient, faces)).toBe('rejected');
    const surface = benign.surfaces['default'];
    if (surface === undefined) {
      throw new Error('The benign brand has no default surface.');
    }

    const shadow: BrandTokens = {
      ...benign,
      surfaces: {
        ...benign.surfaces,
        default: {
          ...surface,
          shadow: { ...surface.shadow, md: { layers: [], css: 'none} html{color:red}' } },
        },
      },
    };
    expect(outcome(shadow, faces)).toBe('rejected');
  });

  it('refuses a non-finite number in a length', () => {
    const tokens = structuredClone(benign);
    tokens.typography.scale.body.size = Number.POSITIVE_INFINITY;
    expect(outcome(tokens, faces)).toBe('rejected');
  });
});
