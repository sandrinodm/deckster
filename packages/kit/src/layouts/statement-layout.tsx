import { defineLayout, type LayoutProps } from '@deckster/engine';
import {
  isValidElement,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';

import type { statementLayoutContract } from '#layouts/statement-layout.contract.ts';

import {
  Eyebrow,
  FittedText,
  Frame,
  Region,
  useEnter,
  useFitLevel,
  type FitRung,
} from '#layout-parts.ts';
import '#layouts/display-align.css';
import '#layouts/statement-layout.css';

/**
 * The sizes a plain statement tries: the display style while it takes three lines at most, then the
 * headline style (the brand's quote size, upright) in up to four lines, stepping down.
 */
const STATEMENT_LADDER: readonly FitRung[] = [
  { scale: 1, maxLines: 3 },
  { scale: 0.88, maxLines: 3 },
  { step: 'headline', scale: 1, maxLines: 4 },
  { step: 'headline', scale: 0.88, maxLines: 4 },
  { step: 'headline', scale: 0.78, maxLines: 4 },
  { step: 'headline', scale: 0.7, maxLines: 4 },
];

/**
 * The sizes a quote tries: the brand's quote style in up to four lines, stepping down.
 */
const QUOTE_LADDER: readonly FitRung[] = [
  { scale: 1, maxLines: 4 },
  { scale: 0.88, maxLines: 4 },
  { scale: 0.78, maxLines: 4 },
  { scale: 0.7, maxLines: 4 },
];

/**
 * The largest a giant statement is set, as a multiple of the display size: one short word then
 * spans most of the slide's width.
 */
const GIANT_MAX_SCALE = 4.5;

/**
 * The smallest a giant statement is set, as a multiple of the display size: five long words still
 * fit the slide in the widest display face.
 */
const GIANT_MIN_SCALE = 0.7;

/**
 * How much each giant size is of the one before it: small enough steps that the text fills the
 * width it is given.
 */
const GIANT_STEP = 0.93;

/**
 * The sizes a giant statement tries, largest first, as multiples of the display size.
 */
const GIANT_SCALES: readonly number[] = giantScales();

/**
 * A custom property the type classes multiply their size by.
 */
type ScaleStyle = CSSProperties & { '--kit-scale': number };

/**
 * The `statement` layout: the eyebrow on the top line and the statement composed in the space below
 * it, a little above the middle. A plain statement is set in the display style across eleven
 * columns while it takes three lines, else at the headline (quote) size in ten columns and at most
 * four lines; with an attribution it becomes a quote in the brand's quote style across ten columns,
 * with hanging marks and the speaker below in the lead style. `align: center` centres the statement
 * and its attribution on the slide; `emphasis` marks the words the author emphasised with an accent
 * rule under them or a band of the accent behind them. `size: giant` sets a few words larger than
 * the display style, as large as fits the space under the eyebrow (see {@link GiantStatement}).
 */
function StatementLayout(props: LayoutProps<typeof statementLayoutContract>): ReactNode {
  const { frontmatter, slots } = props;
  if (frontmatter.size === 'giant') {
    return (
      <GiantStatement
        eyebrow={frontmatter.eyebrow}
        align={frontmatter.align}
        emphasis={frontmatter.emphasis}
        attribution={slots.attribution}>
        {slots.body}
      </GiantStatement>
    );
  }

  return <SetStatement {...props} />;
}

/**
 * A statement at the display or quote size, as the layout sets it unless `size: giant` is asked
 * for: the display style while it takes three lines, else the headline size, or the quote style
 * with an attribution, each stepping down until it fits.
 */
function SetStatement({
  frontmatter,
  slots,
}: LayoutProps<typeof statementLayoutContract>): ReactNode {
  const isQuote = slots.attribution !== undefined;
  const textEnter = useEnter(0);
  const attributionEnter = useEnter(2);
  const typeClass = isQuote ? 'kit-type-quote' : 'kit-type-display';
  return (
    <Frame
      layout="statement"
      variant={{
        'data-quote': String(isQuote),
        'data-align': frontmatter.align,
        'data-emphasis': frontmatter.emphasis,
      }}>
      <Eyebrow text={frontmatter.eyebrow} reserve />
      <Region className="kit-statement-region" place="optical">
        <figure className="kit-statement" {...textEnter}>
          <FittedText
            as={isQuote ? 'blockquote' : 'div'}
            className={`kit-statement-text kit-heading ${typeClass}`}
            ladder={isQuote ? QUOTE_LADDER : STATEMENT_LADDER}
            boundary=".kit-region">
            {slots.body}
          </FittedText>
          {isQuote ? (
            <figcaption className="kit-statement-attribution kit-type-lead" {...attributionEnter}>
              {slots.attribution}
            </figcaption>
          ) : null}
        </figure>
      </Region>
    </Frame>
  );
}

/**
 * Props of {@link GiantStatement}.
 */
type GiantStatementProps = {
  /**
   * The eyebrow on the top line.
   */
  eyebrow: string | undefined;

  /**
   * Where the statement is set: from the left or centred.
   */
  align: string;

  /**
   * How the emphasised words are marked, if the slide says.
   */
  emphasis: string | undefined;

  /**
   * Who said it, set under the statement after a short rule; nothing for a plain claim.
   */
  attribution: ReactNode;

  /**
   * The statement.
   */
  children: ReactNode;
};

/**
 * A statement of a few words set as large as fits: the layout tries the sizes of
 * {@link GIANT_SCALES} from the largest down, keeping the level in React state, until the text (and
 * its attribution) is no taller than the space under the eyebrow and no word is wider than the
 * slide's twelve columns. A short statement thus spans most of the width and a longer one takes two
 * or three balanced lines at the size the height allows; an attribution stands under it as under a
 * quote, without the quotation marks. It is set tight (closer tracking and leading than the display
 * style) and starts again from the largest size when the statement changes or web fonts finish
 * loading, since a fallback face measures differently.
 */
function GiantStatement({
  eyebrow,
  align,
  emphasis,
  attribution,
  children,
}: GiantStatementProps): ReactNode {
  const region = useRef<HTMLDivElement>(null);
  const figure = useRef<HTMLElement>(null);
  const fonts = useFontLoads();
  const textEnter = useEnter(0);
  const attributionEnter = useEnter(2);
  const { level } = useFitLevel(
    region,
    figure,
    GIANT_SCALES.length,
    `${fonts}|${textOf(children)}|${textOf(attribution)}`,
  );
  const style: ScaleStyle = { '--kit-scale': GIANT_SCALES[level] ?? GIANT_MIN_SCALE };
  return (
    <Frame
      layout="statement"
      variant={{
        'data-size': 'giant',
        'data-quote': 'false',
        'data-align': align,
        'data-emphasis': emphasis,
      }}>
      <Eyebrow text={eyebrow} reserve />
      <Region ref={region} className="kit-statement-region" place="optical">
        <figure ref={figure} className="kit-statement" {...textEnter}>
          <div
            className="kit-statement-text kit-heading kit-type-display"
            style={style}
            data-fit={level === 0 ? 'natural' : 'stepped'}>
            {children}
          </div>
          {attribution === undefined ? null : (
            <figcaption className="kit-statement-attribution kit-type-lead" {...attributionEnter}>
              {attribution}
            </figcaption>
          )}
        </figure>
      </Region>
    </Frame>
  );
}

/**
 * Counts the times the document's web fonts finish loading, so text sized to its box can start
 * again from its largest size once the real faces replace the fallback.
 *
 * @returns 0 until the first load settles, then one more for each load.
 */
function useFontLoads(): number {
  const [loads, setLoads] = useState(0);
  useEffect(() => {
    const fonts = typeof document === 'undefined' ? undefined : documentFonts();
    if (fonts === undefined) {
      return undefined;
    }

    let live = true;
    /**
     * Counts a finished load.
     */
    const count = () => {
      if (live) {
        setLoads((current) => current + 1);
      }
    };
    fonts.addEventListener('loadingdone', count);
    void fonts.ready.then(count);
    return () => {
      live = false;
      fonts.removeEventListener('loadingdone', count);
    };
  }, []);
  return loads;
}

/**
 * The document's font set, or `undefined` in a test DOM without the Font Loading API.
 */
function documentFonts(): FontFaceSet | undefined {
  // The DOM types declare `fonts` on every document, but test DOMs lack it.
  const fonts: FontFaceSet | undefined = document.fonts;
  return fonts;
}

/**
 * The text of a slot's content, for the fit level's key: a new statement starts from the largest
 * size.
 *
 * @param node - The slot's content.
 */
function textOf(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node);
  }

  if (Array.isArray(node)) {
    return node.map(textOf).join('');
  }

  return isValidElement<{ children?: ReactNode }>(node) ? textOf(node.props.children) : '';
}

/**
 * The giant sizes from {@link GIANT_MAX_SCALE} down to {@link GIANT_MIN_SCALE} in steps of
 * {@link GIANT_STEP}, rounded to two places.
 */
function giantScales(): number[] {
  const scales: number[] = [];
  for (let scale = GIANT_MAX_SCALE; scale > GIANT_MIN_SCALE; scale *= GIANT_STEP) {
    scales.push(Math.round(scale * 100) / 100);
  }

  return [...scales, GIANT_MIN_SCALE];
}

/**
 * The `statement` layout's component.
 */
export const statementLayout = defineLayout<typeof statementLayoutContract>({
  name: 'statement',
  component: StatementLayout,
});
