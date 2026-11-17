import { defineLayout, type LayoutProps } from '@deckster/engine';
import { useRef, type ReactNode } from 'react';

import type { FitRung } from '#foundation/fit-text.ts';
import type { ProofMetric, proofLayoutContract } from '#layouts/proof-layout.contract.ts';

import { useFitLevel } from '#foundation/fit-level.ts';
import { useFitGroupWidth } from '#foundation/fit-text.ts';
import { MonoMark } from '#foundation/mono-mark.tsx';
import { Portrait } from '#foundation/portrait.tsx';
import { stripQuoteMarks } from '#foundation/quote-marks.ts';
import { FittedText, Footnote, Frame, Region, SlideHeader } from '#foundation/slide-parts.tsx';
import { smartPunctuation } from '#foundation/smart-punctuation.ts';
import { StatValue } from '#foundation/stat-figure.tsx';
import { useEnter } from '#motion/enter.ts';
import { Step } from '#motion/step.tsx';
import '#layouts/proof-layout.css';

/**
 * The sizes the quote tries, as a share of the brand's quote style: smaller than on a quote slide,
 * since the title and the attribution share its column, stepping down to seven lines at the last.
 */
const PROOF_QUOTE_LADDER: readonly FitRung[] = [
  { scale: 0.72, maxLines: 4 },
  { scale: 0.64, maxLines: 5 },
  { scale: 0.56, maxLines: 6 },
  { scale: 0.5, maxLines: 7 },
];

/**
 * The sizes the metric stack tries, largest first, until it fits between the top and bottom lines:
 * as set; with the labels at the small size and less room between metrics; then with every figure a
 * step smaller.
 */
const PROOF_LEVELS = [
  { compact: false, small: false },
  { compact: true, small: false },
  { compact: true, small: true },
] as const;

/**
 * Selects the lead figure, which fits its width on its own.
 */
const LEAD_VALUE = '.kit-proof-metric[data-lead="true"] .kit-stat-value';

/**
 * Selects the other figures, which fit their width together, so they keep one size.
 */
const OTHER_VALUES = '.kit-proof-metric[data-lead="false"] .kit-stat-value';

/**
 * The entrance order of the quote; the header comes first.
 */
const QUOTE_ORDER = 1;

/**
 * The entrance order of the person under the quote.
 */
const PERSON_ORDER = 2;

/**
 * The entrance order of the metric stack when it is not revealed step by step.
 */
const STACK_ORDER = 3;

/**
 * The `proof` layout: one grid over the safe area. The shared header and the quote, with the person
 * who said it under it, take the left seven columns; the metrics stand in the right four on an
 * accent panel that the frame draws from the seam (the middle of the gutter after the seventh
 * column) to the top, right and bottom edges of the slide. The quote sits a little above the middle
 * of the space under the title, in the brand's quote style with hanging marks, stepping down until
 * it fits; the person under it has their portrait, or an accent rule without one, then the name and
 * role, then the customer's logo in one tone after a hairline. In the panel the timeframe heads the
 * stack, then the metrics under hairlines, the first set largest; each shows the figure before and
 * an arrow when it has one, above the lead's figure and on the baseline before the others'. With
 * `reveal`, the panel and the lead metric come in on step 1 and each other metric on the next step.
 * A stack that does not fit closes up, then sets its labels and figures a step smaller.
 */
