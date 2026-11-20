import { deckCommand } from '@deckster/engine/command';
import { defineLayoutContract } from '@deckster/engine/layout';
import { Schema } from 'effect';

import { CHROME_HINT, chromeField, EYEBROW_HINT, EyebrowField } from '#layouts/layout-fields.ts';

/**
 * The longest demo title, in characters: one line at the smallest fit step in both brands, so the
 * demo keeps the height.
 */
export const DEMO_TITLE_MAX_CHARS = 48;

/**
 * The contract of the `demo` layout: a title over one large live region, with notes beside it.
 */
export const demoLayoutContract = defineLayoutContract({
  name: 'demo',
  description:
    'A title that states what the audience is about to watch, then one large region for a live ' +
    'demo: an <AppFrame> (a mini app or an external page) or a <Live> widget, filling all the ' +
    'space under the title. CommandDemo, GroundedAnswer, ReviewDiff and RunTrace have scripted ' +
    'steps and built-in stills. Fill <Aside> with up to three short notes to set them in a narrow ' +
    'column beside the demo. Supply an explicit poster for AppFrame and networked Live widgets.',
  schema: Schema.Struct({ eyebrow: EyebrowField, chrome: chromeField(true) }),
  hints: { eyebrow: EYEBROW_HINT, chrome: CHROME_HINT },
  title: { required: true, maxChars: DEMO_TITLE_MAX_CHARS },
  slots: {
    body: {
      description:
        'One <AppFrame>, <Live>, <CommandDemo>, <GroundedAnswer>, <ReviewDiff> or <RunTrace>. It ' +
        'fills the region. The app must exist under decks/<deck>/apps/ (`' +
        deckCommand() +
        ' new app`), or ' +
        'the build fails. Set what the audience should watch for in `title:` (one line).',
      required: true,
      accepts: ['component'],
    },
    aside: {
      description:
        'Up to three short notes beside the demo: what to look at, as a few words each, in ' +
        'bullets or sentences. Anything longer belongs in speaker notes.',
      accepts: ['text', 'bullets'],
    },
    footnote: {
      description: 'A source or caveat on the bottom line, in a sentence or two.',
      accepts: ['text'],
    },
  },
  budget: {
    aside: { maxWords: 34, maxBullets: 3 },
    footnote: { maxWords: 30 },
  },
  pptx: {
    type: 'title-only',
    placeholders: [{ kind: 'title', from: { selector: '.kit-title' } }],
  },
  example: {
    frontmatter: { title: 'Watch the agent call two tools, then answer', eyebrow: 'Live demo' },
    body: [
      '<Live label="Where the live demo goes">',
      '',
      '**The demo goes here.** Create a mini app with `' +
        deckCommand() +
        ' new app <deck> <name>`, then ' +
        'replace this placeholder with `<AppFrame app="<name>" poster=... chrome="window" />`.',
      '',
      '</Live>',
      '',
      '<Aside>',
      '- Tool calls appear as cards',
      '- The answer streams in last',
      '</Aside>',
      '',
      '<Notes>',
      'Say what to watch for before the demo starts, then let it run without talking over it.',
      '</Notes>',
      '',
    ].join('\n'),
  },
});
