import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { APP_NAME } from '#bundle/app-identity.ts';
import { brandedAppKey, type BrandedAppInputs } from '#bundle/branded-app-plan.ts';

export * from '#bundle/app-identity.ts';
export * from '#bundle/branded-app-plan.ts';

/**
 * The files the branded app is made from, in the shell package.
 */
export const BUNDLE_SOURCES = {
  /**
   * The macOS icon, copied into the bundle.
   */
  icon: fileURLToPath(new URL('../../assets/icon.icns', import.meta.url)),

  /**
   * The folder whose files replace Electron's default app.
   */
  stubFolder: fileURLToPath(new URL('./stub/', import.meta.url)),

  /**
   * The stub's files, in the order they are hashed.
   */
  stubFiles: ['package.json', 'main.mjs'],
} as const;

/**
 * The relative path of the stock executable inside Electron's `dist` folder.
 */
const STOCK_EXECUTABLE = 'Electron.app/Contents/MacOS/Electron';

/**
 * SHA-256 (hex) of some bytes.
 *
 * @param bytes - The bytes.
 */
function sha256(...bytes: Uint8Array[]): string {
  const hash = createHash('sha256');
  for (const chunk of bytes) {
    hash.update(chunk);
  }

  return hash.digest('hex');
}

/**
 * Reads what the cache key hashes from Electron's package: its version and the small files (the
 * main executable, `Info.plist`, the icon and the stub), about 700 KB in all. The one reader of
 * these files, used by the CLI's build and by {@link findBrandedApp}.
 *
 * @param electronDir - The `electron` package folder.
 * @throws Error when a file cannot be read.
 */
export function readBrandedAppInputs(electronDir: string): Omit<BrandedAppInputs, 'signing'> {
  const dist = path.join(electronDir, 'dist');
  return {
    electronVersion: readFileSync(path.join(dist, 'version'), 'utf8').trim(),
    arch: process.arch,
    electronExecutableHash: sha256(readFileSync(path.join(dist, STOCK_EXECUTABLE))),
    electronPlistHash: sha256(readFileSync(path.join(dist, 'Electron.app/Contents/Info.plist'))),
    iconHash: sha256(readFileSync(BUNDLE_SOURCES.icon)),
    stubHash: sha256(
      ...BUNDLE_SOURCES.stubFiles.map((file) =>
        readFileSync(path.join(BUNDLE_SOURCES.stubFolder, file)),
      ),
    ),
  };
}

/**
 * The branded app's executable if it is already built, without building anything: the signed build
 * first, then the unsigned one. The Playwright e2e tests use it to start the shell the way `deck
 * present` does, and fall back to Electron's own executable when it is `undefined`.
 *
 * @param workspaceRoot - The workspace root; the app lives in `.deck/shell/app/<key>/`.
 * @param electronDir - The `electron` package folder.
 */
export function findBrandedApp(workspaceRoot: string, electronDir: string): string | undefined {
  if (process.platform !== 'darwin') {
    return undefined;
  }

  let inputs: Omit<BrandedAppInputs, 'signing'>;
  try {
    inputs = readBrandedAppInputs(electronDir);
  } catch {
    return undefined;
  }

  for (const signing of ['outer', 'none'] as const) {
    const executable = path.join(
      workspaceRoot,
      '.deck',
      'shell',
      'app',
      brandedAppKey({ ...inputs, signing }),
      `${APP_NAME}.app`,
      'Contents',
      'MacOS',
      APP_NAME,
    );
    if (existsSync(executable)) {
      return executable;
    }
  }

  return undefined;
}
