/**
 * The check process of a contract batch: the server forks it under Node's permission model (reads
 * of the framework and its dependencies only; no writes, child processes, workers, addons, WASI,
 * inspector or network) and kills it at the batch's deadline or when an agent turn holds a contract
 * of the batch. It evaluates the contracts with Vite's module runner, fetching every module from
 * the server's environment, so it runs exactly the code the server checked and later loads, and
 * reads no workspace file itself. It reports what became of each contract; nothing it evaluates
 * leaves it.
 *
 * Besides what the permission model refuses, it fails a contract that reaches for Node at all
 * (`process.getBuiltinModule`, `process.binding`, a native `import()`, `fetch`, `process.exit` and
 * the like), even when the contract catches the error, because the server evaluates the contract
 * again afterwards with its own rights.
 *
 * It may import only `node:` modules, the module runner and the files beside it that import nothing
 * else, so that it starts fast and needs no addon.
 */
import { AsyncLocalStorage, createHook } from 'node:async_hooks';
import { EventEmitter } from 'node:events';
import { registerHooks } from 'node:module';
import { setImmediate as nextTurn } from 'node:timers/promises';
import {
  EvaluatedModules,
  ModuleRunner,
  type EvaluatedModuleNode,
  type ModuleRunnerContext,
  type ModuleRunnerTransport,
} from 'vite/module-runner';

import type { CheckFailure, CheckMessage, ServerMessage } from '#layouts/contract-protocol.ts';

import { PackageEvaluator } from '#layouts/contract-evaluator.ts';

/**
 * The packages the process imports before it says it is ready, so their loading time does not count
 * against the batch's deadline. Every contract imports them.
 */
const WARM_PACKAGES = ['effect', '@deckster/engine/layout'];

/**
 * The permissions the process must not have, by the scope `process.permission.has` takes.
 */
const DENIED_SCOPES = ['fs.write', 'child', 'worker', 'addon', 'wasi', 'net', 'inspector'];

/**
 * The members of `process` a contract may not use: each reaches Node itself (built-in modules,
 * native bindings and addons), controls this or another process (including the IPC channel to the
 * server, whose messages a contract could otherwise forge), or writes a file. The underscored ones
 * are the internals the public ones call.
 */
const PROCESS_TRAPS = [
  'getBuiltinModule',
  'binding',
  '_linkedBinding',
  'dlopen',
  'kill',
  '_kill',
  '_debugProcess',
  '_debugEnd',
  'exit',
  'reallyExit',
  'abort',
  'execve',
  'send',
  '_send',
  'disconnect',
  'error',
  '_disconnect',
  'report',
  'loadEnvFile',
  'setSourceMapsEnabled',
  'chdir',
  'setuid',
  'setgid',
  'seteuid',
  'setegid',
  'setgroups',
  'initgroups',
  'setUncaughtExceptionCaptureCallback',
];

/**
 * Process events that affect lifecycle, crash handling or the channel to the server.
 */
const PROCESS_EVENTS = new Set([
  'beforeExit',
  'exit',
  'uncaughtException',
  'uncaughtExceptionMonitor',
  'unhandledRejection',
  'rejectionHandled',
  'disconnect',
  'message',
  'internalMessage',
  'newListener',
  'removeListener',
]);

/**
 * Process APIs that add or remove event listeners, including APIs that wrap another method here.
 */
const PROCESS_LISTENER_METHODS = [
  'on',
  'once',
  'addListener',
  'prependListener',
  'prependOnceListener',
  'off',
  'removeListener',
  'removeAllListeners',
];

/**
 * The globals a contract may not use: each reaches the network.
 */
const GLOBAL_TRAPS = ['fetch', 'WebSocket', 'EventSource'];

/**
 * The URL of the module runner's own file, which is the importer Node sees for a native `import()`
 * in code the runner evaluates.
 */
const RUNNER_URL = import.meta.resolve('vite/module-runner');

/**
 * The contract file whose evaluation the running code belongs to, as Node carries it across
 * `await`s, timers and promise callbacks.
 */
const owner = new AsyncLocalStorage<string>();

/**
 * The module running within the contract, carried across asynchronous callbacks.
 */
const moduleOwner = new AsyncLocalStorage<string>();

/**
 * Vite's graph of modules requested during the batch. A shared module can be evaluated only once
 * even though more than one contract imports it.
 */
