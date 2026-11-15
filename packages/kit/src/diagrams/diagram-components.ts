import { Edge, Focus, Group, Hop, Journey, Node, Packet, State } from '#diagrams/flow-parts.tsx';
import { Actor, Item, Layer, Message, Milestone } from '#diagrams/form-parts.tsx';
import {
  /**
   * A loop of stages on a ring.
   */
  Cycle,
  /**
   * Nodes and edges on a grid or an automatic layout, with packets and journeys.
   */
  Flow,
  /**
   * A stacked architecture.
   */
  Layers,
  /**
   * Actors and the messages between them, in order.
   */
  SequenceDiagram,
  /**
   * An imported SVG with brand colors and step reveals.
   */
  Svg,
  /**
   * Milestones in time order.
   */
  Timeline,
  /**
   * A hierarchy of nested nodes.
   */
  Tree,
} from '#diagrams/lazy-diagrams.tsx';

/**
 * The diagram components the kit registers for MDX slides, by the tag a slide writes. The diagrams
 * load their code on first use; the parts inside them (`<Node>`, `<Edge>`, `<Actor>`, ...) are tiny
 * and load with the deck. `deck diagrams` describes each one (`diagram-catalog.ts`).
 */
export const DIAGRAM_COMPONENTS = {
  /**
   * Nodes and edges on a grid or an automatic layout, with packets and journeys.
   */
  Flow,

  /**
   * A node of a flow, tree or cycle.
   */
  Node,

  /**
   * A labelled container around nodes.
   */
  Group,

  /**
   * A connection between two nodes.
   */
  Edge,

  /**
   * Traffic along edges on a step.
   */
  Packet,

  /**
   * A request travelling hop by hop, one hop per step.
   */
  Journey,

  /**
   * One hop of a journey.
   */
  Hop,

  /**
   * A change of a node's or an edge's emphasis from a step on.
   */
  State,

  /**
   * A range of steps that dims all but some nodes.
   */
  Focus,

  /**
   * Actors and the messages between them, in order.
   */
  SequenceDiagram,

  /**
   * A participant of a sequence diagram.
   */
  Actor,

  /**
   * A message of a sequence diagram.
   */
  Message,

  /**
   * Milestones in time order.
   */
  Timeline,

  /**
   * One milestone of a timeline.
   */
  Milestone,

  /**
   * A stacked architecture.
   */
  Layers,

  /**
   * One band of a layer stack.
   */
  Layer,

  /**
   * A building block in a layer.
   */
  Item,

  /**
   * A loop of stages on a ring.
   */
  Cycle,

  /**
   * A hierarchy of nested nodes.
   */
  Tree,

  /**
   * An imported SVG with brand colors and step reveals.
   */
  Svg,
};
