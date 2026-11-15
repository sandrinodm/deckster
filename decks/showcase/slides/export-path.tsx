import type { ReactNode } from 'react';

import { Notes } from '@deckster/engine';
import { Edge, Flow, Journey, Node, State } from '@deckster/kit/diagrams';

/**
 * Read by the build without running the slide, so it must stay a literal.
 */
export const frontmatter = {
  layout: 'diagram',
  title: 'Export decides shape by shape: native where faithful, a picture where not',
  eyebrow: 'PDF and PowerPoint, written in TSX',
  budget: '1m15s',
};

/**
 * The step after the per-shape decision highlight ends.
 */
const DECISION_HIGHLIGHT_END_STEP = 3;

/**
 * The stages of a PowerPoint export, in order, as the exporter runs them.
 */
const STAGES = [
  { id: 'slide', kind: 'client', title: 'Slide', subtitle: 'On screen' },
  { id: 'scene', kind: 'function', title: 'Collect', subtitle: 'Text, boxes, charts' },
  { id: 'plan', kind: 'function', title: 'Plan', subtitle: 'Native or picture' },
  { id: 'pptx', kind: 'document', title: 'PPTX', subtitle: 'A master per surface' },
] as const;

/**
 * The export pipeline drawn from a list: a TSX slide maps the data to nodes and edges with no grid
 * cells, so the automatic layout places them, and the kind icons resolve at run time.
 */
export default function ExportPath(): ReactNode {
  const ids = STAGES.map((stage) => stage.id);
  return (
    <>
      <Flow
        title="A slide measured on screen, planned shape by shape and written as a PowerPoint file"
        direction="right">
        {STAGES.map((stage) => (
          <Node
            key={stage.id}
            id={stage.id}
            kind={stage.kind}
            title={stage.title}
            subtitle={stage.subtitle}
          />
        ))}
        <Node id="pdf" kind="document" title="PDF" subtitle="Chromium's pages" />
        {ids.slice(1).map((id, index) => (
          <Edge key={id} from={ids[index] ?? 'slide'} to={id} />
        ))}
        <Edge from="slide" to="pdf" />
        <Journey at={1} path={ids} />
        <State
          node="plan"
          at={2}
          until={DECISION_HIGHLIGHT_END_STEP}
          is="highlighted"
          badge="Per shape"
        />
      </Flow>
      <Notes>
        The PDF is easy: Chromium prints the pages. PowerPoint is the interesting one. [click] The
        exporter measures the slide on screen: every line of text, every box, every chart. [click]
        Then it plans, shape by shape. Text becomes editable text in a real placeholder, a chart
        becomes a native chart, and only what PowerPoint cannot draw faithfully becomes a picture.
        [click] The result is a file your colleagues can edit, with one master per brand surface.
        This slide is a TSX file: the boxes are mapped from a list and laid out automatically.
        Transition: how much of this deck survived as native shapes?
      </Notes>
    </>
  );
}
