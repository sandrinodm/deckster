import { Component, type ReactNode } from 'react';

/**
 * Props of {@link AppFallback}.
 */
export type AppFallbackProps = {
  /**
   * What happened, as a short heading.
   */
  title: string;

  /**
   * The detail, such as an error message or what the deck shows instead.
   */
  message: string;
};

/**
 * The branded card shown where a widget or mini app could not run: the surface's own colors, the
 * brand's radius and type, an accent bar. It fills the region it sits in.
 */
export function AppFallback({ title, message }: AppFallbackProps): ReactNode {
  return (
    <div className="kit-app-fallback" role="alert" data-app-fallback="">
      <p className="kit-app-fallback-title kit-type-title kit-heading">{title}</p>
      <p className="kit-app-fallback-message kit-type-small">{message}</p>
    </div>
  );
}

/**
 * Props of {@link AppErrorBoundary}.
 */
type AppErrorBoundaryProps = {
  /**
   * What the card calls the thing that failed, such as `This widget`.
   */
  subject: string;

  /**
   * Changing this clears a caught error, so a fixed widget renders again after a hot update.
   */
  resetKey: unknown;

  /**
   * The widget.
   */
  children?: ReactNode;
};

/**
 * State of {@link AppErrorBoundary}.
 */
type AppErrorBoundaryState = {
  /**
   * The error the widget threw while rendering, or `undefined` while it renders normally.
   */
  error: Error | undefined;
};

/**
 * Catches a render error in an inline widget and shows a branded card in its place, so one broken
 * widget never takes the slide down. The slide, its title and the rest of the deck keep working.
 */
export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  /**
   * No error until the widget throws.
   */
  override state: AppErrorBoundaryState = { error: undefined };

  /**
   * Records what the widget threw; a thrown non-Error value is wrapped in an Error with its text.
   *
   * @param error - Whatever the widget threw.
   */
  static getDerivedStateFromError(error: unknown): AppErrorBoundaryState {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  /**
   * Clears the error once `resetKey` changes, so the updated widget gets another try.
   *
   * @param previous - The props of the previous render.
   */
  override componentDidUpdate(previous: AppErrorBoundaryProps): void {
    if (this.state.error !== undefined && previous.resetKey !== this.props.resetKey) {
      // The reset has to commit after the render that still shows the old error.
      // oxlint-disable-next-line react/no-did-update-set-state
      this.setState({ error: undefined });
    }
  }

  /**
   * The widget, or the branded card with the error in its place.
   */
  override render(): ReactNode {
    const { error } = this.state;
    if (error === undefined) {
      return this.props.children;
    }

    return <AppFallback title={`${this.props.subject} stopped`} message={error.message} />;
  }
}
