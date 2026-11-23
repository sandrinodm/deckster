import type { DeckShellApi } from '@deckster/shell/api';

import { createStore } from '#state/store.ts';

/**
 * Whether the shell's window is fullscreen, kept current by {@link watchShellFullscreen}.
 */
export const shellFullscreen = createStore(false);

/**
 * Stops the current fullscreen subscription, so a hot reload does not stack them.
 */
let stopWatching: (() => void) | undefined;

/**
 * The desktop shell's API when the page runs inside `deckster present`'s window, else `undefined`.
 */
export function deckShell(): DeckShellApi | undefined {
  return typeof window === 'undefined' ? undefined : window.deckShell;
}

/**
 * Follows the shell window's fullscreen state into {@link shellFullscreen}. Does nothing outside the
 * shell.
 */
export function watchShellFullscreen(): void {
  stopWatching?.();
  stopWatching = undefined;
  const shell = deckShell();
  if (shell === undefined) {
    return;
  }

  shell
    .isFullscreen()
    .then((on) => shellFullscreen.set(on))
    .catch(() => undefined);
  stopWatching = shell.onFullscreenChange((on) => shellFullscreen.set(on));
}
