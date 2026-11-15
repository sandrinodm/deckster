import { describe, expect, it } from 'vite-plus/test';

import { decidePermission, installPermissions, type SessionLike } from '#main/permissions.ts';

const ORIGIN = 'http://127.0.0.1:5173';

describe('permissions', () => {
  it('allows fullscreen, media and clipboard writes for the deck only', () => {
    for (const permission of ['fullscreen', 'media', 'clipboard-sanitized-write']) {
      expect(decidePermission(permission, `${ORIGIN}/`, ORIGIN)).toBe(true);
      expect(decidePermission(permission, 'https://example.com/', ORIGIN)).toBe(false);
    }
  });

  it('denies everything else', () => {
    for (const permission of ['geolocation', 'notifications', 'openExternal', 'midi', 'hid']) {
      expect(decidePermission(permission, `${ORIGIN}/`, ORIGIN)).toBe(false);
    }

    expect(decidePermission('fullscreen', 'not a url', ORIGIN)).toBe(false);
  });

  it('installs both handlers on the session', () => {
    let request: Parameters<SessionLike['setPermissionRequestHandler']>[0] | undefined;
    let check: Parameters<SessionLike['setPermissionCheckHandler']>[0] | undefined;
    installPermissions(
      {
        setPermissionRequestHandler: (handler) => (request = handler),
        setPermissionCheckHandler: (handler) => (check = handler),
      },
      ORIGIN,
    );
    const answers: boolean[] = [];
    request?.(undefined, 'fullscreen', (granted) => answers.push(granted), {
      requestingUrl: `${ORIGIN}/`,
    });
    request?.(undefined, 'geolocation', (granted) => answers.push(granted), {
      requestingUrl: `${ORIGIN}/`,
    });
    expect(answers).toEqual([true, false]);
    expect(check?.(undefined, 'media', ORIGIN)).toBe(true);
    expect(check?.(undefined, 'media', 'https://example.com')).toBe(false);
  });
});