const modules = new EvaluatedModules();

/**
 * Sends a message to the server; captured before any contract runs, which then finds no
 * `process.send`.
 */
const send = captureSend();

/**
 * Ends this process; captured before any contract runs, which then finds `process.exit` trapped.
 *
 * @param code - The exit code.
 */
function exit(code: number): void {
  asProcess(() => {
    process.exit(code);
  });
}

/**
 * What the process knows about each contract of the batch.
 */
const STATE = {
  /**
   * The contracts of the batch.
   */
  files: new Set<string>(),

  /**
   * The contracts already reported as loaded, by file.
   */
  reported: new Set<string>(),

  /**
   * The first thing each contract used that it may not, by file.
   */
  denied: new Map<string, string>(),

  /**
   * Refusals by module id, including those in a shared module before all importers reached it.
   */
  deniedModules: new Map<string, string>(),

  /**
   * Vite's resolved module id for each main contract file.
   */
  roots: new Map<string, string>(),

  /**
   * The calls of the module runner waiting for the server, by id.
   */
  pending: new Map<number, (answer: unknown) => void>(),

  /**
   * The id of the next call.
   */
  nextId: 0,

  /**
   * Whether contracts may be running, so the traps refuse.
   */
  armed: false,

  /**
   * Whether this process's own code is calling a trapped member (sending to the server, exiting),
   * which the traps let through. It is set and cleared around a synchronous call, so no contract
   * code runs while it is set.
   */
  internal: false,
};

/**
 * Runs this process's own call of trapped members, synchronously.
 *
 * @param call - The call.
 */
function asProcess(call: () => void): void {
  STATE.internal = true;
  try {
    call();
  } finally {
    STATE.internal = false;
  }
}

/**
 * Captures `process.send`, which a forked process has.
 */
function captureSend(): (message: CheckMessage, callback?: (error: Error | null) => void) => void {
  const original = process.send?.bind(process);
  if (original === undefined) {
    process.stderr.write('The contract check process must be started by the server.\n');
    process.exit(1);
  }

  return (message, callback) => {
    asProcess(() => {
      if (callback === undefined) {
        original(message);
      } else {
        original(message, callback);
      }
    });
  };
}

/**
 * Notes that the running code used something a contract may not, and reports it at once for a
 * contract that was already reported as loaded. Code outside any contract's evaluation is charged
 * to every contract of the batch.
 *
 * @param what - What it used, as a sentence.
 */
function deny(what: string): void {
  const file = owner.getStore();
  const id = moduleOwner.getStore();
  if (id !== undefined && !STATE.deniedModules.has(id)) {
    STATE.deniedModules.set(id, what);
  }

  for (const contract of STATE.files) {
    if (file === undefined || contract === file) {
      denyContract(contract, what);
    } else {
      applyModuleDenials(contract);
    }
  }
}

/**
 * Applies refusals from modules this contract has imported, including cached modules.
 *
 * @param file - The contract's absolute path.
 */
function applyModuleDenials(file: string): void {
  for (const [id, what] of STATE.deniedModules) {
    if (importsModule(file, id)) {
      denyContract(file, what);
      return;
    }
  }
}

/**
 * Whether the contract reaches the module through Vite's dependency graph.
 *
 * @param file - The contract's absolute path.
 * @param id - The module's resolved id.
 */
function importsModule(file: string, id: string): boolean {
  const root = STATE.roots.get(file);
  if (root === undefined) {
    return false;
  }

  const pending = new Set([id]);
  for (const current of pending) {
    if (current === root) {
      return true;
    }

    for (const importer of modules.getModuleById(current)?.importers ?? []) {
      pending.add(importer);
    }
  }

  return false;
}

/**
 * Records a contract's first refusal and supersedes an earlier provisional load.
 *
 * @param file - The contract.
 * @param what - Why it was refused.
 */
function denyContract(file: string, what: string): void {
  if (STATE.denied.has(file)) {
    return;
  }

  STATE.denied.set(file, what);
  if (STATE.reported.has(file)) {
    report(file, 'denied', what);
  }
}

/**
 * Reports a crash before exiting so the server can invalidate even the provisional loads.
 *
 * @param event - The fatal process event.
 * @param error - The thrown error or rejection reason.
 */
