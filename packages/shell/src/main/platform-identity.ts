import { APP_NAME, BUNDLE_ID, LINUX_DESKTOP_NAME } from '#bundle/app-identity.ts';

/**
 * The part of Electron's `app` that names the application to the desktop.
 */
export type IdentityApp = {
  /**
   * Sets the Windows AppUserModelID.
   */
  setAppUserModelId: (id: string) => void;

  /**
   * Sets the Linux desktop file name.
   */
  setDesktopName: (name: string) => void;
};

/**
 * Names the app to the desktop where the OS reads the name from the process rather than from a
 * bundle: the AppUserModelID that groups the Windows taskbar and names toasts, and on Linux the
 * desktop file name. macOS takes everything from the branded bundle. Call before the app is ready.
 *
 * @param app - Electron's `app`.
 * @param platform - `process.platform`.
 */
export function applyPlatformIdentity(app: IdentityApp, platform: string): void {
  if (platform === 'win32') {
    app.setAppUserModelId(BUNDLE_ID);
  } else if (platform === 'linux') {
    app.setDesktopName(LINUX_DESKTOP_NAME);
  }
}

/**
 * The name to give `app.setName`. On Linux Electron derives the window class (`WM_CLASS`) from the
 * app name, so it stays `Deckster` and the window titles carry the deck's title; elsewhere the name
 * is the one asked for.
 *
 * @param platform - `process.platform`.
 * @param name - The name the shell would like, such as `Deckster: <deck title>`.
 */
export function appNameFor(platform: string, name: string): string {
  return platform === 'linux' ? APP_NAME : name;
}
