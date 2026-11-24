import type { BackgroundLayerTokens, BrandLayoutTokens } from '@deckster/brand';
import type { BleedSide, LayoutDefinition, LayoutProps } from '@deckster/engine';
import type { CSSProperties, ReactNode } from 'react';

import { layoutLayers } from '@deckster/brand';
import { useBrand } from '@deckster/brand/runtime';

import { FittedText, Frame, Region, TreatedMedia, useEnter } from '#layout-parts.ts';
import '#layouts/brand-layout.css';

/**
 * The canvas size every box is measured on.
 */
const CANVAS = {
  /**
   * Canvas pixels across.
   */
  width: 1920,

  /**
   * Canvas pixels down.
   */
  height: 1080,
} as const;

/**
 * The most lines a text region may take at any size. The region's own height is the real limit: the
 * text steps down until it fits the box.
 */
const MAX_REGION_LINES = 99;

/**
 * The entrance order of the title; the other regions enter after it.
 */
const TITLE_ENTER_ORDER = 0;

/**
 * The entrance order of every region but the title.
 */
const REGION_ENTER_ORDER = 1;

/**
 * One region of a brand layout, as the tokens hold it.
 */
type BrandRegion = BrandLayoutTokens['regions'][number];

/**
 * Props of {@link BrandLayout}.
 */
type BrandLayoutProps = LayoutProps & {
  /**
   * The brand layout to draw.
   */
  layout: BrandLayoutTokens;
};

/**
 * Props of {@link RegionView}.
 */
type RegionViewProps = {
  /**
   * The region.
   */
  region: BrandRegion;

  /**
   * What the region's binding holds on this slide; the region draws nothing when it is empty.
   */
  children: ReactNode;
};

/**
 * Props of {@link BoxView}.
 */
type BoxViewProps = {
  /**
   * What the box holds, as `title`, `slot:<name>` or `field:<name>`.
   */
  name: string;

  /**
   * The box: x, y, width and height in canvas pixels.
   */
  box: readonly [number, number, number, number];

  /**
   * The kind of region.
   */
  kind: 'title' | 'text' | 'media' | 'content';

  /**
   * Horizontal alignment of text.
   */
  align?: 'start' | 'center' | 'end' | undefined;

  /**
   * Vertical placement of the content in the box.
   */
  anchor?: 'start' | 'center' | 'end' | undefined;

  /**
   * A brand role whose color the text takes.
   */
  color?: string | undefined;

  /**
   * The entrance order.
   */
  order: number;

  /**
   * What fills the box.
   */
  children: ReactNode;
};

/**
 * A brand layout drawn from its tokens: a frame with the layout's artwork behind it and one box on
 * the canvas for each region, at the pixels the layout gives. The title and text boxes step their
 * text down until it fits the box; media boxes crop pictures to the box in the brand's image
 * treatment. The layout's artwork replaces the surface's own background layers unless the layout
 * says `layers: 'over'`; a layout with none shows the surface's layers as usual. The boxes sit on
 * the full canvas, not inside the brand's margins.
 */
export function BrandLayout({ layout, frontmatter, slots }: BrandLayoutProps): ReactNode {
  const { surface } = useBrand();
  /**
   * What a region's binding holds on this slide: the slot's content, or the field's text.
   */
  const bound = (region: BrandRegion): ReactNode => {
    if ('slot' in region.bind) {
      const content: ReactNode = Reflect.get(slots, region.bind.slot);
      return content;
    }

    const value: unknown = Reflect.get(frontmatter, region.bind.field);
    return typeof value === 'string' || typeof value === 'number' ? String(value) : undefined;
  };
  const boxes = (
    <div className="kit-brand-canvas">
      {layout.title === false ||
      frontmatter.title === undefined ||
      frontmatter.title === '' ? null : (
        <BoxView
          name="title"
          box={layout.title.box}
          kind="title"
          align={layout.title.align}
          anchor={layout.title.anchor}
          color={layout.title.color}
          order={TITLE_ENTER_ORDER}>
          <FittedText
            as="h2"
            className={`kit-brand-title kit-heading kit-type-${layout.title.type}`}
            maxLines={MAX_REGION_LINES}
            boundary=".kit-region">
            {frontmatter.title}
          </FittedText>
        </BoxView>
      )}
      {layout.regions.map((region, index) => (
        <RegionView key={index} region={region}>
          {bound(region)}
        </RegionView>
      ))}
    </div>
  );
  return (
    <Frame
      layout={layout.name}
      variant={{ 'data-brand-layout': '' }}
      bleed={boxes}
      layers={backdropLayers(layout, surface.name, surface.layers)}
    />
  );
}

/**
 * Registers each brand layout as a runtime layout: its component, and the slide edges its media
 * boxes touch, so page chrome moves off them.
 *
 * @param layouts - The brand's layouts.
 * @returns One definition per layout, in order.
 */
