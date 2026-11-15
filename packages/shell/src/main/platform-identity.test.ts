import { describe, expect, it } from 'vite-plus/test';

import { appNameFor, applyPlatformIdentity } from '#main/platform-identity.ts';

/**
 * A fake `app` that records what it was told.
 */
function fakeApp() {
  const calls: string[] = [];
  return {
    calls,
    app: {
      setAppUserModelId: (id: string) => calls.push(`aumid ${id}`),
      setDesktopName: (name: string) => calls.push(`desktop ${name}`),
      commandLine: {
        appendSwitch: (name: string, value?: string) => calls.push(`switch ${name}=${value}`),
      },
    },
  };
}

describe('the platform identity', () => {
  it('sets the AppUserModelID on Windows', () => {
    const { app, calls } = fakeApp();
    applyPlatformIdentity(app, 'win32');
    expect(calls).toEqual(['aumid dev.deckster.shell']);
  });

  it('sets the desktop name on Linux', () => {
    const { app, calls } = fakeApp();
    applyPlatformIdentity(app, 'linux');
    expect(calls).toEqual(['desktop deckster.desktop']);
  });

  it('leaves macOS to the bundle', () => {
    const { app, calls } = fakeApp();
    applyPlatformIdentity(app, 'darwin');
    expect(calls).toEqual([]);
  });

  it('keeps the app name on Linux, where it becomes the window class', () => {
    expect(appNameFor('linux', 'Deckster: Hello')).toBe('Deckster');
    expect(appNameFor('darwin', 'Deckster: Hello')).toBe('Deckster: Hello');
    expect(appNameFor('win32', 'Deckster: Hello')).toBe('Deckster: Hello');
  });
});
