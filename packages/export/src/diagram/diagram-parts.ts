import type {
  DescribedBox,
  DescribedIcon,
  DescribedLine,
  DescribedText,
  DiagramDescription,
} from '@deckster/kit/diagram-description';

import type { BoxNode, ImageNode, SceneNode, SlideScene, SvgNode, TextNode } from '#scene/scene.ts';

import { parentLookup } from '#plan/plan-scene.ts';

/**
 * The largest drawing, in canvas pixels on each side, that counts as an icon when the description
 * does not name it.
 */
const ICON_SIZE_PX = 64;

/**
 * How far apart, in canvas pixels, a described box and the element measured for it may be.
 */
const MATCH_TOLERANCE_PX = 6;

/**
 * The smallest distance, in canvas pixels, between the centres of a described text and its measured
 * text that still counts as a match, however small the described box is: four match tolerances.
 */
const TEXT_REACH_PX = MATCH_TOLERANCE_PX * 4;

/**
 * Runs of whitespace, which text comparison collapses to one space.
 */
const WHITESPACE_RUN = /\s+/g;

/**
 * The collected artwork of a diagram icon.
 */
export type DiagramIconNode = SvgNode | ImageNode;

/**
 * The page elements a described diagram was drawn with, matched to what the description names: the
 * measured text of each described text (its runs carry the font, axes and spacing the description
 * leaves out), the drawing of each node's icon, and the painted boxes of nodes and groups. What the
 * description does not name, such as the chip behind an icon or a badge's pill, is listed so the
 * writer can still draw it.
 */
export type DiagramParts = {
  /**
   * The measured text of a described text, by the described text.
   */
  texts: ReadonlyMap<DescribedText, TextNode>;

  /**
   * The drawing of a node's icon, by node id.
   */
  icons: ReadonlyMap<string, DiagramIconNode>;

  /**
   * The painted box measured for a described node or group, by its id.
   */
  boxes: ReadonlyMap<string, BoxNode>;

  /**
   * The chip measured behind an edge label, by the label.
   */
  chips: ReadonlyMap<DescribedText, BoxNode>;

  /**
   * Painted boxes inside the diagram the description does not name, in paint order.
   */
  extraBoxes: readonly BoxNode[];

  /**
   * Small drawings inside the diagram the description does not name (icons it leaves out), in paint
   * order.
   */
  extraIcons: readonly DiagramIconNode[];

  /**
   * Text inside the diagram the description does not name, in paint order.
   */
  extraTexts: readonly TextNode[];
};

/**
 * Matches the page elements inside a diagram's element to the parts of its description: texts by
 * their content and position, icons and boxes by position.
 *
 * @param scene - The slide's scene.
 * @param diagramId - The id of the diagram's scene node.
 * @param diagram - The description.
 * @returns The matches and what is left over.
 */
export function matchDiagramParts(
  scene: Pick<SlideScene, 'nodes' | 'tree'>,
  diagramId: number,
  diagram: DiagramDescription,
): DiagramParts {
  const subtree = nodesInside(scene, diagramId);
  const textNodes = subtree.filter((node): node is TextNode => node.kind === 'text');
  const texts = matchTexts(textNodes, diagram);
  const usedTexts = new Set(texts.values());

  const artwork = subtree.filter(
    (node): node is DiagramIconNode => node.kind === 'svg' || isDiagramImage(node),
  );
  const icons = matchIcons(artwork, diagram);
  const usedIcons = new Set(icons.values());

  const boxNodes = subtree.filter((node): node is BoxNode => node.kind === 'box');
  const { boxes, chips } = matchBoxes(boxNodes, diagram);
  const usedBoxes = new Set([...boxes.values(), ...chips.values()]);
  const extraBoxes = boxNodes.filter(
    (node) =>
      !usedBoxes.has(node) &&
      !(diagram.lines ?? []).some((line) => isTimelineLineBox(node.rect, line)) &&
      !textNodes.some((text) => usedTexts.has(text) && isOwnBox(node, text)),
  );
  return {
    texts,
    icons,
    boxes,
    chips,
    extraBoxes,
    extraIcons: artwork.filter((node) => !usedIcons.has(node) && isExtraIcon(node)),
    extraTexts: textNodes.filter((node) => !usedTexts.has(node)),
  };
}

