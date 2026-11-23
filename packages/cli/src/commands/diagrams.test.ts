import { expect, it } from '@effect/vitest';
import { Effect } from 'effect';

import { runCaptured } from '#cli.fixture.ts';

it.effect('deckster diagrams --json lists components, node kinds, edge options and animation', () =>
  Effect.gen(function* () {
    const { code, output } = yield* runCaptured(['diagrams', '--json']);
    expect(code).toBe(0);
    const catalog = JSON.parse(output) as {
      components: { name: string; useWhen: string; example: string }[];
      nodeKinds: { kind: string; aliases: string[]; shape: string; useWhen: string }[];
      edgeOptions: { name: string }[];
      animation: { name: string; example: string }[];
      states: string[];
    };
    expect(catalog.components.map((entry) => entry.name)).toEqual(
      expect.arrayContaining([
        'Flow',
        'SequenceDiagram',
        'Timeline',
        'Layers',
        'Cycle',
        'Tree',
        'Svg',
      ]),
    );
    expect(catalog.nodeKinds.find((entry) => entry.kind === 'database')).toMatchObject({
      shape: 'cylinder',
      aliases: ['db'],
    });
    expect(catalog.animation.map((entry) => entry.name)).toEqual(
      expect.arrayContaining(['Packet', 'Journey', 'State', 'Focus']),
    );
    expect(catalog.states).toEqual(['default', 'highlighted', 'muted', 'error', 'success']);
  }),
);

it.effect(
  'deckster diagrams --json describes every prop, the shared ones once, and the limits',
  () =>
    Effect.gen(function* () {
      const { output } = yield* runCaptured(['diagrams', '--json']);
      const catalog = JSON.parse(output) as {
        shared: Record<string, { type: string; required: boolean; description: string }>;
        components: {
          name: string;
          role: string;
          shared: string[];
          props: Record<string, { type: string; default: unknown; values?: string[] }>;
          limits: Record<string, number>;
          longText?: string;
        }[];
        limits: Record<string, number>;
        tsx: { import: string };
      };
      const byTag = new Map(catalog.components.map((entry) => [entry.name, entry]));
      expect(byTag.get('Flow')).toMatchObject({
        role: 'diagram',
        limits: { nodes: 12, edges: 16 },
      });
      expect(Object.keys(byTag.get('Flow')?.props ?? {})).toEqual(
        expect.arrayContaining(['cols', 'rows', 'layout', 'direction']),
      );
      expect(byTag.get('Flow')?.props['layout']?.values).toEqual([
        'layered',
        'tree',
        'force',
        'radial',
      ]);
      for (const tag of ['Actor', 'Message', 'Milestone', 'Layer', 'Item', 'Hop']) {
        expect(byTag.get(tag)?.role).toBe('part');
      }

      expect(catalog.shared['title']).toMatchObject({ type: 'string', required: true });
      expect(byTag.get('Edge')?.props['label']?.type).toBe('string');
      expect(catalog.limits).toMatchObject({ labelChars: 18, labelLines: 2 });
      expect(catalog.tsx.import).toContain('@deckster/kit/diagrams');
    }),
);

it.effect('deckster diagrams prints each entry with when to use it and an example', () =>
  Effect.gen(function* () {
    const { code, output } = yield* runCaptured(['diagrams']);
    expect(code).toBe(0);
    expect(output).toContain('<Journey>\n    Use when: A request travelling hop by hop');
    expect(output).toContain('gateway (also proxy): An API gateway');
    expect(output).toContain('  <Edge>\n    Use when: A connection between two nodes');
    expect(output).toContain('Props: id (string), from (string, required)');
  }),
);

it.effect('deckster diagrams prints the cards: how a node picks one and the standard five', () =>
  Effect.gen(function* () {
    const { output } = yield* runCaptured(['diagrams']);
    expect(output).toContain('Cards (card="...")\n  A node\'s card is, in order: its own `card`');
    for (const name of ['default', 'outline', 'solid', 'tint', 'raised']) {
      expect(output).toMatch(new RegExp(`\\n  ${name}: `, 'u'));
    }

    expect(output).toContain('(`deckster brand <name>` lists them)');
    const { output: json } = yield* runCaptured(['diagrams', '--json']);
    const catalog = JSON.parse(json) as { cards: { standard: Record<string, string> } };
    expect(Object.keys(catalog.cards.standard)).toEqual([
      'default',
      'outline',
      'solid',
      'tint',
      'raised',
    ]);
  }),
);
