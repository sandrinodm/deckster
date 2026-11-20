import type {
  ShellChooserTarget,
  ShellCommand,
  ShellDisplay,
  ShellEvent,
  ShellPlan,
  ShellTarget,
  ShellWindowInfo,
  ShellWindowRole,
} from '#protocol/shell-messages.ts';

/**
 * The part of the window manager the commands drive, generic over the window type so tests can pass
 * plain objects.
 */
export type CommandWindows<Win> = {
  /**
   * Opens the windows of a plan.
   *
   * @param plan - Where the windows go.
   */
  open: (plan: ShellPlan, requestId?: string) => Promise<void>;

  /**
   * Opens or focuses the presenter window.
   *
   * @param displayId - The display to use, if any.
   */
  openPresenter: (displayId?: number) => ShellWindowInfo | undefined;

  /**
   * Makes the audience window fullscreen or windowed.
   *
   * @param on - Whether to be fullscreen.
   */
  setAudienceFullscreen: (on: boolean) => void;

  /**
   * Moves a window to a display.
   *
   * @param win - The window.
   * @param displayId - The display's id.
   */
  moveToDisplay: (win: Win, displayId: number) => void;

  /**
   * Brings the audience window to the front.
   */
  focus: () => void;

  /**
   * The window of a role, if it is open.
   *
   * @param role - Which window.
   */
  window: (role: ShellWindowRole) => Win | undefined;
};

/**
 * What the command handler needs from the shell.
 */
export type CommandTarget<Win> = {
  /**
   * The window manager.
   */
  windows: CommandWindows<Win>;

  /**
   * Whether the shell already has its deck, from the configuration or an earlier `open`.
   */
  hasTarget: () => boolean;

  /**
   * Adopts the deck of an `open` command: fixes the origin, installs the session hooks and clears
   * the sessions. Called once, before the first window; a rejection is fatal.
   *
   * @param target - The deck.
   */
  adoptTarget: (target: ShellTarget, stateKey?: string) => Promise<void>;

  /**
   * Opens a launcher on the operator display.
   */
  openChooser?: (target: ShellChooserTarget) => Promise<number>;

  /**
   * Opens or places the deck windows after the chooser is active.
   */
  placeChooser?: (plan: ShellPlan, requestId: string) => void;

  /**
   * Retires the windows and session associated with the desktop selection.
   */
  closeDeck?: () => Promise<void>;

  /**
   * Whether the shell is already leaving, in which case nothing opens.
   */
  leaving: () => boolean;

  /**
   * Installs the application menu for kiosk mode or not.
   *
   * @param kiosk - Whether kiosk mode is on.
   */
  installMenu: (kiosk: boolean) => void;

  /**
   * Writes an event to the CLI.
   *
   * @param event - The event.
   */
  send: (event: ShellEvent) => void;

  /**
   * The connected displays.
   */
  displays: () => ShellDisplay[];

  /**
   * Exits the shell.
   *
   * @param code - The exit code.
   */
  leave: (code: number) => void;

  /**
   * Reports a fatal problem and exits.
   *
   * @param message - What failed.
   */
  fail: (message: string) => void;
};

/**
 * Creates the function that applies one command from the CLI. A second `open` while the audience
 * window is open, an `open` with a target when the deck is already set, and an `open` without one
 * when it is not, are answered with an `error` event and change nothing, so the shell never loses
 * track of a window; `move-to-display` reaches the window it names, the presenter window included.
 *
 * @param target - The window manager and the shell's outputs.
 */
