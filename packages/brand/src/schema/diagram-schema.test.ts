import { Result } from 'effect';
import { describe, expect, it } from 'vite-plus/test';

import { testBrand } from '#test-brand.fixture.ts';
import { decodeBrand } from '#validate/decode-brand.ts';

/**
 * The problems a brand fails decoding with, or none when it decodes.
 *
 * @param input - The brand as written.
 */
function problemsOf(input: unknown) {
  const decoded = decodeBrand(input);
  return Result.isFailure(decoded) ? decoded.failure : [];
}

describe('the diagram section', () => {
  it('accepts every new key next to the theme colors', () => {
    const problems = problemsOf(
      testBrand({
        diagram: {
          node: 'gray.50',
          edges: { stroke: 'bold', corners: 'sharp', arrow: 'open' },
          groups: { stroke: 'none', dashed: true, radius: 'none' },
          labels: { style: 'chip' },
          kinds: { database: 'tint', external: 'outline' },
          cards: {
            default: { radius: 'sm', title: { family: 'mono', case: 'upper' } },
            spotlight: {
              fill: 'accent',
              border: 'none',
              stroke: 'bold',
              radius: 'lg',
              shadow: 'md',
              shape: 'pill',
              text: 'accent-fg',
              subtext: 'accent-fg/80',
              icon: { style: 'solid', color: 'accent', fill: 'gray.0' },
              accent: { side: 'left', color: 'orange.600', width: 'bold' },
              title: { family: 'display', weight: 600, tracking: 0.04, case: 'upper' },
            },
          },
        },
      }),
    );
    expect(problems).toEqual([]);
  });

  it('keeps a surface’s diagram section to the theme colors and card colors', () => {
    expect(
      problemsOf(
        testBrand({
          'color.surfaces.default': {
            diagram: {
              node: 'gray.50',
              cards: {
                tint: {
                  fill: 'none',
                  border: 'accent',
                  text: 'fg',
                  subtext: 'muted',
                  icon: { color: 'accent-fg', fill: 'blue.600', border: 'accent' },
                  accent: { color: 'orange.600' },
                },
              },
            },
          },
        }),
      ),
    ).toEqual([]);
    const problems = problemsOf(
      testBrand({
        'color.surfaces.default': {
          diagram: { edges: {}, cards: { tint: { stroke: 'bold', icon: { style: 'chip' } } } },
        },
      }),
    );
    expect(problems.map((problem) => problem.path)).toEqual([
      'color.surfaces.default.diagram.edges',
      'color.surfaces.default.diagram.cards.tint.stroke',
      'color.surfaces.default.diagram.cards.tint.icon.style',
    ]);
  });

  it('send a look key or a card’s non-color field on a surface to the top-level diagram', () => {
    const problems = problemsOf(
      testBrand({
        'color.surfaces.default': {
          diagram: { edges: { stroke: 'bold' }, cards: { tint: { stroke: 'bold' } } },
        },
      }),
    );
    expect(problems).toEqual([
      {
        path: 'color.surfaces.default.diagram.edges',
        message: '`edges` sets the diagram look on every surface, so a surface cannot set it.',
        fix: "Move it to the brand's top-level `diagram.edges`.",
      },
      {
        path: 'color.surfaces.default.diagram.cards.tint.stroke',
        message:
          "A surface changes only a card's colors, and `stroke` is not one; the default surface " +
          'cannot set it.',
        fix:
          'Set it on the card itself, `diagram.cards.tint.stroke`, or recolor the card here with ' +
          'fill, border, text, subtext, icon { color, fill, border } or accent { color }.',
      },
    ]);
  });

  it('accepts an edge label type step and refuses another', () => {
    expect(problemsOf(testBrand({ diagram: { labels: { type: 'label' } } }))).toEqual([]);
    expect(problemsOf(testBrand({ diagram: { labels: { type: 'small' } } }))).toEqual([
      {
        path: 'diagram.labels.type',
        message: expect.stringContaining('got "small"'),
        fix: 'Use "caption" (today) or "label" (the brand\'s label step: its family, case and tracking).',
      },
    ]);
  });

  it('rejects invalid dimensions, connector styles and diagram font settings', () => {
    const problems = problemsOf(
      testBrand({
        diagram: {
          align: 'middle',
          edges: { stroke: -1, lineStyle: 'wavy' },
          groups: { stroke: Infinity },
          nodes: { width: 1921 },
          notes: { type: 'hero', weight: 1001 },
          cards: { tint: { icon: { borderWidth: '3px', borderStyle: 'double' } } },
        },
      }),
    );
    expect(problems.map((problem) => problem.path)).toEqual(
      expect.arrayContaining([
        'diagram.align',
        'diagram.edges.stroke',
        'diagram.edges.lineStyle',
        'diagram.groups.stroke',
        'diagram.nodes.width',
        'diagram.notes.type',
        'diagram.notes.weight',
        'diagram.cards.tint.icon.borderWidth',
        'diagram.cards.tint.icon.borderStyle',
      ]),
    );
  });

  it('names the field and the fix for a mistyped card field', () => {
    const problems = problemsOf(
      testBrand({ diagram: { cards: { spotlight: { stroke: 'thick', shape: 'circle' } } } }),
    );
    expect(problems).toEqual([
      {
        path: 'diagram.cards.spotlight.stroke',
        message: expect.stringContaining('got "thick"'),
        fix: 'Name a stroke width from `shape.stroke`: "hairline", "regular" or "bold".',
      },
      {
        path: 'diagram.cards.spotlight.shape',
        message: expect.stringContaining('got "circle"'),
        fix: 'Use "kind" (the node kind\'s own shape), "box" or "pill".',
      },
    ]);
  });

  it('refuses a card color that is no role, reference or color, and none outside fill and border', () => {
    const problems = problemsOf(
      testBrand({ diagram: { cards: { spotlight: { fill: 'Accent!', text: '#12' } } } }),
    );
    expect(problems.map((problem) => problem.path)).toEqual([
      'diagram.cards.spotlight.fill',
      'diagram.cards.spotlight.text',
    ]);
    expect(problemsOf(testBrand({ diagram: { cards: { a: { fill: 'none' } } } }))).toEqual([]);
    expect(problemsOf(testBrand({ diagram: { cards: { a: { text: 'none' } } } }))).toEqual([]);
  });

  it('suggests the closest field for a misspelled card key', () => {
    const problems = problemsOf(testBrand({ diagram: { cards: { a: { boder: 'border' } } } }));
    expect(problems).toContainEqual({
      path: 'diagram.cards.a.boder',
      message: '"boder" is not a field of diagram.cards.a.',
      fix: 'Rename it to "border".',
    });
  });

  it('refuses card names and kinds that are not kebab-case', () => {
    const problems = problemsOf(
      testBrand({ diagram: { cards: { Spotlight: {} }, kinds: { Database: 'tint' } } }),
    );
    expect(problems.map((problem) => problem.path)).toEqual(
      expect.arrayContaining(['diagram.cards.Spotlight', 'diagram.kinds.Database']),
    );
  });
});
