import type { DescribedShape } from '#diagrams/diagram-description.ts';
import type { Rect } from '#diagrams/geometry.ts';
import type { CardShape, CardTokens } from '#diagrams/node-cards.ts';
import type { NodeShape } from '#diagrams/node-kinds.ts';

import { round2 } from '#diagrams/geometry.ts';

/**
 * A node's outline and the lines that give its shape away, as SVG path data.
 */
export type ShapeGeometry = {
  /**
   * The outline, filled and stroked.
   */
  outline: string;

  /**
   * A copy of the outline drawn behind, offset, for stacked shapes; empty for others.
   */
  under: string;

  /**
   * Detail strokes drawn on top (a cylinder's rim, a window's title bar), not filled.
   */
  details: string;

  /**
   * The nearest PowerPoint preset, for exporters.
   */
  described: DescribedShape;

  /**
   * The corner radius the outline uses.
   */
  radius: number;

  /**
   * Room the shape takes from the content box at each side, so text and icons stay clear of curved
   * ends and cut corners.
   */
  inset: { top: number; right: number; bottom: number; left: number };

  /**
   * Whether the outline is dashed.
   */
  dashed: boolean;
};

/**
 * The largest corner radius of a pill-shaped node, in pixels: a tall node keeps soft corners
 * instead of turning into a circle.
 */
const PILL_RADIUS_MAX = 44;

/**
 * The height of a client window's title bar, in pixels.
 */
const WINDOW_BAR = 14;

/**
 * How far a stacked shape's back layer is offset, in pixels.
 */
const STACK_OFFSET = 6;

/**
 * The gap between a double outline's two lines, in pixels.
 */
const DOUBLE_INSET = 5;

/**
 * Builds the geometry of a node's shape in its box.
 *
 * @param shape - The kind's shape.
 * @param rect - The node's box.
 * @param radius - The brand's corner radius for nodes.
 */
export function shapeGeometry(shape: NodeShape, rect: Rect, radius: number): ShapeGeometry {
  const { x, y, width: w, height: h } = rect;
  const r = Math.min(radius, h / 2, w / 2);
  const none = { top: 0, right: 0, bottom: 0, left: 0 };
  const base = { under: '', details: '', radius: r, inset: none, dashed: false };
  switch (shape) {
    case 'card':
      return { ...base, outline: roundRect(rect, r), described: 'roundRect' };
    case 'dashed':
      return { ...base, outline: roundRect(rect, r), described: 'roundRect', dashed: true };
    case 'pill': {
      const round = Math.min(h / 2, PILL_RADIUS_MAX);
      return {
        ...base,
        outline: roundRect(rect, round),
        described: round === h / 2 ? 'pill' : 'roundRect',
        radius: round,
      };
    }

    case 'soft': {
      const soft = Math.min(Math.max(r * 2.5, 18), h / 2);
      return { ...base, outline: roundRect(rect, soft), described: 'roundRect', radius: soft };
    }
    case 'device': {
      const big = Math.min(h / 2, Math.max(r * 2, 14));
      const notch = Math.min(w * 0.14, 36);
      return {
        ...base,
        outline: roundRect(rect, big),
        details: `M${n(x + w / 2 - notch / 2)} ${n(y + 7)}H${n(x + w / 2 + notch / 2)}`,
        described: 'roundRect',
        radius: big,
        inset: { ...none, top: 4 },
      };
    }

    case 'window': {
      const bar = y + WINDOW_BAR;
      const dots = [0, 1, 2]
        .map((index) => circle(x + 12 + index * 9, y + WINDOW_BAR / 2, 2))
        .join('');
      return {
        ...base,
        outline: roundRect(rect, r),
        details: `M${n(x)} ${n(bar)}H${n(x + w)}${dots}`,
        described: 'roundRect',
        inset: { ...none, top: WINDOW_BAR },
      };
    }

    case 'cylinder': {
      const ry = Math.min(h * 0.11, 10);
      const rx = w / 2;
      return {
        ...base,
        outline:
          `M${n(x)} ${n(y + ry)}A${n(rx)} ${n(ry)} 0 0 1 ${n(x + w)} ${n(y + ry)}` +
          `V${n(y + h - ry)}A${n(rx)} ${n(ry)} 0 0 1 ${n(x)} ${n(y + h - ry)}Z`,
        details: `M${n(x)} ${n(y + ry)}A${n(rx)} ${n(ry)} 0 0 0 ${n(x + w)} ${n(y + ry)}`,
        described: 'can',
        radius: 0,
        inset: { ...none, top: ry * 2, bottom: ry * 0.5 },
      };
    }

    case 'pipe': {
      const ry = h / 2;
      const rx = Math.min(w * 0.06, 12);
      return {
        ...base,
        outline:
          `M${n(x + rx)} ${n(y)}H${n(x + w - rx)}` +
          `A${n(rx)} ${n(ry)} 0 0 1 ${n(x + w - rx)} ${n(y + h)}` +
          `H${n(x + rx)}A${n(rx)} ${n(ry)} 0 0 1 ${n(x + rx)} ${n(y)}Z`,
        details: `M${n(x + w - rx)} ${n(y)}A${n(rx)} ${n(ry)} 0 0 0 ${n(x + w - rx)} ${n(y + h)}`,
        described: 'pipe',
        radius: 0,
        inset: { ...none, left: rx * 0.6, right: rx * 2 },
      };
    }

    case 'hexagon': {
      const d = Math.min(h * 0.32, 26);
      return {
        ...base,
        outline:
          `M${n(x + d)} ${n(y)}H${n(x + w - d)}L${n(x + w)} ${n(y + h / 2)}` +
          `L${n(x + w - d)} ${n(y + h)}H${n(x + d)}L${n(x)} ${n(y + h / 2)}Z`,
        described: 'hexagon',
        radius: 0,
        inset: { ...none, left: d * 0.7, right: d * 0.7 },
      };
    }

    case 'chamfer': {
      const c = Math.min(h * 0.18, 14);
      return {
        ...base,
        outline:
          `M${n(x + c)} ${n(y)}H${n(x + w - c)}L${n(x + w)} ${n(y + c)}V${n(y + h - c)}` +
          `L${n(x + w - c)} ${n(y + h)}H${n(x + c)}L${n(x)} ${n(y + h - c)}V${n(y + c)}Z`,
        described: 'octagon',
        radius: 0,
      };
    }

    case 'stack':
      return {
        ...base,
        outline: roundRect(rect, r),
        under: roundRect({ ...rect, x: x + STACK_OFFSET, y: y - STACK_OFFSET }, r),
        described: 'roundRect',
      };
    case 'double': {
      const inner = {
        x: x + DOUBLE_INSET,
        y: y + DOUBLE_INSET,
        width: w - 2 * DOUBLE_INSET,
        height: h - 2 * DOUBLE_INSET,
      };
      return {
        ...base,
        outline: roundRect(rect, r),
        details: roundRect(inner, Math.max(r - DOUBLE_INSET / 2, 0)),
        described: 'roundRect',
      };
    }

    case 'folded': {
      const f = Math.min(h * 0.24, 20);
      return {
        ...base,
        outline: `M${n(x)} ${n(y)}H${n(x + w - f)}L${n(x + w)} ${n(y + f)}V${n(y + h)}H${n(x)}Z`,
        details: `M${n(x + w - f)} ${n(y)}V${n(y + f)}H${n(x + w)}`,
        described: 'foldedCorner',
        radius: 0,
        inset: { ...none, right: f * 0.5 },
      };
    }

    case 'diamond':
      return {
        ...base,
        outline:
          `M${n(x + w / 2)} ${n(y)}L${n(x + w)} ${n(y + h / 2)}L${n(x + w / 2)} ${n(y + h)}` +
          `L${n(x)} ${n(y + h / 2)}Z`,
        described: 'diamond',
        radius: 0,
        inset: { top: h * 0.12, bottom: h * 0.12, left: w * 0.2, right: w * 0.2 },
      };
  }
}

