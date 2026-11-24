import {
  forgetLoaded,
  gatedLoad,
  isCodeHeld,
  rememberLoaded,
  type StaticCallee,
} from '@deckster/brand/node';
import { Effect, FileSystem, Predicate } from 'effect';
import { builtinModules } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { createRunnableDevEnvironment, parseSync, resolveConfig } from 'vite';
import { ESModulesEvaluator } from 'vite/module-runner';

import type { Problem } from '#errors.ts';
import type { LayoutProblemCode } from '#layouts/layout-problem.ts';

import { displayPath } from '#decks/deck-paths.ts';

/**
 * The folder beside the layout folders whose `.ts` files any contract may import.
 */
export const SHARED_LAYOUTS_DIR = '_shared';

/**
 * The packages a contract may import, besides `effect` and its entry points. `@deckster/brand` is
 * for its types and data helpers.
 */
const ALLOWED_PACKAGES: ReadonlySet<string> = new Set([
  'effect',
  '@deckster/engine/layout',
  '@deckster/engine/command',
  '@deckster/kit/layout-fields',
  '@deckster/brand',
]);

/**
 * The start of an `effect` entry point, such as `effect/Schema`.
 */
const EFFECT_ENTRY_PREFIX = 'effect/';

/**
 * The packages Node loads for a contract instead of Vite, so a contract shares the `effect` and
 * framework instances of the process that loads it. Wider than {@link ALLOWED_PACKAGES} on purpose:
 * the import check decides what a contract may import, this only decides who evaluates it.
 */
