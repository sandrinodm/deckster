import { expect, it } from '@effect/vitest';
import { Effect } from 'effect';

import { runCaptured } from '#cli.fixture.ts';

/**
 * The part of an entry every catalog gives each component.
 */
type CatalogEntry = {
  name: string;
  useWhen: string;
  example: string;
  shared: string[];
  props: Record<string, { type: string }>;
  longText?: string;
};

/**
 * The part of a catalog the three commands share.
 */
type Catalog = {
  shared: Record<string, { type: string; description: string }>;
  longText?: string;
  components?: CatalogEntry[];
  charts?: CatalogEntry[];
};

it.effect(
  'deckster charts, diagrams and components --json name components by their bare tag, in one shape',
  () =>
    Effect.gen(function* () {
      for (const command of ['charts', 'diagrams', 'components']) {
        const { code, output } = yield* runCaptured([command, '--json']);
        expect(code, command).toBe(0);
        const catalog = JSON.parse(output) as Catalog;
        expect(typeof catalog.shared, command).toBe('object');
        const entries = catalog.charts ?? catalog.components ?? [];
        expect(entries.length, command).toBeGreaterThan(3);
        for (const entry of entries) {
          const label = `${command} ${entry.name}`;
          expect(entry.name, label).toMatch(/^[A-Z][A-Za-z]*$/u);
          expect(entry.useWhen, label).not.toBe('');
          expect(entry.example, label).toContain(entry.name === 'Code' ? '```' : `<${entry.name}`);
          expect(Array.isArray(entry.shared), label).toBe(true);
          expect(typeof entry.props, label).toBe('object');
          for (const name of entry.shared) {
            expect(catalog.shared[name], `${label} shares ${name}`).toBeDefined();
          }
        }
      }
    }),
);

it.effect(
  'deckster diagrams --json says the shared long-text rule once, not on every component',
  () =>
    Effect.gen(function* () {
      const { output } = yield* runCaptured(['diagrams', '--json']);
      const catalog = JSON.parse(output) as Catalog & {
        animation: { name: string }[];
      };
      const components = catalog.components ?? [];
      expect(catalog.longText).toContain('ellipsis');
      expect(components.filter((entry) => entry.longText === catalog.longText)).toEqual([]);
      expect(components.filter((entry) => entry.longText === '')).toEqual([]);
      expect(components.find((entry) => entry.name === 'Group')?.longText).toContain('one line');
      expect(catalog.animation.map((entry) => entry.name)).toEqual(
        expect.arrayContaining(['Packet', 'Journey', 'State', 'Focus']),
      );
      expect(output).not.toContain('"tag"');
    }),
);
