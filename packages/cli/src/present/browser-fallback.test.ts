import { describe, expect, it } from '@effect/vitest';
import { Effect, FileSystem, Layer, PlatformError, Sink, Stream } from 'effect';
import { ChildProcessSpawner } from 'effect/process';

import {
  BrowserOpener,
  chromeCandidates,
  defaultBrowserCommand,
} from '#present/browser-fallback.ts';

/**
 * One program the opener asked to start.
 */
type Started = {
  command: string;
  args: readonly string[];
  detached: boolean | undefined;
  stdin: unknown;
  unrefed: boolean;
};

/**
 * A `ChildProcessSpawner` that starts nothing: it records every command, fails the ones `refuses`
 * names as a missing program would, and counts `unref` calls.
 *
 * @param refuses - Whether a program fails to start.
 */
function fakeSpawner(refuses: (command: string) => boolean) {
  const started: Started[] = [];
  const service = ChildProcessSpawner.make((command) => {
    if (command._tag !== 'StandardCommand') {
      return Effect.die('piped commands are not used');
    }

    if (refuses(command.command)) {
      return Effect.fail(
        PlatformError.systemError({ _tag: 'NotFound', module: 'ChildProcess', method: 'spawn' }),
      );
    }

    const entry: Started = {
      command: command.command,
      args: command.args.map(String),
      detached: command.options.detached,
      stdin: command.options.stdin,
      unrefed: false,
    };
    started.push(entry);
    return Effect.succeed(
      ChildProcessSpawner.makeHandle({
        pid: ChildProcessSpawner.ProcessId(1),
        exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(0)),
        isRunning: Effect.succeed(true),
        kill: () => Effect.void,
        stdin: Sink.drain,
        stdout: Stream.empty,
        stderr: Stream.empty,
        all: Stream.empty,
        getInputFd: () => Sink.drain,
        getOutputFd: () => Stream.empty,
        unref: Effect.sync(() => {
          entry.unrefed = true;
          return Effect.void;
        }),
      }),
    );
  });
  return {
    started,
    layer: Layer.succeed(ChildProcessSpawner.ChildProcessSpawner, service),
  };
}

/**
 * The opener over a file system where every Chrome is installed and the fake spawner.
 *
 * @param spawner - The fake spawner's layer.
 */
function openerLayer(spawner: Layer.Layer<ChildProcessSpawner.ChildProcessSpawner>) {
  return BrowserOpener.layer.pipe(
    Layer.provide(
      Layer.merge(FileSystem.layerNoop({ exists: () => Effect.succeed(true) }), spawner),
    ),
  );
}

const URL_TO_OPEN = 'http://127.0.0.1:5770/';

describe('the browser fallback', () => {
  it('prefers Chrome by platform', () => {
    expect(chromeCandidates('darwin', {})[0]).toBe(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    );
    expect(chromeCandidates('linux', {})).toContain('google-chrome');
    expect(chromeCandidates('win32', { ProgramFiles: 'C:\\Program Files' })).toEqual([
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    ]);
  });

  it('opens the default browser with the platform command', () => {
    expect(defaultBrowserCommand('darwin', 'http://a/')).toEqual({
      command: 'open',
      args: ['http://a/'],
    });
    expect(defaultBrowserCommand('linux', 'http://a/').command).toBe('xdg-open');
    expect(defaultBrowserCommand('win32', 'http://a/').command).toBe('cmd');
  });

  it.effect('starts Chrome in app mode through the spawner, detached and unreferenced', () => {
    const spawner = fakeSpawner(() => false);
    return Effect.gen(function* () {
      const opener = yield* BrowserOpener;
      expect(yield* opener.open(URL_TO_OPEN)).toBe('chrome-app');
      expect(spawner.started).toEqual([
        {
          command: chromeCandidates(process.platform, process.env)[0],
          args: [`--app=${URL_TO_OPEN}`],
          detached: true,
          stdin: 'ignore',
          unrefed: true,
        },
      ]);
    }).pipe(Effect.provide(openerLayer(spawner.layer)));
  });

  it.effect('falls back to the default browser when no Chrome starts', () => {
    const fallback = defaultBrowserCommand(process.platform, URL_TO_OPEN);
    const spawner = fakeSpawner((command) => command !== fallback.command);
    return Effect.gen(function* () {
      const opener = yield* BrowserOpener;
      expect(yield* opener.open(URL_TO_OPEN)).toBe('default-browser');
      expect(spawner.started.map((entry) => [entry.command, ...entry.args])).toEqual([
        [fallback.command, ...fallback.args],
      ]);
      expect(spawner.started[0]?.unrefed).toBe(true);
    }).pipe(Effect.provide(openerLayer(spawner.layer)));
  });

  it.effect('fails with the URL to open by hand when nothing starts', () => {
    const spawner = fakeSpawner(() => true);
    return Effect.gen(function* () {
      const opener = yield* BrowserOpener;
      const error = yield* Effect.flip(opener.open(URL_TO_OPEN));
      expect(error.message).toContain(`Open ${URL_TO_OPEN} yourself`);
      expect(spawner.started).toEqual([]);
    }).pipe(Effect.provide(openerLayer(spawner.layer)));
  });
});
