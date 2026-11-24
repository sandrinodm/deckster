import type { ReactNode } from 'react';

import { DEFAULT_SURFACE } from '@deckster/brand';
import { getBrand } from '@deckster/brand/runtime';
import { useDeck, useLayouts, useStatic, type BleedSide } from '@deckster/engine';
import { useEffect, useState } from 'react';

import {
  CHROME_CORNERS,
  planChrome,
  type ChromeCorner,
  type ChromeItem,
  type ChromePlan,
} from '#chrome/chrome-plan.ts';
import { resolvePlace } from '#place/resolve-place.ts';

/**
 * Converts the progress fraction to a CSS percentage.
 */
const PERCENT = 100;

/**
 * No background, so the chrome layers can carry a surface's colors without painting over the slide;
 * the brand's surface rule paints every element that names a surface.
 */
const TRANSPARENT = {
  /**
   * Paints nothing behind the chrome.
   */
  background: 'none',
} as const;

/**
 * What the chrome looks like for one slide: its surface and where its items sit. A change of look
 * cross-fades; a change of page number alone does not.
 */
type ChromeLook = {
  /**
   * The surface of the slide, for colors and the logo variant.
   */
  surface: string;

  /**
   * The plan for the slide.
   */
  plan: ChromePlan;

  /**
   * The surface and the corners' contents, as one string to compare looks by.
   */
  key: string;

  /**
   * The page number, as a string to tell a new slide with the same look from the same slide.
   */
  detail: string;
};

/**
 * One layer of chrome on screen: the current look, or the previous one fading out under the slide
 * transition.
 */
type ChromeLayer = ChromeLook & {
  /**
   * A number unique among the layers, for React.
   */
  id: number;

  /**
   * Whether the layer is the previous look, fading out.
   */
  leaving: boolean;

  /**
   * Whether the layer replaced another look and fades in over it.
   */
  entering: boolean;
};

/**
 * The page chrome the brand describes, drawn over every slide on the deck's stage: logo, footer
 * text and page number in the corners the brand names, and the progress bar on its edge. It takes
 * the colors and logo variant of the surface of the slide on screen; when the next slide is on
 * another surface, or moves an item off a bleeding photo, the old chrome fades out and the new one
 * in over the brand's slide transition, so the logo and page number change with the slide instead
 * of blinking ahead of it. It hides on slides whose frontmatter (or layout default) says `chrome:
 * false` and on the first slide when the brand skips it. It also names the brand's slide transition
 * for the kit's motion stylesheet.
 */
export function Chrome(): ReactNode {
  const { brand } = getBrand();
  const look = useChromeLook();
  const layers = useChromeLayers(look, brand.motion.transition.duration);
  const { progress } = brand.chrome;
  return (
    <div
      className="kit-chrome"
      data-transition={brand.motion.transition.kind}
      data-surface={look.surface}
      data-visible={look.plan.visible}
      aria-hidden="true"
      style={TRANSPARENT}>
      {layers.map((layer) => (
        <div
          key={layer.id}
          className="kit-chrome-layer"
          data-surface={layer.surface}
          data-leaving={layer.leaving}
          data-entering={layer.entering}
          style={TRANSPARENT}>
          {CHROME_CORNERS.map((corner) => (
            <ChromeCornerItems
              key={corner}
              corner={corner}
              items={layer.plan.corners[corner]}
              pageText={layer.plan.pageText}
              surface={layer.surface}
            />
          ))}
          {layer.plan.pageBox === undefined || layer.plan.pageText === '' ? null : (
            <PageNumberBox box={layer.plan.pageBox} text={layer.plan.pageText} />
          )}
        </div>
      ))}
      {progress.show && look.plan.progressShown ? (
        <div
          className="kit-chrome-progress"
          data-edge={progress.edge}
          style={{ height: progress.thickness, width: `${look.plan.progress * PERCENT}%` }}
        />
      ) : null}
    </div>
  );
}

/**
 * Props of {@link PageNumberBox}.
 */
type PageNumberBoxProps = {
  /**
   * The box the brand layout gives the page number: x, y, width and height in canvas pixels.
   */
  box: readonly [number, number, number, number];

  /**
   * The formatted page number.
   */
  text: string;
};

/**
 * The page number in a box on the canvas, centred in it, for a brand layout that places it.
 */
function PageNumberBox({ box, text }: PageNumberBoxProps): ReactNode {
  const [left, top, width, height] = box;
  return (
    <span
      className="kit-chrome-text kit-chrome-page-box kit-type-label kit-numeric"
      style={{ left, top, width, height }}>
      {text}
    </span>
  );
}

/**
 * The chrome's look for the slide on screen: its surface and its plan, with the corners the slide's
 * layout says its media bleeds to.
 */
