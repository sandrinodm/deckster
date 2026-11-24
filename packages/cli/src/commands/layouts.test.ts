import { expect, it } from '@effect/vitest';
import { Effect } from 'effect';

import type { LayoutSummary } from '#layouts/summarize-layouts.ts';

import { runCaptured } from '#cli.fixture.ts';

it.effect('deckster layouts --summary --json is a small entry per layout', () =>
  Effect.gen(function* () {
    const full = yield* runCaptured(['layouts', 'hello', '--json']);
    const summary = yield* runCaptured(['layouts', 'hello', '--summary', '--json']);
    expect(summary.code).toBe(0);
    expect(summary.output.length).toBeLessThan(full.output.length / 5);
    const { layouts } = JSON.parse(summary.output) as { layouts: LayoutSummary[] };
    const names = (JSON.parse(full.output) as { layouts: { name: string }[] }).layouts.map(
      (layout) => layout.name,
    );
    expect(layouts.map((layout) => layout.name)).toEqual(names);
    const title = layouts.find((layout) => layout.name === 'title');
    expect(title).toMatchObject({ surface: 'gradient', titleMaxChars: 36, items: [] });
    expect(title?.description).toMatch(/^The cover of a deck:.*when\.$/u);
    expect(title?.slots['media']).toMatchObject({ tag: 'Media', accepts: ['image'] });
    expect(title?.slots['body']).toMatchObject({ tag: null, maxWords: 14, required: false });
    const stats = layouts.find((layout) => layout.name === 'stats');
    expect(stats?.items).toEqual([{ field: 'stats', min: 2, max: 4 }]);
    const code = layouts.find((layout) => layout.name === 'code');
    expect(code?.slots['body']).toMatchObject({ required: true, maxLines: 11 });
    const logos = layouts.find((layout) => layout.name === 'logos');
    expect(logos?.items).toEqual([{ field: 'logos', min: 3, max: 18 }]);
    const comparison = layouts.find((layout) => layout.name === 'comparison');
    expect(comparison?.items).toEqual([
      { field: 'options', min: 2, max: 3 },
      { field: 'rows', min: 2, max: 5 },
    ]);
  }),
);

it.effect('deckster layouts --summary prints an aligned entry per layout in plain text', () =>
  Effect.gen(function* () {
    const { code, output } = yield* runCaptured(['layouts', 'hello', '--summary']);
    expect(code).toBe(0);
    expect(output).toMatch(/^default +surface default {3}title any\n/u);
    expect(output).toMatch(/\nstats +surface default {3}title <= 90 {2}stats\[2-4\]\n/u);
    const entries = output.split('\n').filter((line) => /^\S+ +surface /u.test(line));
    expect(new Set(entries.map((line) => line.indexOf('surface'))).size).toBe(1);
    expect(
      new Set(entries.map((line) => line.indexOf('title', line.indexOf('surface')))).size,
    ).toBe(1);
    expect(output).toContain('slots: body text 14 words; <Media> image');
    expect(output).not.toContain('"frontmatter"');
  }),
);

it.effect('deckster layouts without --summary keeps printing the full contracts', () =>
  Effect.gen(function* () {
    const { output } = yield* runCaptured(['layouts', 'hello', '--json']);
    const catalog = JSON.parse(output) as { layouts: Record<string, unknown>[] };
    expect(Object.keys(catalog.layouts[0] ?? {})).toContain('frontmatter');
    expect(Object.keys(catalog.layouts[0] ?? {})).not.toContain('titleMaxChars');
  }),
);

it.effect('deckster layouts prints a usage error as JSON when asked for JSON', () =>
  Effect.gen(function* () {
    for (const argv of [
      ['layouts', 'check', '--json', '--unknown-flag'],
      ['layouts', '--json', '--unknown-flag'],
      ['layouts', '--deck', 'hello', '--json'],
    ]) {
      const run = yield* runCaptured(argv);
      expect(run.code, argv.join(' ')).toBe(1);
      const failure = JSON.parse(run.output) as { ok: boolean; error: { message: string } };
      expect(failure.ok).toBe(false);
      expect(failure.error.message.length).toBeGreaterThan(0);
    }
  }),
);

it.effect('deckster layouts hands a subcommand the arguments without its own word', () =>
  Effect.gen(function* () {
    // The brand is named like the subcommand: only the word that selects `check` is taken out.
    const run = yield* runCaptured(['layouts', '--brand', 'check', '--json', 'check']);
    expect(run.code).toBe(1);
    const { error } = JSON.parse(run.output) as { error: { type: string; message: string } };
    expect(error.type).toBe('BrandError');
    expect(error.message).toContain('check');
    expect(error.message).not.toMatch(/argument missing|ambiguous/iu);
  }),
);
