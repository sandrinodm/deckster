import type { ReactNode } from 'react';

import { Notes } from '@deckster/engine';
import { Edge, Flow, Journey, Node, State } from '@deckster/kit/diagrams';

/**
 * Read by the build without running the slide, so it must stay a literal.
 */
export const frontmatter = {
  layout: 'diagram',
  surface: 'inverse',
  title: 'Every deploy passes the same three gates, defined once in code',
  eyebrow: 'Written in TSX',
  budget: '1m',
};

/**
 * The gates between a merge and production, as the pipeline config lists them.
 */
const GATES = [
  { id: 'tests', kind: 'function', title: 'Tests', subtitle: 'Unit and contract' },
  { id: 'canary', kind: 'service', title: 'Canary', subtitle: '5% of traffic, 20 min' },
  { id: 'approval', kind: 'user', title: 'Approval', subtitle: 'On-call engineer' },
] as const;

/**
 * The deploy pipeline drawn from the same list the pipeline runs: a TSX slide maps the data to
 * nodes and edges with no grid cells, so the automatic layout places them (ELK loads for this slide
 * only), and the kind icons resolve at run time.
 */
export default function DeployGates(): ReactNode {
  const ids = ['merge', ...GATES.map((gate) => gate.id), 'production'];
  return (
    <>
      <Flow title="A merge passing tests, a canary and an approval before production">
        <Node id="merge" kind="document" title="Merge" subtitle="main branch" />
        {GATES.map((gate) => (
          <Node
            key={gate.id}
            id={gate.id}
            kind={gate.kind}
            title={gate.title}
            subtitle={gate.subtitle}
          />
        ))}
        <Node id="production" kind="cloud" title="Production" subtitle="3 regions" />
        {ids.slice(1).map((id, index) => (
          <Edge key={id} from={ids[index] ?? 'merge'} to={id} />
        ))}
        <Journey at={1} path={ids} />
        <State node="canary" at={2} until={3} is="highlighted" badge="Watching errors" />
      </Flow>
      <Notes>
        This slide is TSX: the gates come from the same list the pipeline config uses, so the
        picture cannot drift from the pipeline. Walk the release through one gate per click.
      </Notes>
    </>
  );
}
