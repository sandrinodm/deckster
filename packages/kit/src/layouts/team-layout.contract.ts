import { defineLayoutContract, type LayoutVariant } from '@deckster/engine/layout';
import { Schema } from 'effect';

import {
  CHROME_HINT,
  chromeField,
  EYEBROW_HINT,
  EyebrowField,
  FocalField,
  textField,
  TREATMENT_HINT,
  TreatmentField,
  CONTEXT_MAX_WORDS,
} from '#layouts/layout-fields.ts';

/**
 * The fewest people a team slide shows; one person is a `bio` slide.
 */
export const MIN_MEMBERS = 3;

/**
 * The most people a team slide shows; a larger team is grouped, or named in a table.
 */
export const MAX_MEMBERS = 8;

/**
 * The longest name, in characters: two lines under a portrait in a row of four.
 */
export const MEMBER_NAME_MAX_CHARS = 32;

/**
 * The longest role, in characters: two lines under a portrait in a row of four.
 */
export const MEMBER_ROLE_MAX_CHARS = 56;

/**
 * The longest name beside a portrait in a grid or a roster, in characters: two lines.
 */
export const MEMBER_NAME_MAX_CHARS_GRID = 24;

/**
 * The longest role beside a portrait in a grid of five or six, in characters: two lines.
 */
export const MEMBER_ROLE_MAX_CHARS_GRID = 30;

/**
 * The longest role in a roster of seven or eight, in characters: one line beside the portrait.
 */
export const MEMBER_ROLE_MAX_CHARS_ROSTER = 26;

/**
 * The longest team title, in characters: two lines at the smallest fit step.
 */
export const TEAM_TITLE_MAX_CHARS = 56;

/**
 * One person: their name, what they do, and a photo, with the part of it to keep in view.
 */
const Member = Schema.Struct({
  name: textField(MEMBER_NAME_MAX_CHARS, 'a name'),
  role: textField(MEMBER_ROLE_MAX_CHARS, 'a role'),
  photo: Schema.optionalKey(Schema.NonEmptyString),
  focal: FocalField,
});

/**
 * One team member as a slide's frontmatter writes it, decoded.
 */
export type TeamMember = typeof Member.Type;

/**
 * The variants of a team of five or more: a grid of three to a row for five or six, whose text sits
 * beside each portrait in a third of the width, and a roster in two columns for seven or eight,
 * which leaves each person one line for the role.
 */
const TEAM_VARIANTS: readonly LayoutVariant[] = [
  {
    name: 'grid of 5 or 6',
    when: { counts: { members: { min: 5, max: 6 } } },
    budget: {},
    fields: {
      'members[].name': { maxChars: MEMBER_NAME_MAX_CHARS_GRID },
      'members[].role': { maxChars: MEMBER_ROLE_MAX_CHARS_GRID },
    },
  },
  {
    name: 'roster of 7 or 8',
    when: { counts: { members: { min: 7, max: 8 } } },
    budget: {},
    fields: {
      'members[].name': { maxChars: MEMBER_NAME_MAX_CHARS_GRID },
      'members[].role': { maxChars: MEMBER_ROLE_MAX_CHARS_ROSTER },
    },
  },
];

/**
 * The contract of the `team` layout: the people behind the work, three to eight of them.
 */
export const teamLayoutContract = defineLayoutContract({
  name: 'team',
  description:
    'The people behind the work, three to eight of them, from `members:` in the frontmatter: a ' +
    'name, a role and a photo each. Three or four stand in one row of portraits; five or six ' +
    'sit in a grid of three, each name beside its portrait; seven or eight are a roster in two ' +
    'columns. Photos are cropped to one shape in the brand image treatment, the face kept in ' +
    'view (`focal`); a person without a photo gets a tile with their initials. Use bio for one ' +
    'speaker, and a table for a larger group.',
  schema: Schema.Struct({
    eyebrow: EyebrowField,
    members: Schema.Array(Member).check(
      Schema.isMinLength(MIN_MEMBERS, { message: `Expected at least ${MIN_MEMBERS} members` }),
      Schema.isMaxLength(MAX_MEMBERS, { message: `Expected at most ${MAX_MEMBERS} members` }),
    ),
    treatment: TreatmentField,
    chrome: chromeField(true),
  }),
  hints: {
    eyebrow: EYEBROW_HINT,
    members:
      `List ${MIN_MEMBERS} to ${MAX_MEMBERS} people, each with \`name\` (up to ` +
      `${MEMBER_NAME_MAX_CHARS} characters, ${MEMBER_NAME_MAX_CHARS_GRID} in a grid or a ` +
      `roster), \`role\` (up to ${MEMBER_ROLE_MAX_CHARS}, ${MEMBER_ROLE_MAX_CHARS_GRID} in a ` +
      `grid, ${MEMBER_ROLE_MAX_CHARS_ROSTER} in a roster of seven or eight), and optionally ` +
      '`photo` ' +
      '(a file in the deck folder, such as assets/dana.jpg) and `focal` (the part of the ' +
      'photo to keep: `top`, `center 30%` for a face in the upper third, `40% 20%`).',
    treatment: TREATMENT_HINT,
    chrome: CHROME_HINT,
  },
  title: { required: true, maxChars: TEAM_TITLE_MAX_CHARS },
  slots: {
    body: {
      description:
        'One sentence under the title on what the team does together. Name the people in ' +
        '`members:`, not here.',
      accepts: ['text'],
    },
    footnote: {
      description: 'A note on the bottom line, such as who to contact.',
      accepts: ['text'],
    },
  },
  budget: {
    body: { maxWords: CONTEXT_MAX_WORDS },
    footnote: { maxWords: 16 },
  },
  variants: TEAM_VARIANTS,
  pptx: {
    type: 'title-only',
    placeholders: [
      { kind: 'title', from: { selector: '.kit-title' } },
      { kind: 'body', from: { slot: 'body' } },
    ],
  },
  example: {
    comments: [
      'Give each member a photo from the deck folder, such as:',
      '  - name: Dana Okafor',
      '    photo: assets/people/dana-okafor.jpg',
      '    focal: center 30%',
    ],
    frontmatter: {
      title: 'Four people run the planting programme',
      eyebrow: 'The team',
      members: [
        { name: 'Dana Okafor', role: 'Programme lead, Urban Forestry', focal: 'center 30%' },
        { name: 'Tomás Reyes', role: 'Senior arborist' },
        { name: 'Mariam Haddad', role: 'Public health liaison' },
        { name: 'Kwame Asante', role: 'Community organiser, Eastgate' },
      ],
    },
    body: [
      'Planting, aftercare and the residents who water the young trees.',
      '',
      '<Notes>',
      'Name each person and what they own; the committee will meet Tomás on site.',
      '</Notes>',
      '',
    ].join('\n'),
  },
});
