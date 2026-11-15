import { isSafeName } from '@deckster/brand';
import { Effect } from 'effect';
import { parseArgs, type ParseArgsOptionsConfig } from 'node:util';

import { usageError, type CliError } from '#cli-error.ts';

/**
 * The lowest TCP port.
 */
const MIN_PORT = 1;

/**
 * The highest TCP port.
 */
const MAX_PORT = 65_535;

/**
 * Digits only, as a port must be written; `Number` alone would accept `1e3` and `0x1f`.
 */
const PORT_DIGITS_PATTERN = /^\d+$/;

/**
 * The options and positional arguments of one command.
 */
export type ParsedArgs<Options extends ParseArgsOptionsConfig> = ReturnType<
  typeof parseArgs<{ options: Options; allowPositionals: true }>
>;

/**
 * Parses a command's arguments strictly. Unknown or malformed options become an error that points
 * at the command's help instead of a Node stack trace.
 *
 * @param command - The command name, used in the error message.
 * @param argv - The arguments after the command name.
 * @param options - The options the command accepts.
 * @throws CliError in the error channel, for unknown options or missing option values.
 */
export function parseCommandArgs<const Options extends ParseArgsOptionsConfig>(
  command: string,
  argv: readonly string[],
  options: Options,
): Effect.Effect<ParsedArgs<Options>, CliError> {
  return Effect.try({
    try: () => parseArgs({ args: [...argv], options, allowPositionals: true }),
    catch: (error) => usageError(error instanceof Error ? error.message : String(error), command),
  });
}

/**
 * Reads a positive integer option such as `--port`.
 *
 * @param command - The command name, used in the error message.
 * @param name - The option name without dashes.
 * @param value - The raw option value.
 * @returns The number, or `undefined` when the option was not given.
 * @throws CliError in the error channel, when the value is not a positive integer.
 */
export const readPositiveInteger = Effect.fn('readPositiveInteger')(function* (
  command: string,
  name: string,
  value: string | undefined,
): Effect.fn.Return<number | undefined, CliError> {
  if (value === undefined) {
    return undefined;
  }

  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    return yield* usageError(`--${name} must be a positive integer, got "${value}".`, command);
  }

  return number;
});

/**
 * Reads `--port`: an integer from 1 to 65535.
 *
 * @param command - The command name, used in the error message.
 * @param value - The raw option value.
 * @returns The port, or `undefined` when the option was not given.
 * @throws CliError in the error channel, when the value is not a port.
 */
export const readPort = Effect.fn('readPort')(function* (
  command: string,
  value: string | undefined,
): Effect.fn.Return<number | undefined, CliError> {
  if (value === undefined) {
    return undefined;
  }

  const port = Number(value);
  if (
    !PORT_DIGITS_PATTERN.test(value) ||
    !Number.isInteger(port) ||
    port < MIN_PORT ||
    port > MAX_PORT
  ) {
    return yield* usageError(
      `--port must be a port number from ${MIN_PORT} to ${MAX_PORT}, got "${value}".`,
      command,
    );
  }

  return port;
});

/**
 * Reads `--brand`: a brand folder name under `brands/`, in kebab-case.
 *
 * @param command - The command name, used in the error message.
 * @param value - The raw option value.
 * @returns The name, or `undefined` when the option was not given.
 * @throws CliError in the error channel, when the value is not kebab-case.
 */
export const readBrandName = Effect.fn('readBrandName')(function* (
  command: string,
  value: string | undefined,
): Effect.fn.Return<string | undefined, CliError> {
  if (value === undefined || isSafeName(value)) {
    return value;
  }

  return yield* usageError(
    `--brand must name a folder under brands/ in kebab-case, such as "default", got "${value}".`,
    command,
  );
});