function useChromeLook(): ChromeLook {
  const deck = useDeck();
  const layouts = useLayouts();
  const { brand } = getBrand();
  const index = deck.position.slide;
  const entry = deck.manifest.slides[index];
  const frontmatter = entry?.module.slideMeta.frontmatter ?? { layout: 'default' };
  const slots = entry?.module.slideMeta.slots ?? [];
  const own = brand.layouts.find((layout) => layout.name === frontmatter.layout);
  // A brand layout's media boxes cover the corners they reach; other layouts name whole edges.
  const bleed: readonly BleedSide[] =
    own === undefined
      ? (layouts.get(frontmatter.layout)?.bleed?.({ frontmatter, slots }) ?? [])
      : [];
  const mediaBoxes = own?.regions
    .filter((region) => region.kind === 'media')
    .map((region) => region.box);
  const placedBoxes = entry?.module.slideMeta.placed?.map(
    (item) => resolvePlace(item, brand.spacing).rect,
  );
  const layoutChrome = own?.chrome;
  const plan = planChrome({
    chrome: brand.chrome,
    logoCorner: brand.logo.placement.corner,
    index,
    hidden: deck.slides.map((slide) => slide.hidden),
    frontmatter,
    bleed,
    margin: brand.spacing.margin,
    ...(layoutChrome === undefined ? {} : { layoutChrome }),
    ...(mediaBoxes === undefined ? {} : { mediaBoxes }),
    ...(placedBoxes === undefined || placedBoxes.length === 0 ? {} : { placedBoxes }),
  });
  const surface = frontmatter.surface ?? DEFAULT_SURFACE;
  return {
    surface,
    plan,
    key: `${surface}|${JSON.stringify(plan.corners)}|${plan.pageBox?.join(',') ?? ''}`,
    detail: plan.pageText,
  };
}

/**
 * The chrome layers to draw: the current look on top and, for one slide transition after the look
 * changes, the previous look fading out under it. In static mode there is only ever the current
 * look.
 *
 * @param look - The current look.
 * @param durationMs - The brand's slide transition duration, after which the old look is dropped.
 */
function useChromeLayers(look: ChromeLook, durationMs: number): readonly ChromeLayer[] {
  const isStatic = useStatic();
  const [layers, setLayers] = useState<readonly ChromeLayer[]>(() => [
    { ...look, id: 0, leaving: false, entering: false },
  ]);
  const top = layers.at(-1);
  if (top !== undefined && top.key !== look.key) {
    const entering = { ...look, id: top.id + 1, leaving: false, entering: !isStatic };
    setLayers(isStatic ? [entering] : [{ ...top, leaving: true }, entering]);
  } else if (top !== undefined && top.detail !== look.detail) {
    // The same look on another slide: only the page number changes, in place.
    setLayers([...layers.slice(0, -1), { ...top, plan: look.plan, detail: look.detail }]);
  }

  const hasLeaving = layers.some((layer) => layer.leaving);
  useEffect(() => {
    if (!hasLeaving) {
      return undefined;
    }

    const timer = setTimeout(() => {
      setLayers((current) => current.filter((layer) => !layer.leaving));
    }, durationMs);
    return () => clearTimeout(timer);
  }, [hasLeaving, durationMs]);
  return layers;
}

/**
 * Props of {@link ChromeCornerItems}.
 */
type ChromeCornerItemsProps = {
  /**
   * The corner.
   */
  corner: ChromeCorner;

  /**
   * What goes in it, outermost first.
   */
  items: readonly ChromeItem[];

  /**
   * The formatted page number.
   */
  pageText: string;

  /**
   * The surface of the layer, for the logo variant.
   */
  surface: string;
};

/**
 * The items of one corner, in a row that starts at the slide's edge.
 */
function ChromeCornerItems({
  corner,
  items,
  pageText,
  surface,
}: ChromeCornerItemsProps): ReactNode {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className="kit-chrome-corner" data-corner={corner}>
      {items.map((item) => (
        <ChromeItemView key={item} item={item} pageText={pageText} surface={surface} />
      ))}
    </div>
  );
}

/**
 * Props of {@link ChromeItemView}.
 */
type ChromeItemViewProps = {
  /**
   * Which item to draw.
   */
  item: ChromeItem;

  /**
   * The formatted page number.
   */
  pageText: string;

  /**
   * The surface of the layer, for the logo variant.
   */
  surface: string;
};

/**
 * One chrome item: the surface's logo variant, the brand's footer text or the page number, the text
 * in the brand's label style.
 */
function ChromeItemView({ item, pageText, surface }: ChromeItemViewProps): ReactNode {
  const view = getBrand(surface);
  switch (item) {
    case 'logo': {
      const { url, height, aspect, shown } = view.logo;
      if (!shown) {
        return null;
      }

      return (
        <img
          className="kit-chrome-logo"
          src={url}
          alt=""
          width={Math.round(height * aspect)}
          height={height}
        />
      );
    }

    case 'footer': {
      return (
        <span className="kit-chrome-text kit-type-label">{view.brand.chrome.footer.text}</span>
      );
    }

    case 'page': {
      return <span className="kit-chrome-text kit-type-label kit-numeric">{pageText}</span>;
    }
  }
}
