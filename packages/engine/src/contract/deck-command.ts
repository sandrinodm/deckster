/**
 * The command messages tell the reader to type, in the repository: the workspace's `deckster`
 * script.
 */
const REPOSITORY_COMMAND = 'pnpm deckster';

/**
 * The environment variable the published `deckster` command sets to its own name, so every message
 * written by it or by a process it starts names the command the reader actually has.
 */
export const DECK_COMMAND_ENV = 'DECKSTER_COMMAND';

/**
 * The name Vite replaces in code served to the browser, where there is no environment. The deck's
 * Vite configuration defines it from the same variable.
 */
declare const __DECK_COMMAND__: string | undefined;

/**
 * The command a message names for running the CLI: `pnpm deck` in the repository, `deckster` for a
 * published install. Node reads it from `DECKSTER_COMMAND`; the browser gets it from the page's
 * build.
 */
export function deckCommand(): string {
  if (typeof __DECK_COMMAND__ === 'string') {
    return __DECK_COMMAND__;
  }

  // `process` is read by name so code that is also type-checked without Node's types compiles.
  const processValue: unknown = Reflect.get(globalThis, 'process');
  const env =
    typeof processValue === 'object' && processValue !== null && 'env' in processValue
      ? processValue.env
      : undefined;
  const fromEnv: unknown =
    typeof env === 'object' && env !== null ? Reflect.get(env, DECK_COMMAND_ENV) : undefined;
  return typeof fromEnv === 'string' && fromEnv !== '' ? fromEnv : REPOSITORY_COMMAND;
}
