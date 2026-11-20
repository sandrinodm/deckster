import { Children, Fragment, isValidElement, type ReactElement, type ReactNode } from 'react';

import type { NodeProps } from '#diagrams/flow-parts.tsx';
import type { FlowSpec } from '#diagrams/flow-spec.ts';

import { diagramIcon, type DiagramIconSource } from '#diagrams/diagram-icons.tsx';
import { assertDiagramProps } from '#diagrams/diagram-props.ts';
import { PART_NAMES } from '#diagrams/flow-parts.tsx';
import { buildFlowSpec, optional, type FlowPart } from '#diagrams/flow-spec-builder.ts';
import { pushAll } from '#foundation/lists.ts';

/**
 * What a node renders that is not plain data: its icon and its own content.
 */
export type NodeExtras = {
  /**
   * The resolved icon component, if any.
   */
  icon?: DiagramIconSource;

  /**
   * Whether the node asked for no icon (`icon="none"`), so its kind's icon is not drawn either.
   */
  iconless?: boolean;

  /**
   * Content of the author's own, for a generic node.
   */
  content?: ReactNode;
};

/**
 * A `<Flow>`'s children read into data, plus what nodes render beyond data.
 */
export type ParsedFlow = {
  /**
   * The declaration.
   */
  spec: FlowSpec;

  /**
   * Icons and content by node id.
   */
  extras: ReadonlyMap<string, NodeExtras>;
};

/**
 * The elements that may sit inside a `<Flow>`, for the error message.
 */
const ALLOWED = '<Node>, <Group>, <Edge>, <Packet>, <Journey>, <State> and <Focus>';

/**
 * The characters of stray text quoted back in the error message, so a long paragraph stays short.
 */
const QUOTED_TEXT_MAX_CHARS = 40;

/**
 * Reads a `<Flow>`'s children (in any nesting of fragments and groups) into a diagram declaration.
 * Text between the elements, such as MDX's line breaks, is ignored.
 *
 * @param children - The `<Flow>`'s children.
 * @returns The declaration and the nodes' icons and content.
 * @throws Error naming the element and the fix for anything a `<Flow>` cannot hold, an unknown node
 *   kind or a `<Hop>` outside a `<Journey>`.
 */
export function parseFlowChildren(children: ReactNode): ParsedFlow {
  const extras = new Map<string, NodeExtras>();
  const parts = toParts(children, extras);
  return { spec: buildFlowSpec(parts), extras };
}

/**
 * React children as diagram parts, collecting node icons and content on the way.
 *
 * @param children - Any children.
 * @param extras - Node icons and content, filled in place.
 */
function toParts(children: ReactNode, extras: Map<string, NodeExtras>): FlowPart[] {
  const parts: FlowPart[] = [];
  for (const child of Children.toArray(children)) {
    if (!isValidElement(child)) {
      if (typeof child === 'string' && child.trim() !== '') {
        throw misplaced(`the text "${child.trim().slice(0, QUOTED_TEXT_MAX_CHARS)}"`);
      }

      continue;
    }

    const props = child.props as Record<string, unknown> & { children?: ReactNode };
    if (child.type === Fragment) {
      pushAll(parts, toParts(props.children, extras));
      continue;
    }

    const part = PART_NAMES.get(child.type);
    if (part === undefined) {
      throw misplaced(`<${elementName(child)}>`);
    }

    assertDiagramProps(part, props);

    if (part === 'Node') {
      const node = props as NodeProps;
      const icon = diagramIcon(node.icon);
      extras.set(node.id, {
        ...optional('icon', icon),
        ...(node.icon === 'none' ? { iconless: true } : {}),
        ...optional('content', node.children ?? undefined),
      });
      parts.push({ part, props, children: [] });
      continue;
    }

    parts.push({ part, props, children: toParts(props.children, extras) });
  }

  return parts;
}

/**
 * The name an element shows in messages.
 *
 * @param element - Any element.
 */
function elementName(element: ReactElement): string {
  const { type } = element;
  if (typeof type === 'string') {
    return type;
  }

  const named = type as { displayName?: string; name?: string };
  return named.displayName ?? named.name ?? 'component';
}

/**
 * The error for something a `<Flow>` cannot hold.
 *
 * @param what - What was found.
 */
function misplaced(what: string): Error {
  return new Error(
    `A <Flow> holds only ${ALLOWED}; it found ${what}. Move other content out of the <Flow>, ` +
      'or put a note in an edge `label` or a node `subtitle`.',
  );
}
