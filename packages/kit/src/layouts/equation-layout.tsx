import { defineLayout, type LayoutProps } from '@deckster/engine';
import { useRef, type CSSProperties, type ReactNode } from 'react';

import type {
  EquationOperator,
  EquationResult,
  EquationTerm,
  equationLayoutContract,
} from '#layouts/equation-layout.contract.ts';

import {
  Footnote,
  Frame,
  SlideHeader,
  smartPunctuation,
  StatValue,
  Step,
  useEnter,
  useFitLevel,
} from '#layout-parts.ts';
import '#layouts/equation-layout.css';

/**
 * The signs the layout sets for each operator name. The contract holds the same table; it is
 * repeated here because a component imports its contract only as a type.
 */
const SIGNS: Readonly<Record<EquationOperator, string>> = {
  /**
   * Multiplication.
   */
  times: '×',

  /**
   * Addition.
   */
  plus: '+',

  /**
   * Subtraction, with the true minus sign.
   */
  minus: '−',

  /**
   * Division.
   */
  divide: '÷',
};

/**
 * The factors every figure and sign on the row is scaled by, largest first: the row tries each
 * until its figures, at their own widths with the smallest gap between them, fit the first eight
 * columns and the result fits its panel.
 */
const ROW_SCALES = [1, 0.88, 0.78, 0.7, 0.62, 0.55, 0.48, 0.42] as const;

/**
 * The scale the row's stylesheet multiplies its figure sizes by.
 */
type RowStyle = CSSProperties & { '--kit-equation-fit': number };

/**
 * The entrance order of the row; the header and the line of context come first.
 */
const ROW_ORDER = 2;

/**
 * The most terms whose labels are set at the body size; with more, each has a quarter of eight
 * columns and its label takes the small size.
 */
const SMALL_LABELS_AFTER = 3;

/**
 * A grid placement, set inline because a term's columns follow from its place in the list.
 */
type Placement = Pick<CSSProperties, 'gridColumn'>;

/**
 * The `equation` layout: the shared header and an optional line of context across the top, then one
 * row on a grid of its own, the result's track last, on an accent panel the frame draws from the
 * seam (the middle of the gutter after the eighth column) to the right and bottom edges of the
 * slide, its top a gap below the header. Each figure takes a track as wide as itself, and between
 * each pair, and before the equals sign, is a gap track of one width with the sign centred in it,
 * so the row reads as one evenly spaced sum across the first eight columns, the equals sign ending
 * a gutter and an inset before the result. Each label stands under its own figure and may run on
 * under the gap after it. Every figure and sign stands on one baseline and shares one scale, the
 * result at the largest size, the terms smaller the more there are and the signs smaller still;
 * when the row does not fit, the whole row steps down together. With `reveal`, each term comes in
 * with the operator before it, one per step, and the equals sign, the panel and the result on the
 * last step.
 */
function EquationLayout({
  frontmatter,
  slots,
}: LayoutProps<typeof equationLayoutContract>): ReactNode {
  const { terms, result, reveal } = frontmatter;
  const rowRef = useRef<HTMLDivElement>(null);
  const contextEnter = useEnter(1);
  const rowEnter = useEnter(ROW_ORDER);
  const { level } = useFitLevel(
    rowRef,
    rowRef,
    ROW_SCALES.length,
    JSON.stringify([terms, result]),
    {
      overflow: true,
      restartOnFontLoad: true,
    },
  );
  const rowStyle: RowStyle = { '--kit-equation-fit': ROW_SCALES[level] ?? ROW_SCALES.at(-1) ?? 1 };
  const resultStep = terms.length + 1;
  const labelType = terms.length > SMALL_LABELS_AFTER ? 'kit-type-small' : 'kit-type-body';
  const panelSurface = frontmatter.surface === 'accent' ? 'inverse' : 'accent';
  const panel = (
    <div
      className="kit-equation-panel"
      data-surface={panelSurface}
      aria-hidden="true"
      data-decorative=""
    />
  );
  /**
   * The content as it shows: on step `at` with `reveal`, else at once.
   *
   * @param at - The step that brings it in.
   * @param content - What comes in.
   */
  function step(at: number, content: ReactNode): ReactNode {
    return reveal ? (
      <Step key={at} at={at}>
        {content}
      </Step>
    ) : (
      content
    );
  }

  return (
    <Frame
      layout="equation"
      variant={{ 'data-count': String(terms.length) }}
      bleed={step(resultStep, panel)}>
      <div className="kit-equation">
        <div className="kit-equation-head">
          <SlideHeader eyebrow={frontmatter.eyebrow} title={frontmatter.title} />
          {slots.body === undefined ? null : (
            <div className="kit-equation-context kit-prose kit-body" {...contextEnter}>
              {slots.body}
            </div>
          )}
        </div>
        <div
          ref={rowRef}
          className="kit-equation-row"
          style={rowStyle}
          data-fit="scaled"
          {...rowEnter}>
          {terms.map((term, index) =>
            step(
              index + 1,
              <TermView key={index} term={term} index={index} labelType={labelType} />,
            ),
          )}
          {step(
            resultStep,
            <ResultView key="result" result={result} count={terms.length} surface={panelSurface} />,
          )}
        </div>
        <Footnote>{slots.footnote}</Footnote>
      </div>
    </Frame>
  );
}