function ProofLayout({ frontmatter, slots }: LayoutProps<typeof proofLayoutContract>): ReactNode {
  const { metrics, reveal } = frontmatter;
  const quoteEnter = useEnter(QUOTE_ORDER);
  const personEnter = useEnter(PERSON_ORDER);
  const stackEnter = useEnter(STACK_ORDER);
  const panelBox = useRef<HTMLDivElement>(null);
  const stack = useRef<HTMLDivElement>(null);
  const { level } = useFitLevel(panelBox, stack, PROOF_LEVELS.length, JSON.stringify(metrics), {
    overflow: true,
  });
  useFitGroupWidth(stack, LEAD_VALUE);
  useFitGroupWidth(stack, OTHER_VALUES);
  const size = PROOF_LEVELS[level] ?? { compact: true, small: true };
  // On a slide that is itself on the accent surface, an accent panel would vanish into it.
  const panelSurface = frontmatter.surface === 'accent' ? 'inverse' : 'accent';
  const panel = (
    <div
      className="kit-proof-panel"
      data-surface={panelSurface}
      aria-hidden="true"
      data-decorative=""
    />
  );
  const items = metrics.map((metric, index) => {
    const item = (
      <Metric
        key={index}
        metric={metric}
        lead={index === 0}
        small={size.small}
        surface={panelSurface}>
        {index === 0 && frontmatter.timeframe !== undefined ? (
          <p className="kit-proof-timeframe kit-type-label">
            {smartPunctuation(frontmatter.timeframe)}
          </p>
        ) : null}
      </Metric>
    );
    return reveal ? (
      <Step key={index} at={index + 1}>
        {item}
      </Step>
    ) : (
      item
    );
  });
  return (
    <Frame
      layout="proof"
      variant={{
        'data-count': String(metrics.length),
        'data-level': String(level),
        'data-portrait': String(frontmatter.photo !== undefined),
      }}
      bleed={reveal ? <Step at={1}>{panel}</Step> : panel}>
      <div className="kit-proof">
        <div className="kit-proof-head">
          <SlideHeader eyebrow={frontmatter.eyebrow} title={frontmatter.title} />
        </div>
        <Region className="kit-proof-region" place="optical">
          <figure className="kit-proof-quote">
            <div {...quoteEnter}>
              <FittedText
                as="blockquote"
                className="kit-proof-words kit-quote-text kit-heading kit-type-quote"
                ladder={PROOF_QUOTE_LADDER}
                boundary=".kit-proof-region">
                {stripQuoteMarks(slots.body)}
              </FittedText>
            </div>
            <figcaption className="kit-proof-person" {...personEnter}>
              {frontmatter.photo === undefined ? (
                <span className="kit-proof-rule" aria-hidden="true" data-decorative="" />
              ) : (
                <Portrait
                  className="kit-proof-portrait"
                  name={frontmatter.name}
                  photo={frontmatter.photo}
                  focal={frontmatter.focal}
                  treatment={frontmatter.treatment}
                />
              )}
              <span className="kit-proof-who">
                <span className="kit-proof-name kit-type-lead">
                  {smartPunctuation(frontmatter.name)}
                </span>
                {frontmatter.role === undefined ? null : (
                  <span className="kit-proof-role kit-type-small">
                    {smartPunctuation(frontmatter.role)}
                  </span>
                )}
              </span>
              {frontmatter.logo === undefined ? null : (
                <MonoMark
                  className="kit-proof-logo"
                  name={frontmatter.logo.name}
                  src={frontmatter.logo.src}
                />
              )}
            </figcaption>
          </figure>
        </Region>
        <Footnote>{slots.footnote}</Footnote>
        <div ref={panelBox} className="kit-proof-side">
          <div
            ref={stack}
            className="kit-proof-stack"
            data-compact={size.compact}
            {...(reveal ? {} : stackEnter)}>
            {items}
          </div>
        </div>
      </div>
    </Frame>
  );
}

/**
 * Props of {@link Metric}.
 */
type MetricProps = {
  /**
   * The metric from the frontmatter.
   */
  metric: ProofMetric;

  /**
   * Whether it is the first metric, set largest.
   */
  lead: boolean;

  /**
   * Whether the stack is at its smallest level, where labels take the small size.
   */
  small: boolean;

  /**
   * The panel's surface, which the metric wears: it paints the same color as the panel, so a metric
   * a reveal has not reached yet leaves nothing behind.
   */
  surface: string;

  /**
   * What heads the metric: the timeframe, on the lead.
   */
  children?: ReactNode;
};

/**
 * One metric: the figure before and an arrow when it has one (above the lead's figure, on the
 * baseline before the others'), the figure after in the stat style (which counts up as the slide or
 * its step comes in), and what it measures.
 */
function Metric({ metric, lead, small, surface, children }: MetricProps): ReactNode {
  const labelType = small ? 'kit-type-small' : 'kit-type-body';
  return (
    <div className="kit-proof-metric" data-lead={lead} data-surface={surface}>
      {children}
      <div className="kit-proof-change">
        {metric.from === undefined ? null : (
          <p className="kit-proof-from kit-type-lead kit-numeric">
            <span className="kit-proof-before">{smartPunctuation(String(metric.from))}</span>
            <svg
              className="kit-proof-arrow"
              viewBox="0 0 24 24"
              aria-hidden="true"
              data-decorative=""
              focusable="false">
              <path d="M4 12h15M13 6l6 6-6 6" />
            </svg>
          </p>
        )}
        <div className="kit-proof-figure" data-fit="scaled">
          <StatValue value={metric.value} className="kit-proof-value" />
        </div>
      </div>
      <p className={`kit-proof-label ${labelType}`}>{smartPunctuation(metric.label)}</p>
    </div>
  );
}

/**
 * The `proof` layout's component. The accent panel covers the right edge, so the chrome moves off
 * it.
 */
export const proofLayout = defineLayout<typeof proofLayoutContract>({
  name: 'proof',
  component: ProofLayout,
  bleed: () => ['right'],
});
