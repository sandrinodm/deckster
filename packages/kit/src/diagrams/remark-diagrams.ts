import { Predicate } from 'effect';
import { createRequire } from 'node:module';

import type { FlowSpec } from '#diagrams/flow-spec.ts';
import type { DiagramProblem } from '#diagrams/flow-validate.ts';

import { isIconImage, isRelativeIconImage } from '#diagrams/diagram-icon-source.ts';
import {
  checkDiagramProps,
  DIAGRAM_PROPS as DIAGRAM_PROPS_BY_NAME,
  DIAGRAM_ROOT_NAMES,
  isDiagramComponent,
  nearest,
  type DiagramComponentName,
} from '#diagrams/diagram-props.ts';
import {
  buildFlowSpec,
  FLOW_PART_NAMES,
  type FlowPart,
  type FlowPartName,
} from '#diagrams/flow-spec-builder.ts';
import { validateFlow } from '#diagrams/flow-validate.ts';
import { checkSequence, duplicates } from '#diagrams/form-validate.ts';
import { kindIconName, resolveNodeKind } from '#diagrams/node-kinds.ts';
import { addBuildLayout } from '#diagrams/remark-flow-layout.ts';
import { setOwn } from '#foundation/lists.ts';
import { installIconSetHint } from '#icons/icon-sets.ts';
import {
  attributeValue,
  defaultImport,
  findAttribute,
  identifierAttribute,
  JSX_TYPES,
  removeAttribute,
  setAttribute,
  walk,
  type MdastNode,
} from '#mdx/mdast.ts';
import { hasIcon, splitName } from '#mdx/remark-icons.ts';

/**
 * The parts of a vfile the plugin uses.
 */
export type DiagramFile = {
  /**
   * The slide's absolute path.
   */
  path?: string;

  /**
   * Records a warning the build prints.
   */
  message: (reason: string, place?: unknown) => unknown;

  /**
   * Throws a build error that names the slide and line of `place` (a node, or options with the
   * `place`, `ruleId` and `source`).
   */
  fail: (reason: string, place?: unknown) => never;
};

/**
 * The most icon names an unknown icon gets as suggestions.
 */
const MAX_ICON_SUGGESTIONS = 6;

/**
 * The longest value of a prop a message quotes in full; longer ones end in an ellipsis.
 */
const MAX_SHOWN_VALUE = 40;

/**
 * The kit's own `require`, so icon sets resolve from the kit's dependencies.
 */
const require = createRequire(import.meta.url);

/**
 * Icon names read so far, by set.
 */
const iconNameCache = new Map<string, readonly string[] | undefined>();

/**
 * Where a diagram part may be written, for the error when one sits outside its diagram.
 */
const FLOW_OR_CYCLE = '<Flow> or <Cycle>';

/**
 * The parts each diagram component or part may hold directly; a part not listed holds no diagram
 * parts (a `<Node>` in a `<Flow>` may hold content of its own).
 */
const ALLOWED_CHILDREN: Readonly<Partial<Record<DiagramComponentName, readonly string[]>>> = {
  /**
   * A flow's parts.
   */
  Flow: ['Node', 'Group', 'Edge', 'Packet', 'Journey', 'State', 'Focus'],

  /**
   * A group's nodes and inner groups.
   */
  Group: ['Node', 'Group'],

  /**
   * A journey's hops.
   */
  Journey: ['Hop'],

  /**
   * A cycle's stages and what changes them.
   */
  Cycle: ['Node', 'Edge', 'State', 'Packet', 'Focus'],

  /**
   * A tree's root node.
   */
  Tree: ['Node'],

  /**
   * A sequence diagram's cast and messages.
   */
  SequenceDiagram: ['Actor', 'Message'],

  /**
   * A timeline's milestones.
   */
  Timeline: ['Milestone'],

  /**
   * A stack's layers.
   */
  Layers: ['Layer'],

  /**
   * A layer's items.
   */
  Layer: ['Item'],

  /**
   * An imported drawing holds nothing.
   */
  Svg: [],
};

/**
 * Where each part belongs, for the error when one sits outside a diagram.
 */
