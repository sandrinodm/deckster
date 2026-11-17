import { Effect, Result } from 'effect';
import { describe, expect, it } from 'vite-plus/test';

import { resolveBrand } from '#resolve/resolve-brand.ts';
import { testBrand } from '#test-brand.fixture.ts';

/**
 * The problems a brand fails with, or none when it resolves.
 *
 * @param diagram - The brand's `diagram` section.
 */
function problemsOf(diagram: unknown) {
  const result = Effect.runSync(Effect.result(resolveBrand(testBrand({ diagram }))));
  return Result.isFailure(result) ? result.failure.problems : [];
}

describe('diagram names', () => {
  it('accept kinds mapped to standard cards and the brand’s own', () => {
    expect(
      problemsOf({
        kinds: { database: 'tint', external: 'spotlight' },
        cards: { spotlight: { fill: 'surface' } },
      }),
    ).toEqual([]);
  });

  it('name an unknown kind with the closest one', () => {
    expect(problemsOf({ kinds: { databse: 'tint' } })).toEqual([
      {
        path: 'diagram.kinds.databse',
        message: 'There is no node kind named "databse".',
        fix: 'Use "database".',
      },
    ]);
  });

  it('answer a kind alias with the kind it stands for', () => {
    expect(problemsOf({ kinds: { db: 'tint' } })).toEqual([
      {
        path: 'diagram.kinds.db',
        message: 'There is no node kind named "db".',
        fix: 'Use "database": "db" is another name for it on a node, but `diagram.kinds` takes the kind itself.',
      },
    ]);
  });

  it('answer a palette name written without a step with that palette’s steps, in every card color', () => {
    const result = Effect.runSync(
      Effect.result(
        resolveBrand(
          testBrand({
            diagram: {
              cards: {
                spotlight: {
                  fill: 'orange',
                  border: 'blue/40',
                  text: 'orange',
                  subtext: 'orange',
                  icon: { color: 'orange', fill: 'orange' },
                  accent: { color: 'orange' },
                },
              },
            },
            'color.surfaces.inverse': { diagram: { cards: { tint: { fill: 'blue' } } } },
          }),
        ),
      ),
    );
    const problems = Result.isFailure(result) ? result.failure.problems : [];
    expect(problems.map((problem) => problem.path).toSorted()).toEqual(
      [
        'diagram.cards.spotlight.fill',
        'diagram.cards.spotlight.border',
        'diagram.cards.spotlight.text',
        'diagram.cards.spotlight.subtext',
        'diagram.cards.spotlight.icon.color',
        'diagram.cards.spotlight.icon.fill',
        'diagram.cards.spotlight.accent.color',
        'color.surfaces.inverse.diagram.cards.tint.fill',
      ].toSorted(),
    );
    expect(problems.every((problem) => problem.message.includes('palette without a step'))).toBe(
      true,
    );
    expect(problems).toContainEqual({
      path: 'diagram.cards.spotlight.fill',
      message: '"orange" names the "orange" palette without a step, so it is not a color.',
      fix: 'Write a step such as "orange.600"; the "orange" palette has 300, 600.',
    });
    expect(problems).toContainEqual({
      path: 'diagram.cards.spotlight.border',
      message: '"blue/40" names the "blue" palette without a step, so it is not a color.',
      fix: 'Write a step such as "blue.600/40"; the "blue" palette has 100, 300, 600, 800.',
    });
  });

  it('say none takes no opacity', () => {
    expect(problemsOf({ cards: { a: { fill: 'none/12' } } })).toContainEqual({
      path: 'diagram.cards.a.fill',
      message: '"none/12" gives "none" an opacity, but "none" draws nothing.',
      fix:
        'Write "none" alone to draw no fill or border, or a role with an opacity such as ' +
        '"accent/12".',
    });
  });

  it('check a card title weight against the weights its family loads, after inheritance', () => {
    const monoLoads400 = {
      kind: 'fontsource',
      package: '@fontsource/jetbrains-mono',
      weights: [400],
    };
    /**
     * The problems of the test brand with a static mono font and a diagram section.
     */
    const withMono = (diagram: unknown) => {
      const brand = testBrand({ 'typography.families.mono.source': monoLoads400, diagram });
      const result = Effect.runSync(Effect.result(resolveBrand(brand)));
      return Result.isFailure(result) ? result.failure.problems : [];
    };
    expect(withMono({ cards: { default: { title: { family: 'mono' } } } })).toEqual([
      {
        path: 'diagram.cards.default.title.family',
        message: 'Weight 600 (normal) is not loaded for Mono, so the browser would fake it.',
        fix: "Load that weight and style in the family's source, or pick a loaded weight.",
      },
    ]);
    expect(
      withMono({
        cards: { default: { title: { family: 'mono' } }, code: { title: { weight: 700 } } },
      }).map((problem) => problem.path),
    ).toEqual(['diagram.cards.default.title.family', 'diagram.cards.code.title.weight']);
    expect(
      withMono({ cards: { default: { title: { family: 'mono', weight: 400 } }, x: {} } }),
    ).toEqual([]);
  });

  it('name an unknown card with the closest one, or say to define it', () => {
    expect(problemsOf({ kinds: { database: 'tnt' } })).toEqual([
      {
        path: 'diagram.kinds.database',
        message: '"database" uses a card "tnt" that the brand does not have.',
        fix: 'Use "tint". Or define "tnt" under `diagram.cards`.',
      },
    ]);
    expect(problemsOf({ kinds: { database: 'spotlight' } })[0]?.fix).toBe(
      'Use one of: default, outline, solid, tint, raised. Or define "spotlight" under `diagram.cards`.',
    );
  });

  it('name an unknown title family with the closest family role', () => {
    expect(problemsOf({ cards: { code: { title: { family: 'mon' } } } })).toEqual([
      {
        path: 'diagram.cards.code.title.family',
        message: 'There is no family role named "mon".',
        fix: 'Use "mono".',
      },
    ]);
  });

  it('name an unknown role or palette step in a card color', () => {
    const problems = problemsOf({
      cards: { spotlight: { fill: 'acent/12', border: 'blue.700', text: 'none' } },
    });
    expect(problems).toEqual(
      expect.arrayContaining([
        {
          path: 'diagram.cards.spotlight.fill',
          message: '"acent/12" refers to a role "acent" that does not exist.',
          fix: 'Use "accent".',
        },
        {
          path: 'diagram.cards.spotlight.border',
          message: '"blue.700" refers to a step "700" that the "blue" palette does not have.',
          fix: 'Use "100".',
        },
        expect.objectContaining({
          path: 'diagram.cards.spotlight.text',
          message: 'Only a card\'s `fill` and `border` may be "none".',
        }),
      ]),
    );
    expect(new Set(problems.map((problem) => problem.path)).size).toBe(problems.length);
  });

  it('refuse more cards than a brand may define', () => {
    const cards = Object.fromEntries(
      Array.from({ length: 13 }, (_, index) => [`card-${index}`, {}]),
    );
    expect(problemsOf({ cards }).map((problem) => problem.path)).toEqual(['diagram.cards']);
  });

  it('refuse two cards whose variables would share a name', () => {
    expect(problemsOf({ cards: { 'tint-icon': {} } })).toEqual([
      {
        path: 'diagram.cards.tint-icon',
        message:
          'The cards "tint" and "tint-icon" would both write ' +
          '--brand-diagram-card-tint-icon-fill, so one would hide the other.',
        fix: 'Rename "tint-icon" so it does not start with "tint-".',
      },
    ]);
  });
});

