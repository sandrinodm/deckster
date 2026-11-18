import type { PlanItem } from '#plan/plan-scene.ts';
import type { SceneParagraph, SceneRect, TextNode } from '#scene/scene.ts';

/**
 * The largest overlap, in canvas pixels, between one paragraph's bottom and the next one's top that
 * still counts as stacked.
 */
const STACK_TOLERANCE_PX = 2;

/**
 * The largest gap between two paragraphs set in one frame, in line heights.
 */
const MAX_GAP_LINES = 3;

/**
 * The share of the narrower paragraph's width two paragraphs must overlap horizontally.
 */
const MIN_HORIZONTAL_OVERLAP = 0.5;

/**
 * Sets paragraphs that read as one block of text in one frame, so PowerPoint edits them together
 * (and a list stays one list): consecutive native text items merge when they are in the same
 * painted container, slot and placeholder, stack top to bottom with a gap of at most three lines,
 * overlap horizontally, share their alignment, are replaced at the same step (or by none), and no
 * other item drawn between them overlaps the merged frame, and either both wrap or neither does
 * (wrapping is set per frame). Everything else keeps its order.
 *
 * @param items - The plan's items in paint order.
 * @param keepApart - Text items that stay frames of their own, such as text drawn as outlines.
 * @returns The items with merged text frames.
 */
export function groupText(
  items: readonly PlanItem[],
  keepApart: (node: TextNode) => boolean = () => false,
): PlanItem[] {
  const result: PlanItem[] = [];
  for (const item of items) {
    const apart = item.node.kind === 'text' && keepApart(item.node);
    const previous = apart ? undefined : findMergeTarget(result, item, keepApart);
    if (previous === undefined || item.kind !== 'native' || item.node.kind !== 'text') {
      result.push(item);
      continue;
    }

    const target = result[previous];
    if (target?.kind === 'native' && target.node.kind === 'text') {
      result[previous] = { kind: 'native', node: mergeText(target.node, item.node) };
    }
  }

  return result;
}

/**
 * The index of the text frame an item can join, if any.
 *
 * @param result - The items placed so far.
 * @param item - The next item.
 */
function findMergeTarget(
  result: readonly PlanItem[],
  item: PlanItem,
  keepApart: (node: TextNode) => boolean,
): number | undefined {
  if (item.kind !== 'native' || item.node.kind !== 'text') {
    return undefined;
  }

  const next = item.node;
  for (let index = result.length - 1; index >= 0; index -= 1) {
    const candidate = result[index];
    if (candidate?.kind === 'native' && candidate.node.kind === 'text') {
      if (keepApart(candidate.node) || !canMerge(candidate.node, next)) {
        return undefined;
      }

      const merged = unionRect(candidate.node.rect, next.rect);
      const between = result.slice(index + 1);
      return between.some((other) => intersects(other.node.rect, merged)) ? undefined : index;
    }
  }

  return undefined;
}

/**
 * Whether a paragraph can join a frame. Text replaced at different steps, or replaced against text
 * that is not, never shares a frame.
 *
 * @param frame - The frame so far.
 * @param next - The next text item.
 */
export function canMerge(frame: TextNode, next: TextNode): boolean {
  const last = frame.paragraphs.at(-1);
  const first = next.paragraphs[0];
  if (last === undefined || first === undefined) {
    return false;
  }

  const sameContext =
    frame.container === next.container &&
    frame.slot === next.slot &&
    frame.matches.join('|') === next.matches.join('|');
  const lastBottom = last.box.y + last.box.height;
  const gap = first.box.y - lastBottom;
  const stacked =
    gap >= -STACK_TOLERANCE_PX &&
    gap <= MAX_GAP_LINES * Math.max(last.lineHeight, first.lineHeight);
  const overlap =
    Math.min(last.box.x + last.box.width, first.box.x + first.box.width) -
    Math.max(last.box.x, first.box.x);
  const narrower = Math.min(last.box.width, first.box.width);
  const sideBySide = narrower > 0 && overlap / narrower >= MIN_HORIZONTAL_OVERLAP;
  const sameWrap = (last.wrapWidth === null) === (first.wrapWidth === null);
  const sameReplacement =
    frame.replacedAt === next.replacedAt && last.replacedAt === first.replacedAt;
  return (
    sameContext &&
    sameReplacement &&
    stacked &&
    sideBySide &&
    sameWrap &&
    last.align === first.align &&
    sameAlignBox(last, first)
  );
}

/**
 * Whether two centred or right-aligned paragraphs are aligned in the same box; left-aligned ones
 * always are.
 *
 * @param a - A paragraph.
 * @param b - The next one.
 */
function sameAlignBox(a: SceneParagraph, b: SceneParagraph): boolean {
  if (a.align === 'center') {
    return Math.abs(a.box.x + a.box.width / 2 - (b.box.x + b.box.width / 2)) <= STACK_TOLERANCE_PX;
  }

  if (a.align === 'right') {
    return Math.abs(a.box.x + a.box.width - (b.box.x + b.box.width)) <= STACK_TOLERANCE_PX;
  }

  return true;
}

/**
 * A frame with another text item's paragraphs appended.
 *
 * @param frame - The frame.
 * @param next - The text item.
 */
function mergeText(frame: TextNode, next: TextNode): TextNode {
  return {
    ...frame,
    rect: unionRect(frame.rect, next.rect),
    paragraphs: [...frame.paragraphs, ...next.paragraphs],
    step: frame.step ?? next.step,
  };
}

/**
 * The smallest rectangle around two.
 *
 * @param a - A rectangle.
 * @param b - Another.
 */
export function unionRect(a: SceneRect, b: SceneRect): SceneRect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  };
}

/**
 * Whether two rectangles overlap with a positive area.
 *
 * @param a - A rectangle.
 * @param b - Another.
 */
function intersects(a: SceneRect, b: SceneRect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}
