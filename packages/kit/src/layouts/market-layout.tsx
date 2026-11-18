import { useBrand } from '@deckster/brand/runtime';
import { defineLayout, useStatic, type LayoutProps } from '@deckster/engine';
import { useId, useRef, type CSSProperties, type ReactNode } from 'react';

import type { MarketSizeEntry, marketLayoutContract } from '#layouts/market-layout.contract.ts';

import { useFitLevel } from '#foundation/fit-level.ts';
import { useFitGroupWidth } from '#foundation/fit-text.ts';
import { Footnote, Frame, Region, SlideHeader } from '#foundation/slide-parts.tsx';
import { smartPunctuation } from '#foundation/smart-punctuation.ts';
import { StatValue } from '#foundation/stat-figure.tsx';
import { marketAmount } from '#layouts/market-layout.contract.ts';
import { enterProps, useEnter, type EnterProps } from '#motion/enter.ts';
import { Step } from '#motion/step.tsx';
import '#layouts/market-layout.css';

/**
 * Large figures first; every level retains the label–figure–note stack.
 */
const LEVELS = ['roomy', 'normal', 'compact', 'dense'] as const;

/**
 * The minimum drawn diameter as a share of the whole; smaller markets disclose their exact share.
 */
const MIN_DIAMETER = 0.06;

/**
 * Circles closer than this cannot hold distinct labels; use the typographic ladder instead.
 */
const MIN_RING_GAP = 0.14;

/**
 * Smaller circles use a leader label, leaving their area free of type.
 */
const INSIDE_LABEL_DIAMETER = 0.45;

/**
 * A small part deserves an explicit share of its parent beside its diagram label.
 */
const SMALL_PARENT_SHARE = 0.05;

/**
 * SVG coordinates keep the leader geometry independent of the brand's type and spacing.
 */
const PLOT_UNITS = 1000;

/**
 * The middle callout's vertical position within the square diagram.
 */
const MIDDLE_CALLOUT_Y = 0.55;

/**
 * The inner callout's vertical position, clear of the middle label even at full stress.
 */
const INNER_CALLOUT_Y = 0.9;

/**
 * Callout markers need only a visible gap, because their labels sit outside the circles.
 */
const MIN_CALLOUT_GAP = 0.02;

/**
 * The minimum marker must remain visibly smaller than its enclosing circle.
 */
const MIN_PARENT_DIAMETER_RATIO = 0.6;

/**
 * The smallest reported percentage; smaller values keep an explicit upper bound.
 */
const MIN_DISPLAYED_PERCENT = 0.1;

/**
 * The leader starts horizontally before turning towards its external label.
 */
const LEADER_BEND_UNITS = 30;

/**
 * Converts a unit share to a percentage.
 */
const PERCENT = 100;

/**
 * The circles and their labels, expressed as shares of the whole.
 */
type MarketCircle = {
  /**
   * The visible diameter as a share of the whole circle's diameter.
   */
  diameter: number;

  /**
   * The exact area share, retained even when the visible diameter has a minimum.
   */
  share: number;

  /**
   * The exact fraction of the enclosing market, to identify very small segments.
   */
  parentShare: number;

  /**
   * Whether the label sits beside the circle on a leader rather than inside it.
   */
  callout: boolean;

  /**
   * The label's vertical centre, in units of the outer circle's diameter.
   */
  labelY: number;

  /**
   * Whether the visible marker is larger than the exact area would make it.
   */
  enlarged: boolean;
};

/**
 * The stylesheet receives quantities only; brand tokens provide all visual styling.
 */
type MarketStyle = CSSProperties & {
  '--kit-market-count'?: number;
  '--kit-market-diameter'?: string;
  '--kit-market-label-y'?: string;
};

/**
 * Bottom-tangent circles carry the numeric relationship; the right-hand list gives every size the
 * same typographic stack. Small circles use leader labels instead of squeezing text into the area.
 * Close sizes take a figure ladder, so labels never imply a false gap. Reveal geometry and figure
 * widths are fitted against the full content and remain fixed throughout the build.
 */