const PART_HOMES: Readonly<Partial<Record<DiagramComponentName, string>>> = {
  /**
   * Nodes.
   */
  Node: '<Flow>, <Tree> or <Cycle>',

  /**
   * Groups.
   */
  Group: '<Flow>',

  /**
   * Edges.
   */
  Edge: FLOW_OR_CYCLE,

  /**
   * Packets.
   */
  Packet: FLOW_OR_CYCLE,

  /**
   * Journeys.
   */
  Journey: '<Flow>',

  /**
   * Hops.
   */
  Hop: '<Journey>',

  /**
   * State changes.
   */
  State: FLOW_OR_CYCLE,

  /**
   * Focus ranges.
   */
  Focus: FLOW_OR_CYCLE,

  /**
   * Actors.
   */
  Actor: '<SequenceDiagram>',

  /**
   * Messages.
   */
  Message: '<SequenceDiagram>',

  /**
   * Milestones.
   */
  Milestone: '<Timeline>',

  /**
   * Layers.
   */
  Layer: '<Layers>',

  /**
   * Items.
   */
  Item: '<Layer>',
};

/**
 * Whether each checked `<Node>` sits in a `<Tree>`, where it holds its child nodes.
 */
const treeParents = new WeakMap<MdastNode, boolean>();

/**
 * The origin of the kit's diagram build errors, which the MDX compiler reports with their own fix
 * instead of its generic one about JSX syntax.
 */
const DIAGRAM_ORIGIN = {
  /**
   * The kind of problem.
   */
  ruleId: 'diagram',

  /**
   * The deck's own plugins.
   */
  source: 'deck',
} as const;

/**
 * Options of {@link remarkKitDiagrams}.
 */
export type DiagramOptions = {
  /**
   * The brand's Iconify set, such as `lucide`.
   */
  set: string;
};

/**
 * Diagram elements that draw an icon from a `kind` or an `icon` name.
 */
const ICON_ELEMENTS = new Set(['Node', 'Actor', 'Item', 'Milestone']);

/**
 * Diagram components whose `<Node>` children form a flow to validate.
 */
const FLOW_ROOTS = new Set(['Flow']);

/**
 * The `icon` value that drops a kind's icon.
 */
const NO_ICON = 'none';

/**
 * A remark plugin for the kit's diagrams, run at build time on every MDX slide:
 *
 * - `kind` and `icon` on `<Node>`, `<Actor>`, `<Item>` and `<Milestone>` import the brand's icon
 *   (`~icons/<set>/<name>`), so only icons a deck draws ship; an unknown kind or icon fails the
 *   build, listing the choices.
 * - Every `<Flow>` whose props are literals is checked: edges, packets and states that name nodes
 *   that do not exist, packets between nodes no edge joins, nodes sharing a grid cell, nodes
 *   outside their group or inside a group they are not in. Each problem fails the build with its
 *   fix and the slide's line.
 * - A literal `<Flow>` without grid cells gets an ELK layout as its `positions` prop. The browser
 *   reuses those positions with intrinsic sizing and recalculates them with authored dimensions.
 *
 * @param options - The brand's icon set.
 */
export function remarkKitDiagrams(
  options: DiagramOptions,
): (tree: MdastNode, file: DiagramFile) => Promise<void> | undefined {
  return (tree, file) => {
    const layouts: Promise<void>[] = [];
    const imports: MdastNode[] = [];
    const locals = new Map<string, string>();
    /**
     * The local name of an icon import, adding the import the first time.
     */
    const importFor = (id: string): string => {
      let local = locals.get(id);
      if (local === undefined) {
        local = `kitDiagramIcon${locals.size}`;
        locals.set(id, local);
        imports.push(defaultImport(local, id));
      }

      return local;
    };
    const claimed = new WeakSet<MdastNode>();
    walk(tree, (node) => {
      if (isDiagramComponent(node.name)) {
        checkDiagramElement(node, node.name, file, claimed);
      }

      if (typeof node.name === 'string' && FLOW_ROOTS.has(node.name)) {
        checkFlow(node, file);
        const spec = literalSpec(node, file);
        if (spec !== undefined && spec.nodes.every((candidate) => candidate.cell === undefined)) {
          layouts.push(addBuildLayout(node, spec));
        }
      }

      if (typeof node.name === 'string' && ICON_ELEMENTS.has(node.name)) {
        resolveIcon(node, options.set, file, importFor);
      }

      return false;
    });
    tree.children = [...imports, ...(tree.children ?? [])];
    return layouts.length === 0 ? undefined : Promise.all(layouts).then(() => undefined);
  };
}

