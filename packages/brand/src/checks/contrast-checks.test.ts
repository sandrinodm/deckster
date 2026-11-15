import { Effect } from 'effect';
import { describe, expect, it } from 'vite-plus/test';

import { resolveBrand } from '#resolve/resolve-brand.ts';
import { testBrand } from '#test-brand.fixture.ts';

/**
 * The problems a brand fails with; none when it resolves.
 */
function problems(overrides: Readonly<Record<string, unknown>>) {
  return Effect.runSync(
    resolveBrand(testBrand(overrides)).pipe(
      Effect.match({ onFailure: (error) => error.problems, onSuccess: () => [] }),
    ),
  );
}

describe('code and diagram overrides', () => {
  it('fail a brand-wide override only where it falls short, pointing at a per-surface override', () => {
    const found = problems({ code: { keyword: 'blue.600' } });
    expect(found.map((problem) => problem.path)).toEqual([
      'code.keyword',
      'code.keyword',
      'code.keyword',
    ]);
    expect(found.map((problem) => problem.message.split(',')[0])).toEqual([
      'On the inverse surface',
      'On the accent surface',
      'On the gradient surface',
    ]);
    expect(found[0]?.fix).toMatch(
      /^Use a color with more contrast on this surface \(set it as color\.surfaces\.inverse\.code\.keyword\), such as "#[0-9a-f]{6}"\.$/,
    );
  });

  it('apply a per-surface override on that surface only, checking only the pairs it is in', () => {
    expect(problems({ 'color.surfaces.default': { code: { keyword: 'blue.600' } } })).toEqual([]);
    const { tokens } = Effect.runSync(
      resolveBrand(
        testBrand({
          code: { keyword: 'blue.800' },
          'color.surfaces.inverse': {
            bg: 'gray.900',
            surface: '#25262c',
            fg: 'gray.0',
            muted: 'gray.300',
            accent: 'blue.300',
            'accent-fg': 'gray.900',
            positive: '#5eead4',
            negative: '#ff7d6b',
            code: { keyword: 'blue.300' },
          },
          'color.surfaces.accent': { code: { keyword: 'gray.0' } },
          'color.surfaces.gradient': { code: { keyword: 'gray.0' } },
        }),
      ),
    );
    expect(tokens.surfaces.default?.code.keyword).toBe('#1c2f84');
    expect(tokens.surfaces.inverse?.code.keyword).toBe('#93acff');
  });

  it('paint a translucent node over the background before measuring the text on it', () => {
    expect(
      problems({
        'color.surfaces.default': { diagram: { node: 'gray.900/12', 'node-text': 'gray.900' } },
      }),
    ).toEqual([]);
    const found = problems({
      'color.surfaces.default': { diagram: { node: 'gray.900/90', 'node-text': 'gray.900' } },
    });
    expect(found).toEqual([
      expect.objectContaining({
        path: 'color.surfaces.default.diagram.node-text',
        message: expect.stringContaining(
          'diagram node-text #18191d on #2f3033 has contrast 1.32:1',
        ),
      }),
    ]);
  });

  it('adapt derived diagram text to an overridden fill', () => {
    const { tokens } = Effect.runSync(
      resolveBrand(testBrand({ 'color.surfaces.default': { diagram: { node: 'blue.800' } } })),
    );
    expect(tokens.surfaces.default?.diagram['node-text']).not.toBe('#18191d');
  });
});
