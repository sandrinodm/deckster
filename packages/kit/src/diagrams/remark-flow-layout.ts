import type { AutoPositions } from '#diagrams/elk-layout.ts';
import type { FlowSpec } from '#diagrams/flow-spec.ts';
import type { EstreeNode, MdastNode, MdxAttribute } from '#mdx/mdast.ts';

import { autoLayoutPositions } from '#diagrams/elk-layout.ts';
import { AUTO_LAYOUTS, FLOW_DIRECTIONS } from '#diagrams/flow-spec.ts';
import { attributeValue, findAttribute } from '#mdx/mdast.ts';

/**
 * The node size and spacing the build lays automatic diagrams out with, in canvas pixels: the
 * default brand's widest node (fourteen 24 px captions), a two-line node and the extra-large space.
 * The browser snaps layered and tree layouts to grid cells and stretches the others to fill the
 * space it is given, so only the arrangement matters, and it is the same in every brand.
 */
const BUILD_NODE = {
  /**
   * The node width.
   */
  width: 336,

  /**
   * The node height.
   */
  height: 96,

  /**
   * Room between nodes.
   */
  spacing: 64,
} as const;

/**
 * Lays out a `<Flow>` whose nodes have no grid cells at build time and adds the result as its
 * `positions` prop, so the browser places the nodes without loading ELK. The direction asked for
 * and the perpendicular fallback are both computed; the browser picks the one that fits its region.
 * Does nothing for a grid diagram, one with a `positions` prop already, or one whose `layout` or
 * `direction` is not a literal.
 *
 * @param node - The `<Flow>` element.
 * @param spec - Its declaration, read from literal props.
 */
export async function addBuildLayout(node: MdastNode, spec: FlowSpec): Promise<void> {
  const auto =
    spec.nodes.length > 0 && spec.nodes.every((candidate) => candidate.cell === undefined);
  if (!auto || findAttribute(node, 'positions') !== undefined) {
    return;
  }

  const algorithm = literalOf(node, 'layout', AUTO_LAYOUTS, 'layered');
  const direction = literalOf(node, 'direction', FLOW_DIRECTIONS, 'right');
  if (algorithm === undefined || direction === undefined) {
    return;
  }

  const positions = await autoLayoutPositions({
    spec,
    size: { width: BUILD_NODE.width, height: BUILD_NODE.height },
    algorithm,
    direction,
    spacing: BUILD_NODE.spacing,
  });
  node.attributes = [...(node.attributes ?? []), positionsAttribute(positions)];
}

/**
 * A literal prop's value when it is one of the allowed ones.
 *
 * @param node - The element.
 * @param name - The prop.
 * @param allowed - Its values.
 * @param fallback - Its default.
 * @returns The value; `undefined` when it is an expression or not allowed (the prop check reports
 *   that).
 */
function literalOf<Value extends string>(
  node: MdastNode,
  name: string,
  allowed: readonly Value[],
  fallback: Value,
): Value | undefined {
  if (findAttribute(node, name) === undefined) {
    return fallback;
  }

  const value = attributeValue(node, name);
  return allowed.find((candidate) => candidate === value);
}

/**
 * The `positions={{ right: { id: [x, y] } }}` attribute, as an expression MDX compiles.
 *
 * @param positions - Centres by direction.
 */
function positionsAttribute(positions: AutoPositions): MdxAttribute {
  const json = JSON.stringify(positions);
  return {
    type: 'mdxJsxAttribute',
    name: 'positions',
    value: {
      type: 'mdxJsxAttributeValueExpression',
      value: json,
      data: {
        estree: {
          type: 'Program',
          sourceType: 'module',
          comments: [],
          body: [{ type: 'ExpressionStatement', expression: estreeOf(positions) }],
        },
      },
    },
  };
}

/**
 * A JSON value as an estree expression.
 *
 * @param value - Objects, arrays, strings and numbers.
 */
function estreeOf(value: unknown): EstreeNode {
  if (Array.isArray(value)) {
    return { type: 'ArrayExpression', elements: value.map(estreeOf) };
  }

  if (typeof value === 'object' && value !== null) {
    return {
      type: 'ObjectExpression',
      properties: Object.entries(value).map(([key, inner]) => ({
        type: 'Property',
        kind: 'init',
        method: false,
        shorthand: false,
        computed: false,
        key: { type: 'Literal', value: key, raw: JSON.stringify(key) },
        value: estreeOf(inner),
      })),
    };
  }

  return { type: 'Literal', value, raw: JSON.stringify(value) };
}