/**
 * A `<Flow>`'s declaration when every prop is a literal, for the build-time layout.
 *
 * @param node - The `<Flow>` element.
 * @param file - The vfile.
 * @returns The declaration; `undefined` when a prop is an expression.
 */
function literalSpec(node: MdastNode, file: DiagramFile): FlowSpec | undefined {
  const parts = partsOf(node, file);
  if (parts === undefined) {
    return undefined;
  }

  try {
    return buildFlowSpec(parts);
  } catch {
    return undefined;
  }
}

/**
 * Replaces an element's icon name, or its kind's icon, with the imported component.
 *
 * @param node - A diagram element with `kind` or `icon`.
 * @param brandSet - The brand's icon set.
 * @param file - The vfile.
 * @param importFor - Returns the local name of an icon's import.
 */
function resolveIcon(
  node: MdastNode,
  brandSet: string,
  file: DiagramFile,
  importFor: (id: string) => string,
): void {
  const written = attributeValue(node, 'icon');
  const kind = attributeValue(node, 'kind');
  if (written === NO_ICON) {
    return;
  }

  if (typeof written === 'string') {
    if (isRelativeIconImage(written)) {
      removeAttribute(node, 'icon');
      node.attributes?.push(identifierAttribute('icon', importFor(`${written}?url`)));
      return;
    }

    if (isIconImage(written)) {
      return;
    }

    const { set, icon } = splitName(written, brandSet);
    checkIconName(node, set, icon, written, file);
    removeAttribute(node, 'icon');
    node.attributes?.push(identifierAttribute('icon', importFor(`~icons/${set}/${icon}`)));
    return;
  }

  if (typeof kind !== 'string' || findAttribute(node, 'icon') !== undefined) {
    return;
  }

  const resolved = resolveNodeKind(kind);
  if (resolved === undefined) {
    return;
  }

  const icon = kindIconName(resolved, brandSet);
  if (icon === undefined) {
    return;
  }

  if (!hasIcon(brandSet, icon)) {
    file.message(
      `The ${brandSet} icon set has no "${icon}" icon for kind="${resolved}", ` +
        'so the node is drawn without one. Give it an `icon` from the set.',
      node,
    );
    setAttribute(node, 'icon', NO_ICON);
    return;
  }

  node.attributes?.push(identifierAttribute('icon', importFor(`~icons/${brandSet}/${icon}`)));
}

/**
 * Fails the build when an element's `icon` names an icon its set does not have, or a set that is
 * not installed, with close matches.
 *
 * @param node - The element.
 * @param set - The set id.
 * @param icon - The icon id.
 * @param written - The name as written.
 * @param file - The vfile.
 */
function checkIconName(
  node: MdastNode,
  set: string,
  icon: string,
  written: string,
  file: DiagramFile,
): void {
  if (hasIcon(set, icon)) {
    return;
  }

  const where = `${describeElement(node, ['icon'])} icon="${written}">`;
  const names = iconNames(set);
  if (names === undefined) {
    failDiagram(
      file,
      node,
      `${where} needs the "${set}" icon set, which is not installed.`,
      `${installIconSetHint(set)}, or use a name from the brand's set.`,
    );
  }

  const near = [
    ...new Set([
      ...(names ?? []).filter((name) => name.includes(icon) || icon.includes(name)),
      ...[nearest(icon, names ?? [])].filter((name) => name !== undefined),
    ]),
  ].slice(0, MAX_ICON_SUGGESTIONS);
  const closeMatches = near.length === 0 ? '' : ` Close matches: ${near.join(', ')}.`;
  failDiagram(
    file,
    node,
    `${where} is not in the ${set} icon set.${closeMatches}`,
    `Pick a name from https://icon-sets.iconify.design/${set}/; a deck shown in several brands ` +
      'needs a name every brand\'s set has, or icon="none".',
  );
}

/**
 * The icon names (and aliases) of an installed Iconify set.
 *
 * @param set - The set id.
 * @returns The names; `undefined` when the set is not installed.
 */
