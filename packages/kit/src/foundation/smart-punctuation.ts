/**
 * Characters after which a quote mark opens rather than closes: the start of the text, spaces,
 * opening brackets, dashes, slashes and other opening quotes.
 */
const OPENS_AFTER = /[\s([{—–‘“/-]/u;

/**
 * A straight apostrophe before a decade or a year cut short, such as '90s or '26.
 */
const ELIDED_YEAR = /(^|[\s(])'(?=\d\d)/gu;

/**
 * Typographic quotes for text written with a keyboard: a straight double or single quote becomes a
 * curly opening quote after a space, a bracket, a dash or the start of the text, and a curly
 * closing quote (or apostrophe, ’) anywhere else; an apostrophe before an elided year (’26) stays
 * an apostrophe. Nothing else changes: hyphens, dots and dashes are left as written, so a command
 * line or a flag such as `--env` in running text survives. Text that is already typographic is
 * returned unchanged.
 *
 * @param text - The text as written.
 * @param before - The character before the text, when it continues earlier text (the last character
 *   of the previous text node); the start of a line when left out.
 * @returns The text with curly quotes and apostrophes.
 */
export function smartPunctuation(text: string, before = ''): string {
  const replaced = text.replace(ELIDED_YEAR, '$1’');
  let result = '';
  let previous = before;
  for (const character of replaced) {
    result += curl(character, previous);
    previous = character;
  }

  return result;
}

/**
 * The typographic form of one character: a straight quote opens after a space, a bracket, a dash or
 * the start of the text, and closes (or is an apostrophe) anywhere else.
 *
 * @param character - The character.
 * @param previous - The character before it, or `''` at the start.
 */
function curl(character: string, previous: string): string {
  const opens = previous === '' || OPENS_AFTER.test(previous);
  if (character === '"') {
    return opens ? '“' : '”';
  }

  if (character === "'") {
    return opens ? '‘' : '’';
  }

  return character;
}
