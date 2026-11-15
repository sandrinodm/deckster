import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import type { ShellDisplay, ShellRect, ShellWindowRole } from '#protocol/shell-messages.ts';

/**
 * Where one window was last: its bounds and the display it was on.
 */
export type SavedWindow = {
  /**
   * The window's bounds.
   */
  bounds: ShellRect;

  /**
   * The id of the display it was on.
   */
  displayId: number;
};

/**
 * The contents of `.deck/shell/windows.json`: the last position of each deck's windows.
 */
export type WindowState = {
  /**
   * The file format version.
   */
  version: 1;

  /**
   * The windows of each deck, by the deck's key.
   */
  decks: Record<string, Partial<Record<ShellWindowRole, SavedWindow>>>;
};

/**
 * A state with no windows.
 */
export const EMPTY_WINDOW_STATE: WindowState = {
  /**
   * The file format version.
   */
  version: 1,

  /**
   * The windows of each deck.
   */
  decks: {},
};

/**
 * The smallest part of a restored window that must lie inside its display's work area, so a window
 * saved almost off screen is not restored as an unreachable sliver.
 */
const MIN_VISIBLE = {
  /**
   * The visible width, in points.
   */
  width: 200,

  /**
   * The visible height, in points.
   */
  height: 120,
} as const;

/**
 * The window roles a state file may hold.
 */
const ROLES: readonly ShellWindowRole[] = ['audience', 'presenter'];

/**
 * Whether a value is a plain JSON object: not `null`, not an array.
 *
 * @param value - Anything.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Whether a value is a finite number.
 *
 * @param value - Anything.
 */
function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Reads one saved window, or `undefined` when any part of it is malformed.
 *
 * @param value - The entry from the file.
 */
function parseSavedWindow(value: unknown): SavedWindow | undefined {
  if (!isRecord(value) || !isFiniteNumber(value['displayId']) || !isRecord(value['bounds'])) {
    return undefined;
  }

  const { x, y, width, height } = value['bounds'];
  if (
    !isFiniteNumber(x) ||
    !isFiniteNumber(y) ||
    !isFiniteNumber(width) ||
    !isFiniteNumber(height)
  ) {
    return undefined;
  }

  return { bounds: { x, y, width, height }, displayId: value['displayId'] };
}

/**
 * Reads the windows of one deck, keeping each well-formed role and dropping the rest.
 *
 * @param value - The deck's entry from the file.
 */
function parseDeckWindows(value: unknown): WindowState['decks'][string] | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const windows: Partial<Record<ShellWindowRole, SavedWindow>> = {};
  for (const role of ROLES) {
    const saved = Object.hasOwn(value, role) ? parseSavedWindow(value[role]) : undefined;
    if (saved !== undefined) {
      windows[role] = saved;
    }
  }

  return Object.keys(windows).length === 0 ? undefined : windows;
}

/**
 * Parses the text of a state file. Anything unreadable, or of another version, is an empty state,
 * and every malformed deck or window inside a readable file is dropped: losing a window position is
 * never worth failing over, and a damaged file must not make every later start fail.
 *
 * @param text - The file's contents.
 */
export function parseWindowState(text: string): WindowState {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return EMPTY_WINDOW_STATE;
  }

  if (!isRecord(value) || value['version'] !== 1 || !isRecord(value['decks'])) {
    return EMPTY_WINDOW_STATE;
  }

  const decks: WindowState['decks'] = {};
  for (const [key, entry] of Object.entries(value['decks'])) {
    const windows = parseDeckWindows(entry);
    if (windows !== undefined) {
      Object.defineProperty(decks, key, {
        value: windows,
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
  }

  return { version: 1, decks };
}

/**
 * The saved position of one window of one deck, read only from the state's own entries, so a deck
 * key such as `constructor` or `__proto__` never reaches the prototype.
 *
 * @param state - The state.
 * @param key - The deck's key.
 * @param role - Which window.
 */
export function savedWindow(
  state: WindowState,
  key: string,
  role: ShellWindowRole,
): SavedWindow | undefined {
  const windows = Object.hasOwn(state.decks, key) ? state.decks[key] : undefined;
  return windows !== undefined && Object.hasOwn(windows, role) ? windows[role] : undefined;
}

/**
 * Returns a state with one window's position replaced.
 *
 * @param state - The current state.
 * @param key - The deck's key.
 * @param role - Which window.
 * @param saved - Its new position.
 */
export function withSavedWindow(
  state: WindowState,
  key: string,
  role: ShellWindowRole,
  saved: SavedWindow,
): WindowState {
  const decks: WindowState['decks'] = { ...state.decks };
  Object.defineProperty(decks, key, {
    value: { ...(Object.hasOwn(state.decks, key) ? state.decks[key] : {}), [role]: saved },
    enumerable: true,
    writable: true,
    configurable: true,
  });
  return { version: 1, decks };
}

/**
 * The saved bounds worth restoring: only when the window is wanted on the display it was saved on,
 * that display is still connected, and at least {@link MIN_VISIBLE} of the window lies inside its
 * work area. Otherwise the window gets default bounds on the planned display.
 *
 * @param saved - The saved position, if any.
 * @param wantedDisplayId - The display the plan puts the window on.
 * @param displays - The connected displays.
 */
export function restorableBounds(
  saved: SavedWindow | undefined,
  wantedDisplayId: number,
  displays: readonly ShellDisplay[],
): ShellRect | undefined {
  if (saved === undefined || saved.displayId !== wantedDisplayId) {
    return undefined;
  }

  const display = displays.find((candidate) => candidate.id === wantedDisplayId);
  if (display === undefined) {
    return undefined;
  }

  const { bounds } = saved;
  const area = display.workArea;
  const visibleWidth =
    Math.min(bounds.x + bounds.width, area.x + area.width) - Math.max(bounds.x, area.x);
  const visibleHeight =
    Math.min(bounds.y + bounds.height, area.y + area.height) - Math.max(bounds.y, area.y);
  return visibleWidth >= MIN_VISIBLE.width && visibleHeight >= MIN_VISIBLE.height
    ? bounds
    : undefined;
}

/**
 * Reads the state file; a missing or broken file is an empty state.
 *
 * @param file - The absolute path of `windows.json`.
 */
export function readWindowState(file: string): WindowState {
  try {
    return parseWindowState(readFileSync(file, 'utf8'));
  } catch {
    return EMPTY_WINDOW_STATE;
  }
}

/**
 * Writes the state file through a temporary file, so a crash never leaves half a file. Failures are
 * ignored: the position is a convenience.
 *
 * @param file - The absolute path of `windows.json`.
 * @param state - The state to save.
 */
export function writeWindowState(file: string, state: WindowState): void {
  try {
    mkdirSync(dirname(file), { recursive: true });
    const temporary = `${file}.${process.pid}.tmp`;
    writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`);
    renameSync(temporary, file);
  } catch {
    // Not remembering a window position is harmless.
  }
}
