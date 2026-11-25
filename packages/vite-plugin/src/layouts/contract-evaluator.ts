import { builtinModules } from 'node:module';
import {
  ESModulesEvaluator,
  ssrDynamicImportKey,
  ssrImportKey,
  type EvaluatedModuleNode,
  type ModuleRunnerContext,
} from 'vite/module-runner';

/**
 * The packages a contract may import, besides the entry points of `effect`.
 */
export const CONTRACT_PACKAGES: ReadonlySet<string> = new Set([
  'effect',
  '@deckster/engine/layout',
  '@deckster/engine/command',
  '@deckster/kit/layout-fields',
  '@deckster/brand',
]);

/**
 * The pattern for an `effect` entry point, such as `effect/Schema`.
 */
const EFFECT_ENTRY = /^effect\/[^?#]+$/;

/**
 * The packages Vite hands to Node so contracts share the process's framework and Effect instances.
 */
export const NODE_LOADED_PACKAGES = [...CONTRACT_PACKAGES, EFFECT_ENTRY] as const;

/**
 * Whether both the static check and the evaluator let a contract import a package.
 *
 * @param specifier - A bare package specifier or entry point.
 * @returns Whether it is on the contract package list.
 */
export function isContractPackage(specifier: string): boolean {
  return CONTRACT_PACKAGES.has(specifier) || EFFECT_ENTRY.test(specifier);
}

/**
 * The prefix of a Node built-in specifier.
 */
const NODE_PREFIX = 'node:';

/**
 * Dynamic import paths that Vite resolves as workspace files and checks through the load guard.
 */
const WORKSPACE_IMPORT = /^(?:\.\.?\/|\/|[a-z]:[/\\])/i;

/**
 * The Node built-ins that can be named without {@link NODE_PREFIX}.
 */
const NODE_BUILTINS: ReadonlySet<string> = new Set(builtinModules);

/**
 * Whether a specifier names a Node built-in, which the import check never lets a contract import.
 *
 * @param specifier - A specifier Vite handed to Node.
 * @returns Whether it is `node:` something or a bare built-in name.
 */
export function isNodeBuiltin(specifier: string): boolean {
  return specifier.startsWith(NODE_PREFIX) || NODE_BUILTINS.has(specifier);
}

/**
 * Decides whether a module may still start or go on running.
 */
export type ModuleGate = {
  /**
   * Why a module may not run now, or `undefined` when it may.
   *
   * @param file - The module's absolute file, with symlinks resolved, or `undefined` for one that
   *   names no file.
   */
  readonly refusal: (file: string | undefined) => string | undefined;
};

/**
 * The gate of a process that is killed instead of stopped: every module may run.
 */
const OPEN_GATE: ModuleGate = {
  /**
   * Never refuses.
   */
  refusal: () => undefined,
};

/**
 * Throws when the gate refuses a module.
 *
 * @param gate - The gate.
 * @param file - The module's absolute file, or `undefined`.
 */
function assertMayRun(gate: ModuleGate, file: string | undefined): void {
  const reason = gate.refusal(file);
  if (reason !== undefined) {
    throw new Error(`${file ?? 'A module'} may not run: ${reason}.`);
  }
}

/**
 * The evaluator of a contract batch, in the server process and in the check process alike. It hands
 * the packages in {@link NODE_LOADED_PACKAGES} to Node, resolved from this package (the workspace
 * links in the repository, the CLI's loader hooks when installed), and refuses every other module
 * Vite did not transform: Node built-ins, other packages and `data:` URLs. A workspace module runs
 * only while the gate lets it, checked before it starts and after each of its imports, so a module
 * whose imports were still loading when a turn began never runs its body.
 */
export class PackageEvaluator extends ESModulesEvaluator {
  /**
   * The batch's gate.
   */
  readonly #gate: ModuleGate;

  /**
   * Builds the evaluator of one batch.
   *
   * @param gate - The batch's gate; every module may run when left out.
   */
  constructor(gate: ModuleGate = OPEN_GATE) {
    super();
    this.#gate = gate;
  }

  /**
   * Runs a module Vite transformed, unless the gate refuses it.
   *
   * @param context - What the transformed code is called with.
   * @param code - The transformed code.
   * @param module - The module; the runner always passes it.
   */
  override runInlinedModule(
    context: ModuleRunnerContext,
    code: string,
    module?: Readonly<EvaluatedModuleNode>,
  ): Promise<void> {
    const file = module?.file ?? undefined;
    assertMayRun(this.#gate, file);
    const gate = this.#gate;
    const imported = context[ssrImportKey];
    const dynamic = context[ssrDynamicImportKey];
    return super.runInlinedModule(
      {
        ...context,
        [ssrImportKey]: async (...args: Parameters<typeof imported>) => {
          const value = await imported(...args);
          assertMayRun(gate, file);
          return value;
        },
        [ssrDynamicImportKey]: async (specifier, options) => {
          const id = String(specifier);
          if (!WORKSPACE_IMPORT.test(id) && !isContractPackage(id)) {
            throw this.refuseImport(id);
          }

          const value = await dynamic(id, options);
          assertMayRun(gate, file);
          return value;
        },
      },
      code,
    );
  }

  /**
   * Imports a module Vite did not transform.
   *
   * @param file - The specifier as the contract wrote it, or a file URL.
   */
  override runExternalModule(file: string): Promise<unknown> {
    if (!isContractPackage(file)) {
      return Promise.reject(this.refuseImport(file));
    }

    return import(/* @vite-ignore */ import.meta.resolve(file));
  }

  /**
   * Makes the error for a refused import. The check process also records the refusal here.
   *
   * @param file - The specifier Vite was asked to import.
   */
  protected refuseImport(file: string): Error {
    const reason = isNodeBuiltin(file)
      ? 'a Node built-in'
      : 'which is not a package a contract may import';
    return new Error(`A contract may not load "${file}", ${reason}.`);
  }
}
