import { createHash } from 'node:crypto';

import { APP_NAME, BUNDLE_ID, HELPER_BUNDLE_ID, HELPER_SUFFIXES } from '#bundle/app-identity.ts';

/**
 * Bumped whenever the steps of {@link brandedAppPlan} change, so bundles built by an older recipe
 * are never reused.
 */
export const RECIPE_VERSION = 1;

/**
 * How the branded app is signed. `outer` re-signs ad hoc only what the recipe changed (the helper
 * apps, then the app) and leaves Electron's frameworks as shipped, so the clone stays about 1 MB of
 * real disk; `none` signs nothing, which still launches because Electron's own binaries keep their
 * linker signatures.
 */
export type SigningMode = 'outer' | 'none';

/**
 * What the cache key is made of.
 */
export type BrandedAppInputs = {
  /**
   * The contents of Electron's `dist/version`, trimmed.
   */
  electronVersion: string;

  /**
   * The CPU architecture, `process.arch`.
   */
  arch: string;

  /**
   * How the bundle is signed.
   */
  signing: SigningMode;

  /**
   * SHA-256 (hex) of the stock `Contents/MacOS/Electron`.
   */
  electronExecutableHash: string;

  /**
   * SHA-256 (hex) of the stock `Contents/Info.plist`.
   */
  electronPlistHash: string;

  /**
   * SHA-256 (hex) of the icon file.
   */
  iconHash: string;

  /**
   * SHA-256 (hex) of the stub app's files, in a fixed order.
   */
  stubHash: string;
};

/**
 * The name of the folder that holds one build: 16 hex characters of SHA-256 over everything the
 * bundle is made from, so a changed Electron, icon, stub, recipe or signing mode is a new folder
 * and a folder is never modified once it is in place.
 *
 * @param inputs - What the bundle is made from.
 * @param plan - What is done to it, hashed whole so that editing a plist string or an identifier
 *   never reuses an old bundle; the plan for the inputs' signing mode unless a test passes one.
 */
export function brandedAppKey(
  inputs: BrandedAppInputs,
  plan: BrandedAppPlan = brandedAppPlan(inputs.signing, '', ''),
): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        recipe: RECIPE_VERSION,
        name: APP_NAME,
        bundleId: BUNDLE_ID,
        arch: inputs.arch,
        signing: inputs.signing,
        electronVersion: inputs.electronVersion,
        electronExecutable: inputs.electronExecutableHash,
        electronPlist: inputs.electronPlistHash,
        icon: inputs.iconHash,
        stub: inputs.stubHash,
        plan,
      }),
    )
    .digest('hex')
    .slice(0, 16);
}

/**
 * One edit of an `Info.plist`, applied with `plutil`.
 */
export type PlistEdit =
  | {
      /**
       * Set a key; `plutil -replace` adds it when it is missing.
       */
      op: 'replace';

      /**
       * The key.
       */
      key: string;

      /**
       * The string value.
       */
      value: string;
    }
  | {
      /**
       * Delete a key; a key that is already missing is not a failure.
       */
      op: 'remove';

      /**
       * The key.
       */
      key: string;
    };

/**
 * A file or folder renamed inside the bundle; both paths are relative to the `.app` folder.
 */
export type Rename = {
  /**
   * The path before.
   */
  from: string;

  /**
   * The path after.
   */
  to: string;
};

/**
 * The edits to one `Info.plist`.
 */
export type PlistPlan = {
  /**
   * The plist's path relative to the `.app` folder, after the renames.
   */
  file: string;

  /**
   * The edits, in order.
   */
  edits: readonly PlistEdit[];
};

/**
 * What the branded app is made of, as plain values; the runner carries it out. Every path is
 * relative to the `.app` folder and uses `/`.
 */
export type BrandedAppPlan = {
  /**
   * The app's folder name, `Deckster.app`.
   */
  appFolder: string;

  /**
   * The main executable, after the renames.
   */
  executable: string;

  /**
   * The renames, in order: the main executable, then for each helper its executable and its folder.
   */
  renames: readonly Rename[];

  /**
   * Files removed: Electron's icon and its default app.
   */
  removals: readonly string[];

  /**
   * Where the icon file is installed.
   */
  icon: string;

  /**
   * The folder the stub app's files are copied into.
   */
  stubFolder: string;

  /**
   * The `Info.plist` edits, the main app's first and then each helper's.
   */
  plists: readonly PlistPlan[];

  /**
   * The stamp that names what the bundle was built from.
   */
  stamp: string;

  /**
   * The code signed ad hoc, as groups in the order they are signed (inside out); empty when nothing
   * is signed.
   */
  signing: readonly (readonly string[])[];

  /**
   * The paths `codesign --verify --strict` is run on after signing; empty when nothing is signed.
   */
  verify: readonly string[];
};