function iconNames(set: string): readonly string[] | undefined {
  if (iconNameCache.has(set)) {
    return iconNameCache.get(set);
  }

  let names: readonly string[] | undefined;
  try {
    const data = require(`@iconify-json/${set}/icons.json`) as {
      icons: Record<string, unknown>;
      aliases?: Record<string, unknown>;
    };
    names = [...Object.keys(data.icons), ...Object.keys(data.aliases ?? {})];
  } catch {
    names = undefined;
  }

  iconNameCache.set(set, names);
  return names;
}

/**
 * Validates a `<Flow>` whose parts are all written with literal props, and fails the build on its
 * errors; warnings are printed.
 *
 * @param node - The `<Flow>` element.
 * @param file - The vfile.
 */
function checkFlow(node: MdastNode, file: DiagramFile): void {
  const parts = partsOf(node, file);
  if (parts === undefined) {
    return;
  }

  let problems: DiagramProblem[];
  try {
    problems = validateFlow(buildFlowSpec(parts));
  } catch (error) {
    failDiagram(file, node, error instanceof Error ? error.message : String(error), '');
  }

  for (const warning of problems.filter((problem) => problem.severity === 'warning')) {
    file.message(`${warning.message} ${warning.fix}`, node);
  }

  failOn(
    file,
    node,
    'This <Flow>',
    problems.filter((problem) => problem.severity === 'error'),
  );
}

/**
 * The parts of a `<Flow>` in MDX, with their literal props.
 *
 * @param node - The `<Flow>` element or a part with children.
 * @param file - The vfile, to fail on an element a `<Flow>` cannot hold.
 * @returns The parts; `undefined` when a prop is an expression the build cannot read, which leaves
 *   the check to the browser.
 */
function partsOf(node: MdastNode, file: DiagramFile): FlowPart[] | undefined {
  const parts: FlowPart[] = [];
  for (const child of jsxChildren(node)) {
    const name = child.name ?? '';
    if (!FLOW_PART_NAMES.has(name)) {
      failDiagram(
        file,
        child,
        `A <Flow> holds only <Node>, <Group>, <Edge>, <Packet>, <Journey>, <State> and <Focus>; ` +
          `it found <${name}>.`,
        `Move it out of the <Flow>, or put the note in an edge \`label\` or a node \`subtitle\`.`,
      );
    }

    const props = literalProps(child);
    const children = name === 'Node' ? [] : partsOf(child, file);
    if (props === undefined || children === undefined) {
      return undefined;
    }

    parts.push({ part: name as FlowPartName, props, children });
  }

  return parts;
}

/**
 * The JSX elements directly inside an element, looking through paragraphs MDX wraps inline elements
 * in.
 *
 * @param node - An element.
 */
function jsxChildren(node: MdastNode): MdastNode[] {
  return (node.children ?? []).flatMap((child) => {
    if (JSX_TYPES.has(child.type)) {
      return [child];
    }

    return child.type === 'paragraph' ? jsxChildren(child) : [];
  });
}

/**
 * An element's props when every one is a literal.
 *
 * @param node - A JSX element.
 * @returns The props; `undefined` when one is an expression or a spread.
 */
function literalProps(node: MdastNode): Record<string, unknown> | undefined {
  const props: Record<string, unknown> = {};
  for (const attribute of node.attributes ?? []) {
    if (attribute.type !== 'mdxJsxAttribute' || attribute.name === undefined) {
      return undefined;
    }

    if (attribute.name === 'icon') {
      continue;
    }

    const value = attributeValue(node, attribute.name);
    if (value === undefined) {
      return undefined;
    }

    setOwn(props, attribute.name, value);
  }

  return props;
}

/**
 * Checks one diagram element at build time. A diagram (`<Flow>`, `<Tree>`, ...) has the props of
 * every part inside it checked first, then its structure: the parts it may hold, a `<Flow>` or
 * `<Cycle>` with no nodes, a tree's duplicate ids, a sequence's messages between actors that exist.
 * A part found outside a diagram fails with where it belongs.
 *
 * @param node - The element.
 * @param name - Its tag.
 * @param file - The vfile.
 * @param claimed - Parts already checked as part of a diagram, filled in place.
 */
