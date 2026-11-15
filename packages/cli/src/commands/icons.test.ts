import { iconSetNames } from '@deckster/kit/icon-sets';
import { NodeServices } from '@effect/platform-node';
import { describe, expect, it } from '@effect/vitest';
import { Effect } from 'effect';
import fs from 'node:fs';

import { runCaptured } from '#cli.fixture.ts';
import { scratchWorkspace } from '#lint/scratch-workspace.fixture.ts';

/**
 * What `deck icons --json` prints.
 */
type IconsJson = {
  /**
   * The brands and their sets.
   */
  brands: { name: string; set: string }[];

  /**
   * How many names there are.
   */
  count: number;

  /**
   * The names.
   */
  icons: string[];
};

/**
 * Runs `deck icons` in a scratch workspace that has the framework's brands (`default` on lucide,
 * `nocturne` on tabler), or only the given fixture brands (all on lucide).
 *
 * @param argv - The arguments after `deck icons`.
 * @param fixtureBrands - Fixture brands to list instead of the framework's.
 */
const icons = Effect.fn('icons')(function* (
  argv: readonly string[],
  fixtureBrands: readonly string[] = [],
) {
  const root = scratchWorkspace('deck-icons-', fixtureBrands);
  yield* Effect.addFinalizer(() =>
    Effect.sync(() => fs.rmSync(root, { recursive: true, force: true })),
  );
  return yield* runCaptured(['icons', ...argv], { root });
}, Effect.scoped);

describe('deck icons', () => {
  it.effect('prints the names every brand shares and the sets used', () =>
    Effect.gen(function* () {
      const { code, output } = yield* icons(['--json']);
      expect(code).toBe(0);
      const listing = JSON.parse(output) as IconsJson;
      const sets = new Map(listing.brands.map((brand) => [brand.name, brand.set]));
      expect(sets.get('default')).toBe('lucide');
      expect(sets.get('nocturne')).toBe('tabler');
      expect(listing.count).toBe(listing.icons.length);
      const lucide = new Set(iconSetNames('lucide'));
      const tabler = new Set(iconSetNames('tabler'));
      expect(listing.icons.length).toBeGreaterThan(100);
      expect(listing.icons.length).toBeLessThan(lucide.size);
      expect(listing.icons.every((name) => lucide.has(name) && tabler.has(name))).toBe(true);
      expect(listing.icons).toEqual(listing.icons.toSorted());
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect('takes the names of one set when the brands share it, and --search narrows', () =>
    Effect.gen(function* () {
      const { output } = yield* icons(
        ['--brand', 'weak-accent,hidden-logo', '--search', 'ARROW-up', '--json'],
        ['weak-accent', 'hidden-logo'],
      );
      const listing = JSON.parse(output) as IconsJson;
      expect(listing.brands).toEqual([
        { name: 'weak-accent', set: 'lucide' },
        { name: 'hidden-logo', set: 'lucide' },
      ]);
      const expected = (iconSetNames('lucide') ?? []).filter((name) => name.includes('arrow-up'));
      expect(listing.icons).toEqual(expected);
      expect(listing.count).toBe(expected.length);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect('prints a count and a wrapped, capped list in plain text', () =>
    Effect.gen(function* () {
      const all = (yield* icons(['--brand', 'default,nocturne'])).output;
      expect(all).toMatch(
        /^\d+ icon names in every one of: default \(lucide\), nocturne \(tabler\)\nSets: lucide, tabler\n/,
      );
      expect(all).toContain('more. Narrow with --search <text>, or print all with --json.');
      expect(Math.max(...all.split('\n').map((line) => line.length))).toBeLessThan(120);
      const some = (yield* icons(['--brand', 'default,nocturne', '--search', 'arrow-up-r'])).output;
      expect(some).toContain('matching "arrow-up-r"');
      expect(some).toContain('arrow-up-right');
      expect(some).not.toContain('Narrow with');
      const none = (yield* icons(['--search', 'zzzz-no-such-icon'])).output;
      expect(none).toContain('0 icon names matching "zzzz-no-such-icon"');
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect('names the brands that exist for an unknown one, as JSON too', () =>
    Effect.gen(function* () {
      const failure = yield* Effect.flip(icons(['--brand', 'default,nope']));
      expect(failure.message).toContain(
        'There is no brand "nope". Brands: default, fieldnote, kinetic, nocturne, tidewater.',
      );
      expect(failure.message).toContain('Run `deck icons --help` for the usage.');
      const json = yield* icons(['--brand', '../evil', '--json']);
      expect(json.code).toBe(1);
      const parsed = JSON.parse(json.output) as {
        ok: boolean;
        error: { type: string; message: string };
      };
      expect(parsed.ok).toBe(false);
      expect(parsed.error.type).toBe('CliError');
      expect(parsed.error.message).toContain('There is no brand "../evil"');
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});