function crash(event: string, error: unknown): void {
  const detail = error instanceof Error ? error.message : String(error);
  send(
    {
      type: 'crashed',
      file: owner.getStore() ?? null,
      message: `The contract check process stopped after ${event}: ${detail}`,
    },
    () => exit(1),
  );
}

/**
 * Sends a failure.
 *
 * @param file - The contract.
 * @param reason - Why it failed.
 * @param message - What went wrong.
 */
function report(file: string, reason: CheckFailure, message: string): void {
  send({ type: 'failed', file, reason, message });
}

/**
 * The error a trap throws, after noting the use.
 *
 * @param name - What was used.
 */
function trapped(name: string): Error {
  const what = `It used \`${name}\`, which a contract may not use.`;
  deny(what);
  return new Error(what);
}

/**
 * Replaces members of `process` and globals that a contract may not use with traps, which refuse
 * while contracts run. A member that cannot be replaced makes the process unsafe.
 *
 * @returns What could not be replaced, or `undefined`.
 */
function setTraps(): string | undefined {
  // The globals first: reading `fetch` loads Node's own modules, which still set members of
  // `process`.
  const targets: [object, string, string][] = [
    ...GLOBAL_TRAPS.map((name): [object, string, string] => [globalThis, name, name]),
    ...PROCESS_TRAPS.map((name): [object, string, string] => [process, name, `process.${name}`]),
  ];
  for (const [target, key, name] of targets) {
    const original: unknown = Reflect.get(target, key);
    const ok = Reflect.defineProperty(target, key, {
      configurable: false,
      get: () => {
        if (!trapsArmed()) {
          return original;
        }

        throw trapped(name);
      },
    });
    if (!ok) {
      return `${name} could not be replaced`;
    }
  }

  return setProcessStateTraps();
}

/**
 * The traps allow the checker's own synchronous process calls.
 */
function trapsArmed(): boolean {
  return STATE.armed && !STATE.internal;
}

/**
 * Installs read-preserving traps for process state and lifecycle listeners.
 */
function setProcessStateTraps(): string | undefined {
  const env = new Proxy(process.env, {
    set: () => {
      throw trapped('process.env');
    },
    deleteProperty: () => {
      throw trapped('process.env');
    },
    defineProperty: () => {
      throw trapped('process.env');
    },
  });
  const title = process.title;
  for (const [key, read] of [
    ['env', () => env],
    ['title', () => title],
  ] as const) {
    if (
      !Reflect.defineProperty(process, key, {
        configurable: false,
        enumerable: true,
        get: read,
        set: () => {
          throw trapped(`process.${key}`);
        },
      })
    ) {
      return `process.${key} could not be replaced`;
    }
  }

  for (const key of ['umask', ...PROCESS_LISTENER_METHODS]) {
    const original: unknown = Reflect.get(process, key);
    if (
      typeof original !== 'function' ||
      !Reflect.defineProperty(process, key, {
        configurable: false,
        writable: false,
        value: (...args: unknown[]) => {
          if (trapsArmed() && mutatesProcess(key, args)) {
            throw trapped(`process.${key}`);
          }

          return Reflect.apply(original, process, args);
        },
      })
    ) {
      return `process.${key} could not be replaced`;
    }
  }

  const emitter: object = EventEmitter.prototype;
  for (const key of PROCESS_LISTENER_METHODS) {
    const original: unknown = Reflect.get(emitter, key);
    if (
      typeof original !== 'function' ||
      !Reflect.defineProperty(emitter, key, {
        configurable: false,
        writable: false,
        value: function (this: unknown, ...args: unknown[]) {
          if (this === process && trapsArmed() && mutatesProcess(key, args)) {
            throw trapped(`process.${key}`);
          }

          return Reflect.apply(original, this, args);
        },
      })
    ) {
      return `EventEmitter.prototype.${key} could not be replaced`;
    }
  }

  return undefined;
}

/**
 * Whether a wrapped process method would change the umask or lifecycle listeners.
 *
 * @param key - The process method.
 * @param args - Its arguments.
 */
function mutatesProcess(key: string, args: readonly unknown[]): boolean {
  if (key === 'umask') {
    return args.length > 0;
  }

  const [event] = args;
  return (
    (key === 'removeAllListeners' && args.length === 0) ||
    (typeof event === 'string' && (event.startsWith('SIG') || PROCESS_EVENTS.has(event)))
  );
}

