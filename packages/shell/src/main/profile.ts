import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { ShellConfig, ShellTestOptions } from '#main/config.ts';

/**
 * The `app.getPath` names Electron would otherwise derive from the app's name, under the user's
 * Application Support (macOS), `%APPDATA%` (Windows) or `~/.config` (Linux), and the folder each
 * gets inside the profile. `sessionData` holds cookies, storage and the HTTP cache; `crashDumps` is
 * Crashpad's database. Logs are set with `app.setAppLogsPath`.
 */
const PROFILE_PATHS = {
  /**
   * Chromium's user data: `Local State`, `Preferences`, `DevToolsActivePort`.
   */
  userData: '.',

  /**
   * The default session's cookies, storage and caches.
   */
  sessionData: '.',

  /**
   * Crashpad's database.
   */
  crashDumps: 'Crashpad',
} as const;

/**
 * The folder of the shell's logs inside the profile.
 */
const LOGS_FOLDER = 'logs';

/**
 * The name prefix of temporary profiles in the system's temporary folder.
 */
const TEMP_PREFIX = 'deck-shell-';

/**
 * The file in a temporary profile that names the shell process using it.
 */
const PID_FILE = '.deck-shell-pid';

/**
 * How old a temporary profile without a running owner must be before it is removed, so a profile
 * that is being created is never taken.
 */
const ORPHAN_AGE_MS = 60_000;

/**
 * Where a profile comes from: the CLI's folder in the workspace, or a temporary one that is removed
 * when the shell exits.
 */
export type ProfileChoice = {
  /**
   * The absolute profile folder.
   */
  dir: string;

  /**
   * Whether the folder is temporary and removed on exit.
   */
  temporary: boolean;
};

/**
 * The folder in the system's temporary folder that holds the shell's temporary profiles. Everything
 * inside it is the shell's, so a leftover without an owner marker may be removed there; outside it,
 * only folders that carry the marker are ever touched. Its name does not start with
 * {@link TEMP_PREFIX}, so older shells, which pruned every `deck-shell-*` folder, leave it alone.
 */
export const PROFILES_FOLDER = 'deck-shell.profiles';

/**
 * Whether a process runs.
 *
 * @param pid - The process id.
 */
function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/**
 * The owner a profile's marker names: a pid, `undefined` when the marker is missing or unreadable.
 *
 * @param dir - The profile folder.
 */
