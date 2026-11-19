import type { FieldProblem } from '@deckster/engine/layout';

import { defineLayoutContract } from '@deckster/engine/layout';
import { Schema } from 'effect';

import {
  CHROME_HINT,
  chromeField,
  EYEBROW_HINT,
  EyebrowField,
  textField,
} from '#layouts/layout-fields.ts';

/**
 * The longest title, in characters.
 */
const TITLE_MAX_CHARS = 60;

/**
 * The longest opening prompt, in characters.
 */
const PROMPT_MAX_CHARS = 100;

/**
 * The longest branch name, in characters.
 */
const BRANCH_NAME_MAX_CHARS = 34;

/**
 * The fewest actions in a short workflow.
 */
const MIN_ACTIONS = 2;

/**
 * The most actions in a short workflow.
 */
const MAX_ACTIONS = 3;

/**
 * The longest button label, in characters.
 */
const ACTION_MAX_CHARS = 32;

/**
 * The longest scenario, action description, or result, in characters.
 */
const DETAIL_MAX_CHARS = 88;

/**
 * One action that advances the workflow, with context describing what it does.
 */
const Action = Schema.Struct({
  action: textField(ACTION_MAX_CHARS, 'a verb-led action'),
  detail: textField(DETAIL_MAX_CHARS, 'a workflow step description'),
});

/**
 * One of the two workflows and its outcome.
 */
const Branch = Schema.Struct({
  name: textField(BRANCH_NAME_MAX_CHARS, 'a branch name'),
  situation: textField(DETAIL_MAX_CHARS, 'the situation that leads to the branch'),
  steps: Schema.Array(Action).check(
    Schema.isMinLength(MIN_ACTIONS, { message: 'Expected at least two actions in each branch' }),
    Schema.isMaxLength(MAX_ACTIONS, { message: 'Expected at most three actions in each branch' }),
  ),
  outcome: textField(DETAIL_MAX_CHARS, 'the outcome of the branch'),
});

/**
 * One decoded workflow of the branching demo.
 */
export type ChoosePathBranch = typeof Branch.Type;

/**
 * The contract for a browser demo with two selectable workflows and a static summary of both.
 */
export const choosePathLayoutContract = defineLayoutContract({
  name: 'choose-path',
  description:
    'Let the audience choose one of two short workflows from the same prompt. ' +
    'Each choice opens its own actions and outcome. Return to the choices at any time. ' +
    'A static poster summarises both workflows and outcomes for previews and exports.',
  schema: Schema.Struct({
    eyebrow: EyebrowField,
    prompt: textField(PROMPT_MAX_CHARS, 'the choice prompt'),
    branches: Schema.Tuple([Branch, Branch]),
    chrome: chromeField(true),
  }),
  hints: {
    eyebrow: EYEBROW_HINT,
    prompt: `Ask which case or action to explore, in up to ${PROMPT_MAX_CHARS} characters.`,
    branches:
      'Write exactly 2 workflows, each with a distinct `name` (up to ' +
      `${BRANCH_NAME_MAX_CHARS} characters), a \`situation\` and an \`outcome\` (up to ` +
      `${DETAIL_MAX_CHARS} characters each). Give each branch ${MIN_ACTIONS} to ${MAX_ACTIONS} ` +
      '`steps`. Each pairs a verb-led `action` that fits on a button (up to ' +
      `${ACTION_MAX_CHARS} characters) with an explanatory \`detail\` (up to ${DETAIL_MAX_CHARS} ` +
      'characters).',
    chrome: CHROME_HINT,
  },
  checks: ({ branches }): FieldProblem[] => {
    const [first, second] = branches;
    if (first.name.trim().toLowerCase() !== second.name.trim().toLowerCase()) {
      return [];
    }

    return [
      {
        path: 'branches[1].name',
        message: 'The two workflows have the same name.',
        fix: 'Give each choice a short name that identifies its workflow.',
      },
    ];
  },
  title: { required: true, maxChars: TITLE_MAX_CHARS },
  slots: {
    footnote: {
      description: 'Brief source or caveat, such as that the outcomes are illustrated.',
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
      title: 'How should we handle this service request?',
      eyebrow: 'Interactive demo',
      prompt: 'Choose which request to try.',
      branches: [
        {
          name: 'A broken sprinkler',
          situation: 'A resident reports water pooling on the pavement.',
          steps: [
            { action: 'Check the location', detail: 'Match the postcode to a city-owned asset.' },
            { action: 'Send an urgent crew', detail: 'Alert the crew on duty and assign the job.' },
          ],
          outcome: 'The duty crew accepts an urgent repair job.',
        },
        {
          name: 'A new street tree',
          situation: 'A resident asks for shade outside their building.',
          steps: [
            { action: 'Check the planting list', detail: 'Find the next survey for that street.' },
            { action: 'Book a survey', detail: 'Send the resident the next available date.' },
          ],
          outcome: 'The resident gets a date for a pavement survey.',
        },
      ],
    },
    body: '<Notes>Ask the room which request to try first. Walk through both actions, then return to the choices.</Notes>\n',
  },
});
