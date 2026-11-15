/**
 * Honorifics before a name, left out of its initials: `Dr. Amaka Bello` is `AB`.
 */
const HONORIFICS = new Set(['dr', 'prof', 'mr', 'mrs', 'ms', 'mx', 'sir', 'dame', 'rev', 'hon']);

/**
 * Suffixes after a name, left out of its initials: `Martin Luther King Jr.` is `MK`.
 */
const SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'v', 'phd', 'md', 'mba', 'esq', 'obe']);

/**
 * Lowercase particles of a family name, which the family name's initial skips: `Ludwig van
 * Beethoven` is `LB`, `A. B. C. de la Cruz III` is `AC`.
 */
const PARTICLES = new Set([
  'de',
  'del',
  'della',
  'der',
  'den',
  'di',
  'da',
  'das',
  'dos',
  'du',
  'la',
  'le',
  'van',
  'von',
  'ten',
  'ter',
  'bin',
  'binti',
  'ibn',
  'al',
  'el',
  'y',
]);

/**
 * Splits a name into words at spaces and commas.
 */
const WORD_SEPARATOR = /[\s,]+/u;

/**
 * Characters a word keeps: letters, combining marks, apostrophes and hyphens. Everything else, such
 * as a full stop after an initial, is dropped.
 */
const NON_NAME_CHARACTER = /[^\p{L}\p{M}'’-]/gu;

/**
 * Apostrophes and hyphens at the edges of a word, which do not start or end it.
 */
const EDGE_JOINERS = /^['’-]+|['’-]+$/gu;

/**
 * A word with at least one letter; a word of only punctuation is not part of the name.
 */
const LETTER = /\p{L}/u;

/**
 * A letter with the combining marks that follow it.
 */
const LETTER_WITH_MARKS = /\p{L}\p{M}*/u;

/**
 * Any character that is not a letter, to compare words without their punctuation.
 */
const NON_LETTER = /[^\p{L}]/gu;

/**
 * The initials of a name: the first letter of the given name and of the family name. Honorifics
 * (Dr., Prof.) and suffixes (Jr., III, PhD) are left out, a family name's particles (van, de la,
 * bin) are skipped, and a hyphenated or apostrophised word counts by its first letter
 * (`Okonjo-Iweala` is `O`, `O'Brien` is `O`). Initials written as such (`A. B. C.`) count as
 * words.
 *
 * @param name - The name as written.
 * @returns One or two capital letters; one for a single-word name.
 */
export function initialsOf(name: string): string {
  const words = name
    .split(WORD_SEPARATOR)
    .map((word) => word.replaceAll(NON_NAME_CHARACTER, '').replaceAll(EDGE_JOINERS, ''))
    .filter((word) => LETTER.test(word));
  let start = 0;
  while (start < words.length - 1 && HONORIFICS.has(comparableWord(words[start]))) {
    start += 1;
  }

  let end = words.length;
  while (end - 1 > start && SUFFIXES.has(comparableWord(words[end - 1]))) {
    end -= 1;
  }

  const kept = words.slice(start, end);
  const first = kept[0] ?? name.trim();
  // The family name is the last word that is not a particle, after the given name.
  const family = kept
    .slice(1)
    .filter((word) => !PARTICLES.has(word.toLocaleLowerCase()))
    .at(-1);
  return `${initialOf(first)}${family === undefined ? '' : initialOf(family)}`.toLocaleUpperCase();
}

/**
 * A word in lowercase without its punctuation, to compare with the word lists.
 *
 * @param word - A word of the name.
 */
function comparableWord(word: string | undefined): string {
  return (word ?? '').replaceAll(NON_LETTER, '').toLocaleLowerCase();
}

/**
 * The first letter of a word, with any combining marks it carries.
 *
 * @param word - A word of the name.
 */
function initialOf(word: string): string {
  return LETTER_WITH_MARKS.exec(word)?.[0] ?? '';
}
