import { defineLayoutContract } from '@deckster/engine/layout';
import { Schema } from 'effect';

import { textField } from '#layouts/layout-fields.ts';
import { patternFields, patternFootnote, patternHints } from '#layouts/pattern-slide.contract.ts';

/**
 * The length of a label on the shared time axis.
 */
const PERIOD_MAX_CHARS = 16;

/**
 * The length of a stop or workstream label.
 */
const STOP_MAX_CHARS = 24;

/**
 * The length of a dependency name.
 */
const TRANSFER_MAX_CHARS = 32;

/**
 * The length of the milestone statement.
 */
const MILESTONE_MAX_CHARS = 96;

/**
 * Four ordered or evenly spaced time periods on the shared station axis.
 */
const Period = textField(PERIOD_MAX_CHARS, 'a roadmap period');

/**
 * Four stops, which may skip periods. Blank stops keep the route line visible.
 */
const Stops = Schema.Tuple([
  Schema.NullOr(textField(STOP_MAX_CHARS, 'a roadmap stop')),
  Schema.NullOr(textField(STOP_MAX_CHARS, 'a roadmap stop')),
  Schema.NullOr(textField(STOP_MAX_CHARS, 'a roadmap stop')),
  Schema.NullOr(textField(STOP_MAX_CHARS, 'a roadmap stop')),
]);

/**
 * A workstream and its work at the four positions on the route.
 */
const Track = Schema.Struct({
  name: textField(STOP_MAX_CHARS, 'a workstream name'),
  stops: Stops,
});

/**
 * A shared connection between two workstreams at the second or third stop.
 */
const Transfer = Schema.Struct({
  stop: Schema.Literals([2, 3]),
  from: Schema.Literals([1, 2, 3]),
  to: Schema.Literals([1, 2, 3]),
  label: textField(TRANSFER_MAX_CHARS, 'a dependency label'),
}).check(
  Schema.makeFilter(({ from, to }) => from !== to, {
    message: 'Choose two different workstreams for the transfer',
  }),
);

/**
 * Parallel workstreams with a named transfer, followed by the launch consequence.
 */
export const roadmapTransitLayoutContract = defineLayoutContract({
  name: 'roadmap-transit',
  description:
    'Lay three workstreams across four shared periods and mark the dependency where two lines connect.',
  schema: Schema.Struct({
    ...patternFields,
    periods: Schema.Tuple([Period, Period, Period, Period]),
    tracks: Schema.Tuple([Track, Track, Track]),
    transfer: Transfer,
    milestone: textField(MILESTONE_MAX_CHARS, 'the milestone this roadmap supports'),
  }),
  hints: {
    ...patternHints,
    periods: `List 4 period labels in time order, each up to ${PERIOD_MAX_CHARS} characters. Every workstream shares these positions.`,
    tracks: `Write 3 { name, stops } lines, each with 4 stop labels or null for an empty stop. A name or stop label takes up to ${STOP_MAX_CHARS} characters.`,
    transfer: `Set stop to 2 or 3, use from and to to name the two one-based track positions, and explain the dependency in a label up to ${TRANSFER_MAX_CHARS} characters.`,
    milestone: `State the milestone enabled by that dependency, in up to ${MILESTONE_MAX_CHARS} characters.`,
    reveal: 'Show the three lines first, then the dependency, then the milestone.',
  },
  title: { required: true, maxChars: 70 },
  slots: patternFootnote,
  budget: { footnote: { maxWords: 24 } },
  example: {
    frontmatter: {
      title: 'The pilot depends on pickup labels',
      reveal: true,
      periods: ['April', 'May', 'June', 'July'],
      tracks: [
        { name: 'Software', stops: ['Queue prototype', 'Print labels', 'Live alerts', null] },
        {
          name: 'Operations',
          stops: ['Map pickup routes', 'Scan labels', 'Staff the pilot', 'Run the pilot'],
        },
        { name: 'Sales', stops: ['Invite shops', null, 'Confirm shops', 'Announce dates'] },
      ],
      transfer: { stop: 2, from: 1, to: 2, label: 'Labels to dispatch' },
      milestone: 'July: run the pilot once every pickup carries a scannable label.',
    },
    body: '<Notes>Read across the parallel lines. [click] Trace the shared dependency. [click] Name the pilot it unlocks.</Notes>\n',
  },
});
