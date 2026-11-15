import type { FlowMetrics } from '#diagrams/flow-grid.ts';
import type { FlowSpec } from '#diagrams/flow-spec.ts';

import { buildFlowSpec, type FlowPart } from '#diagrams/flow-spec-builder.ts';

/**
 * Metrics close to the default brand's: 24px captions, 64px gutters.
 */
export const TEST_METRICS: FlowMetrics = {
  nodeMinWidth: 168,
  nodeMaxWidth: 336,
  nodeHeight: 96,
  gutterX: 64,
  gutterY: 64,
  groupPadding: 24,
  groupLabel: 37,
};

/**
 * A part of a flow, for building specs in tests.
 *
 * @param part - Which part.
 * @param props - Its props.
 * @param children - Nested parts.
 */
export function part(
  part: FlowPart['part'],
  props: Record<string, unknown>,
  children: FlowPart[] = [],
): FlowPart {
  return { part, props, children };
}

/**
 * A node part on the grid.
 *
 * @param id - The id.
 * @param col - The column.
 * @param row - The row.
 * @param extra - More props.
 */
export function node(
  id: string,
  col: number,
  row: number,
  extra: Record<string, unknown> = {},
): FlowPart {
  return part('Node', { id, title: id, col, row, ...extra });
}

/**
 * An edge part.
 *
 * @param from - The start node.
 * @param to - The end node.
 * @param extra - More props.
 */
export function edge(from: string, to: string, extra: Record<string, unknown> = {}): FlowPart {
  return part('Edge', { from, to, ...extra });
}

/**
 * The headline web stack: browser, cdn, gateway, orders, db in a row, a cache under the gateway and
 * a queue under the db, with a journey there and back.
 */
export function webStack(): FlowSpec {
  return buildFlowSpec([
    node('browser', 1, 1, { kind: 'client' }),
    node('cdn', 2, 1, { kind: 'cloud' }),
    part('Group', { label: 'VPC' }, [
      node('gateway', 3, 1, { kind: 'gateway' }),
      node('orders', 4, 1, { kind: 'service' }),
      node('db', 5, 1, { kind: 'database' }),
      node('cache', 3, 2, { kind: 'cache' }),
      node('queue', 5, 2, { kind: 'queue' }),
    ]),
    edge('browser', 'cdn', { label: 'HTTPS' }),
    edge('cdn', 'gateway'),
    edge('gateway', 'orders', { label: 'gRPC' }),
    edge('orders', 'db', { label: 'SQL' }),
    edge('orders', 'cache'),
    edge('orders', 'queue', { async: true }),
    part('Journey', { at: 1, path: 'browser cdn gateway orders db', back: true, focus: true }),
  ]);
}
