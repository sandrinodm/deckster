import { Component, type ReactNode } from 'react';

/**
 * The errors slot content threw, so a layout's own error boundary can tell them from its own.
 */
const slotContentErrors = new WeakSet<Error>();

/**
 * Whether an error was thrown by a slide's slot content rather than by its layout.
 *
 * @param error - A caught error.
 */
export function isSlotContentError(error: unknown): boolean {
  return error instanceof Error && slotContentErrors.has(error);
}

/**
 * Props of {@link SlotGuard}.
 */
type SlotGuardProps = {
  /**
   * The slot's name. It is a prop under this name because layouts that read a slot's direct
   * children (the kit's `dashboard`) recognise the engine's wrapper by it.
   */
  'data-slot': string;

  /**
   * The slot's content.
   */
  children?: ReactNode;
};

/**
 * State of {@link SlotGuard}.
 */
type SlotGuardState = {
  /**
   * What the slot content threw while rendering, or `undefined` while it renders normally.
   */
  error: Error | undefined;
};

/**
 * A filled slot's wrapper: `<span class="deck-slot" data-slot="<name>">`, which has `display:
 * contents`, so `deckster lint` can find and measure it. It also marks what the slot's content
 * throws while rendering and throws it again, so a boundary around the layout can leave it to the
 * slide's own error boundary: a broken slide component is not the layout's failure.
 *
 * The element a layout receives keeps the shape it always had (`data-slot` and `children` props
 * directly on it), so a layout may still read or replace the slot's children.
 */
export class SlotGuard extends Component<SlotGuardProps, SlotGuardState> {
  /**
   * No error until the content throws.
   */
  override state: SlotGuardState = { error: undefined };

  /**
   * Records and marks what the content threw; a thrown non-Error value is wrapped in an Error with
   * its text.
   *
   * @param error - Whatever the content threw.
   */
  static getDerivedStateFromError(error: unknown): SlotGuardState {
    const marked = error instanceof Error ? error : new Error(String(error));
    slotContentErrors.add(marked);
    return { error: marked };
  }

  /**
   * The wrapped content, or the error it threw, thrown again to the next boundary up.
   */
  override render(): ReactNode {
    const { error } = this.state;
    if (error !== undefined) {
      throw error;
    }

    return (
      <span className="deck-slot" data-slot={this.props['data-slot']}>
        {this.props.children}
      </span>
    );
  }
}
