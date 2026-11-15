import { describe, expect, it } from 'vite-plus/test';

import {
  assertDiagramProps,
  checkDiagramProps,
  DIAGRAM_COMPONENT_NAMES,
  DIAGRAM_PROPS,
  normalizeState,
  type DiagramComponentName,
} from '#diagrams/diagram-props.ts';
import {
  AUTO_LAYOUTS,
  DIAGRAM_STATES,
  EDGE_ARROWS,
  EDGE_ROUTES,
  FLOW_DIRECTIONS,
  PACKET_ROLES,
  PACKET_SIZES,
  PACKET_SPEEDS,
} from '#diagrams/flow-spec.ts';

/**
 * The messages of the problems a props object has.
 *
 * @param component - The tag.
 * @param props - The props.
 */
function messages(component: DiagramComponentName, props: Record<string, unknown>): string[] {
  return checkDiagramProps(component, props).map((problem) => `${problem.message} ${problem.fix}`);
}

describe('checkDiagramProps', () => {
  it('names the nearest prop for a misspelt one, and lists the props', () => {
    const [lable] = messages('Edge', { from: 'a', to: 'b', lable: 'SQL' });
    expect(lable).toContain('`lable` is not a prop of <Edge>; did you mean `label`?');
    expect(lable).toContain('Use one of its props: id, from, to, label');
    expect(messages('Node', { id: 'a', titel: 'API' })[0]).toContain('did you mean `title`?');
  });

  it.each([
    ['State', { is: 'broken' }, 'state', 'highlighted'],
    ['Node', { id: 'a', state: 'broken' }, 'state', 'highlighted'],
    ['Packet', { role: 'purple' }, 'role', 'accent'],
    ['Packet', { speed: 'warp' }, 'speed', 'fast'],
    ['Packet', { size: 'huge' }, 'size', 'lg'],
    ['Flow', { title: 'x', layout: 'circular' }, 'layout', 'radial'],
    ['Edge', { from: 'a', to: 'b', route: 'zigzag' }, 'route', 'curved'],
  ] as const)('rejects <%s> %o, listing the allowed values', (component, props, noun, allowed) => {
    const [message] = messages(component, props);
    expect(message).toContain(`is not a ${noun}`);
    expect(message).toContain(allowed);
  });

  it('accepts the state synonyms and reads them as the state they mean', () => {
    expect(messages('State', { is: 'highlight' })).toEqual([]);
    expect(messages('Node', { id: 'a', state: 'fail' })).toEqual([]);
    expect(normalizeState('highlight')).toBe('highlighted');
    expect(normalizeState('fail')).toBe('error');
    expect(normalizeState('ok')).toBe('success');
    expect(normalizeState('dim')).toBe('muted');
    expect(normalizeState('error')).toBe('error');
  });

  it('suggests the nearest value for a typo', () => {
    expect(messages('Edge', { from: 'a', to: 'b', route: 'curvd' })[0]).toContain(
      'did you mean "curved"?',
    );
  });

  it('reports a value of the wrong kind', () => {
    expect(messages('Node', { id: 'a', col: '2' })[0]).toContain('takes number, not a string');
  });

  it('checks the fields of the object form of <Edge flow>', () => {
    const problems = messages('Edge', { from: 'a', to: 'b', flow: { cuont: 2, speed: 'warp' } });
    expect(problems[0]).toContain('`cuont` is not a field of <Edge flow>; did you mean `count`?');
    expect(problems[1]).toContain('is not a speed');
  });

  it('reports required props left out, unless a spread may supply them', () => {
    expect(messages('Edge', { from: 'a' })[0]).toContain('<Edge> needs `to`.');
    expect(checkDiagramProps('Edge', { from: 'a' }, { partial: true })).toEqual([]);
  });

  it('takes any content for a ReactNode prop, a string included', () => {
    expect(
      checkDiagramProps('Milestone', { date: 'Q1', title: 'Split', children: 'Orders live' }),
    ).toEqual([]);
    expect(checkDiagramProps('Node', { id: 'a', children: ['one', 'two'] })).toEqual([]);
  });

  it('ignores key, ref and data-* props', () => {
    expect(messages('Node', { id: 'a', key: 'k', 'data-deck-source': 'x.mdx:1:1' })).toEqual([]);
  });

  it('accepts the build-written positions on a <Flow> and an icon component in TSX', () => {
    expect(messages('Flow', { title: 'x', positions: { a: { x: 0, y: 0 } } })).toEqual([]);
    expect(messages('Node', { id: 'a', icon: () => null })).toEqual([]);
    expect(messages('Node', { id: 'a', icon: 'none' })).toEqual([]);
  });

  it('throws every problem for a TSX element', () => {
    expect(() => assertDiagramProps('Edge', { from: 'a', to: 'b', lable: 'x' })).toThrow(
      'did you mean `label`?',
    );
  });
});

