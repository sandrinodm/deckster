import type { Screen } from 'electron';

import type { ShellDisplay } from '#protocol/shell-messages.ts';

/**
 * The part of an Electron `Display` the shell reads.
 */
export type DisplayLike = {
  /**
   * The display id.
   */
  id: number;

  /**
   * The display's name.
   */
  label: string;

  /**
   * The full area.
   */
  bounds: ShellDisplay['bounds'];

  /**
   * The area without menu bar and dock.
   */
  workArea: ShellDisplay['workArea'];

  /**
   * Device pixels per point.
   */
  scaleFactor: number;
};

/**
 * The part of Electron's `screen` the shell uses.
 */
export type ScreenLike = {
  /**
   * Every connected display.
   */
  getAllDisplays: () => DisplayLike[];

  /**
   * The primary display.
   */
  getPrimaryDisplay: () => DisplayLike;

  /**
   * The display that contains most of a rectangle.
   *
   * @param rect - The rectangle.
   */
  getDisplayMatching: (rect: ShellDisplay['bounds']) => DisplayLike;
};

/**
 * Lists the connected displays as plain data, in Electron's order. The primary display is not
 * assumed to come first.
 *
 * @param screen - Electron's `screen`; usable only after `app.whenReady()`.
 */
export function listDisplays(screen: ScreenLike): ShellDisplay[] {
  const primaryId = screen.getPrimaryDisplay().id;
  return screen.getAllDisplays().map((display) => ({
    id: display.id,
    label: display.label,
    bounds: { ...display.bounds },
    workArea: { ...display.workArea },
    scaleFactor: display.scaleFactor,
    primary: display.id === primaryId,
  }));
}

/**
 * Finds a display by id.
 *
 * @param displays - The connected displays.
 * @param id - The id to find.
 */
export function findDisplay(
  displays: readonly ShellDisplay[],
  id: number | undefined,
): ShellDisplay | undefined {
  return id === undefined ? undefined : displays.find((display) => display.id === id);
}

/**
 * The display a presenter window should use when the caller names none: the first display other
 * than the audience's, else the audience's own.
 *
 * @param displays - The connected displays.
 * @param audienceId - The display the audience window is on.
 */
export function presenterDisplay(
  displays: readonly ShellDisplay[],
  audienceId: number,
): ShellDisplay | undefined {
  return displays.find((display) => display.id !== audienceId) ?? findDisplay(displays, audienceId);
}

/**
 * The display after the given one, wrapping around; for "move to next display".
 *
 * @param displays - The connected displays.
 * @param currentId - The display the window is on.
 */
export function nextDisplay(
  displays: readonly ShellDisplay[],
  currentId: number,
): ShellDisplay | undefined {
  const index = displays.findIndex((display) => display.id === currentId);
  return displays[(index + 1) % displays.length];
}

/**
 * Calls a function whenever the set of displays changes.
 *
 * @param screen - Electron's `screen`.
 * @param onChange - Called after an add, a removal or a metrics change.
 * @returns A function that stops listening.
 */
export function watchDisplays(screen: Screen, onChange: () => void): () => void {
  screen.on('display-added', onChange);
  screen.on('display-removed', onChange);
  screen.on('display-metrics-changed', onChange);
  return () => {
    screen.removeListener('display-added', onChange);
    screen.removeListener('display-removed', onChange);
    screen.removeListener('display-metrics-changed', onChange);
  };
}