/**
 * The shape a node is drawn with under a card: the kind's shape, or the card's box or pill. A
 * dashed (external) kind stays dashed under a box.
 *
 * @param kindShape - The kind's shape.
 * @param cardShape - The card's shape.
 */
export function cardShape(kindShape: NodeShape, cardShape: CardShape): NodeShape {
  switch (cardShape) {
    case 'kind':
      return kindShape;
    case 'box':
      return kindShape === 'dashed' ? 'dashed' : 'card';
    case 'pill':
      return 'pill';
  }
}

/**
 * Builds the geometry of a node's shape under its card: the card's shape override and corner
 * radius. A dashed (external) kind keeps its dashed outline whatever shape the card gives it.
 *
 * @param kindShape - The kind's shape.
 * @param card - The card's shape and radius.
 * @param rect - The node's box.
 */
export function nodeGeometry(
  kindShape: NodeShape,
  card: Pick<CardTokens, 'shape' | 'radius'>,
  rect: Rect,
): ShapeGeometry {
  const geometry = shapeGeometry(cardShape(kindShape, card.shape), rect, card.radius);
  return kindShape === 'dashed' && !geometry.dashed ? { ...geometry, dashed: true } : geometry;
}

/**
 * A rounded rectangle as path data.
 *
 * @param rect - The box.
 * @param radius - The corner radius.
 */
export function roundRect(rect: Rect, radius: number): string {
  const { x, y, width: w, height: h } = rect;
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  if (r === 0) {
    return `M${n(x)} ${n(y)}H${n(x + w)}V${n(y + h)}H${n(x)}Z`;
  }

  return (
    `M${n(x + r)} ${n(y)}H${n(x + w - r)}A${n(r)} ${n(r)} 0 0 1 ${n(x + w)} ${n(y + r)}` +
    `V${n(y + h - r)}A${n(r)} ${n(r)} 0 0 1 ${n(x + w - r)} ${n(y + h)}` +
    `H${n(x + r)}A${n(r)} ${n(r)} 0 0 1 ${n(x)} ${n(y + h - r)}` +
    `V${n(y + r)}A${n(r)} ${n(r)} 0 0 1 ${n(x + r)} ${n(y)}Z`
  );
}

/**
 * A small circle as path data.
 *
 * @param cx - Its centre's x.
 * @param cy - Its centre's y.
 * @param r - Its radius.
 */
function circle(cx: number, cy: number, r: number): string {
  return `M${n(cx - r)} ${n(cy)}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;
}

/**
 * A coordinate for path data.
 *
 * @param value - Pixels.
 */
function n(value: number): string {
  return String(round2(value));
}
