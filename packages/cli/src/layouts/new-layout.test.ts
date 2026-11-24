import { deckCommand } from '@deckster/engine/command';
import { NodeServices } from '@effect/platform-node';
import { describe, expect, it } from '@effect/vitest';
import { Effect } from 'effect';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runCaptured } from '#cli.fixture.ts';
import {
  CODE_BRAND,
  CODE_LAYOUTS_DECK,
  codeLayoutsWorkspace,
} from '#layouts/code-layouts.fixture.ts';
import { layoutFiles } from '#layouts/new-layout.ts';

/**
 * The scaffold of `sample-layout` as the repository's formatter prints it, typechecked by the
 * package's `typecheck` script.
 */
const GOLDEN_DIR = fileURLToPath(
  new URL('../../fixtures/layouts-new/sample-layout/', import.meta.url),
);

/**
 * Room for a command that reads the brand and the catalog, on a busy machine.
 */
const COMMAND_TEST_TIMEOUT_MS = 60_000;

/**
 * The files a new layout has, in the order they are written.
 */
const FILES = ['contract.ts', 'layout.tsx', 'layout.css', 'limits.ts'];

describe('layoutFiles', () => {
  it('writes the files as the formatter prints them', () => {
    for (const [file, content] of Object.entries(layoutFiles('sample-layout'))) {
      expect(content, file).toBe(fs.readFileSync(path.join(GOLDEN_DIR, file), 'utf8'));
    }
  });

  it('keys the layout on its name and breaks a selector too long for a line', () => {
    const name = `l${'-x'.repeat(31)}`;
    const files = layoutFiles(name);
    expect(Object.keys(files)).toEqual(FILES);
    expect(files['contract.ts']).toContain(`  name: '${name}',`);
    expect(files['layout.tsx']).toContain(`    <Frame layout="${name}">`);
    expect(files['layout.css']).toContain(
      `  .kit-frame[data-layout='${name}']\n    .layout-body {\n`,
    );
    for (const content of Object.values(files)) {
      expect(content.split('\n').every((line) => line.length <= 100)).toBe(true);
    }
  });
});

describe('deckster layouts new', () => {
  it.effect(
    'writes a brand layout and a deck layout, and prints the next step',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const root = yield* codeLayoutsWorkspace();
          const text = yield* runCaptured(['layouts', 'new', 'brief', '--brand', CODE_BRAND], {
            root,
          });
          const brandDir = `brands/${CODE_BRAND}/layouts/brief`;
          expect(text.code).toBe(0);
          expect(text.output.split('\n').slice(0, 4)).toEqual(
            FILES.map((file) => `${brandDir}/${file}`),
          );
          expect(text.output).toContain(
            `then run \`${deckCommand()} layouts check brief --brand ${CODE_BRAND}\`.`,
          );
          for (const file of FILES) {
            expect(fs.readFileSync(path.join(root, brandDir, file), 'utf8')).toBe(
              layoutFiles('brief')[file],
            );
          }

          const json = yield* runCaptured(
            ['layouts', 'new', 'stages', '--deck', CODE_LAYOUTS_DECK, '--json'],
            { root },
          );
          const deckDir = `decks/${CODE_LAYOUTS_DECK}/layouts/stages`;
          expect(JSON.parse(json.output)).toEqual({
            ok: true,
            layout: 'stages',
            brand: null,
            deck: CODE_LAYOUTS_DECK,
            dir: deckDir,
            files: FILES.map((file) => `${deckDir}/${file}`),
            next: expect.stringContaining(
              `\`${deckCommand()} new slide ${CODE_LAYOUTS_DECK} <id> --layout stages\``,
            ),
          });

          const listed = yield* runCaptured(['layouts', CODE_LAYOUTS_DECK, '--json'], { root });
          const sources = Object.fromEntries(
            (
              JSON.parse(listed.output) as { layouts: { name: string; source: string }[] }
            ).layouts.map((layout) => [layout.name, layout.source]),
          );
          expect(sources['brief']).toBe(`brand-code:${CODE_BRAND}`);
          expect(sources['stages']).toBe(`deck:${CODE_LAYOUTS_DECK}`);
        }),
      ).pipe(Effect.provide(NodeServices.layer)),
    COMMAND_TEST_TIMEOUT_MS,
  );

  it.effect(
    'refuses a bad name, a taken name, an existing folder and a brand outside the workspace',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const root = yield* codeLayoutsWorkspace();
          /**
           * The message `deckster layouts new` fails with.
           */
          const refusal = (argv: readonly string[]) =>
            Effect.flip(runCaptured(['layouts', 'new', ...argv], { root })).pipe(
              Effect.map((error) => error.message),
            );
          expect(yield* refusal(['Brief', '--brand', CODE_BRAND])).toContain(
            '"Brief" is not a layout name',
          );
          expect(yield* refusal(['title', '--brand', CODE_BRAND])).toContain(
            '"title" is already a layout of @deckster/kit',
          );
          expect(yield* refusal(['title', '--brand', CODE_BRAND])).toContain(
            'contract that says `replaces: true`',
          );
          expect(yield* refusal(['kpi-wall', '--deck', CODE_LAYOUTS_DECK])).toContain(
            `"kpi-wall" is already a code layout of the ${CODE_BRAND} brand ` +
              `(brands/${CODE_BRAND}/layouts/kpi-wall/contract.ts)`,
          );
          expect(yield* refusal(['kpi-wall', '--brand', CODE_BRAND])).toContain(
            `brands/${CODE_BRAND}/layouts/kpi-wall/ already exists.`,
          );
          expect(yield* refusal(['brief', '--brand', 'default'])).toContain(
            'The brand default is not a folder of this workspace',
          );
          expect(yield* refusal(['brief'])).toContain('Neither was given');
          expect(yield* refusal(['brief', '--brand', CODE_BRAND, '--deck', 'x'])).toContain(
            'Both were given',
          );
          expect(yield* refusal(['--brand', CODE_BRAND])).toContain('Name one layout');
          expect(fs.existsSync(path.join(root, 'brands', CODE_BRAND, 'layouts', 'title'))).toBe(
            false,
          );
          expect(fs.existsSync(path.join(root, 'brands', CODE_BRAND, 'layouts', 'Brief'))).toBe(
            false,
          );
        }),
      ).pipe(Effect.provide(NodeServices.layer)),
    COMMAND_TEST_TIMEOUT_MS,
  );
});