export function brandLayoutDefinitions(
  layouts: readonly BrandLayoutTokens[],
): readonly LayoutDefinition[] {
  return layouts.map((layout) => ({
    name: layout.name,
    component: (props: LayoutProps) => <BrandLayout {...props} layout={layout} />,
    bleed: () => bleedSides(layout),
  }));
}

/**
 * The slide edges that media boxes of the layout touch.
 *
 * @param layout - The brand layout.
 * @returns The sides, without repeats.
 */
export function bleedSides(layout: BrandLayoutTokens): readonly BleedSide[] {
  const sides = new Set<BleedSide>();
  for (const region of layout.regions) {
    if (region.kind !== 'media') {
      continue;
    }

    const [x, y, width, height] = region.box;
    if (x <= 0) {
      sides.add('left');
    }

    if (x + width >= CANVAS.width) {
      sides.add('right');
    }

    if (y <= 0) {
      sides.add('top');
    }

    if (y + height >= CANVAS.height) {
      sides.add('bottom');
    }
  }

  return [...sides];
}

/**
 * The background layers a brand layout asks the frame to draw, or `undefined` to keep the surface's
 * own: the layout's artwork for the surface, under `layers: 'replace'` alone and under `'over'`
 * above the surface's layers.
 *
 * @param layout - The brand layout.
 * @param surface - The name of the slide's surface.
 * @param surfaceLayers - The surface's own layers.
 */
function backdropLayers(
  layout: BrandLayoutTokens,
  surface: string,
  surfaceLayers: readonly BackgroundLayerTokens[],
): readonly BackgroundLayerTokens[] | undefined {
  const own = layoutLayers(layout, surface);
  if (own === undefined) {
    return undefined;
  }

  return layout.layersMode === 'over' ? [...surfaceLayers, ...own] : own;
}

/**
 * One region of the layout: text in a fitted box, media in the brand's image treatment, or other
 * content filling its box.
 */
function RegionView({ region, children }: RegionViewProps): ReactNode {
  const name = 'slot' in region.bind ? `slot:${region.bind.slot}` : `field:${region.bind.field}`;
  if (children === undefined || children === null || children === '') {
    return null;
  }

  if (region.kind === 'media') {
    return (
      <BoxView name={name} box={region.box} kind="media" order={REGION_ENTER_ORDER}>
        <TreatedMedia
          className="kit-brand-frame"
          rounded={!touchesEdge(region.box)}
          {...(region.fit === undefined ? {} : { fit: region.fit })}
          {...(region.treatment === undefined ? {} : { treatment: region.treatment })}>
          <span data-fit={region.fit} className="kit-brand-fit">
            {children}
          </span>
        </TreatedMedia>
      </BoxView>
    );
  }

  if (region.kind === 'content') {
    return (
      <BoxView
        name={name}
        box={region.box}
        kind="content"
        align={region.align}
        anchor={region.anchor}
        order={REGION_ENTER_ORDER}>
        <div className="kit-brand-content">{children}</div>
      </BoxView>
    );
  }

  return (
    <BoxView
      name={name}
      box={region.box}
      kind="text"
      align={region.align}
      anchor={region.anchor}
      color={region.color}
      order={REGION_ENTER_ORDER}>
      <FittedText
        as={'slot' in region.bind ? 'div' : 'p'}
        className={`kit-brand-text kit-prose kit-type-${region.type ?? 'body'}`}
        maxLines={MAX_REGION_LINES}
        boundary=".kit-region">
        {children}
      </FittedText>
    </BoxView>
  );
}

/**
 * An absolutely positioned box on the canvas, a size container that holds its content.
 */
function BoxView({
  name,
  box,
  kind,
  align,
  anchor,
  color,
  order,
  children,
}: BoxViewProps): ReactNode {
  const [x, y, width, height] = box;
  const enter = useEnter(order);
  const style: CSSProperties & Record<`--${string}`, string> = {
    left: x,
    top: y,
    width,
    height,
    ...(color === undefined ? {} : { '--kit-brand-color': `var(--brand-color-${color})` }),
  };
  return (
    <div
      className="kit-brand-region"
      data-region={name}
      data-kind={kind}
      data-align={align}
      data-anchor={anchor}
      data-colored={color === undefined ? undefined : ''}
      style={style}
      {...enter}>
      <Region>{children}</Region>
    </div>
  );
}

/**
 * Whether a box touches an edge of the canvas, where media runs to the slide's own corners.
 *
 * @param box - The box: x, y, width and height in canvas pixels.
 */
function touchesEdge(box: readonly [number, number, number, number]): boolean {
  const [x, y, width, height] = box;
  return x <= 0 || y <= 0 || x + width >= CANVAS.width || y + height >= CANVAS.height;
}
