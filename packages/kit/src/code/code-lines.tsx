import type { ReactNode } from 'react';

import type { HighlightedCode, HighlightedLine, HighlightedToken } from '#code/highlighted-code.ts';

import { kindAt } from '#code/token-kind.ts';

/**
 * Props of {@link CodeLines}.
 */
type CodeLinesProps = {
  /**
   * The highlighted block.
   */
  code: HighlightedCode;

  /**
   * Whether to show line numbers.
   */
  lineNumbers: boolean;

  /**
   * The number of the first line.
   */
  start: number;

  /**
   * The line numbers in focus; `undefined` when nothing is.
   */
  focus: ReadonlySet<number> | undefined;

  /**
   * Whether lines outside the focus fade back.
   */
  dim: boolean;
};

/**
 * The lines of a highlighted block, one block element per line. A line carries its focus state
 * (`data-focus`), its diff change (`data-change`) and, as colored runs, its tokens. Lines faded
 * back are marked `data-decorative`: they are context, and `deck lint` leaves them out of its text
 * checks while they are faded.
 */
export function CodeLines({ code, lineNumbers, start, focus, dim }: CodeLinesProps): ReactNode {
  return code.lines.map((line, index) => {
    const number = start + index;
    const state = focusState(focus, number, dim);
    return (
      <span
        // A highlighted block has no stable ids; the position is its identity.
        // oxlint-disable-next-line react/no-array-index-key
        key={index}
        className="kit-code-line"
        data-line={number}
        data-focus={state}
        data-change={line.change}
        data-decorative={state === 'off' ? '' : undefined}>
        {lineNumbers ? (
          <span className="kit-code-gutter" aria-hidden="true" data-decorative="">
            {number}
          </span>
        ) : null}
        <span className="kit-code-text">{renderTokens(line)}</span>
      </span>
    );
  });
}

/**
 * A line's focus state: `on` in focus, `off` faded back, nothing when no focus is set.
 *
 * @param focus - The lines in focus.
 * @param number - The line's number.
 * @param dim - Whether lines outside the focus fade back.
 */
function focusState(
  focus: ReadonlySet<number> | undefined,
  number: number,
  dim: boolean,
): 'on' | 'off' | undefined {
  if (focus === undefined) {
    return undefined;
  }

  if (focus.has(number)) {
    return 'on';
  }

  return dim ? 'off' : undefined;
}

/**
 * The colored runs of a line.
 *
 * @param line - A highlighted line.
 */
function renderTokens(line: HighlightedLine): ReactNode {
  return line.tokens.map(([text, kind, marked]: HighlightedToken, index) => (
    <span
      // Runs of a line have no ids; the position is their identity.
      // oxlint-disable-next-line react/no-array-index-key
      key={index}
      data-t={kindAt(kind)}
      data-mark={marked === undefined ? undefined : ''}>
      {text}
    </span>
  ));
}
