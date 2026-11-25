import { holdCode, resetCodeGate } from '@deckster/brand/node';
import { NodeFileSystem } from '@effect/platform-node';
import { expect, layer } from '@effect/vitest';
import { Effect, FileSystem, Schema } from 'effect';
import { fork } from 'node:child_process';
import { existsSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, it, vi } from 'vite-plus/test';

import { checkContract } from '#layouts/check-contract.ts';
import { checkProcessArguments, watchCheckProcesses } from '#layouts/contract-check.ts';
import {
  CONTRACT_TIMEOUT_MS,
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
      const hung = ['one', 'two', 'three', 'four'];
      writeFiles(root, {
        ...Object.fromEntries(
          hung.map((name) => [
            `brands/acme/layouts/${name}/contract.ts`,
            contractSource(name, { imports: ['await new Promise(() => {});'] }),
          ]),
        ),
        'brands/acme/layouts/fine/contract.ts': contractSource('fine'),
      });
      // Long enough that the check process's startup on a slow CI runner stays well inside the
      // margin between one deadline and the four that serial deadlines would add up to.
      const timeoutMs = 1500;
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
        'layout-load-failed',
        'loaded',
      ]);
      for (const load of loads.slice(0, hung.length)) {
        expect(problemOf(load)?.message).toContain('did not finish loading');
      }

      // Four hung contracts cost one deadline, not four; the check process's startup comes on top.
      expect(elapsed).toBeLessThan(timeoutMs * 2.5);
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

/**
 * Whether a process is still running.
 *
 * @param pid - The process id.
 */
function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Collects the ids of the check processes that start until the returned function is called.
 */
function collectCheckProcesses(): { readonly pids: number[]; readonly stop: () => void } {
  const pids: number[] = [];
  const stop = watchCheckProcesses((pid) => pids.push(pid));
  return { pids, stop };
}

