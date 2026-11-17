import { Component, type ReactNode } from 'react';

/**
 * Props of {@link ErrorBoundary}.
 */
type ErrorBoundaryProps = {
  /**
   * Tells the deck what went wrong.
   */
  onError: (message: string) => void;

  /**
   * The app.
   */
  children?: ReactNode;
};

/**
 * Catches a render error, shows it and reports it to the deck.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, { message?: string }> {
  override state: { message?: string } = {};

  static getDerivedStateFromError(error: unknown): { message: string } {
    return { message: errorMessage(error) };
  }

  override componentDidCatch(error: unknown): void {
    this.props.onError(errorMessage(error));
  }

  override render(): ReactNode {
    if (this.state.message === undefined) {
      return this.props.children;
    }

    return (
      <main className="app" role="alert">
        <h1>The demo stopped</h1>
        <p className="app-error">{this.state.message}</p>
      </main>
    );
  }
}

/**
 * The text of a thrown value: an `Error`'s message, or the value converted to a string.
 *
 * @param error - Whatever was thrown, which may not be an `Error`.
 * @returns The message to show and report.
 */
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