describe('surface card recolorings', () => {
  it('name a recolored card the brand does not have, with the closest one', () => {
    const result = Effect.runSync(
      Effect.result(
        resolveBrand(
          testBrand({ 'color.surfaces.inverse': { diagram: { cards: { tnt: { fill: 'fg' } } } } }),
        ),
      ),
    );
    expect(Result.isFailure(result) ? result.failure.problems : []).toEqual([
      {
        path: 'color.surfaces.inverse.diagram.cards.tnt',
        message: 'The inverse surface recolors a card "tnt" that the brand does not have.',
        fix: 'Use "tint". Or define "tnt" under `diagram.cards`.',
      },
    ]);
  });

  it('check contrast on the merged colors and name the surface field that wrote them', () => {
    const result = Effect.runSync(
      Effect.result(
        resolveBrand(
          testBrand({
            diagram: { cards: { volt: { fill: 'orange.300', text: 'gray.900' } } },
            'color.surfaces.inverse': {
              diagram: { cards: { volt: { fill: 'gray.900', subtext: 'gray.600' } } },
            },
          }),
        ),
      ),
    );
    const problems = Result.isFailure(result) ? result.failure.problems : [];
    // The brand-wide title color fails on the surface's fill; the surface's own subtitle fails too.
    expect(problems).toEqual([
      expect.objectContaining({
        path: 'diagram.cards.volt.text',
        fix: expect.stringContaining(
          'on this surface only, under color.surfaces.inverse.diagram.cards.volt',
        ),
      }),
      expect.objectContaining({ path: 'color.surfaces.inverse.diagram.cards.volt.subtext' }),
    ]);
  });
});

describe('diagram card contrast', () => {
  it('report a written text color that does not read on the card’s fill', () => {
    const problems = problemsOf({ cards: { faint: { fill: 'gray.50', text: 'gray.200' } } });
    expect(problems[0]).toMatchObject({
      path: 'diagram.cards.faint.text',
      message: expect.stringContaining('the "faint" card\'s text color #dddde1'),
      fix: expect.stringContaining('leave `text` out to derive a readable one'),
    });
  });

  it('report a written fill that no derived text reads on, and say to change the fill', () => {
    const problems = problemsOf({ cards: { haze: { fill: 'accent/20' } } });
    expect(problems.length).toBeGreaterThan(0);
    expect(problems[0]).toMatchObject({
      path: 'diagram.cards.haze.fill',
      message: expect.stringMatching(/card's `fill` has no (text|subtext) color that reads on it/),
      fix: expect.stringContaining('Change `fill` to a color'),
    });
  });

  it('pass a written fill whose derived text reads on it', () => {
    expect(problemsOf({ cards: { dark: { fill: 'gray.900', border: 'none' } } })).toEqual([]);
  });
});
