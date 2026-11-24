import { useBrand } from '@deckster/brand/runtime';
import { defineLayout, useStatic, type LayoutProps } from '@deckster/engine';
import { Fragment, useRef, type CSSProperties, type ReactNode } from 'react';

import type { featuresLayoutContract } from '#layouts/features-layout.contract.ts';

import { hyphenPoints, wordPieces } from '#diagrams/word-breaks.ts';
import { MEASURE_TOLERANCE_PX } from '#foundation/layout-geometry.ts';
import {
  enterProps,
  Footnote,
  Frame,
  frontmatterIcon,
  Region,
  SlideHeader,
  smartPunctuation,
  Step,
  useEnter,
  useFitLevel,
} from '#layout-parts.ts';
import '#layouts/features-layout.css';

/**
 * Entrance order after the header and context.
 */
const FIRST_ROW_ORDER = 2;

/**
 * Titles may occupy at most two lines at any fit level.
 */
const MAX_TITLE_LINES = 2;

/**
 * Whitespace separators retained between title words.
 */
const WHITESPACE_PARTS = /(\s+)/;

/**
 * Identifies the whitespace parts that need no break opportunities.
 */
const WHITESPACE = /\s/;

/**
 * Invisible unless a long word wraps at this point.
 */
const SOFT_HYPHEN = '\u00ad';

/**
 * The sizes tried for the whole grid, largest first. Dense inventories step down together, keeping
 * the heading face and aligning titles and details across each row.
 */
const FEATURE_LEVELS = [
  { title: 'headline', detail: 'body', grow: 'roomy' },
  { title: 'title', detail: 'body', grow: 'snug' },
  { title: 'lead', detail: 'small', grow: 'none' },
  { title: 'body', detail: 'small', grow: 'compact' },
] as const;

/**
 * Grid geometry passed to the stylesheet.
 */
type FeaturesStyle = CSSProperties & {
  /**
   * Equal columns in each row.
   */
  '--kit-feature-columns': number;

  /**
   * Rows, including an incomplete final row.
   */
  '--kit-feature-rows': number;
};

/**
 * A compact capability inventory with open rows, a brand icon for each title, and optional detail
 * below. Reveal wraps whole rows, so the fit level and final positions stay fixed on every click.
 * Rows stretch to fill the content region while their intrinsic height drives the fit. Static mode
 * displays every row through the shared Step implementation.
 */
