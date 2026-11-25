import type { DevEnvironment } from 'vite';
import type { FetchFunctionOptions } from 'vite/module-runner';

import { FRAMEWORK_FS_ROOTS, HOOKS_ENV, nodeHookArguments, onCodeHeld } from '@deckster/brand/node';
import { fork, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  readCheckMessage,
  type CheckFailure,
  type CheckMessage,
  type ServerMessage,
} from '#layouts/contract-protocol.ts';

/**
 * The file the check process runs.
 */
const CHILD_ENTRY = fileURLToPath(new URL('contract-child.ts', import.meta.url));

/**
 * How long the check process may take to start, in milliseconds, before the batch's deadline
 * starts: it loads `effect` and the layout contract module first, which a cold disk or a busy CI
 * machine can make slow.
 */
const STARTUP_TIMEOUT_MS = 30_000;

/**
 * The longest delay Node's timers accept, in milliseconds. Larger delays fire almost immediately.
 */
const MAX_TIMEOUT_MS = 2 ** 31 - 1;

/**
 * The environment variables the check process gets; nothing else of the server's environment
 * reaches contract code there.
 */
const PASSED_ENV = ['NODE_ENV', 'TZ', 'SystemRoot'];

/**
 * What the check process made of one contract.
 */
export type CheckVerdict =
  | {
      /**
       * It loaded and has a default export, without using anything a contract may not use.
       */
      readonly kind: 'passed';
    }
  | {
      /**
       * It loaded and has no default export.
       */
      readonly kind: 'no-default';
    }
  | {
      /**
       * It threw, or used something a contract may not use.
       */
      readonly kind: 'failed';

      /**
       * Which of the two.
       */
      readonly reason: CheckFailure;

      /**
       * What went wrong, as a sentence; untrusted text from the check process.
       */
      readonly message: string;
    }
  | {
      /**
       * It had not finished when the batch's time was up, and the process was killed.
       */
      readonly kind: 'timed-out';
    }
  | {
      /**
       * An agent turn held it before or while it was checked, and the process was killed.
       */
      readonly kind: 'held';
    }
  | {
      /**
       * The check process could not check it: it did not start, ran without the permissions it must
       * have, or ended on its own.
       */
      readonly kind: 'unchecked';

      /**
       * What went wrong.
       */
      readonly message: string;
    };

/**
 * What {@link checkContracts} needs.
 */
export type CheckContractsOptions = {
  /**
   * The absolute `contract.ts` paths, as given.
   */
  readonly files: readonly string[];

  /**
   * The server's environment, whose `fetchModule` (and so its load guard) serves every module the
   * check process runs.
   */
  readonly environment: DevEnvironment;

  /**
   * How long the batch may take once the process has started, in milliseconds.
   */
  readonly timeoutMs: number;

  /**
   * Whether an agent turn holds a contract or a file it imports.
   */
  readonly isHeld: (file: string) => boolean;
};

/**
 * The check processes running, killed when the server exits.
 */
const LIVE = new Set<ChildProcess>();

/**
 * Whether the exit handler that kills {@link LIVE} is installed.
 */
const EXIT_HANDLER = {
  /**
   * Whether it is installed.
   */
  installed: false,
};

/**
 * Called with the process id of each check process that starts, for tests.
 */
const WATCHERS = new Set<(pid: number) => void>();

/**
 * Listens for check processes that start, so a test can prove one is gone.
 *
 * @param listener - Called with the process id.
 * @returns Stops listening.
 */
export function watchCheckProcesses(listener: (pid: number) => void): () => void {
  WATCHERS.add(listener);
  return () => {
    WATCHERS.delete(listener);
  };
}

/**
 * The `node` arguments a check process starts with: the CLI's loader hooks when installed, and
 * Node's permission model with reads of the framework and its dependencies (and the hooks) only.
 */
export function checkProcessArguments(): string[] {
  const hooks = process.env[HOOKS_ENV];
  const readable = [
    ...FRAMEWORK_FS_ROOTS,
    ...(hooks === undefined || hooks === '' ? [] : [path.dirname(hooks)]),
  ];
  return [
    ...nodeHookArguments(process.env),
    '--permission',
    ...readable.map((folder) => `--allow-fs-read=${folder}`),
  ];
}

/**
 * Evaluates a batch of contracts in a separate process under Node's permission model, before the
 * server evaluates any of them itself. The process is killed outright when it is done, at the
 * batch's deadline and as soon as an agent turn holds one of the contracts; then the contracts not
 * held that had no outcome yet are checked again in a new process, against what is left of the
 * deadline.
 *
 * It never fails: each contract's outcome is a value.
 *
 * @param options - The contracts, the server's environment, the time and the hold check.
 * @returns The verdict of each contract, by path as given.
 */
