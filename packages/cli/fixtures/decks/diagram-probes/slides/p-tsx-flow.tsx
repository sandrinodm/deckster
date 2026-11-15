import type { ReactNode } from 'react';

import { Notes } from '@deckster/engine';
import { Edge, Flow, Journey, Node } from '@deckster/kit/diagrams';

/**
 * Read by the build without running the slide, so it must stay a literal.
 */
export const frontmatter = {
  /**
   * The layout.
   */
  layout: 'diagram',

  /**
   * The takeaway title.
   */
  title: 'A diagram written in TSX draws like one written in MDX',

  /**
   * The eyebrow over the title.
   */
  eyebrow: 'TSX probe',
};

/**
 * A three-node flow written in TSX, with kind icons resolved at run time.
 */
export default function TsxFlow(): ReactNode {
  return (
    <>
      <Flow title="A request from the browser to the database, written in TSX">
        <Node id="web" kind="client" title="Browser" col={1} row={1} />
        <Node id="api" kind="service" title="Orders API" col={2} row={1} />
        <Node id="db" kind="database" title="Orders DB" col={3} row={1} />
        <Edge from="web" to="api" label="HTTPS" />
        <Edge from="api" to="db" label="SQL" />
        <Journey at={1} path="web api db" back />
      </Flow>
      <Notes>The icons come from the node kinds although no build step saw this slide.</Notes>
    </>
  );
}