/**
 * Matches the HTML strip or border already described by the timeline's native line.
 *
 * @param rect - A painted element's box.
 * @param line - A line in the diagram description.
 */
function isTimelineLineBox(rect: DescribedBox, line: DescribedLine): boolean {
  const [start, end] = line.points;
  if (line.role === 'lifeline' || start === undefined || end === undefined || line.width <= 0) {
    return false;
  }

  return sameBox(rect, {
    x: start.x,
    y: start.y - line.width / 2,
    width: end.x - start.x,
    height: line.width,
  });
}

/**
 * The scene nodes inside a diagram's element, at any depth.
 *
 * @param scene - The slide's scene.
 * @param diagramId - The id of the diagram's scene node.
 */
function nodesInside(scene: Pick<SlideScene, 'nodes' | 'tree'>, diagramId: number): SceneNode[] {
  const parentOf = parentLookup(scene);
  const diagramNode = Math.floor(diagramId);
  return scene.nodes.filter((node) => {
    for (let parent = node.parent; parent !== null; parent = parentOf(parent)) {
      if (Math.floor(parent) === diagramNode) {
        return true;
      }
    }

    return false;
  });
}

/**
 * Matches each described text to the measured text that sets it, each measured text used once.
 *
 * @param textNodes - The text nodes inside the diagram.
 * @param diagram - The description.
 */
function matchTexts(
  textNodes: readonly TextNode[],
  diagram: DiagramDescription,
): Map<DescribedText, TextNode> {
  const texts = new Map<DescribedText, TextNode>();
  const used = new Set<TextNode>();
  for (const described of describedTexts(diagram)) {
    const found = bestText(textNodes, described, used);
    if (found !== null) {
      texts.set(described, found);
      used.add(found);
    }
  }

  return texts;
}

/**
 * Matches each node's icon to the drawing at the icon's box.
 *
 * @param artwork - The artwork inside the diagram.
 * @param diagram - The description.
 */
function matchIcons(
  artwork: readonly DiagramIconNode[],
  diagram: DiagramDescription,
): Map<string, DiagramIconNode> {
  const icons = new Map<string, DiagramIconNode>();
  const used = new Set<DiagramIconNode>();
  for (const node of diagram.nodes) {
    const icon = node.icon;
    if (icon === null) {
      continue;
    }

    const found = artwork.find((candidate) => !used.has(candidate) && matchesIcon(candidate, icon));
    if (found !== undefined) {
      icons.set(node.id, found);
      used.add(found);
    }
  }

  return icons;
}

/**
 * Matches the art to a described icon. An image fitted inside its box keeps its center.
 *
 * @param candidate - The artwork collected from the DOM.
 * @param icon - The icon in the description.
 */
function matchesIcon(candidate: DiagramIconNode, icon: DescribedIcon): boolean {
  if (candidate.kind === 'svg') {
    return icon.src === undefined && sameBox(candidate.rect, icon.box);
  }

  const { rect } = candidate;
  const { box } = icon;
  return (
    icon.src === candidate.src &&
    Math.abs(rect.x + rect.width / 2 - (box.x + box.width / 2)) <= MATCH_TOLERANCE_PX &&
    Math.abs(rect.y + rect.height / 2 - (box.y + box.height / 2)) <= MATCH_TOLERANCE_PX
  );
}

/**
 * Matches image icons collected from the diagram's marked frames.
 *
 * @param node - A scene node inside the diagram.
 */
function isDiagramImage(node: SceneNode): node is ImageNode {
  return node.kind === 'image' && node.diagramIcon === true;
}

/**
 * Preserves explicitly marked icons and small vector icons from older diagram descriptions.
 *
 * @param node - The unmatched artwork.
 */
function isExtraIcon(node: DiagramIconNode): boolean {
  if (node.diagramIcon === true) {
    return true;
  }

  return (
    node.kind === 'svg' &&
    node.shapes !== null &&
    node.rect.width <= ICON_SIZE_PX &&
    node.rect.height <= ICON_SIZE_PX
  );
}

/**
 * Matches each described node and group to its painted box, and each edge label to its chip.
 *
 * @param boxNodes - The painted boxes inside the diagram.
 * @param diagram - The description.
 */
