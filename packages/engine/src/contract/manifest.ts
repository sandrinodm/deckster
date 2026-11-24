import type { MDXComponents } from 'mdx/types';
import type { ComponentType } from 'react';

import type { SlideFrontmatter } from '#contract/slide-frontmatter.ts';

/**
 * The export name the build adds to every slide module, holding its {@link SlideMeta}. Slide authors
 * must not declare an export with this name.
 */
export const SLIDE_META_EXPORT = 'slideMeta';

/**
 * How a slide was authored.
 */
export type SlideKind = 'mdx' | 'tsx';

/**
 * Which placed-element primitive a slide declared.
 */
export type PlacedKind = 'place' | 'shape' | 'text';

/**
 * The slide region a placed element is positioned within.
 */
export type PlacedZone = 'safe' | 'canvas' | 'header' | 'footer';

/**
 * A named anchor position within a {@link PlacedZone}.
 */
export type PlacedName =
  | 'top-left'
  | 'top'
  | 'top-right'
  | 'left'
  | 'center'
  | 'right'
  | 'bottom-left'
  | 'bottom'
  | 'bottom-right';

/**
 * A placed element's width: a grid column count or a named size token.
 */
export type PlacedWidth = number | 'sm' | 'md' | 'lg';

/**
 * Compile-time placement metadata extracted from a top-level placed element on a slide.
 */
export type PlacedMeta = {
  /**
   * Which placed primitive was authored (`place`, `shape`, or `text`).
   */
  readonly kind: PlacedKind;

  /**
   * Optional author-supplied name for the element, used in export and diagnostics.
   */
  readonly name?: string;

  /**
   * Named anchor position within {@link zone}.
   */
  readonly place?: PlacedName;

  /**
   * Inclusive 1-based column range on the brand grid, such as `"9-12"`.
   */
  readonly cols?: string;

  /**
   * Inclusive 1-based row range on the brand grid, such as `"1-2"`.
   */
  readonly rows?: string;

  /**
   * Explicit canvas-pixel box `[x, y, width, height]`.
   */
  readonly box?: readonly [number, number, number, number];

  /**
   * Frame the placement is resolved against; defaults to `safe`.
   */
  readonly zone?: PlacedZone;

  /**
   * Width in grid columns or a named width token.
   */
  readonly width?: PlacedWidth;

  /**
   * Fixed height in grid rows.
   */
  readonly height?: number;

  /**
   * Spacing token pulling a named placement inward from its zone edge.
   */
  readonly inset?: string;

  /**
   * Aspect-ratio lock for geometric variants such as `square` and `circle`.
   */
  readonly aspect?: 'square';
};

/**
 * What the build extracts from a slide file without rendering it.
 */
export type SlideMeta = {
  /**
   * Validated frontmatter, with defaults applied: the fields every slide has plus those of the
   * layout it names.
   */
  frontmatter: SlideFrontmatter & Readonly<Record<string, unknown>>;

  /**
   * The frontmatter title, else the first heading outside `<Notes>`, else the slide id.
   */
  title: string;

  /**
   * The text of every `<Notes>` block in the slide, joined by blank lines; empty if none. Each
   * block keeps its paragraphs (separated by one blank line) and line breaks, without the
   * indentation its lines share; runs of spaces collapse to one, and character references such as
   * `&amp;` are decoded.
   */
  notes: string;

  /**
   * The named slots the slide fills, in the order its layout's contract lists them; `body` is not
   * listed. A TSX slide fills each with the export of the slot's tag name (`Left`).
   */
  slots: readonly string[];

  /**
   * Top-level placed elements declared on the slide, in source order; absent when the slide has
   * none.
   */
  readonly placed?: readonly PlacedMeta[];
};

/**
 * Props the engine passes to a slide's default export. MDX slides resolve tags through them.
 */
export type SlideContentProps = {
  /**
   * The tags MDX resolves, such as `Step`, `Notes` and plugin components; MDX's defaults when
   * omitted.
   */
  components?: MDXComponents;
};

/**
 * A compiled slide module as the `virtual:deck` module imports it. A TSX slide's other exports
 * include one component per named slot it fills, such as `Left`.
 */
export type SlideModule = Readonly<Record<string, unknown>> & {
  /**
   * The slide's content component: the whole MDX slide, or a TSX slide's `body` slot.
   */
  default: ComponentType<SlideContentProps>;

  /**
   * What the build extracted from the slide file.
   */
  slideMeta: SlideMeta;
};

/**
 * One slide in presentation order.
 */
export type SlideEntry = {
  /**
   * The file name without extension, unique within the deck.
   */
  id: string;

  /**
   * The slide file relative to the deck folder, such as `slides/title.mdx`.
   */
  file: string;

  /**
   * Whether the slide is an MDX or a TSX file.
   */
  kind: SlideKind;

  /**
   * The compiled slide module.
   */
  module: SlideModule;
};

/**
 * The default export of `virtual:deck`: the active deck with its slides in manifest order.
 */
export type DeckManifest = {
  /**
   * The deck folder name under `decks/`.
   */
  id: string;

  /**
   * The deck title from `deck.config.ts`, also used as the page title.
   */
  title: string;

  /**
   * The brand folder name under `brands/`, set as `data-brand` on the deck so the brand's CSS
   * variables apply. The build always sets it; it is optional for manifests built by hand.
   */
  brand?: string;

  /**
   * The slides in presentation order.
   */
  slides: readonly SlideEntry[];

  /**
   * Whether a left click on the slide moves forward and a right click back, from the deck config's
   * `mouseNavigation`. The build always sets it; it is on when omitted.
   */
  mouseNavigation?: boolean;

  /**
   * The length of the talk in seconds, from the deck config's `duration`; absent when the config
   * has none.
   */
  durationSeconds?: number;
};
