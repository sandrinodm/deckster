import { useBrand } from '@deckster/brand/runtime';
import { defineLayout, useStatic, type LayoutProps } from '@deckster/engine';
import { useRef, type CSSProperties, type ReactNode } from 'react';

import type { BentoTile, bentoLayoutContract } from '#layouts/bento-layout.contract.ts';

import { FrontmatterPicture } from '#foundation/frontmatter-picture.tsx';
import {
  enterProps,
  Footnote,
  Frame,
  frontmatterIcon,
  Region,
  SlideHeader,
  smartPunctuation,
  StatValue,
  Step,
  useEnter,
  useFitLevel,
  type IconComponent,
} from '#layout-parts.ts';
import { tileKind } from '#layouts/bento-layout.contract.ts';
import '#layouts/bento-layout.css';

/**
 * The most lines the title takes in its cell before it steps down in size.
 */
const TITLE_MAX_LINES = 3;

/**
 * The entrance order of the lead tile; the title cell enters first, the other tiles after it.
 */
const LEAD_ORDER = 1;

/**
 * The sizes the grid tries, largest first, until every tile fits its cell: the tile text at the
 * body size, at the small size, then compact tiles (less padding, smaller headings).
 */
const BENTO_LEVELS = [
  { text: 'body', compact: false },
  { text: 'small', compact: false },
  { text: 'small', compact: true },
] as const;

/**
 * The most tiles whose text may be set at the body size; with more, the tiles under the lead are
 * three columns wide and take the small size.
 */
const BODY_TEXT_MOST_TILES = 3;

/**
 * A custom property the stylesheet sizes a figure by: how many characters it has.
 */
type FigureStyle = CSSProperties & { '--kit-value-chars': number };

/**
 * The `bento` layout: one grid over the whole safe area, twelve columns by two rows. The title cell
 * (eyebrow and title at its top, a line of context on its foot) takes the left five columns of the
 * top row, and the lead tile the right seven; the other tiles share the bottom row, the second
 * under the title cell and the rest under the lead (four equal tiles with five). The rows stretch
 * to the bottom line, three fifths for the top, so the grid leaves no empty canvas. The lead sits
 * on the brand's accent surface (a picture lead keeps its picture); the others are panels in the
 * surface's raised color, their content standing on the tile's foot. Figures size to their tile's
 * width by their length, so one figure never outgrows its column. Three tiles set their text at the
 * body size when it fits, more at the small size; when the text does not fit, the whole grid steps
 * down, to compact tiles last.
 */
