import { defineLayoutContract } from '@deckster/engine/layout';
import { Schema } from 'effect';

import { textField } from '#layout-fields.ts';
import {
  PATTERN_ALT_MAX_CHARS,
  PatternImage,
  patternExampleImage,
  patternFields,
  patternFootnote,
  patternHints,
} from '#layouts/pattern-slide.contract.ts';

/**
 * The length of the time or moment label.
 */
const MOMENT_MAX_CHARS = 22;

/**
 * The length of the scene headline.
 */
const ACTION_MAX_CHARS = 48;

/**
 * The length of the scene description.
 */
const DETAIL_MAX_CHARS = 85;

/**
 * An illustrated moment with one action and a time or short scene label.
 */
const Scene = Schema.Struct({
  image: PatternImage,
  moment: textField(MOMENT_MAX_CHARS, 'a moment label'),
  action: textField(ACTION_MAX_CHARS, 'a scene headline'),
  detail: textField(DETAIL_MAX_CHARS, 'a scene description'),
});

/**
 * Three pictured moments in order, following the same person, object or decision.
 */
export const visionStoryboardLayoutContract = defineLayoutContract({
  name: 'vision-storyboard',
  description:
    'Make a product vision tangible with three illustrated moments from one person’s day.',
  schema: Schema.Struct({ ...patternFields, scenes: Schema.Tuple([Scene, Scene, Scene]) }),
  hints: {
    ...patternHints,
    scenes: `Exactly 3 moments. Each takes image: { src, alt, focal? } (alt up to ${PATTERN_ALT_MAX_CHARS} characters), a moment up to ${MOMENT_MAX_CHARS}, an action up to ${ACTION_MAX_CHARS}, and a detail up to ${DETAIL_MAX_CHARS} characters. Keep one actor or object consistent.`,
    reveal:
      'Start on the first scene and reveal a scene on each click. All three appear on the final frame.',
  },
  title: { required: true, maxChars: 70 },
  slots: patternFootnote,
  budget: { footnote: { maxWords: 24 } },
  example: {
    frontmatter: {
      title: 'The repaired lamp is back by dinner',
      reveal: true,
      scenes: [
        {
          image: {
            src: patternExampleImage(
              '%23e9d8c3',
              'M90 268h460M126 267v61m386-61v61M304 181v64m-36 1h72m-99-65 34-87h61l32 87zM382 268v-36h91v36',
            ),
            alt: 'A lamp on a repair counter',
          },
          moment: '09:10',
          action: 'Drop off at the shop',
          detail: 'The owner leaves a lamp on the counter.',
        },
        {
          image: {
            src: patternExampleImage(
              '%23d4e4f1',
              'M77 270h486M114 270v49m403-49v49M315 176v62m-34 10h68m-99-74 34-79h59l31 79zM448 235l45-80m-13 88 31-56m-71 5 25 15',
            ),
            alt: 'A lamp being repaired on a workbench',
          },
          moment: '13:00',
          action: 'Replace the switch',
          detail: 'The repairer tests the new switch.',
        },
        {
          image: {
            src: patternExampleImage(
              '%23d8e6d3',
              'M69 285h502M420 170v102m-33 0h66m-91-104 30-74h58l29 74zM167 217v-45m-26 58q0-30 26-30h124q29 0 29 28v44H141zM382 75l-19-20m69 18 15-20',
            ),
            alt: 'The repaired lamp lit at home',
          },
          moment: '17:32',
          action: 'Turn on the light',
          detail: 'The lamp is home before dinner.',
        },
      ],
    },
    body: '<Notes>Follow the lamp from the counter to the workbench and back home.</Notes>\n',
  },
});
