import { defineLayoutContract, type FieldProblem } from '@deckster/engine/layout';
import { Schema } from 'effect';

import {
  CHROME_HINT,
  chromeField,
  ContactItem,
  contactsHint,
  EYEBROW_HINT,
  EyebrowField,
} from '#layout-fields.ts';
import { displayUrl } from '#links/link-target.ts';

/**
 * The longest closing title, in characters: two lines of display type beside the QR code at the
 * smallest fit step.
 */
export const CLOSING_TITLE_MAX_CHARS = 40;

/**
 * The most contacts a closing slide lists under its rule.
 */
export const MAX_CLOSING_CONTACTS = 3;

/**
 * The longest contact with three contacts, in characters: one line in a third of the row at the
 * caption size.
 */
export const CLOSING_CONTACT_MAX_CHARS_IN_THREE = 32;

/**
 * The longest QR link, in characters: `https://www.` and the longest address the caption takes.
 * Longer links make a dense code; shorten them.
 */
export const QR_MAX_CHARS = 56;

/**
 * The longest address under the QR code as it is shown (no scheme, no `www.`), in characters: two
 * lines at the caption size in the code's three columns.
 */
export const QR_ADDRESS_MAX_CHARS = 44;

/**
 * The longest part of that address between slashes and dots, in characters: the address breaks only
 * there, so each part must fit one line.
 */
export const QR_SEGMENT_MAX_CHARS = 22;

/**
 * The places an address breaks: at each slash and each dot, which is where its parts end.
 */
const ADDRESS_PART_SEPARATOR_PATTERN = /[/.]/u;

/**
 * Problems with a QR link that the schema cannot see: its address as shown is too long for two
 * lines under the code, or has a part too long for one.
 *
 * @param qr - The decoded `qr:`, if any.
 * @returns The problems, at the `qr` path.
 */
export function qrProblems(qr: string | undefined): FieldProblem[] {
  if (qr === undefined) {
    return [];
  }

  const address = displayUrl(qr);
  const parts = address.split(ADDRESS_PART_SEPARATOR_PATTERN);
  const longest = parts.reduce((most, part) => Math.max(most, part.length), 0);
  const fix =
    'Use a shorter link the room can type, such as a short domain or a redirect ' +
    '(`https://larkfield.example/canopy`).';
  if (address.length > QR_ADDRESS_MAX_CHARS) {
    return [
      {
        path: 'qr',
        message:
          `The address under the code, ${address}, has ${address.length} characters; it ` +
          `takes at most ${QR_ADDRESS_MAX_CHARS} to stay on two lines.`,
        fix,
      },
    ];
  }

  return longest > QR_SEGMENT_MAX_CHARS
    ? [
        {
          path: 'qr',
          message:
            `The address under the code, ${address}, has a part of ${longest} characters ` +
            `between its slashes and dots; one line takes at most ${QR_SEGMENT_MAX_CHARS}.`,
          fix,
        },
      ]
    : [];
}

/**
 * What a QR link must look like: a web address, which every phone camera opens, with no spaces.
 */
const QR_URL_PATTERN = /^https?:\/\/[^\s/]+\.[^\s]+$/iu;

/**
 * The contract of the `closing` layout: the last slide, with what to do next and how to follow up.
 */
export const closingLayoutContract = defineLayoutContract({
  name: 'closing',
  description:
    'The last slide: the one thing to remember or do, set large, a line under it, and how to ' +
    'follow up: up to three `contacts:` under a rule and a `qr:` code for the slides or a ' +
    'sign-up page. For questions, title it with the question you want ("What should we plant ' +
    'first?") or "Questions", and list where to send them. Use it once, last; use title for the ' +
    'cover and statement for a claim mid-talk. Defaults to the gradient surface and hides the ' +
    'page chrome; the brand logo sits top left.',
  schema: Schema.Struct({
    eyebrow: EyebrowField,
    contacts: Schema.optionalKey(
      Schema.Array(ContactItem).check(
        Schema.isMaxLength(MAX_CLOSING_CONTACTS, {
          message: `Expected at most ${MAX_CLOSING_CONTACTS} contacts`,
        }),
      ),
    ),
    qr: Schema.optionalKey(
      Schema.NonEmptyString.check(
        Schema.isPattern(QR_URL_PATTERN, {
          message: 'Expected a web address that starts with https:// or http://',
        }),
        Schema.isMaxLength(QR_MAX_CHARS, {
          message: `Expected a link of at most ${QR_MAX_CHARS} characters`,
        }),
      ),
    ),
    chrome: chromeField(false),
  }),
  hints: {
    eyebrow: EYEBROW_HINT,
    contacts: contactsHint(MAX_CLOSING_CONTACTS),
    qr:
      'Give the web address the room should open on their phones, starting with https://, up to ' +
      `${QR_MAX_CHARS} characters, for example \`qr: https://larkfield.example/canopy\`; it is ` +
      `drawn as a QR code with the address under it, which takes up to ${QR_ADDRESS_MAX_CHARS} ` +
      `characters without the scheme and \`www.\`, and parts of up to ${QR_SEGMENT_MAX_CHARS} ` +
      'between its slashes and dots.',
    chrome: CHROME_HINT,
  },
  checks: (frontmatter) => qrProblems(frontmatter.qr),
  title: { required: true, maxChars: CLOSING_TITLE_MAX_CHARS },
  slots: {
    body: {
      description: 'One line under the title: what to do next, or the ask in a sentence.',
      accepts: ['text'],
    },
  },
  budget: {
    body: { maxWords: 20 },
  },
  variants: [
    {
      name: 'three contacts',
      when: { counts: { contacts: MAX_CLOSING_CONTACTS } },
      budget: {},
      // A third of the row each, at the caption size, one line each.
      fields: { 'contacts[].text': { maxChars: CLOSING_CONTACT_MAX_CHARS_IN_THREE } },
    },
  ],
  surface: 'gradient',
  pptx: {
    type: 'title',
    placeholders: [
      { kind: 'title', from: { selector: '.kit-closing-title' } },
      { kind: 'subtitle', from: { slot: 'body' } },
    ],
  },
  example: {
    frontmatter: {
      title: 'Plant where it is hottest first',
      eyebrow: 'Thank you',
      qr: 'https://larkfield.example/canopy',
      contacts: [
        {
          label: 'Email',
          text: 'canopy@larkfield.example',
          href: 'mailto:canopy@larkfield.example',
        },
        {
          label: 'Slides',
          text: 'larkfield.example/canopy',
          href: 'https://larkfield.example/canopy',
        },
      ],
    },
    body: [
      'Approve the ten-year line so the first 600 trees go in this spring.',
      '',
      '<Notes>',
      'Stop on this slide for questions; the QR code takes them to the full plan.',
      '</Notes>',
      '',
    ].join('\n'),
  },
});