function MarketLayout({ frontmatter, slots }: LayoutProps<typeof marketLayoutContract>): ReactNode {
  const { sizes, reveal } = frontmatter;
  const titleId = useId();
  const isStatic = useStatic();
  const contextEnter = useEnter(1);
  const { surface } = useBrand();
  const lit = surface.name === 'accent' || surface.name === 'gradient' ? 'inverse' : 'accent';
  const region = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const circles = marketCircles(sizes);
  const key = JSON.stringify([
    sizes,
    frontmatter.title,
    slots.body === undefined,
    slots.footnote === undefined,
  ]);
  const { level } = useFitLevel(region, content, LEVELS.length, key, {
    height: marketHeight,
    restartOnFontLoad: true,
    overflow: true,
  });
  useFitGroupWidth(content, '.kit-market-value');
  const style: MarketStyle = { '--kit-market-count': sizes.length };
  const noteType = level >= 2 ? 'kit-type-small' : 'kit-type-body';
  return (
    <Frame
      layout="market"
      variant={{
        'data-count': String(sizes.length),
        'data-level': LEVELS[level],
        'data-drawing': circles === undefined ? 'ladder' : 'circles',
      }}>
      <SlideHeader
        titleId={titleId}
        eyebrow={frontmatter.eyebrow}
        title={frontmatter.title}
        maxLines={1}
      />
      {slots.body === undefined ? null : (
        <div className="kit-market-context kit-prose kit-body" {...contextEnter}>
          {slots.body}
        </div>
      )}
      <Region ref={region} className="kit-market-region">
        <div ref={content} className="kit-market" style={style}>
          {circles === undefined ? null : (
            <MarketPicture
              sizes={sizes}
              circles={circles}
              reveal={reveal}
              lit={lit}
              isStatic={isStatic}
              labels={frontmatter.labels}
            />
          )}
          <ol className="kit-market-sizes" aria-labelledby={titleId}>
            {sizes.map((size, index) => {
              const row = (
                <SizeRow
                  size={size}
                  lit={index === sizes.length - 1 ? lit : undefined}
                  noteType={noteType}
                  enter={enterProps(index + 2, isStatic)}
                />
              );
              return (
                <li key={index} className="kit-market-entry">
                  {reveal ? <Step at={index + 1}>{row}</Step> : row}
                </li>
              );
            })}
          </ol>
        </div>
      </Region>
      <Footnote>{slots.footnote}</Footnote>
    </Frame>
  );
}

/**
 * The picture is decorative because the ordered list carries all labels and exact figures. Each
 * shape and its label share the corresponding figure's reveal step.
 *
 * @param props - The decoded sizes, geometry, reveal setting, target surface and entrance mode.
 */
