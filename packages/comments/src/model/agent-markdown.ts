import type { AgentComment } from '#model/agent-comment.ts';

/**
 * The code fence language for each source file extension.
 */
const FENCE_LANGUAGES: Readonly<Record<string, string>> = {
  /**
   * MDX slides.
   */
  mdx: 'mdx',

  /**
   * TSX slides and components.
   */
  tsx: 'tsx',

  /**
   * JSX components.
   */
  jsx: 'jsx',

  /**
   * TypeScript helpers.
   */
  ts: 'ts',
};

/**
 * Matches a file extension at the end of a path.
 */
const EXTENSION_PATTERN = /\.([a-z]+)$/;

/**
 * Matches the date part of an ISO timestamp.
 */
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}/;

/**
 * Writes one comment as Markdown an agent can act on: where to edit, what the element was, the
 * source around it, what the reviewer asked for and the command that resolves it. The overlay's
 * "Copy for agent" button puts this on the clipboard; it carries the same facts as `deck comments
 * --json`.
 *
 * @param deck - The deck folder name, for the resolve command.
 * @param comment - The comment, as the report gives it.
 */
export function commentMarkdown(deck: string, comment: AgentComment): string {
  const kind = [comment.type ?? 'comment', comment.status].join(', ');
  const where = comment.slideNumber === null ? 'a removed slide' : `slide ${comment.slideNumber}`;
  const lines = [
    `## Comment ${comment.id} on ${where} "${comment.slide}", step ${comment.step} (${kind})`,
    '',
    `- File: \`${comment.location}\` (${anchorNote(comment)})`,
    ...elementLine(comment),
    ...(comment.screenshot === null ? [] : [`- Screenshot: \`${comment.screenshot}\``]),
    `- From: ${comment.author}, ${DATE_PATTERN.exec(comment.createdAt)?.[0] ?? comment.createdAt}`,
    '',
    ...comment.text.split('\n').map((line) => `> ${line}`),
    '',
    ...excerptBlock(comment),
    ...resolutionLines(comment),
    `When it is done: \`pnpm deck comments resolve ${deck} ${comment.id} --note "<what changed>"\``,
  ];
  return lines.join('\n');
}

/**
 * Writes several comments as one Markdown document, for "Copy all open".
 *
 * @param deck - The deck folder name.
 * @param comments - The comments, in the order to list them.
 */
export function commentsMarkdown(deck: string, comments: readonly AgentComment[]): string {
  const heading = `# ${comments.length} open comment${comments.length === 1 ? '' : 's'} on ${deck}`;
  const intro =
    'Each comment names the file and line to edit. Make the change, then resolve it with the ' +
    'command under it. `pnpm deck comments ' +
    `${deck} --json\` lists the same comments as JSON.`;
  return [heading, '', intro, ...comments.map((comment) => `\n${commentMarkdown(deck, comment)}`)]
    .join('\n')
    .concat('\n');
}

/**
 * What the file line says about the anchor. A lost anchor names the line it was made on, because
 * the location gives only the file.
 *
 * @param comment - The comment.
 */
function anchorNote(comment: AgentComment): string {
  const { status, originalLine } = comment.anchor;
  if (status === 'lost' && originalLine !== null) {
    return `anchor lost: it was on line ${originalLine}, read the excerpt`;
  }

  return status === 'guessed'
    ? 'anchor guessed: the line was reworded, check it'
    : `anchor ${status}`;
}

/**
 * The element line: its tag, text and CSS path; nothing for comments without an element.
 *
 * @param comment - The comment.
 */
function elementLine(comment: AgentComment): string[] {
  const element = comment.anchor.element;
  if (element === null) {
    return comment.target === 'region' ? ['- Target: a region of the slide'] : [];
  }

  const text = element.text === '' ? '' : ` "${element.text}"`;
  return [`- Element: \`<${element.tag}>\`${text}, at \`${element.cssPath}\``];
}

/**
 * The source excerpt as a fenced block with line numbers, the commented line marked with `>`.
 *
 * @param comment - The comment.
 */
function excerptBlock(comment: AgentComment): string[] {
  const excerpt = comment.excerpt;
  if (excerpt === null || excerpt.lines.length === 0) {
    return [];
  }

  const language = FENCE_LANGUAGES[EXTENSION_PATTERN.exec(comment.file)?.[1] ?? ''] ?? '';
  const last = excerpt.startLine + excerpt.lines.length - 1;
  const width = String(last).length;
  const numbered = excerpt.lines.map((text, index) => {
    const number = excerpt.startLine + index;
    const marker = number === comment.line ? '>' : ' ';
    return `${marker} ${String(number).padStart(width)} | ${text}`;
  });
  return [`\`\`\`${language}`, ...numbered, '```', ''];
}

/**
 * The resolution note of a resolved comment.
 *
 * @param comment - The comment.
 */
function resolutionLines(comment: AgentComment): string[] {
  const resolution = comment.resolution;
  if (resolution === null) {
    return [];
  }

  const note = resolution.note === '' ? '' : `: ${resolution.note}`;
  return [`Resolved by ${resolution.by}${note}`, ''];
}
