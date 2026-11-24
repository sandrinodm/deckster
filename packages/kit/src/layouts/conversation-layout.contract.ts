import { defineLayoutContract } from '@deckster/engine/layout';
import { Schema } from 'effect';

import {
  CHROME_HINT,
  chromeField,
  CONTEXT_MAX_WORDS,
  EYEBROW_HINT,
  EyebrowField,
  REVEAL_HINT,
  RevealField,
  textField,
} from '#layout-fields.ts';

/**
 * The fewest messages that make an exchange.
 */
export const MIN_MESSAGES = 2;

/**
 * The most messages a slide shows; longer transcripts belong on several slides.
 */
export const MAX_MESSAGES = 4;

/**
 * The longest speaker name, in characters, in the attribution column.
 */
export const MESSAGE_NAME_MAX_CHARS = 18;

/**
 * The longest optional speaker role, in characters, under the name.
 */
export const MESSAGE_ROLE_MAX_CHARS = 20;

/**
 * The longest message, in characters, in an exchange of two to four messages.
 */
export const MESSAGE_TEXT_MAX_CHARS = 112;

/**
 * The longest conversation title, in characters, kept on one fitted line.
 */
export const CONVERSATION_TITLE_MAX_CHARS = 50;

/**
 * The most words in the source or caveat below the transcript.
 */
const CONVERSATION_FOOTNOTE_MAX_WORDS = 16;

/**
 * One turn in the transcript, with the speaker and side always explicit.
 */
const ConversationMessage = Schema.Struct({
  name: textField(MESSAGE_NAME_MAX_CHARS, 'a speaker name'),
  side: Schema.Literals(['left', 'right']),
  text: textField(MESSAGE_TEXT_MAX_CHARS, 'a message'),
  role: Schema.optionalKey(textField(MESSAGE_ROLE_MAX_CHARS, 'a speaker role')),
});

/**
 * One decoded message as slide frontmatter writes it.
 */
export type ConversationMessageEntry = typeof ConversationMessage.Type;

/**
 * The contract of the `conversation` layout: a short transcript with our replies on the right.
 */
export const conversationLayoutContract = defineLayoutContract({
  name: 'conversation',
  description:
    'A chat transcript of two to four messages under a title that states what the exchange ' +
    'demonstrates. Write each turn in `messages:` with `name`, `side` (left or right) ' +
    'and `text`, plus an optional `role`. Left panels are neutral; right panels are our side ' +
    'on the lit surface (accent, or inverse on accent and gradient slides). Make the title about ' +
    'the right-hand replies. Speaker names and roles sit in a separate column at every size. ' +
    'Short exchanges grow in type to fill the region. Write each message as one ' +
    'paragraph; whitespace is collapsed. A speaker’s optional role appears on their first ' +
    'message. ' +
    'Speaker names and alignment identify the sides without relying ' +
    'on colour. ' +
    '`reveal: true` brings messages in one per click, keeping the final transcript in place ' +
    'for static slides and exports. Use it to show a customer exchange, an assistant interaction ' +
    "or a handover in the speakers' own words. Use quote for one person's testimony, steps for " +
    'a process without dialogue, proof for a customer result with numbers, and a sequence ' +
    'diagram for technical messages between systems.',
  schema: Schema.Struct({
    eyebrow: EyebrowField,
    messages: Schema.Array(ConversationMessage).check(
      Schema.isMinLength(MIN_MESSAGES, { message: `Expected at least ${MIN_MESSAGES} messages` }),
      Schema.isMaxLength(MAX_MESSAGES, { message: `Expected at most ${MAX_MESSAGES} messages` }),
    ),
    reveal: RevealField,
    chrome: chromeField(true),
  }),
  hints: {
    eyebrow: EYEBROW_HINT,
    messages:
      `List ${MIN_MESSAGES} to ${MAX_MESSAGES} messages in reading order. Each needs \`name\` ` +
      `(up to ${MESSAGE_NAME_MAX_CHARS} characters), \`side: left\` or \`side: right\` (our ` +
      `side), and \`text\` (up to ${MESSAGE_TEXT_MAX_CHARS} characters). Write each message ` +
      `as one paragraph; whitespace is collapsed. Optionally add \`role\` (up to ` +
      `${MESSAGE_ROLE_MAX_CHARS} characters), such as Customer or Assistant; shown on each ` +
      `speaker’s first message. Split longer exchanges across slides.`,
    reveal: REVEAL_HINT,
    chrome: CHROME_HINT,
  },
  title: { required: true, maxChars: CONVERSATION_TITLE_MAX_CHARS },
  slots: {
    body: {
      description: 'One sentence of context under the title. Put the transcript in `messages:`.',
      accepts: ['text'],
    },
    footnote: {
      description: 'A source or caveat on the bottom line, such as whether the exchange is staged.',
      accepts: ['text'],
    },
  },
  budget: {
    body: { maxWords: CONTEXT_MAX_WORDS },
    footnote: { maxWords: CONVERSATION_FOOTNOTE_MAX_WORDS },
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
      title: 'A request ends with a planting date',
      eyebrow: 'Resident services',
      messages: [
        { name: 'Maya', role: 'Resident', side: 'left', text: 'Can our street get a shade tree?' },
        {
          name: 'Dana',
          role: 'Programme lead',
          side: 'right',
          text: 'Yes. We survey the pavement, then book the next planting season.',
        },
      ],
    },
    body: [
      'The resident gets a next step in the same exchange.',
      '',
      '<Footnote>Illustrative exchange from the canopy programme.</Footnote>',
      '',
      '<Notes>',
      'Read the request, then the reply: the answer gives the resident something to act on.',
      '</Notes>',
      '',
    ].join('\n'),
  },
});