function BentoLayout({ frontmatter, slots }: LayoutProps<typeof bentoLayoutContract>): ReactNode {
  const { tiles, reveal } = frontmatter;
  const region = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const levels = tiles.length <= BODY_TEXT_MOST_TILES ? BENTO_LEVELS : BENTO_LEVELS.slice(1);
  const { level } = useFitLevel(region, grid, levels.length, JSON.stringify(tiles), {
    overflow: true,
    restartOnFontLoad: true,
  });
  const size = levels[level] ?? { text: 'small', compact: true };
  const { brand } = useBrand();
  return (
    <Frame
      layout="bento"
      variant={{ 'data-count': String(tiles.length), 'data-compact': String(size.compact) }}>
      <Region ref={region} className="kit-bento-region">
        <div ref={grid} className="kit-bento">
          <TitleCell
            eyebrow={frontmatter.eyebrow}
            title={frontmatter.title}
            contextType={`kit-type-${size.text}`}>
            {slots.body}
          </TitleCell>
          {tiles.map((tile, index) => {
            const content = (
              <TileView
                key={index}
                tile={tile}
                index={index}
                lead={index === 0}
                icon={frontmatterIcon(tile.icon, brand.icons.set)}
                textType={`kit-type-${size.text}`}
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
 * Props of {@link TitleCell}.
 */
type TitleCellProps = {
  /**
   * The eyebrow above the title.
   */
  eyebrow: string | undefined;

  /**
   * The slide title.
   */
  title: string | undefined;

  /**
   * The type class of the line of context, from the grid's fit level.
   */
  contextType: string;

  /**
   * The line of context, the body slot; nothing when the slide has none.
   */
  children?: ReactNode;
};

/**
 * The grid's first cell: the shared header (up to three lines of title in five columns) at its top
 * and the line of context standing on its foot.
 */
function TitleCell({ eyebrow, title, contextType, children }: TitleCellProps): ReactNode {
  const contextEnter = useEnter(0);
  return (
    <div className="kit-bento-head">
      <SlideHeader eyebrow={eyebrow} title={title} maxLines={TITLE_MAX_LINES} />
      {children === undefined ? null : (
        <div className={`kit-bento-context kit-prose ${contextType}`} {...contextEnter}>
          {children}
        </div>
      )}
    </div>
  );
}

/**
 * Props of {@link TileView}.
 */
type TileViewProps = {
  /**
   * The tile from the frontmatter.
   */
  tile: BentoTile;

  /**
   * Its place in `tiles:`, 0 for the lead.
   */
  index: number;

  /**
   * Whether it is the lead, in the large cell beside the title.
   */
  lead: boolean;

  /**
   * The icon of a text tile, resolved from the brand's set; none when it names none.
   */
  icon: IconComponent | undefined;

  /**
   * The type class of a small tile's running text, from the grid's fit level.
   */
  textType: string;
};

/**
 * One tile in its cell. The lead tile (index 0) wears the accent surface, unless it is a picture.
 */
function TileView({ tile, index, lead, icon, textType }: TileViewProps): ReactNode {
  const isStatic = useStatic();
  const kind = tileKind(tile);
  const surface = lead && kind !== 'picture' ? { 'data-surface': 'accent' } : {};
  return (
    <article
      className="kit-bento-tile"
      data-index={index}
      data-kind={kind}
      data-size={lead ? 'lead' : 'small'}
      {...surface}
      {...enterProps(LEAD_ORDER + index, isStatic)}>
      <TileContent tile={tile} lead={lead} Icon={icon} textType={textType} />
    </article>
  );
}

/**
 * Props of {@link TileContent}.
 */
type TileContentProps = {
  /**
   * The tile from the frontmatter.
   */
  tile: BentoTile;

  /**
   * Whether it is the lead, whose text is set larger.
   */
  lead: boolean;

  /**
   * The icon of a text tile; none when it names none.
   */
  Icon: IconComponent | undefined;

  /**
   * The type class of a small tile's running text.
   */
  textType: string;
};

/**
 * What a tile shows: its picture, its figure and label, or its icon, heading and text.
 */
function TileContent({ tile, lead, Icon, textType }: TileContentProps): ReactNode {
  const runningType = lead ? 'kit-type-lead' : textType;
  if (tile.src !== undefined) {
    return (
      <FrontmatterPicture
        className="kit-bento-picture"
        src={tile.src}
        alt={tile.alt ?? ''}
        focal={tile.focal}
        treatment={tile.treatment}
      />
    );
  }

  if (tile.value !== undefined) {
    return <TileFigure value={tile.value} label={tile.label ?? ''} labelType={runningType} />;
  }

  const headingType = lead ? 'kit-type-headline' : 'kit-type-title';
  return (
    <div className="kit-bento-note">
      {Icon === undefined ? null : (
        <span className="kit-bento-icon-tile" aria-hidden="true" data-decorative="">
          <Icon className="kit-bento-icon" aria-hidden="true" focusable="false" />
        </span>
      )}
      <div className="kit-bento-text">
        <h3 className={`kit-bento-title kit-heading ${headingType}`} data-fit="scaled">
          {smartPunctuation(tile.title ?? '')}
        </h3>
        {tile.text === undefined ? null : (
          <p className={`kit-bento-body ${runningType}`}>{smartPunctuation(tile.text)}</p>
        )}
      </div>
    </div>
  );
}

/**
 * Props of {@link TileFigure}.
 */
type TileFigureProps = {
  /**
   * The figure as the slide writes it.
   */
  value: string | number;

  /**
   * What it counts.
   */
  label: string;

  /**
   * The type class of the label.
   */
  labelType: string;
};

/**
 * A figure tile's content: the figure, sized by the stylesheet from its length to its tile's width,
 * and the line under it.
 */
function TileFigure({ value, label, labelType }: TileFigureProps): ReactNode {
  const style: FigureStyle = { '--kit-value-chars': String(value).length };
  return (
    <div className="kit-bento-figure" style={style} data-fit="scaled">
      <StatValue value={value} className="kit-bento-value" />
      <p className={`kit-bento-label ${labelType}`}>{smartPunctuation(label)}</p>
    </div>
  );
}

/**
 * The `bento` layout's component.
 */
export const bentoLayout = defineLayout<typeof bentoLayoutContract>({
  name: 'bento',
  component: BentoLayout,
});
