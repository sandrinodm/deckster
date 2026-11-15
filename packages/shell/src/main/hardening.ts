/**
 * The parts of Electron and Node that hardening replaces, so tests can pass fakes.
 */
export type HardeningTarget = {
  /**
   * Electron's `dialog`; `showErrorBox` is replaced with a no-op.
   */
  dialog: {
    /**
     * Shows a native error box; hardening makes it do nothing.
     */
    showErrorBox: (title: string, content: string) => void;
  };

  /**
   * Electron's `app`, for exiting without running quit handlers.
   */
  app: {
    /**
     * Exits the process at once.
     *
     * @param code - The exit code.
     */
    exit: (code: number) => void;
  };

  /**
   * The Node process, whose uncaught errors become exits.
   */
  process: {
    /**
     * Registers a listener for a process event.
     *
     * @param event - `uncaughtException` or `unhandledRejection`.
     * @param listener - Called with the error.
     */
    on: (
      event: 'uncaughtException' | 'unhandledRejection',
      listener: (error: unknown) => void,
    ) => void;
  };

  /**
   * Where a last message about the failure goes; standard error in the shell.
   */
  report: (message: string) => void;
};

/**
 * Makes the shell unable to show a native dialog or to outlive a crash. It must be the first thing
 * the shell's main does, before Electron is asked for anything else: a native error dialog keeps
 * the process alive on screen after the CLI that started it is gone.
 *
 * - `dialog.showErrorBox` does nothing.
 * - An uncaught exception or unhandled rejection reports to standard error and exits with code 1.
 *
 * @param target - Electron's `dialog` and `app`, the Node process and the reporter.
 */
export function installHardening(target: HardeningTarget): void {
  target.dialog.showErrorBox = () => undefined;
  /**
   * Reports a crash on standard error and exits with code 1.
   */
  const fail = (error: unknown): void => {
    target.report(
      `shell crashed: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`,
    );
    target.app.exit(1);
  };
  target.process.on('uncaughtException', fail);
  target.process.on('unhandledRejection', fail);
}