export async function checkContracts(
  options: CheckContractsOptions,
): Promise<ReadonlyMap<string, CheckVerdict>> {
  const verdicts = new Map<string, CheckVerdict>();
  const clock: Clock = { deadline: undefined };
  let pending = options.files;
  while (pending.length > 0) {
    for (const file of pending) {
      if (options.isHeld(file)) {
        verdicts.set(file, { kind: 'held' });
      }
    }

    const round = pending.filter((file) => !verdicts.has(file));
    if (round.length === 0) {
      break;
    }

    if (clock.deadline !== undefined && Date.now() >= clock.deadline) {
      for (const file of round) {
        verdicts.set(file, { kind: 'timed-out' });
      }

      break;
    }

    const result = await checkRound(round, options, clock);
    for (const [file, verdict] of result) {
      verdicts.set(file, verdict);
    }

    pending = round.filter((file) => !verdicts.has(file));
  }

  return verdicts;
}

/**
 * When the batch's time is up, set once its first process has started.
 */
type Clock = {
  /**
   * The deadline, as `Date.now()` milliseconds.
   */
  deadline: number | undefined;
};

/**
 * Runs one check process over some contracts until it is done, the time is up or a turn holds one
 * of them, and kills it.
 *
 * @param files - The absolute `contract.ts` paths.
 * @param options - The environment, the time and the hold check.
 * @param clock - The batch's deadline.
 * @returns The verdicts it reached; a contract left out is to be checked again.
 */
function checkRound(
  files: readonly string[],
  options: CheckContractsOptions,
  clock: Clock,
): Promise<Map<string, CheckVerdict>> {
  const verdicts = new Map<string, CheckVerdict>();
  const batch = new Set(files);
  const child = startChild();
  return new Promise((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    /**
     * Kills the process, gives every contract still open the verdict, and resolves once the process
     * is gone.
     *
     * @param open - The verdict of a contract that has none yet, or `undefined` to check it again.
     */
    const finish = (open: CheckVerdict | undefined): void => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timer);
      stopListening();
      for (const file of files) {
        if (!verdicts.has(file) && open !== undefined) {
          verdicts.set(file, open);
        }
      }

      void killChild(child).then(() => {
        resolve(verdicts);
      });
    };

    /**
     * Discards provisional outcomes from a process that failed before completing the round.
     *
     * @param message - What stopped the process.
     * @param file - The contract that caused the crash, if known.
     */
    const abort = (message: string, file?: string): void => {
      if (settled) {
        return;
      }

      verdicts.clear();
      if (file !== undefined && batch.has(file)) {
        verdicts.set(file, { kind: 'failed', reason: 'error', message });
      }

      finish({
        kind: 'unchecked',
        message: file === undefined ? message : `${message} (from ${file}).`,
      });
    };

    /**
     * Sends a message, invalidating the round on a failed IPC write.
     *
     * @param message - The request or reply for the child.
     */
    const send = (message: ServerMessage): void => {
      try {
        child.send(message, (error) => {
          if (error !== null) {
            abort(`The process that checks contracts lost IPC: ${error.message}`);
          }
        });
      } catch (error) {
        abort(`The process that checks contracts lost IPC: ${String(error)}`);
      }
    };

    const stopListening = onCodeHeld(() => {
      const held = files.filter((file) => options.isHeld(file));
      if (held.length === 0) {
        return;
      }

      for (const file of held) {
        verdicts.set(file, { kind: 'held' });
      }

      finish(undefined);
    });
    timer = setTimeout(() => {
      abort('The process that checks contracts did not start.');
    }, STARTUP_TIMEOUT_MS);
    child.on('error', (error) => {
      abort(`The process that checks contracts failed: ${error.message}`);
    });
    /**
     * A failed spawn can close its handles without emitting exit.
     *
     * @param code - The process exit code.
     * @param signal - The signal that ended the process.
     */
    const ended = (code: number | null, signal: NodeJS.Signals | null): void => {
      abort(
        'The process that checks contracts ended before it was done ' +
          `(${signal ?? `exit code ${String(code)}`}).`,
      );
    };
    child.on('exit', ended);
    child.on('close', ended);
    child.on('disconnect', () => {
      abort('The IPC channel to the process that checks contracts closed before it was done.');
    });
    child.on('message', (raw: unknown) => {
      const message = readCheckMessage(raw);
      if (message === undefined || settled) {
        return;
      }

      handle(message);
    });

    /**
     * Acts on one message of the process.
     *
     * @param message - The message, read as untrusted data.
     */
    function handle(message: CheckMessage): void {
      switch (message.type) {
        case 'ready': {
          clock.deadline ??= Date.now() + Math.min(options.timeoutMs, MAX_TIMEOUT_MS);
          clearTimeout(timer);
          timer = setTimeout(
            () => {
              finish({ kind: 'timed-out' });
            },
            Math.min(MAX_TIMEOUT_MS, Math.max(0, clock.deadline - Date.now())),
          );
          send({ type: 'run', files });
          return;
        }

        case 'unsafe': {
          abort(`The process that checks contracts is not restricted: ${message.message}`);
          return;
        }

        case 'crashed': {
          abort(message.message, message.file ?? undefined);
          return;
        }

        case 'invoke': {
          void invoke(options.environment, message.name, message.args).then((answer) => {
            if (!settled) {
              send({ type: 'invoked', id: message.id, answer });
            }
          });
          return;
        }

        case 'loaded':
        case 'no-default': {
          if (batch.has(message.file) && !verdicts.has(message.file)) {
            verdicts.set(message.file, {
              kind: message.type === 'loaded' ? 'passed' : 'no-default',
            });
          }

          return;
        }

        case 'failed': {
          // A failure overrides a load: the contract's code used something it may not later on.
          if (batch.has(message.file) && verdicts.get(message.file)?.kind !== 'failed') {
            verdicts.set(message.file, {
              kind: 'failed',
              reason: message.reason,
              message: message.message,
            });
          }

          return;
        }

        case 'done': {
          finish({ kind: 'unchecked', message: 'The process that checks contracts skipped it.' });
        }
      }
    }
  });
}