export function createCommandHandler<Win>(
  target: CommandTarget<Win>,
): (command: ShellCommand) => void {
  const { windows, send } = target;
  let opening = false;
  let desktop = false;
  let selected: string | undefined;
  let changes = Promise.resolve();
  /**
   * Reports a selection error without terminating the gallery.
   */
  const report = (error: unknown, requestId: string): void => {
    const message = error instanceof Error ? error.message : String(error);
    send({ type: 'error', message, requestId });
  };

  /**
   * Adopts the selected deck, enters its window plan and reports selection-specific errors.
   */
  const openSelection = async (command: Extract<ShellCommand, { type: 'open' }>): Promise<void> => {
    const { plan, requestId, stateKey } = command;
    if (requestId === undefined || command.target === undefined) {
      send({ type: 'error', message: 'A chooser selection needs a request ID and deck target.' });
      return;
    }

    if (selected !== undefined) {
      report('Close the previous selection before opening a deck.', requestId);
      return;
    }

    selected = requestId;
    try {
      await target.adoptTarget(command.target, stateKey);
      if (target.leaving()) {
        return;
      }

      target.installMenu(plan.kiosk);
      target.placeChooser?.(plan, requestId);
      await windows.open(plan, requestId);
    } catch (error) {
      report(error, requestId);
    }
  };
  /**
   * Retires only the matching selection and acknowledges completion.
   */
  const closeSelection = async (requestId: string): Promise<void> => {
    if (requestId === selected) {
      await target.closeDeck?.();
      selected = undefined;
    }

    send({ type: 'deck-closed', requestId });
  };
  /**
   * Adopts the deck, then opens the windows; any failure is fatal.
   */
  const openWindows = async (plan: ShellPlan, deck: ShellTarget | undefined): Promise<void> => {
    try {
      if (deck !== undefined) {
        await target.adoptTarget(deck);
      }

      if (target.leaving()) {
        return;
      }

      target.installMenu(plan.kiosk);
      await windows.open(plan);
    } catch (error) {
      target.fail(error instanceof Error ? error.message : String(error));
    }
  };
  return (command) => {
    switch (command.type) {
      case 'open-chooser': {
        const openChooser = target.openChooser;
        if (desktop || opening || target.hasTarget() || openChooser === undefined) {
          send({ type: 'error', message: 'The shell is already open.' });
          return;
        }

        desktop = true;
        changes = openChooser(command.target)
          .then((displayId) => send({ type: 'chooser-ready', displayId }))
          .catch((error: unknown) => target.fail(String(error)));
        return;
      }

      case 'close-deck':
        if (desktop) {
          changes = changes
            .then(() => (target.leaving() ? undefined : closeSelection(command.requestId)))
            .catch((error: unknown) => report(error, command.requestId));
        }

        return;
      case 'open':
        if (desktop) {
          changes = changes.then(() => (target.leaving() ? undefined : openSelection(command)));
          return;
        }

        if (opening || windows.window('audience') !== undefined) {
          send({
            type: 'error',
            message:
              'open refused: the audience window is already open or opening; ' +
              'send focus, open-presenter or move-to-display instead.',
          });
          return;
        }

        if (command.target !== undefined && target.hasTarget()) {
          send({
            type: 'error',
            message:
              'open refused: the deck is already set (by the configuration or an earlier ' +
              'open); a target is accepted once.',
          });
          return;
        }

        if (command.target === undefined && !target.hasTarget()) {
          send({
            type: 'error',
            message:
              'open needs a target: this shell was started without a deck, so open must carry ' +
              '{ url, title, backgroundColor }.',
          });
          return;
        }

        opening = true;
        void openWindows(command.plan, command.target);
        return;
      case 'list-displays':
        send({ type: 'displays', displays: target.displays() });
        return;
      case 'open-presenter':
        windows.openPresenter(command.displayId);
        return;
      case 'set-fullscreen':
        windows.setAudienceFullscreen(command.on);
        return;
      case 'move-to-display': {
        const win = windows.window(command.window);
        if (win !== undefined) {
          windows.moveToDisplay(win, command.displayId);
        }

        return;
      }

      case 'focus':
        windows.focus();
        return;
      case 'quit':
        target.leave(0);
        return;
    }
  };
}
