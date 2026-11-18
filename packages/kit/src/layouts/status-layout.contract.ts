import { defineLayoutContract } from '@deckster/engine/layout';
import { Effect, Schema } from 'effect';

import {
  CHROME_HINT,
  chromeField,
  CONTEXT_MAX_WORDS,
  EYEBROW_HINT,
  EyebrowField,
  REVEAL_HINT,
  RevealField,
  textField,
} from '#layouts/layout-fields.ts';

/**
 * The fewest workstreams in a status report.
 */
export const MIN_STATUS_ITEMS = 3;

/**
 * The most workstreams in a status report; split a longer report by programme.
 */
export const MAX_STATUS_ITEMS = 7;

/**
 * The longest workstream name, in characters, on one line.
 */
export const STATUS_NAME_MAX_CHARS = 24;

/**
 * The longest owner's name, in characters, on one line.
 */
export const STATUS_OWNER_MAX_CHARS = 17;

/**
 * The longest workstream note, in characters, on one line.
 */
export const STATUS_NOTE_MAX_CHARS = 40;

/**
 * The longest overall takeaway, in characters, on one title line.
 */
export const STATUS_TITLE_MAX_CHARS = 50;

/**
 * The most words in the report's source or caveat.
 */
export const STATUS_FOOTNOTE_MAX_WORDS = 16;

/**
 * The four labelled states a workstream can report; other values are refused.
 */
export const STATUS_STATES = ['on-track', 'at-risk', 'blocked', 'done'] as const;

/**
 * The longest column heading or state label, in characters, including wide mono brands.
 */
export const STATUS_LABEL_MAX_CHARS = 11;

/**
 * Optional replacements for every visible column heading and state label.
 */
const Labels = Schema.Struct({
  name: textField(STATUS_LABEL_MAX_CHARS, 'a name column label').pipe(
    Schema.withDecodingDefaultKey(Effect.succeed('Workstream')),
  ),
  status: textField(STATUS_LABEL_MAX_CHARS, 'a status column label').pipe(
    Schema.withDecodingDefaultKey(Effect.succeed('Status')),
  ),
  owner: textField(STATUS_LABEL_MAX_CHARS, 'an owner column label').pipe(
    Schema.withDecodingDefaultKey(Effect.succeed('Owner')),
  ),
  note: textField(STATUS_LABEL_MAX_CHARS, 'an update column label').pipe(
    Schema.withDecodingDefaultKey(Effect.succeed('Update')),
  ),
  'on-track': textField(STATUS_LABEL_MAX_CHARS, 'an on-track label').pipe(
    Schema.withDecodingDefaultKey(Effect.succeed('On track')),
  ),
  'at-risk': textField(STATUS_LABEL_MAX_CHARS, 'an at-risk label').pipe(
    Schema.withDecodingDefaultKey(Effect.succeed('At risk')),
  ),
  blocked: textField(STATUS_LABEL_MAX_CHARS, 'a blocked label').pipe(
    Schema.withDecodingDefaultKey(Effect.succeed('Blocked')),
  ),
  done: textField(STATUS_LABEL_MAX_CHARS, 'a done label').pipe(
    Schema.withDecodingDefaultKey(Effect.succeed('Done')),
  ),
});

/**
 * Author-supplied column and state labels; omitted keys keep the English defaults.
 */
export type StatusLabels = typeof Labels.Type;

/**
 * A workstream and the short explanation behind its state.
 */
const StatusItem = Schema.Struct({
  name: textField(STATUS_NAME_MAX_CHARS, 'a workstream name'),
  status: Schema.Literals(STATUS_STATES),
  owner: Schema.optionalKey(textField(STATUS_OWNER_MAX_CHARS, 'an owner')),
  note: textField(STATUS_NOTE_MAX_CHARS, 'a workstream note'),
});

/**
 * One decoded workstream, including its required state and note.
 */
export type StatusEntry = typeof StatusItem.Type;

/**
 * The contract of the `status` layout: a takeaway over aligned workstream updates.
 */