layer(NodeFileSystem.layer)('importContracts in the check process', (it) => {
  it.effect(
    'kills a contract that never stops running at the deadline, and never runs it here',
    () =>
      Effect.gen(function* () {
        const root = scratchRoot();
        writeFiles(root, {
          'brands/acme/layouts/spins/contract.ts': contractSource('spins', {
            imports: ['while (Date.now() > 0) {}'],
          }),
          'brands/acme/layouts/sleeps/contract.ts': contractSource('sleeps', {
            imports: ['await new Promise((resolve) => setTimeout(resolve, 60_000));'],
          }),
        });
        const checks = collectCheckProcesses();
        const started = Date.now();
        const loads = yield* importContracts(
          [contractFile(root, 'spins'), contractFile(root, 'sleeps')],
          { root, timeoutMs: 500 },
        );
        checks.stop();
        expect(Date.now() - started).toBeLessThan(CONTRACT_TIMEOUT_MS);
        expect(loads.map((load) => problemOf(load)?.message)).toEqual([
          expect.stringContaining('did not finish loading within 500 ms'),
          expect.stringContaining('did not finish loading within 500 ms'),
        ]);
        expect(checks.pids).toHaveLength(1);
        expect(checks.pids.filter((pid) => isRunning(pid))).toEqual([]);
        expect(contractRuns()).toBe(0);
        rmSync(root, { recursive: true, force: true });
      }),
  );

  it.effect('does not believe a contract that tells the server it loaded', () =>
    Effect.gen(function* () {
      const root = scratchRoot();
      const file = contractFile(root, 'forges');
      writeFiles(root, {
        // Says it loaded, through the internal the public `process.send` calls, then never ends:
        // were the forged message believed, this process would run the loop and hang.
        'brands/acme/layouts/forges/contract.ts': contractSource('forges', {
          imports: [
            `const forged = { type: 'loaded', file: ${JSON.stringify(file)} };`,
            'try { process._send(forged, undefined, {}, () => {}); } catch {}',
            'while (Date.now() > 0) {}',
          ],
        }),
      });
      const [load] = yield* importContracts([file], {
        root,
        timeoutMs: 500,
      });
      expect(problemOf(load)?.message).toContain('did not finish loading');
      expect(contractRuns()).toBe(0);
      rmSync(root, { recursive: true, force: true });
    }),
  );

  it.effect('refuses a contract that reaches for Node, even when it catches the error', () =>
    Effect.gen(function* () {
      const root = scratchRoot();
      const written = path.join(root, 'written.txt');
      /**
       * A contract that runs a statement and swallows what it throws.
       *
       * @param name - The layout name.
       * @param statement - The statement.
       */
      const swallowing = (name: string, statement: string) =>
        contractSource(name, { imports: [`try { ${statement} } catch {}`] });
      writeFiles(root, {
        'brands/acme/layouts/writes/contract.ts': swallowing(
          'writes',
          `process.getBuiltinModule('node:fs').writeFileSync(${JSON.stringify(written)}, 'x');`,
        ),
        'brands/acme/layouts/spawns/contract.ts': swallowing(
          'spawns',
          "process.getBuiltinModule('node:child_process').execSync('true');",
        ),
        'brands/acme/layouts/imports/contract.ts': swallowing(
          'imports',
          "await eval('imp' + 'ort(\"node:fs\")');",
        ),
        'brands/acme/layouts/fetches/contract.ts': swallowing(
          'fetches',
          "await fetch('http://127.0.0.1:9');",
        ),
        'brands/acme/layouts/exits/contract.ts': swallowing('exits', 'process.exit(0);'),
        // Imports every package a contract may import, as values.
        'brands/acme/layouts/packages/contract.ts': contractSource('packages', {
          imports: [
            "import { contrastRatio } from '@deckster/brand';",
            "import { deckCommand } from '@deckster/engine/command';",
            "import { EyebrowField } from '@deckster/kit/layout-fields';",
            "import * as Option from 'effect/Option';",
            'export const USED = [contrastRatio, deckCommand, EyebrowField, Option.none()];',
          ],
        }),
        'brands/acme/layouts/fine/contract.ts': contractSource('fine'),
      });
      const names = ['writes', 'spawns', 'imports', 'fetches', 'exits', 'packages', 'fine'];
      const loads = yield* importContracts(
        names.map((name) => contractFile(root, name)),
        { root },
      );
      expect(loads.map((load) => problemOf(load)?.message ?? load.kind)).toEqual([
        'Loading it was refused: It used `process.getBuiltinModule`, which a contract may not use.',
        'Loading it was refused: It used `process.getBuiltinModule`, which a contract may not use.',
        'Loading it was refused: It used `import("node:fs")`, which a contract may not use.',
        'Loading it was refused: It used `fetch`, which a contract may not use.',
        'Loading it was refused: It used `process.exit`, which a contract may not use.',
        'loaded',
        'loaded',
      ]);
      expect(existsSync(written)).toBe(false);
      expect(contractRuns()).toBe(2);
      rmSync(root, { recursive: true, force: true });
    }),
  );
});

describe('the check process', () => {
  it('starts the check process without the right to write, spawn, use workers or the network', async () => {
    const root = realpathSync(scratchRoot());
    const probe = path.join(root, 'probe.mjs');
    const written = path.join(root, 'written.txt');
    writeFiles(root, {
      'probe.mjs': [
        'const attempts = {',
        `  write: () => process.getBuiltinModule('node:fs').writeFileSync(${JSON.stringify(written)}, 'x'),`,
        "  spawn: () => process.getBuiltinModule('node:child_process').execSync('true'),",
        "  worker: () => new (process.getBuiltinModule('node:worker_threads').Worker)('', { eval: true }),",
        '  net: () =>',
        '    new Promise((resolve, reject) => {',
        "      const socket = process.getBuiltinModule('node:net').connect(9, '127.0.0.1');",
        "      socket.once('connect', resolve).once('error', reject);",
        '    }),',
        "  read: () => process.getBuiltinModule('node:fs').readFileSync('/etc/hosts'),",
        '};',
        'const codes = {};',
        'for (const [name, attempt] of Object.entries(attempts)) {',
        '  try { await attempt(); codes[name] = "allowed"; } catch (error) { codes[name] = error.code; }',
        '}',
        'process.send(codes);',
        '',
      ].join('\n'),
    });
    const codes = await new Promise((resolve, reject) => {
      const child = fork(probe, [], {
        execArgv: [...checkProcessArguments(), `--allow-fs-read=${probe}`],
        env: {},
        stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      });
      child.once('message', resolve);
      child.once('error', reject);
      child.once('exit', (code) => {
        reject(new Error(`The probe ended with ${String(code)}.`));
      });
    });
    const denied = 'ERR_ACCESS_DENIED';
    expect(codes).toEqual({
      write: denied,
      spawn: denied,
      worker: denied,
      net: denied,
      read: denied,
    });
    expect(existsSync(written)).toBe(false);
    rmSync(root, { recursive: true, force: true });
  });
});

