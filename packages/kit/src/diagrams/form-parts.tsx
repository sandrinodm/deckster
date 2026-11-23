import type { ReactNode } from 'react';

import type { DiagramLineStyle } from '#diagrams/diagram-design.ts';
import type { IconComponent } from '#diagrams/flow-parts.tsx';
import type { DiagramState, PlayMode } from '#diagrams/flow-spec.ts';

/**
 * Props of {@link Actor}.
 */
export type ActorProps = {
  /**
   * Preferred width in canvas pixels.
   */
  width?: number;

  /**
   * Minimum measured height in canvas pixels.
   */
  height?: number;

  /**
   * The id messages name it by.
   */
  id: string;

  /**
   * What it is, which sets its shape and icon, as on a `<Node>`.
   */
  kind?: string;

  /**
   * Its name; the id when left out.
   */
  title?: string;

  /**
   * A quieter second line.
   */
  subtitle?: string;

  /**
   * An Iconify name (MDX), icon component, image URL, or `none` to omit the icon.
   */
  icon?: string | IconComponent;

  /**
   * The card (a node style the brand defines) it is drawn with: `default`, `outline`, `solid`,
   * `tint`, `raised` or one of the brand's own (`deckster brand <name>` lists them). Without one it
   * takes the diagram's `card`, else the card the brand maps its kind to, else `default`.
   */
  card?: string;
};

/**
 * A participant of a `<SequenceDiagram>`, drawn as a node at the top of its lifeline.
 */
export function Actor(_props: ActorProps): ReactNode {
  return null;
}

/**
 * Props of {@link Message}.
 */
export type MessageProps = {
  /**
   * Connector width in canvas pixels.
   */
  strokeWidth?: number;

  /**
   * The connector pattern for ordinary messages.
   */
  lineStyle?: DiagramLineStyle;

  /**
   * The actor it leaves.
   */
  from: string;

  /**
   * The actor it reaches; the same as `from` for a call to itself.
   */
  to: string;

  /**
   * What it says, such as `POST /orders`.
   */
  label?: string;

  /**
   * The step that reveals it; it plays while that step is current.
   */
  at?: number;

  /**
   * A response: a dashed arrow, its packet drawn as a ring.
   */
  reply?: boolean;

  /**
   * An asynchronous message: a dashed arrow.
   */
  async?: boolean;

  /**
   * Loop its packet while current (the default) or send it once.
   */
  play?: PlayMode;

  /**
   * Its emphasis, such as `error` for a failed call.
   */
  state?: DiagramState;
};

/**
 * A message of a `<SequenceDiagram>`: an arrow from one lifeline to another.
 */
export function Message(_props: MessageProps): ReactNode {
  return null;
}

/**
 * Props of {@link Milestone}.
 */
export type MilestoneProps = {
  /**
   * When, as it should read: `Q1 2026`, `March`, `Week 3`.
   */
  date: string;

  /**
   * What happens, in a few words.
   */
  title: string;

  /**
   * The step that reveals it.
   */
  at?: number;

  /**
   * Marks where we are now, when no step does.
   */
  current?: boolean;

  /**
   * Its emphasis: `success` for done, `error` for slipped, `muted` for tentative.
   */
  state?: DiagramState;

  /**
   * An Iconify name (MDX), icon component, image URL, or `none` to omit the icon.
   */
  icon?: string | IconComponent;

  /**
   * A short line of detail under the title.
   */
  children?: ReactNode;
};

/**
 * One milestone of a `<Timeline>`.
 */
export function Milestone(_props: MilestoneProps): ReactNode {
  return null;
}

/**
 * Props of {@link Item}.
 */
export type ItemProps = {
  /**
   * What it is, which sets its icon, as on a `<Node>`.
   */
  kind?: string;

  /**
   * Its name.
   */
  title: string;

  /**
   * An Iconify name (MDX), icon component, image URL, or `none` to omit the icon.
   */
  icon?: string | IconComponent;

  /**
   * The card (a node style the brand defines) it is drawn with: `default`, `outline`, `solid`,
   * `tint`, `raised` or one of the brand's own (`deckster brand <name>` lists them). Without one it
   * takes the diagram's `card`, else the card the brand maps its kind to, else `default`.
   */
  card?: string;

  /**
   * Its emphasis.
   */
  state?: DiagramState;
};

/**
 * One building block inside a `<Layer>`.
 */
export function Item(_props: ItemProps): ReactNode {
  return null;
}

/**
 * Props of {@link Layer}.
 */
export type LayerProps = {
  /**
   * The layer's name, such as `Experience` or `Data`.
   */
  title: string;

  /**
   * A line on what it does or who owns it.
   */
  subtitle?: string;

  /**
   * The step that reveals it; it is picked out while that step is current.
   */
  at?: number;

  /**
   * Its emphasis.
   */
  state?: DiagramState;

  /**
   * The card (a node style the brand defines) its band is drawn with, as on a `<Node>`; without one
   * the band keeps the stack's own look (a tint with a bold edge on the left).
   */
  card?: string;

  /**
   * Its `<Item>`s.
   */
  children?: ReactNode;
};

/**
 * One band of a `<Layers>` stack.
 */
export function Layer(_props: LayerProps): ReactNode {
  return null;
}
