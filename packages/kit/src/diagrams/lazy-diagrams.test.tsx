import { describe, expect, it } from 'vite-plus/test';

import { flowSteps } from '#diagrams/choreography.ts';
import { parseFlowChildren } from '#diagrams/flow-children.ts';
import { Edge, Hop, Journey, Node, Packet, State } from '#diagrams/flow-parts.tsx';
import { declaredSteps } from '#diagrams/lazy-diagrams.tsx';

describe('declaredSteps', () => {
  it('declares the steps the loaded <Flow> registers, before its code arrives', () => {
    const children = (
      <>
        <Node id="a" title="A" col={1} row={1} />
        <Node id="b" title="B" col={2} row={1} at={2} />
        <Node id="c" title="C" col={3} row={1} />
        <Edge from="a" to="b" />
        <Edge from="b" to="c" />
        <Journey at={1} path="a b c" back />
        <Packet from="a" to="b" at={7} />
        <State node="c" at={9} is="error" />
        <Journey at={10}>
          <Hop from="a" to="b" />
          <Hop from="b" to="c" at={12} />
        </Journey>
      </>
    );
    const expected = flowSteps(parseFlowChildren(children).spec);
    expect(declaredSteps({ title: 'A flow', children }).sort((x, y) => x - y)).toEqual(
      [...expected].sort((x, y) => x - y),
    );
  });

  it('declares a stepped cycle one step per stage and an <Svg> its steps', () => {
    const stages = [1, 2, 3].map((n) => <Node key={n} id={`s${n}`} title={`S${n}`} />);
    expect(declaredSteps({ title: 'Loop', steps: true, children: stages })).toEqual([1, 2, 3]);
    expect(declaredSteps({ title: 'Plan', steps: { dock: 1, sorter: 3 } })).toEqual([1, 3]);
  });
});
