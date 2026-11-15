/**
 * Permissions the deck's own pages may use: fullscreen for the presenter tools, media for mini apps
 * that ask for the camera or microphone, and writing to the clipboard from a code block.
 */
const ALLOWED_PERMISSIONS = new Set(['fullscreen', 'media', 'clipboard-sanitized-write']);

/**
 * Decides one permission request. Anything but the permissions above is refused, and so is any
 * request that does not come from the deck server's origin.
 *
 * @param permission - Electron's permission name.
 * @param requestingUrl - The URL of the page that asks.
 * @param appOrigin - The deck server's origin.
 */
export function decidePermission(
  permission: string,
  requestingUrl: string,
  appOrigin: string,
): boolean {
  return (
    ALLOWED_PERMISSIONS.has(permission) &&
    URL.canParse(requestingUrl) &&
    new URL(requestingUrl).origin === appOrigin
  );
}

/**
 * The part of an Electron `Session` the shell sets handlers on.
 */
export type SessionLike = {
  /**
   * Sets the handler for permission requests.
   *
   * @param handler - Called with the request; `callback` grants or denies.
   */
  setPermissionRequestHandler: (
    handler: (
      webContents: unknown,
      permission: string,
      callback: (granted: boolean) => void,
      details: { requestingUrl: string },
    ) => void,
  ) => void;

  /**
   * Sets the handler for permission checks.
   *
   * @param handler - Returns whether the permission is granted.
   */
  setPermissionCheckHandler: (
    handler: (webContents: unknown, permission: string, requestingOrigin: string) => boolean,
  ) => void;
};

/**
 * Installs {@link decidePermission} on a session, for requests and for checks.
 *
 * @param session - The session the windows use.
 * @param appOrigin - The deck server's origin.
 */
export function installPermissions(session: SessionLike, appOrigin: string): void {
  session.setPermissionRequestHandler((_contents, permission, callback, details) => {
    callback(decidePermission(permission, details.requestingUrl, appOrigin));
  });
  session.setPermissionCheckHandler((_contents, permission, requestingOrigin) =>
    decidePermission(permission, requestingOrigin, appOrigin),
  );
}
