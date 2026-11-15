import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vite-plus/test';

import {
  applyProfile,
  chooseProfile,
  makeTemporaryProfile,
  PROFILES_FOLDER,
  pruneTemporaryProfiles,
} from '#main/profile.ts';

/**
 * Temporary folders made by a test, removed after it.
 */
const scratch: string[] = [];

/**
 * A fresh folder standing in for the system's temporary folder.
 */
function tmpRoot(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'profile-test-'));
  scratch.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of scratch.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('the shell profile', () => {
  it('uses the CLI folder for a real presentation', () => {
    expect(
      chooseProfile(
        { profileDir: '/work/.deck/shell/profile' },
        { hidden: false, corner: false },
        () => '/tmp/never',
      ),
    ).toEqual({ dir: '/work/.deck/shell/profile', temporary: false });
  });

  it('uses a temporary folder under the test options and without a folder', () => {
    let made = 0;
    /**
     * Counts the calls and returns a fake folder.
     */
    const makeTemp = (): string => `/tmp/deck-shell-${(made += 1)}`;
    const profileDir = '/work/.deck/shell/profile';
    expect(chooseProfile({ profileDir }, { hidden: true, corner: false }, makeTemp)).toEqual({
      dir: '/tmp/deck-shell-1',
      temporary: true,
    });
    expect(chooseProfile({ profileDir }, { hidden: false, corner: true }, makeTemp).temporary).toBe(
      true,
    );
    expect(chooseProfile({}, { hidden: false, corner: false }, makeTemp).temporary).toBe(true);
    expect(made).toBe(3);
  });

  it('moves every per-app folder into the profile, creating each first', () => {
    const calls: string[] = [];
    applyProfile(
      {
        setPath: (name, folder) => calls.push(`set ${name} ${folder}`),
        setAppLogsPath: (folder) => calls.push(`logs ${folder}`),
      },
      '/p',
      (folder) => calls.push(`mkdir ${folder}`),
    );
    expect(calls).toEqual([
      'mkdir /p',
      'set userData /p',
      'mkdir /p',
      'set sessionData /p',
      'mkdir /p/Crashpad',
      'set crashDumps /p/Crashpad',
      'mkdir /p/logs',
      'logs /p/logs',
    ]);
  });

  it("creates a temporary profile that names its owner, in the shell's own parent folder", () => {
    const root = tmpRoot();
    const dir = makeTemporaryProfile(root, 4242);
    expect(path.basename(dir)).toMatch(/^deck-shell-/);
    expect(path.dirname(dir)).toBe(path.join(realpathSync(root), PROFILES_FOLDER));
    expect(existsSync(path.join(dir, '.deck-shell-pid'))).toBe(true);
  });

  it('never removes a folder of the temporary root that lacks the owner marker', () => {
    const root = tmpRoot();
    const old = Date.now() / 1000 - 3600;
    const backup = path.join(root, 'deck-shell-backup');
    mkdirSync(path.join(backup, 'important'), { recursive: true });
    writeFileSync(path.join(backup, 'important', 'notes.txt'), 'keep me');
    utimesSync(backup, old, old);
    const removed = pruneTemporaryProfiles(root, Date.now(), () => false);
    expect(removed).toEqual([]);
    expect(existsSync(path.join(backup, 'important', 'notes.txt'))).toBe(true);
  });

  it('prunes temporary profiles whose owner is gone, keeping live, young and unmarked ones', () => {
    const root = tmpRoot();
    const parent = path.join(root, PROFILES_FOLDER);
    mkdirSync(parent);
    const old = Date.now() / 1000 - 3600;
    /**
     * Makes a profile folder with an optional owner, an hour old unless `young`.
     */
    const profile = (dir: string, pid: number | undefined, young = false): string => {
      mkdirSync(path.join(dir, 'Cache'), { recursive: true });
      if (pid !== undefined) {
        writeFileSync(path.join(dir, '.deck-shell-pid'), String(pid));
      }

      if (!young) {
        utimesSync(dir, old, old);
      }

      return dir;
    };
    const legacyDead = profile(path.join(root, 'deck-shell-dead'), 111);
    const legacyUnmarked = profile(path.join(root, 'deck-shell-leftover'), undefined);
    const legacyLive = profile(path.join(root, 'deck-shell-live'), 222);
    const other = profile(path.join(root, 'something-else'), undefined);
    const dead = profile(path.join(parent, 'deck-shell-dead'), 333);
    const leftover = profile(path.join(parent, 'deck-shell-leftover'), undefined);
    const live = profile(path.join(parent, 'deck-shell-live'), 222);
    const fresh = profile(path.join(parent, 'deck-shell-fresh'), undefined, true);
    const removed = pruneTemporaryProfiles(root, Date.now(), (pid) => pid === 222);
    expect(removed.sort()).toEqual([legacyDead, dead, leftover].sort());
    expect([legacyUnmarked, legacyLive, other, live, fresh].every((dir) => existsSync(dir))).toBe(
      true,
    );
  });
});
