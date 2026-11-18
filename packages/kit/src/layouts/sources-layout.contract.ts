import { defineLayoutContract } from '@deckster/engine/layout';
import { Schema } from 'effect';

import {
  CHROME_HINT,
  chromeField,
  EYEBROW_HINT,
  EyebrowField,
  textField,
} from '#layouts/layout-fields.ts';

/**
 * The fewest references on a sources slide.
 */
export const MIN_SOURCES = 3;

/**
 * The most references on one slide; split longer bibliographies across slides.
 */
export const MAX_SOURCES = 8;

/**
 * The first source count that uses two columns, read down the left column first.
 */
export const SOURCES_TWO_COLUMNS = 5;

/**
 * The longest reference title, in characters.
 */
export const SOURCE_TITLE_MAX_CHARS = 80;

/**
 * The longest author credit, in characters; use et al. for longer lists.
 */
export const SOURCE_AUTHOR_MAX_CHARS = 36;

/**
 * The longest publisher name, in characters.
 */
export const SOURCE_PUBLISHER_MAX_CHARS = 36;

/**
 * The longest year or date label, in characters: 2026, 2025–26 or n.d.
 */
export const SOURCE_YEAR_MAX_CHARS = 9;

/**
 * The longest destination URL, in characters; the slide shows a shortened readable address.
 */
export const SOURCE_URL_MAX_CHARS = 240;

/**
 * The longest reference title in two columns, in characters.
 */
export const SOURCE_TITLE_MAX_CHARS_DENSE = 61;

/**
 * The longest author or publisher credit in two columns, in characters.
 */
export const SOURCE_CREDIT_MAX_CHARS_DENSE = 23;

/**
 * The longest slide title, in characters, kept to one line above the references.
 */
export const SOURCES_TITLE_MAX_CHARS = 50;

/**
 * The most words of context above the references, keeping dense bibliographies to one line.
 */
const SOURCES_CONTEXT_MAX_WORDS = 10;

/**
 * The most words on the bottom line, reserved for an access date or a caveat.
 */
const SOURCES_FOOTNOTE_MAX_WORDS = 16;

/**
 * A full web address, with no spaces or executable schemes.
 */
const WEB_URL_PATTERN = /^https?:\/\/[^\s]+$/iu;

/**
 * One numbered reference. Its destination is retained even when its visible address is shortened.
 */
const Source = Schema.Struct({
  title: textField(SOURCE_TITLE_MAX_CHARS, 'a source title'),
  author: Schema.optionalKey(textField(SOURCE_AUTHOR_MAX_CHARS, 'an author')),
  publisher: Schema.optionalKey(textField(SOURCE_PUBLISHER_MAX_CHARS, 'a publisher')),
  year: Schema.optionalKey(textField(SOURCE_YEAR_MAX_CHARS, 'a year')),
  url: Schema.optionalKey(
    textField(SOURCE_URL_MAX_CHARS, 'a source URL').check(
      Schema.isPattern(WEB_URL_PATTERN, {
        message: 'Expected a web address that starts with https:// or http://',
      }),
      Schema.makeFilter((value: string) => URL.canParse(value), {
        message: 'Expected a valid web address',
      }),
    ),
  ),
});

/**
 * One source as the slide frontmatter writes it, decoded.
 */
export type SourceEntry = typeof Source.Type;

/**
 * The contract of the sources layout: a numbered bibliography in one or two columns.
 */
