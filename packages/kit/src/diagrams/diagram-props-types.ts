import type { CycleProps } from '#diagrams/cycle.tsx';
import type { EdgeFlowTable, PropTables } from '#diagrams/diagram-props.ts';
import type {
  EdgeFlowProps,
  EdgeProps,
  FocusProps,
  GroupProps,
  HopProps,
  JourneyProps,
  NodeProps,
  PacketProps,
  StateProps,
} from '#diagrams/flow-parts.tsx';
import type { FlowProps } from '#diagrams/flow.tsx';
import type {
  ActorProps,
  ItemProps,
  LayerProps,
  MessageProps,
  MilestoneProps,
} from '#diagrams/form-parts.tsx';
import type { LayersProps } from '#diagrams/layers.tsx';
import type { SequenceDiagramProps } from '#diagrams/sequence.tsx';
import type { SvgProps } from '#diagrams/svg.tsx';
import type { TimelineProps } from '#diagrams/timeline.tsx';
import type { TreeProps } from '#diagrams/tree.tsx';

/**
 * `true` when a prop table names exactly the props of a TypeScript props type.
 */
type SameKeys<Table, Props> = [keyof Table] extends [keyof Required<Props>]
  ? [keyof Required<Props>] extends [keyof Table]
    ? true
    : false
  : false;

/**
 * Fails to compile unless its argument is `true`.
 */
type Expect<Check extends true> = Check;

/**
 * The compile-time check that the prop schema (`diagram-props.ts`) and the components' props types
 * agree, prop for prop. It lives apart from the schema so the schema stays free of `.tsx` imports
 * for Node code (the CLI) that reads it; only the kit's typecheck compiles this file.
 */
export type PropTablesMatchTypes = [
  Expect<SameKeys<PropTables['Flow'], Omit<FlowProps, 'positions'>>>,
  Expect<SameKeys<PropTables['Node'], NodeProps>>,
  Expect<SameKeys<PropTables['Group'], GroupProps>>,
  Expect<SameKeys<PropTables['Edge'], EdgeProps>>,
  Expect<SameKeys<EdgeFlowTable, EdgeFlowProps>>,
  Expect<SameKeys<PropTables['Packet'], PacketProps>>,
  Expect<SameKeys<PropTables['Journey'], JourneyProps>>,
  Expect<SameKeys<PropTables['Hop'], HopProps>>,
  Expect<SameKeys<PropTables['State'], StateProps>>,
  Expect<SameKeys<PropTables['Focus'], FocusProps>>,
  Expect<SameKeys<PropTables['SequenceDiagram'], SequenceDiagramProps>>,
  Expect<SameKeys<PropTables['Actor'], ActorProps>>,
  Expect<SameKeys<PropTables['Message'], MessageProps>>,
  Expect<SameKeys<PropTables['Timeline'], TimelineProps>>,
  Expect<SameKeys<PropTables['Milestone'], MilestoneProps>>,
  Expect<SameKeys<PropTables['Layers'], LayersProps>>,
  Expect<SameKeys<PropTables['Layer'], LayerProps>>,
  Expect<SameKeys<PropTables['Item'], ItemProps>>,
  Expect<SameKeys<PropTables['Cycle'], CycleProps>>,
  Expect<SameKeys<PropTables['Tree'], TreeProps>>,
  Expect<SameKeys<PropTables['Svg'], SvgProps>>,
];
