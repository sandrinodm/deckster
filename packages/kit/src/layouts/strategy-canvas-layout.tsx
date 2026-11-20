import type { ReactNode } from 'react';

import { defineLayout, type LayoutProps } from '@deckster/engine';

import type { strategyCanvasLayoutContract } from '#layouts/strategy-canvas-layout.contract.ts';

import { smartPunctuation } from '#foundation/smart-punctuation.ts';
import { patternPosition, PatternSlide, usePatternStage } from '#layouts/pattern-slide.tsx';
import '#layouts/strategy-canvas-layout.css';

/**
 * The shared ordinal scale from the highest offer to the lowest.
 */
const LEVELS = [5, 4, 3, 2, 1] as const;

/**
 * Plot insets, measured in percent to keep all outer labels inside the frame.
 */
const PLOT_START = 9;

/**
 * The horizontal span of the plotted factors in percent.
 */
const PLOT_WIDTH = 81;

/**
 * A typed frontmatter value used by both the figure and its accessible data table.
 */
type CanvasData = LayoutProps<typeof strategyCanvasLayoutContract>['frontmatter'];

/**
 * Values from a single strategic profile and its stable line style.
 */
type CanvasProfile = CanvasData['offer'] & {
  kind: 'context' | 'second' | 'featured';
  shown: boolean;
};

/**
 * Builds the alternatives, the selected value curve and the choices the curve implies.
 */
function StrategyCanvas({
  frontmatter,
  slots,
}: LayoutProps<typeof strategyCanvasLayoutContract>): ReactNode {
  const { title, eyebrow, reveal, factors, alternatives, offer, emphasize, tradeoff } = frontmatter;
  const stage = usePatternStage(reveal, 2);
  const profiles: CanvasProfile[] = [
    { ...alternatives[0], kind: 'context', shown: true },
    { ...alternatives[1], kind: 'second', shown: true },
    { ...offer, kind: 'featured', shown: stage >= 1 },
  ];
  return (
    <PatternSlide
      layout="strategy-canvas"
      eyebrow={eyebrow}
      title={title}
      footnote={slots.footnote}>
      <div className="kit-strategy-key">
        <p className="kit-type-label">Relative buyer offering</p>
        <ul aria-label="Profile lines">
          {profiles.map(({ name, kind, shown }) => (
            <li
              key={kind}
              className="kit-type-caption"
              data-strategy-profile={kind}
              data-pattern-visible={shown}
              aria-hidden={!shown}>
              {smartPunctuation(name)}
            </li>
          ))}
        </ul>
      </div>
      <StrategyPlot factors={factors} profiles={profiles} />
      <StrategyValues factors={factors} profiles={profiles.filter(({ shown }) => shown)} />
      <div
        className="kit-strategy-choices"
        data-pattern-visible={stage >= 2}
        aria-hidden={stage < 2}>
        <p className="kit-type-small">
          <b>Prioritize</b> {smartPunctuation(emphasize)}
        </p>
        <p className="kit-type-small">
          <b>Give up</b> {smartPunctuation(tradeoff)}
        </p>
      </div>
    </PatternSlide>
  );
}

/**
 * Draws value curves in consistent positions and separates the factor labels from the plot floor.
 */
function StrategyPlot({
  factors,
  profiles,
}: {
  factors: readonly string[];
  profiles: CanvasProfile[];
}): ReactNode {
  return (
    <div className="kit-strategy-plot" aria-hidden="true">
      <svg className="kit-pattern-plot" viewBox="0 0 100 100" preserveAspectRatio="none">
        {LEVELS.map((level) => (
          <line
            key={level}
            className="kit-strategy-grid"
            x1={PLOT_START}
            x2={PLOT_START + PLOT_WIDTH}
            y1={levelY(level)}
            y2={levelY(level)}
          />
        ))}
        {profiles.map(({ kind, levels, shown }) => (
          <polyline
            key={kind}
            className="kit-strategy-value-curve"
            data-strategy-profile={kind}
            data-pattern-visible={shown}
            points={levels
              .map((level, i) => `${factorX(i, factors.length)},${levelY(level)}`)
              .join(' ')}
          />
        ))}
      </svg>
      {LEVELS.map((level) => (
        <span
          key={level}
          className="kit-strategy-level kit-type-caption"
          style={patternPosition(5, levelY(level))}>
          {level}
        </span>
      ))}
      {factors.map((factor, index) => (
        <p
          key={index}
          className="kit-strategy-factor kit-type-caption"
          style={patternPosition(factorX(index, factors.length), 86)}>
          {smartPunctuation(factor)}
        </p>
      ))}
    </div>
  );
}

/**
 * Provides the displayed scores in a table for readers who cannot see their positions.
 */
function StrategyValues({
  factors,
  profiles,
}: {
  factors: readonly string[];
  profiles: CanvasProfile[];
}): ReactNode {
  return (
    <table className="kit-pattern-sr-only" data-decorative="">
      <caption>Offering levels from 1 (low) to 5 (high)</caption>
      <thead>
        <tr>
          <th scope="col">Profile</th>
          {factors.map((factor, i) => (
            <th key={i} scope="col">
              {smartPunctuation(factor)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {profiles.map(({ kind, name, levels }) => (
          <tr key={kind}>
            <th scope="row">{smartPunctuation(name)}</th>
            {levels.map((level, i) => (
              <td key={i}>{level}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Each factor sits at an equal interval across the plot width.
 */
function factorX(index: number, count: number): number {
  return PLOT_START + (PLOT_WIDTH * index) / (count - 1);
}

/**
 * Maps an ordinal offering level to the vertical position in the plot, in percent.
 */
function levelY(level: number): number {
  return 79 - 17 * (level - 1);
}

/**
 * The strategy canvas layout comparing an offered profile with two alternatives.
 */
export const strategyCanvasLayout = defineLayout<typeof strategyCanvasLayoutContract>({
  name: 'strategy-canvas',
  component: StrategyCanvas,
});