export const statusLayoutContract = defineLayoutContract({
  name: 'status',
  description:
    'A status report of three to seven workstreams from `items:`, each with a name, a labelled ' +
    'state, an optional owner and a one-line note explaining what changed or what needs help. ' +
    'The title states the overall position, and aligned rows make the exceptions easy to scan. ' +
    'Use it for a programme review or a launch readiness check; the pills always name their ' +
    'states, so colour is never the only signal. Use table for arbitrary exact values, columns ' +
    'to group several tasks into lanes, timeline when dates and sequence are the point, ' +
    'actions for commitments with owners and deadlines, or stats for one headline number. ' +
    'The owner column appears only when ' +
    'a workstream names an owner. Use `labels.name: Team` when reporting teams. ' +
    '`reveal: true` introduces one workstream per step.',
  schema: Schema.Struct({
    eyebrow: EyebrowField,
    items: Schema.Array(StatusItem).check(
      Schema.isMinLength(MIN_STATUS_ITEMS, {
        message: `Expected at least ${MIN_STATUS_ITEMS} workstreams`,
      }),
      Schema.isMaxLength(MAX_STATUS_ITEMS, {
        message: `Expected at most ${MAX_STATUS_ITEMS} workstreams`,
      }),
    ),
    labels: Labels.pipe(
      Schema.withDecodingDefaultKey(
        Effect.succeed({
          name: 'Workstream',
          status: 'Status',
          owner: 'Owner',
          note: 'Update',
          'on-track': 'On track',
          'at-risk': 'At risk',
          blocked: 'Blocked',
          done: 'Done',
        }),
      ),
    ),
    reveal: RevealField,
    chrome: chromeField(true),
  }),
  hints: {
    eyebrow: EYEBROW_HINT,
    items:
      `List ${MIN_STATUS_ITEMS} to ${MAX_STATUS_ITEMS} workstreams, each with \`name\` (up to ` +
      `${STATUS_NAME_MAX_CHARS} characters), \`status\` (on-track, at-risk, blocked or done), ` +
      `optional \`owner\` (up to ${STATUS_OWNER_MAX_CHARS} characters), and \`note\` (up to ` +
      `${STATUS_NOTE_MAX_CHARS} characters). Keep each field to one line.`,
    labels:
      'Optional replacements for `name` (Workstream), `status` (Status), `owner` (Owner), ' +
      '`note` (Update), `on-track` (On track), `at-risk` (At risk), `blocked` (Blocked) and ' +
      `\`done\` (Done); each is 1 to ${STATUS_LABEL_MAX_CHARS} characters. Omitted keys keep ` +
      'their English defaults. For example, `labels: { name: Team }`.',
    reveal: REVEAL_HINT,
    chrome: CHROME_HINT,
  },
  title: { required: true, maxChars: STATUS_TITLE_MAX_CHARS },
  slots: {
    body: {
      description: 'One sentence setting the review date or scope; put the updates in `items:`.',
      accepts: ['text'],
    },
    footnote: {
      description: 'The report source or caveat on the bottom line.',
      accepts: ['text'],
    },
  },
  budget: {
    body: { maxWords: CONTEXT_MAX_WORDS },
    footnote: { maxWords: STATUS_FOOTNOTE_MAX_WORDS },
  },
  pptx: {
    type: 'title-only',
    placeholders: [
      { kind: 'title', from: { selector: '.kit-title' } },
      { kind: 'body', from: { slot: 'body' } },
    ],
  },
  example: {
    frontmatter: {
      title: 'Planting is ready; watering needs cover',
      eyebrow: 'Programme review',
      labels: {
        name: 'Team',
        status: 'Status',
        owner: 'Owner',
        note: 'Update',
        'on-track': 'On track',
        'at-risk': 'At risk',
        blocked: 'Blocked',
        done: 'Done',
      },
      items: [
        {
          name: 'Planting',
          status: 'done',
          owner: 'Dana Okafor',
          note: 'All 300 trees are in the ground.',
        },
        {
          name: 'Watering',
          status: 'at-risk',
          owner: 'Leah Chen',
          note: 'Two summer routes still need wardens.',
        },
        { name: 'Tree mapping', status: 'on-track', note: 'The app rollout starts next week.' },
      ],
    },
    body: [
      'Spring review of the canopy programme.',
      '',
      '<Footnote>Urban Forestry Division, March 2027.</Footnote>',
      '',
      '<Notes>',
      'Name the watering gap first, then the completed planting and the mapping rollout.',
      '</Notes>',
      '',
    ].join('\n'),
  },
});
