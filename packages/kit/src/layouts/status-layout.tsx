import { defineLayout, useStatic, type LayoutProps } from '@deckster/engine';
import { useId, useRef, type CSSProperties, type ReactNode } from 'react';

import type {
  StatusEntry,
  StatusLabels,
  statusLayoutContract,
} from '#layouts/status-layout.contract.ts';

import { Pill } from '#foundation/badges.tsx';
import { MEASURE_TOLERANCE_PX } from '#foundation/layout-geometry.ts';
import { KitMark } from '#foundation/marks.tsx';
import {
  enterProps,
  Footnote,
  Frame,
  Region,
  SlideHeader,
  smartPunctuation,
  Step,
  useEnter,
  useFitLevel,
} from '#layout-parts.ts';
import '#layouts/status-layout.css';

/**
 * The entrance order after the header and the line of context.
 */
const FIRST_ITEM_ORDER = 2;

/**
 * Semantic state colours; attention is neutral ink, reserving accent for selection.
 */
const STATUS_TONES = {
  /**
   * Work progressing to plan uses the positive role.
   */
  'on-track': 'positive',

  /**
   * Attention uses neutral ink, distinct from a blocked state.
   */
  'at-risk': 'neutral',

  /**
   * A blocking dependency uses the negative role.
   */
  blocked: 'negative',

  /**
   * Completed work recedes from the review.
   */
  done: 'muted',
} as const;

/**
 * Larger type and generous rows are tried first; a full report steps down as one unit. No text is
 * truncated, so the last level still exposes excess content to lint. The context follows the body
 * and small steps to leave dense rows their minimum clear space.
 */
const STATUS_LEVELS = [
  { text: 'body', space: 'stretched' },
  { text: 'body', space: 'roomy' },
  { text: 'small', space: 'snug' },
  { text: 'small', space: 'trimmed' },
  { text: 'small', space: 'compact' },
  { text: 'caption', space: 'tight' },
] as const;

/**
 * One whole-report type and spacing choice from the fit ladder.
 */
type StatusLevel = (typeof STATUS_LEVELS)[number];

/**
 * A workstream report on a shared column grid. Hidden steps retain their space, so the fit and
 * alignment are chosen for the full report and hold throughout the build.
 */
function StatusLayout({ frontmatter, slots }: LayoutProps<typeof statusLayoutContract>): ReactNode {
  const isStatic = useStatic();
  const titleId = useId();
  const contextEnter = useEnter(1);
  const { items, reveal } = frontmatter;
  const region = useRef<HTMLDivElement>(null);
  const report = useRef<HTMLDivElement>(null);
  const hasOwner = items.some((item) => item.owner !== undefined);
  const key = JSON.stringify([
    items,
    frontmatter.title,
    frontmatter.labels,
    slots.body === undefined,
    slots.footnote === undefined,
  ]);
  const { level } = useFitLevel(region, report, STATUS_LEVELS.length, key, {
    height: reportHeight,
    restartOnFontLoad: true,
  });
  const size = STATUS_LEVELS[level] ?? STATUS_LEVELS[STATUS_LEVELS.length - 1]!;
  const style: CSSProperties & { '--kit-status-count': number } = {
    '--kit-status-count': items.length,
  };
  const labels = frontmatter.labels;
  return (
    <Frame
      layout="status"
      variant={{
        'data-count': String(items.length),
        'data-owner': String(hasOwner),
        'data-level': String(level),
        'data-space': size.space,
      }}>
      <SlideHeader
        eyebrow={frontmatter.eyebrow}
        title={frontmatter.title}
        titleId={titleId}
        maxLines={1}
      />
      {slots.body === undefined ? null : (
        <div className="kit-status-context kit-prose kit-body" {...contextEnter}>
          {slots.body}
        </div>
      )}
      <Region ref={region} className="kit-status-region" place="optical">
        <div
          ref={report}
          className="kit-status-report"
          style={style}
          role="table"
          aria-labelledby={titleId}>
          <div className="kit-status-head kit-type-label" role="row">
            <span className="kit-status-name-cell" role="columnheader">
              {smartPunctuation(labels.name)}
            </span>
            <span className="kit-status-state-cell" role="columnheader">
              {smartPunctuation(labels.status)}
            </span>
            {hasOwner ? (
              <span className="kit-status-owner" role="columnheader">
                {smartPunctuation(labels.owner)}
              </span>
            ) : null}
            <span className="kit-status-note" role="columnheader">
              {smartPunctuation(labels.note)}
            </span>
          </div>
          {items.map((item, index) => {
            const content = (
              <StatusRow
                key={index}
                item={item}
                first={index === 0}
                hasOwner={hasOwner}
                size={size}
                labels={labels}
                enter={enterProps(FIRST_ITEM_ORDER + index, isStatic)}
              />
            );
            return reveal ? (
              <Step key={index} at={index + 1}>
                {content}
              </Step>
            ) : (
              content
            );
          })}
        </div>
      </Region>
      <Footnote>{slots.footnote}</Footnote>
    </Frame>
  );
}

