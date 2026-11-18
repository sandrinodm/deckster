import { defineLayoutContract } from '@deckster/engine/layout';
import { Effect, Schema } from 'effect';

import {
  CHROME_HINT,
  chromeField,
  CONTEXT_MAX_WORDS,
  currentProblems,
  EYEBROW_HINT,
  EyebrowField,
  REVEAL_HINT,
  RevealField,
  textField,
} from '#layouts/layout-fields.ts';

/**
 * The fewest commitments that make an action list.
 */
export const MIN_ACTIONS = 3;

/**
 * The most commitments that fit on one slide.
 */
export const MAX_ACTIONS = 6;

/**
 * The longest action, kept to one line across the list's wide first column.
 */
export const ACTION_TITLE_MAX_CHARS = 40;

/**
 * The longest owner name or team in the aligned owner column.
 */
export const ACTION_OWNER_MAX_CHARS = 22;

/**
 * The longest due date or period in the aligned last column.
 */
export const ACTION_DUE_MAX_CHARS = 16;

/**
 * The longest inline badge label, including in brands with wide mono labels.
 */
export const ACTION_BADGE_MAX_CHARS = 14;

/**
 * The longest label for each of the three columns.
 */
export const ACTION_HEADING_MAX_CHARS = 12;

/**
 * The longest slide title, kept to one line above the list.
 */
export const ACTIONS_TITLE_MAX_CHARS = 50;

/**
 * The badge shown when a slide supplies no translation.
 */
const DEFAULT_ACTION_BADGE = 'In progress';

/**
 * One commitment: what will happen, who owns it, and when it is due.
 */
const Action = Schema.Struct({
  title: textField(ACTION_TITLE_MAX_CHARS, 'an action title'),
  owner: textField(ACTION_OWNER_MAX_CHARS, 'an action owner'),
  due: textField(ACTION_DUE_MAX_CHARS, 'an action due date'),
});

/**
 * One action as the slide's frontmatter writes it, decoded.
 */
export type ActionEntry = typeof Action.Type;

/**
 * The contract of the `actions` layout: accountable next steps with owners and dates.
 */
export const actionsLayoutContract = defineLayoutContract({
  name: 'actions',
  description:
    'Three to six next actions from `actions:`, each with a one-line `title`, an `owner` and a ' +
    '`due` date or period. The action takes the wide first column; owners and dates align in ' +
    'their own columns so the audience can scan who does what by when. The title states what ' +
    'happens next. `current:` marks one action in progress with a badge in the owner column and an ' +
    'accent band, and ' +
    '`reveal: true` brings the rows in one per click. Use it to close a review with accountable ' +
    'commitments; use steps for stages of a process without owners, columns for work grouped by ' +
    'horizon or status, and timeline when dates and milestones tell the story; use table when ' +
    'the rows carry figures or more than three columns, status for readiness across workstreams, ' +
    'and agenda for the order of a meeting.',
  schema: Schema.Struct({
    eyebrow: EyebrowField,
    actions: Schema.Array(Action).check(
      Schema.isMinLength(MIN_ACTIONS, { message: `Expected at least ${MIN_ACTIONS} actions` }),
      Schema.isMaxLength(MAX_ACTIONS, { message: `Expected at most ${MAX_ACTIONS} actions` }),
    ),
    badge: textField(ACTION_BADGE_MAX_CHARS, 'a badge label').pipe(
      Schema.withDecodingDefaultKey(Effect.succeed(DEFAULT_ACTION_BADGE)),
    ),
    labels: Schema.Struct({
      action: textField(ACTION_HEADING_MAX_CHARS, 'an action column heading').pipe(
        Schema.withDecodingDefaultKey(Effect.succeed('Action')),
      ),
      owner: textField(ACTION_HEADING_MAX_CHARS, 'an owner column heading').pipe(
        Schema.withDecodingDefaultKey(Effect.succeed('Owner')),
      ),
      due: textField(ACTION_HEADING_MAX_CHARS, 'a due column heading').pipe(
        Schema.withDecodingDefaultKey(Effect.succeed('Due')),
      ),
    }).pipe(
      Schema.withDecodingDefaultKey(
        Effect.succeed({ action: 'Action', owner: 'Owner', due: 'Due' }),
      ),
    ),
    current: Schema.optionalKey(
      Schema.Int.check(
        Schema.isBetween(
          { minimum: 1, maximum: MAX_ACTIONS },
          { message: `Expected the number of an action, from 1 to ${MAX_ACTIONS}` },
        ),
      ),
    ),
    reveal: RevealField,
    chrome: chromeField(true),
  }),
  hints: {
    eyebrow: EYEBROW_HINT,
    actions:
      `List ${MIN_ACTIONS} to ${MAX_ACTIONS} actions, each with \`title\` (what will be done, ` +
      `up to ${ACTION_TITLE_MAX_CHARS} characters), \`owner\` (a person or team, up to ` +
      `${ACTION_OWNER_MAX_CHARS}) and \`due\` (a date or period, up to ${ACTION_DUE_MAX_CHARS}: ` +
      '"12 Dec 2026", "Q1 2027"). Keep each field to one line.',
    badge:
      `The inline label on the current action, up to ${ACTION_BADGE_MAX_CHARS} characters; ` +
      `defaults to "${DEFAULT_ACTION_BADGE}".`,
    labels:
      `Optional column labels: \`action\`, \`owner\` and \`due\`, each up to ` +
      `${ACTION_HEADING_MAX_CHARS} characters; defaults to "Action", "Owner" and "Due".`,
    current:
      `Write the number of the action in progress, from 1 to ${MAX_ACTIONS}, such as ` +
      '`current: 2`, or leave it out.',
    reveal: REVEAL_HINT,
    chrome: CHROME_HINT,
  },
  checks: (frontmatter) => currentProblems(frontmatter, frontmatter.actions, 'action'),
  title: { required: true, maxChars: ACTIONS_TITLE_MAX_CHARS },
  slots: {
    body: {
      description:
        'One sentence on the commitment these actions deliver. Put actions in `actions:`.',
      accepts: ['text'],
    },
    footnote: { description: 'A source or caveat on the bottom line.', accepts: ['text'] },
  },
  budget: { body: { maxWords: CONTEXT_MAX_WORDS }, footnote: { maxWords: 16 } },
  pptx: {
    type: 'title-only',
    placeholders: [
      { kind: 'title', from: { selector: '.kit-title' } },
      { kind: 'body', from: { slot: 'body' } },
    ],
  },
  example: {
    frontmatter: {
      title: 'Planting begins in March once crews are booked',
      eyebrow: 'Next actions',
      current: 2,
      badge: DEFAULT_ACTION_BADGE,
      labels: { action: 'Action', owner: 'Owner', due: 'Due' },
      actions: [
        { title: 'Confirm the east-side sites', owner: 'Dana Okafor', due: '12 Jan 2027' },
        { title: 'Book the planting crews', owner: 'Field operations', due: '26 Jan 2027' },
        { title: 'Open the warden sign-ups', owner: 'Community team', due: 'February 2027' },
      ],
    },
    body: [
      'Every action has one owner before the season begins.',
      '',
      '<Notes>',
      'Confirm each owner and date, then stop on booking the crews: that work is in progress.',
      '</Notes>',
      '',
    ].join('\n'),
  },
});
