import { decodeNamedCharacterReference } from 'decode-named-character-reference';

/**
 * Matches a character reference: `&amp;`, `&#38;` or `&#x26;`, capturing what is between `&` and
 * `;`.
 */
const CHARACTER_REFERENCE_PATTERN = /&(#[xX][0-9a-fA-F]+|#[0-9]+|[a-zA-Z][a-zA-Z0-9]*);/g;

/**
 * A run of spaces or tabs inside a line.
 */
const INLINE_SPACE_PATTERN = /[ \t]+/g;

/**
 * Two or more blank lines in a row.
 */
const BLANK_LINES_PATTERN = /\n{3,}/g;

/**
 * The radix of a hexadecimal character reference.
 */
const HEX_RADIX = 16;

/**
 * The radix of a decimal character reference.
 */
const DECIMAL_RADIX = 10;

/**
 * The highest Unicode code point.
 */
const MAX_CODE_POINT = 0x10ffff;

/**
 * What joins the text of several `<Notes>` blocks: a blank line.
 */
export const NOTES_SEPARATOR = '\n\n';

/**
 * Normalizes the text of one `<Notes>` block the same way for MDX and TSX slides: the indentation
 * every line shares is removed, runs of spaces inside a line collapse to one, paragraphs stay
 * separated by exactly one blank line, and leading and trailing blank lines go. Markdown markup is
 * kept as written. Decode character references first, where the source has them.
 *
 * @param raw - The block's text between its tags; for TSX, the JSX text with string expressions
 *   inlined.
 * @returns The notes text; empty for a block with only whitespace.
 */
export function normalizeNotes(raw: string): string {
  const lines = raw.split('\n');
  const indents = lines
    .filter((line) => line.trim() !== '')
    .map((line) => line.length - line.trimStart().length);
  const indent = Math.min(...indents);
  return lines
    .map((line) => {
      const dedented = line.slice(Math.min(indent, line.length - line.trimStart().length));
      const leading = dedented.length - dedented.trimStart().length;
      return (
        dedented.slice(0, leading) + dedented.slice(leading).replace(INLINE_SPACE_PATTERN, ' ')
      );
    })
    .map((line) => line.trimEnd())
    .join('\n')
    .replace(BLANK_LINES_PATTERN, NOTES_SEPARATOR)
    .trim();
}

/**
 * Decodes HTML character references as JSX and Markdown do: named ones (`&amp;`, `&nbsp;`) and
 * numeric ones (`&#38;`, `&#x26;`). A reference that names no character is kept as written.
 *
 * @param text - Any text.
 */
export function decodeCharacterReferences(text: string): string {
  return text.replace(CHARACTER_REFERENCE_PATTERN, (reference, name: string) => {
    if (!name.startsWith('#')) {
      const decoded = decodeNamedCharacterReference(name);
      return decoded === false ? reference : decoded;
    }

    const isHex = name[1] === 'x' || name[1] === 'X';
    const code = Number.parseInt(name.slice(isHex ? 2 : 1), isHex ? HEX_RADIX : DECIMAL_RADIX);
    return Number.isInteger(code) && code > 0 && code <= MAX_CODE_POINT
      ? String.fromCodePoint(code)
      : reference;
  });
}