export const sourcesLayoutContract = defineLayoutContract({
  name: 'sources',
  description:
    'Three to eight numbered references from `sources:`, each with a title and optional author, ' +
    'publisher, year and URL. Three or four references occupy one column; five to eight read ' +
    'down the left column, then down the right. Muted 01-style indexes identify citations; ' +
    'light lists scale up before their rows expand. Addresses are shown as short readable links ' +
    'while keeping their full destinations in the PDF. Use it at the close of a research talk ' +
    'or in an appendix so the audience can follow the evidence. Use default for a short list ' +
    'without citation fields, content for an explanation of the evidence, and a footnote on ' +
    'the relevant slide for the source of one claim. Use closing for one link with a QR code, ' +
    'and content with link cards for two or three links the audience should open now. ' +
    'All references show together, without reveal.',
  schema: Schema.Struct({
    eyebrow: EyebrowField,
    sources: Schema.Array(Source).check(
      Schema.isMinLength(MIN_SOURCES, { message: `Expected at least ${MIN_SOURCES} sources` }),
      Schema.isMaxLength(MAX_SOURCES, { message: `Expected at most ${MAX_SOURCES} sources` }),
    ),
    chrome: chromeField(true),
  }),
  hints: {
    eyebrow: EYEBROW_HINT,
    sources:
      `List ${MIN_SOURCES} to ${MAX_SOURCES} sources in citation order, each with \`title\` ` +
      `(up to ${SOURCE_TITLE_MAX_CHARS} characters, ${SOURCE_TITLE_MAX_CHARS_DENSE} for ` +
      `${SOURCES_TWO_COLUMNS} to ${MAX_SOURCES} sources) and optionally \`author\` (up to ` +
      `${SOURCE_AUTHOR_MAX_CHARS}, ${SOURCE_CREDIT_MAX_CHARS_DENSE} in two columns), ` +
      '`publisher` ' +
      `(up to ${SOURCE_PUBLISHER_MAX_CHARS}, ${SOURCE_CREDIT_MAX_CHARS_DENSE} in two columns), ` +
      `\`year\` (text, up to ${SOURCE_YEAR_MAX_CHARS}) and \`url\` (a full http: or https: ` +
      `address, up to ${SOURCE_URL_MAX_CHARS} characters). Long addresses display in shortened ` +
      'form at a slash, dot or hyphen boundary (64 characters in one column, 40 in two); ' +
      'hosts are never cut and links open their full destination.',
    chrome: CHROME_HINT,
  },
  title: { required: true, maxChars: SOURCES_TITLE_MAX_CHARS },
  slots: {
    body: {
      description: 'One sentence on what the references support. Put citations in `sources:`.',
      accepts: ['text'],
    },
    footnote: {
      description: 'An access date or a caveat on the bottom line.',
      accepts: ['text'],
    },
  },
  budget: {
    body: { maxWords: SOURCES_CONTEXT_MAX_WORDS },
    footnote: { maxWords: SOURCES_FOOTNOTE_MAX_WORDS },
  },
  variants: [
    {
      name: 'two columns',
      when: { counts: { sources: { min: SOURCES_TWO_COLUMNS, max: MAX_SOURCES } } },
      budget: {},
      fields: {
        'sources[].title': { maxChars: SOURCE_TITLE_MAX_CHARS_DENSE },
        'sources[].author': { maxChars: SOURCE_CREDIT_MAX_CHARS_DENSE },
        'sources[].publisher': { maxChars: SOURCE_CREDIT_MAX_CHARS_DENSE },
      },
    },
  ],
  pptx: {
    type: 'title-only',
    placeholders: [
      { kind: 'title', from: { selector: '.kit-title' } },
      { kind: 'body', from: { slot: 'body' } },
    ],
  },
  example: {
    frontmatter: {
      title: 'The canopy plan follows three local studies',
      eyebrow: 'References',
      sources: [
        {
          title: 'Eastgate summer heat survey',
          author: 'Dana Okafor',
          publisher: 'Larkfield Council',
          year: '2026',
          url: 'https://larkfield.example/heat',
        },
        {
          title: 'Holloway Road planting trial',
          publisher: 'Urban Forestry Division',
          year: '2025',
        },
        { title: 'Street tree survival register', year: '2026' },
      ],
    },
    body: [
      '<Notes>',
      'Keep these references available for questions about the canopy programme.',
      '</Notes>',
      '',
    ].join('\n'),
  },
});
