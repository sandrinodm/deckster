import type { SourceSpan } from '#slides/tsx-meta.ts';

/**
 * The base64 digits of a source map's variable-length quantities.
 */
const BASE64_DIGITS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * The bits of a variable-length quantity digit that carry the value; the sixth bit says more
 * follow.
 */
const VLQ_VALUE_BITS = 5;

/**
 * The flag on a digit that is followed by another one.
 */
const VLQ_CONTINUATION = 1 << VLQ_VALUE_BITS;

/**
 * The mask of a digit's value bits.
 */
const VLQ_VALUE_MASK = VLQ_CONTINUATION - 1;

/**
 * A source file with one stretch replaced, and the source map from the new text to the old.
 */
export type SpanReplacement = {
  /**
   * The source with the span replaced.
   */
  code: string;

  /**
   * A version 3 source map as the JSON Vite takes: every line maps to the same line of the
   * original, and the text after the replacement on its line maps back to its original column.
   */
  map: { version: 3; file: string; sources: string[]; names: string[]; mappings: string };
};

/**
 * Replaces one stretch of a source file and builds the source map for the change, so errors and
 * breakpoints in the rewritten module still point at the author's file.
 *
 * @param code - The original source.
 * @param span - The stretch to replace.
 * @param text - What to put there.
 * @param file - The file's path, for the map.
 */
export function replaceSpan(
  code: string,
  span: SourceSpan,
  text: string,
  file: string,
): SpanReplacement {
  const replaced = code.slice(0, span.start) + text + code.slice(span.end);
  return { code: replaced, map: mapOf(code, span, text, file) };
}

/**
 * The source map of a replacement: a segment at the start of each line, and one after the new text.
 *
 * @param code - The original source.
 * @param span - The replaced stretch.
 * @param text - The replacement.
 * @param file - The file's path.
 */
function mapOf(code: string, span: SourceSpan, text: string, file: string): SpanReplacement['map'] {
  const before = code.slice(0, span.start).split('\n');
  const removed = code.slice(span.start, span.end).split('\n');
  const after = code.slice(span.end).split('\n');
  const startLine = before.length - 1;
  const endLine = startLine + removed.length - 1;
  const startColumn = before.at(-1)?.length ?? 0;
  const endColumn = (removed.length === 1 ? startColumn : 0) + (removed.at(-1)?.length ?? 0);
  const newLines = text.split('\n');
  const tailColumn = (newLines.length === 1 ? startColumn : 0) + (newLines.at(-1)?.length ?? 0);
  const lineCount = startLine + newLines.length + after.length - 1;
  const lines: string[] = [];
  let previous = { line: 0, column: 0 };
  for (let line = 0; line < lineCount; line += 1) {
    const segments: number[][] = [];
    const isTailLine = line === startLine + newLines.length - 1;
    const originalLine = line <= startLine ? line : line - newLines.length + removed.length;
    if (!(isTailLine && line > startLine)) {
      segments.push([0, originalLine, 0]);
    }

    if (isTailLine) {
      segments.push([tailColumn, endLine, endColumn]);
    }

    let column = 0;
    let line0 = previous.line;
    let column0 = previous.column;
    const encoded = segments.map(([generated = 0, source = 0, sourceColumn = 0]) => {
      const part =
        vlq(generated - column) + vlq(0) + vlq(source - line0) + vlq(sourceColumn - column0);
      column = generated;
      line0 = source;
      column0 = sourceColumn;
      return part;
    });
    previous = { line: line0, column: column0 };
    lines.push(encoded.join(','));
  }

  return {
    version: 3,
    file,
    sources: [file],
    names: [],
    mappings: lines.join(';'),
  };
}

/**
 * A number as a source map variable-length quantity.
 *
 * @param value - Any integer.
 */
function vlq(value: number): string {
  let rest = value < 0 ? (-value << 1) | 1 : value << 1;
  let digits = '';
  do {
    let digit = rest & VLQ_VALUE_MASK;
    rest >>>= VLQ_VALUE_BITS;
    if (rest > 0) {
      digit |= VLQ_CONTINUATION;
    }

    digits += BASE64_DIGITS[digit];
  } while (rest > 0);

  return digits;
}