function MarketPicture({
  sizes,
  circles,
  reveal,
  lit,
  isStatic,
  labels,
}: {
  sizes: readonly MarketSizeEntry[];
  circles: readonly MarketCircle[];
  reveal: boolean;
  lit: string;
  isStatic: boolean;
  labels: LayoutProps<typeof marketLayoutContract>['frontmatter']['labels'];
}): ReactNode {
  return (
    <div className="kit-market-picture" aria-hidden="true" data-decorative="">
      {circles.map((circle, index) => {
        const drawing = (
          <MarketShape
            size={sizes[index]!}
            circle={circle}
            parent={sizes[Math.max(0, index - 1)]!.value}
            labels={labels}
            lit={index === sizes.length - 1 ? lit : undefined}
            enter={enterProps(index + 2, isStatic)}
          />
        );
        return reveal ? (
          <Step key={index} at={index + 1} effect="fade">
            {drawing}
          </Step>
        ) : (
          <div key={index} className="kit-market-shape-entry">
            {drawing}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Converts area ratios to diameter ratios. A ladder is more honest than overlapping labels for
 * almost equal scopes, and preserves preformatted figures that cannot supply an exact area.
 *
 * @param sizes - The nested market figures, largest first.
 */
export function marketCircles(sizes: readonly MarketSizeEntry[]): MarketCircle[] | undefined {
  const amounts = sizes.map((size) => marketAmount(size.value));
  const whole = amounts[0];
  if (
    whole === undefined ||
    amounts.some((amount) => amount === undefined || amount.unit !== whole.unit)
  ) {
    return undefined;
  }

  let parent = whole.amount;
  let previousDiameter = 1 + MIN_RING_GAP;
  const circles: MarketCircle[] = [];
  for (const amount of amounts) {
    if (amount === undefined || amount.amount > parent) {
      return undefined;
    }

    const share = amount.amount / whole.amount;
    const exactDiameter = Math.sqrt(share);
    const minimumDiameter = Math.min(MIN_DIAMETER, previousDiameter * MIN_PARENT_DIAMETER_RATIO);
    const diameter = Math.max(minimumDiameter, exactDiameter);
    const callout = diameter < INSIDE_LABEL_DIAMETER;
    const gap = callout ? MIN_CALLOUT_GAP : MIN_RING_GAP;
    if (circles.length > 0 && previousDiameter - diameter < gap) {
      return undefined;
    }

    circles.push({
      diameter,
      share,
      parentShare: amount.amount / parent,
      callout,
      labelY: 0,
      enlarged: diameter > exactDiameter,
    });
    parent = amount.amount;
    previousDiameter = diameter;
  }

  return circles.map((circle, index) => {
    const next = circles[index + 1];
    // Internal labels occupy the open band between this ring's top and the next ring's top.
    const bandCentre = 1 - (circle.diameter + (next?.diameter ?? 0)) / 2;
    const calloutY = next?.callout === true ? MIDDLE_CALLOUT_Y : INNER_CALLOUT_Y;
    return { ...circle, labelY: circle.callout ? calloutY : bandCentre };
  });
}

/**
 * A stretched region is measured through its actual list, not the square illustration.
 *
 * @param content - The picture and the complete list, including unrevealed rows.
 */
function marketHeight(content: HTMLElement): number {
  return (
    content.querySelector<HTMLElement>('.kit-market-sizes')?.offsetHeight ?? content.offsetHeight
  );
}

/**
 * A proportional circle plus a native-text label; a leader keeps tiny circles visible and legible.
 *
 * @param props - The size, its area geometry, its position and its optional nested accent surface.
 */
function MarketShape({
  size,
  circle,
  parent,
  labels,
  lit,
  enter,
}: {
  size: MarketSizeEntry;
  circle: MarketCircle;
  parent: string | number;
  labels: LayoutProps<typeof marketLayoutContract>['frontmatter']['labels'];
  lit: string | undefined;
  enter: EnterProps;
}): ReactNode {
  const labelY = circle.labelY;
  const style: MarketStyle = {
    '--kit-market-diameter': `${circle.diameter * PERCENT}%`,
    '--kit-market-label-y': `${labelY * PERCENT}%`,
  };
  const showShare = circle.parentShare < SMALL_PARENT_SHARE || circle.share < MIN_DIAMETER ** 2;
  const share = circle.parentShare * PERCENT;
  const shareText = share < MIN_DISPLAYED_PERCENT ? '<0.1%' : `${Number(share.toFixed(1))}%`;
  const shareLabel = labels.share
    .replaceAll('{share}', shareText)
    .replaceAll('{parent}', String(parent));
  const left = ((1 - circle.diameter) * PLOT_UNITS) / 2;
  const middle = (1 - circle.diameter / 2) * PLOT_UNITS;
  return (
    <div
      className="kit-market-drawing"
      style={style}
      data-callout={String(circle.callout)}
      data-lit={lit === undefined ? undefined : ''}
      {...enter}>
      <div className="kit-market-circle" data-surface={lit} />
      {circle.callout ? (
        <svg
          className="kit-market-leader"
          viewBox={`0 0 ${PLOT_UNITS} ${PLOT_UNITS}`}
          focusable="false">
          <path
            d={`M ${left} ${middle} H ${left - LEADER_BEND_UNITS} L 0 ${labelY * PLOT_UNITS}`}
          />
        </svg>
      ) : null}
      <div
        className="kit-market-shape-label kit-type-label"
        data-surface={circle.callout ? undefined : lit}>
        <span>{smartPunctuation(size.label)}</span>
        {showShare ? (
          <span className="kit-market-share kit-numeric">{smartPunctuation(shareLabel)}</span>
        ) : null}
        {circle.enlarged ? (
          <span className="kit-market-share">{smartPunctuation(labels.minimum)}</span>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Every size uses the same label, figure and one-line note arrangement. An opaque nested surface
 * gives the winning segment a stable background, including on brands with slide artwork.
 *
 * @param props - The size, optional target surface, note type and entrance order.
 */
function SizeRow({
  size,
  lit,
  noteType,
  enter,
}: {
  size: MarketSizeEntry;
  lit: string | undefined;
  noteType: string;
  enter: EnterProps;
}): ReactNode {
  return (
    <section className="kit-market-size" data-surface={lit} {...enter}>
      <h3 className="kit-market-label kit-heading kit-type-title" data-fit="scaled">
        {smartPunctuation(size.label)}
      </h3>
      <StatValue value={size.value} className="kit-market-value" />
      <p className={`kit-market-note ${noteType}`}>{smartPunctuation(size.note)}</p>
    </section>
  );
}

/**
 * The `market` layout's runtime component.
 */
export const marketLayout = defineLayout<typeof marketLayoutContract>({
  name: 'market',
  component: MarketLayout,
});
