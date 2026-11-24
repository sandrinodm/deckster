import type { AnyLayoutContract } from '@deckster/engine/layout';

import { holdCode, resetCodeGate } from '@deckster/brand/node';
import { NodeServices } from '@effect/platform-node';
import { describe, expect, it } from '@effect/vitest';
import { Effect } from 'effect';
import fs from 'node:fs';
import path from 'node:path';

import { loadLayoutLimits, LIMITS_FILE, LIMITS_INVALID } from '#layouts/layout-limits.ts';
import { layoutFiles } from '#layouts/new-layout.ts';
import { scratchWorkspace } from '#lint/scratch-workspace.fixture.ts';

/**
 * Room for the contract environment to start, on a busy machine.
 */
const LOAD_TIMEOUT_MS = 60_000;

/**
 * The global a `limits.ts` of these tests sets when it runs.
 */
const MARKER = '__deckLayoutLimitsRan';

/**
 * A contract with a named `aside` slot, enough for the slot check.
 */
const CONTRACT = {
  name: 'brief',
  slots: { body: { description: 'Body.', accepts: ['text'] }, aside: { description: 'Aside.' } },
} as unknown as AnyLayoutContract;

/**
 * A scratch workspace with a brand layout folder, removed when the scope closes.
 *
 * @returns The workspace root and the layout's folder.
 */
const layoutFolder = Effect.fn('layoutFolder')(function* () {
  const root = scratchWorkspace('deck-layout-limits-', ['wide-sans']);
  yield* Effect.addFinalizer(() =>
    Effect.sync(() => fs.rmSync(root, { recursive: true, force: true })),
  );
  const dir = path.join(root, 'brands', 'wide-sans', 'layouts', 'brief');
  fs.mkdirSync(dir, { recursive: true });
  return { root, dir };
});

/**
 * Loads the layout's `limits.ts` written with the given text.
 *
 * @param text - The file, or `undefined` for none.
 */
const loadWith = Effect.fn('loadWith')(function* (text: string | undefined) {
  const { root, dir } = yield* layoutFolder();
  if (text !== undefined) {
    fs.writeFileSync(path.join(dir, LIMITS_FILE), text);
  }

  const [load] = yield* loadLayoutLimits([{ name: 'brief', contract: CONTRACT, dir }], root);
  return load;
});

describe('loadLayoutLimits', () => {
  it.effect(
    'loads the limits.ts that deckster layouts new writes',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const load = yield* loadWith(layoutFiles('brief')[LIMITS_FILE]);
          expect(load).toEqual({
            name: 'brief',
            kind: 'cases',
            cases: [{ name: 'full-body', frontmatter: {}, filled: [] }],
          });
        }),
      ).pipe(Effect.provide(NodeServices.layer)),
    LOAD_TIMEOUT_MS,
  );

  it.effect('gives no cases for a layout without limits.ts', () =>
    Effect.scoped(
      Effect.gen(function* () {
        expect(yield* loadWith(undefined)).toEqual({ name: 'brief', kind: 'cases', cases: [] });
      }),
    ).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect(
    'rejects a value import a contract may not make, before running anything',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const load = yield* loadWith(
            [
              "import { LIMIT_CASES } from '@deckster/kit/limit-cases';",
              `Reflect.set(globalThis, '${MARKER}', true);`,
              'export default LIMIT_CASES.title;',
              '',
            ].join('\n'),
          );
          expect(Reflect.get(globalThis, MARKER)).toBeUndefined();
          expect(load).toMatchObject({
            kind: 'problem',
            problem: { code: 'layout-contract-imports' },
          });
          expect(load?.kind === 'problem' ? load.problem.message : '').toContain(
            'imports "@deckster/kit/limit-cases", which a contract may not import',
          );
        }),
      ).pipe(Effect.provide(NodeServices.layer)),
    LOAD_TIMEOUT_MS,
  );

  it.effect(
    'rejects cases that are not a list, repeat a name or fill a slot the layout lacks',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const cases = [
            ["export default { name: 'full' };", 'is not a list of limit cases'],
            [
              "export default [{ name: 'a', frontmatter: {}, filled: [] }, { name: 'a', frontmatter: {}, filled: [] }];",
              'Two limit cases are named "a".',
            ],
            [
              "export default [{ name: 'a', frontmatter: {}, filled: ['footnote'] }];",
              'The case "a" fills "footnote", which is not a named slot of brief (it has aside).',
            ],
            [
              "export default [{ name: 'a', frontmatter: {}, filled: [], title: 'x' }];",
              'is not a list of limit cases',
            ],
          ] as const;
          for (const [text, message] of cases) {
            const load = yield* loadWith(`${text}\n`);
            expect(load).toMatchObject({ kind: 'problem', problem: { code: LIMITS_INVALID } });
            expect(load?.kind === 'problem' ? load.problem.message : '').toContain(message);
          }

          const filled = yield* loadWith(
            "export default [{ name: 'with-aside', frontmatter: { width: 'full' }, filled: ['aside'], body: false }];\n",
          );
          expect(filled).toMatchObject({ kind: 'cases', cases: [{ name: 'with-aside' }] });
        }),
      ).pipe(Effect.provide(NodeServices.layer)),
    LOAD_TIMEOUT_MS,
  );

  it.effect(
    'never runs a limits.ts during an agent turn',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const { root, dir } = yield* layoutFolder();
          fs.writeFileSync(
            path.join(dir, LIMITS_FILE),
            `Reflect.set(globalThis, '${MARKER}', true);\nexport default [];\n`,
          );
          const hold = holdCode([path.join(root, 'brands', 'wide-sans')]);
          const [load] = yield* loadLayoutLimits(
            [{ name: 'brief', contract: CONTRACT, dir }],
            root,
          );
          hold.release();
          resetCodeGate();
          expect(Reflect.get(globalThis, MARKER)).toBeUndefined();
          expect(load).toMatchObject({ kind: 'problem', problem: { code: 'layout-held' } });
        }),
      ).pipe(Effect.provide(NodeServices.layer)),
    LOAD_TIMEOUT_MS,
  );
});
