import type { ReactNode } from 'react';

/**
 * Props for {@link SlideProblem}.
 */
type SlideProblemProps = {
  /**
   * The slide file at fault, relative to the deck folder.
   */
  file: string;

  /**
   * What went wrong, shown as preformatted text.
   */
  message: string;
};

/**
 * Shows a slide that could not render in place of its content, naming the file so the author knows
 * where to look. The rest of the deck keeps working. The `data-slide-error` attribute marks it for
 * tools: `deck lint` reports it as a `render-error` and `deck shot` fails on it.
 */
export function SlideProblem({ file, message }: SlideProblemProps): ReactNode {
  return (
    <div className="deck-problem" role="alert" data-slide-error="">
      <p className="deck-problem-file">{file}</p>
      <pre className="deck-problem-message">{message}</pre>
    </div>
  );
}
