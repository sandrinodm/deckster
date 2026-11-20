import type { FieldProblem } from '@deckster/engine/layout';

import { defineLayoutContract } from '@deckster/engine/layout';
import { Schema } from 'effect';

import {
  CHROME_HINT,
  chromeField,
  EYEBROW_HINT,
  EyebrowField,
  RevealField,
  textField,
} from '#layouts/layout-fields.ts';

/**
 * The fewest stages that make a service journey.
 */
const MIN_STAGES = 2;

/**
 * The most stages that fit in one blueprint.
 */
const MAX_STAGES = 4;

/**
 * The longest title, in characters.
 */
const TITLE_MAX_CHARS = 60;

/**
 * The longest stage heading, in characters.
 */
const STAGE_MAX_CHARS = 24;

/**
 * The longest customer, frontstage, or backstage action, in characters.
 */
const ACTION_MAX_CHARS = 44;

/**
 * The longest owner name, in characters.
 */
const OWNER_MAX_CHARS = 24;

/**
 * The longest label for the handoff, in characters.
 */
const HANDOFF_MAX_CHARS = 26;

/**
 * One stage in the service, with its visible work, invisible work and accountable owner.
 */
const Stage = Schema.Struct({
  title: textField(STAGE_MAX_CHARS, 'a stage title'),
  customer: textField(ACTION_MAX_CHARS, 'a customer action'),
  frontstage: textField(ACTION_MAX_CHARS, 'a frontstage action'),
  backstage: textField(ACTION_MAX_CHARS, 'a backstage action'),
  owner: textField(OWNER_MAX_CHARS, 'a responsible owner'),
});

/**
 * One decoded column of the blueprint.
 */
export type ServiceBlueprintStage = typeof Stage.Type;

/**
 * The contract for a service blueprint divided by the line of visibility.
 */
export const serviceBlueprintLayoutContract = defineLayoutContract({
  name: 'service-blueprint',
  description:
    'Map two to four stages of a service for a single customer journey. Show the customer and ' +
    'frontstage actions above the line of visibility, then backstage work and the responsible ' +
    'owner below. Highlight the handoff that crosses the line and give it a short name.',
  schema: Schema.Struct({
    eyebrow: EyebrowField,
    stages: Schema.Array(Stage).check(
      Schema.isMinLength(MIN_STAGES, { message: 'Expected at least two service stages' }),
      Schema.isMaxLength(MAX_STAGES, { message: 'Expected at most four service stages' }),
    ),
    handoff: Schema.Struct({
      stage: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: MAX_STAGES })),
      label: textField(HANDOFF_MAX_CHARS, 'a handoff label'),
    }),
    reveal: RevealField,
    chrome: chromeField(true),
  }),
  hints: {
    eyebrow: EYEBROW_HINT,
    stages:
      `List ${MIN_STAGES} to ${MAX_STAGES} stages in order. Each stage needs a \`title\` (up to ` +
      `${STAGE_MAX_CHARS} characters), a \`customer\` action, visible \`frontstage\` work and ` +
      `internal \`backstage\` work (up to ${ACTION_MAX_CHARS} characters each), and an ` +
      `accountable \`owner\` (up to ${OWNER_MAX_CHARS} characters).`,
    handoff:
      'Set `stage` to the 1-based column where the handoff crosses the line of visibility. ' +
      `Use \`label\` to name what changes hands in up to ${HANDOFF_MAX_CHARS} characters.`,
    reveal:
      'Use `reveal: true` to start with the visible service. The first click exposes backstage ' +
      'work and the second exposes owners and highlights the handoff. Omit it to start with ' +
      'the whole blueprint visible.',
    chrome: CHROME_HINT,
  },
  checks: ({ stages, handoff }): FieldProblem[] => {
    if (handoff.stage <= stages.length) {
      return [];
    }

    return [
      {
        path: 'handoff.stage',
        message: `The handoff names stage ${handoff.stage}, but the service has ${stages.length} stages.`,
        fix: `Choose a stage from 1 to ${stages.length}.`,
      },
    ];
  },
  title: { required: true, maxChars: TITLE_MAX_CHARS },
  slots: {
    footnote: {
      description: 'An optional source or caveat below the blueprint.',
      accepts: ['text'],
    },
  },
  budget: { footnote: { maxWords: 24 } },
  pptx: {
    type: 'title-only',
    placeholders: [{ kind: 'title', from: { selector: '.kit-title' } }],
  },
  example: {
    frontmatter: {
      title: 'The desk owns the handoff to the repair team',
      eyebrow: 'Service blueprint',
      stages: [
        {
          title: 'Report',
          customer: 'Reports the breakage',
          frontstage: 'Desk opens a ticket',
          backstage: 'Checks asset records',
          owner: 'Service desk',
        },
        {
          title: 'Book',
          customer: 'Picks a repair time',
          frontstage: 'Desk confirms the visit',
          backstage: 'Technician accepts the job',
          owner: 'Repair lead',
        },
      ],
      handoff: { stage: 2, label: 'Confirmed job' },
      reveal: true,
    },
    body:
      '<Notes>Follow the customer across both stages. [click] Show the work behind the desk. ' +
      '[click] The repair lead accepts the confirmed job.</Notes>\n',
  },
});
