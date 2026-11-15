import { describe, expect, it } from 'vite-plus/test';

import type { MdastNode } from '#mdx/mdast.ts';

import { remarkKitDiagrams } from '#diagrams/remark-diagrams.ts';
import { jsxElement } from '#mdx/mdast.ts';

/**
 * A JSX element. String values become string attributes, `true` a bare attribute, and numbers
 * literal expressions, as MDX writes `col={1}`.
 *
 * @param name - The element name.
 * @param attributes - The attributes.
 * @param children - Child elements.
 */
function element(
  name: string,
  attributes: Record<string, string | number | true>,
  children: MdastNode[] = [],
): MdastNode {
  return jsxElement(
    name,
    Object.entries(attributes).map(([key, value]) => literalAttribute(key, value)),
    children,
  );
}

/**
 * A literal fixture attribute, with `true` represented by a bare JSX attribute.
 *
 * @param name - The attribute name.
 * @param value - Its literal value.
 */
function literalAttribute(
  name: string,
  value: string | number | true,
): NonNullable<MdastNode['attributes']>[number] {
  if (typeof value === 'number') {
    return numberLiteral(name, value);
  }

  return { type: 'mdxJsxAttribute', name, value: value === true ? null : value };
}

/**
 * A number attribute as the MDX parser leaves `name={value}`.
 *
 * @param name - The attribute name.
 * @param value - The number.
 */
function numberLiteral(name: string, value: number): NonNullable<MdastNode['attributes']>[number] {
  return {
    type: 'mdxJsxAttribute',
    name,
    value: {
      type: 'mdxJsxAttributeValueExpression',
      value: String(value),
      data: {
        estree: {
          type: 'Program',
          sourceType: 'module',
          comments: [],
          body: [{ type: 'ExpressionStatement', expression: { type: 'Literal', value } }],
        },
      },
    },
  };
}

/**
 * Runs the plugin on a tree and collects its failure, the failure's fix and the warnings.
 *
 * @param root - The tree.
 * @param set - The brand's icon set.
 */
function run(
  root: MdastNode,
  set = 'lucide',
): { failure: string | undefined; fix: string | undefined; warnings: string[] } {
  const warnings: string[] = [];
  let failure: string | undefined;
  let fix: string | undefined;
  try {
    void remarkKitDiagrams({ set })(root, {
      message: (reason) => warnings.push(reason),
      fail: (reason) => {
        failure = reason;
        throw new Error(reason);
      },
    });
  } catch (error) {
    fix = (error as { note?: string }).note;
  }

  return { failure, fix, warnings };
}

/**
 * A flow with a title around parts.
 *
 * @param children - Its parts.
 */
function flow(children: MdastNode[]): MdastNode {
  return element('Flow', { title: 'A flow' }, children);
}

/**
 * The failure of a tree holding one element.
 *
 * @param node - The element.
 */
function failureOf(node: MdastNode): string | undefined {
  return run({ type: 'root', children: [node] }).failure;
}

