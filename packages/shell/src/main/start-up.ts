/**
 * What start-up needs from the shell.
 */
export type StartUpDeps = {
  /**
   * Whether the shell only reports the displays and exits.
   */
  listOnly: boolean;

  /**
   * Sends the `displays` event.
   */
  sendDisplays: () => void;

  /**
   * Clears the default session's stored data; a failure must already be handled.
   */
  clearDefault: () => Promise<void>;
};

/**
 * Reports the displays first, then starts clearing the default session in the background: the CLI
 * can plan its windows while the disk is busy. The returned promise settles when the clearing is
 * done, and the `open` path waits on it before it creates a window. A list-only shell clears
 * nothing.
 *
 * @param deps - What start-up needs.
 * @returns The promise that settles when the default session is clear.
 */
export function startUp(deps: StartUpDeps): Promise<void> {
  deps.sendDisplays();
  return deps.listOnly ? Promise.resolve() : deps.clearDefault();
}
