import { Component, type ReactNode } from 'react';

import { SlideProblem } from '#deck/slide-problem.tsx';

/**
 * Props of {@link SlideErrorBoundary}.
 */
type SlideErrorBoundaryProps = {
  /**
   * The slide file, shown with the error so the author knows where to look.
   */
  file: string;

  /**
   * Changing this clears a caught error, so a fixed slide renders again after a hot update.
   */
  resetKey: unknown;

  /**
   * Rendered beside the error in place of the slide, so the frame knows the slide has settled.
   */
  settled?: ReactNode;

  /**
   * The slide's layout and content.
   */
  children?: ReactNode;
};

/**
 * State of {@link SlideErrorBoundary}.
 */
type SlideErrorBoundaryState = {
  /**
   * The error the slide threw while rendering, or `undefined` while it renders normally.
   */
  error: Error | undefined;
};

/**
 * Catches a render error in one slide and shows it on that slide instead of a blank deck.
 */
export class SlideErrorBoundary extends Component<
  SlideErrorBoundaryProps,
  SlideErrorBoundaryState
> {
  /**
   * No error until the slide throws.
   */
  override state: SlideErrorBoundaryState = { error: undefined };

  /**
   * Records what the slide threw; a thrown non-Error value is wrapped in an Error with its text.
   *
   * @param error - Whatever the slide threw.
   */
  static getDerivedStateFromError(error: unknown): SlideErrorBoundaryState {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  /**
   * Clears the error once `resetKey` changes, so the updated slide gets another try.
   *
   * @param previous - The props of the previous render.
   */
  override componentDidUpdate(previous: SlideErrorBoundaryProps): void {
    if (this.state.error !== undefined && previous.resetKey !== this.props.resetKey) {
      // getDerivedStateFromProps would skip the commit that still shows the old error, which
      // changes what renders, so the reset stays here.
      // oxlint-disable-next-line react/no-did-update-set-state
      this.setState({ error: undefined });
    }
  }

  /**
   * The slide, or the error it threw in its place.
   */
  override render(): ReactNode {
    const { error } = this.state;
    if (error === undefined) {
      return this.props.children;
    }

    return (
      <>
        <SlideProblem file={this.props.file} message={error.message} />
        {this.props.settled}
      </>
    );
  }
}
