import { deckCommand } from '@deckster/engine/command';
import { defineLayoutContract } from '@deckster/engine/layout';
import { Schema } from 'effect';

import { CHROME_HINT, chromeField, EYEBROW_HINT, EyebrowField } from '#layout-fields.ts';

/**
 * The longest diagram title, in characters: two lines at the smallest fit step in both brands.
 */
export const DIAGRAM_TITLE_MAX_CHARS = 90;

/**
 * The contract of the `diagram` layout: a takeaway title over one diagram that fills the slide.
 */
export const diagramLayoutContract = defineLayoutContract({
  name: 'diagram',
  description:
    'A title that states what the diagram shows ("Every checkout crosses four hops"), then one ' +
    'diagram filling the space under it: <Flow> (nodes, edges, packets, journeys), ' +
    '<SequenceDiagram>, <Timeline>, <Layers>, <Cycle>, <Tree> or an <Svg> (`' +
    deckCommand() +
    ' diagrams` ' +
    'lists them). Fill <Aside> with what to notice, in a sentence or a few bullets, to set it in ' +
    'a column beside the diagram. Use split when the diagram needs a paragraph beside it.',
  schema: Schema.Struct({ eyebrow: EyebrowField, chrome: chromeField(true) }),
  hints: { eyebrow: EYEBROW_HINT, chrome: CHROME_HINT },
  title: { required: true, maxChars: DIAGRAM_TITLE_MAX_CHARS },
  slots: {
    body: {
      description:
        'One diagram component, nothing else; it fills the region. Write the takeaway in ' +
        '`title:`, and reveal or animate parts with `at` steps instead of extra text.',
      required: true,
      accepts: ['diagram', 'component'],
    },
    aside: {
      description:
        'What to notice beside the diagram: a ### heading and a sentence, or up to three short ' +
        'bullets.',
      accepts: ['text', 'bullets'],
    },
    footnote: {
      description: 'A source or caveat on the bottom line, in a sentence or two.',
      accepts: ['text'],
    },
  },
  budget: {
    aside: { maxWords: 40, maxBullets: 3 },
    footnote: { maxWords: 30 },
  },
  pptx: {
    type: 'title-only',
    placeholders: [{ kind: 'title', from: { selector: '.kit-title' } }],
  },
  example: {
    frontmatter: { title: 'Every checkout crosses three hops', eyebrow: 'Request path' },
    body: [
      '<Flow title="Checkout request path">',
      '  <Node id="web" kind="client" title="Web app" col={1} row={1} />',
      '  <Node id="api" kind="service" title="Orders API" col={2} row={1} />',
      '  <Node id="db" kind="database" title="Orders DB" subtitle="Postgres" col={3} row={1} />',
      '  <Edge from="web" to="api" label="HTTPS" />',
      '  <Edge from="api" to="db" label="SQL" />',
      '  <Journey at={1} path="web api db" back />',
      '</Flow>',
      '',
      '<Notes>',
      'Step through the hops: the request goes out, the rows come back.',
      '</Notes>',
      '',
    ].join('\n'),
  },
});