/**
 * Props of {@link TermView}.
 */
type TermViewProps = {
  /**
   * The term from the frontmatter.
   */
  term: EquationTerm;

  /**
   * Its place in `terms:`, 0 for the first.
   */
  index: number;

  /**
   * The type class of its label, smaller when four terms share the row.
   */
  labelType: string;
};

/**
 * One term on the row: the operator before it (none for the first) in the gap track before the
 * figure, the figure and, under it, its label, which may run on under the gap after the figure.
 */
function TermView({ term, index, labelType }: TermViewProps): ReactNode {
  const column = 2 * index + 1;
  return (
    <>
      {index === 0 || term.op === undefined ? null : (
        <Sign sign={SIGNS[term.op]} place={{ gridColumn: column - 1 }} />
      )}
      <div className="kit-equation-figure" style={{ gridColumn: column }}>
        <StatValue value={term.value} className="kit-equation-value" />
      </div>
      <p className={`kit-equation-label ${labelType}`} style={{ gridColumn: `${column} / span 2` }}>
        {smartPunctuation(term.label)}
      </p>
    </>
  );
}

/**
 * Props of {@link ResultView}.
 */
type ResultViewProps = {
  /**
   * The result from the frontmatter.
   */
  result: EquationResult;

  /**
   * How many terms come before it, which sets its tracks.
   */
  count: number;

  /**
   * The surface of the panel behind it, whose roles it takes.
   */
  surface: string;
};

/**
 * The equals sign and the result: its figure and label in the last track, over the panel, in the
 * panel's own roles.
 */
function ResultView({ result, count, surface }: ResultViewProps): ReactNode {
  const equals = 2 * count;
  const column = equals + 2;
  return (
    <>
      <Sign sign="=" place={{ gridColumn: equals }} result />
      <div className="kit-equation-result" data-surface={surface}>
        <div className="kit-equation-figure" data-result="" style={{ gridColumn: column }}>
          <StatValue value={result.value} className="kit-equation-total" />
        </div>
        <p
          className="kit-equation-label kit-type-lead"
          data-result=""
          style={{ gridColumn: column }}>
          {smartPunctuation(result.label)}
        </p>
      </div>
    </>
  );
}

/**
 * Props of {@link Sign}.
 */
type SignProps = {
  /**
   * The sign as set: ×, +, −, ÷ or =.
   */
  sign: string;

  /**
   * Its track.
   */
  place: Placement;

  /**
   * Whether it is the equals sign before the result, which is set in the heading color.
   */
  result?: boolean;
};

/**
 * An operator or the equals sign, set as type in the figures' face on their baseline, smaller and
 * in a quieter color, scaled with them.
 */
function Sign({ sign, place, result = false }: SignProps): ReactNode {
  return (
    <p className="kit-equation-sign kit-type-stat" data-equals={result} style={place}>
      {sign}
    </p>
  );
}

/**
 * The `equation` layout's component. The result's panel covers the right edge, so the chrome moves
 * off it.
 */
export const equationLayout = defineLayout<typeof equationLayoutContract>({
  name: 'equation',
  component: EquationLayout,
  bleed: () => ['right'],
});