function profileOwner(dir: string): number | undefined {
  try {
    const pid = Number.parseInt(readFileSync(path.join(dir, PID_FILE), 'utf8'), 10);
    return Number.isInteger(pid) && pid > 0 ? pid : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Whether a folder was modified within {@link ORPHAN_AGE_MS}; a folder that cannot be read counts
 * as young, so it is left alone.
 *
 * @param dir - The folder.
 * @param now - The current time in milliseconds.
 */
function isYoung(dir: string, now: number): boolean {
  try {
    return now - statSync(dir).mtimeMs < ORPHAN_AGE_MS;
  } catch {
    return true;
  }
}

/**
 * The `deck-shell-*` folders directly inside a folder; none when it cannot be read.
 *
 * @param parent - The folder to list.
 */
function profileFolders(parent: string): string[] {
  try {
    return readdirSync(parent, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name.startsWith(TEMP_PREFIX))
      .map((entry) => path.join(parent, entry.name));
  } catch {
    return [];
  }
}

/**
 * Removes temporary profiles that earlier shells left behind: Chromium writes a few files while it
 * shuts down, after the shell removed its profile, and a killed shell removes nothing. A profile
 * younger than a minute, or whose owner (its pid marker) still runs, is kept. Inside
 * {@link PROFILES_FOLDER}, which only the shell writes to, a profile without a marker is a leftover
 * and is removed; directly in the temporary folder (where shells before that folder put their
 * profiles) a folder is removed only when it carries a marker naming a process that is gone, so an
 * unrelated `deck-shell-backup` folder is never touched.
 *
 * @param tmpRoot - The temporary folder.
 * @param now - The current time in milliseconds.
 * @param isAlive - Whether a process runs.
 * @returns The folders removed.
 */
export function pruneTemporaryProfiles(
  tmpRoot: string,
  now: number = Date.now(),
  isAlive: (pid: number) => boolean = processAlive,
): string[] {
  const candidates = [
    ...profileFolders(tmpRoot).map((dir) => ({ dir, needsMarker: true })),
    ...profileFolders(path.join(tmpRoot, PROFILES_FOLDER)).map((dir) => ({
      dir,
      needsMarker: false,
    })),
  ];
  const removed: string[] = [];
  for (const { dir, needsMarker } of candidates) {
    const owner = profileOwner(dir);
    if (owner === undefined ? needsMarker : isAlive(owner)) {
      continue;
    }

    if (isYoung(dir, now)) {
      continue;
    }

    try {
      rmSync(dir, { recursive: true, force: true });
      removed.push(dir);
    } catch {
      // Another shell removed it first, or it is not ours to remove.
    }
  }

  return removed;
}

/**
 * The shell's own parent folder for temporary profiles, created private to the user. When it exists
 * but is not a plain folder owned by this user (a symbolic link, or a folder another user made in a
 * shared `/tmp`), the temporary folder itself is used instead.
 *
 * @param tmpRoot - The temporary folder.
 */
function profilesParent(tmpRoot: string): string {
  const parent = path.join(tmpRoot, PROFILES_FOLDER);
  try {
    mkdirSync(parent, { recursive: true, mode: 0o700 });
    const stat = lstatSync(parent);
    const ownUser = process.getuid === undefined || stat.uid === process.getuid();
    return stat.isDirectory() && !stat.isSymbolicLink() && ownUser ? parent : tmpRoot;
  } catch {
    return tmpRoot;
  }
}

/**
 * Creates a temporary profile owned by this process, after pruning orphaned ones, in
 * {@link PROFILES_FOLDER}. The path is the real one (`/private/var/...` on macOS), as Electron
 * reports every folder inside it.
 *
 * @param tmpRoot - The temporary folder; the system's by default.
 * @param pid - The owner's process id.
 */
export function makeTemporaryProfile(
  tmpRoot: string = os.tmpdir(),
  pid: number = process.pid,
): string {
  pruneTemporaryProfiles(tmpRoot);
  const dir = realpathSync(mkdtempSync(path.join(profilesParent(tmpRoot), TEMP_PREFIX)));
  writeFileSync(path.join(dir, PID_FILE), String(pid));
  return dir;
}

/**
 * Picks the profile folder. The CLI's `profileDir` is used for a real presentation; under the test
 * options, or when no folder was given, a fresh temporary folder is used, so tests and other
 * drivers (Playwright) never share a profile or write to the user's folders.
 *
 * @param config - The shell's configuration.
 * @param test - The test options.
 * @param makeTemp - Creates a temporary folder; {@link makeTemporaryProfile} in the shell.
 */
export function chooseProfile(
  config: Pick<ShellConfig, 'profileDir'>,
  test: Pick<ShellTestOptions, 'hidden' | 'corner'>,
  makeTemp: () => string = makeTemporaryProfile,
): ProfileChoice {
  if (config.profileDir !== undefined && !test.hidden && !test.corner) {
    return { dir: config.profileDir, temporary: false };
  }

  return { dir: makeTemp(), temporary: true };
}

/**
 * The part of Electron's `app` that moves its folders.
 */
export type ProfileApp = {
  /**
   * Overrides a special folder; the folder must exist.
   *
   * @param name - An `app.getPath` name.
   * @param folder - The absolute folder.
   */
  setPath: (name: string, folder: string) => void;

  /**
   * Sets the folder of the app's logs.
   *
   * @param folder - The absolute folder.
   */
  setAppLogsPath: (folder: string) => void;
};

/**
 * Points every per-app folder Electron would create under the user's Application Support, Logs or
 * Caches at the profile folder. It must run before the app's `ready` event, and before
 * `app.setName`, which would otherwise name those folders after the deck.
 *
 * @param app - Electron's `app`.
 * @param dir - The profile folder.
 * @param mkdir - Creates a folder and its parents; `fs.mkdirSync` in the shell.
 */
export function applyProfile(
  app: ProfileApp,
  dir: string,
  mkdir: (folder: string) => void = (folder) => void mkdirSync(folder, { recursive: true }),
): void {
  for (const [name, relative] of Object.entries(PROFILE_PATHS)) {
    const folder = path.join(dir, relative);
    mkdir(folder);
    app.setPath(name, folder);
  }

  const logs = path.join(dir, LOGS_FOLDER);
  mkdir(logs);
  app.setAppLogsPath(logs);
}

/**
 * Removes a temporary profile, ignoring failures: Chromium's helpers may still hold files while the
 * process exits.
 *
 * @param choice - The profile in use.
 */
export function removeTemporaryProfile(choice: ProfileChoice): void {
  if (choice.temporary) {
    try {
      rmSync(choice.dir, { recursive: true, force: true });
    } catch {
      // The folder is in the system's temporary directory, which the system cleans.
    }
  }
}
