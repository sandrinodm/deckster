import { MIN_BREAK_CHARS } from '#diagrams/diagram-limits.ts';
import { maxOf } from '#foundation/lists.ts';

/**
 * The length from which a word with no other break point gets soft hyphens.
 */
const HYPHENATE_FROM = 12;

/**
 * A lower-case letter or digit, the character a camelCase boundary follows.
 */
const LOWER_OR_DIGIT = /[\p{Ll}\p{N}]/u;

/**
 * An upper-case letter, the character a camelCase boundary precedes.
 */
const UPPER = /\p{Lu}/u;

/**
 * A character a word may break after.
 */
const SEPARATOR = /[-_./]/;

/**
 * A vowel, Latin with the accented forms the kit's brands use.
 */
const VOWEL = /[aeiouyäöüàáâéèêëíìîïóòôúùû]/i;

/**
 * A letter in any script.
 */
const LETTER = /\p{L}/u;

/**
 * Whitespace between the words of a text.
 */
const WHITESPACE = /\s+/;

/**
 * Where a word may break when it has to: between a lower-case letter or digit and an upper-case
 * letter (`OrderCancelled|Event`), between letters and digits (`events|v2` is covered by the
 * separator), and after `-`, `_`, `.` or `/`, never leaving fewer than {@link MIN_BREAK_CHARS}
 * characters on either side.
 *
 * @param word - A word without spaces.
 * @returns The offsets the word may break at, ascending.
 */
export function wordBreaks(word: string): number[] {
  const points: number[] = [];
  for (let index = 1; index < word.length; index += 1) {
    const before = word[index - 1] ?? '';
    const after = word[index] ?? '';
    const camel = LOWER_OR_DIGIT.test(before) && UPPER.test(after);
    const separator = SEPARATOR.test(before) && !SEPARATOR.test(after);
    if (
      (camel || separator) &&
      index >= MIN_BREAK_CHARS &&
      word.length - index >= MIN_BREAK_CHARS
    ) {
      points.push(index);
    }
  }

  return points;
}

/**
 * Where a long word with no camelCase or separator boundary may take a hyphen: a rough syllable
 * rule (between two consonants, or before a consonant that starts a syllable after a vowel), at
 * least {@link MIN_BREAK_CHARS} characters from either end. The renderer puts a soft hyphen there,
 * so a word that must break shows a hyphen where it does.
 *
 * @param word - A word without spaces.
 * @returns The offsets, ascending; none for a word under {@link HYPHENATE_FROM} characters.
 */
export function hyphenPoints(word: string): number[] {
  if (word.length < HYPHENATE_FROM || wordBreaks(word).length > 0) {
    return [];
  }

  const points: number[] = [];
  for (let index = MIN_BREAK_CHARS; index <= word.length - MIN_BREAK_CHARS; index += 1) {
    const previous = word[index - 1];
    const current = word[index];
    const following = word[index + 1];
    const syllable =
      isLetter(previous) && isLetter(current) && !isVowel(current) && isVowel(following);
    if (syllable && points.every((point) => index - point >= MIN_BREAK_CHARS)) {
      points.push(index);
    }
  }

  return points;
}

/**
 * A word cut at its break points, for rendering with a break opportunity (`<wbr>`) between the
 * pieces.
 *
 * @param word - A word without spaces.
 */
export function wordPieces(word: string): string[] {
  const breaks = wordBreaks(word);
  const starts = [0, ...breaks];
  const ends = [...breaks, word.length];
  return starts.map((start, index) => word.slice(start, ends[index]));
}

/**
 * The widest whole word of some text, which a node widens to fit before any word breaks.
 *
 * @param text - The text.
 * @param measure - The width of a string.
 */
export function widestWord(text: string, measure: (text: string) => number): number {
  return maxOf(
    text
      .split(WHITESPACE)
      .filter((word) => word !== '')
      .map((word) => measure(word)),
    0,
  );
}

/**
 * Whether a character is a vowel; `undefined` (past either end of the word) is not.
 *
 * @param char - One character, or `undefined`.
 */
function isVowel(char: string | undefined): boolean {
  return char !== undefined && VOWEL.test(char);
}

/**
 * Whether a character is a letter; `undefined` (past either end of the word) is not.
 *
 * @param char - One character, or `undefined`.
 */
function isLetter(char: string | undefined): boolean {
  return char !== undefined && LETTER.test(char);
}