describe('DIAGRAM_PROPS', () => {
  it('describes every component and part', () => {
    expect(DIAGRAM_COMPONENT_NAMES).toEqual([
      'Flow',
      'Node',
      'Group',
      'Edge',
      'Packet',
      'Journey',
      'Hop',
      'State',
      'Focus',
      'SequenceDiagram',
      'Actor',
      'Message',
      'Timeline',
      'Milestone',
      'Layers',
      'Layer',
      'Item',
      'Cycle',
      'Tree',
      'Svg',
    ]);
  });

  it('takes its fixed sets from the spec, so the validator and the renderer agree', () => {
    expect(DIAGRAM_PROPS.Node.state?.values).toEqual(DIAGRAM_STATES);
    expect(DIAGRAM_PROPS.State.is?.values).toEqual(DIAGRAM_STATES);
    expect(DIAGRAM_PROPS.Packet.role?.values).toEqual(PACKET_ROLES);
    expect(DIAGRAM_PROPS.Packet.speed?.values).toEqual(PACKET_SPEEDS);
    expect(DIAGRAM_PROPS.Packet.size?.values).toEqual(PACKET_SIZES);
    expect(DIAGRAM_PROPS.Edge.route?.values).toEqual(EDGE_ROUTES);
    expect(DIAGRAM_PROPS.Edge.arrow?.values).toEqual(EDGE_ARROWS);
    expect(DIAGRAM_PROPS.Flow.layout?.values).toEqual(AUTO_LAYOUTS);
    expect(DIAGRAM_PROPS.Flow.direction?.values).toEqual(FLOW_DIRECTIONS);
  });

  it('marks every diagram title as required and keeps build-only props out', () => {
    for (const name of ['Flow', 'SequenceDiagram', 'Timeline', 'Layers', 'Cycle', 'Tree', 'Svg']) {
      expect(DIAGRAM_PROPS[name as DiagramComponentName].title?.required).toBe(true);
    }

    expect(DIAGRAM_PROPS.Flow).not.toHaveProperty('positions');
  });
});

describe('numbers outside their limits', () => {
  it('rejects a particle count, a grid row or a step the renderer cannot take', () => {
    expect(messages('Packet', { from: 'a', to: 'b', count: 1e9 })[0]).toContain(
      'count={1000000000}',
    );
    expect(messages('Node', { id: 'a', row: 100_000 })[0]).toContain('row={100000}');
    expect(messages('Packet', { from: 'a', to: 'b', at: Number.NaN })[0]).toContain('at={NaN}');
    expect(messages('Edge', { from: 'a', to: 'b', flow: { count: 1e9 } })).toEqual([
      expect.stringContaining('count={1000000000}'),
    ]);
    expect(messages('Packet', { from: 'a', to: 'b', count: 24, at: 3 })).toEqual([]);
  });
});

describe('names that are properties of every object', () => {
  const NAMES = ['constructor', 'toString', '__proto__', 'hasOwnProperty'];
  it.each(NAMES)('does not take `%s` as a prop, a state synonym or a flow field', (name) => {
    expect(messages('Node', { id: 'a', [name]: 'x' })[0]).toContain(`\`${name}\` is not a prop`);
    expect(messages('Edge', { from: 'a', to: 'b', flow: { [name]: 1 } })[0]).toContain(
      `\`${name}\` is not a field`,
    );
    expect(normalizeState(name)).toBe(name);
    expect(messages('Node', { id: 'a', state: name })[0]).toContain('is not a state');
  });
});