layer(NodeFileSystem.layer)('importContracts in the check process during an agent turn', (it) => {
  it.effect('kills the check process when a turn holds a contract, and loads the others', () =>
    Effect.gen(function* () {
      const root = scratchRoot();
      writeFiles(root, {
        'brands/acme/layouts/spins/contract.ts': contractSource('spins', {
          imports: ['while (Date.now() > 0) {}'],
        }),
        // Still waiting when the other contract starts spinning, so it is checked again.
        'decks/talk/layouts/fine/contract.ts': contractSource('fine', {
          imports: ['await new Promise((resolve) => setTimeout(resolve, 200));'],
        }),
      });
      const files = [
        contractFile(root, 'spins'),
        path.join(root, 'decks', 'talk', 'layouts', 'fine', 'contract.ts'),
      ];
      const checks = collectCheckProcesses();
      const started = Date.now();
      const pending = Effect.runPromise(
        importContracts(files, { root }).pipe(Effect.provide(NodeFileSystem.layer)),
      );
      while (checks.pids.length === 0) {
        yield* sleep(5);
      }

      yield* sleep(400);
      const hold = holdCode([path.join(root, 'brands', 'acme')]);
      const loads = yield* Effect.promise(() => pending);
      checks.stop();
      expect(Date.now() - started).toBeLessThan(CONTRACT_TIMEOUT_MS);
      expect(loads.map((load) => load.kind)).toEqual(['held', 'loaded']);
      expect(checks.pids).toHaveLength(2);
      expect(checks.pids.filter((pid) => isRunning(pid))).toEqual([]);
      expect(contractRuns()).toBe(1);
      hold.release();
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

describe('contract source and publication', () => {
  /**
   * Loads the named layout's contract in the scratch workspace.
   *
   * @param root - The scratch workspace.
   */
  const loadOne = (root: string): Promise<readonly ContractLoad[]> =>
    Effect.runPromise(
      importContracts([contractFile(root, 'one')], { root }).pipe(
        Effect.provide(NodeFileSystem.layer),
      ),
    );

  it('keeps VITE_ variables out of the check process and server imports', async () => {
    const root = scratchRoot();
    vi.stubEnv('VITE_DECKSTER_CONTRACT_MARKER', 'Only in the host environment.');
    try {
      writeFiles(root, {
        'brands/acme/layouts/one/contract.ts': contractSource('one', {
          imports: [
            'if (import.meta.env.VITE_DECKSTER_CONTRACT_MARKER !== undefined) {',
            "  throw new Error('VITE_ variable leaked into the contract');",
            '}',
          ],
        }),
      });
      const [load] = await loadOne(root);
      expect(load).toMatchObject({ kind: 'loaded' });
    } finally {
      vi.unstubAllEnvs();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it.each([
    ['with no further imports', []],
    ['before a later dynamic import', ["await import('./after.ts');"]],
  ])('drops a contract that resumes after a short hold %s', async (_case, imports) => {
    const root = scratchRoot();
    /**
     * Resumes the in-process evaluation when the test has released the hold.
     */
    let resume = () => {};
    const pause = new Promise<void>((resolve) => {
      resume = resolve;
    });
    const pauseKey = 'decksterPauseContractPublication';
    const startedKey = 'decksterContractPublicationStarted';
    const helperKey = 'decksterPostHoldHelperRan';
    Reflect.set(globalThis, pauseKey, () => {
      Reflect.set(globalThis, startedKey, true);
      return pause;
    });
    try {
      writeFiles(root, {
        'brands/acme/layouts/one/after.ts': `Reflect.set(globalThis, '${helperKey}', true);\n`,
        'brands/acme/layouts/one/contract.ts': contractSource('one', {
          imports: [`await Reflect.get(globalThis, '${pauseKey}')?.();`, ...imports],
        }),
      });
      const pending = loadOne(root);
      await Effect.runPromise(waitForGlobal(startedKey));
      expect(Reflect.get(globalThis, startedKey)).toBe(true);
      const hold = holdCode([path.join(root, 'brands', 'acme')]);
      hold.release();
      resume();

      const [load] = await pending;
      expect(load?.kind).toBe('held');
      expect(Reflect.get(globalThis, helperKey)).toBeUndefined();

      const nextHold = holdCode([path.join(root, 'brands', 'acme')]);
      try {
        const [held] = await loadOne(root);
        expect(held?.kind).toBe('held');
      } finally {
        nextHold.release();
      }
    } finally {
      resume();
      Reflect.deleteProperty(globalThis, pauseKey);
      Reflect.deleteProperty(globalThis, startedKey);
      Reflect.deleteProperty(globalThis, helperKey);
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('evaluates the same helper text that was scanned even if the file changes', async () => {
    const root = scratchRoot();
    const helper = 'brands/acme/layouts/_shared/helper.ts';
    const stop = watchCheckProcesses(() => {
      stop();
      writeFiles(root, { [helper]: helperSource('Changed after the scan.') });
    });
    try {
      writeFiles(root, {
        [helper]: helperSource('Scanned text.'),
        'brands/acme/layouts/one/contract.ts': contractWithHelper('one'),
      });
      const [first] = await loadOne(root);
      expect(descriptionOf(first)).toBe('Scanned text.');
      const [second] = await loadOne(root);
      expect(descriptionOf(second)).toBe('Changed after the scan.');
    } finally {
      stop();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it.each([
    ['its own path', false],
    ['a symlink to it', true],
  ])(
    'discards scanned source if a hold of %s begins and ends during the scan',
    async (_, alias) => {
      const root = scratchRoot();
      const heldRoot = alias ? `${root}-alias` : root;
      const helper = 'brands/acme/layouts/_shared/helper.ts';
      const before = 'Before the turn.';
      try {
        if (alias) {
          symlinkSync(root, heldRoot, 'dir');
        }

        writeFiles(root, {
          [helper]: helperSource(before),
          'brands/acme/layouts/one/contract.ts': contractWithHelper('one'),
        });
        const readDuringHold = Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const heldFile = realpathSync(path.join(root, helper));
          const heldRead: FileSystem.FileSystem = {
            ...fs,
            readFileString: (file, encoding) => {
              if (file !== heldFile) {
                return fs.readFileString(file, encoding);
              }

              return Effect.sync(() => {
                const hold = holdCode([path.join(heldRoot, 'brands', 'acme')]);
                hold.release();
                return helperSource('During the turn.');
              });
            },
          };
          return yield* importContracts([contractFile(root, 'one')], { root }).pipe(
            Effect.provideService(FileSystem.FileSystem, heldRead),
          );
        });
        const [interrupted] = await Effect.runPromise(
          readDuringHold.pipe(Effect.provide(NodeFileSystem.layer)),
        );
        expect(interrupted?.kind).toBe('held');
        expect(contractRuns()).toBe(0);
        const [loaded] = await loadOne(root);
        expect(descriptionOf(loaded)).toBe(before);
      } finally {
        if (alias) {
          rmSync(heldRoot, { force: true });
        }

        rmSync(root, { recursive: true, force: true });
      }
    },
  );

  it.each(['.js', '.mjs', '.json'])('rejects a .ts import symlink to %s', async (extension) => {
    const root = scratchRoot();
    const dir = 'brands/acme/layouts/one';
    try {
      writeFiles(root, {
        [`${dir}/contract.ts`]: contractSource('one', { imports: ["import './alias.ts';"] }),
        [`${dir}/helper${extension}`]: '{}\n',
      });
      symlinkSync(`helper${extension}`, path.join(root, dir, 'alias.ts'));
      const [load] = await loadOne(root);
      expect(problemOf(load)).toMatchObject({
        code: 'layout-contract-imports',
        message: expect.stringContaining(
          'imports "./alias.ts", which does not resolve to a .ts file',
        ),
      });
      expect(contractRuns()).toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('contract check process regressions', () => {
  /**
   * Runs the full static check and both evaluation stages against a scratch workspace.
   *
   * @param root - The scratch workspace.
   * @param names - The names of its contract fixtures, in result order.
   */
  const loadContracts = (
    root: string,
    names: readonly string[],
  ): Promise<readonly ContractLoad[]> =>
    Effect.runPromise(
      importContracts(
        names.map((name) => contractFile(root, name)),
        { root },
      ).pipe(Effect.provide(NodeFileSystem.layer)),
    );

  it.each([
    ['an unhandled rejection', "void Promise.reject(new Error('detached failure'));"],
    ['an uncaught exception', "setTimeout(() => { throw new Error('detached failure'); }, 80);"],
  ])('discards the whole round after %s', async (event, statement) => {
    const root = scratchRoot();
    try {
      writeFiles(root, {
        'brands/acme/layouts/fine/contract.ts': contractSource('fine'),
        'brands/acme/layouts/crashes/contract.ts': contractSource('crashes', {
          // Suppress the crash in the test runner so a regression is an ordinary assertion failure.
          imports: [`if (process.pid !== ${process.pid}) { ${statement} }`],
        }),
      });
      const [fine, crashes] = await loadContracts(root, ['fine', 'crashes']);
      expect(problemOf(crashes)?.message).toBe(
        `Loading it failed: The contract check process stopped after ${event}: detached failure`,
      );
      expect(problemOf(fine)?.message).toContain(
        `The contract check process stopped after ${event}: detached failure (from ${contractFile(root, 'crashes')})`,
      );
      expect(contractRuns()).toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('lets a contract pass when it clears its timer', async () => {
    const root = scratchRoot();
    try {
      writeFiles(root, {
        'brands/acme/layouts/one/contract.ts': contractSource('one', {
          imports: [
            'const pending = setTimeout(() => {}, 60_000);',
            'clearTimeout(pending);',
            'await new Promise((resolve) => setTimeout(resolve, 10));',
          ],
        }),
      });
      const [load] = await loadContracts(root, ['one']);
      expect(load?.kind).toBe('loaded');
      expect(contractRuns()).toBe(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('refuses every importer of a cached shared helper that catches a trap', async () => {
    const root = scratchRoot();
    try {
      writeFiles(root, {
        'brands/acme/layouts/_shared/helper.ts':
          "try { fetch('http://127.0.0.1:9'); } catch {}\n" + helperSource('Shared.'),
        'brands/acme/layouts/_shared/bridge.ts': "export * from './helper.ts';\n",
        'brands/acme/layouts/one/contract.ts': contractWithHelper('one'),
        'brands/acme/layouts/two/pause.ts':
          'await new Promise((resolve) => setTimeout(resolve, 80));\n',
        'brands/acme/layouts/two/contract.ts': contractSource('two', {
          imports: ["import './pause.ts';", "import { DESCRIPTION } from '../_shared/bridge.ts';"],
          descriptionExpression: 'DESCRIPTION',
        }),
        'brands/acme/layouts/fine/contract.ts': contractSource('fine'),
      });
      const [one, two, fine] = await loadContracts(root, ['one', 'two', 'fine']);
      for (const load of [one, two]) {
        expect(problemOf(load)?.message).toBe(
          'Loading it was refused: It used `fetch`, which a contract may not use.',
        );
      }

      expect(fine?.kind).toBe('loaded');
      expect(contractRuns()).toBe(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('refuses process state changes even when they are caught, and allows reads', async () => {
    const root = scratchRoot();
    /**
     * The process state mutations and the member that must refuse each one.
     */
    const attempts = [
      ['writes', "process.env.DECKSTER_MARKER = 'mutated';", 'env'],
      ['deletes', 'delete process.env.NODE_ENV;', 'env'],
      [
        'defines',
        "Object.defineProperty(process.env, 'NODE_ENV', " +
          "{ value: 'test', writable: true, enumerable: true, configurable: true });",
        'env',
      ],
      ['chdirs', 'process.chdir(process.cwd());', 'chdir'],
      ['masks', 'process.umask(process.umask());', 'umask'],
      ['titles', "process.title = 'changed';", 'title'],
      ['uids', 'process.setuid?.(process.getuid());', 'setuid'],
      ['gids', 'process.setgid?.(process.getgid());', 'setgid'],
      ['euids', 'process.seteuid?.(process.geteuid());', 'seteuid'],
      ['egids', 'process.setegid?.(process.getegid());', 'setegid'],
      ['groups', 'process.setgroups?.(process.getgroups());', 'setgroups'],
      ['initgroups', 'process.initgroups?.(process.getuid(), process.getgid());', 'initgroups'],
      ['signals', "process.on('SIGTERM', () => {});", 'on'],
      ['exits', "process.once('exit', () => {});", 'once'],
      ['exceptions', "process.addListener('uncaughtException', () => {});", 'addListener'],
      ['rejections', "process.prependListener('unhandledRejection', () => {});", 'prependListener'],
      ['removes', "process.removeAllListeners('message');", 'removeAllListeners'],
      [
        'inherited',
        "Object.getPrototypeOf(Object.getPrototypeOf(process)).on.call(process, 'exit', () => {});",
        'on',
      ],
      [
        'unbound',
        'Reflect.apply(Object.getPrototypeOf(Object.getPrototypeOf(process)).prependListener, ' +
          "process, ['uncaughtException', () => {}]);",
        'prependListener',
      ],
    ] as const;
    try {
      writeFiles(root, {
        ...Object.fromEntries(
          attempts.map(([name, statement]) => [
            `brands/acme/layouts/${name}/contract.ts`,
            contractSource(name, {
              imports: [`if (process.pid !== ${process.pid}) { try { ${statement} } catch {} }`],
            }),
          ]),
        ),
        'brands/acme/layouts/fine/contract.ts': contractSource('fine', {
          imports: [
            "if (typeof process.env.NODE_ENV !== 'string' || typeof process.umask() !== 'number' " +
              "|| typeof process.title !== 'string') throw new Error('Cannot read process state.');",
          ],
        }),
      });
      const loads = await loadContracts(root, [...attempts.map(([name]) => name), 'fine']);
      expect(loads.map((load) => problemOf(load)?.message ?? load.kind)).toEqual([
        ...attempts.map(
          ([, , member]) =>
            `Loading it was refused: It used \`process.${member}\`, which a contract may not use.`,
        ),
        'loaded',
      ]);
      expect(contractRuns()).toBe(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('refuses an unlisted framework entry point reached through the dynamic runner', async () => {
    const root = scratchRoot();
    try {
      writeFiles(root, {
        'brands/acme/layouts/one/contract.ts': contractSource('one', {
          imports: [
            "try { await eval('__vite_' + 'ssr_dynamic_import__')('@deckster/brand/node'); } catch {}",
          ],
        }),
      });
      const [load] = await loadContracts(root, ['one']);
      expect(problemOf(load)?.message).toMatch(/Loading it was refused: .*@deckster\/brand.*node/);
      expect(contractRuns()).toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
