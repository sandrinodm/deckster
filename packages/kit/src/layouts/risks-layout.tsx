import { useBrand } from '@deckster/brand/runtime';
import { defineLayout, useStatic, type LayoutProps } from '@deckster/engine';
import { useId, useRef, type ReactNode } from 'react';

import type { RiskEntry, risksLayoutContract } from '#layouts/risks-layout.contract.ts';

import { useFitLevel } from '#foundation/fit-level.ts';
import { MEASURE_TOLERANCE_PX } from '#foundation/layout-geometry.ts';
import { KitMark, KitMeter } from '#foundation/marks.tsx';
import { Footnote, Frame, Region, SlideHeader } from '#foundation/slide-parts.tsx';
import { smartPunctuation } from '#foundation/smart-punctuation.ts';
import { enterProps, useEnter } from '#motion/enter.ts';
import { Step } from '#motion/step.tsx';
import '#layouts/risks-layout.css';

/**
 * The first row enters after the title and context.
 */
const FIRST_RISK_ORDER = 2;

/**
 * The register tries larger text and generous rows before compact small and caption text.
 */
const RISK_LEVELS = [
  { text: 'lead', space: 'roomy' },
  { text: 'body', space: 'roomy' },
  { text: 'body', space: 'snug' },
  { text: 'small', space: 'snug' },
  { text: 'small', space: 'compact' },
  { text: 'caption', space: 'compact' },
] as const;

/**
 * Filled marks for each level; the printed level name carries the same meaning.
 */
const LEVEL_MARKS = {
  /**
   * One filled mark for low.
   */
  low: 1,

  /**
   * Two filled marks for medium.
   */
  medium: 2,

  /**
   * Three filled marks for high.
   */
  high: 3,
} as const;

/**
 * Printed names are text rather than CSS case transforms, so native exports keep the same case.
 */
const LEVEL_LABELS = {
  /**
   * The printed name of the low level.
   */
  low: 'Low',

  /**
   * The printed name of the medium level.
   */
  medium: 'Medium',

  /**
   * The printed name of the high level.
   */
  high: 'High',
} as const;

/**
 * A register whose complete content chooses its fit level before any reveal step is shown.
 */
function RisksLayout({ frontmatter, slots }: LayoutProps<typeof risksLayoutContract>): ReactNode {
  const { risks, reveal } = frontmatter;
  const { surface } = useBrand();
  const lit = surface.name === 'accent' || surface.name === 'gradient' ? 'inverse' : 'accent';
  const isStatic = useStatic();
  const titleId = useId();
  const contextEnter = useEnter(1);
  const region = useRef<HTMLDivElement>(null);
  const register = useRef<HTMLDivElement>(null);
  const key = JSON.stringify([
    risks,
    frontmatter.title,
    slots.body === undefined,
    slots.footnote === undefined,
  ]);
  const { level } = useFitLevel(region, register, RISK_LEVELS.length, key, {
    height: registerHeight,
    restartOnFontLoad: true,
  });
  const size = RISK_LEVELS[level] ?? { text: 'caption', space: 'compact' };
  return (
    <Frame
      layout="risks"
      variant={{
        'data-count': String(risks.length),
        'data-level': String(level),
        'data-space': size.space,
        'data-text': size.text,
      }}>
      <SlideHeader
        eyebrow={frontmatter.eyebrow}
        title={frontmatter.title}
        titleId={titleId}
        maxLines={1}
      />
      {slots.body === undefined ? null : (
        <div className="kit-risks-context kit-prose kit-body" {...contextEnter}>
          {slots.body}
        </div>
      )}
      <Region ref={region} className="kit-risks-region" place="optical">
        <div ref={register} className="kit-risks" role="table" aria-labelledby={titleId}>
          <div className="kit-risks-head kit-type-label" role="row">
            <span role="columnheader">Risk</span>
            <span role="columnheader">Likelihood</span>
            <span role="columnheader">Impact</span>
            <span role="columnheader">Mitigation</span>
          </div>
          {risks.map((risk, index) => {
            const content = (
              <section
                key={index}
                className={`kit-risks-row kit-type-${size.text}`}
                role="row"
                data-surface={risk.highlight === true ? lit : undefined}
                {...enterProps(FIRST_RISK_ORDER + index, isStatic)}>
                {risk.highlight === true ? (
                  <KitMark kind="diamond" className="kit-risks-priority" />
                ) : null}
                <div
                  className="kit-risks-name-cell"
                  role="rowheader"
                  aria-label={risk.highlight === true ? `Priority risk: ${risk.name}` : undefined}>
                  <h3 className={`kit-risks-name kit-heading kit-type-${size.text}`}>
                    {smartPunctuation(risk.name)}
                  </h3>
                </div>
                <Level value={risk.likelihood} />
                <Level value={risk.impact} />
                <p className="kit-risks-mitigation" role="cell">
                  {smartPunctuation(risk.mitigation)}
                </p>
              </section>
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
 * Measures the rows rather than the stretched grid. Offset heights ignore reveal transforms; each
 * cell must also fit its column because the grid can hide overflow into a neighbouring cell.
 */
function registerHeight(register: HTMLElement): number {
  const cells = register.querySelectorAll<HTMLElement>(
    '[role="cell"], [role="rowheader"], [role="columnheader"]',
  );
  const overflows = Array.from(cells).some(
    (cell) => cell.scrollWidth > cell.clientWidth + MEASURE_TOLERANCE_PX,
  );
  if (overflows) {
    return Infinity;
  }

  const rows = register.querySelectorAll<HTMLElement>('[role="row"]');
  const border = Number.parseFloat(getComputedStyle(register).borderBottomWidth);
  const rowsHeight = Array.from(rows).reduce((height, row) => height + row.offsetHeight, border);
  // The outer box includes the closing border and avoids accumulating rounded row heights.
  return Math.max(rowsHeight, register.offsetHeight);
}

/**
 * A level written as a word and a rising three-bar meter, filled up to the chosen level.
 */
function Level({ value }: { value: RiskEntry['likelihood'] }): ReactNode {
  return (
    <div className="kit-risks-level" role="cell">
      <KitMeter filled={LEVEL_MARKS[value]} />
      <span>{LEVEL_LABELS[value]}</span>
    </div>
  );
}

/**
 * The `risks` layout's runtime component.
 */
export const risksLayout = defineLayout<typeof risksLayoutContract>({
  name: 'risks',
  component: RisksLayout,
});
