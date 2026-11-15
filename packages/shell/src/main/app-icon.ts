import { fileURLToPath } from 'node:url';

/**
 * The shell's icon files in `assets/`, by platform: macOS takes the PNG for the dock (a running
 * app's dock icon is a picture, not the bundle's `.icns`), Windows the multi-size `.ico` for the
 * window and taskbar, and Linux the PNG for the window.
 */
const ICON_FILES = {
  /**
   * The dock icon, 1024 px, drawn on the macOS icon grid.
   */
  darwin: 'icon.png',

  /**
   * The window and taskbar icon, 16 to 256 px.
   */
  win32: 'icon.ico',

  /**
   * The window icon on Linux and anywhere else.
   */
  other: 'icon.png',
} as const;

/**
 * The absolute path of the shell's icon for a platform. Without it a development run shows
 * Electron's own icon in the dock, the app switcher and the taskbar.
 *
 * @param platform - The platform, as `process.platform`.
 */
export function appIconPath(platform: string): string {
  const file =
    platform === 'darwin' || platform === 'win32' ? ICON_FILES[platform] : ICON_FILES.other;
  return fileURLToPath(new URL(`../../assets/${file}`, import.meta.url));
}
