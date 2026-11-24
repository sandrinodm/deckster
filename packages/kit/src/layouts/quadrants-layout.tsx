import { useBrand } from '@deckster/brand/runtime';
import { defineLayout, useStatic, type LayoutProps } from '@deckster/engine';
import { useRef, type ReactNode } from 'react';

import type { QuadrantEntry, quadrantsLayoutContract } from '#layouts/quadrants-layout.contract.ts';

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
  useFitGroupWidth,
  useFitLevel,
  type EnterProps,
  type IconComponent,
} from '#layout-parts.ts';
import '#layouts/quadrants-layout.css';

/**
 * The header and context precede the first box in the entrance.
 */
const FIRST_QUADRANT_ORDER = 2;

/**
 * The compact fallback after all larger board sizes have been tried.
 */
const COMPACT_QUADRANT_LEVEL = {
  /**
   * The heading step at the smallest board size.
   */
  title: 'body',

  /**
   * The bullet step at the smallest board size.
   */
  text: 'caption',

  /**
   * Whether the board uses reduced padding and list gaps.
   */
  compact: true,
} as const;

/**
 * Sparse boards grow their headings and bullets before stretching. Dense boards reduce both
 * together, keeping the heading within two type steps of its list.
 */
const QUADRANT_LEVELS = [
  { title: 'headline', text: 'title', compact: false },
  { title: 'title', text: 'lead', compact: false },
  { title: 'title', text: 'body', compact: false },
  { title: 'lead', text: 'small', compact: false },
  { title: 'lead', text: 'small', compact: true },
  COMPACT_QUADRANT_LEVEL,
] as const;

/**
 * Four equal boxes with paired headings and lists. The fit is measured against all four boxes,
 * including hidden steps, so a reveal never changes the grid.
 */
function QuadrantsLayout({
  frontmatter,
  slots,
}: LayoutProps<typeof quadrantsLayoutContract>): ReactNode {
  const { quadrants, reveal, labels } = frontmatter;
  const { brand, surface } = useBrand();
  const lit = surface.name === 'accent' || surface.name === 'gradient' ? 'inverse' : 'accent';
  const isStatic = useStatic();
  const contextEnter = useEnter(1);
  const region = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const key = JSON.stringify([
    quadrants,
    frontmatter.title,
    slots.body === undefined,
    slots.footnote === undefined,
  ]);
  useFitGroupWidth(grid, '.kit-quadrant-title');
  const { level } = useFitLevel(region, grid, QUADRANT_LEVELS.length, key, {
    height: quadrantsHeight,
    restartOnFontLoad: true,
  });
  const size = QUADRANT_LEVELS[level] ?? COMPACT_QUADRANT_LEVEL;
  const icons = quadrants.map((quadrant) => frontmatterIcon(quadrant.icon, brand.icons.set));
  return (
    <Frame
      layout="quadrants"
      variant={{
        'data-count': String(quadrants.length),
        'data-level': String(level),
        'data-compact': String(size.compact),
      }}>
      <SlideHeader eyebrow={frontmatter.eyebrow} title={frontmatter.title} maxLines={1} />
      {slots.body === undefined ? null : (
        <div className="kit-quadrants-context kit-prose kit-body" {...contextEnter}>
          {slots.body}
        </div>
      )}
      <Region ref={region} className="kit-quadrants-region" place="optical">
        <div ref={grid} className="kit-quadrants">
          {quadrants.map((quadrant, index) => {
            const content = (
              <QuadrantBox
                key={index}
                quadrant={quadrant}
                icon={icons[index]}
                lit={quadrant.highlight === true ? lit : undefined}
                highlightLabel={labels.highlight}
                titleType={`kit-type-${size.title}`}
                itemType={`kit-type-${size.text}`}
                enter={enterProps(FIRST_QUADRANT_ORDER + index, isStatic)}
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
 * The content, surface and type classes of one box, chosen by the board's fit level.
 */
type QuadrantBoxProps = {
  /**
   * The decoded heading, bullets and optional icon.
   */
  quadrant: QuadrantEntry;

  /**
   * The stable icon component resolved from the brand set, when the box names one.
   */
  icon: IconComponent | undefined;

  /**
   * The nested surface; absent for a box with equal weight.
   */
  lit: string | undefined;

  /**
   * The screen-reader prefix of the heading when the box is lit.
   */
  highlightLabel: string;

  /**
   * The heading's brand type step.
   */
  titleType: string;

  /**
   * The bullets' brand type step.
   */
  itemType: string;

  /**
   * The box's entrance order, or no attributes in static mode.
   */
  enter: EnterProps;
};

/**
 * A semantic section with a heading, a decorative brand icon and a native bullet list. The
 * emphasized section uses the nested accent surface without an extra marker.
 */
function QuadrantBox({
  quadrant,
  icon: Icon,
  lit,
  highlightLabel,
  titleType,
  itemType,
  enter,
}: QuadrantBoxProps): ReactNode {
  return (
    <section className="kit-quadrant" data-surface={lit} {...enter}>
      <div className="kit-quadrant-content">
        <div className={`kit-quadrant-head ${titleType}`}>
          {Icon === undefined ? null : (
            <Icon
              className="kit-quadrant-icon"
              aria-hidden="true"
              focusable="false"
              data-decorative=""
            />
          )}
          <h3
            className={`kit-quadrant-title kit-heading ${titleType}`}
            data-fit="scaled"
            aria-label={lit === undefined ? undefined : `${highlightLabel}: ${quadrant.title}`}>
            {smartPunctuation(quadrant.title)}
          </h3>
        </div>
        <ul className={`kit-quadrant-items ${itemType}`}>
          {quadrant.items.map((item, index) => (
            <li key={index} className="kit-quadrant-item">
              {smartPunctuation(item)}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/**
 * Twice the tallest box's content and padding, plus the gutter, keeps both rows equal. Measuring
 * the inner content avoids treating a stretched row's allocated height as its natural height.
 * Offset sizes ignore entrance and reveal transforms.
 *
 * @param grid - The board containing the four boxes in reading order.
 */
function quadrantsHeight(grid: HTMLElement): number {
  const boxes = Array.from(grid.querySelectorAll<HTMLElement>('.kit-quadrant'));
  const heights = boxes.map((box) => {
    const content = box.querySelector<HTMLElement>('.kit-quadrant-content');
    const style = getComputedStyle(box);
    return (
      (content?.offsetHeight ?? 0) +
      Number.parseFloat(style.paddingTop) +
      Number.parseFloat(style.paddingBottom) +
      Number.parseFloat(style.borderTopWidth)
    );
  });
  const gap = Number.parseFloat(getComputedStyle(grid).rowGap) || 0;
  // Stretched rows must fit exactly; the generic tolerance can hide a fractional row overflow.
  return 2 * Math.max(0, ...heights) + gap + MEASURE_TOLERANCE_PX;
}

/**
 * The quadrants component registered alongside its Node-only contract.
 */
export const quadrantsLayout = defineLayout<typeof quadrantsLayoutContract>({
  name: 'quadrants',
  component: QuadrantsLayout,
});
