import type { ReactNode } from 'react';

/**
 * Props of {@link ReleaseHint}.
 */
type ReleaseHintProps = {
  /**
   * Whether the user is interacting, which is when the hint shows.
   */
  visible: boolean;
};

/**
 * The subtle "Esc to return" pill that tells the presenter how to hand the keyboard back to the
 * deck from an inline widget, where Escape always works. It is part of the live interaction only;
 * static mode never renders it.
 */
export function ReleaseHint({ visible }: ReleaseHintProps): ReactNode {
  return (
    <div className="kit-app-hint kit-type-caption" data-visible={visible} aria-hidden="true">
      <kbd className="kit-app-hint-key">Esc</kbd>
      <span>to return</span>
    </div>
  );
}

/**
 * Props of {@link ReleaseControl}.
 */
type ReleaseControlProps = {
  /**
   * Takes the keyboard back from the frame.
   */
  onRelease: () => void;

  /**
   * Whether Escape works too, which it does only in a frame that speaks the bridge.
   */
  escape: boolean;
};

/**
 * The "Return to deck" control a frame shows in its chrome while it holds the keyboard. Escape
 * works only in a frame that speaks the bridge; a page without it never hands the keys back, so the
 * presenter clicks this instead. It names the key too in the frames where Escape works.
 */
export function ReleaseControl({ onRelease, escape }: ReleaseControlProps): ReactNode {
  return (
    <button
      type="button"
      className="kit-app-tool kit-app-release kit-type-caption"
      title="Give the keyboard back to the deck"
      onClick={onRelease}>
      {escape ? <kbd className="kit-app-hint-key">Esc</kbd> : null}
      Return to deck
    </button>
  );
}
