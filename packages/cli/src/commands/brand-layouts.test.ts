import { NodeServices } from '@effect/platform-node';
import { describe, expect, it } from '@effect/vitest';
import { Effect } from 'effect';
import fs from 'node:fs';
import path from 'node:path';

import type { LayoutSummary } from '#layouts/summarize-layouts.ts';

import { runCaptured } from '#cli.fixture.ts';
import { findBrandFallbacks } from '#lint/brand-fallbacks.ts';
import { scratchWorkspace } from '#lint/scratch-workspace.fixture.ts';

/**
 * A brand layout that binds the `default` layout's only slot.
 */
const NOTE_LAYOUT = {
  name: 'acme-note',
  label: 'Note page',
  description: 'A note with the text set beside the title.',
  fallback: 'default',
  title: { box: [120, 80, 1680, 160] },
  regions: [{ bind: { slot: 'body' }, box: [120, 300, 1680, 600] }],
};

/**
 * A brand layout whose fallback does not exist.
 */
const BROKEN_LAYOUT = { ...NOTE_LAYOUT, name: 'acme-broken', fallback: 'no-such-layout' };

/**
 * Makes a scratch workspace whose `weak-accent` brand has the given layouts and `hidden-logo` has
 * none, with a deck `demo` on `weak-accent`; removes it when the scope closes.
 */
const workspaceWith = Effect.fn('workspaceWith')(function* (layouts: readonly object[]) {
  const root = scratchWorkspace('deck-brand-layouts-', ['weak-accent', 'hidden-logo']);
  yield* Effect.addFinalizer(() =>
    Effect.sync(() => fs.rmSync(root, { recursive: true, force: true })),
  );
  fs.writeFileSync(
    path.join(root, 'brands', 'weak-accent', 'layouts.ts'),
    `export default ${JSON.stringify(layouts)};\n`,
  );
  yield* runCaptured(['new', 'demo', '--brand', 'weak-accent'], { root });
  return root;
});

