import {
  defineLayoutContract,
  type FieldProblem,
  type LayoutVariant,
} from '@deckster/engine/layout';
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
 * The fewest people a team slide shows: two founders; one person is a `bio` slide.
 */
export const MIN_MEMBERS = 2;

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
 * The most people whose edge and past organisations a team slide shows: up to four columns leave
 * each person room for a line on why they are the right person.
 */
export const MAX_FOUNDERS = 4;

/**
 * The longest edge, in characters: what makes the person the right one for the work, in three lines
 * at the small size beside a portrait of two founders or under one in a row of four.
 */
export const MEMBER_EDGE_MAX_CHARS = 70;

/**
 * The most past organisations a person lists: three small marks on one line.
 */
export const MAX_PAST_ORGANISATIONS = 3;

/**
 * The longest past organisation name, in characters: the mark's alt text, and the name set in small
 * capitals when it has no file.
 */
export const PAST_ORGANISATION_MAX_CHARS = 24;

/**
 * The longest team title, in characters: two lines at the smallest fit step.
 */
export const TEAM_TITLE_MAX_CHARS = 56;

/**
 * An organisation a person worked at before: its name, and optionally its mark's file.
 */
const PastOrganisation = Schema.Struct({
  name: textField(PAST_ORGANISATION_MAX_CHARS, 'an organisation name'),
  src: Schema.optionalKey(Schema.NonEmptyString),
});

/**
 * One person: their name, what they do, and a photo, with the part of it to keep in view; on a
 * slide of two to four, optionally their edge and the organisations they come from.
 */
const Member = Schema.Struct({
  name: textField(MEMBER_NAME_MAX_CHARS, 'a name'),
  role: textField(MEMBER_ROLE_MAX_CHARS, 'a role'),
  photo: Schema.optionalKey(Schema.NonEmptyString),
  focal: FocalField,
  edge: Schema.optionalKey(textField(MEMBER_EDGE_MAX_CHARS, 'an edge')),
  previously: Schema.optionalKey(
    Schema.Array(PastOrganisation).check(
      Schema.isMinLength(1, { message: 'Expected at least 1 organisation' }),
      Schema.isMaxLength(MAX_PAST_ORGANISATIONS, {
        message: `Expected at most ${MAX_PAST_ORGANISATIONS} organisations`,
      }),
    ),
  ),
});

/**
 * One team member as a slide's frontmatter writes it, decoded.
 */
export type TeamMember = typeof Member.Type;

/**
 * The problems of a team of five or more that gives someone an edge or past organisations, which
 * only a slide of up to four shows.
 *
 * @param members - The people.
 */
export function teamProblems(members: readonly TeamMember[]): FieldProblem[] {
  if (members.length <= MAX_FOUNDERS) {
    return [];
  }

  return members.flatMap((member, index) =>
    (['edge', 'previously'] as const)
      .filter((field) => member[field] !== undefined)
      .map((field) => ({
        path: `members[${index}].${field}`,
        message:
          `A team of ${members.length} has no room for \`${field}\`; only a slide of two to ` +
          `${MAX_FOUNDERS} people shows it.`,
        fix:
          `Remove \`${field}\` from the members, or show the founders or leads on a slide of ` +
          `their own, two to ${MAX_FOUNDERS} of them.`,
      })),
  );
}

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
 * The contract of the `team` layout: the people behind the work, two to eight of them.
 */
export const teamLayoutContract = defineLayoutContract({
  name: 'team',
  description:
    'The people behind the work, two to eight of them, from `members:` in the frontmatter: a ' +
    'name, a role and a photo each. Three or four stand in one row of portraits; five or six ' +
    'sit in a grid of three, each name beside its portrait; seven or eight are a roster in two ' +
    'columns. For founders, two to four people can each carry an `edge` (one line on why they ' +
    'are the right person) and up to three past organisations (`previously:`, set as small ' +
    'marks in one tone); two founders, or a team of up to four with an edge, stand as larger ' +
    'portraits with those lines level across the slide. Photos are cropped to one shape in the ' +
    'brand image treatment, the face kept in view (`focal`); a person without a photo gets a ' +
    'tile with their initials. Use bio for one speaker, and a table for a larger group.',
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
      'photo to keep: `top`, `center 30%` for a face in the upper third, `40% 20%`). On a ' +
      `slide of two to ${MAX_FOUNDERS}, a person may add \`edge\` (why they are the right ` +
      `person, such as "Ran street works for Larkfield for 12 years", up to ` +
      `${MEMBER_EDGE_MAX_CHARS} characters) and \`previously\` (up to ` +
      `${MAX_PAST_ORGANISATIONS} organisations they come from, each \`{ name, src }\` with ` +
      `a name of up to ${PAST_ORGANISATION_MAX_CHARS} characters and its logo file); a team ` +
      'of five or more cannot show them.',
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
  checks: (frontmatter) => teamProblems(frontmatter.members),
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
      'For two to four founders, add why each is the right person and where they come from:',
      '    edge: Ran the city street works for twelve years',
      '    previously:',
      '      - { name: Larkfield City Council, src: assets/logos/larkfield.svg }',
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
