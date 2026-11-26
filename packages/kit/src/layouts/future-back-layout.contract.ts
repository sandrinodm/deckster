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
 * The length of a prerequisite name.
 */
const CAPABILITY_MAX_CHARS = 40;

/**
 * The length of the link from a capability to the future.
 */
const REASON_MAX_CHARS = 78;

/**
 * The length of the illustrated target horizon.
 */
const HORIZON_MAX_CHARS = 25;

/**
 * The length of the customer outcome.
 */
const OUTCOME_MAX_CHARS = 76;

/**
 * The length of the date on the near-term bet.
 */
const BET_DATE_MAX_CHARS = 24;

/**
 * The length of the immediate action.
 */
const ACTION_MAX_CHARS = 45;

/**
 * The length of the measure or decision the test informs.
 */
const TEST_MAX_CHARS = 100;

/**
 * A prerequisite expressed as something the organization will be able to do.
 */
const Capability = Schema.Struct({
  name: textField(CAPABILITY_MAX_CHARS, 'a capability'),
  reason: textField(REASON_MAX_CHARS, 'how the capability enables the future'),
});

/**
 * A desired future, the capabilities that enable it and one immediate way to test them.
 */
export const futureBackLayoutContract = defineLayoutContract({
  name: 'future-back',
  description:
    'Start at a pictured desired future and trace backward to the capabilities and a near-term bet.',
  schema: Schema.Struct({
    ...patternFields,
    future: Schema.Struct({
      image: PatternImage,
      when: textField(HORIZON_MAX_CHARS, 'the target horizon'),
      outcome: textField(OUTCOME_MAX_CHARS, 'the customer outcome'),
    }),
    capabilities: Schema.Tuple([Capability, Capability]),
    bet: Schema.Struct({
      when: textField(BET_DATE_MAX_CHARS, 'the next decision date'),
      action: textField(ACTION_MAX_CHARS, 'the immediate bet'),
      test: textField(TEST_MAX_CHARS, 'the evidence the bet should produce'),
    }),
  }),
  hints: {
    ...patternHints,
    future: `Give a horizon (when, ${HORIZON_MAX_CHARS} characters), outcome (${OUTCOME_MAX_CHARS}) and image ({ src, alt }, ${PATTERN_ALT_MAX_CHARS} alt characters) from a customer’s point of view.`,
    capabilities: `Write 2 prerequisites. Each takes a name up to ${CAPABILITY_MAX_CHARS} characters and a reason up to ${REASON_MAX_CHARS} explaining what it enables.`,
    bet: `Write when (up to ${BET_DATE_MAX_CHARS} characters), one action (up to ${ACTION_MAX_CHARS}) and the test that will change a decision (up to ${TEST_MAX_CHARS}).`,
    reveal:
      'Start at the illustrated outcome on the right. Reveal its capabilities to the left, then the immediate bet farther left.',
  },
  title: { required: true, maxChars: 70 },
  slots: patternFootnote,
  budget: { footnote: { maxWords: 24 } },
  example: {
    frontmatter: {
      title: 'A broken lamp should be working by dinner',
      reveal: true,
      future: {
        image: {
          src: patternExampleImage(
            '%23e2eacb',
            'M65 286h512M421 170v101m-32 0h64m-93-103 32-74h57l31 74zM144 231q0-27 27-27h107q28 0 28 27v41H144zM171 206v-34m207-100-16-17m92 20 18-18',
          ),
          alt: 'A repaired lamp beside a sofa',
        },
        when: 'By next summer',
        outcome: 'Neighbors collect repaired lamps on their way home.',
      },
      capabilities: [
        { name: 'Same-day triage', reason: 'Identify the fix before the afternoon collection.' },
        { name: 'Common parts on hand', reason: 'Complete common repairs without an extra visit.' },
      ],
      bet: {
        when: 'Next month',
        action: 'Run four repair Saturdays',
        test: 'Measure how many common repairs finish before 5 p.m.',
      },
    },
    body: '<Notes>Start in the home. [click] Trace back to what the shop must be able to do. [click] Share the first test.</Notes>\n',
  },
});
