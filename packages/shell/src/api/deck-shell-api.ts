import type { ShellDisplay } from '#protocol/shell-messages.ts';

/**
 * What the shell's preload script puts on `window.deckShell`: the only way a deck page talks to the
 * desktop shell. Pages check for its existence; without it the page runs in a plain browser.
 */
export type DeckShellApi = {
  /**
   * Always `true`; marks the object as the shell's.
   */
  readonly isShell: true;

  /**
   * The connected displays.
   */
  displays: () => Promise<readonly ShellDisplay[]>;

  /**
   * Opens the presenter window, or focuses it when it is open.
   *
   * @param displayId - The display to open it on; leave it out for the display other than this
   *   window's, when there is one.
   */
  openPresenter: (displayId?: number) => Promise<void>;

  /**
   * Makes this window fullscreen or windowed.
   *
   * @param on - Whether to be fullscreen.
   */
  setFullscreen: (on: boolean) => Promise<void>;

  /**
   * Whether this window is fullscreen.
   */
  isFullscreen: () => Promise<boolean>;

  /**
   * Listens for this window entering or leaving fullscreen.
   *
   * @param listener - Called with the new state.
   * @returns A function that stops listening.
   */
  onFullscreenChange: (listener: (on: boolean) => void) => () => void;

  /**
   * Moves this window to a display.
   *
   * @param displayId - The display's id.
   */
  moveToDisplay: (displayId: number) => Promise<void>;
};

declare global {
  /**
   * The browser window, with the desktop shell's API inside `deck present`.
   */
  // Augmenting the global Window needs interface declaration merging.
  // oxlint-disable-next-line typescript/consistent-type-definitions
  interface Window {
    /**
     * The desktop shell's API; present only inside `deck present`'s window.
     */
    deckShell?: DeckShellApi;
  }
}