describe('remarkKitDiagrams', () => {
  it("imports a kind's icon from the brand's set", () => {
    const root: MdastNode = {
      type: 'root',
      children: [flow([element('Node', { id: 'db', kind: 'database' })])],
    };
    run(root);
    expect(root.children?.[0]?.value).toBe('import kitDiagramIcon0 from "~icons/lucide/database"');
  });

  it('uses the other set’s name for the same kind', () => {
    const root: MdastNode = {
      type: 'root',
      children: [flow([element('Node', { id: 'svc', kind: 'service' })])],
    };
    run(root, 'tabler');
    expect(root.children?.[0]?.value).toBe('import kitDiagramIcon0 from "~icons/tabler/server-2"');
  });

  it('keeps icon="none" as written, so the component draws no kind icon', () => {
    const node = element('Node', { id: 'db', kind: 'database', icon: 'none' });
    run({ type: 'root', children: [flow([node])] });
    expect(node.attributes?.find((attribute) => attribute.name === 'icon')?.value).toBe('none');
  });

  it('fails the build on an unknown kind with the nearest kind', () => {
    const { failure, fix } = run({
      type: 'root',
      children: [flow([element('Node', { id: 'x', kind: 'databse' })])],
    });
    expect(failure).toContain('<Node kind="databse"> is not a node kind; did you mean "database"?');
    expect(fix).toContain('database');
  });

  it('reports a bad icon on a node as the node’s icon, with close matches', () => {
    const failure = failureOf(flow([element('Node', { id: 'x', icon: 'databse' })]));
    expect(failure).toBe(
      '<Node id="x" icon="databse"> is not in the lucide icon set. Close matches: database.',
    );
  });

  it('fails the build on an unknown node id in an edge, with the fix', () => {
    const { failure, fix } = run({
      type: 'root',
      children: [
        flow([
          element('Node', { id: 'api', col: 1, row: 1 }),
          element('Node', { id: 'db', col: 2, row: 1 }),
          element('Edge', { from: 'api', to: 'dbb' }),
        ]),
      ],
    });
    expect(failure).toContain('<Edge to="dbb"> names "dbb"');
    expect(fix).toContain('Use one of the node ids');
  });

  it('fails the build on something a <Flow> cannot hold', () => {
    expect(failureOf(flow([element('Image', { src: 'x' })]))).toContain('it found <Image>');
  });

  it('fails the build on misspelt props, with the nearest prop', () => {
    expect(failureOf(flow([element('Node', { id: 'a', titel: 'API' })]))).toBe(
      '`titel` is not a prop of <Node>; did you mean `title`?',
    );
    expect(
      failureOf(
        flow([
          element('Node', { id: 'a' }),
          element('Node', { id: 'b' }),
          element('Edge', { from: 'a', to: 'b', lable: 'SQL' }),
        ]),
      ),
    ).toBe('`lable` is not a prop of <Edge>; did you mean `label`?');
  });

  it.each([
    ['State', { node: 'a', is: 'broken' }, '<State is="broken"> is not a state'],
    ['Node', { id: 'b', state: 'broken' }, '<Node state="broken"> is not a state'],
    ['Packet', { from: 'a', to: 'b', role: 'purple' }, '<Packet role="purple"> is not a role'],
    ['Packet', { from: 'a', to: 'b', speed: 'warp' }, '<Packet speed="warp"> is not a speed'],
    ['Packet', { from: 'a', to: 'b', size: 'huge' }, '<Packet size="huge"> is not a size'],
    ['Edge', { from: 'a', to: 'b', route: 'zigzag' }, '<Edge route="zigzag"> is not a route'],
  ] as const)('fails the build on <%s> with a value outside its set', (name, props, expected) => {
    const failure = failureOf(
      flow([element('Node', { id: 'a' }), element('Node', { id: 'b' }), element(name, props)]),
    );
    expect(failure).toContain(expected);
  });

  it('fails the build on a layout outside the set, with the allowed values', () => {
    const { failure, fix } = run({
      type: 'root',
      children: [
        element('Flow', { title: 'Auto', layout: 'circular' }, [element('Node', { id: 'a' })]),
      ],
    });
    expect(failure).toBe('<Flow layout="circular"> is not a layout.');
    expect(fix).toBe('Use one of: layered, tree, force, radial.');
  });

  it('accepts the state synonyms the catalog names', () => {
    const failure = failureOf(
      flow([
        element('Node', { id: 'a', state: 'highlight' }),
        element('State', { node: 'a', at: 1, is: 'fail' }),
      ]),
    );
    expect(failure).toBeUndefined();
  });

  it('fails the build on a diagram without a title, and on an empty <Flow>', () => {
    expect(failureOf(element('Flow', {}, [element('Node', { id: 'a' })]))).toBe(
      '<Flow> needs `title`.',
    );
    expect(failureOf(flow([]))).toBe('<Flow title="A flow"> has no <Node>s, so it draws nothing.');
  });

  it('fails the build on a sequence message to an unknown actor, with the nearest', () => {
    const failure = failureOf(
      element('SequenceDiagram', { title: 'Calls' }, [
        element('Actor', { id: 'web' }),
        element('Actor', { id: 'api' }),
        element('Message', { from: 'web', to: 'apii' }),
      ]),
    );
    expect(failure).toBe(
      '<Message from="web" to="apii"> names "apii", which is not an <Actor>; did you mean "api"?',
    );
  });

  it('fails the build on a sequence part outside its diagram, or a stranger inside', () => {
    expect(failureOf(element('Message', { from: 'a', to: 'b' }))).toBe(
      '<Message from="a" to="b"> sits outside a diagram.',
    );
    expect(
      failureOf(element('SequenceDiagram', { title: 'Calls' }, [element('Node', { id: 'a' })])),
    ).toBe('<SequenceDiagram title="Calls"> holds only <Actor>, <Message>; it found <Node>.');
  });

  it('fails the build on a tree with something other than nodes, in full', () => {
    const failure = failureOf(
      element('Tree', { title: 'Repo' }, [
        element('Node', { id: 'root' }, [element('Edge', { from: 'root', to: 'x' })]),
      ]),
    );
    expect(failure).toBe('<Node id="root"> holds only <Node>; it found <Edge>.');
  });

  it('fails the build on duplicate tree ids', () => {
    const failure = failureOf(
      element('Tree', { title: 'Repo' }, [
        element('Node', { id: 'root' }, [
          element('Node', { id: 'a' }),
          element('Node', { id: 'a' }),
        ]),
      ]),
    );
    expect(failure).toBe('Two <Node>s have the id "a".');
  });

  it('fails the build on a timeline or layer holding the wrong parts', () => {
    expect(
      failureOf(element('Timeline', { title: 'Plan' }, [element('Layer', { title: 'x' })])),
    ).toBe('<Timeline title="Plan"> holds only <Milestone>; it found <Layer>.');
    expect(
      failureOf(
        element('Layers', { title: 'Stack' }, [
          element('Layer', { title: 'Data' }, [element('Milestone', { date: 'Q1', title: 'x' })]),
        ]),
      ),
    ).toBe('<Layer title="Data"> holds only <Item>; it found <Milestone>.');
  });

  it('ignores data-* props, which dev tools stamp on elements', () => {
    expect(
      failureOf(flow([element('Node', { id: 'a', 'data-deck-source': 'slides/x.mdx:3:1' })])),
    ).toBeUndefined();
  });

  it('leaves a valid flow alone', () => {
    const valid = flow([
      element('Node', { id: 'a' }),
      element('Node', { id: 'b' }),
      element('Edge', { from: 'a', to: 'b' }),
    ]);
    expect(run({ type: 'root', children: [valid] }).failure).toBeUndefined();
  });
});

