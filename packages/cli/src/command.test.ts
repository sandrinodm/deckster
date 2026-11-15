import { describe, expect, it } from '@effect/vitest';
import { Console, Effect } from 'effect';

import type { Command, CommandError } from '#command.ts';

import { commandHelp, lazyRun } from '#command.ts';

/**
 * A command with the given help, for the help tests.
 *
 * @param help - Its `help`.
 */
function commandWith(help: Command['help']): Command {
  return { name: 'probe', summary: 'A probe', help, run: () => Effect.succeed(0) };
}

/**
 * Runs a probe command's `run`. The probes use none of the services a command may ask for.
 *
 * @param run - The command's `run`.
 * @param argv - The arguments.
 */
function runProbe(
  run: Command['run'],
  argv: readonly string[],
): Effect.Effect<number, CommandError> {
  return run(argv) as Effect.Effect<number, CommandError>;
}

/**
 * Runs an effect and returns what it printed with `Console.log`.
 *
 * @param effect - The effect.
 */
const printedBy = Effect.fn('printedBy')(function* <A, E>(effect: Effect.Effect<A, E>) {
  const lines: string[] = [];
  const console: Console.Console = {
    ...globalThis.console,
    log: (...args: readonly unknown[]) => {
      lines.push(args.map(String).join(' '));
    },
  };
  const result = yield* effect.pipe(Effect.provideService(Console.Console, console));
  return { result, lines };
});

describe('lazyRun', () => {
  it.effect('runs the body it loads', () =>
    Effect.gen(function* () {
      const run = lazyRun('probe-run.ts', () => Promise.resolve({ run: () => Effect.succeed(7) }));
      expect(yield* runProbe(run, ['x'])).toBe(7);
    }),
  );

  it.effect('fails readably when the body does not load, naming the module and the cause', () =>
    Effect.gen(function* () {
      const run = lazyRun('probe-run.ts', () => Promise.reject(new Error('Unexpected token')));
      const error = yield* Effect.flip(runProbe(run, ['x']));
      expect(error._tag).toBe('CliError');
      expect(error.message).toContain('probe-run.ts');
      expect(error.message).toContain('Unexpected token');
    }),
  );

  it.effect('fails readably when the module has no run', () =>
    Effect.gen(function* () {
      const run = lazyRun('probe-run.ts', () => Promise.resolve({} as { run: Command['run'] }));
      const error = yield* Effect.flip(runProbe(run, ['x']));
      expect(error.message).toContain('probe-run.ts');
      expect(error.message).toContain('does not export `run`');
    }),
  );

  it.effect('prints a load failure as JSON under --json and exits 1', () =>
    Effect.gen(function* () {
      const run = lazyRun('probe-run.ts', () => Promise.reject(new Error('broken')));
      const { result, lines } = yield* printedBy(runProbe(run, ['x', '--json']));
      expect(result).toBe(1);
      const printed = JSON.parse(lines.join('\n')) as {
        ok: boolean;
        error: { type: string; message: string };
      };
      expect(printed.ok).toBe(false);
      expect(printed.error.type).toBe('CliError');
      expect(printed.error.message).toContain('broken');
    }),
  );
});

describe('commandHelp', () => {
  it.effect('returns a help string as it is', () =>
    Effect.gen(function* () {
      expect(yield* commandHelp(commandWith('Usage: deck probe'))).toBe('Usage: deck probe');
    }),
  );

  it.effect('loads the text of a help loader', () =>
    Effect.gen(function* () {
      expect(yield* commandHelp(commandWith(() => Promise.resolve('Loaded help')))).toBe(
        'Loaded help',
      );
    }),
  );

  it.effect('fails readably when the help loader fails', () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        commandHelp(commandWith(() => Promise.reject(new Error('no help module')))),
      );
      expect(error._tag).toBe('CliError');
      expect(error.message).toContain('probe');
      expect(error.message).toContain('no help module');
    }),
  );
});
