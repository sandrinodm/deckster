import { holdCode, resetCodeGate } from '@deckster/brand/node';
import { NodeFileSystem } from '@effect/platform-node';
import { expect, layer } from '@effect/vitest';
import { Effect, Schema } from 'effect';
import { rmSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach } from 'vite-plus/test';

import { checkContract } from '#layouts/check-contract.ts';
import {
  evaluateContracts,
  importContracts,
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
});
