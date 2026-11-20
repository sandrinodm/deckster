import { defineLayoutContract } from '@deckster/engine/layout';
import { Schema } from 'effect';

import { textField } from '#layouts/layout-fields.ts';
import {
  PatternPercent,
  patternFields,
  patternFootnote,
  patternHints,
} from '#layouts/pattern-slide.contract.ts';

/**
 * The length of a scope label.
 */
const NAME_MAX_CHARS = 25;

/**
 * The length of a review date label.
 */
const DATE_MAX_CHARS = 22;

/**
 * The length of the next decision.
 */
const TAKEAWAY_MAX_CHARS = 92;

/**
 * One scope and two qualitative placements on a hill. The midpoint means the approach is known.
 */
const Scope = Schema.Struct({
  name: textField(NAME_MAX_CHARS, 'a scope name'),
  previous: PatternPercent,
  current: PatternPercent,
});

/**
 * A previous and current view that separates uncertainty from execution.
 */
export const roadmapHillLayoutContract = defineLayoutContract({
  name: 'roadmap-hill',
  description: 'Show where named scopes sit between discovering an approach and carrying it out.',
  schema: Schema.Struct({
    ...patternFields,
    scopes: Schema.Tuple([Scope, Scope, Scope]),
    previous: textField(DATE_MAX_CHARS, 'the earlier review date'),
    current: textField(DATE_MAX_CHARS, 'the current review date'),
    takeaway: textField(TAKEAWAY_MAX_CHARS, 'the implication for the roadmap'),
  }),
  hints: {
    ...patternHints,
    scopes: `Write 3 { name, previous, current } scopes, with names up to ${NAME_MAX_CHARS} characters. Positions 0–49 are discovering, 50 means the approach is known, and 51–100 are executing it.`,
    previous: `Label the earlier checkpoint, up to ${DATE_MAX_CHARS} characters.`,
    current: `Label the current checkpoint, up to ${DATE_MAX_CHARS} characters.`,
    takeaway: `State what the movement means for the next decision, up to ${TAKEAWAY_MAX_CHARS} characters.`,
    reveal:
      'Show the earlier scope positions first and reveal their direction and new positions on the click.',
  },
  title: { required: true, maxChars: 70 },
  slots: patternFootnote,
  budget: { footnote: { maxWords: 24 } },
  example: {
    frontmatter: {
      title: 'Route scanning has a workable approach',
      reveal: true,
      previous: '3 March',
      current: '17 March',
      scopes: [
        { name: 'Shop enrollment', previous: 18, current: 30 },
        { name: 'Route scanning', previous: 43, current: 61 },
        { name: 'Label printing', previous: 72, current: 88 },
      ],
      takeaway: 'Make the route scanner ready for the first trial.',
    },
    body: '<Notes>Read each scope on the earlier hill. [click] Route scanning has moved into delivery.</Notes>\n',
  },
});
