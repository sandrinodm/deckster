import { expect, it } from '@effect/vitest';
import { Effect } from 'effect';

import type { LayoutSummary } from '#layouts/summarize-layouts.ts';

import { runCaptured } from '#cli.fixture.ts';

it.effect('deck layouts --summary --json is a small entry per layout', () =>
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

it.effect('deck layouts --summary prints an aligned entry per layout in plain text', () =>
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

it.effect('deck layouts without --summary keeps printing the full contracts', () =>
  Effect.gen(function* () {
    const { output } = yield* runCaptured(['layouts', 'hello', '--json']);
    const catalog = JSON.parse(output) as { layouts: Record<string, unknown>[] };
    expect(Object.keys(catalog.layouts[0] ?? {})).toContain('frontmatter');
    expect(Object.keys(catalog.layouts[0] ?? {})).not.toContain('titleMaxChars');
  }),
);