const NODE_LOADED_PACKAGES: readonly RegExp[] = [/^effect(\/|$)/, /^@deckster\//];

/**
 * A relative import specifier.
 */
const RELATIVE_SPECIFIER_PATTERN = /^\.\.?\//;

/**
 * The argument of a dynamic `import()` that is one plain string, capturing its content.
 */
const STRING_LITERAL_PATTERN = /^(['"])([^'"\\\n]*)\1$/;

/**
 * The extension every file a contract imports must have.
 */
const CONTRACT_EXTENSION = '.ts';

/**
 * The name of the Vite environment contracts are evaluated in.
 */
const ENVIRONMENT_NAME = 'contracts';

/**
 * Vite's cache folder for the contract environment, outside the workspace. Nothing is written to it
 * today: the environment bundles no dependencies.
 */
const CACHE_DIR = path.join(os.tmpdir(), 'deckster-contracts');

/**
 * The fix for a contract that imports something it may not.
 */
const IMPORTS_FIX =
  'A contract runs in Node: import only `effect`, `@deckster/engine/layout`, ' +
  '`@deckster/engine/command`, `@deckster/kit/layout-fields`, `@deckster/brand`, and `.ts` ' +
  "files in the layout's own folder or in `layouts/_shared/`. Keep components, JSX and CSS in " +
  '`layout.tsx`.';

/**
 * The fix for a contract file that does not export a contract.
 */
const EXPORT_FIX =
  'Export the contract as `export default defineLayoutContract({ name, description, schema, ' +
  'slots, budget, example })` from "@deckster/engine/layout".';

/**
 * The callee `gatedLoad` is asked about. A contract is never vouched for by a turn, so the gate
 * answers with the value of the last load or with `held`, and never reads the file.
 */
const CONTRACT_CALLEE: StaticCallee = {
  /**
   * The function a contract file calls.
   */
  name: 'defineLayoutContract',

  /**
   * Its package.
   */
  from: '@deckster/engine/layout',
};

/**
 * Why a contract did not load: its imports, or an error while it ran.
 */
export type ContractProblem = Problem & {
  /**
   * `layout-contract-imports` for the import check, `layout-load-failed` for everything else.
   */
  readonly code: Extract<LayoutProblemCode, 'layout-contract-imports' | 'layout-load-failed'>;
};

/**
 * What became of one contract file.
 */
export type ContractLoad =
  | {
      /**
       * The absolute path, as it was given.
       */
      readonly file: string;

      /**
       * The contract was evaluated, or an agent turn holds it and this is the value it had when it
       * was last evaluated in this process.
       */
      readonly kind: 'loaded';

      /**
       * The file's default export, not validated.
       */
      readonly exported: unknown;
    }
  | {
      /**
       * The absolute path, as it was given.
       */
      readonly file: string;

      /**
       * An agent turn holds the file, and it was never loaded in this process before.
       */
      readonly kind: 'held';
    }
  | {
      /**
       * The absolute path, as it was given.
       */
      readonly file: string;

      /**
       * The file is missing, imports something a contract may not, threw, or has no default export.
       */
      readonly kind: 'failed';

      /**
       * What is wrong and how to fix it.
       */
      readonly problem: ContractProblem;
    };

/**
 * Options for {@link importContracts}.
 */
export type ImportContractsOptions = {
  /**
   * The absolute workspace root: the root of the Vite environment the contracts run in, and what
   * paths in messages are relative to.
   */
  readonly root: string;
};

/**
 * What {@link evaluateContracts} did.
 */
export type ContractEvaluation = {
  /**
   * What became of each file, in the order given.
   */
  readonly loads: readonly ContractLoad[];

  /**
   * The absolute files Vite transformed and ran itself: the contracts and the files they import.
   * Packages are not among them, because Node loads those.
   */
  readonly inlined: readonly string[];
};

/**
 * Loads the default export of each `contract.ts`, in three steps.
 *
 * 1. The turn gate. A file under a folder an agent turn holds is not read, checked or evaluated: the
 *    answer is the value it had when this process last evaluated it, or `held`. Nothing the turn
 *    writes, to the contract or to a file it imports, runs before the turn is settled.
 * 2. The import check, on the source, before anything runs. It follows relative imports and rejects
 *    any that is not a `.ts` file or leaves the layout's folder and `layouts/_shared/`, and any
 *    package other than `effect`, `@deckster/engine/layout`, `@deckster/engine/command`,
 *    `@deckster/kit/layout-fields` and `@deckster/brand`. `import type` and `export type`
 *    declarations are not followed, since they are erased.
 * 3. The loader: one Vite environment for the batch, closed afterwards, so an edited contract or
 *    helper is read afresh on the next call. Vite runs only the workspace's files; `effect` and
 *    `@deckster/*` are imported by Node from this package, so a contract's schema is built with the
 *    same `effect` as the caller's.
 *
 * It never fails: each file's outcome is a value.
 *
 * @param files - Absolute `contract.ts` paths. The gate matches holds on the path as written, so
 *   pass paths built from the workspace root, not resolved through symlinks.
 * @param options - The workspace root.
 * @returns One outcome per file, in the order given.
 */
export const importContracts = Effect.fn('importContracts')(function* (
  files: readonly string[],
  options: ImportContractsOptions,
): Effect.fn.Return<readonly ContractLoad[], never, FileSystem.FileSystem> {
  const checked = yield* Effect.forEach(files, (file) => checkBeforeLoad(file, options.root));
  const ready = checked.flatMap((entry) => (entry.kind === 'ready' ? [entry.file] : []));
  if (ready.length === 0) {
    return checked.filter((entry) => entry.kind !== 'ready');
  }

  const evaluation = yield* Effect.promise(() => evaluateContracts(ready, options.root));
  const evaluated = new Map(evaluation.loads.map((load) => [load.file, load]));
  return checked.map((entry) =>
    entry.kind === 'ready' ? (evaluated.get(entry.file) ?? failed(entry.file, notRun())) : entry,
  );
});

/**
 * Evaluates contract files in one Vite environment and closes it. A file an agent turn holds, now
 * or by the time its evaluation ends, is answered from the gate and not remembered. This is the
 * loader of {@link importContracts} without the import check; call that instead.
 *
 * @param files - Absolute `contract.ts` paths.
 * @param root - The absolute workspace root.
 * @returns Each file's outcome, and the files Vite ran.
 */
export async function evaluateContracts(
  files: readonly string[],
  root: string,
): Promise<ContractEvaluation> {
  // Resolving a serve config sets NODE_ENV when it is unset, which a later build in this process
  // would read.
  const nodeEnv = process.env.NODE_ENV;
  try {
    return await runInEnvironment(files, root);
  } catch (error) {
    return { loads: files.map((file) => failed(file, loadFailure(error))), inlined: [] };
  } finally {
    if (nodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = nodeEnv;
    }
  }
}

/**
 * The problem for a contract that was ready to run and got no outcome, which is a bug.
 */
function notRun(): ContractProblem {
  return {
    code: 'layout-load-failed',
    message: 'The contract was not loaded.',
    fix: 'Run the command again; if it happens again, report it.',
  };
}

/**
 * A contract that passed the gate and the import check, and can be evaluated.
 */
type ReadyContract = {
  /**
   * The absolute path, as it was given.
   */
  readonly file: string;

  /**
   * Nothing stops the file from running.
   */
  readonly kind: 'ready';
};

/**
 * Applies the turn gate and the import check to one contract file.
 *
 * @param file - The absolute `contract.ts` path.
 * @param root - The absolute workspace root.
 */
const checkBeforeLoad = Effect.fn('checkBeforeLoad')(function* (
  file: string,
  root: string,
): Effect.fn.Return<ContractLoad | ReadyContract, never, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  const exists = yield* fs.exists(file).pipe(Effect.orElseSucceed(() => false));
  if (!exists) {
    // Also during a turn: a file deleted and written again must not answer with its old value.
    forgetLoaded(file);
    return failed(file, {
      code: 'layout-load-failed',
      message: `There is no ${displayPath(root, file)}.`,
      fix: `Create it. ${EXPORT_FIX}`,
    });
  }

  if (isCodeHeld(file)) {
    return heldLoad(file);
  }

  const problems = yield* importProblems(file, root);
  // A turn may have begun while the files were read; they are not trusted then.
  if (isCodeHeld(file)) {
    return heldLoad(file);
  }

  if (problems.length > 0) {
    return failed(file, {
      code: 'layout-contract-imports',
      message: problems.join(' '),
      fix: IMPORTS_FIX,
    });
  }

  return { file, kind: 'ready' };
});

/**
 * The answer for a file an agent turn holds: the value of its last load, or `held`.
 *
 * @param file - The absolute `contract.ts` path.
 */
function heldLoad(file: string): ContractLoad {
  // The empty text matches no content a turn vouches for, so the gate reads nothing as data.
  const gate = gatedLoad(file, '', CONTRACT_CALLEE);
  return gate.kind === 'value'
    ? { file, kind: 'loaded', exported: gate.value }
    : { file, kind: 'held' };
}

/**
 * A failed load.
 *
 * @param file - The absolute `contract.ts` path.
 * @param problem - What is wrong.
 */
function failed(file: string, problem: ContractProblem): ContractLoad {
  return { file, kind: 'failed', problem };
}

/**
 * The problem for an error thrown while a contract, or the environment it runs in, loaded.
 *
 * @param error - What was thrown.
 */
function loadFailure(error: unknown): ContractProblem {
  return {
    code: 'layout-load-failed',
    message: `Loading it failed: ${error instanceof Error ? error.message : String(error)}`,
    fix: `Fix that error. ${EXPORT_FIX}`,
  };
}

/**
 * Everything a contract imports that it may not, following its relative imports. Each entry is a
 * sentence that names the importing file and the import.
 *
 * @param contractFile - The absolute `contract.ts` path.
 * @param root - The absolute workspace root, for the paths in the sentences.
 */
const importProblems = Effect.fn('importProblems')(function* (
  contractFile: string,
  root: string,
): Effect.fn.Return<string[], never, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  /**
   * The folder with symlinks resolved, or as written when it does not exist.
   *
   * @param dir - An absolute folder.
   */
  const realOf = (dir: string) => fs.realPath(dir).pipe(Effect.orElseSucceed(() => dir));
  const layoutDir = path.dirname(contractFile);
  const allowedDirs = [
    yield* realOf(layoutDir),
    yield* realOf(path.join(path.dirname(layoutDir), SHARED_LAYOUTS_DIR)),
  ];
  const problems: string[] = [];
  const seen = new Set<string>([contractFile]);
  const queue = [contractFile];
  for (const file of queue) {
    const shown = displayPath(root, file);
    const text = yield* fs.readFileString(file).pipe(Effect.orElseSucceed(() => undefined));
    if (text === undefined) {
      problems.push(`${shown} cannot be read.`);
      continue;
    }

    for (const specifier of importedSpecifiers(file, text)) {
      const checked = yield* checkSpecifier(file, specifier, allowedDirs);
      if (checked.problem !== undefined) {
        problems.push(`${shown} ${checked.problem}.`);
      } else if (checked.follow !== undefined && !seen.has(checked.follow)) {
        seen.add(checked.follow);
        queue.push(checked.follow);
      }
    }
  }

  return problems;
});

/**
 * What the import check makes of one import: what is wrong with it, or the file to check next.
 */
type CheckedSpecifier = {
  /**
   * What is wrong, as the end of a sentence that starts with the importing file.
   */
  readonly problem?: string;

  /**
   * The absolute file a relative import names, whose own imports are checked too.
   */
  readonly follow?: string;
};

/**
 * Checks one import of a file a contract loads.
 *
 * @param file - The absolute importing file.
 * @param specifier - The specifier, or `undefined` for a dynamic import of no plain string.
 * @param allowedDirs - The layout's folder and `layouts/_shared/`, with symlinks resolved.
 */
const checkSpecifier = Effect.fn('checkSpecifier')(function* (
  file: string,
  specifier: string | undefined,
  allowedDirs: readonly string[],
): Effect.fn.Return<CheckedSpecifier, never, FileSystem.FileSystem> {
  if (specifier === undefined) {
    return { problem: 'has a dynamic import whose target is not one plain string' };
  }

  if (!RELATIVE_SPECIFIER_PATTERN.test(specifier)) {
    return isAllowedPackage(specifier)
      ? {}
      : { problem: `imports "${specifier}", which a contract may not import` };
  }

  const target = path.resolve(path.dirname(file), specifier);
  const problem = yield* relativeImportProblem(target, allowedDirs);
  return problem === undefined
    ? { follow: target }
    : { problem: `imports "${specifier}", which ${problem}` };
});

/**
 * What is wrong with a relative import's target, as the end of a sentence, or `undefined` when a
 * contract may import it.
 *
 * @param target - The absolute path the import names.
 * @param allowedDirs - The layout's folder and `layouts/_shared/`, with symlinks resolved.
 */
const relativeImportProblem = Effect.fn('relativeImportProblem')(function* (
  target: string,
  allowedDirs: readonly string[],
): Effect.fn.Return<string | undefined, never, FileSystem.FileSystem> {
  if (!target.endsWith(CONTRACT_EXTENSION)) {
    return `is not a ${CONTRACT_EXTENSION} file`;
  }

  const fs = yield* FileSystem.FileSystem;
  const real = yield* fs.realPath(target).pipe(Effect.orElseSucceed(() => undefined));
  if (real === undefined) {
    return 'does not exist';
  }

  const isInside = allowedDirs.some((dir) => real.startsWith(`${dir}${path.sep}`));
  return isInside
    ? undefined
    : `is outside the layout's own folder and layouts/${SHARED_LAYOUTS_DIR}/`;
});

/**
 * Whether a contract may import a package.
 *
 * @param specifier - A specifier that is not relative.
 */
function isAllowedPackage(specifier: string): boolean {
  return ALLOWED_PACKAGES.has(specifier) || specifier.startsWith(EFFECT_ENTRY_PREFIX);
}

/**
 * The specifiers a TypeScript file imports or re-exports at run time: static imports and exports
 * that are not `import type` or `export type`, and dynamic imports. A dynamic import whose target
 * is not one plain string is `undefined`. A file that does not parse gives what was read up to the
 * error; evaluating it then fails with the syntax error.
 *
 * @param file - The absolute path, which tells the parser the language.
 * @param text - The file's content.
 */
function importedSpecifiers(file: string, text: string): (string | undefined)[] {
  const { program, module } = parseSync(file, text);
  const statics = program.body.flatMap((node) => {
    if (node.type === 'ImportDeclaration') {
      return node.importKind === 'type' ? [] : [node.source.value];
    }

    const isReExport =
      node.type === 'ExportNamedDeclaration' || node.type === 'ExportAllDeclaration';
    if (!isReExport || node.exportKind === 'type' || !Predicate.isNotNullish(node.source)) {
      return [];
    }

    return [node.source.value];
  });
  const dynamics = module.dynamicImports.map((dynamic) => {
    const argument = text.slice(dynamic.moduleRequest.start, dynamic.moduleRequest.end).trim();
    return STRING_LITERAL_PATTERN.exec(argument)?.[2];
  });
  return [...statics, ...dynamics];
}

/**
 * Hands the packages in {@link NODE_LOADED_PACKAGES} to Node, resolved from this package: the
 * workspace links in the repository, the CLI's loader hooks when installed.
 */
class PackageEvaluator extends ESModulesEvaluator {
  /**
   * Imports a module Vite did not transform.
   *
   * @param file - The specifier as the contract wrote it, or a file URL.
   */
  override runExternalModule(file: string): Promise<unknown> {
    if (NODE_LOADED_PACKAGES.some((pattern) => pattern.test(file))) {
      return import(/* @vite-ignore */ import.meta.resolve(file));
    }

    return super.runExternalModule(file);
  }
}

/**
 * Builds the environment, evaluates each file in it and closes it.
 *
 * @param files - Absolute `contract.ts` paths.
 * @param root - The absolute workspace root.
 */
async function runInEnvironment(
  files: readonly string[],
  root: string,
): Promise<ContractEvaluation> {
  const config = await resolveConfig(
    {
      root,
      configFile: false,
      envDir: false,
      cacheDir: CACHE_DIR,
      logLevel: 'silent',
      environments: {
        [ENVIRONMENT_NAME]: {
          consumer: 'server',
          dev: { moduleRunnerTransform: true },
          resolve: {
            external: true,
            mainFields: [],
            conditions: ['node'],
            builtins: [...builtinModules, /^node:/, ...NODE_LOADED_PACKAGES],
          },
        },
      },
    },
    'serve',
  );
  const environment = createRunnableDevEnvironment(ENVIRONMENT_NAME, config, {
    runnerOptions: { hmr: false, evaluator: new PackageEvaluator() },
    hot: false,
  });
  await environment.init();
  try {
    const loads: ContractLoad[] = [];
    for (const file of files) {
      loads.push(await evaluateContract(file, (id) => environment.runner.import(id)));
    }

    // A module handed to Node carries `externalize` in what Vite fetched for it.
    const inlined = [...environment.runner.evaluatedModules.urlToIdModuleMap.values()]
      .filter((module) => module.meta !== undefined && !('externalize' in module.meta))
      .map((module) => module.file);
    return { loads, inlined };
  } finally {
    await environment.close();
  }
}

/**
 * Evaluates one contract file, unless an agent turn holds it. A turn that begins while the file
 * runs may have changed it under the import, so its value is dropped then too.
 *
 * @param file - The absolute `contract.ts` path.
 * @param run - Imports a module in the environment.
 */
async function evaluateContract(
  file: string,
  run: (id: string) => Promise<unknown>,
): Promise<ContractLoad> {
  if (isCodeHeld(file)) {
    return heldLoad(file);
  }

  try {
    const module = await run(file);
    if (isCodeHeld(file)) {
      return heldLoad(file);
    }

    const exported = Predicate.isObject(module) ? Reflect.get(module, 'default') : undefined;
    if (exported === undefined) {
      return failed(file, {
        code: 'layout-load-failed',
        message: 'It has no default export.',
        fix: EXPORT_FIX,
      });
    }

    rememberLoaded(file, exported);
    return { file, kind: 'loaded', exported };
  } catch (error) {
    return failed(file, loadFailure(error));
  }
}
