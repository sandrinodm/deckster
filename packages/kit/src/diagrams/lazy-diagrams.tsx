import { useReadyHold } from '@deckster/engine';
import {
  Children,
  isValidElement,
  lazy,
  Suspense,
  type ComponentType,
  type ReactNode,
} from 'react';

import type { CycleProps } from '#diagrams/cycle.tsx';
import type { FlowProps } from '#diagrams/flow.tsx';
import type { LayersProps } from '#diagrams/layers.tsx';
import type { SequenceDiagramProps } from '#diagrams/sequence.tsx';
import type { SvgProps } from '#diagrams/svg.tsx';
import type { TimelineProps } from '#diagrams/timeline.tsx';
import type { TreeProps } from '#diagrams/tree.tsx';

import { StepMarks } from '#code/step-marks.tsx';
import { PART_NAMES } from '#diagrams/flow-parts.tsx';

/**
 * A diagram component that loads its code the first time a slide renders it, holding the slide's
 * `ready()` meanwhile, so decks without diagrams never download the layout, routing and motion
 * code, and slides without an automatic layout never download ELK.
 *
 * @param load - Imports the component.
 * @returns The component to register.
 */
function lazyDiagram<Props extends object>(
  load: () => Promise<ComponentType<Props>>,
): (props: Props) => ReactNode {
  const Loaded = lazy(async () => ({ default: await load() }));
  return function LazyDiagram(props: Props): ReactNode {
    return (
      <Suspense fallback={<Pending steps={declaredSteps(props)} />}>
        <Loaded {...props} />
      </Suspense>
    );
  };
}

/**
 * Props of {@link Pending}.
 */
type PendingProps = {
  /**
   * The steps the diagram's props declare.
   */
  steps: readonly number[];
};

/**
 * Holds the slide's readiness while a diagram's code loads, keeping its place in the layout, and
 * declares the steps the diagram will have, so a deck told to go to a step of this slide before the
 * code arrives (`window.__deck.goto(slide, 4)` right after load) lands on it rather than on step 0.
 */
function Pending({ steps }: PendingProps): ReactNode {
  useReadyHold(true);
  return (
    <figure className="kit-diagram" data-ready="false" aria-hidden="true">
      <StepMarks ats={steps} />
    </figure>
  );
}

/**
 * The first step of a diagram, which a prop without an `at` reveals at.
 */
const FIRST_STEP = 1;

/**
 * How many steps a `back` path adds beyond its hops: one there and one back.
 */
const BACK_TRIP_HOPS = 2;

/**
 * What separates the places of a `path` prop, such as `"a b, c"`.
 */
const PATH_SEPARATOR = /[\s,]+/;

/**
 * The props of a diagram child that can declare steps.
 */
type StepChildProps = {
  /**
   * The step that reveals it.
   */
  at?: unknown;

  /**
   * The places a message or packet travels through, separated by spaces or commas.
   */
  path?: unknown;

  /**
   * Whether the path goes back as well as forward.
   */
  back?: unknown;

  /**
   * `trip` for a single journey that does not step per hop.
   */
  pace?: unknown;

  /**
   * The child's own children.
   */
  children?: ReactNode;
};

/**
 * The steps a diagram's props declare, read without its code: every `at` in its children, each hop
 * of a journey, each stage of a stepped cycle and the values of an `<Svg>`'s `steps`. The deck
 * counts one step per distinct value, so these must be the same values the loaded diagram declares
 * itself once it renders.
 *
 * @param props - The diagram's props.
 */
