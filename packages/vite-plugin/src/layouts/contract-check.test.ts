import { ChildProcess, fork } from 'node:child_process';
import { createRunnableDevEnvironment, resolveConfig, type DevEnvironment } from 'vite';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vite-plus/test';

import {
  checkContracts,
  checkProcessArguments,
  type CheckVerdict,
} from '#layouts/contract-check.ts';
import { PackageEvaluator } from '#layouts/contract-evaluator.ts';

vi.mock('node:child_process', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:child_process')>();
  return { ...original, fork: vi.fn(original.fork) };
});

/**
 * The files fed to the checker. Startup and process failures do not need to fetch them.
 */
const FILES = ['/first/contract.ts', '/second/contract.ts'];

/**
 * The largest delay Node's timers support, in milliseconds.
 */
const MAX_TIMEOUT_MS = 2 ** 31 - 1;

/**
 * Creates a fake IPC child. It closes when killed, which lets the checker await teardown.
 */
function fakeChild(): ChildProcess {
  const child = new ChildProcess();
  Object.defineProperty(child, 'pid', { value: process.pid });
  Object.defineProperty(child, 'send', { value: () => true, writable: true });
  vi.spyOn(child, 'kill').mockImplementation(() => {
    queueMicrotask(() => child.emit('close', null, 'SIGKILL'));
    return true;
  });
  return child;
}

describe('checkContracts', () => {
  let environment: DevEnvironment;
  let atServerExit: ((code: number) => void) | undefined;
  beforeAll(async () => {
    const config = await resolveConfig({ configFile: false, logLevel: 'silent' }, 'serve');
    environment = createRunnableDevEnvironment('ssr', config, { hot: false });
    await environment.init();
  });

  afterAll(async () => {
    await environment.close();
  });

  /**
   * Starts the check with the test environment.
   *
   * @param timeoutMs - The millisecond deadline after the process is ready.
   */
  const check = (timeoutMs = 1000): Promise<ReadonlyMap<string, CheckVerdict>> =>
    checkContracts({ files: FILES, environment, timeoutMs, isHeld: () => false });

  it.each(['error', 'close'])(
    'forgets a failed spawn on %s without waiting for exit',
    async (event) => {
      const child = new ChildProcess();
      const kill = vi.spyOn(child, 'kill').mockReturnValue(true);
      vi.mocked(fork).mockReturnValueOnce(child);
      const existing = process.listeners('exit');
      const checking = check();
      atServerExit ??= process.listeners('exit').find((listener) => !existing.includes(listener));
      if (event === 'error') {
        child.emit('error', new Error('could not spawn'));
      } else {
        child.emit('close', 1, null);
      }

      const verdicts = await checking;
      expect([...verdicts.values()].map((verdict) => verdict.kind)).toEqual([
        'unchecked',
        'unchecked',
      ]);
      expect(atServerExit).toBeDefined();
      atServerExit?.(0);
      expect(kill).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['exit', 'The process that checks contracts ended before it was done (exit code 1).'],
    ['error', 'The process that checks contracts failed: stream broke'],
    [
      'disconnect',
      'The IPC channel to the process that checks contracts closed before it was done.',
    ],
    ['send', 'The process that checks contracts lost IPC: write failed'],
    ['crashed', 'The contract check process stopped after an uncaught exception: unknown owner'],
  ])('invalidates outcomes received before a premature %s', async (event, message) => {
    const child = fakeChild();
    vi.mocked(fork).mockReturnValueOnce(child);
    const checking = check();
    child.emit('message', { type: 'ready' });
    child.emit('message', { type: 'loaded', file: FILES[0] });
    child.emit('message', { type: 'no-default', file: FILES[1] });
    switch (event) {
      case 'exit':
        child.emit('exit', 1, null);
        break;
      case 'error':
        child.emit('error', new Error('stream broke'));
        break;
      case 'disconnect':
        child.emit('disconnect');
        break;
      case 'send':
        Object.assign(child, {
          /**
           * Fails the next write to the child's channel.
           */
          send: (_message: unknown, callback: (error: Error) => void) => {
            callback(new Error('write failed'));
            return false;
          },
        });
        child.emit('message', { type: 'invoke', id: 1, name: 'getBuiltins', args: [] });
        break;
      case 'crashed':
        child.emit('message', { type: 'crashed', file: null, message });
        break;
    }

    const verdicts = await checking;
    expect([...verdicts.values()]).toEqual(FILES.map(() => ({ kind: 'unchecked', message })));
  });

  it('clamps the running deadline to the largest delay Node supports', async () => {
    const child = fakeChild();
    vi.mocked(fork).mockReturnValueOnce(child);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const schedule = vi.spyOn(globalThis, 'setTimeout');
    try {
      const checking = check(Number.MAX_SAFE_INTEGER);
      child.emit('message', { type: 'ready' });
      expect(schedule).toHaveBeenLastCalledWith(expect.any(Function), MAX_TIMEOUT_MS);
      for (const file of FILES) {
        child.emit('message', { type: 'loaded', file });
      }

      child.emit('message', { type: 'done' });
      expect([...(await checking).values()].map((verdict) => verdict.kind)).toEqual([
        'passed',
        'passed',
      ]);
    } finally {
      schedule.mockRestore();
      vi.useRealTimers();
    }
  });

  it.each([
    ['the permission model is off', []],
    ['It may still use child.', [...checkProcessArguments(), '--allow-child-process']],
    [
      'EventSource could not be replaced',
      [
        ...checkProcessArguments(),
        '--import=data:text/javascript,' +
          encodeURIComponent(
            "Object.defineProperty(globalThis, 'EventSource', { configurable: false, value: null });",
          ),
      ],
    ],
  ] as const)('reports the real child self-check failure when %s', async (message, execArgv) => {
    const original =
      await vi.importActual<typeof import('node:child_process')>('node:child_process');
    vi.mocked(fork).mockImplementationOnce((entry, args, options) =>
      original.fork(entry, args, { ...options, execArgv: [...execArgv] }),
    );
    const verdicts = await check();
    expect([...verdicts.values()]).toEqual(
      FILES.map(() => ({
        kind: 'unchecked',
        message: expect.stringContaining(message),
      })),
    );
  });
});

describe('PackageEvaluator in the server', () => {
  it('refuses external framework entry points excluded by the static check', async () => {
    await expect(new PackageEvaluator().runExternalModule('@deckster/brand/node')).rejects.toThrow(
      'A contract may not load "@deckster/brand/node", which is not a package a contract may import.',
    );
  });
});