/**
 * The row's content, shared fit level, optional owner column and entrance attributes.
 */
type StatusRowProps = {
  /**
   * The decoded workstream.
   */
  item: StatusEntry;

  /**
   * Whether the header already supplies this row's top rule, including through Step wrappers.
   */
  first: boolean;

  /**
   * Whether any workstream has an owner, reserving the column for every row.
   */
  hasOwner: boolean;

  /**
   * The type steps and row spacing selected for the full report.
   */
  size: StatusLevel;

  /**
   * Author-supplied column and state labels, with English defaults for omitted keys.
   */
  labels: StatusLabels;

  /**
   * The workstream's entrance position, absent in static mode.
   */
  enter: ReturnType<typeof enterProps>;
};

/**
 * One named workstream, its explicit status label, owner and one-line update.
 */
function StatusRow({ item, first, hasOwner, size, labels, enter }: StatusRowProps): ReactNode {
  const owner = item.owner === undefined ? null : smartPunctuation(item.owner);
  return (
    <div
      className="kit-status-row"
      role="row"
      data-first={String(first)}
      data-status={item.status}
      {...enter}>
      <div className="kit-status-name-cell" role="rowheader">
        <h3 className="kit-status-name kit-heading kit-type-title" data-fit="scaled">
          {smartPunctuation(item.name)}
        </h3>
      </div>
      <div className="kit-status-state-cell" role="cell">
        <Pill
          className="kit-status-pill"
          tone={STATUS_TONES[item.status]}
          exception={item.status === 'at-risk' || item.status === 'blocked'}>
          <StatusMark status={item.status} />
          {smartPunctuation(labels[item.status])}
        </Pill>
      </div>
      {hasOwner ? (
        <p role="cell" className={`kit-status-owner kit-type-${size.text}`}>
          {owner}
        </p>
      ) : null}
      <p role="cell" className={`kit-status-note kit-type-${size.text}`}>
        {smartPunctuation(item.note)}
      </p>
    </div>
  );
}

/**
 * Distinct decorative silhouettes keep exceptions identifiable when surface hues converge.
 */
function StatusMark({ status }: { status: StatusEntry['status'] }): ReactNode {
  if (status !== 'blocked' && status !== 'at-risk') {
    return null;
  }

  return <KitMark kind={status === 'blocked' ? 'square' : 'triangle'} />;
}

/**
 * A one-line field overflowing its own track must step the whole report down even if it never
 * reaches the outer edge of the grid. Summing row heights measures what a stretched grid needs; the
 * grid itself stays as tall as its region. Offset measurements ignore reveal transforms.
 *
 * @param report - The grid holding the report's rows.
 */
function reportHeight(report: HTMLElement): number {
  const fields = Array.from(
    report.querySelectorAll<HTMLElement>(
      '.kit-status-name, .kit-status-owner, .kit-status-note, .kit-status-state-cell',
    ),
  );
  if (fields.some((field) => field.scrollWidth > field.clientWidth + MEASURE_TOLERANCE_PX)) {
    return Number.POSITIVE_INFINITY;
  }

  const rows = Array.from(
    report.querySelectorAll<HTMLElement>('.kit-status-head, .kit-status-row'),
  );
  return Math.max(
    report.scrollHeight,
    rows.reduce((height, row) => height + row.offsetHeight, 0),
  );
}

/**
 * The `status` layout's runtime component.
 */
export const statusLayout = defineLayout<typeof statusLayoutContract>({
  name: 'status',
  component: StatusLayout,
});
