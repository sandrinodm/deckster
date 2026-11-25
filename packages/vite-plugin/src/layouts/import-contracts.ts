import {
  forgetLoaded,
  gatedLoad,
  isCodeHeld,
  onCodeHeld,
  rememberLoaded,
  type StaticCallee,
} from '@deckster/brand/node';
import { Effect, FileSystem, Predicate, type Scope } from 'effect';
import { readFile } from 'node:fs/promises';
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

import type { Problem } from '#errors.ts';
import type { LayoutProblemCode } from '#layouts/layout-problem.ts';

import { displayPath } from '#decks/deck-paths.ts';
import { checkContracts, type CheckVerdict } from '#layouts/contract-check.ts';
import {
  isContractPackage,
  NODE_LOADED_PACKAGES,
  PackageEvaluator,
  type ModuleGate,
} from '#layouts/contract-evaluator.ts';

export { CONTRACT_PACKAGES, isContractPackage } from '#layouts/contract-evaluator.ts';

/**
 * The folder beside the layout folders whose `.ts` files any contract may import.
 */
export const SHARED_LAYOUTS_DIR = '_shared';

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
 * How long one batch of contracts, with the files they import, may take to evaluate, in
 * milliseconds: once in the check process, once more in the server's own load. The contracts run at
 * the same time against this one deadline, so a top-level await that never settles fails that
 * contract instead of the whole catalog, and several of them cost this once, not once each.
 */
export const CONTRACT_TIMEOUT_MS = 10_000;

/**
 * The extension every file a contract imports must have.
 */
const CONTRACT_EXTENSION = '.ts';

/**
 * The query of a module id.
 */
const QUERY_SUFFIX_PATTERN = /\?.*$/;

/**
 * The start of a virtual module id, which names no file.
 */
const VIRTUAL_ID_PREFIX = '\0';

/**
 * What a batch's deadline gives when the time ran out.
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
 * The fix for a contract the check process refused because it reached for Node.
 */
const DENIED_FIX =
  'A contract only describes its layout: remove the code that reaches for Node (built-in ' +
  'modules, `process`, files, processes or the network). Contracts are checked in a process that ' +
  'may only read the framework, and any such use fails the contract, even when it is caught.';

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
   * How long the batch may take to evaluate, in milliseconds; {@link CONTRACT_TIMEOUT_MS} when left
   * out.
   */
  readonly timeoutMs?: number;
};

/**
 * Options for {@link evaluateContracts}.
 */
