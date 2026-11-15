import type { AgentComment, CommentReport } from '@deckster/comments/node';

/**
 * The indentation of a comment's detail lines under its heading.
 */
const DETAIL_INDENT = '     ';

/**
 * Writes a comment report for the terminal: the counts, then each comment under its slide with
 * where to edit, the anchor status, the element, the text and the screenshot, and the command that
 * resolves one.
 *
 * @param report - The report.
 * @param filterLabel - What the list shows, such as `open`.
 */
export function formatCommentReport(report: CommentReport, filterLabel: string): string {
  const { open, resolved } = report.counts;
  const lines = [`${report.deck}: ${open} open, ${resolved} resolved`];
  if (report.comments.length === 0) {
    lines.push(`No ${filterLabel} comments.`);
    return lines.join('\n');
  }

  let slide: string | undefined;
  for (const comment of report.comments) {
    if (comment.slide !== slide) {
      slide = comment.slide;
      lines.push('', slideHeading(comment));
    }

    lines.push(...commentLines(comment));
  }

  lines.push(
    '',
    `After a fix: pnpm deck comments resolve ${report.deck} <id> --note "what changed"`,
    `As JSON: pnpm deck comments ${report.deck} --json`,
  );
  return lines.join('\n');
}

/**
 * The line above a slide's comments.
 *
 * @param comment - The slide's first comment.
 */
function slideHeading(comment: AgentComment): string {
  const number = comment.slideNumber === null ? 'removed slide' : `slide ${comment.slideNumber}`;
  return `${number} ${comment.slide}`;
}

/**
 * One comment: its heading, text, element, screenshot and resolution.
 *
 * @param comment - The comment.
 */
function commentLines(comment: AgentComment): string[] {
  const kind = [comment.status, comment.type].filter((part) => part !== null).join(' ');
  const anchor = anchorText(comment);
  const heading = `  #${comment.number} ${comment.id}  ${kind}  ${comment.location}`;
  return [
    `${heading}  (${anchor}, step ${comment.step})`,
    ...comment.text.split('\n').map((line) => `${DETAIL_INDENT}${line}`),
    ...optionalDetailLines(comment),
  ];
}

/**
 * The element, screenshot and resolution lines of a comment, each only when the comment has it.
 *
 * @param comment - The comment.
 */
function optionalDetailLines(comment: AgentComment): string[] {
  const lines: string[] = [];
  if (comment.anchor.element !== null) {
    const { tag, text } = comment.anchor.element;
    lines.push(`${DETAIL_INDENT}<${tag}> "${text}"`);
  }

  if (comment.screenshot !== null) {
    lines.push(`${DETAIL_INDENT}screenshot: ${comment.screenshot}`);
  }

  if (comment.resolution !== null) {
    const { by, note } = comment.resolution;
    lines.push(`${DETAIL_INDENT}resolved by ${by}${noteSuffix(note)}`);
  }

  return lines;
}

/**
 * A resolution note after a colon, or nothing.
 *
 * @param note - The note.
 */
function noteSuffix(note: string): string {
  return note === '' ? '' : `: ${note}`;
}

/**
 * What the heading says about the anchor: the target for a comment without one, the status
 * otherwise, and for a lost anchor the line the comment was made on.
 *
 * @param comment - The comment.
 */
function anchorText(comment: AgentComment): string {
  const { status, originalLine } = comment.anchor;
  if (status === 'none') {
    return comment.target;
  }

  if (status === 'lost' && originalLine !== null) {
    return `anchor lost, was line ${originalLine}: read the excerpt`;
  }

  return status === 'guessed' ? 'anchor guessed: check the line' : `anchor ${status}`;
}
