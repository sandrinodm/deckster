/**
 * The kit's diagrams for TSX slides: `import { Flow, Node, Edge } from '@deckster/kit/diagrams'`.
 * MDX slides get the same components without imports. The diagram components load their code on
 * first use (and ELK only for an automatic layout); the parts are tiny descriptors the diagrams
 * read. In TSX a node's `kind` icon is resolved at run time from the brand's icon set; give `icon`
 * an icon component (`import Rocket from '~icons/lucide/rocket'`) for another one, or `"none"`.
 */
export {
  Cycle,
  Flow,
  Layers,
  SequenceDiagram,
  Svg,
  Timeline,
  Tree,
} from '#diagrams/lazy-diagrams.tsx';
export {
  Edge,
  Focus,
  Group,
  Hop,
  Journey,
  Node,
  Packet,
  State,
  type EdgeFlowProps,
  type EdgeProps,
  type FocusProps,
  type GroupProps,
  type HopProps,
  type IconComponent,
  type JourneyProps,
  type NodeProps,
  type PacketLookProps,
  type PacketProps,
  type StateProps,
} from '#diagrams/flow-parts.tsx';
export {
  Actor,
  Item,
  Layer,
  Message,
  Milestone,
  type ActorProps,
  type ItemProps,
  type LayerProps,
  type MessageProps,
  type MilestoneProps,
} from '#diagrams/form-parts.tsx';
export type { CycleProps } from '#diagrams/cycle.tsx';
export type { FlowProps } from '#diagrams/flow.tsx';
export type { LayersProps } from '#diagrams/layers.tsx';
export type { SequenceDiagramProps } from '#diagrams/sequence.tsx';
export type { SvgProps } from '#diagrams/svg.tsx';
export type { TimelineProps } from '#diagrams/timeline.tsx';
export type { TreeProps } from '#diagrams/tree.tsx';
