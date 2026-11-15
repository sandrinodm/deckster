import { KEBAB_CASE_PATTERN } from '@deckster/engine/names';
import path from 'node:path';

import { COMMENT_ID_PATTERN } from '#model/comment-schema.ts';

/**
 * The folder in a deck that holds its comments, committed with the deck.
 */
export const FEEDBACK_DIR = '.feedback';

/**
 * The extension of a slide's feedback file.
 */
export const FEEDBACK_EXTENSION = '.json';

/**
 * The extension of a comment's screenshot.
 */
const SCREENSHOT_EXTENSION = '.png';

/**
 * The feedback folder of a deck.
 *
 * @param deckDir - The absolute deck folder.
 */
export function feedbackDir(deckDir: string): string {
  return path.join(deckDir, FEEDBACK_DIR);
}

/**
 * The feedback file of one slide, `<deck>/.feedback/<slide-id>.json`.
 *
 * @param deckDir - The absolute deck folder.
 * @param slide - The slide id.
 * @returns The absolute path, or `undefined` for an id that is not kebab-case, which keeps every
 *   path inside the feedback folder.
 */
export function feedbackFile(deckDir: string, slide: string): string | undefined {
  if (!KEBAB_CASE_PATTERN.test(slide)) {
    return undefined;
  }

  return path.join(feedbackDir(deckDir), `${slide}${FEEDBACK_EXTENSION}`);
}

/**
 * The screenshot of one comment, `<deck>/.feedback/<slide-id>/<comment-id>.png`.
 *
 * @param deckDir - The absolute deck folder.
 * @param slide - The slide id.
 * @param id - The comment id.
 * @returns The absolute path, or `undefined` when either id has the wrong shape.
 */
export function screenshotFile(deckDir: string, slide: string, id: string): string | undefined {
  if (!KEBAB_CASE_PATTERN.test(slide) || !COMMENT_ID_PATTERN.test(id)) {
    return undefined;
  }

  return path.join(feedbackDir(deckDir), slide, `${id}${SCREENSHOT_EXTENSION}`);
}

/**
 * The screenshot folder of one slide.
 *
 * @param deckDir - The absolute deck folder.
 * @param slide - A kebab-case slide id.
 */
export function screenshotDir(deckDir: string, slide: string): string {
  return path.join(feedbackDir(deckDir), slide);
}

/**
 * A path relative to a root, with forward slashes, for messages and reports.
 *
 * @param root - The absolute root, such as the workspace.
 * @param file - An absolute path.
 */
export function relativePath(root: string, file: string): string {
  return path.relative(root, file).split(path.sep).join('/');
}

/**
 * Resolves a file relative to the deck folder and checks it stays inside it.
 *
 * @param deckDir - The absolute deck folder.
 * @param file - A path relative to the deck folder.
 * @returns The absolute path, or `undefined` when the path leaves the folder.
 */
export function deckFilePath(deckDir: string, file: string): string | undefined {
  const absolute = path.resolve(deckDir, file);
  const relative = path.relative(deckDir, absolute);
  const isInside = relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
  return isInside ? absolute : undefined;
}
