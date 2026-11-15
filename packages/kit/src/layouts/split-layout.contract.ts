import { defineLayoutContract } from '@deckster/engine/layout';
import { Effect, Schema } from 'effect';

import {
  CHROME_HINT,
  chromeField,
  EYEBROW_HINT,
  EyebrowField,
  TREATMENT_HINT,
  TreatmentField,
} from '#layouts/layout-fields.ts';

/**
 * How the twelve columns are shared between text and media, written text:media.
 */
export const SPLIT_RATIOS = ['1:1', '5:7', '7:5'] as const;

/**
 * One of {@link SPLIT_RATIOS}.
 */
export type SplitRatio = (typeof SPLIT_RATIOS)[number];

/**
 * The side the media sits on.
 */
export const SPLIT_SIDES = ['left', 'right'] as const;

/**
 * One of {@link SPLIT_SIDES}.
 */
export type SplitSide = (typeof SPLIT_SIDES)[number];

/**
 * The longest split title, in characters: two lines in the five-column text column at the smallest
 * fit step, in both brands.
 */
export const SPLIT_TITLE_MAX_CHARS = 44;

/**
 * The longest split title beside media at 5:7, where the text has five columns, in characters.
 */
export const SPLIT_TITLE_MAX_CHARS_NARROW = 40;

/**
 * A self-contained chart for the example: canopy cover by district as bars in the brand's accent,
 * drawn inline so a new slide made from it renders without any asset.
 */
const EXAMPLE_CHART = [
  '  <svg viewBox="0 0 640 480" role="img" aria-label="Canopy cover by district: Riverside 34%,',
  '  city average 21%, Eastgate 9%" style={{ width: "100%", height: "100%" }}>',
  '    <rect x="40" y="88" width="150" height="352" fill="var(--brand-color-accent)" />',
  '    <rect x="245" y="222" width="150" height="218" fill="var(--brand-color-muted)" />',
  '    <rect x="450" y="347" width="150" height="93" fill="var(--brand-color-muted)" />',
  '  </svg>',
];

/**
 * The contract of the `split` layout: text on one side, media or evidence on the other.
 */
export const splitLayoutContract = defineLayoutContract({
  name: 'split',
  description:
    'Text beside a picture or the evidence for it: a title and a short paragraph or bullets on ' +
    'one side, a photo, chart, diagram, table or component on the other. `ratio` shares the ' +
    'columns (text:media, 1:1, 5:7 or 7:5), `side` puts the media left or right, and `bleed: ' +
    'true` runs a photo to the edges of the slide. Photos fill the frame in the brand image ' +
    'treatment; other media is centred in it and can fill it with `height: 100%`. Use content ' +
    'when there is nothing to show.',
  schema: Schema.Struct({
    eyebrow: EyebrowField,
    ratio: Schema.Literals(SPLIT_RATIOS).pipe(
      Schema.withDecodingDefaultKey(Effect.succeed<SplitRatio>('1:1')),
    ),
    side: Schema.Literals(SPLIT_SIDES).pipe(
      Schema.withDecodingDefaultKey(Effect.succeed<SplitSide>('right')),
    ),
    bleed: Schema.Boolean.pipe(Schema.withDecodingDefaultKey(Effect.succeed(false))),
    treatment: TreatmentField,
    chrome: chromeField(true),
  }),
  hints: {
    eyebrow: EYEBROW_HINT,
    ratio: 'Share the columns text:media with `ratio: 1:1`, `ratio: 5:7` (wider media) or `7:5`.',
    side: 'Put the media on the `left` or the `right` (the default).',
    bleed: 'Write `bleed: true` to run a photo to the slide edges, or leave it out to frame it.',
    treatment: TREATMENT_HINT,
    chrome: CHROME_HINT,
  },
  title: { required: true, maxChars: SPLIT_TITLE_MAX_CHARS },
  slots: {
    body: {
      description:
        'The text side: a short paragraph, up to four bullets, or a sentence and bullets. Set ' +
        'the takeaway in `title:`. The 5:7 column holds about 30 words.',
      required: true,
      accepts: ['text', 'bullets'],
    },
    media: {
      description:
        "What the text points at: one <img> with alt text (imported from the deck's assets/ or " +
        'served from its public/ folder), a chart, diagram, table or component. Photos fill the ' +
        'frame and are cropped to it; anything else is centred and may fill it with ' +
        '`height: 100%` (the frame is a size container, so `100cqh` works too).',
      required: true,
      accepts: ['image', 'chart', 'diagram', 'table', 'video', 'component'],
    },
    caption: {
      description: 'A caption or credit for the media, in a short sentence.',
      accepts: ['text'],
    },
    footnote: {
      description: 'A source or caveat on the bottom line of the text side.',
      accepts: ['text'],
    },
  },
  budget: {
    body: { maxWords: 48, maxBullets: 4 },
    caption: { maxWords: 20 },
    footnote: { maxWords: 24 },
  },
  variants: [
    {
      name: 'ratio 1:1',
      when: { fields: { ratio: '1:1' } },
      budget: { body: { maxWords: 40 } },
    },
    {
      name: 'ratio 5:7',
      when: { fields: { ratio: '5:7' } },
      budget: {
        body: { maxWords: 30, maxBullets: 3 },
        footnote: { maxWords: 16 },
      },
      // Five columns hold three lines of title at the smallest fit step only for a shorter one.
      fields: { title: { maxChars: SPLIT_TITLE_MAX_CHARS_NARROW } },
    },
    {
      name: 'bleed',
      when: { fields: { bleed: true } },
      budget: { caption: { maxWords: 14 } },
    },
    {
      name: 'bleed at 1:1',
      when: { fields: { ratio: '1:1', bleed: true } },
      budget: { body: { maxWords: 34 } },
    },
    {
      name: 'bleed at 7:5',
      when: { fields: { ratio: '7:5', bleed: true } },
      budget: { body: { maxWords: 42 } },
    },
  ],
  pptx: {
    type: 'two-content',
    placeholders: [
      { kind: 'title', from: { selector: '.kit-title' } },
      { kind: 'body', from: { slot: 'body' } },
    ],
  },
  example: {
    frontmatter: { title: 'Eastgate has a quarter of the shade', ratio: '5:7' },
    body: [
      'Tree crowns shade 9% of Eastgate at noon, against 34% in Riverside.',
      '',
      '<Media>',
      ...EXAMPLE_CHART,
      '</Media>',
      '',
      '<Caption>Canopy cover at noon: Riverside, city average, Eastgate.</Caption>',
      '',
      '<Notes>',
      'Point at the tallest bar first, then the shortest: the gap is the argument.',
      '</Notes>',
      '',
    ].join('\n'),
  },
});
