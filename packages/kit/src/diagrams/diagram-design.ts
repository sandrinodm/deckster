/**
 * Horizontal placements available when a drawing has room around it.
 */
export const DIAGRAM_ALIGNS = ['left', 'center', 'right'] as const;

/**
 * A diagram's horizontal placement in its region.
 */
export type DiagramAlign = (typeof DIAGRAM_ALIGNS)[number];

/**
 * Outline and connector patterns.
 */
export const DIAGRAM_LINE_STYLES = ['solid', 'dashed', 'dotted'] as const;

/**
 * An outline or connector pattern.
 */
export type DiagramLineStyle = (typeof DIAGRAM_LINE_STYLES)[number];

/**
 * Brand typography steps available to supporting diagram text.
 */
export const DIAGRAM_TEXT_STEPS = ['caption', 'label', 'small', 'body'] as const;

/**
 * A brand typography step for supporting diagram text.
 */
export type DiagramTextStep = (typeof DIAGRAM_TEXT_STEPS)[number];

/**
 * The amount of horizontal room to leave before a drawing.
 */
export function alignedOffset(space: number, align: DiagramAlign): number {
  const available = Math.max(0, space);
  switch (align) {
    case 'left':
      return 0;
    case 'center':
      return available / 2;
    case 'right':
      return available;
  }
}

/**
 * Widths to apply to boxes when a brand or author sets dimensions. Nodes with no choice of their
 * own keep the intrinsic cap, except spanning cells which keep the width of their tracks.
 */
export function preferredNodeWidths(
  nodes: readonly { id: string; width?: number; cell?: { colSpan: number } }[],
  brandWidth: number,
  intrinsicWidth: number,
): Map<string, number> {
  if (brandWidth === 0 && !nodes.some((node) => node.width !== undefined)) {
    return new Map();
  }

  return new Map(
    nodes.flatMap((node) => {
      const intrinsic = (node.cell?.colSpan ?? 1) > 1 ? 0 : intrinsicWidth;
      const width = node.width ?? (brandWidth || intrinsic);
      return width > 0 ? [[node.id, width] as const] : [];
    }),
  );
}