export type EvaluateContractsOptions = {
  /**
   * The absolute files, with symlinks resolved, that the environment may run (the contracts and the
   * files the import check followed), each with the contract paths, as given, that import it. Any
   * other file Vite is asked to load fails the contract that asked for it, and a file stops running
   * once an agent turn holds one of its contracts. Every file may run when left out, until a turn
   * holds any contract of the batch.
   */
  readonly allowed?: ReadonlyMap<string, readonly string[]>;

  /**
   * The exact source text the import check scanned, by absolute file with symlinks resolved.
   */
  readonly sources?: ReadonlyMap<string, string>;

  /**
   * How long the batch may take to evaluate, in milliseconds; {@link CONTRACT_TIMEOUT_MS} when left
   * out.
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
 * Loads the default export of each `contract.ts`, in four steps.
 *
 * 1. The turn gate. A file under a folder an agent turn holds is not read, checked or evaluated: the
 *    answer is the value it had when this process last evaluated it, or `held`. Nothing the turn
 *    writes, to the contract or to a file it imports, runs before the turn is settled. A turn that
 *    begins while a contract is being evaluated stops it there: the check process is killed, no
 *    module of that contract is loaded or starts running in this process afterwards, and its value
 *    is dropped.
 * 2. The import check, on the source, before anything runs. It follows relative imports (from where a
 *    symlink points) and rejects any that is not a `.ts` file, has a query or a hash, or leaves the
 *    layout's folder and `layouts/_shared/`, and any package other than `effect`,
 *    `@deckster/engine/layout`, `@deckster/engine/command`, `@deckster/kit/layout-fields` and
 *    `@deckster/brand`. It also rejects `import.meta.glob` and the names Vite's runner gives a
 *    module. `import type` and `export type` declarations are not followed, since they are erased.
 * 3. The check process (see `checkContracts`): one Node process for the batch, under Node's permission
 *    model, evaluates the contracts first. It may read only the framework and its dependencies, and
 *    may not write files, start processes or workers, load addons or use the network; a contract
 *    that reaches for Node at all (built-in modules through `process`, a native `import()`,
 *    `fetch`, `process.exit`) fails, even when it catches the error. It is killed outright when it
 *    is done, at the deadline and when a turn holds one of its contracts, so nothing of a hung
 *    contract keeps running there. Only what each contract came to (loaded, no default export, an
 *    error message) comes back.
 * 4. The loader: the contracts that passed the check are evaluated again in this process, because
 *    callers need their schemas as live Effect values (refinements, defaults and transformations
 *    are functions, which cannot cross a process boundary). One Vite environment serves both runs
 *    and is closed afterwards, so an edited contract or helper is read afresh on the next call, and
 *    each file is read once per batch, so this process runs the text the check process ran. Vite
 *    runs only the workspace files the import check followed, and no Node built-in; `effect` and
 *    `@deckster/*` are imported by Node from this package, so a contract's schema is built with the
 *    same `effect` as the caller's. The contracts are evaluated at the same time against one
 *    deadline; a contract that has not finished by then fails, and the others still load. The
 *    environment is closed at once, and no module starts running in it afterwards.
 *
 * The check process contains what a contract does while it is checked. The second run is not
 * contained: it has this process's rights, and code of it that is still running after an `await`
 * when a turn begins or the deadline passes can finish, with further workspace modules blocked. It
 * only runs code that already loaded cleanly under the permission model, so what escapes is a
 * contract written to act differently in this process (one that tells the two apart, or waits until
 * after its check to act), and the functions it carries (its `checks`, its schema's refinements,
 * defaults and transformations), which run here whenever a slide is validated.
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
): Effect.fn.Return<readonly ContractLoad[], never, FileSystem.FileSystem | Scope.Scope> {
  const sources = new Map<string, string>();
  const heldRoots = new Set<string>();
  // The snapshot could include bytes read during a turn that ended before scanning did.
  const stopListening = onCodeHeld((roots) => roots.forEach((root) => heldRoots.add(root)));
  yield* Effect.addFinalizer(() => Effect.sync(stopListening));
  const scanned = yield* Effect.forEach(files, (file) =>
    checkBeforeLoad(file, options.root, sources),
  );
  const checked = scanned.map((entry) =>
    entry.kind === 'ready' && heldDuringScan(entry, heldRoots) ? heldLoad(entry.file) : entry,
  );
  const ready = checked.flatMap((entry) => (entry.kind === 'ready' ? [entry.file] : []));
  if (ready.length === 0) {
    return checked.filter((entry) => entry.kind !== 'ready');
  }

  const allowed = new Map<string, string[]>();
  for (const entry of checked) {
    if (entry.kind !== 'ready') {
      continue;
    }

    for (const real of [entry.file, ...entry.checked]) {
      allowed.set(real, [...(allowed.get(real) ?? []), entry.file]);
    }
  }

  const evaluation = yield* Effect.promise(() =>
    evaluateContracts(ready, options.root, {
      allowed,
      sources,
      timeoutMs: options.timeoutMs ?? CONTRACT_TIMEOUT_MS,
    }),
  );
  const evaluated = new Map(evaluation.loads.map((load) => [load.file, load]));
  return checked.map((entry) =>
    entry.kind === 'ready' ? (evaluated.get(entry.file) ?? failed(entry.file, notRun())) : entry,
  );
}, Effect.scoped);

/**
 * Evaluates contract files at the same time, first in the check process and then, for those that
 * passed, in this one, in one Vite environment that it closes afterwards. If an agent turn holds a
 * contract or one of its imports during the batch, its new export is discarded. This is the loader
 * of {@link importContracts} without the import check; call that instead.
 *
 * @param files - Absolute `contract.ts` paths.
 * @param root - The absolute workspace root.
 * @param options - The files the environment may run, and how long the batch may take.
 * @returns Each file's outcome, and the files Vite ran.
 */
export async function evaluateContracts(
  files: readonly string[],
  root: string,
  options: EvaluateContractsOptions = {},
): Promise<ContractEvaluation> {
  const gate = batchGate(files, options.allowed);
  claimNodeEnv();
  try {
    const { loads, inlined } = await runInEnvironment(files, root, options, gate);
    const published = loads.map((load) => {
      if (gate.isHeld(load.file)) {
        return heldLoad(load.file);
      }

      if (load.kind === 'loaded') {
        rememberLoaded(load.file, load.exported);
      }

      return load;
    });
    return { loads: published, inlined };
  } catch (error) {
    return { loads: files.map((file) => failed(file, loadFailure(error))), inlined: [] };
  } finally {
    gate.stopListening();
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
 * Whether a hold began while any source in the contract's graph could have been read.
 *
 * @param contract - The contract and the files scanned for it.
 * @param heldRoots - Absolute roots held during the scan.
 */
function heldDuringScan(contract: ReadyContract, heldRoots: ReadonlySet<string>): boolean {
  for (const root of heldRoots) {
    for (const file of [contract.file, ...contract.checked]) {
      const relative = path.relative(root, file);
      if (
        relative !== '..' &&
        !relative.startsWith(`..${path.sep}`) &&
        !path.isAbsolute(relative)
      ) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Applies the turn gate and the import check to one contract file.
 *
 * @param file - The absolute `contract.ts` path.
 * @param root - The absolute workspace root.
 * @param sources - The text already read and scanned during this batch.
 */
const checkBeforeLoad = Effect.fn('checkBeforeLoad')(function* (
  file: string,
  root: string,
  sources: Map<string, string>,
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

  const { problems, checked } = yield* importProblems(file, root, sources);
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
 * @param error - What was thrown, or its message.
 */
function loadFailure(error: unknown): ContractProblem {
  return {
    code: 'layout-load-failed',
    message: `Loading it failed: ${error instanceof Error ? error.message : String(error)}`,
    fix: `Fix that error. ${EXPORT_FIX}`,
  };
}

/**
 * The problem for a contract that has no default export.
 */
function noDefaultExport(): ContractProblem {
  return { code: 'layout-load-failed', message: 'It has no default export.', fix: EXPORT_FIX };
}

/**
 * The problem for what the check process made of a contract that did not pass it.
 *
 * @param verdict - The verdict.
 * @param timeoutMs - The time the batch had, in milliseconds, for the message.
 */
function verdictProblem(
  verdict: Exclude<CheckVerdict, { kind: 'passed' | 'held' }>,
  timeoutMs: number,
): ContractProblem {
  switch (verdict.kind) {
    case 'no-default': {
      return noDefaultExport();
    }

    case 'timed-out': {
      return timedOut(timeoutMs);
    }

    case 'unchecked': {
      return {
        code: 'layout-load-failed',
        message: `It was not loaded: ${verdict.message}`,
        fix: 'Run the command again; if it happens again, report it.',
      };
    }

    case 'failed': {
      return verdict.reason === 'denied'
        ? {
            code: 'layout-load-failed',
            message: `Loading it was refused: ${verdict.message}`,
            fix: DENIED_FIX,
          }
        : loadFailure(verdict.message);
    }
  }
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
 * @param sources - The text already read and scanned during this batch.
 */
const importProblems = Effect.fn('importProblems')(function* (
  contractFile: string,
  root: string,
  sources: Map<string, string>,
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
    const text =
      sources.get(file) ??
      (yield* fs.readFileString(file).pipe(Effect.orElseSucceed(() => undefined)));
    if (text === undefined) {
      problems.push(`${shown} cannot be read.`);
      continue;
    }

    const source = scanSource(file, text);
    sources.set(file, text);
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

  if (!real.endsWith(CONTRACT_EXTENSION)) {
    return { problem: `does not resolve to a ${CONTRACT_EXTENSION} file` };
  }

  const isInside = allowed.dirs.some((dir) => real.startsWith(`${dir}${path.sep}`));
  return isInside
    ? { real }
    : { problem: `is outside the layout's own folder and layouts/${SHARED_LAYOUTS_DIR}/` };
});

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
 * Decides, for one batch, whether a module may still load or run in its environment.
 */
type BatchGate = ModuleGate & {
  /**
   * Whether an agent turn has held a contract of the batch or a file it imports.
   *
   * @param contract - The contract's path, as given.
   */
  readonly isHeld: (contract: string) => boolean;

  /**
   * Ends the batch: nothing loads or runs in its environment from now on.
   */
  readonly close: () => void;

  /**
   * Stops tracking holds after the batch's outcomes have been published.
   */
  readonly stopListening: () => void;
};

/**
 * The gate of one batch. Holds match paths as written and Vite's ids are resolved through symlinks,
 * so a module is matched to its contracts through `allowed`; without it, a hold on any contract of
 * the batch stops every module.
 *
 * @param files - The batch's `contract.ts` paths, as given.
 * @param allowed - The files that may run, with the contracts that import each.
 */
function batchGate(
  files: readonly string[],
  allowed: ReadonlyMap<string, readonly string[]> | undefined,
): BatchGate {
  const owners = new Map(
    [...(allowed ?? new Map<string, readonly string[]>())].map(([file, contracts]) => [
      normalizePath(file),
      contracts,
    ]),
  );
  const held = new Set<string>();
  /**
   * Remembers holds even if they end before a pending import returns.
   */
  const noteHolds = (): void => {
    const heldContracts = files.filter((file) => isCodeHeld(file));
    if (allowed === undefined && heldContracts.length > 0) {
      files.forEach((file) => held.add(file));
      return;
    }

    heldContracts.forEach((file) => held.add(file));
    for (const [file, contracts] of allowed ?? []) {
      if (isCodeHeld(file)) {
        contracts.forEach((contract) => held.add(contract));
      }
    }
  };
  const stopListening = onCodeHeld(noteHolds);
  noteHolds();

  let closed = false;
  return {
    isHeld: (contract) => held.has(contract),
    refusal: (file) => {
      if (closed) {
        return 'the load of its contracts is over';
      }

      const contracts =
        allowed === undefined || file === undefined
          ? files
          : (owners.get(normalizePath(file)) ?? []);
      const invalidated =
        (file !== undefined && isCodeHeld(file)) ||
        contracts.some((contract) => held.has(contract));
      return invalidated ? 'an agent turn held the contract that imports it' : undefined;
    },
    close: () => {
      closed = true;
    },
    stopListening,
  };
}

/**
 * A Vite plugin that refuses to load any file outside `allowed`, so a file only a transform or the
 * runner's own import function names (not the import check) never runs, and any file the batch's
 * gate refuses: once a turn holds a contract or the batch is over. It uses the scanned text, or
 * reads each file once when the caller did not scan it, so both evaluations use the same source.
 *
 * @param allowed - The absolute files that may run, with symlinks resolved; every file when left
 *   out.
 * @param gate - The batch's gate.
 * @param sources - The exact text scanned by the import check, if available.
 */
function loadGuard(
  allowed: ReadonlyMap<string, readonly string[]> | undefined,
  gate: BatchGate,
  sources: ReadonlyMap<string, string> | undefined,
): Plugin {
  // Vite's ids use forward slashes on every platform.
  const files = allowed === undefined ? undefined : new Set([...allowed.keys()].map(normalizePath));
  const texts = new Map<string, string | Promise<string>>(
    [...(sources ?? [])].map(([file, text]) => [normalizePath(file), text]),
  );
  return {
    name: 'deckster:contract-load-guard',
    enforce: 'pre',
    load(id) {
      const file = id.replace(QUERY_SUFFIX_PATTERN, '');
      if (file.startsWith(VIRTUAL_ID_PREFIX)) {
        return null;
      }

      const reason = gate.refusal(file);
      if (reason !== undefined) {
        throw new Error(`${file} may not run: ${reason}.`);
      }

      if (files !== undefined && !files.has(normalizePath(file))) {
        throw new Error(`${file} was not checked as an import of a contract, so it may not run.`);
      }

      const key = normalizePath(file);
      const text = texts.get(key) ?? readFile(file, 'utf8');
      texts.set(key, text);
      return text;
    },
  };
}

/**
 * Builds the environment, has the check process evaluate the files, evaluates those that passed in
 * it at the same time against one deadline and closes it. The gate closes before the environment
 * does, at the deadline at the latest.
 *
 * @param files - Absolute `contract.ts` paths.
 * @param root - The absolute workspace root.
 * @param options - The files that may run, and how long the batch may take.
 * @param gate - The batch's gate.
 */
async function runInEnvironment(
  files: readonly string[],
  root: string,
  options: EvaluateContractsOptions,
  gate: BatchGate,
): Promise<ContractEvaluation> {
  const config = await resolveConfig(
    {
      root,
      configFile: false,
      plugins: [loadGuard(options.allowed, gate, options.sources)],
      envDir: false,
      envPrefix: [],
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
    runnerOptions: { hmr: false, evaluator: new PackageEvaluator(gate) },
    hot: false,
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await environment.init();
    const timeoutMs = options.timeoutMs ?? CONTRACT_TIMEOUT_MS;
    const verdicts = await checkContracts({
      files,
      environment,
      timeoutMs,
      isHeld: (file) => gate.isHeld(file),
    });
    const deadline = new Promise<typeof TIMED_OUT>((resolve) => {
      timer = setTimeout(() => {
        gate.close();
        resolve(TIMED_OUT);
      }, timeoutMs);
      timer.unref();
    });
    /**
     * Imports a module in the environment.
     *
     * @param id - The module.
     */
    const run = (id: string) => environment.runner.import(id);
    const loads = await Promise.all(
      files.map((file) =>
        evaluateContract(file, verdicts.get(file), { run, deadline, timeoutMs, gate }),
      ),
    );
    // A module handed to Node carries `externalize` in what Vite fetched for it.
    const inlined = [...environment.runner.evaluatedModules.urlToIdModuleMap.values()]
      .filter((module) => module.meta !== undefined && !('externalize' in module.meta))
      .map((module) => module.file);
    return { loads, inlined };
  } finally {
    clearTimeout(timer);
    gate.close();
    await environment.close();
  }
}

/**
 * How this process evaluates the contracts that passed the check.
 */
type InProcessRun = {
  /**
   * Imports a module in the environment.
   */
  readonly run: (id: string) => Promise<unknown>;

  /**
   * Settles with {@link TIMED_OUT} when the batch's time is up.
   */
  readonly deadline: Promise<typeof TIMED_OUT>;

  /**
   * The time the batch has, in milliseconds, for the message.
   */
  readonly timeoutMs: number;

  /**
   * The batch's gate.
   */
  readonly gate: BatchGate;
};

/**
 * Evaluates one contract file that passed the check, unless an agent turn holds it; a contract that
 * did not pass is answered from its verdict and never runs here. A turn that begins while the file
 * runs may have changed it, or a file it imports, under the import, so its value is dropped then
 * too, as is an error the gate threw because of that turn.
 *
 * @param file - The absolute `contract.ts` path.
 * @param verdict - What the check process made of it.
 * @param inProcess - How to evaluate it here.
 */
async function evaluateContract(
  file: string,
  verdict: CheckVerdict | undefined,
  inProcess: InProcessRun,
): Promise<ContractLoad> {
  const { run, deadline, timeoutMs, gate } = inProcess;
  if (gate.isHeld(file) || verdict?.kind === 'held') {
    return heldLoad(file);
  }

  if (verdict === undefined) {
    return failed(file, notRun());
  }

  if (verdict.kind !== 'passed') {
    return failed(file, verdictProblem(verdict, timeoutMs));
  }

  try {
    const module = await Promise.race([run(file), deadline]);
    if (gate.isHeld(file)) {
      return heldLoad(file);
    }

    if (module === TIMED_OUT) {
      return failed(file, timedOut(timeoutMs));
    }

    const exported = Predicate.isObject(module) ? Reflect.get(module, 'default') : undefined;
    if (exported === undefined) {
      return failed(file, noDefaultExport());
    }

    return { file, kind: 'loaded', exported };
  } catch (error) {
    return gate.isHeld(file) ? heldLoad(file) : failed(file, loadFailure(error));
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
      `It did not finish loading within ${timeoutMs} ms, the time all contracts have together: ` +
      'a top-level await in it or in a file it imports never settles, or code in it, or in a ' +
      'contract loaded with it, never stops running.',
    fix:
      'Do not wait at the top level of a contract or its helpers for something that may never ' +
      'happen, and do not loop without end. When several contracts time out together, fix the one ' +
      'that hangs and the others load again.',
  };
}