export function declaredSteps(props: object): number[] {
  const found = new Set<number>();
  const record = props as { steps?: unknown; children?: ReactNode };
  addStepValues(record.steps, found);

  let stages = 0;
  /**
   * Collects the steps of some children and of everything inside them.
   */
  const visit = (children: ReactNode, depth: number): void => {
    for (const child of Children.toArray(children)) {
      if (!isValidElement(child)) {
        continue;
      }

      const inner = child.props as StepChildProps;
      if (depth === 0) {
        stages += 1;
      }

      const at = typeof inner.at === 'number' ? inner.at : undefined;
      if (at !== undefined) {
        found.add(at);
      }

      addPathSteps(inner, at, found);
      if (PART_NAMES.get(child.type) === 'Journey') {
        addJourneySteps(inner.children, at, found);
      }

      visit(inner.children, depth + 1);
    }
  };
  visit(record.children, 0);
  if (record.steps === true) {
    for (let stage = FIRST_STEP; stage <= stages; stage += 1) {
      found.add(stage);
    }
  }

  return [...found].filter((step) => step > 0);
}

/**
 * Adds the values of an object-valued `steps` prop, such as `<Svg>`'s, to the steps found.
 *
 * @param steps - The prop as written.
 * @param found - The steps found so far, added to in place.
 */
function addStepValues(steps: unknown, found: Set<number>): void {
  if (typeof steps !== 'object' || steps === null) {
    return;
  }

  for (const value of Object.values(steps)) {
    if (typeof value === 'number') {
      found.add(value);
    }
  }
}

/**
 * Adds every step a child's path reveals: one per hop, and twice as many when it comes back.
 *
 * @param inner - The child's props.
 * @param at - The step the child starts at, when it has one.
 * @param found - The steps found so far, added to in place.
 */
function addPathSteps(inner: StepChildProps, at: number | undefined, found: Set<number>): void {
  const path =
    typeof inner.path === 'string' ? inner.path.split(PATH_SEPARATOR).filter(Boolean) : [];
  if (path.length <= 1 || inner.pace === 'trip') {
    return;
  }

  const hops = (path.length - 1) * (inner.back === true ? BACK_TRIP_HOPS : 1);
  for (let hop = 0; hop < hops; hop += 1) {
    found.add((at ?? FIRST_STEP) + hop);
  }
}

/**
 * Adds the step of each hop of a journey: its own `at`, or the step after the previous hop.
 *
 * @param children - The journey's hops.
 * @param at - The step the journey starts at, when it has one.
 * @param found - The steps found so far, added to in place.
 */
function addJourneySteps(children: ReactNode, at: number | undefined, found: Set<number>): void {
  let next = at ?? FIRST_STEP;
  for (const hop of Children.toArray(children)) {
    const hopAt = isValidElement(hop) ? (hop.props as { at?: unknown }).at : undefined;
    const step = typeof hopAt === 'number' ? hopAt : next;
    found.add(step);
    next = step + 1;
  }
}

/**
 * `<Flow>`, loaded on first use.
 */
export const Flow = lazyDiagram<FlowProps>(async () => (await import('#diagrams/flow.tsx')).Flow);

/**
 * `<Tree>`, loaded on first use.
 */
export const Tree = lazyDiagram<TreeProps>(async () => (await import('#diagrams/tree.tsx')).Tree);

/**
 * `<Cycle>`, loaded on first use.
 */
export const Cycle = lazyDiagram<CycleProps>(
  async () => (await import('#diagrams/cycle.tsx')).Cycle,
);

/**
 * `<SequenceDiagram>`, loaded on first use.
 */
export const SequenceDiagram = lazyDiagram<SequenceDiagramProps>(
  async () => (await import('#diagrams/sequence.tsx')).SequenceDiagram,
);

/**
 * `<Timeline>`, loaded on first use.
 */
export const Timeline = lazyDiagram<TimelineProps>(
  async () => (await import('#diagrams/timeline.tsx')).Timeline,
);

/**
 * `<Layers>`, loaded on first use.
 */
export const Layers = lazyDiagram<LayersProps>(
  async () => (await import('#diagrams/layers.tsx')).Layers,
);

/**
 * `<Svg>`, loaded on first use.
 */
export const Svg = lazyDiagram<SvgProps>(async () => (await import('#diagrams/svg.tsx')).Svg);
