/**
 * The attribute (and, on components, the prop) that carries an element's source location in dev:
 * `data-deck-source="slides/request-flow.mdx:14:3"`, the file relative to the deck folder, then the
 * 1-based line and column of the JSX tag or markdown node that produced it.
 */
export const SOURCE_ATTRIBUTE = 'data-deck-source';

/**
 * Matches a stamp: a file, a line and a column, split on the last two colons.
 */
const STAMP_PATTERN = /^(.+):(\d+):(\d+)$/;

/**
 * A place in a deck's source: a file relative to the deck folder and a 1-based line and column.
 */
export type SourceLocation = {
  /**
   * The file relative to the deck folder, with forward slashes, such as `slides/intro.mdx`.
   */
  file: string;

  /**
   * The 1-based line.
   */
  line: number;

  /**
   * The 1-based column.
   */
  column: number;
};

/**
 * Writes a location as a stamp, `file:line:column`.
 *
 * @param location - The location.
 */
export function formatStamp(location: SourceLocation): string {
  return `${location.file}:${location.line}:${location.column}`;
}

/**
 * Reads a stamp written by {@link formatStamp}.
 *
 * @param stamp - Any string.
 * @returns The location, or `undefined` when the string is not `file:line:column` with a positive
 *   line and column.
 */
export function parseStamp(stamp: string): SourceLocation | undefined {
  const match = STAMP_PATTERN.exec(stamp);
  if (match === null) {
    return undefined;
  }

  const [, file = '', line = '', column = ''] = match;
  const location = { file, line: Number(line), column: Number(column) };
  return location.line > 0 && location.column > 0 ? location : undefined;
}