function matchBoxes(
  boxNodes: readonly BoxNode[],
  diagram: DiagramDescription,
): { boxes: Map<string, BoxNode>; chips: Map<DescribedText, BoxNode> } {
  const boxes = new Map<string, BoxNode>();
  const named: { id: string; box: DescribedBox }[] = [
    ...diagram.nodes.map((node) => ({ id: node.id, box: node.box })),
    ...diagram.groups.map((group) => ({ id: group.id, box: group.box })),
  ];
  for (const { id, box } of named) {
    const found = boxNodes.find((candidate) => sameBox(candidate.rect, box));
    if (found !== undefined) {
      boxes.set(id, found);
    }
  }

  const chips = new Map<DescribedText, BoxNode>();
  for (const edge of diagram.edges) {
    const label = edge.label;
    if (label === null) {
      continue;
    }

    const found = boxNodes.find((candidate) => sameBox(candidate.rect, label.box));
    if (found !== undefined) {
      chips.set(label, found);
    }
  }

  return { boxes, chips };
}

/**
 * Every text a description sets: node texts, group labels, edge labels, packet labels and loose
 * texts.
 *
 * @param diagram - The description.
 */
export function describedTexts(diagram: DiagramDescription): DescribedText[] {
  return [
    ...diagram.nodes.flatMap((node) => node.texts),
    ...diagram.groups.flatMap((group) => (group.label === null ? [] : [group.label])),
    ...diagram.edges.flatMap((edge) => (edge.label === null ? [] : [edge.label])),
    ...diagram.packets.flatMap((packet) => (packet.label === null ? [] : [packet.label])),
    ...diagram.texts,
  ];
}

/**
 * The measured text that sets a described text: the same words, nearest to its box.
 *
 * @param candidates - The text nodes inside the diagram.
 * @param described - The described text.
 * @param used - Text nodes already matched.
 */
function bestText(
  candidates: readonly TextNode[],
  described: DescribedText,
  used: ReadonlySet<TextNode>,
): TextNode | null {
  const words = normalise(described.text);
  const centerX = described.box.x + described.box.width / 2;
  const centerY = described.box.y + described.box.height / 2;
  const reach = Math.max(described.box.width, described.box.height, TEXT_REACH_PX);
  let best: TextNode | null = null;
  let bestDistance = reach;
  for (const candidate of candidates) {
    if (used.has(candidate) || normalise(textOf(candidate)) !== words) {
      continue;
    }

    const distance = Math.hypot(
      candidate.rect.x + candidate.rect.width / 2 - centerX,
      candidate.rect.y + candidate.rect.height / 2 - centerY,
    );
    if (distance <= bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }

  return best;
}

/**
 * The words of a text node, paragraphs and lines joined with spaces.
 *
 * @param node - The text node.
 */
export function textOf(node: TextNode): string {
  return node.paragraphs
    .map((paragraph) =>
      paragraph.lines.map((line) => line.runs.map((run) => run.text).join('')).join(' '),
    )
    .join(' ');
}

/**
 * Text compared without case and with whitespace collapsed: the description writes text as it reads
 * (uppercase applied), the scene keeps the source case.
 *
 * @param text - The text.
 */
function normalise(text: string): string {
  return text.replaceAll(WHITESPACE_RUN, ' ').trim().toLowerCase();
}

/**
 * Whether a painted box is the background of a text element (a label's chip): the same element,
 * whose text node id is the box's id plus a fraction.
 *
 * @param box - The box.
 * @param text - The text node.
 */
function isOwnBox(box: BoxNode, text: TextNode): boolean {
  return Math.floor(text.id) === box.id && sameBox(box.rect, text.rect);
}

/**
 * Whether two boxes are the same within {@link MATCH_TOLERANCE_PX} on every edge.
 *
 * @param a - A box.
 * @param b - Another.
 */
function sameBox(a: DescribedBox, b: DescribedBox): boolean {
  return (
    Math.abs(a.x - b.x) <= MATCH_TOLERANCE_PX &&
    Math.abs(a.y - b.y) <= MATCH_TOLERANCE_PX &&
    Math.abs(a.x + a.width - (b.x + b.width)) <= MATCH_TOLERANCE_PX &&
    Math.abs(a.y + a.height - (b.y + b.height)) <= MATCH_TOLERANCE_PX
  );
}
