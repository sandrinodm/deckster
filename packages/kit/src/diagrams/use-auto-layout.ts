import { useEffect, useMemo, useRef, useState } from 'react';

import type { AutoPositions } from '#diagrams/elk-layout.ts';
import type { AutoLayout, FlowDirection, FlowSpec } from '#diagrams/flow-spec.ts';
import type { Point } from '#diagrams/geometry.ts';

/**
 * What an automatic layout is computed from.
 */
export type AutoLayoutRequest = {
  /**
   * The diagram.
   */
  spec: FlowSpec;

  /**
   * A stable key for the diagram, so the layout runs again only when it changes.
   */
  key: string;

  /**
   * The node size to keep clear.
   */
  size: { width: number; height: number };

  /**
   * The algorithm.
   */
  algorithm: AutoLayout;

  /**
   * Which way it flows.
   */
  direction: FlowDirection;

  /**
   * Room between nodes.
   */
  spacing: number;

  /**
   * Layouts the build already computed (MDX with literal props): when given, ELK is never loaded.
   */
  positions?: AutoPositions;
};

/**
 * One automatic layout to try: its direction and each node's centre.
 */
export type AutoCandidate = {
  /**
   * The direction it flows in.
   */
  direction: FlowDirection;

  /**
   * Each node's centre, in the layout's own coordinates.
   */
  centres: Map<string, Point>;
};

/**
 * The automatic layouts of a diagram whose nodes have no grid cells, best first: the direction
 * asked for, then the perpendicular fallback. MDX slides get them from the build (`positions`), so
 * the browser never loads ELK for them; TSX slides run ELK, a lazy chunk loaded the first time a
 * slide needs it. A layout that fails leaves the result undefined and reports the error, so the
 * slide shows it instead of waiting forever.
 *
 * @param request - The diagram and layout settings; `undefined` when no automatic layout is needed.
 * @returns The candidates; `undefined` while ELK runs or when no layout was asked for.
 */
export function useAutoLayout(request: AutoLayoutRequest | undefined): AutoCandidate[] | undefined {
  const [result, setResult] = useState<{ key: string; candidates: AutoCandidate[] }>();
  const [failure, setFailure] = useState<Error>();
  const positionsKey = request?.positions === undefined ? '' : JSON.stringify(request.positions);
  const prepared = useMemo(
    () =>
      positionsKey === '' ? undefined : candidatesOf(JSON.parse(positionsKey) as AutoPositions),
    [positionsKey],
  );
  const key = request === undefined || prepared !== undefined ? undefined : layoutKeyOf(request);
  const pending = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (request === undefined || key === undefined || pending.current === key) {
      return;
    }

    pending.current = key;
    const laidOut = import('#diagrams/elk-layout.ts').then(({ autoLayoutPositions }) =>
      autoLayoutPositions({
        spec: request.spec,
        size: request.size,
        algorithm: request.algorithm,
        direction: request.direction,
        spacing: request.spacing,
      }),
    );
    laidOut
      .then((positions) => {
        if (pending.current === key) {
          setResult({ key, candidates: candidatesOf(positions) });
        }
      })
      .catch((error: unknown) => {
        if (pending.current === key) {
          setFailure(error instanceof Error ? error : new Error(String(error)));
        }
      });
  }, [key, request]);
  useEffect(
    () => () => {
      pending.current = undefined;
    },
    [],
  );
  if (failure !== undefined) {
    throw new Error(
      `The automatic layout of a <Flow> failed: ${failure.message}. ` +
        'Give the nodes grid cells (col, row) instead.',
    );
  }

  if (prepared !== undefined) {
    return prepared;
  }

  return result !== undefined && result.key === key ? result.candidates : undefined;
}

/**
 * The key an automatic layout is cached under: the diagram, the algorithm, the direction, the node
 * size rounded to whole pixels and the spacing. A change to any of them runs ELK again.
 *
 * @param request - The layout request.
 */
function layoutKeyOf(request: AutoLayoutRequest): string {
  const width = Math.round(request.size.width);
  const height = Math.round(request.size.height);
  return [
    request.key,
    request.algorithm,
    request.direction,
    `${width}x${height}`,
    String(request.spacing),
  ].join('|');
}

/**
 * Positions as candidates, in the order they were computed.
 *
 * @param positions - Centres by direction.
 */
export function candidatesOf(positions: AutoPositions): AutoCandidate[] {
  return (Object.entries(positions) as [FlowDirection, Record<string, [number, number]>][]).map(
    ([direction, centres]) => ({
      direction,
      centres: new Map(Object.entries(centres).map(([id, [x, y]]) => [id, { x, y }])),
    }),
  );
}
