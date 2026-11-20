import { defineLayoutContract } from '@deckster/engine/layout';
import { Schema } from 'effect';

import { textField } from '#layouts/layout-fields.ts';
import {
  PATTERN_ALT_MAX_CHARS,
  PatternImage,
  PatternPoint,
  patternExampleImage,
  patternFields,
  patternFootnote,
  patternHints,
} from '#layouts/pattern-slide.contract.ts';

/**
 * The length of a landmark name.
 */
const LABEL_MAX_CHARS = 28;

/**
 * The length of the outcome line.
 */
const RESULT_MAX_CHARS = 98;

/**
 * One visual decision, locatable in both the sketch and the released design.
 */
const Annotation = Schema.Struct({
  label: textField(LABEL_MAX_CHARS, 'a feature name'),
  sketch: PatternPoint,
  finished: PatternPoint,
});

/**
 * Compares one working sketch with the shipped result and carries two landmarks across the change.
 */
export const sketchToShipLayoutContract = defineLayoutContract({
  name: 'sketch-to-ship',
  description: 'Connect an annotated sketch to the same decisions in a finished design.',
  schema: Schema.Struct({
    ...patternFields,
    sketch: PatternImage,
    finished: PatternImage,
    annotations: Schema.Tuple([Annotation, Annotation]),
    result: textField(RESULT_MAX_CHARS, 'the result of the design change'),
  }),
  hints: {
    ...patternHints,
    sketch: `The rough design as { src, alt } with up to ${PATTERN_ALT_MAX_CHARS} alt characters. Use the same 16:9 orientation as finished.`,
    finished: `The released design as { src, alt } with up to ${PATTERN_ALT_MAX_CHARS} alt characters and the same landmarks as the sketch.`,
    annotations: `Write 2 { label, sketch: { x, y }, finished: { x, y } } mappings. A label takes up to ${LABEL_MAX_CHARS} characters. Coordinates are percentages from the top left. Keep room above and to the right of the pin.`,
    result: `Name what changed for the person using the product, in up to ${RESULT_MAX_CHARS} characters.`,
    reveal:
      'Start with the marked-up sketch. The click exposes the shipping design and its corresponding annotations.',
  },
  title: { required: true, maxChars: 70 },
  slots: patternFootnote,
  budget: { footnote: { maxWords: 24 } },
  example: {
    frontmatter: {
      title: 'The repair estimate now shows its due date',
      reveal: true,
      sketch: {
        src: patternExampleImage(
          '%23ecdcc5',
          'M44 60q267-5 552 3l-3 233q-246 9-552-5zM49 93l542 1M369 92l-4 203M92 142l110-2m-109 32 78-4m241 30 106-3m-105 30h62',
        ),
        alt: 'A rough two-column estimate',
      },
      finished: {
        src: patternExampleImage(
          '%23d8e6f4',
          'M44 60h552v236H44zM44 93h552m-227 0v203M92 142h110m-110 31h78M412 198h106m-106 30h62M463 253h42',
        ),
        alt: 'The released two-column estimate',
      },
      annotations: [
        { label: 'Estimate', sketch: { x: 12, y: 24 }, finished: { x: 12, y: 24 } },
        { label: 'Due date', sketch: { x: 52, y: 70 }, finished: { x: 52, y: 70 } },
      ],
      result: 'The customer sees the price and due date together.',
    },
    body: '<Notes>Point to both landmarks in the sketch. [click] Find the same decisions in the final design.</Notes>\n',
  },
});
