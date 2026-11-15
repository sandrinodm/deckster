import type { AgentComment } from '#model/agent-comment.ts';
import type { Target } from '#overlay/comments-state.ts';

import { parseStamp } from '#model/source-stamp.ts';

/**
 * What an element is called when only the layout renders it, so it has no line of its own.
 */
const LAYOUT_LABEL = 'from the layout';

/**
 * What an item of the brand chrome is called: the brand draws it, so it is changed in the brand.
 */
const CHROME_LABEL = 'brand chrome: edit the brand';

/**
 * A target as the hover label shows it: its tag and `file:line`.
 *
 * @param target - The element and its stamp.
 */
export function targetLabel(target: Target): string {
  const tag = target.element.tagName.toLowerCase();
  if (target.chrome === true) {
    return `${tag} · ${CHROME_LABEL}`;
  }

  const source = target.stamp === undefined ? undefined : parseStamp(target.stamp);
  const where = source === undefined ? LAYOUT_LABEL : `${source.file}:${source.line}`;
  return `${tag} · ${where}`;
}

/**
 * A comment's file and line relative to the deck folder, such as `slides/intro.mdx:14`.
 *
 * @param comment - The comment.
 * @param deckDir - The deck folder relative to the workspace, such as `decks/hello`.
 */
export function locationLabel(comment: AgentComment, deckDir: string): string {
  const file = deckRelative(comment.file, deckDir);
  if (comment.line !== null) {
    return `${file}:${comment.line}`;
  }

  const { status, originalLine } = comment.anchor;
  return status === 'lost' && originalLine !== null ? `${file} (was :${originalLine})` : file;
}

/**
 * The stamp a comment's element carries now, relative to the deck folder, or `undefined` for a
 * comment without a line.
 *
 * @param comment - The comment.
 * @param deckDir - The deck folder relative to the workspace.
 */
export function currentStamp(comment: AgentComment, deckDir: string): string | undefined {
  if (comment.line === null) {
    return undefined;
  }

  return `${deckRelative(comment.file, deckDir)}:${comment.line}:${comment.column ?? 1}`;
}

/**
 * A workspace-relative file relative to the deck folder.
 *
 * @param file - Such as `decks/hello/slides/intro.mdx`.
 * @param deckDir - Such as `decks/hello`.
 */
function deckRelative(file: string, deckDir: string): string {
  const prefix = `${deckDir}/`;
  return file.startsWith(prefix) ? file.slice(prefix.length) : file;
}
