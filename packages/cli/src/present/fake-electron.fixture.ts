import { HELPER_SUFFIXES } from '@deckster/shell/bundle';
import { Effect, Layer, PlatformError, Sink, Stream } from 'effect';
import { ChildProcessSpawner } from 'effect/process';
import { cpSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/**
 * One program the code under test asked to start.
 */
export type SpawnedCall = {
  /**
   * The program.
   */
  command: string;

  /**
   * Its arguments.
   */
  args: readonly string[];
};

/**
 * Writes the smallest folder that looks like Electron's package: `dist/version`, and an
 * `Electron.app` with the main executable, its plist, the four helpers and the icon and default app
 * that the recipe replaces.
 *
 * @param electronDir - The folder to create the package in.
 */
export function writeFakeElectron(electronDir: string): void {
  const app = path.join(electronDir, 'dist', 'Electron.app', 'Contents');
  mkdirSync(path.join(app, 'MacOS'), { recursive: true });
  mkdirSync(path.join(app, 'Resources'), { recursive: true });
  writeFileSync(path.join(electronDir, 'dist', 'version'), '45.3.2\n');
  writeFileSync(path.join(electronDir, 'path.txt'), 'Electron.app/Contents/MacOS/Electron');
  writeFileSync(path.join(app, 'MacOS', 'Electron'), 'main');
  writeFileSync(path.join(app, 'Info.plist'), '<plist/>');
  writeFileSync(path.join(app, 'Resources', 'electron.icns'), 'icon');
  writeFileSync(path.join(app, 'Resources', 'default_app.asar'), 'asar');
  for (const suffix of HELPER_SUFFIXES) {
    const helper = path.join(app, 'Frameworks', `Electron Helper${suffix}.app`, 'Contents');
    mkdirSync(path.join(helper, 'MacOS'), { recursive: true });
    writeFileSync(path.join(helper, 'MacOS', `Electron Helper${suffix}`), 'helper');
    writeFileSync(path.join(helper, 'Info.plist'), '<plist/>');
  }
}

/**
 * A `ChildProcessSpawner` that runs nothing but `cp`, which it carries out with Node's copy (the
 * way an APFS clone would end), and records every call. `fails` names the calls that exit 1 with a
 * message on standard error, and `hangs` the ones that never exit.
 *
 * @param fails - Whether a call fails.
 * @param hangs - Whether a call never exits.
 */
export function fakeToolSpawner(
  fails: (call: SpawnedCall) => boolean = () => false,
  hangs: (call: SpawnedCall) => boolean = () => false,
): { calls: SpawnedCall[]; layer: Layer.Layer<ChildProcessSpawner.ChildProcessSpawner> } {
  const calls: SpawnedCall[] = [];
  const encoder = new TextEncoder();
  const service = ChildProcessSpawner.make((command) => {
    if (command._tag !== 'StandardCommand') {
      return Effect.die('piped commands are not used');
    }

    const call: SpawnedCall = { command: command.command, args: command.args.map(String) };
    calls.push(call);
    if (command.command === '/definitely/missing') {
      return Effect.fail(
        PlatformError.systemError({ _tag: 'NotFound', module: 'ChildProcess', method: 'spawn' }),
      );
    }

    const failed = fails(call);
    if (!failed && command.command === '/bin/cp') {
      const [source, destination] = call.args.slice(-2);
      if (source !== undefined && destination !== undefined) {
        cpSync(source, destination, { recursive: true });
      }
    }

    const exitCode = ChildProcessSpawner.ExitCode(failed ? 1 : 0);
    return Effect.succeed(
      ChildProcessSpawner.makeHandle({
        pid: ChildProcessSpawner.ProcessId(1),
        exitCode: hangs(call) ? Effect.never : Effect.succeed(exitCode),
        isRunning: Effect.succeed(false),
        kill: () => Effect.void,
        stdin: Sink.drain,
        stdout: Stream.empty,
        stderr: failed ? Stream.make(encoder.encode('boom: it failed\n')) : Stream.empty,
        all: Stream.empty,
        getInputFd: () => Sink.drain,
        getOutputFd: () => Stream.empty,
        unref: Effect.succeed(Effect.void),
      }),
    );
  });
  return { calls, layer: Layer.succeed(ChildProcessSpawner.ChildProcessSpawner, service) };
}
