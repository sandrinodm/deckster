import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  frameworkDependencyRoots,
  isInstalledFramework,
  readFrameworkPackages,
} from '#node/framework-packages.ts';

/**
 * The framework's own folder: the folder that contains `packages/` and `brands/default`. It is the
 * repository checkout during development and `dist/framework` inside the published CLI, which
 * copies the repository layout. Every module that finds a framework file relative to its source
 * starts here.
 */
export const FRAMEWORK_ROOT = path.resolve(import.meta.dirname, '../../../..');

/**
 * Whether the framework runs from a published copy, as opposed to the repository checkout. Only
 * messages and scaffolding depend on it.
 */
export const FRAMEWORK_INSTALLED = isInstalledFramework(FRAMEWORK_ROOT);

/**
 * A file inside the framework that stands in as the importer when a bare import from a user's file
 * must be found among the framework's own dependencies.
 */
export const FRAMEWORK_ANCHOR = path.join(FRAMEWORK_ROOT, 'packages', 'cli', 'src', 'bin.ts');

/**
 * The framework's `@deckster/*` packages, read once.
 */
export const FRAMEWORK_PACKAGES = readFrameworkPackages(FRAMEWORK_ROOT);

/**
 * The folders a dev server must be allowed to serve besides the workspace: the framework itself
 * and, when it is installed, its npm dependencies at their real locations.
 */
export const FRAMEWORK_FS_ROOTS: readonly string[] = [
  FRAMEWORK_ROOT,
  ...frameworkDependencyRoots(FRAMEWORK_ROOT),
];

/**
 * The environment variable that holds the absolute path of the bootstrap hooks file, set by the
 * published `deck` command for itself and its children. It is unset in the repository checkout,
 * where Node loads the framework's TypeScript natively.
 */
export const HOOKS_ENV = 'DECKSTER_HOOKS';

/**
 * The `node` arguments that load the bootstrap hooks first, for a child process that runs framework
 * TypeScript.
 *
 * @param env - The process environment.
 * @returns `--import <hooks url>` when the hooks are active, else nothing.
 */
export function nodeHookArguments(env: Readonly<Record<string, string | undefined>>): string[] {
  const hooks = env[HOOKS_ENV];
  return hooks === undefined || hooks === '' ? [] : ['--import', pathToFileURL(hooks).href];
}

/**
 * The command that downloads the Chromium the framework drives. In the repository it is the
 * workspace's Playwright; in a published copy it is the exact Playwright version the package
 * installed, because an unpinned `npx playwright` would fetch the newest one, which wants another
 * Chromium build than the installed library launches.
 */
export function playwrightInstallCommand(): string {
  if (!FRAMEWORK_INSTALLED) {
    return 'pnpm exec playwright install chromium';
  }

  const version = installedPlaywrightVersion();
  return `npx playwright${version === undefined ? '' : `@${version}`} install chromium`;
}

/**
 * The version of the Playwright package the published copy depends on.
 */
function installedPlaywrightVersion(): string | undefined {
  try {
    const manifest: unknown = createRequire(FRAMEWORK_ANCHOR)('playwright/package.json');
    return typeof manifest === 'object' &&
      manifest !== null &&
      'version' in manifest &&
      typeof manifest.version === 'string'
      ? manifest.version
      : undefined;
  } catch {
    return undefined;
  }
}
