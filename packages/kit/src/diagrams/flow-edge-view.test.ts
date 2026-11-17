import { describe, expect, it } from 'vite-plus/test';

import { arrowHead } from '#diagrams/flow-edge-view.tsx';

/**
 * A straight path from the left to the right, ending at x 100.
 */
const SEGMENTS = [{ kind: 'line', from: { x: 0, y: 50 }, to: { x: 100, y: 50 } }] as const;

describe('arrowHead', () => {
  it('draws a closed triangle with its tip on the end by default', () => {
    const d = arrowHead(SEGMENTS, 'end', 2);
    expect(d).toBe(arrowHead(SEGMENTS, 'end', 2, 'triangle'));
    expect(d.startsWith('M100 50L')).toBe(true);
    expect(d.endsWith('Z')).toBe(true);
  });

  it('draws an open chevron whose corner sits half a line back, so its stroke ends at the tip', () => {
    const d = arrowHead(SEGMENTS, 'end', 4, 'open');
    expect(d).not.toContain('Z');
    expect(d).toContain('L98 50L');
  });

  it('draws a dot whose edge touches the tip', () => {
    const d = arrowHead(SEGMENTS, 'end', 2, 'dot');
    expect(d).toContain('a3.2 3.2 0 1 0 6.4 0');
    expect(d.startsWith('M93.6 50')).toBe(true);
  });
});