/**
 * Refuses a native `import()` from code the module runner evaluates: Vite rewrites every import of
 * a contract, so only code built at run time (`eval`) imports natively, and Node names the runner's
 * own file as its importer. The packages a contract may import load their own files and built-ins
 * as they need.
 */
function refuseNativeImports(): void {
  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (STATE.armed && context.parentURL === RUNNER_URL) {
        throw trapped(`import("${specifier}")`);
      }

      return nextResolve(specifier, context);
    },
  });
}

/**
 * The permissions this process has that it must not have.
 */
function extraPermissions(): string[] {
  const { permission } = process;
  if (permission === undefined) {
    return ['every permission (the permission model is off)'];
  }

  // A scope that cannot be asked about cannot be shown to be denied.
  return DENIED_SCOPES.filter((scope) => {
    try {
      return permission.has(scope);
    } catch {
      return true;
    }
  });
}

/**
 * The transport of the module runner: each call goes to the server's environment.
 */
const transport: ModuleRunnerTransport = {
  /**
   * Sends a call and waits for the answer.
   *
   * @param payload - Vite's `vite:invoke` payload.
   */
  invoke: (payload) =>
    new Promise((resolve) => {
      const data: unknown = 'data' in payload ? payload.data : undefined;
      const name: unknown =
        typeof data === 'object' && data !== null ? Reflect.get(data, 'name') : '';
      const args: unknown =
        typeof data === 'object' && data !== null ? Reflect.get(data, 'data') : [];
      const id = STATE.nextId;
      STATE.nextId += 1;
      STATE.pending.set(id, resolve as (answer: unknown) => void);
      send({
        type: 'invoke',
        id,
        name: String(name),
        args: Array.isArray(args) ? args : [],
      });
    }),
};

/**
 * Adds module attribution to refusals in the child, including those thrown by the evaluator.
 */
class CheckEvaluator extends PackageEvaluator {
  /**
   * Records the root module, then carries the current module across its asynchronous work.
   *
   * @param context - What the transformed code is called with.
   * @param code - The transformed code.
   * @param module - The module being evaluated.
   */
  override runInlinedModule(
    context: ModuleRunnerContext,
    code: string,
    module: Readonly<EvaluatedModuleNode>,
  ): Promise<void> {
    const file = owner.getStore();
    if (file !== undefined && moduleOwner.getStore() === undefined) {
      STATE.roots.set(file, module.id);
    }

    return moduleOwner.run(module.id, () => super.runInlinedModule(context, code, module));
  }

  /**
   * Charges an import refusal to the active module, even if the module catches the error.
   *
   * @param file - The refused specifier.
   */
  protected override refuseImport(file: string): Error {
    const error = super.refuseImport(file);
    deny(error.message);
    return error;
  }
}

/**
 * Timer resources started by a contract. A detached callback must settle before its contract can
 * pass, so a timer which throws after the module returns cannot reach the server.
 */
const timers = new Map<number, { file: string; id: string | undefined }>();

/**
 * Contracts waiting for their timers to settle.
 */
const timerWaiters = new Set<() => void>();

/**
 * Tracks timers registered while the module runner is evaluating contracts.
 */
const timerHook = createHook({
  /**
   * Remembers timers and immediates owned by a contract or a helper.
   *
   * @param asyncId - The resource id.
   * @param type - The type of async resource.
   */
  init: (asyncId, type) => {
    const file = owner.getStore();
    if (file !== undefined && (type === 'Timeout' || type === 'Immediate')) {
      timers.set(asyncId, { file, id: moduleOwner.getStore() });
    }
  },

  /**
   * Keeps the loop moving long enough to deliver a timer's destroy hook when IPC is otherwise idle.
   *
   * @param asyncId - The resource that just ran its callback.
   */
  after: (asyncId) => {
    if (timers.has(asyncId)) {
      owner.exit(() => {
        void nextTurn();
      });
    }
  },

  /**
   * Wakes contracts after a callback completes or its timer is cleared.
   *
   * @param asyncId - The resource id.
   */
  destroy: (asyncId) => {
    if (timers.delete(asyncId)) {
      for (const wake of timerWaiters) {
        wake();
      }
    }
  },
});

/**
 * Waits for detached timer callbacks of a contract and its evaluated dependencies.
 *
 * @param file - The contract.
 */
