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
import {
  createRunnableDevEnvironment,
  normalizePath,
  parseSync,
  resolveConfig,
  type Plugin,
} from 'vite';
import { ESModulesEvaluator } from 'vite/module-runner';

import type { Problem } from '#errors.ts';
import type { LayoutProblemCode } from '#layouts/layout-problem.ts';

import { displayPath } from '#decks/deck-paths.ts';

/**
 * The folder beside the layout folders whose `.ts` files any contract may import.
 */
export const SHARED_LAYOUTS_DIR = '_shared';

/**
 * The packages a contract may import, besides the entry points of `effect` (see
 * {@link isContractPackage}). `@deckster/brand` is for its types and data helpers.
 */
export const CONTRACT_PACKAGES: ReadonlySet<string> = new Set([
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
 * framework instances of the process that loads it. Wider than {@link CONTRACT_PACKAGES} on
 * purpose: the import check decides what a contract may import, this only decides who evaluates
 * it.
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
 * A query (`?raw`) or a hash in a specifier. Vite cuts a specifier there while `path.resolve` does
 * not, so the checker and the loader would read different files.
 */
const QUERY_OR_HASH_PATTERN = /[?#]/;

/**
 * What follows `import.meta` in a call to Vite's `import.meta.glob`, which Vite turns into imports
 * the check never sees.
 */
const IMPORT_META_GLOB_PATTERN = /^\s*(?:\?\.\s*)?(?:\.\s*glob\b|\[\s*['"`]glob['"`]\s*\])/;

/**
 * The names Vite's module runner gives a module, such as `__vite_ssr_dynamic_import__`, which
 * import any file or package without an import statement.
 */
const VITE_RUNNER_NAME_PATTERN = /\b__vite_ssr_\w*/g;

/**
 * How long one contract, with the files it imports, may take to evaluate, in milliseconds. A
 * top-level await that never settles fails that contract instead of the whole catalog.
 */
export const CONTRACT_TIMEOUT_MS = 10_000;

/**
 * The extension every file a contract imports must have.
 */
const CONTRACT_EXTENSION = '.ts';

/**
 * The prefix of a Node built-in specifier.
 */
const NODE_PREFIX = 'node:';

/**
 * The Node built-ins that can be named without {@link NODE_PREFIX}.
 */
const NODE_BUILTINS: ReadonlySet<string> = new Set(builtinModules);

/**
 * The query of a module id.
 */
const QUERY_SUFFIX_PATTERN = /\?.*$/;

/**
 * The start of a virtual module id, which names no file.
 */
const VIRTUAL_ID_PREFIX = '\0';

/**
 * What {@link withTimeout} gives when the time ran out.
 */
const TIMED_OUT: unique symbol = Symbol('timed out');

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
 * What Vite's parser gives for a file.
 */
type ParsedSource = ReturnType<typeof parseSync>;

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

  /**
   * How long one contract may take to evaluate, in milliseconds; {@link CONTRACT_TIMEOUT_MS} when
   * left out.
   */
  readonly timeoutMs?: number;
};

/**
 * Options for {@link evaluateContracts}.
 */
export type EvaluateContractsOptions = {
  /**
   * The absolute files, with symlinks resolved, that the environment may run: the contracts and the
   * files the import check followed. Any other file Vite is asked to load fails the contract that
   * asked for it. Every file may run when left out.
   */
  readonly allowed?: ReadonlySet<string>;

  /**
   * How long one contract may take to evaluate, in milliseconds; {@link CONTRACT_TIMEOUT_MS} when
   * left out.
   */
  readonly timeoutMs?: number;
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
 * 2. The import check, on the source, before anything runs. It follows relative imports (from where a
 *    symlink points) and rejects any that is not a `.ts` file, has a query or a hash, or leaves the
 *    layout's folder and `layouts/_shared/`, and any package other than `effect`,
 *    `@deckster/engine/layout`, `@deckster/engine/command`, `@deckster/kit/layout-fields` and
 *    `@deckster/brand`. It also rejects `import.meta.glob` and the names Vite's runner gives a
 *    module. `import type` and `export type` declarations are not followed, since they are erased.
 * 3. The loader: one Vite environment for the batch, closed afterwards, so an edited contract or
 *    helper is read afresh on the next call. Vite runs only the workspace files the check followed,
 *    and no Node built-in; `effect` and `@deckster/*` are imported by Node from this package, so a
 *    contract's schema is built with the same `effect` as the caller's. A contract that does not
 *    finish within the timeout fails, and the others still load.
 *
 * The check guards against mistakes; it is not a sandbox, since a contract runs in Node.
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

  const allowed = new Set(
    checked.flatMap((entry) => (entry.kind === 'ready' ? [entry.file, ...entry.checked] : [])),
  );
  const evaluation = yield* Effect.promise(() =>
    evaluateContracts(ready, options.root, {
      allowed,
      timeoutMs: options.timeoutMs ?? CONTRACT_TIMEOUT_MS,
    }),
  );
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
 * @param options - The files the environment may run, and how long each contract may take.
 * @returns Each file's outcome, and the files Vite ran.
 */
export async function evaluateContracts(
  files: readonly string[],
  root: string,
  options: EvaluateContractsOptions = {},
): Promise<ContractEvaluation> {
  claimNodeEnv();
  try {
    return await runInEnvironment(files, root, options);
  } catch (error) {
    return { loads: files.map((file) => failed(file, loadFailure(error))), inlined: [] };
  } finally {
    releaseNodeEnv();
  }
}

/**
 * How many evaluations are running, and the `NODE_ENV` from before the first of them. Resolving a
 * serve config sets `NODE_ENV` when it is unset, which a later build in this process would read, so
 * the value from before the first evaluation comes back when the last one ends.
 */
const nodeEnvOwners: { count: number; saved: string | undefined } = {
  /**
   * How many evaluations are running.
   */
  count: 0,

  /**
   * The `NODE_ENV` from before the first of them.
   */
  saved: undefined,
};

/**
 * Notes that an evaluation starts, keeping `NODE_ENV` when it is the first.
 */
function claimNodeEnv(): void {
  if (nodeEnvOwners.count === 0) {
    nodeEnvOwners.saved = process.env.NODE_ENV;
  }

  nodeEnvOwners.count += 1;
}

/**
 * Notes that an evaluation ended, putting `NODE_ENV` back when it was the last.
 */
function releaseNodeEnv(): void {
  nodeEnvOwners.count -= 1;
  if (nodeEnvOwners.count > 0) {
    return;
  }

  if (nodeEnvOwners.saved === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = nodeEnvOwners.saved;
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

  /**
   * The contract and every file the import check followed from it, with symlinks resolved.
   */
  readonly checked: readonly string[];
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

  const { problems, checked } = yield* importProblems(file, root);
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

  return { file, kind: 'ready', checked };
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
 * What the import check found for one contract.
 */
type ImportCheck = {
  /**
   * Everything the contract imports that it may not, each a sentence that names the importing file
   * and the import.
   */
  readonly problems: readonly string[];

  /**
   * The contract and every file followed from it, with symlinks resolved.
   */
  readonly checked: readonly string[];
};

/**
 * Everything a contract imports that it may not, following its relative imports from the files
 * their symlinks point to, as Vite does.
 *
 * @param contractFile - The absolute `contract.ts` path.
 * @param root - The absolute workspace root, for the paths in the sentences.
 */
const importProblems = Effect.fn('importProblems')(function* (
  contractFile: string,
  root: string,
): Effect.fn.Return<ImportCheck, never, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  /**
   * The path with symlinks resolved, or as written when it does not exist.
   *
   * @param file - An absolute path.
   */
  const realOf = (file: string) => fs.realPath(file).pipe(Effect.orElseSucceed(() => file));
  const layoutDir = path.dirname(contractFile);
  const sharedDir = path.join(path.dirname(layoutDir), SHARED_LAYOUTS_DIR);
  // Discovery and the agent turn guard go by paths as written, so a linked `_shared/` is reported
  // by discovery and no import may go through it.
  const isSharedLinked = yield* fs.lstat(sharedDir).pipe(
    Effect.map((info) => info.type === 'SymbolicLink'),
    Effect.orElseSucceed(() => false),
  );
  const allowed: AllowedImports = {
    dirs: isSharedLinked
      ? [yield* realOf(layoutDir)]
      : [yield* realOf(layoutDir), yield* realOf(sharedDir)],
    // Imports resolve from real paths, so the link is matched under the real `layouts/` folder.
    linkedShared: isSharedLinked
      ? path.join(yield* realOf(path.dirname(layoutDir)), SHARED_LAYOUTS_DIR)
      : undefined,
  };
  const realRoot = yield* realOf(root);
  const realContract = yield* realOf(contractFile);
  const problems: string[] = [];
  const seen = new Set<string>([realContract]);
  const queue = [realContract];
  for (const file of queue) {
    const shown =
      file === realContract ? displayPath(root, contractFile) : displayPath(realRoot, file);
    const text = yield* fs.readFileString(file).pipe(Effect.orElseSucceed(() => undefined));
    if (text === undefined) {
      problems.push(`${shown} cannot be read.`);
      continue;
    }

    const source = scanSource(file, text);
    problems.push(...source.problems.map((problem) => `${shown} ${problem}.`));
    for (const specifier of source.specifiers) {
      const checked = yield* checkSpecifier(file, specifier, allowed);
      if (checked.problem !== undefined) {
        problems.push(`${shown} ${checked.problem}.`);
      } else if (checked.follow !== undefined && !seen.has(checked.follow)) {
        seen.add(checked.follow);
        queue.push(checked.follow);
      }
    }
  }

  return { problems, checked: [...seen] };
});

/**
 * Where a contract's relative imports may lead.
 */
type AllowedImports = {
  /**
   * The layout's folder and `layouts/_shared/`, with symlinks resolved; without `_shared/` when it
   * is a symbolic link.
   */
  readonly dirs: readonly string[];

  /**
   * The absolute `layouts/_shared/` path under the real `layouts/` folder, when it is a symbolic
   * link, so an import under it is refused with that reason.
   */
  readonly linkedShared: string | undefined;
};

/**
 * What the import check makes of one import: what is wrong with it, or the file to check next.
 */
type CheckedSpecifier = {
  /**
   * What is wrong, as the end of a sentence that starts with the importing file.
   */
  readonly problem?: string;

  /**
   * The absolute file a relative import names, with symlinks resolved, whose own imports are
   * checked too.
   */
  readonly follow?: string;
};

/**
 * Checks one import of a file a contract loads.
 *
 * @param file - The absolute importing file, with symlinks resolved.
 * @param specifier - The specifier, or `undefined` for a dynamic import of no plain string.
 * @param allowed - Where the contract's relative imports may lead.
 */
const checkSpecifier = Effect.fn('checkSpecifier')(function* (
  file: string,
  specifier: string | undefined,
  allowed: AllowedImports,
): Effect.fn.Return<CheckedSpecifier, never, FileSystem.FileSystem> {
  if (specifier === undefined) {
    return { problem: 'has a dynamic import whose target is not one plain string' };
  }

  if (QUERY_OR_HASH_PATTERN.test(specifier)) {
    return { problem: `imports "${specifier}", which has a query or a hash` };
  }

  if (!RELATIVE_SPECIFIER_PATTERN.test(specifier)) {
    return isContractPackage(specifier)
      ? {}
      : { problem: `imports "${specifier}", which a contract may not import` };
  }

  const target = path.resolve(path.dirname(file), specifier);
  const resolved = yield* resolveRelativeImport(target, allowed);
  return resolved.problem === undefined
    ? { follow: resolved.real }
    : { problem: `imports "${specifier}", which ${resolved.problem}` };
});

/**
 * Resolves a relative import's target through symlinks and checks it: what is wrong with it, as the
 * end of a sentence, or the file a contract may import.
 *
 * @param target - The absolute path the import names.
 * @param allowed - Where the contract's relative imports may lead.
 */
const resolveRelativeImport = Effect.fn('resolveRelativeImport')(function* (
  target: string,
  allowed: AllowedImports,
): Effect.fn.Return<
  { problem: string } | { problem?: undefined; real: string },
  never,
  FileSystem.FileSystem
> {
  if (!target.endsWith(CONTRACT_EXTENSION)) {
    return { problem: `is not a ${CONTRACT_EXTENSION} file` };
  }

  const { linkedShared } = allowed;
  if (linkedShared !== undefined && target.startsWith(`${linkedShared}${path.sep}`)) {
    return {
      problem:
        `is under layouts/${SHARED_LAYOUTS_DIR}/, which is a symbolic link, and a contract ` +
        'imports helpers only from a real folder',
    };
  }

  const fs = yield* FileSystem.FileSystem;
  const real = yield* fs.realPath(target).pipe(Effect.orElseSucceed(() => undefined));
  if (real === undefined) {
    return { problem: 'does not exist' };
  }

  const isInside = allowed.dirs.some((dir) => real.startsWith(`${dir}${path.sep}`));
  return isInside
    ? { real }
    : { problem: `is outside the layout's own folder and layouts/${SHARED_LAYOUTS_DIR}/` };
});

/**
 * Whether a contract may import a package: one of {@link CONTRACT_PACKAGES} or an `effect` entry
 * point such as `effect/Schema`. A specifier with a query or a hash is still refused by the import
 * check.
 *
 * @param specifier - A specifier that is not relative; a relative one gives `false`.
 * @returns Whether the import check lets a contract import it.
 */
export function isContractPackage(specifier: string): boolean {
  return CONTRACT_PACKAGES.has(specifier) || specifier.startsWith(EFFECT_ENTRY_PREFIX);
}

/**
 * What the import check reads from one file's source.
 */
type ScannedSource = {
  /**
   * What the file imports or re-exports at run time; `undefined` for a dynamic import of no plain
   * string.
   */
  readonly specifiers: readonly (string | undefined)[];

  /**
   * What in the source loads files without an import, each as the end of a sentence that starts
   * with the file.
   */
  readonly problems: readonly string[];
};

/**
 * Reads a TypeScript file's imports, and what in it would load files around them: a call to
 * `import.meta.glob` and the names Vite's module runner gives a module. The names are matched in
 * the text, comments and strings included.
 *
 * @param file - The absolute path, which tells the parser the language.
 * @param text - The file's content.
 */
function scanSource(file: string, text: string): ScannedSource {
  const { program, module } = parseSync(file, text);
  const usesGlob = module.importMetas.some((meta) =>
    IMPORT_META_GLOB_PATTERN.test(text.slice(meta.end)),
  );
  const runnerNames = [...new Set(text.match(VITE_RUNNER_NAME_PATTERN) ?? [])];
  const problems = [
    ...(usesGlob ? ['uses import.meta.glob, which a contract may not use'] : []),
    ...runnerNames.map((name) => `names \`${name}\`, which belongs to Vite's module runner`),
  ];
  return { specifiers: importedSpecifiers(program, module, text), problems };
}

/**
 * The specifiers a parsed TypeScript file imports or re-exports at run time: static imports and
 * exports that are not `import type` or `export type`, and dynamic imports. A dynamic import whose
 * target is not one plain string is `undefined`. A file that does not parse gives what was read up
 * to the error; evaluating it then fails with the syntax error.
 *
 * @param program - The parsed program.
 * @param module - What the parser found about the module's imports.
 * @param text - The file's content.
 */
function importedSpecifiers(
  program: ParsedSource['program'],
  module: ParsedSource['module'],
  text: string,
): (string | undefined)[] {
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
    if (isNodeBuiltin(file)) {
      return Promise.reject(new Error(`A contract may not load "${file}", a Node built-in.`));
    }

    if (NODE_LOADED_PACKAGES.some((pattern) => pattern.test(file))) {
      return import(/* @vite-ignore */ import.meta.resolve(file));
    }

    return super.runExternalModule(file);
  }
}

/**
 * Whether a specifier names a Node built-in, which the import check never lets a contract import.
 *
 * @param specifier - A specifier Vite handed to Node.
 */
function isNodeBuiltin(specifier: string): boolean {
  return specifier.startsWith(NODE_PREFIX) || NODE_BUILTINS.has(specifier);
}

/**
 * A Vite plugin that refuses to load any file outside `allowed`, so a file only a transform or the
 * runner's own import function names (not the import check) never runs.
 *
 * @param allowed - The absolute files that may run, with symlinks resolved.
 */
function loadGuard(allowed: ReadonlySet<string>): Plugin {
  // Vite's ids use forward slashes on every platform.
  const files = new Set([...allowed].map((file) => normalizePath(file)));
  return {
    name: 'deckster:contract-load-guard',
    enforce: 'pre',
    load(id) {
      const file = id.replace(QUERY_SUFFIX_PATTERN, '');
      if (file.startsWith(VIRTUAL_ID_PREFIX) || files.has(normalizePath(file))) {
        return null;
      }

      throw new Error(`${file} was not checked as an import of a contract, so it may not run.`);
    },
  };
}

/**
 * Builds the environment, evaluates each file in it and closes it.
 *
 * @param files - Absolute `contract.ts` paths.
 * @param root - The absolute workspace root.
 * @param options - The files that may run, and how long each contract may take.
 */
async function runInEnvironment(
  files: readonly string[],
  root: string,
  options: EvaluateContractsOptions,
): Promise<ContractEvaluation> {
  const config = await resolveConfig(
    {
      root,
      configFile: false,
      plugins: options.allowed === undefined ? [] : [loadGuard(options.allowed)],
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
      /**
       * Imports a module in the environment.
       */
      const run = (id: string) => environment.runner.import(id);
      loads.push(await evaluateContract(file, run, options.timeoutMs ?? CONTRACT_TIMEOUT_MS));
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
 * @param timeoutMs - How long the import may take, in milliseconds.
 */
async function evaluateContract(
  file: string,
  run: (id: string) => Promise<unknown>,
  timeoutMs: number,
): Promise<ContractLoad> {
  if (isCodeHeld(file)) {
    return heldLoad(file);
  }

  try {
    const module = await withTimeout(run(file), timeoutMs);
    if (module === TIMED_OUT) {
      return failed(file, timedOut(timeoutMs));
    }

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

/**
 * Waits for a promise for at most a while.
 *
 * @param promise - What to wait for.
 * @param timeoutMs - How long, in milliseconds.
 * @returns What the promise gave, or {@link TIMED_OUT} when it took longer.
 */
async function withTimeout<A>(
  promise: Promise<A>,
  timeoutMs: number,
): Promise<A | typeof TIMED_OUT> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<typeof TIMED_OUT>((resolve) => {
    timer = setTimeout(() => resolve(TIMED_OUT), timeoutMs);
    timer.unref();
  });
  try {
    return await Promise.race([promise, deadline]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The problem for a contract that did not finish loading in time.
 *
 * @param timeoutMs - The time it had, in milliseconds.
 */
function timedOut(timeoutMs: number): ContractProblem {
  return {
    code: 'layout-load-failed',
    message:
      `It did not finish loading within ${timeoutMs} ms: a top-level await in it or in a file ` +
      'it imports never settles.',
    fix:
      'Do not wait at the top level of a contract or its helpers for something that may never ' +
      'happen.',
  };
}
