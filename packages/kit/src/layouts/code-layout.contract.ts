import { defineLayoutContract } from '@deckster/engine/layout';
import { Schema } from 'effect';

import { CHROME_HINT, chromeField, EYEBROW_HINT, EyebrowField } from '#layouts/layout-fields.ts';

/**
 * The longest code title, in characters: one line at the smallest fit step in both brands, so the
 * code keeps the height.
 */
export const CODE_TITLE_MAX_CHARS = 48;

/**
 * The contract of the `code` layout: a title over a large code area, with notes beside it.
 */
export const codeLayoutContract = defineLayoutContract({
  name: 'code',
  description:
    'A title that states what the code shows, then a large code area: a fenced block, a ' +
    '<CodeMove> that animates between versions, or a <Terminal> session. Fill <Aside> with up to ' +
    'three short notes to set them beside the code. Keep code to at most 11 lines and 60 columns ' +
    'beside notes (90 without); longer lines step the font down to the brand minimum and then ' +
    'overflow, which `deckster lint` reports. In a <Terminal> each <Cmd> adds one step (the first at ' +
    "the Terminal's `at`, default 1, so step 0 shows only the prompt and cursor); a fence with " +
    '`{2|3-4}` adds one step per part. Use content for prose and split for a picture.',
  schema: Schema.Struct({ eyebrow: EyebrowField, chrome: chromeField(true) }),
  hints: { eyebrow: EYEBROW_HINT, chrome: CHROME_HINT },
  title: { required: true, maxChars: CODE_TITLE_MAX_CHARS },
  slots: {
    body: {
      description:
        'One code block: a fence with options (```ts title="app.ts" {2-4|7}), a <CodeMove> ' +
        'with a fence per version, or a <Terminal> (one step per <Cmd>, its <Out> lines following; ' +
        'step 0 shows only the prompt and cursor). At most 11 lines, 60 columns beside notes or ' +
        '90 without. Set the takeaway in `title:` (one line).',
      required: true,
      accepts: ['code'],
    },
    aside: {
      description:
        'Up to three short notes that explain the code: a few words each, as bullets or ' +
        'sentences. Anything longer belongs in speaker notes.',
      accepts: ['text', 'bullets'],
    },
    footnote: {
      description: 'A source or caveat on the bottom line, in a sentence or two.',
      accepts: ['text'],
    },
  },
  budget: {
    body: { maxLines: 11 },
    aside: { maxWords: 40, maxBullets: 3 },
    footnote: { maxWords: 30 },
  },
  pptx: {
    type: 'title-only',
    placeholders: [{ kind: 'title', from: { selector: '.kit-title' } }],
  },
  example: {
    frontmatter: { title: 'Auth runs before every route', eyebrow: 'Request flow' },
    body: [
      '```ts title="server.ts" {2|3-4}',
      'const app = createApp();',
      'app.use(cors());',
      'app.use(authenticate());',
      'app.use(rateLimit({ perMinute: 60 }));',
      'app.listen(3000);',
      '```',
      '',
      '<Aside>',
      '- Middleware runs in the order it is registered',
      '- `authenticate` rejects with 401 before any route code',
      '</Aside>',
      '',
      '<Notes>',
      'Press next twice: first the CORS line, then the two that guard every route.',
      '</Notes>',
      '',
    ].join('\n'),
  },
});