function checkDiagramElement(
  node: MdastNode,
  name: DiagramComponentName,
  file: DiagramFile,
  claimed: WeakSet<MdastNode>,
): void {
  if (claimed.has(node)) {
    return;
  }

  if (!DIAGRAM_ROOT_NAMES.includes(name)) {
    failDiagram(
      file,
      node,
      `${describeElement(node)}> sits outside a diagram.`,
      `Put it inside a ${PART_HOMES[name] ?? 'diagram'}.`,
    );
  }

  checkTree(node, name, file, claimed);
  checkStructure(node, name, file);
}

/**
 * Checks the props and children of an element and of every part inside it, depth first.
 *
 * @param node - The element.
 * @param name - Its tag.
 * @param file - The vfile.
 * @param claimed - Checked parts, filled in place.
 */
function checkTree(
  node: MdastNode,
  name: DiagramComponentName,
  file: DiagramFile,
  claimed: WeakSet<MdastNode>,
): void {
  claimed.add(node);
  failOn(
    file,
    node,
    `${describeElement(node)}>`,
    checkDiagramProps(name, buildProps(node), {
      partial: hasSpread(node),
    }),
  );
  const allowed = ALLOWED_CHILDREN[name];
  for (const child of jsxChildren(node)) {
    const childName = child.name ?? '';
    const inTree = name === 'Node' && treeParents.get(node) === true;
    if (allowed === undefined && !inTree) {
      if (isDiagramComponent(childName)) {
        failDiagram(
          file,
          child,
          `${describeElement(node)}> holds ${describeElement(child)}>, ` +
            'which does not belong there.',
          `Move it into a ${PART_HOMES[childName] ?? 'diagram'}.`,
        );
      }

      continue;
    }

    const permitted = inTree ? ['Node'] : (allowed ?? []);
    if (!permitted.includes(childName)) {
      const holds = permitted.map((tag) => `<${tag}>`).join(', ') || 'no elements';
      failDiagram(
        file,
        child,
        `${describeElement(node)}> holds only ${holds}; it found <${childName}>.`,
        name === 'Tree' || inTree
          ? 'Nest each <Node> inside its parent <Node>, and move anything else out of the <Tree>.'
          : `Move <${childName}> out of the <${name}>.`,
      );
    }

    if (isDiagramComponent(childName)) {
      treeParents.set(child, name === 'Tree' || inTree);
      checkTree(child, childName, file, claimed);
    }
  }

  if (!('children' in diagramPropNames(name)) && hasText(node)) {
    failDiagram(
      file,
      node,
      `${describeElement(node)}> holds text, which it does not show.`,
      'Put the words in a prop (`label`, `title`, `subtitle`) instead.',
    );
  }
}

/**
 * The structure checks of a diagram, after its props: no nodes, duplicate tree ids, sequence
 * messages between unknown actors.
 *
 * @param node - The diagram.
 * @param name - Its tag.
 * @param file - The vfile.
 */
function checkStructure(node: MdastNode, name: DiagramComponentName, file: DiagramFile): void {
  if (name === 'Flow' || name === 'Cycle' || name === 'Tree') {
    const ids = nodeIds(node);
    if (ids.length === 0) {
      failDiagram(
        file,
        node,
        `${describeElement(node)}> has no <Node>s, so it draws nothing.`,
        `Add the nodes inside it (<Node id="api" title="API" />), or remove the empty <${name}>.`,
      );
    }

    if (name === 'Tree') {
      failOn(file, node, 'This <Tree>', duplicates(ids, '<Node>'));
    }
  }

  if (name === 'SequenceDiagram') {
    const children = jsxChildren(node);
    const actors = children
      .filter((child) => child.name === 'Actor')
      .map((child) => attributeValue(child, 'id'));
    const messages = children
      .filter((child) => child.name === 'Message')
      .map((child) => ({ from: attributeValue(child, 'from'), to: attributeValue(child, 'to') }));
    if (actors.every((id) => typeof id === 'string')) {
      const literal = messages.filter(
        (message): message is { from: string; to: string } =>
          typeof message.from === 'string' && typeof message.to === 'string',
      );
      failOn(file, node, 'This <SequenceDiagram>', checkSequence(actors as string[], literal));
    }
  }
}

/**
 * The literal ids of every `<Node>` in a diagram, through groups and nested tree nodes.
 *
 * @param node - The diagram or a part.
 */
