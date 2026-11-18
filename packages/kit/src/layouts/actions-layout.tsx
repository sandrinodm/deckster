import { useBrand } from '@deckster/brand/runtime';
import { defineLayout, useStatic, type LayoutProps } from '@deckster/engine';
import { useId, useRef, type ReactNode } from 'react';

import type { actionsLayoutContract } from '#layouts/actions-layout.contract.ts';

import { Badge } from '#foundation/badges.tsx';
import { useFitLevel } from '#foundation/fit-level.ts';
import { Footnote, Frame, Region, SlideHeader } from '#foundation/slide-parts.tsx';
import { smartPunctuation } from '#foundation/smart-punctuation.ts';
import { enterProps, useEnter } from '#motion/enter.ts';
import { Step } from '#motion/step.tsx';
import '#layouts/actions-layout.css';

/**
 * Header and context precede the actions in the entrance.
 */
const FIRST_ACTION_ORDER = 2;

/**
 * Largest first: generous rows and lead type for light content, then progressively tighter rows.
 * All text steps together to preserve alignment and the one-line action.
 */
const ACTION_LEVELS = [
  { title: 'title', text: 'lead', space: 'stretched' },
  { title: 'title', text: 'lead', space: 'roomy' },
  { title: 'lead', text: 'body', space: 'roomy' },
  { title: 'lead', text: 'body', space: 'snug' },
  { title: 'body', text: 'small', space: 'roomy' },
  { title: 'body', text: 'small', space: 'snug' },
  { title: 'body', text: 'small', space: 'tight' },
  { title: 'body', text: 'small', space: 'compact' },
  { title: 'body', text: 'caption', space: 'compact' },
] as const;

/**
 * Accountable commitments in aligned action, owner and due columns. The same ladder is measured
 * against all the rows before any reveal, so columns and row heights hold across the build.
 */
function ActionsLayout({
  frontmatter,
  slots,
}: LayoutProps<typeof actionsLayoutContract>): ReactNode {
  const isStatic = useStatic();
  const { surface } = useBrand();
  const lit = surface.name === 'accent' || surface.name === 'gradient' ? 'inverse' : 'accent';
  const contextEnter = useEnter(1);
  const { actions, current, reveal, badge, labels } = frontmatter;
  const titleId = useId();
  const region = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const key = JSON.stringify([
    actions,
    current,
    badge,
    labels,
    frontmatter.title,
    slots.body === undefined,
    slots.footnote === undefined,
  ]);
  const { level } = useFitLevel(region, list, ACTION_LEVELS.length, key, {
    height: actionsHeight,
    restartOnFontLoad: true,
  });
  const size = ACTION_LEVELS[level] ?? ACTION_LEVELS[ACTION_LEVELS.length - 1]!;
  return (
    <Frame
      layout="actions"
      variant={{
        'data-count': String(actions.length),
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
        <div className="kit-actions-context kit-prose kit-body" {...contextEnter}>
          {slots.body}
        </div>
      )}
      <Region ref={region} className="kit-actions-region" place="optical">
        <div
          ref={list}
          className="kit-actions"
          role="table"
          aria-labelledby={titleId}
          style={
            size.space === 'stretched'
              ? { gridTemplateRows: `auto repeat(${actions.length}, minmax(min-content, 1fr))` }
              : undefined
          }>
          <div className="kit-actions-head kit-type-label" role="row">
            <Cell heading>{smartPunctuation(labels.action)}</Cell>
            <Cell heading>{smartPunctuation(labels.owner)}</Cell>
            <Cell heading>{smartPunctuation(labels.due)}</Cell>
          </div>
          {actions.map((action, index) => {
            const active = current === index + 1;
            const item = (
              <div
                key={index}
                className={`kit-action kit-type-${size.text}`}
                role="row"
                data-current={active ? '' : undefined}
                data-surface={active ? lit : undefined}
                data-first={index === 0 ? '' : undefined}
                data-last={index === actions.length - 1 ? '' : undefined}
                aria-current={active ? 'step' : undefined}
                {...enterProps(FIRST_ACTION_ORDER + index, isStatic)}>
                <Cell className="kit-action-what">
                  <h3 className={`kit-action-title kit-heading kit-type-${size.title}`}>
                    {smartPunctuation(action.title)}
                  </h3>
                </Cell>
                <Cell className="kit-action-owner">
                  <span>{smartPunctuation(action.owner)}</span>
                  {active ? (
                    <Badge className="kit-action-badge">{smartPunctuation(badge)}</Badge>
                  ) : null}
                </Cell>
                <Cell className="kit-action-due">{smartPunctuation(action.due)}</Cell>
              </div>
            );
            return reveal ? (
              <Step key={index} at={index + 1}>
                {item}
              </Step>
            ) : (
              item
            );
          })}
        </div>
      </Region>
      <Footnote>{slots.footnote}</Footnote>
    </Frame>
  );
}

/**
 * A subgrid cell, with header semantics when it labels a column.
 */
function Cell({
  heading = false,
  className,
  children,
}: {
  heading?: boolean;
  className?: string;
  children: ReactNode;
}): ReactNode {
  return (
    <div className={className} role={heading ? 'columnheader' : 'cell'}>
      {children}
    </div>
  );
}

/**
 * Measure every cell as well as the list: a long owner can cross into the due column without
 * reaching the list's edge. Such a level must step down even when the outer box still fits.
 */
function actionsHeight(list: HTMLElement): number {
  const cells = Array.from(
    list.querySelectorAll<HTMLElement>('[role="cell"], [role="columnheader"]'),
  );
  if (cells.some((cell) => cell.scrollWidth > cell.clientWidth)) {
    return Number.POSITIVE_INFINITY;
  }

  return list.scrollHeight;
}

/**
 * The `actions` layout's component.
 */
export const actionsLayout = defineLayout<typeof actionsLayoutContract>({
  name: 'actions',
  component: ActionsLayout,
});
