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
 * Marks what a slot's content throws while rendering and throws it again, so a boundary around the
 * layout can leave it to the slide's own error boundary: a broken slide component is not the
 * layout's failure.
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
   * The content, or the error it threw, thrown again to the next boundary up.
   */
  override render(): ReactNode {
    const { error } = this.state;
    if (error !== undefined) {
      throw error;
    }

    return this.props.children;
  }
}