/**
 * Answers a call of the check process's module runner from the server's environment: what Vite's
 * runner expects back, `{ result }` or `{ error }`.
 *
 * @param environment - The server's environment.
 * @param name - The method.
 * @param args - Its arguments, untrusted.
 */
async function invoke(
  environment: DevEnvironment,
  name: string,
  args: readonly unknown[],
): Promise<unknown> {
  try {
    if (name === 'getBuiltins') {
      return {
        result: environment.config.resolve.builtins.map((builtin) =>
          typeof builtin === 'string'
            ? { type: 'string', value: builtin }
            : { type: 'RegExp', source: builtin.source, flags: builtin.flags },
        ),
      };
    }

    const [id, importer, fetchOptions] = args;
    if (
      name !== 'fetchModule' ||
      typeof id !== 'string' ||
      (importer !== undefined && importer !== null && typeof importer !== 'string')
    ) {
      throw new Error(`The check process may not call ${name}.`);
    }

    const result = await environment.fetchModule(
      id,
      importer ?? undefined,
      fetchFunctionOptions(fetchOptions),
    );
    return { result };
  } catch (error) {
    return {
      error: {
        name: error instanceof Error ? error.name : 'Error',
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

/**
 * The options of a `fetchModule` call, keeping only what Vite reads.
 *
 * @param value - The options the check process sent.
 */
function fetchFunctionOptions(value: unknown): FetchFunctionOptions | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }

  const cached: unknown = Reflect.get(value, 'cached');
  const startOffset: unknown = Reflect.get(value, 'startOffset');
  return {
    cached: cached === true,
    ...(typeof startOffset === 'number' ? { startOffset } : {}),
  };
}

/**
 * Forks the check process under Node's permission model: it may read only the framework and its
 * dependencies (and the CLI's loader hooks when installed), and may not write files, start
 * processes or workers, load addons, use WASI, the inspector or the network. Its output is dropped;
 * it talks only over the IPC channel.
 */
function startChild(): ChildProcess {
  const env = Object.fromEntries(
    PASSED_ENV.flatMap((name) => {
      const value = process.env[name];
      return value === undefined ? [] : [[name, value]];
    }),
  );
  const child = fork(CHILD_ENTRY, [], {
    execArgv: checkProcessArguments(),
    env,
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    serialization: 'json',
  });
  LIVE.add(child);
  if (child.pid !== undefined) {
    for (const watcher of WATCHERS) {
      watcher(child.pid);
    }
  }

  /**
   * Forgets the child even when a failed spawn emits no exit event.
   */
  const forget = (): void => {
    LIVE.delete(child);
  };
  child.once('exit', forget);
  child.once('close', forget);
  child.once('error', forget);
  if (!EXIT_HANDLER.installed) {
    EXIT_HANDLER.installed = true;
    process.once('exit', () => {
      for (const live of LIVE) {
        live.kill('SIGKILL');
      }
    });
  }

  return child;
}

/**
 * Kills a check process outright and waits until it is gone.
 *
 * @param child - The process.
 */
function killChild(child: ChildProcess): Promise<void> {
  if (child.pid === undefined || child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    /**
     * Resolves on process exit, or on close if the process failed to spawn.
     */
    const exited = (): void => {
      child.off('exit', exited);
      child.off('close', exited);
      resolve();
    };
    child.once('exit', exited);
    child.once('close', exited);
    child.kill('SIGKILL');
  });
}
