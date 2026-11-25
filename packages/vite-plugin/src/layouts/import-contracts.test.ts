import { holdCode, resetCodeGate } from '@deckster/brand/node';
import { NodeFileSystem } from '@effect/platform-node';
import { expect, layer } from '@effect/vitest';
import { Effect, Schema } from 'effect';
import { rmSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'vite-plus/test';

import { checkContract } from '#layouts/check-contract.ts';
import {
  evaluateContracts,
  importContracts,
  isContractPackage,
  type ContractLoad,
} from '#layouts/import-contracts.ts';
import {
  contractRuns,
  contractSource,
  resetContractRuns,
  scratchRoot,
  writeFiles,
} from '#layouts/layout-workspace.fixture.ts';

/**
 * A helper in `_shared/` that exports a description.
 *
 * @param description - The exported text.
 */
function helperSource(description: string): string {
  return `export const DESCRIPTION = ${JSON.stringify(description)};\n`;
}

/**
 * A contract that takes its description from `_shared/helper.ts`.
 *
 * @param name - The layout name.
 */
function contractWithHelper(name: string): string {
  return contractSource(name, {
    imports: ["import { DESCRIPTION } from '../_shared/helper.ts';"],
    descriptionExpression: 'DESCRIPTION',
  });
}

/**
 * The absolute `contract.ts` of a brand layout in a scratch workspace.
 *
 * @param root - The workspace root.
 * @param name - The layout name.
 */
function contractFile(root: string, name: string): string {
  return path.join(root, 'brands', 'acme', 'layouts', name, 'contract.ts');
}

/**
 * The description of a loaded contract, or the outcome's kind when it did not load.
 *
 * @param load - One outcome.
 */
function descriptionOf(load: ContractLoad | undefined): unknown {
  return load?.kind === 'loaded' ? Reflect.get(Object(load.exported), 'description') : load?.kind;
}

/**
 * The problem of a failed load.
 *
 * @param load - One outcome.
 */
function problemOf(load: ContractLoad | undefined): { code: string; message: string } | undefined {
  return load?.kind === 'failed' ? load.problem : undefined;
}

/**
 * Waits a while.
 *
 * @param ms - How long, in milliseconds.
 */
function sleep(ms: number): Effect.Effect<void> {
  return Effect.promise(() => new Promise<void>((resolve) => setTimeout(resolve, ms)));
}

/**
 * Waits until a global is set, for at most ten seconds.
 *
 * @param key - The global's name.
 */
function waitForGlobal(key: string): Effect.Effect<void> {
  return Effect.gen(function* () {
    const deadline = Date.now() + 10_000;
    while (Reflect.get(globalThis, key) === undefined && Date.now() < deadline) {
      yield* sleep(5);
    }
  });
}

beforeEach(() => {
  resetCodeGate();
  resetContractRuns();
});

afterEach(() => {
  resetCodeGate();
});

layer(NodeFileSystem.layer)('importContracts', (it) => {
  it.effect('loads contracts with the caller’s effect, running only workspace files in Vite', () =>
    Effect.gen(function* () {
      const root = scratchRoot();
      writeFiles(root, {
        'brands/acme/layouts/_shared/helper.ts': helperSource('From the helper.'),
        'brands/acme/layouts/one/contract.ts': contractWithHelper('one'),
        'brands/acme/layouts/two/contract.ts': contractWithHelper('two'),
      });
      const files = [contractFile(root, 'one'), contractFile(root, 'two')];
      const { loads, inlined } = yield* Effect.promise(() => evaluateContracts(files, root));
      expect(loads.map(descriptionOf)).toEqual(['From the helper.', 'From the helper.']);
      const [first] = loads;
      const exported = first?.kind === 'loaded' ? Object(first.exported) : {};
      expect(Object.getPrototypeOf(Reflect.get(exported, 'schema'))).toBe(
        Object.getPrototypeOf(Schema.Struct({ a: Schema.String })),
      );
      expect(checkContract(exported)).toEqual([]);
      expect(inlined.map((file) => path.basename(path.dirname(file))).toSorted()).toEqual([
        '_shared',
        'one',
        'two',
      ]);
      expect(inlined.every((file) => !file.includes('node_modules'))).toBe(true);
      rmSync(root, { recursive: true, force: true });
    }),
  );

  it.effect('reads an edited contract and an edited helper on the next call', () =>
    Effect.gen(function* () {
      const root = scratchRoot();
      writeFiles(root, {
        'brands/acme/layouts/_shared/helper.ts': helperSource('First.'),
        'brands/acme/layouts/one/contract.ts': contractWithHelper('one'),
      });
      const files = [contractFile(root, 'one')];
      expect((yield* importContracts(files, { root })).map(descriptionOf)).toEqual(['First.']);
      writeFiles(root, { 'brands/acme/layouts/_shared/helper.ts': helperSource('Second.') });
      expect((yield* importContracts(files, { root })).map(descriptionOf)).toEqual(['Second.']);
      rmSync(root, { recursive: true, force: true });
    }),
  );

  it.effect('rejects imports a contract may not have, before anything runs', () =>
    Effect.gen(function* () {
      const root = scratchRoot();
      /**
       * A contract with one extra import line.
       *
       * @param line - The import.
       */
      const withImport = (line: string) => contractSource('x', { imports: [line] });
      writeFiles(root, {
        'brands/acme/layouts/_shared/helper.ts': "import '../other/secret.ts';\n",
        'brands/acme/layouts/other/secret.ts': 'export const SECRET = 1;\n',
        'brands/acme/layouts/tsx/contract.ts': withImport("import './layout.tsx';"),
        'brands/acme/layouts/tsx/layout.tsx': 'export default 1;\n',
        'brands/acme/layouts/css/contract.ts': withImport("import './layout.css';"),
        'brands/acme/layouts/escape/contract.ts': withImport("import '../../brand.ts';"),
        'brands/acme/brand.ts': 'export default {};\n',
        'brands/acme/layouts/node/contract.ts': withImport("import fs from 'node:fs';"),
        'brands/acme/layouts/react/contract.ts': withImport("import React from 'react';"),
        'brands/acme/layouts/dynamic/contract.ts': withImport(
          "const target = './x.ts';\nawait import(target);",
        ),
        'brands/acme/layouts/deep/contract.ts': withImport("import '../_shared/helper.ts';"),
        'brands/acme/layouts/missing/contract.ts': withImport("import './nowhere.ts';"),
      });
      const names = ['tsx', 'css', 'escape', 'node', 'react', 'dynamic', 'deep', 'missing'];
      const loads = yield* importContracts(
        names.map((name) => contractFile(root, name)),
        { root },
      );
      expect(loads.map((load) => problemOf(load)?.code)).toEqual(
        names.map(() => 'layout-contract-imports'),
      );
      expect(loads.map((load) => problemOf(load)?.message)).toEqual([
        'brands/acme/layouts/tsx/contract.ts imports "./layout.tsx", which is not a .ts file.',
        'brands/acme/layouts/css/contract.ts imports "./layout.css", which is not a .ts file.',
        'brands/acme/layouts/escape/contract.ts imports "../../brand.ts", which is outside the ' +
          "layout's own folder and layouts/_shared/.",
        'brands/acme/layouts/node/contract.ts imports "node:fs", which a contract may not import.',
        'brands/acme/layouts/react/contract.ts imports "react", which a contract may not import.',
        'brands/acme/layouts/dynamic/contract.ts has a dynamic import whose target is not one ' +
          'plain string.',
        'brands/acme/layouts/_shared/helper.ts imports "../other/secret.ts", which is outside ' +
          "the layout's own folder and layouts/_shared/.",
        'brands/acme/layouts/missing/contract.ts imports "./nowhere.ts", which does not exist.',
      ]);
      expect(contractRuns()).toBe(0);
      rmSync(root, { recursive: true, force: true });
    }),
  );

  it.effect('allows type-only imports of files a contract may not run', () =>
    Effect.gen(function* () {
      const root = scratchRoot();
      writeFiles(root, {
        'brands/acme/layouts/one/layout.tsx': 'export type Props = { a: string };\n',
        'brands/acme/layouts/one/contract.ts': contractSource('one', {
          imports: [
            "import type { Props } from './layout.tsx';",
            "import type { BrandTokens } from '@deckster/brand';",
            'export type Both = Props | BrandTokens;',
          ],
        }),
      });
      const loads = yield* importContracts([contractFile(root, 'one')], { root });
      expect(loads.map(descriptionOf)).toEqual(['Columns.']);
      rmSync(root, { recursive: true, force: true });
    }),
  );

  it.effect('reports a contract that throws, has no default export or does not exist', () =>
    Effect.gen(function* () {
      const root = scratchRoot();
      writeFiles(root, {
        'brands/acme/layouts/throws/contract.ts': "throw new Error('boom');\n",
        'brands/acme/layouts/named/contract.ts': 'export const contract = 1;\n',
        'brands/acme/layouts/fine/contract.ts': contractSource('fine'),
      });
      const names = ['throws', 'named', 'gone', 'fine'];
      const loads = yield* importContracts(
        names.map((name) => contractFile(root, name)),
        { root },
      );
      expect(loads.map((load) => problemOf(load)?.code ?? load.kind)).toEqual([
        'layout-load-failed',
        'layout-load-failed',
        'layout-load-failed',
        'loaded',
      ]);
      expect(problemOf(loads[0])?.message).toBe('Loading it failed: boom');
      expect(problemOf(loads[1])?.message).toBe('It has no default export.');
      expect(problemOf(loads[2])?.message).toBe(
        'There is no brands/acme/layouts/gone/contract.ts.',
      );
      rmSync(root, { recursive: true, force: true });
    }),
  );

  it.effect('leaves NODE_ENV as it found it', () =>
    Effect.gen(function* () {
      const root = scratchRoot();
      writeFiles(root, { 'brands/acme/layouts/one/contract.ts': contractSource('one') });
      const before = process.env.NODE_ENV;
      delete process.env.NODE_ENV;
      yield* importContracts([contractFile(root, 'one')], { root });
      const after = process.env.NODE_ENV;
      process.env.NODE_ENV = before;
      expect(after).toBeUndefined();
      rmSync(root, { recursive: true, force: true });
    }),
  );
});

/**
 * The global an outside file sets when it runs, so a test can prove it never ran.
 */
const OUTSIDE_RAN_KEY = '__decksterOutsideRan';

/**
 * A file outside the layout folders that records that it ran.
 */
const OUTSIDE_SOURCE = `Reflect.set(globalThis, '${OUTSIDE_RAN_KEY}', true);\nexport const X = 1;\n`;

/**
 * Whether the outside file ran.
 */
function outsideRan(): boolean {
  return Reflect.get(globalThis, OUTSIDE_RAN_KEY) === true;
}

layer(NodeFileSystem.layer)('importContracts against ways around the import check', (it) => {
  it.effect('rejects import.meta.glob, Vite runner names and query specifiers', () =>
    Effect.gen(function* () {
      Reflect.deleteProperty(globalThis, OUTSIDE_RAN_KEY);
      const root = scratchRoot();
      /**
       * A contract with extra lines above it.
       *
       * @param line - The lines.
       */
      const withLine = (line: string) => contractSource('x', { imports: [line] });
      writeFiles(root, {
        'outside/evil.ts': OUTSIDE_SOURCE,
        'brands/acme/layouts/glob/contract.ts': withLine(
          "const mods = import.meta.glob('../../../../outside/*.ts', { eager: true });",
        ),
        'brands/acme/layouts/runner/contract.ts': withLine(
          "await __vite_ssr_dynamic_import__('../../../../outside/evil.ts');",
        ),
        'brands/acme/layouts/query/helper.ts': 'export const Y = 1;\n',
        'brands/acme/layouts/query/contract.ts': withLine(
          "import '../../../../outside/evil.ts?/../../brands/acme/layouts/query/helper.ts';",
        ),
      });
      const names = ['glob', 'runner', 'query'];
      const loads = yield* importContracts(
        names.map((name) => contractFile(root, name)),
        { root },
      );
      expect(loads.map((load) => problemOf(load)?.code)).toEqual(
        names.map(() => 'layout-contract-imports'),
      );
      expect(problemOf(loads[0])?.message).toContain('uses import.meta.glob');
      expect(problemOf(loads[1])?.message).toContain('__vite_ssr_dynamic_import__');
      expect(problemOf(loads[2])?.message).toContain('has a query or a hash');
      expect(outsideRan()).toBe(false);
      expect(contractRuns()).toBe(0);
      rmSync(root, { recursive: true, force: true });
    }),
  );

  it.effect('refuses to run a file the import check did not see, or a Node built-in', () =>
    Effect.gen(function* () {
      Reflect.deleteProperty(globalThis, OUTSIDE_RAN_KEY);
      const root = scratchRoot();
      // Direct eval reaches the runner's own import function without naming it in the source.
      const runner = "eval('__vite_' + 'ssr_dynamic_import__')";
      writeFiles(root, {
        'outside/evil.ts': OUTSIDE_SOURCE,
        'brands/acme/layouts/file/contract.ts': contractSource('file', {
          imports: [`await ${runner}('../../../../outside/evil.ts');`],
        }),
        'brands/acme/layouts/builtin/contract.ts': contractSource('builtin', {
          imports: [`await ${runner}('node:child_process');`],
        }),
        'brands/acme/layouts/fine/contract.ts': contractSource('fine'),
      });
      const names = ['file', 'builtin', 'fine'];
      const loads = yield* importContracts(
        names.map((name) => contractFile(root, name)),
        { root },
      );
      expect(loads.map((load) => problemOf(load)?.code ?? load.kind)).toEqual([
        'layout-load-failed',
        'layout-load-failed',
        'loaded',
      ]);
      expect(problemOf(loads[0])?.message).toContain('was not checked');
      expect(problemOf(loads[1])?.message).toContain('node:child_process');
      expect(outsideRan()).toBe(false);
      rmSync(root, { recursive: true, force: true });
    }),
  );

  it.effect('checks the imports of a linked helper from where the link points', () =>
    Effect.gen(function* () {
      const root = scratchRoot();
      writeFiles(root, {
        'brands/acme/layouts/_shared/helper.ts': "export * from './sibling.ts';\n",
        'brands/acme/layouts/_shared/sibling.ts': "import 'node:fs';\nexport const S = 1;\n",
        'brands/acme/layouts/one/sibling.ts': 'export const S = 1;\n',
        'brands/acme/layouts/one/contract.ts': contractSource('one', {
          imports: ["import './helper.ts';"],
        }),
      });
      symlinkSync(
        path.join(root, 'brands/acme/layouts/_shared/helper.ts'),
        path.join(root, 'brands/acme/layouts/one/helper.ts'),
      );
      const [load] = yield* importContracts([contractFile(root, 'one')], { root });
      expect(problemOf(load)).toEqual(
        expect.objectContaining({
          code: 'layout-contract-imports',
          message:
            'brands/acme/layouts/_shared/sibling.ts imports "node:fs", which a contract may not ' +
            'import.',
        }),
      );
      expect(contractRuns()).toBe(0);
      rmSync(root, { recursive: true, force: true });
    }),
  );

  it.effect('reports a contract whose top-level await never settles, and loads the rest', () =>
    Effect.gen(function* () {
      const root = scratchRoot();
      writeFiles(root, {
        'brands/acme/layouts/hangs/contract.ts': contractSource('hangs', {
          imports: ['await new Promise(() => {});'],
        }),
        'brands/acme/layouts/fine/contract.ts': contractSource('fine'),
      });
      const loads = yield* importContracts(
        [contractFile(root, 'hangs'), contractFile(root, 'fine')],
        { root, timeoutMs: 300 },
      );
      expect(loads.map((load) => problemOf(load)?.code ?? load.kind)).toEqual([
        'layout-load-failed',
        'loaded',
      ]);
      expect(problemOf(loads[0])?.message).toContain('did not finish loading');
      rmSync(root, { recursive: true, force: true });
    }),
  );

  it.effect('gives the whole batch one deadline, so hung contracts do not add up', () =>
    Effect.gen(function* () {
      const root = scratchRoot();
      const hung = ['one', 'two', 'three'];
      writeFiles(root, {
        ...Object.fromEntries(
          hung.map((name) => [
            `brands/acme/layouts/${name}/contract.ts`,
            contractSource(name, { imports: ['await new Promise(() => {});'] }),
          ]),
        ),
        'brands/acme/layouts/fine/contract.ts': contractSource('fine'),
      });
      const timeoutMs = 600;
      const started = Date.now();
      const loads = yield* importContracts(
        [...hung, 'fine'].map((name) => contractFile(root, name)),
        { root, timeoutMs },
      );
      const elapsed = Date.now() - started;
      expect(loads.map((load) => problemOf(load)?.code ?? load.kind)).toEqual([
        'layout-load-failed',
        'layout-load-failed',
        'layout-load-failed',
        'loaded',
      ]);
      for (const load of loads.slice(0, hung.length)) {
        expect(problemOf(load)?.message).toContain('did not finish loading');
      }

      expect(elapsed).toBeLessThan(timeoutMs * 2);
      rmSync(root, { recursive: true, force: true });
    }),
  );

  it.effect('lets a timed-out contract that wakes up later load nothing and change nothing', () =>
    Effect.gen(function* () {
      const root = scratchRoot();
      writeFiles(root, {
        'brands/acme/layouts/late/late.ts': "Reflect.set(globalThis, 'decksterLateRan', true);\n",
        'brands/acme/layouts/late/contract.ts': contractSource('late', {
          imports: [
            'await new Promise((resolve) => setTimeout(resolve, 400));',
            "await import('./late.ts');",
          ],
        }),
      });
      const files = [contractFile(root, 'late')];
      const [load] = yield* importContracts(files, { root, timeoutMs: 150 });
      expect(problemOf(load)?.message).toContain('did not finish loading');
      yield* sleep(700);
      expect(Reflect.get(globalThis, 'decksterLateRan')).toBeUndefined();
      expect(contractRuns()).toBe(0);
      const hold = holdCode([path.join(root, 'brands', 'acme')]);
      expect((yield* importContracts(files, { root })).map((entry) => entry.kind)).toEqual([
        'held',
      ]);
      hold.release();
      rmSync(root, { recursive: true, force: true });
    }),
  );

  it.effect('leaves NODE_ENV as it found it when loads overlap', () =>
    Effect.gen(function* () {
      const root = scratchRoot();
      writeFiles(root, {
        'brands/acme/layouts/one/contract.ts': contractSource('one'),
        'brands/acme/layouts/slow/contract.ts': contractSource('slow', {
          imports: ['await new Promise((resolve) => setTimeout(resolve, 300));'],
        }),
      });
      const before = process.env.NODE_ENV;
      delete process.env.NODE_ENV;
      const first = evaluateContracts([contractFile(root, 'one')], root);
      const deadline = Date.now() + 10_000;
      while (process.env.NODE_ENV === undefined && Date.now() < deadline) {
        yield* Effect.promise(() => new Promise((resolve) => setTimeout(resolve, 1)));
      }

      const second = evaluateContracts([contractFile(root, 'slow')], root);
      yield* Effect.promise(() => first);
      yield* Effect.promise(() => second);
      const after = process.env.NODE_ENV;
      process.env.NODE_ENV = before;
      expect(after).toBeUndefined();
      rmSync(root, { recursive: true, force: true });
    }),
  );
});

describe('isContractPackage', () => {
  it('allows the listed packages and effect entry points, and nothing else', () => {
    expect(isContractPackage('@deckster/engine/layout')).toBe(true);
    expect(isContractPackage('effect/Schema')).toBe(true);
    expect(isContractPackage('@deckster/engine')).toBe(false);
    expect(isContractPackage('node:fs')).toBe(false);
    expect(isContractPackage('./helper.ts')).toBe(false);
  });
});

layer(NodeFileSystem.layer)('importContracts during an agent turn', (it) => {
  it.effect('never evaluates a contract changed during the turn, and keeps its last value', () =>
    Effect.gen(function* () {
      const root = scratchRoot();
      writeFiles(root, {
        'brands/acme/layouts/one/contract.ts': contractSource('one', { description: 'Before.' }),
      });
      const files = [contractFile(root, 'one')];
      const [before] = yield* importContracts(files, { root });
      expect(contractRuns()).toBe(1);
      const hold = holdCode([path.join(root, 'brands', 'acme')]);
      writeFiles(root, {
        'brands/acme/layouts/one/contract.ts': contractSource('one', { description: 'Changed.' }),
      });
      const [during] = yield* importContracts(files, { root });
      expect(descriptionOf(during)).toBe('Before.');
      expect(during?.kind === 'loaded' && before?.kind === 'loaded').toBe(true);
      expect(Reflect.get(during ?? {}, 'exported')).toBe(Reflect.get(before ?? {}, 'exported'));
      expect(contractRuns()).toBe(1);
      hold.release();
      const [after] = yield* importContracts(files, { root });
      expect(descriptionOf(after)).toBe('Changed.');
      expect(contractRuns()).toBe(2);
      rmSync(root, { recursive: true, force: true });
    }),
  );

  it.effect('never evaluates a helper changed during the turn', () =>
    Effect.gen(function* () {
      const root = scratchRoot();
      writeFiles(root, {
        'brands/acme/layouts/_shared/helper.ts': helperSource('Before.'),
        'brands/acme/layouts/one/contract.ts': contractWithHelper('one'),
      });
      const files = [contractFile(root, 'one')];
      yield* importContracts(files, { root });
      const hold = holdCode([path.join(root, 'brands', 'acme')]);
      writeFiles(root, {
        'brands/acme/layouts/_shared/helper.ts':
          "Reflect.set(globalThis, 'decksterHelperRan', true);\n" + helperSource('Changed.'),
      });
      const [during] = yield* importContracts(files, { root });
      expect(descriptionOf(during)).toBe('Before.');
      expect(contractRuns()).toBe(1);
      expect(Reflect.get(globalThis, 'decksterHelperRan')).toBeUndefined();
      hold.release();
      rmSync(root, { recursive: true, force: true });
    }),
  );

  it.effect('answers held for a contract first seen during the turn, without running it', () =>
    Effect.gen(function* () {
      const root = scratchRoot();
      const hold = holdCode([path.join(root, 'decks', 'talk')]);
      writeFiles(root, {
        'decks/talk/layouts/new/contract.ts': contractSource('new'),
        'decks/talk/layouts/bad/contract.ts': contractSource('bad', {
          imports: ["import 'node:fs';"],
        }),
      });
      const files = ['new', 'bad'].map((name) =>
        path.join(root, 'decks', 'talk', 'layouts', name, 'contract.ts'),
      );
      const loads = yield* importContracts(files, { root });
      expect(loads.map((load) => load.kind)).toEqual(['held', 'held']);
      expect(contractRuns()).toBe(0);
      const evaluation = yield* Effect.promise(() => evaluateContracts(files, root));
      expect(evaluation.loads.map((load) => load.kind)).toEqual(['held', 'held']);
      expect(contractRuns()).toBe(0);
      hold.release();
      const [released] = yield* importContracts(files, { root });
      expect(released?.kind).toBe('loaded');
      expect(contractRuns()).toBe(1);
      rmSync(root, { recursive: true, force: true });
    }),
  );

  it.effect('holds only the contracts under the held folders', () =>
    Effect.gen(function* () {
      const root = scratchRoot();
      writeFiles(root, {
        'brands/acme/layouts/one/contract.ts': contractSource('one'),
        'decks/talk/layouts/two/contract.ts': contractSource('two'),
      });
      const hold = holdCode([path.join(root, 'decks', 'talk')]);
      const loads = yield* importContracts(
        [
          contractFile(root, 'one'),
          path.join(root, 'decks', 'talk', 'layouts', 'two', 'contract.ts'),
        ],
        { root },
      );
      expect(loads.map((load) => load.kind)).toEqual(['loaded', 'held']);
      expect(contractRuns()).toBe(1);
      hold.release();
      rmSync(root, { recursive: true, force: true });
    }),
  );

  it.effect(
    'forgets the value of a contract that is gone, so a new file is not answered by it',
    () =>
      Effect.gen(function* () {
        const root = scratchRoot();
        writeFiles(root, { 'brands/acme/layouts/one/contract.ts': contractSource('one') });
        const files = [contractFile(root, 'one')];
        yield* importContracts(files, { root });
        rmSync(contractFile(root, 'one'));
        expect((yield* importContracts(files, { root })).map((load) => load.kind)).toEqual([
          'failed',
        ]);
        const hold = holdCode([path.join(root, 'brands', 'acme')]);
        writeFiles(root, { 'brands/acme/layouts/one/contract.ts': contractSource('one') });
        expect((yield* importContracts(files, { root })).map((load) => load.kind)).toEqual([
          'held',
        ]);
        hold.release();
        /**
         * The kind of each outcome.
         *
         * @param loads - The outcomes.
         */
        const kinds = (loads: readonly ContractLoad[]) => loads.map((load) => load.kind);
        expect(kinds(yield* importContracts(files, { root }))).toEqual(['loaded']);

        const again = holdCode([path.join(root, 'brands', 'acme')]);
        rmSync(contractFile(root, 'one'));
        expect(kinds(yield* importContracts(files, { root }))).toEqual(['failed']);
        writeFiles(root, { 'brands/acme/layouts/one/contract.ts': contractSource('one') });
        expect(kinds(yield* importContracts(files, { root }))).toEqual(['held']);
        expect(contractRuns()).toBe(2);
        again.release();
        rmSync(root, { recursive: true, force: true });
      }),
  );

  it.effect('stops a contract whose evaluation was under way when the turn began', () =>
    Effect.gen(function* () {
      const root = scratchRoot();
      writeFiles(root, {
        'brands/acme/layouts/one/slow.ts':
          "Reflect.set(globalThis, 'decksterSlowStarted', true);\n" +
          'await new Promise((resolve) => setTimeout(resolve, 300));\n',
        'brands/acme/layouts/_shared/helper.ts': helperSource('Before.'),
        'brands/acme/layouts/one/contract.ts': contractSource('one', {
          imports: ["import './slow.ts';", "import { DESCRIPTION } from '../_shared/helper.ts';"],
          descriptionExpression: 'DESCRIPTION',
        }),
      });
      const files = [contractFile(root, 'one')];
      const [before] = yield* importContracts(files, { root });
      expect(descriptionOf(before)).toBe('Before.');
      expect(contractRuns()).toBe(1);

      Reflect.deleteProperty(globalThis, 'decksterSlowStarted');
      const pending = Effect.runPromise(
        importContracts(files, { root }).pipe(Effect.provide(NodeFileSystem.layer)),
      );
      yield* waitForGlobal('decksterSlowStarted');
      const hold = holdCode([path.join(root, 'brands', 'acme')]);
      writeFiles(root, {
        'brands/acme/layouts/_shared/helper.ts':
          "Reflect.set(globalThis, 'decksterHelperRan', true);\n" + helperSource('Changed.'),
      });
      const [during] = yield* Effect.promise(() => pending);
      expect(descriptionOf(during)).toBe('Before.');
      expect(Reflect.get(globalThis, 'decksterHelperRan')).toBeUndefined();
      expect(contractRuns()).toBe(1);

      hold.release();
      const [after] = yield* importContracts(files, { root });
      expect(descriptionOf(after)).toBe('Changed.');
      expect(contractRuns()).toBe(2);
      Reflect.deleteProperty(globalThis, 'decksterHelperRan');
      Reflect.deleteProperty(globalThis, 'decksterSlowStarted');
      rmSync(root, { recursive: true, force: true });
    }),
  );
});
