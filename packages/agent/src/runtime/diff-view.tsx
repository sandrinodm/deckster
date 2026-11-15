import type { ReactNode } from 'react';

import type { DiffHunk } from '#protocol/agent-events.ts';

/**
 * A unified diff hunk header: `@@ -a,b +c,d @@`.
 */
const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

/**
 * A line of a hunk's body: a kept line starts with a space, a removed one with `-`, an added one
 * with `+`. Anything else (a file header, a note) is not part of a hunk.
 */
const HUNK_BODY_LINE = /^[ +-]/;

/**
 * A hunk being read, with the old and new lines its header promised and not yet seen.
 */
type OpenHunk = DiffHunk & {
  /**
   * The lines, filled as they are read.
   */
  readonly lines: string[];
};

/**
 * Reads unified diff text into hunks. A hunk's body is read by the counts in its `@@ -a,b +c,d @@`
 * header, so a body line that starts with `--- ` or `+++ ` (a removed `-- x` or an added `++ x`) is
 * kept; file headers (`---`, `+++`) and anything else between hunks are left out. A diff without
 * hunk headers is one hunk of its lines.
 *
 * @param text - The diff.
 */
export function parseUnifiedDiff(text: string): DiffHunk[] {
  const hunks: OpenHunk[] = [];
  let oldLeft = 0;
  let newLeft = 0;
  let headed = false;
  for (const line of text.replaceAll('\r\n', '\n').split('\n')) {
    const header = oldLeft > 0 || newLeft > 0 ? null : HUNK_HEADER.exec(line);
    if (header !== null) {
      headed = true;
      oldLeft = Number(header[2] ?? 1);
      newLeft = Number(header[4] ?? 1);
      hunks.push({
        oldStart: Number(header[1]),
        oldLines: oldLeft,
        newStart: Number(header[3]),
        newLines: newLeft,
        lines: [],
      });
      continue;
    }

    if (oldLeft > 0 || newLeft > 0) {
      if (line.startsWith('\\')) {
        continue;
      }

      const sign = line.slice(0, 1);
      oldLeft -= sign === '+' ? 0 : 1;
      newLeft -= sign === '-' ? 0 : 1;
      hunks.at(-1)?.lines.push(sign === '' ? ' ' : line);
      continue;
    }

    if (
      headed ||
      !HUNK_BODY_LINE.test(line) ||
      line.startsWith('--- ') ||
      line.startsWith('+++ ')
    ) {
      continue;
    }

    if (hunks.length === 0) {
      hunks.push({ oldStart: 1, oldLines: 0, newStart: 1, newLines: 0, lines: [] });
    }

    hunks.at(-1)?.lines.push(line);
  }

  return hunks;
}

/**
 * Hunks as lines with a sign gutter: removed lines tinted red, added ones green, each hunk headed
 * by the line it starts at. Screen readers hear "removed" and "added".
 *
 * @param props - The hunks, whether they were cut short, and the group's label.
 */
export function DiffHunks({
  hunks,
  truncated,
  label,
}: {
  hunks: readonly DiffHunk[];
  truncated: boolean;
  label: string;
}): ReactNode {
  return (
    <div className="da-diff" role="group" aria-label={label}>
      {hunks.map((hunk) => (
        <div key={`${hunk.oldStart}-${hunk.newStart}`} className="da-hunk">
          <div className="da-hunk-head">
            line {hunk.newStart > 0 ? hunk.newStart : hunk.oldStart}
          </div>
          {hunk.lines.map((line, index) => {
            const sign = line.slice(0, 1);
            return (
              <div key={index} className="da-diff-line" data-sign={sign === ' ' ? undefined : sign}>
                <span className="da-diff-sign" aria-hidden="true">
                  {signGlyph(sign)}
                </span>
                <span className="da-sr-only">{signLabel(sign)}</span>
                <span className="da-diff-text">{line.slice(1) || ' '}</span>
              </div>
            );
          })}
        </div>
      ))}
      {truncated ? <div className="da-diff-note">The rest of the diff is not shown.</div> : null}
    </div>
  );
}

/**
 * The glyph a diff line shows: a minus sign, a plus, or nothing for a kept line.
 *
 * @param sign - ` `, `-` or `+`.
 */
function signGlyph(sign: string): string {
  if (sign === '-') {
    return '−';
  }

  return sign === '+' ? '+' : '';
}

/**
 * What a diff sign means, for screen readers.
 *
 * @param sign - ` `, `-` or `+`.
 */
function signLabel(sign: string): string {
  if (sign === '-') {
    return 'removed: ';
  }

  return sign === '+' ? 'added: ' : '';
}
