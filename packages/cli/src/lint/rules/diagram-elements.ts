import type { ElementSnapshot, StepSnapshot } from '#lint/types.ts';

import { ancestorsOf } from '#lint/rules/elements.ts';

/**
 * The `data-*` attribute (without its prefix) the kit's diagrams put on their root element, with
 * the diagram's kind as the value.
 */
const DIAGRAM_ATTRIBUTE = 'diagram';

/**
 * The `data-*` attribute that names what a part of a diagram is: `node`, `edge`, `edge-label`,
 * `group`, `packet` and so on.
 */
const PART_ATTRIBUTE = 'diagram-part';

/**
 * One rendered diagram and the parts recorded inside it.
 */
export type DiagramSnapshot = {
  /**
   * The diagram's root element.
   */
  root: ElementSnapshot;

  /**
   * The elements inside it, in document order.
   */
  parts: readonly ElementSnapshot[];
};

/**
 * The diagrams on a slide, each with the elements inside it.
 *
 * @param snapshot - The measured slide.
 */
export function diagramsOn(snapshot: StepSnapshot): DiagramSnapshot[] {
  const roots = snapshot.elements.filter((element) => DIAGRAM_ATTRIBUTE in element.data);
  return roots.map((root) => ({
    root,
    parts: snapshot.elements.filter((element) =>
      ancestorsOf(element, snapshot).includes(root.index),
    ),
  }));
}

/**
 * The parts of a diagram of one kind.
 *
 * @param diagram - A diagram.
 * @param part - The part's name, such as `node` or `edge-label`.
 */
export function partsOf(diagram: DiagramSnapshot, part: string): ElementSnapshot[] {
  return diagram.parts.filter((element) => element.data[PART_ATTRIBUTE] === part);
}

/**
 * The tag each diagram kind is written with.
 */
const TAGS: Readonly<Record<string, string>> = {
  /**
   * `<Flow>`.
   */
  flow: '<Flow>',

  /**
   * `<SequenceDiagram>`.
   */
  sequence: '<SequenceDiagram>',

  /**
   * `<Timeline>`.
   */
  timeline: '<Timeline>',

  /**
   * `<Layers>`.
   */
  layers: '<Layers>',

  /**
   * `<Cycle>`.
   */
  cycle: '<Cycle>',

  /**
   * `<Tree>`.
   */
  tree: '<Tree>',

  /**
   * `<Svg>`.
   */
  svg: '<Svg>',
};

/**
 * How a diagram is named in messages: its tag and its title (the `title` prop a reader can find in
 * the slide), else its id.
 *
 * @param diagram - A diagram.
 */
export function diagramName(diagram: DiagramSnapshot): string {
  const kind = diagram.root.data[DIAGRAM_ATTRIBUTE] ?? 'diagram';
  const tag =
    (Object.hasOwn(TAGS, kind) ? TAGS[kind] : undefined) ??
    `<${kind[0]?.toUpperCase() ?? ''}${kind.slice(1)}>`;
  const name = diagram.root.data['diagram-title'] ?? diagram.root.data['diagram-id'];
  return name === undefined ? `A ${tag}` : `The ${tag} "${name}"`;
}

/**
 * How a part of a diagram is named in messages: a node by its title, an edge label or group label
 * by its text, else by its selector.
 *
 * @param part - A part.
 */
export function partName(part: ElementSnapshot): string {
  const title = part.data['node-title'];
  if (title !== undefined) {
    return `the node "${title}"`;
  }

  const kind = part.data[PART_ATTRIBUTE];
  const text = part.text.trim();
  if (text !== '' && kind === 'edge-label') {
    return `the edge label "${text}"`;
  }

  if (text !== '' && kind === 'group-label') {
    return `the group label "${text}"`;
  }

  return text === '' ? `\`${part.selector}\`` : `"${text}"`;
}
