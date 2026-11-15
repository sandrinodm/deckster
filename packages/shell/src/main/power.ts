/**
 * The part of Electron's `powerSaveBlocker` the shell uses.
 */
export type PowerBlockerLike = {
  /**
   * Starts blocking and returns the blocker's id.
   *
   * @param type - What to prevent.
   */
  start: (type: 'prevent-display-sleep') => number;

  /**
   * Stops a blocker.
   *
   * @param id - The id `start` returned.
   */
  stop: (id: number) => void;
};

/**
 * Keeps the display awake while a window is fullscreen.
 */
export type PowerGuard = {
  /**
   * Sets whether any window is fullscreen. Blocks sleep when it turns on, releases when it turns
   * off; repeating the same value does nothing.
   *
   * @param active - Whether a window is fullscreen.
   */
  update: (active: boolean) => void;

  /**
   * Releases any blocker.
   */
  release: () => void;
};

/**
 * Creates a {@link PowerGuard}.
 *
 * @param blocker - Electron's `powerSaveBlocker`.
 */
export function createPowerGuard(blocker: PowerBlockerLike): PowerGuard {
  let id: number | undefined;
  /**
   * Releases the blocker, if one is running.
   */
  const release = (): void => {
    if (id !== undefined) {
      blocker.stop(id);
      id = undefined;
    }
  };
  return {
    update: (active) => {
      if (active && id === undefined) {
        id = blocker.start('prevent-display-sleep');
      } else if (!active) {
        release();
      }
    },
    release,
  };
}