/**
 * The Electron 45 names that are changed.
 */
const STOCK = {
  /**
   * The main executable's name.
   */
  executable: 'Electron',

  /**
   * The helper apps' name before the suffix.
   */
  helper: 'Electron Helper',
} as const;

/**
 * Plans the branded app: the renames, plist edits, removals and signing order.
 *
 * @param signing - How the bundle is signed.
 * @param key - The cache key, written into the stamp.
 * @param electronVersion - Electron's version, written into the stamp.
 */
export function brandedAppPlan(
  signing: SigningMode,
  key: string,
  electronVersion: string,
): BrandedAppPlan {
  const macos = 'Contents/MacOS';
  const frameworks = 'Contents/Frameworks';
  const executable = `${macos}/${APP_NAME}`;
  const helperFolders = HELPER_SUFFIXES.map(
    (suffix) => `${frameworks}/${APP_NAME} Helper${suffix}.app`,
  );
  const renames: Rename[] = [{ from: `${macos}/${STOCK.executable}`, to: executable }];
  const plists: PlistPlan[] = [
    {
      file: 'Contents/Info.plist',
      edits: [
        { op: 'replace', key: 'CFBundleName', value: APP_NAME },
        { op: 'replace', key: 'CFBundleDisplayName', value: APP_NAME },
        { op: 'replace', key: 'CFBundleExecutable', value: APP_NAME },
        { op: 'replace', key: 'CFBundleIdentifier', value: BUNDLE_ID },
        { op: 'replace', key: 'CFBundleIconFile', value: `${APP_NAME}.icns` },
        {
          op: 'replace',
          key: 'NSCameraUsageDescription',
          value: 'A slide in this deck uses the camera.',
        },
        {
          op: 'replace',
          key: 'NSMicrophoneUsageDescription',
          value: 'A slide in this deck uses the microphone.',
        },
        {
          op: 'replace',
          key: 'NSAudioCaptureUsageDescription',
          value: 'A slide in this deck captures audio.',
        },
        { op: 'remove', key: 'NSBluetoothAlwaysUsageDescription' },
        { op: 'remove', key: 'NSBluetoothPeripheralUsageDescription' },
        { op: 'remove', key: 'ElectronAsarIntegrity' },
      ],
    },
  ];
  for (const suffix of HELPER_SUFFIXES) {
    const from = `${STOCK.helper}${suffix}`;
    const to = `${APP_NAME} Helper${suffix}`;
    renames.push(
      {
        from: `${frameworks}/${from}.app/Contents/MacOS/${from}`,
        to: `${frameworks}/${from}.app/Contents/MacOS/${to}`,
      },
      { from: `${frameworks}/${from}.app`, to: `${frameworks}/${to}.app` },
    );
    plists.push({
      file: `${frameworks}/${to}.app/Contents/Info.plist`,
      edits: [
        { op: 'replace', key: 'CFBundleName', value: to },
        { op: 'replace', key: 'CFBundleDisplayName', value: to },
        { op: 'replace', key: 'CFBundleExecutable', value: to },
        { op: 'replace', key: 'CFBundleIdentifier', value: HELPER_BUNDLE_ID },
      ],
    });
  }

  return {
    appFolder: `${APP_NAME}.app`,
    executable,
    renames,
    removals: ['Contents/Resources/electron.icns', 'Contents/Resources/default_app.asar'],
    icon: `Contents/Resources/${APP_NAME}.icns`,
    stubFolder: 'Contents/Resources/app',
    plists,
    stamp: `${JSON.stringify(
      {
        key,
        recipe: RECIPE_VERSION,
        electronVersion,
        name: APP_NAME,
        bundleId: BUNDLE_ID,
        signing,
      },
      null,
      2,
    )}\n`,
    signing: signing === 'none' ? [] : [helperFolders, ['.']],
    verify: signing === 'none' ? [] : ['.', ...helperFolders],
  };
}
