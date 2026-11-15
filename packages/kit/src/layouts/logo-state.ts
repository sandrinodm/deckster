/**
 * What a logo's file turned out to be: its measured shape, or `failed`.
 */
export type LogoOutcome<Measured> = Measured | 'failed';

/**
 * A logo's outcome with the file it belongs to.
 */
export type LogoState<Measured> = {
  /**
   * The file URL the outcome is about.
   */
  source: string;

  /**
   * What loading it gave.
   */
  outcome: LogoOutcome<Measured>;
};

/**
 * The outcome that counts for a logo's current file: the stored one only when it is about that
 * file, so a logo that moves to another place in the list, or whose file is replaced on a hot
 * reload, never carries another file's failure.
 *
 * @param state - The outcome stored by the cell, if any.
 * @param source - The file the cell shows now.
 * @returns The outcome, or `undefined` while the file has not loaded.
 */
export function outcomeFor<Measured>(
  state: LogoState<Measured> | undefined,
  source: string | undefined,
): LogoOutcome<Measured> | undefined {
  return state !== undefined && state.source === source ? state.outcome : undefined;
}
