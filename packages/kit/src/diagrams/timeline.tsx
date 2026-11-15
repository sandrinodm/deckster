import { useReadyHold, useStep } from '@deckster/engine';
import {
  Children,
  isValidElement,
  useId,
  useMemo,
  useRef,
  type CSSProperties,
  type ReactNode,
} from 'react';

import type { DiagramDescription } from '#diagrams/diagram-description.ts';
import type { IconComponent } from '#diagrams/flow-parts.tsx';
import type { DiagramState } from '#diagrams/flow-spec.ts';

import { StepMarks } from '#code/step-marks.tsx';
import { describeDiagram, type DescribeInput } from '#diagrams/describe-diagram.ts';
import { offsetWithin } from '#diagrams/describe-dom.ts';
import { DiagramFrame } from '#diagrams/diagram-frame.tsx';
import { assertDiagramProps, normalizeState } from '#diagrams/diagram-props.ts';
import { count } from '#diagrams/diagram-summary.ts';
import { Milestone, type MilestoneProps } from '#diagrams/form-parts.tsx';
import { useDiagramDescription } from '#diagrams/use-description.ts';
import { useElementSize } from '#diagrams/use-element-size.ts';
import { smartPunctuation } from '#foundation/smart-punctuation.ts';

/**
 * Characters an id cannot keep: everything but the lower-case letters and digits of a `useId()`.
 */
const NON_ID_CHARACTERS = /[^a-z0-9]/gi;

/**
 * Props of {@link Timeline}.
 */
export type TimelineProps = {
  /**
   * An id for the export description.
   */
  id?: string;

  /**
   * What it shows, in a few words: its accessible name.
   */
  title: string;

  /**
   * A fixed height in canvas pixels; without it the timeline fills its region.
   */
  height?: number;

  /**
   * The `<Milestone>`s, in time order.
   */
  children?: ReactNode;
};

/**
 * Milestones along a line, in time order: the date above, the title and a line of detail below.
 * Reveal them by step with `at`; the line fills in the accent up to the latest one shown (or the
 * one marked `current`), which is ringed, so the room sees how far along we are.
 *
 * ```mdx
 * <Timeline title="From monolith to cells">
 *   <Milestone date="Q1" title="Split checkout" at={1}>Orders service live</Milestone>
 *   <Milestone date="Q2" title="Move payments" at={2} />
 * </Timeline>
 * ```
 */
