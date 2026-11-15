import { useRef, type ReactNode } from 'react';

import { formatKey } from '#shortcuts/key-format.ts';
import { groupShortcuts, useShortcuts, type Shortcut } from '#shortcuts/shortcut-registry.ts';
import { updateUi, useUiState } from '#ui/ui-state.ts';
import { useModalFocus } from '#ui/use-modal-focus.ts';
import { windowKind } from '#ui/window-kind.ts';

/**
 * The shortcut help: every shortcut registered, grouped, with the keys that trigger it. It is built
 * from the registry, so keys other plugins register appear without any change here.
 */
export function HelpOverlay(): ReactNode {
  const { helpOpen } = useUiState();
  return helpOpen ? <HelpDialog /> : null;
}

/**
 * The open help dialog. It is modal: focus moves into it and back out when it closes, Tab stays
 * inside, and navigation keys do nothing behind it.
 */
function HelpDialog(): ReactNode {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useModalFocus(dialogRef);
  useShortcuts();
  const groups = groupShortcuts(windowKind());
  /**
   * Hides the help.
   */
  const close = () => updateUi({ helpOpen: false });
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
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        tabIndex={-1}>
        <div className="dp-dialog-head">
          <h2 className="dp-dialog-title">Keyboard shortcuts</h2>
          <button
            type="button"
            className="dp-button"
            data-variant="icon"
            aria-label="Close help"
            onClick={close}>
            ×
          </button>
        </div>
        <div className="dp-help-body">
          {groups.map(({ group, shortcuts }) => (
            <HelpGroup key={group} group={group} shortcuts={shortcuts} />
          ))}
        </div>
      </dialog>
    </div>
  );
}

/**
 * Props of {@link HelpGroup}.
 */
type HelpGroupProps = {
  /**
   * The section's heading, such as `Navigation`.
   */
  group: string;

  /**
   * The shortcuts listed under the heading, in registration order.
   */
  shortcuts: readonly Shortcut[];
};

/**
 * One section of the help: its heading and a row for each shortcut with its keys.
 */
function HelpGroup({ group, shortcuts }: HelpGroupProps): ReactNode {
  return (
    <section className="dp-help-group">
      <h3>{group}</h3>
      <ul>
        {shortcuts.map((shortcut) => (
          <li key={shortcut.id} className="dp-help-item" data-shortcut={shortcut.id}>
            <span className="dp-help-keys">
              {shortcut.keys.map((key) => (
                <kbd key={key}>{formatKey(key)}</kbd>
              ))}
            </span>
            <span>{shortcut.label}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