function waitForTimers(file: string): Promise<void> {
  return new Promise((resolve) => {
    /**
     * Finishes when the contract and its dependencies have no active timers.
     */
    const wake = (): void => {
      for (const timer of timers.values()) {
        if (timer.file === file || (timer.id !== undefined && importsModule(file, timer.id))) {
          return;
        }
      }

      timerWaiters.delete(wake);
      resolve();
    };
    timerWaiters.add(wake);
    wake();
  });
}

/**
 * Evaluates one contract and reports it.
 *
 * @param runner - The module runner of the batch.
 * @param file - The absolute `contract.ts` path.
 */
async function check(runner: ModuleRunner, file: string): Promise<void> {
  try {
    const module: unknown = await owner.run(file, () => runner.import(file));
    // Node delivers unhandled rejections after it drains the promise microtask queue.
    await nextTurn();
    applyModuleDenials(file);
    if (!STATE.denied.has(file)) {
      await waitForTimers(file);
      applyModuleDenials(file);
    }

    const denied = STATE.denied.get(file);
    if (denied !== undefined) {
      report(file, 'denied', denied);
      return;
    }

    const exported =
      typeof module === 'object' && module !== null ? Reflect.get(module, 'default') : undefined;
    STATE.reported.add(file);
    send({ type: exported === undefined ? 'no-default' : 'loaded', file });
  } catch (error) {
    applyModuleDenials(file);
    const denied = STATE.denied.get(file) ?? deniedMessage(error);
    if (denied === undefined) {
      report(file, 'error', error instanceof Error ? error.message : String(error));
    } else {
      report(file, 'denied', denied);
    }
  }
}

/**
 * The sentence for an error the permission model threw, or `undefined` for any other error.
 *
 * @param error - What a contract threw.
 */
function deniedMessage(error: unknown): string | undefined {
  if (!(error instanceof Error) || Reflect.get(error, 'code') !== 'ERR_ACCESS_DENIED') {
    return undefined;
  }

  const permission: unknown = Reflect.get(error, 'permission');
  const resource: unknown = Reflect.get(error, 'resource');
  const what = typeof permission === 'string' ? permission : 'a permission';
  const on = typeof resource === 'string' && resource !== '' ? ` on ${resource}` : '';
  return `It needed ${what}${on}, which a contract does not have.`;
}

/**
 * Evaluates the batch, each contract at the same time, and says when all are done.
 *
 * @param files - The absolute `contract.ts` paths.
 */
async function run(files: readonly string[]): Promise<void> {
  for (const file of files) {
    STATE.files.add(file);
  }

  const runner = new ModuleRunner(
    { transport, hmr: false, sourcemapInterceptor: false, evaluatedModules: modules },
    new CheckEvaluator(),
  );
  STATE.armed = true;
  timerHook.enable();
  await Promise.all(files.map((file) => check(runner, file)));
  for (const file of files) {
    applyModuleDenials(file);
  }

  send({ type: 'done' });
}

/**
 * Handles a message of the server.
 *
 * @param message - What arrived.
 */
function onMessage(message: ServerMessage): void {
  if (message.type === 'run') {
    void run(message.files);
    return;
  }

  const resolve = STATE.pending.get(message.id);
  STATE.pending.delete(message.id);
  resolve?.(message.answer);
}

/**
 * Starts the process: checks its permissions, loads the packages every contract imports, sets the
 * traps and says it is ready.
 */
async function start(): Promise<void> {
  process.on('message', onMessage);
  process.on('unhandledRejection', (error) => crash('an unhandled rejection', error));
  process.on('uncaughtException', (error) => crash('an uncaught exception', error));
  // The server is gone: nothing may outlive it.
  process.on('disconnect', () => exit(0));
  const extra = extraPermissions();
  if (extra.length > 0) {
    send({ type: 'unsafe', message: `It may still use ${extra.join(', ')}.` });
    return;
  }

  for (const name of WARM_PACKAGES) {
    await import(/* @vite-ignore */ import.meta.resolve(name));
  }

  let unsafe: string | undefined;
  try {
    refuseNativeImports();
    unsafe = setTraps();
  } catch (error) {
    unsafe = `The traps could not be installed: ${String(error)}`;
  }

  send(unsafe === undefined ? { type: 'ready' } : { type: 'unsafe', message: unsafe });
}

await start();
