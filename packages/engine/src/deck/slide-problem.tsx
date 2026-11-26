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

  /**
   * A stable id for tools that tell kinds of problem apart, such as `layout-load-failed`; left out
   * for an ordinary render error.
   */
  problem?: string;

  /**
   * The layout the problem belongs to, when it is one layout's.
   */
  layout?: string;
};

/**
 * Shows a slide that could not render in place of its content, naming the file so the author knows
 * where to look. The rest of the deck keeps working. The `data-slide-error` attribute marks it for
 * tools: `deckster lint` reports it as a `render-error` and `deckster shot` fails on it. A problem
 * with an id also carries `data-deck-problem` (and `data-deck-problem-layout` for a layout's), so
 * tools can report it as more than a render error.
 */
export function SlideProblem({ file, message, problem, layout }: SlideProblemProps): ReactNode {
  return (
    <div
      className="deck-problem"
      role="alert"
      data-slide-error=""
      data-deck-problem={problem}
      data-deck-problem-layout={layout}>
      <p className="deck-problem-file">{file}</p>
      <pre className="deck-problem-message">{message}</pre>
    </div>
  );
}