function nodeIds(node: MdastNode): string[] {
  return jsxChildren(node).flatMap((child) => {
    if (child.name === 'Node') {
      const id = attributeValue(child, 'id');
      return [...(typeof id === 'string' ? [id] : ['']), ...nodeIds(child).filter(Boolean)];
    }

    return child.name === 'Group' ? nodeIds(child) : [];
  });
}

/**
 * The props of an element as the checks see them: literal values, `undefined` for expressions the
 * build cannot read (only their names are checked).
 *
 * @param node - The element.
 */
function buildProps(node: MdastNode): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  for (const attribute of node.attributes ?? []) {
    if (attribute.type === 'mdxJsxAttribute' && attribute.name !== undefined) {
      setOwn(props, attribute.name, attributeValue(node, attribute.name));
    }
  }

  return props;
}

/**
 * Whether an element spreads an expression into its props, which may supply any of them.
 *
 * @param node - The element.
 */
function hasSpread(node: MdastNode): boolean {
  return (node.attributes ?? []).some((attribute) => attribute.type !== 'mdxJsxAttribute');
}

/**
 * Whether an element holds text of its own (not only whitespace and elements).
 *
 * @param node - The element.
 */
function hasText(node: MdastNode): boolean {
  return (node.children ?? []).some((child) => {
    if (child.type === 'text') {
      return (child.value ?? '').trim() !== '';
    }

    return child.type === 'paragraph' && hasText(child);
  });
}

/**
 * The prop names of a component, as a set-like object for `in` checks.
 *
 * @param name - The tag.
 */
function diagramPropNames(name: DiagramComponentName): Readonly<Record<string, true>> {
  return Object.fromEntries(
    Object.keys(DIAGRAM_PROPS_BY_NAME[name]).map((prop) => [prop, true] as const),
  );
}

/**
 * An element as messages name it: its tag and its identifying prop, without the closing `>`, so a
 * caller can add more.
 *
 * @param node - The element.
 * @param skip - Props to leave out.
 */
function describeElement(node: MdastNode, skip: readonly string[] = []): string {
  const shown = ['id', 'from', 'to', 'title', 'label', 'date', 'node', 'edge'].filter(
    (key) => !skip.includes(key),
  );
  const parts = [`<${node.name ?? 'element'}`];
  // The loop stops after the first identifying prop, or after `from` and `to` of a message.
  for (const key of shown) {
    const value = attributeValue(node, key);
    if (typeof value === 'string') {
      const shown =
        value.length > MAX_SHOWN_VALUE ? `${value.slice(0, MAX_SHOWN_VALUE - 1)}…` : value;
      parts.push(`${key}="${shown}"`);
    }

    if (parts.length === 3 || (parts.length === 2 && key !== 'from')) {
      break;
    }
  }

  return parts.join(' ');
}

/**
 * Fails the build with problems, when there are any: one problem as its message and fix, several as
 * a list under a heading.
 *
 * @param file - The vfile.
 * @param node - The element, for the line.
 * @param element - The element as the heading names it.
 * @param problems - The problems; only errors are passed.
 */
function failOn(
  file: DiagramFile,
  node: MdastNode,
  element: string,
  problems: readonly DiagramProblem[],
): void {
  if (problems.length === 0) {
    return;
  }

  if (problems.length === 1) {
    const [only] = problems as [DiagramProblem];
    failDiagram(file, node, only.message, only.fix);
  }

  failDiagram(
    file,
    node,
    `${element} has ${problems.length} problems:\n` +
      problems.map((problem) => `- ${problem.message} ${problem.fix}`).join('\n'),
    'Fix each problem as its line says.',
  );
}

/**
 * Fails the build with a diagram error: the reason, the slide's line, and the diagram's own fix,
 * which the MDX compiler shows instead of its generic one about JSX syntax.
 *
 * @param file - The vfile.
 * @param node - The element, for the line.
 * @param reason - What is wrong.
 * @param fix - What to change; empty when the reason says it.
 */
function failDiagram(file: DiagramFile, node: MdastNode, reason: string, fix: string): never {
  try {
    return file.fail(reason, { place: node.position, ...DIAGRAM_ORIGIN });
  } catch (error) {
    if (Predicate.isObject(error) && fix !== '') {
      Object.assign(error, { note: fix });
    }

    throw error;
  }
}
