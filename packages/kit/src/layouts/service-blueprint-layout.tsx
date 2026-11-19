import { defineLayout, useStepAt, type LayoutProps } from '@deckster/engine';
import { useId, type ReactNode } from 'react';

import type {
  serviceBlueprintLayoutContract,
  ServiceBlueprintStage,
} from '#layouts/service-blueprint-layout.contract.ts';

import { Footnote, Frame, Region, SlideHeader } from '#foundation/slide-parts.tsx';
import { smartPunctuation } from '#foundation/smart-punctuation.ts';
import { Step } from '#motion/step.tsx';
import '#layouts/service-blueprint-layout.css';

/**
 * The deck step that reveals work below the line.
 */
const BACKSTAGE_STEP = 1;

/**
 * The deck step that brings the owners and handoff into focus.
 */
const HANDOFF_STEP = 2;

/**
 * The stage fields each lane can print, in customer-facing service language.
 */
const LANE_TITLE = {
  /**
   * The visible action the customer takes.
   */
  customer: 'Customer action',

  /**
   * The part of delivery or support the customer can see.
   */
  frontstage: 'Frontstage',

  /**
   * The internal work that supports the service.
   */
  backstage: 'Backstage',

  /**
   * The person or role accountable for the stage.
   */
  owner: 'Responsible owner',
};

/**
 * Follows the service left to right and exposes the rows to screen readers as a table.
 */
function ServiceBlueprintLayout({
  frontmatter,
  slots,
}: LayoutProps<typeof serviceBlueprintLayoutContract>): ReactNode {
  const { eyebrow, title, stages, handoff, reveal } = frontmatter;
  const highlighted = useStepAt(reveal ? HANDOFF_STEP : undefined) !== 'hidden';
  const selected = highlighted ? handoff.stage - 1 : undefined;
  const titleId = useId();
  return (
    <Frame layout="service-blueprint">
      <SlideHeader eyebrow={eyebrow} title={title} titleId={titleId} />
      <Region className="kit-blueprint-region">
        <table className="kit-blueprint" aria-labelledby={titleId}>
          <thead>
            <tr>
              <th scope="col" className="kit-type-label">
                Service lanes
              </th>
              {stages.map((stage, index) => (
                <th scope="col" key={index} className="kit-type-title">
                  {smartPunctuation(stage.title)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <Lane field="customer" stages={stages} />
            <Lane field="frontstage" stages={stages} selected={selected} />
            <tr className="kit-blueprint-visibility">
              <th scope="row" className="kit-type-label">
                Line of visibility
              </th>
              {stages.map((_, index) => (
                <td key={index} data-handoff={index === selected ? '' : undefined}>
                  {index === handoff.stage - 1 ? (
                    <Handoff label={handoff.label} reveal={reveal} />
                  ) : null}
                </td>
              ))}
            </tr>
            <Lane
              field="backstage"
              stages={stages}
              selected={selected}
              at={reveal ? BACKSTAGE_STEP : undefined}
            />
            <Lane
              field="owner"
              stages={stages}
              selected={selected}
              at={reveal ? HANDOFF_STEP : undefined}
            />
          </tbody>
        </table>
      </Region>
      <Footnote>{slots.footnote}</Footnote>
    </Frame>
  );
}

/**
 * The blueprint runtime layout. Its contract requires a handoff at an existing stage.
 */
export const serviceBlueprintLayout = defineLayout<typeof serviceBlueprintLayoutContract>({
  name: 'service-blueprint',
  component: ServiceBlueprintLayout,
});

/**
 * The field a lane reads and its optional handoff column.
 */
type LaneProps = {
  /**
   * The stage property to read and label.
   */
  field: keyof typeof LANE_TITLE;

  /**
   * The blueprint stages, in chronological order.
   */
  stages: readonly ServiceBlueprintStage[];

  /**
   * The zero-based handoff stage, when highlighted.
   */
  selected?: number | undefined;

  /**
   * The step that reveals the lane, if any.
   */
  at?: number | undefined;
};

/**
 * Renders an accessible row of customer actions, service work or accountable owners.
 */
function Lane({ field, stages, selected, at }: LaneProps): ReactNode {
  return (
    <tr className="kit-blueprint-lane" data-lane={field}>
      <th scope="row" className="kit-type-label">
        <LaneText at={at} text={LANE_TITLE[field]} />
      </th>
      {stages.map((stage, index) => (
        <td
          key={index}
          className="kit-type-body"
          data-handoff={index === selected ? '' : undefined}>
          <LaneText at={at} text={stage[field]} />
        </td>
      ))}
    </tr>
  );
}

/**
 * Keeps lane cells aligned and reserves the final geometry before a reveal.
 */
function LaneText({ at, text }: { at: number | undefined; text: string }): ReactNode {
  const content = <span>{smartPunctuation(text)}</span>;
  return at === undefined ? (
    content
  ) : (
    <Step at={at} effect="fade">
      {content}
    </Step>
  );
}

/**
 * Draws the explicit handoff on the line; in a build it appears with the highlighted column.
 */
function Handoff({ label, reveal }: { label: string; reveal: boolean }): ReactNode {
  const mark = (
    <span className="kit-blueprint-handoff kit-type-label">
      <span aria-hidden="true">↓</span> {smartPunctuation(label)}
    </span>
  );
  return reveal ? (
    <Step at={HANDOFF_STEP} effect="fade">
      {mark}
    </Step>
  ) : (
    mark
  );
}