export function Timeline({ id, title, height, children }: TimelineProps): ReactNode {
  const milestones = useMemo(() => readMilestones(children), [children]);
  const step = useStep();
  const root = useRef<HTMLElement | null>(null);
  const size = useElementSize(root);
  useReadyHold(size === undefined);
  const shown = milestones.map((milestone) => milestone.at === undefined || milestone.at <= step);
  const latest = shown.lastIndexOf(true);
  const current = currentIndex(milestones, shown, latest, step);
  const progressShare = Math.max(0, Math.min(current, latest)) / latest;
  const summary = timelineSummary(
    milestones.filter((_, index) => shown[index] === true),
    milestones[current],
  );
  const generated = useId();
  const diagramId = id ?? `timeline-${generated.replace(NON_ID_CHARACTERS, '')}`;
  const describe =
    size === undefined
      ? undefined
      : () => describeTimeline(root.current as HTMLElement, { id: diagramId, step, summary });
  useDiagramDescription(root, describe);
  return (
    <DiagramFrame
      ref={root}
      kind="timeline"
      title={title}
      summary={summary}
      ready={size !== undefined}
      height={height}
      live={milestones[current] === undefined ? undefined : `Now: ${milestones[current]?.title}.`}
      data={{
        'data-diagram-id': diagramId,
        'data-diagram-nodes': String(shown.filter(Boolean).length),
      }}>
      <StepMarks
        ats={[
          ...new Set(
            milestones.flatMap((milestone) => (milestone.at === undefined ? [] : [milestone.at])),
          ),
        ]}
      />
      <div
        className="kit-timeline"
        style={{ '--kit-timeline-count': milestones.length } as CSSProperties}>
        {latest < 1 ? null : (
          <div
            className="kit-timeline-axis"
            aria-hidden="true"
            style={{ '--kit-timeline-last': latest } as CSSProperties}>
            <div
              className="kit-timeline-progress"
              style={{ '--kit-timeline-share': progressShare } as CSSProperties}
            />
          </div>
        )}
        {milestones.map((milestone, index) => {
          const Icon = milestone.icon;
          return (
            <div
              key={`${milestone.date}-${index}`}
              className="kit-timeline-item"
              data-diagram-part="milestone"
              data-state={milestoneState(index, current, milestone.state)}
              data-visible={String(shown[index] === true)}>
              <span className="kit-timeline-date kit-type-label">{milestone.date}</span>
              <span className="kit-timeline-dot" aria-hidden="true">
                {Icon === undefined ? null : <Icon aria-hidden="true" focusable="false" />}
              </span>
              <div className="kit-timeline-text">
                <span className="kit-timeline-title kit-type-small">
                  {smartPunctuation(milestone.title)}
                </span>
                {milestone.children === undefined ? null : (
                  <span className="kit-timeline-detail kit-type-caption">{milestone.children}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </DiagramFrame>
  );
}

/**
 * A milestone as the timeline keeps it.
 */
type ParsedMilestone = Omit<MilestoneProps, 'icon'> & {
  /**
   * The resolved icon.
   */
  icon?: IconComponent;
};

/**
 * Reads the milestones.
 *
 * @param children - The timeline's children.
 * @throws Error for anything other than a `<Milestone>`.
 */
function readMilestones(children: ReactNode): ParsedMilestone[] {
  return Children.toArray(children).flatMap((child): ParsedMilestone[] => {
    if (!isValidElement(child)) {
      return [];
    }

    if (child.type !== Milestone) {
      throw new Error(
        'A <Timeline> holds only <Milestone>s, in time order; move anything else out of it.',
      );
    }

    assertDiagramProps('Milestone', child.props as Record<string, unknown>);
    const { icon, state, ...props } = child.props as MilestoneProps;
    const normalized = normalizeState(state) as DiagramState | undefined;
    return [
      {
        ...props,
        ...(normalized === undefined ? {} : { state: normalized }),
        ...(typeof icon === 'function' ? { icon } : {}),
      },
    ];
  });
}

/**
 * How a milestone is drawn: the current one ringed, its own state if it has one, else done or to
 * come.
 *
 * @param index - The milestone's place.
 * @param current - The current milestone's place.
 * @param state - The milestone's own state.
 */
function milestoneState(index: number, current: number, state: DiagramState | undefined): string {
  if (index === current) {
    return 'current';
  }

  if (state !== undefined) {
    return state;
  }

  return index < current ? 'past' : 'future';
}

/**
 * The current milestone: the one marked `current` when it is shown, else the one the step reached
 * last when milestones have steps, else the marked one (shown or not) or, with no mark, the latest
 * shown.
 *
 * @param milestones - The milestones.
 * @param shown - Whether each milestone is shown at this step.
 * @param latest - The place of the last shown milestone; `-1` when none is.
 * @param step - The current step.
 * @returns Its index.
 */
function currentIndex(
  milestones: readonly ParsedMilestone[],
  shown: readonly boolean[],
  latest: number,
  step: number,
): number {
  const marked = milestones.findIndex((milestone) => milestone.current === true);
  if (marked !== -1 && shown[marked] === true) {
    return marked;
  }

  const stepped = steppedCurrent(milestones, step);
  if (stepped !== undefined) {
    return stepped;
  }

  return marked === -1 ? latest : marked;
}

/**
 * The milestone the step reached last, when milestones have steps.
 *
 * @param milestones - The milestones.
 * @param step - The current step.
 * @returns Its index; `undefined` when no milestone with a step has been reached.
 */
function steppedCurrent(milestones: readonly ParsedMilestone[], step: number): number | undefined {
  const index = milestones.findLastIndex(
    (milestone) => milestone.at !== undefined && milestone.at <= step,
  );
  return index === -1 ? undefined : index;
}

/**
 * Describes the timeline as it is drawn at this step: its shown milestones as boxes, and its axis
 * and filled progress as lines.
 *
 * @param element - The timeline's root.
 * @param state - The diagram's id, the step and its text summary.
 */
function describeTimeline(
  element: HTMLElement,
  state: { id: string; step: number; summary: string },
): DiagramDescription {
  return describeDiagram({
    element,
    kind: 'timeline',
    id: state.id,
    step: state.step,
    summary: state.summary,
    groups: [],
    nodes: [],
    edges: [],
    boxes: milestoneBoxes(element),
    lines: axisLines(element),
  });
}

/**
 * The shown milestones of a timeline, as boxes around their dots.
 *
 * @param element - The timeline's root.
 */
function milestoneBoxes(element: HTMLElement): NonNullable<DescribeInput['boxes']> {
  const items = Array.from(element.querySelectorAll('.kit-timeline-item'));
  return items.flatMap((item, index) => {
    const dot = item.querySelector('.kit-timeline-dot');
    if (dot === null || item.getAttribute('data-visible') !== 'true') {
      return [];
    }

    return [
      {
        id: `milestone-${index + 1}`,
        kind: 'milestone',
        state: item.getAttribute('data-state') ?? 'default',
        shape: dot,
        described: 'ellipse',
        texts: Array.from(item.querySelectorAll('.kit-timeline-date, .kit-timeline-text > *')),
      },
    ];
  });
}

/**
 * The text summary: each milestone shown, in order, and which one is current.
 *
 * @param shown - The milestones shown at this step.
 * @param current - The current milestone.
 */
function timelineSummary(
  shown: readonly ParsedMilestone[],
  current: ParsedMilestone | undefined,
): string {
  const items = shown.map((milestone) => `${milestone.date}: ${milestone.title}`);
  return [
    `${count(shown.length, 'milestone')}.`,
    items.length === 0 ? '' : `${items.join('; ')}.`,
    current === undefined ? '' : `Now: ${current.title}.`,
  ]
    .filter((sentence) => sentence !== '')
    .join(' ');
}

/**
 * The timeline's axis and the filled part of it, as lines through their middles.
 *
 * @param element - The timeline's root.
 */
function axisLines(element: HTMLElement): NonNullable<DescribeInput['lines']> {
  return (['axis', 'progress'] as const).flatMap((role) => {
    const line = element.querySelector(`.kit-timeline-${role}`);
    if (line === null) {
      return [];
    }

    const box = offsetWithin(line, element);
    const y = box.y + box.height / 2;
    return [
      {
        role,
        element: line,
        points: [
          { x: box.x, y },
          { x: box.x + box.width, y },
        ],
      },
    ];
  });
}
