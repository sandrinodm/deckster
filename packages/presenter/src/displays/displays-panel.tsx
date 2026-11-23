import type { ShellDisplay } from '@deckster/shell/protocol';

import { useEffect, useRef, useState, type ReactNode } from 'react';

import { deckShell } from '#shell/deck-shell.ts';
import { updateUi, useUiState } from '#ui/ui-state.ts';
import { useModalFocus } from '#ui/use-modal-focus.ts';

/**
 * The displays panel, which only the desktop shell (`deckster present`) can fill: every connected
 * display, with buttons to put this window or the presenter window on it.
 */
export function DisplaysPanel(): ReactNode {
  const { displaysOpen } = useUiState();
  return displaysOpen && deckShell() !== undefined ? <DisplaysDialog /> : null;
}

/**
 * The open dialog. It asks the shell for the displays each time it opens, so a display plugged in
 * since shows up.
 */
function DisplaysDialog(): ReactNode {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useModalFocus(dialogRef);
  const [displays, setDisplays] = useState<readonly ShellDisplay[] | undefined>(undefined);
  useEffect(() => {
    let current = true;
    deckShell()
      ?.displays()
      .then((list) => current && setDisplays(list))
      .catch(() => current && setDisplays([]));
    return () => {
      current = false;
    };
  }, []);
  /**
   * Hides the panel.
   */
  const close = () => updateUi({ displaysOpen: false });
  return (
    <div
      className="dp-ui dp-backdrop"
      data-deck-interactive=""
      role="presentation"
      onClick={(event) => event.target === event.currentTarget && close()}>
      <dialog
        ref={dialogRef}
        open
        className="dp-dialog"
        data-testid="displays-panel"
        aria-modal="true"
        aria-label="Displays"
        tabIndex={-1}>
        <div className="dp-dialog-head">
          <h2 className="dp-dialog-title">Displays</h2>
          <button
            type="button"
            className="dp-button"
            data-variant="icon"
            aria-label="Close displays"
            onClick={close}>
            ×
          </button>
        </div>
        <ul className="dp-displays">
          {displays?.map((display, index) => (
            <DisplayRow key={display.id} display={display} index={index} />
          ))}
        </ul>
        {displays === undefined ? <p className="dp-display-empty">Looking for displays…</p> : null}
      </dialog>
    </div>
  );
}

/**
 * Props of {@link DisplayRow}.
 */
type DisplayRowProps = {
  /**
   * The display the row lists.
   */
  display: ShellDisplay;

  /**
   * The display's zero-based position in the list, shown to the user as a number.
   */
  index: number;
};

/**
 * One display: its number, name and size, and the buttons that move a window onto it.
 */
function DisplayRow({ display, index }: DisplayRowProps): ReactNode {
  return (
    <li className="dp-display-row" data-display={display.id}>
      <span className="dp-display-name">
        {index}: {display.label === '' ? 'Display' : display.label}
        {display.primary ? ' (primary)' : ''}
      </span>
      <span className="dp-display-size">
        {display.bounds.width}×{display.bounds.height}
      </span>
      <button
        type="button"
        className="dp-button"
        onClick={() => {
          deckShell()
            ?.moveToDisplay(display.id)
            .catch(() => undefined);
        }}>
        Move this window here
      </button>
      <button
        type="button"
        className="dp-button"
        onClick={() => {
          deckShell()
            ?.openPresenter(display.id)
            .catch(() => undefined);
        }}>
        Presenter here
      </button>
    </li>
  );
}
