/**
 * Path separators accepted in native executable paths on every platform.
 */
const PATH_SEPARATOR_PATTERN = /[\\/]/;

/**
 * The product name the shell shows: the Dock, the app switcher, the macOS application menu, the
 * names of the branded app and its helpers, and the start of every window title.
 */
export const APP_NAME = 'Deckster';

/**
 * The bundle identifier of the branded macOS app, and the Windows AppUserModelID.
 */
export const BUNDLE_ID = 'dev.deckster.shell';

/**
 * The bundle identifier of the branded app's four helper apps.
 */
export const HELPER_BUNDLE_ID = `${BUNDLE_ID}.helper`;

/**
 * The helper apps Electron 45 ships, as the suffix after `<name> Helper`. Electron looks for
 * `<CFBundleName> Helper<suffix>.app` with an executable of the same name.
 */
export const HELPER_SUFFIXES = ['', ' (GPU)', ' (Plugin)', ' (Renderer)'] as const;

/**
 * The exit code of the branded app when it is started without an entry file, such as by a double
 * click in Finder.
 */
export const NO_ENTRY_EXIT_CODE = 64;

/**
 * The `.desktop` file name Linux desktops match the window with.
 */
export const LINUX_DESKTOP_NAME = 'deckster.desktop';

/**
 * Whether a process runs from stock Electron rather than the branded app: the executable is still
 * called `Electron`. Only then does the shell set the Dock icon itself.
 *
 * @param executablePath - `process.execPath`.
 */
export function isStockElectron(executablePath: string): boolean {
  const name = executablePath.split(PATH_SEPARATOR_PATTERN).at(-1) ?? '';
  return name === 'Electron' || name === 'electron' || name === 'electron.exe';
}
