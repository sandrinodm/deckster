import { pathToFileURL } from 'node:url';

/**
 * The module the entry loads once hardening is in place.
 */
export const APP_MODULE = '#main/main-app.ts';

/**
 * Which module the entry loads: the shell's app, or, only under `DECK_SHELL_TEST_HIDDEN=1`, the
 * file named by `DECK_SHELL_TEST_APP_MODULE`, so a test can load a module that fails on import.
 *
 * @param env - The process environment.
 */
export function appModuleFor(env: Readonly<Record<string, string | undefined>>): string {
  const override = env['DECK_SHELL_TEST_APP_MODULE'];
  return env['DECK_SHELL_TEST_HIDDEN'] === '1' && override !== undefined && override !== ''
    ? pathToFileURL(override).href
    : APP_MODULE;
}
