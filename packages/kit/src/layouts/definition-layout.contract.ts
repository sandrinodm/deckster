import { defineLayoutContract } from '@deckster/engine/layout';
import { Effect, Schema } from 'effect';

import { CHROME_HINT, chromeField, EYEBROW_HINT, EyebrowField, textField } from '#layout-fields.ts';

/**
 * The longest term, in characters, set in the display style above its definition.
 */
export const DEFINITION_TERM_MAX_CHARS = 20;

/**
 * The longest pronunciation, in characters, including any phonetic slashes.
 */
export const DEFINITION_PRONUNCIATION_MAX_CHARS = 32;

/**
 * The longest part of speech or category, in characters.
 */
export const DEFINITION_KIND_MAX_CHARS = 24;

/**
 * The longest example sentence, in characters, set apart beneath the definition.
 */
export const DEFINITION_EXAMPLE_MAX_CHARS = 100;

/**
 * The longest label above the example, in characters, including tracked mono brands.
 */
export const DEFINITION_EXAMPLE_LABEL_MAX_CHARS = 16;

/**
 * The example label used when a slide supplies none.
 */
export const DEFAULT_EXAMPLE_LABEL = 'Example';

/**
 * The most words in the definition: one or two sentences rather than a glossary entry.
 */
export const DEFINITION_MAX_WORDS = 36;

/**
 * The longest assertion title, in characters, kept on one line above the entry.
 */
export const DEFINITION_TITLE_MAX_CHARS = 50;

/**
 * The most words in the source or caveat on the bottom line.
 */
export const DEFINITION_FOOTNOTE_MAX_WORDS = 16;

/**
 * The contract of the `definition` layout: one term and the meaning the audience should share.
 */
export const definitionLayoutContract = defineLayoutContract({
  name: 'definition',
  description:
    'One term defined, dictionary style, under a title that states the point. The term is set ' +
    'in the display style, an optional pronunciation and part of speech or category share a ' +
    'small line, and the body gives its meaning in one or two sentences. An optional example ' +
    'sentence stands apart beneath a rule. Use it to establish a shared meaning before using ' +
    'a specialist word, a product concept or a measure in the argument. Use statement for a ' +
    'claim without a term and definition, quote for someone else’s words, and content for ' +
    'a longer explanation. Use cards or table for a glossary of three or more terms side by ' +
    'side. The entry is shown as a whole and defaults to ' +
    'the inverse surface; sparse entries grow and longer ones step down to fit.',
  schema: Schema.Struct({
    eyebrow: EyebrowField,
    term: textField(DEFINITION_TERM_MAX_CHARS, 'a term'),
    pronunciation: Schema.optionalKey(
      textField(DEFINITION_PRONUNCIATION_MAX_CHARS, 'a pronunciation'),
    ),
    kind: Schema.optionalKey(textField(DEFINITION_KIND_MAX_CHARS, 'a part of speech or category')),
    example: Schema.optionalKey(textField(DEFINITION_EXAMPLE_MAX_CHARS, 'an example sentence')),
    labels: Schema.Struct({
      example: textField(DEFINITION_EXAMPLE_LABEL_MAX_CHARS, 'an example label').pipe(
        Schema.withDecodingDefaultKey(Effect.succeed(DEFAULT_EXAMPLE_LABEL)),
      ),
    }).pipe(Schema.withDecodingDefaultKey(Effect.succeed({ example: DEFAULT_EXAMPLE_LABEL }))),
    chrome: chromeField(true),
  }),
  hints: {
    eyebrow: EYEBROW_HINT,
    term: `Name one term, up to ${DEFINITION_TERM_MAX_CHARS} characters, for example \`term: Canopy\`.`,
    pronunciation:
      'Give the pronunciation as it should appear, including any slashes, up to ' +
      `${DEFINITION_PRONUNCIATION_MAX_CHARS} characters, or leave it out. IPA characters missing ` +
      'from the brand’s text font fall back to a substitute font in PPTX; a plain respelling ' +
      'such as `LOOP` or `KAN-uh-pee` is the safe choice.',
    kind:
      'Name the part of speech or category, such as `kind: noun` or `kind: Service promise`, ' +
      `up to ${DEFINITION_KIND_MAX_CHARS} characters, or leave it out.`,
    example:
      'Give one sentence that makes the meaning concrete, up to ' +
      `${DEFINITION_EXAMPLE_MAX_CHARS} characters, or leave it out.`,
    labels:
      `Write \`labels.example\` above the example, up to ${DEFINITION_EXAMPLE_LABEL_MAX_CHARS} characters; ` +
      'it defaults to "Example". Translate it to match the deck’s language.',
    chrome: CHROME_HINT,
  },
  title: { required: true, maxChars: DEFINITION_TITLE_MAX_CHARS },
  slots: {
    body: {
      description: 'The definition in one or two sentences. Put the term in `term:`, not here.',
      required: true,
      accepts: ['text'],
    },
    footnote: {
      description: 'A source or caveat on the bottom line, such as the scope of this definition.',
      accepts: ['text'],
    },
  },
  budget: {
    body: { maxWords: DEFINITION_MAX_WORDS },
    footnote: { maxWords: DEFINITION_FOOTNOTE_MAX_WORDS },
  },
  surface: 'inverse',
  pptx: {
    type: 'content',
    placeholders: [
      { kind: 'title', from: { selector: '.kit-title' } },
      { kind: 'body', from: { slot: 'body' } },
    ],
  },
  example: {
    frontmatter: {
      title: 'Canopy measures the shade above our streets',
      eyebrow: 'A shared vocabulary',
      term: 'Canopy',
      pronunciation: '/ˈkænəpi/',
      kind: 'noun',
      labels: { example: DEFAULT_EXAMPLE_LABEL },
      example: 'A street with 30% canopy has tree crowns above three tenths of its area.',
    },
    body: [
      'The layer of leaves and branches that covers the ground when viewed from above.',
      '',
      '<Footnote>Larkfield Urban Forestry Division, canopy survey.</Footnote>',
      '',
      '<Notes>',
      'Establish what we measure before showing the district map.',
      '</Notes>',
      '',
    ].join('\n'),
  },
});