describe('remarkKitDiagrams build-time layout', () => {
  it('lays an automatic <Flow> out at build time and passes the result as `positions`', async () => {
    const node = element('Flow', { title: 'Auto', direction: 'down' }, [
      element('Node', { id: 'a', title: 'A' }),
      element('Node', { id: 'b', title: 'B' }),
      element('Node', { id: 'c', title: 'C' }),
      element('Edge', { from: 'a', to: 'b' }),
      element('Edge', { from: 'b', to: 'c' }),
    ]);
    const file = {
      message: () => undefined,
      fail: (reason: string): never => {
        throw new Error(reason);
      },
    };
    await remarkKitDiagrams({ set: 'lucide' })({ type: 'root', children: [node] }, file);
    const attribute = node.attributes?.find((candidate) => candidate.name === 'positions');
    const value = attribute?.value;
    expect(typeof value === 'object' && value !== null ? value.type : undefined).toBe(
      'mdxJsxAttributeValueExpression',
    );
    const positions = JSON.parse(
      typeof value === 'object' && value !== null ? value.value : '{}',
    ) as Record<string, Record<string, [number, number]>>;
    expect(Object.keys(positions)).toEqual(['down', 'right']);
    const down = positions['down'] ?? {};
    expect((down['a']?.[1] ?? 0) < (down['b']?.[1] ?? 0)).toBe(true);
    expect((down['b']?.[1] ?? 0) < (down['c']?.[1] ?? 0)).toBe(true);
  });

  it('leaves a grid <Flow> without `positions`', () => {
    const node = flow([element('Node', { id: 'a', title: 'A', col: 1, row: 1 })]);
    const result = remarkKitDiagrams({ set: 'lucide' })(
      { type: 'root', children: [node] },
      {
        message: () => undefined,
        fail: (reason: string): never => {
          throw new Error(reason);
        },
      },
    );
    expect(result).toBeUndefined();
    expect(node.attributes?.some((candidate) => candidate.name === 'positions')).toBe(false);
  });
});
