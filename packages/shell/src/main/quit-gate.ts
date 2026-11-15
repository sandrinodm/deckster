/**
 * The time within which a second quit press confirms the first, in milliseconds.
 */
export const QUIT_CONFIRM_MS = 2000;

/**
 * Kiosk mode's quit guard: Cmd/Ctrl+Q must be pressed twice in a row.
 */
export type QuitGate = {
  /**
   * Registers a quit press.
   *
   * @param now - The time of the press, in milliseconds.
   * @returns Whether the app should quit now.
   */
  press: (now: number) => boolean;
};

/**
 * Creates a {@link QuitGate}.
 */
export function createQuitGate(): QuitGate {
  let firstPress: number | undefined;
  return {
    press: (now) => {
      if (firstPress !== undefined && now - firstPress <= QUIT_CONFIRM_MS) {
        return true;
      }

      firstPress = now;
      return false;
    },
  };
}