function FeaturesLayout({
  frontmatter,
  slots,
}: LayoutProps<typeof featuresLayoutContract>): ReactNode {
  const isStatic = useStatic();
  const contextEnter = useEnter(1);
  const { brand } = useBrand();
  const { features, reveal } = frontmatter;
  const columns = featureColumns(features.length);
  const hasDetail = features.some((feature) => feature.detail !== undefined);
  const rows = Array.from({ length: Math.ceil(features.length / columns) }, (_, index) =>
    features.slice(index * columns, (index + 1) * columns),
  );
  const region = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const key = JSON.stringify([
    features,
    frontmatter.title,
    slots.body === undefined,
    slots.footnote === undefined,
  ]);
  const { level } = useFitLevel(region, grid, FEATURE_LEVELS.length, key, {
    height: featuresHeight,
    restartOnFontLoad: true,
  });
  const size = FEATURE_LEVELS[level] ?? FEATURE_LEVELS[3];
  const titleType = size.title;
  const style: FeaturesStyle = {
    '--kit-feature-columns': columns,
    '--kit-feature-rows': rows.length,
  };
  return (
    <Frame
      layout="features"
      variant={{
        'data-count': String(features.length),
        'data-columns': String(columns),
        'data-detail': String(hasDetail),
        'data-level': String(level),
        'data-grow': size.grow,
      }}>
      <SlideHeader eyebrow={frontmatter.eyebrow} title={frontmatter.title} maxLines={1} />
      {slots.body === undefined ? null : (
        <div className="kit-features-context kit-prose kit-body" {...contextEnter}>
          {slots.body}
        </div>
      )}
      <Region ref={region} className="kit-features-region" place="top">
        <div ref={grid} className="kit-features" style={style}>
          {rows.map((row, rowIndex) => {
            const content = (
              <div key={rowIndex} className="kit-features-row" data-row={rowIndex}>
                {row.map((feature, index) => {
                  const Icon = frontmatterIcon(feature.icon, brand.icons.set);
                  return (
                    <section
                      key={index}
                      className="kit-feature"
                      data-icon={Icon !== undefined}
                      {...enterProps(FIRST_ROW_ORDER + rowIndex, isStatic)}>
                      <span className="kit-feature-mark" aria-hidden="true" data-decorative="">
                        {Icon === undefined ? null : (
                          <Icon className="kit-feature-icon" aria-hidden="true" focusable="false" />
                        )}
                      </span>
                      <h3
                        className={`kit-feature-title kit-heading kit-type-${titleType}`}
                        data-fit="scaled">
                        <FeatureTitle text={smartPunctuation(feature.title)} />
                      </h3>
                      {feature.detail === undefined ? null : (
                        <p className={`kit-feature-detail kit-type-${size.detail}`}>
                          {smartPunctuation(feature.detail)}
                        </p>
                      )}
                    </section>
                  );
                })}
              </div>
            );
            return reveal ? (
              <Step key={rowIndex} at={rowIndex + 1} effect="fade">
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
 * Preserves word boundaries and shows a hyphen when a long title word must wrap.
 */
function FeatureTitle({ text }: { text: string }): ReactNode {
  return text.split(WHITESPACE_PARTS).map((part, index) => {
    if (WHITESPACE.test(part) || part === '') {
      return part;
    }

    return (
      <Fragment key={index}>
        {wordPieces(part).map((piece, pieceIndex) => (
          <Fragment key={pieceIndex}>
            {pieceIndex === 0 ? null : <wbr />}
            {softHyphens(piece)}
          </Fragment>
        ))}
      </Fragment>
    );
  });
}

/**
 * Inserts soft hyphens at the kit's syllable break points.
 */
function softHyphens(word: string): string {
  const points = hyphenPoints(word);
  return [0, ...points]
    .map((start, index) => word.slice(start, points[index] ?? word.length))
    .join(SOFT_HYPHEN);
}

/**
 * Rejects titles longer than two lines and measures the complete rows, including their spacing.
 * Offset heights include rows hidden by reveal without counting entrance transforms.
 *
 * @param grid - The grid containing every row, including rows hidden by reveal.
 */
function featuresHeight(grid: HTMLElement): number {
  const titles = grid.querySelectorAll<HTMLElement>('.kit-feature-title');
  for (const title of titles) {
    const lineHeight = Number.parseFloat(getComputedStyle(title).lineHeight);
    if (title.offsetHeight > MAX_TITLE_LINES * lineHeight + MEASURE_TOLERANCE_PX) {
      return Number.POSITIVE_INFINITY;
    }
  }

  const rows = Array.from(grid.querySelectorAll<HTMLElement>('.kit-features-row'));
  const style = getComputedStyle(grid);
  const gap = Number.parseFloat(style.rowGap) || 0;
  const rowsHeight = rows.reduce((height, row) => {
    const rowStyle = getComputedStyle(row);
    const margin = Number.parseFloat(rowStyle.marginTop) + Number.parseFloat(rowStyle.marginBottom);
    return height + row.offsetHeight + margin;
  }, 0);
  return rowsHeight + gap * (rows.length - 1);
}

/**
 * Chooses three columns for six or nine items, avoiding a single orphan in the last row. Other
 * counts use four columns; the contract validates the supported six-to-twelve range.
 */
export function featureColumns(count: number): 3 | 4 {
  return count === 6 || count === 9 ? 3 : 4;
}

/**
 * The features layout's runtime component; its contract supplies validated frontmatter.
 */
export const featuresLayout = defineLayout<typeof featuresLayoutContract>({
  name: 'features',
  component: FeaturesLayout,
});