describe('brand layouts in the CLI', () => {
  it.effect('lists the brand layouts first, with source, fallback and label', () =>
    Effect.scoped(
      Effect.gen(function* () {
        const root = yield* workspaceWith([NOTE_LAYOUT]);
        const full = yield* runCaptured(['layouts', 'demo', '--json'], { root });
        const { layouts } = JSON.parse(full.output) as {
          layouts: {
            name: string;
            source: string;
            fallback: string | null;
            label: string | null;
          }[];
        };
        const note = layouts.find((layout) => layout.name === 'acme-note');
        expect(note).toMatchObject({
          source: 'brand:weak-accent',
          fallback: 'default',
          label: 'Note page',
        });
        expect(layouts.find((layout) => layout.name === 'default')).toMatchObject({
          fallback: null,
          label: null,
        });
        const summary = yield* runCaptured(['layouts', 'demo', '--summary', '--json'], { root });
        const entries = (JSON.parse(summary.output) as { layouts: LayoutSummary[] }).layouts;
        expect(entries[0]).toMatchObject({ name: 'acme-note', fallback: 'default' });
        const text = yield* runCaptured(['layouts', 'demo', '--summary'], { root });
        expect(text.output).toMatch(/^Layouts from the weak-accent brand/u);
        expect(text.output).toContain('Other layouts:');
      }),
    ).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect('deck new slide --layout takes a brand layout and writes its example', () =>
    Effect.scoped(
      Effect.gen(function* () {
        const root = yield* workspaceWith([NOTE_LAYOUT]);
        const added = yield* runCaptured(
          ['new', 'slide', 'demo', 'extra', '--layout', 'acme-note'],
          {
            root,
          },
        );
        expect(added.code).toBe(0);
        const slide = fs.readFileSync(
          path.join(root, 'decks', 'demo', 'slides', 'extra.mdx'),
          'utf8',
        );
        expect(slide).toMatch(/^---\nlayout: acme-note\n/u);
      }),
    ).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect('deck brand names the layouts and deck brand check accepts a sound set', () =>
    Effect.scoped(
      Effect.gen(function* () {
        const root = yield* workspaceWith([NOTE_LAYOUT]);
        const summary = yield* runCaptured(['brand', 'weak-accent'], { root });
        expect(summary.output).toContain('Layouts: 1 (acme-note)');
        const none = yield* runCaptured(['brand', 'hidden-logo'], { root });
        expect(none.output).toContain('Layouts: none');
        const checked = yield* runCaptured(['brand', 'check', 'weak-accent'], { root });
        expect(checked.code).toBe(0);
      }),
    ).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect('deck brand check fails on a layout whose fallback is not in the catalog', () =>
    Effect.scoped(
      Effect.gen(function* () {
        const root = yield* workspaceWith([NOTE_LAYOUT]);
        fs.writeFileSync(
          path.join(root, 'brands', 'weak-accent', 'layouts.ts'),
          `export default ${JSON.stringify([NOTE_LAYOUT, BROKEN_LAYOUT])};\n`,
        );
        const checked = yield* runCaptured(['brand', 'check', 'weak-accent', '--json'], { root });
        expect(checked.code).toBe(1);
        const report = JSON.parse(checked.output) as {
          errors: { path: string; message: string; fix: string }[];
        };
        expect(report.errors.some((problem) => problem.message.includes('no-such-layout'))).toBe(
          true,
        );
      }),
    ).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect('finds the slides that name a layout of another brand', () =>
    Effect.scoped(
      Effect.gen(function* () {
        const root = yield* workspaceWith([NOTE_LAYOUT]);
        const deckDir = path.join(root, 'decks', 'demo');
        fs.writeFileSync(
          path.join(deckDir, 'slides', 'note.mdx'),
          '---\nlayout: acme-note\ntitle: Note\n---\n\nHello\n',
        );
        const found = yield* findBrandFallbacks({
          workspaceRoot: root,
          deckDir,
          brand: 'hidden-logo',
          files: ['slides/note.mdx'],
          hasLayout: (name) => name === 'default',
        });
        expect(found.get('slides/note.mdx')).toEqual({
          sourceLayout: 'acme-note',
          brands: [{ brand: 'weak-accent', fallback: 'default' }],
        });
        const none = yield* findBrandFallbacks({
          workspaceRoot: root,
          deckDir,
          brand: 'weak-accent',
          files: ['slides/note.mdx'],
          hasLayout: () => true,
        });
        expect(none.size).toBe(0);
      }),
    ).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect(
    "deck layouts --brand lists the layouts of that brand instead of the deck config's",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const root = yield* workspaceWith([NOTE_LAYOUT]);
          const names = (output: string) =>
            (JSON.parse(output) as { layouts: { name: string }[] }).layouts.map(
              (layout) => layout.name,
            );
          const own = yield* runCaptured(['layouts', 'demo', '--json'], { root });
          expect(names(own.output)).toContain('acme-note');
          const other = yield* runCaptured(
            ['layouts', 'demo', '--brand', 'hidden-logo', '--json'],
            {
              root,
            },
          );
          expect(names(other.output)).not.toContain('acme-note');
          const back = yield* runCaptured(['layouts', 'demo', '--brand', 'weak-accent', '--json'], {
            root,
          });
          expect(names(back.output)).toContain('acme-note');
        }),
      ).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect('a brand whose layouts are broken leaves them out with a warning, not a failure', () =>
    Effect.scoped(
      Effect.gen(function* () {
        const root = yield* workspaceWith([NOTE_LAYOUT]);
        fs.writeFileSync(
          path.join(root, 'brands', 'weak-accent', 'layouts.ts'),
          `export default ${JSON.stringify([BROKEN_LAYOUT])};\n`,
        );
        const listed = yield* runCaptured(['layouts', 'demo', '--json'], { root });
        expect(listed.code).toBe(0);
        const catalog = JSON.parse(listed.output) as {
          warnings: string[];
          layouts: { name: string }[];
        };
        expect(catalog.layouts.map((layout) => layout.name)).toContain('default');
        expect(catalog.layouts.map((layout) => layout.name)).not.toContain('acme-broken');
        expect(catalog.warnings[0]).toContain('The brand "weak-accent" has a problem');
        expect(catalog.warnings[0]).not.toMatch(/:\. Run/);
        expect(listed.errors).toContain('warning: The brand "weak-accent" has a problem');
        const added = yield* runCaptured(['new', 'slide', 'demo', 'extra'], { root });
        expect(added.code).toBe(0);
        expect(added.errors).toContain('The brand "weak-accent" has a problem');
        const created = yield* runCaptured(['new', 'other', '--brand', 'weak-accent'], { root });
        expect(created.code).toBe(0);
      }),
    ).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect('deck brand check reports layout problems under layouts.ts', () =>
    Effect.scoped(
      Effect.gen(function* () {
        const root = yield* workspaceWith([NOTE_LAYOUT]);
        fs.writeFileSync(
          path.join(root, 'brands', 'weak-accent', 'layouts.ts'),
          `export default ${JSON.stringify([NOTE_LAYOUT, BROKEN_LAYOUT])};\n`,
        );
        const json = yield* runCaptured(['brand', 'check', 'weak-accent', '--json'], { root });
        const report = JSON.parse(json.output) as {
          errors: { message: string; file: string }[];
        };
        const problem = report.errors.find((entry) => entry.message.includes('no-such-layout'));
        expect(problem?.file).toBe('brands/weak-accent/layouts.ts');
        const text = yield* runCaptured(['brand', 'check', 'weak-accent'], { root });
        const lines = text.output.split('\n');
        const header = lines.indexOf('brands/weak-accent/layouts.ts');
        expect(header).toBeGreaterThan(0);
        expect(lines.slice(header).join('\n')).toContain('no-such-layout');
        expect(lines.slice(0, header).join('\n')).not.toContain('no-such-layout');
      }),
    ).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect('new slide reports the slide-list problem, not a missing layout', () =>
    Effect.scoped(
      Effect.gen(function* () {
        const root = yield* workspaceWith([NOTE_LAYOUT]);
        const config = path.join(root, 'decks', 'demo', 'deck.config.ts');
        fs.writeFileSync(
          config,
          fs.readFileSync(config, 'utf8').replace('slides: [', "slides: ['ghost', "),
        );
        const error = yield* Effect.flip(
          runCaptured(['new', 'slide', 'demo', 'ghost', '--layout', 'acme-note'], { root }),
        );
        expect(error.message).toContain('ghost');
        expect(error.message).not.toContain('There is no layout');
      }),
    ).pipe(Effect.provide(NodeServices.layer)),
  );
});
