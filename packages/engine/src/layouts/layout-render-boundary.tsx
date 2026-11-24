import { Component, type ReactNode } from 'react';

import { isSlotContentError } from '#deck/slot-guard.tsx';
import { LayoutProblem } from '#layouts/layout-problem.tsx';

/**
 * Props of {@link LayoutRenderBoundary}.
 */
type LayoutRenderBoundaryProps = {
  /**
   * The name of the layout whose component is inside.
   */
  layout: string;

  /**
   * Changing this clears a caught error, so a slide that was fixed renders again after a hot
   * update.
   */
  resetKey: unknown;

  /**
   * The layout's component.
   */
  children?: ReactNode;
};

/**
 * State of {@link LayoutRenderBoundary}.
 */
type LayoutRenderBoundaryState = {
  /**
   * The error the layout threw while rendering, or `undefined` while it renders normally.
   */
  error: Error | undefined;
};

/**
 * Catches an error that a lazily loaded layout's component throws and shows it as that layout's
 * problem on the slide, instead of the slide's own error. An error thrown by the slide's content in
 * a slot is passed on to the slide's error boundary, since the layout is not at fault.
 */
export class LayoutRenderBoundary extends Component<
  LayoutRenderBoundaryProps,
  LayoutRenderBoundaryState
> {
  /**
   * No error until the layout throws.
   */
  override state: LayoutRenderBoundaryState = { error: undefined };

  /**
   * Records what the layout threw; a thrown non-Error value is wrapped in an Error with its text.
   *
   * @param error - Whatever the layout threw.
   */
  static getDerivedStateFromError(error: unknown): LayoutRenderBoundaryState {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  /**
   * Clears the error once `resetKey` changes, so the updated slide gets another try.
   *
   * @param previous - The props of the previous render.
   */
  override componentDidUpdate(previous: LayoutRenderBoundaryProps): void {
    if (this.state.error !== undefined && previous.resetKey !== this.props.resetKey) {
      // getDerivedStateFromProps would skip the commit that still shows the old error, which
      // changes what renders, so the reset stays here.
      // oxlint-disable-next-line react/no-did-update-set-state
      this.setState({ error: undefined });
    }
  }

  /**
   * The layout, or the problem it threw in its place. Slot content's errors are thrown on.
   */
  override render(): ReactNode {
    const { error } = this.state;
    if (error === undefined) {
      return this.props.children;
    }

    if (isSlotContentError(error)) {
      throw error;
    }

    return <LayoutProblem layout={this.props.layout} stage="render" reason={error.message} />;
  }
}
