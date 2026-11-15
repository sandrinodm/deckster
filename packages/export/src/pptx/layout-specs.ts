import type {
  AnyLayoutContract,
  PptxLayoutType,
  PptxPlaceholderKind,
} from '@deckster/engine/layout';

import type { PptxDeckInput, PptxSlideInput } from '#pptx/deck-input.ts';
import type { FontResolver, TextContext, TextDefaults } from '#pptx/text-xml.ts';
import type { SurfaceTheme } from '#pptx/theme.ts';
import type { SceneRect, TextNode } from '#scene/scene.ts';

import { groupText } from '#plan/group-text.ts';
import { chromeShapes, commonChrome, sameChrome, type ChromeShape } from '#pptx/chrome.ts';
import { OFF_SLIDE_GAP_PX, OFF_SLIDE_HEIGHT_PX, type PlaceholderRef } from '#pptx/frame-xml.ts';
import { layoutFrame, textDefaults } from '#pptx/text-xml.ts';
import { CANVAS_HEIGHT_PX, CANVAS_WIDTH_PX } from '#units.ts';

/**
 * The layout slides fall back to when their layout has no contract.
 */
export const FALLBACK_LAYOUT = 'default';

/**
 * The number of lines a title's box is tall: a title may wrap onto a second line.
 */
const TITLE_LINES = 2;

/**
 * A placeholder mapping of a layout contract: its kind and where its text comes from.
 */
type PlaceholderMapping = NonNullable<AnyLayoutContract['pptx']>['placeholders'][number];

/**
 * The slide layout types every slide master offers, so a slide inserted in PowerPoint can start
 * from a title, a section, a title and content, two contents or a title only, even when the deck
 * uses none of them on that surface.
 */
const BASIC_TYPES: readonly PptxLayoutType[] = [
  'title',
  'section',
  'content',
  'two-content',
  'title-only',
];

/**
 * The placeholder index of the slide number on every master and layout.
 */
export const SLIDE_NUMBER_IDX = 12;

/**
 * A placeholder on a layout: what it holds, where it sits and the text style its runs inherit.
 */
export type PlaceholderSpec = {
  /**
   * What it holds.
   */
  kind: PptxPlaceholderKind;

  /**
   * Its type and index.
   */
  ref: PlaceholderRef;

  /**
   * Where it sits.
   */
  rect: SceneRect;

  /**
   * Its first level's text style, from the slide it was measured on, or `null` for the master's.
   */
  defaults: TextDefaults | null;
};

/**
 * Where the slide number goes on a master or layout and how it is set.
 */
export type SlideNumberSpec = {
  /**
   * Where it sits.
   */
  rect: SceneRect;

  /**
   * Its text style.
   */
  defaults: TextDefaults | null;

  /**
   * The chrome text it was measured from.
   */
  shape: ChromeShape;
};

/**
 * One layout under a master: its name, PowerPoint type, placeholders, and its chrome when it
 * differs from the master's.
 */
export type LayoutSpec = {
  /**
   * The deck layout's name, which the PowerPoint layout is named after.
   */
  name: string;

  /**
   * The PowerPoint layout type.
   */
  type: PptxLayoutType;

  /**
   * The placeholders with their boxes and styles, in order.
   */
  placeholders: PlaceholderSpec[];

  /**
   * The layout's own chrome, or `null` when it shows the master's.
   */
  chrome: ChromeShape[] | null;

  /**
   * The slide number placeholder, or `null` for none.
   */
  slideNumber: SlideNumberSpec | null;

  /**
   * Whether a slide of the deck uses the layout on this master.
   */
  used: boolean;
};

/**
 * One slide master: its surface, its chrome and its layouts.
 */
export type MasterSpec = {
  /**
   * The surface.
   */
  surface: string;

  /**
   * The surface's theme.
   */
  theme: SurfaceTheme;

  /**
   * The chrome most of the surface's slides draw.
   */
  chrome: ChromeShape[];

  /**
   * The slide number placeholder, or `null` when the surface's slides show none.
   */
  slideNumber: SlideNumberSpec | null;

  /**
   * The layouts: those the surface's slides use, then the basic set.
   */
  layouts: LayoutSpec[];
};

/**
 * What layout specs need besides the deck.
 */
export type SpecContext = {
  /**
   * The themes of every surface, `default` first.
   */
  themes: readonly SurfaceTheme[];

  /**
   * Picks fonts for text styles.
   */
  font: FontResolver | undefined;
};

/**
 * The slide masters to write: one per surface the slides use (the default surface when there are no
 * slides), each with the chrome most of its slides draw, and its layouts: one per deck layout its
 * slides use, then one of each basic type the deck has a layout for. A layout's placeholders sit
 * where the first slide of that layout (on that surface, else on any) drew them, with that text's
 * style for runs to inherit; a layout whose slides draw other chrome than the master (a photo
 * bleeding to a corner moves the logo) has its own.
 *
 * @param input - The deck.
 * @param context - The themes and fonts.
 */
export function masterSpecs(
  input: Pick<PptxDeckInput, 'layouts' | 'slides' | 'brand'>,
  context: SpecContext,
): MasterSpec[] {
  const contracts = withFallback(input.layouts);
  const surfaces = [...new Set(input.slides.map((slide) => slide.scene.surface))];
  const used = context.themes.filter(
    (theme, index) => surfaces.includes(theme.surface) || (surfaces.length === 0 && index === 0),
  );
  const themes = used.length === 0 ? context.themes.slice(0, 1) : used;
  return themes.map((theme) => {
    const onSurface = input.slides.filter((slide) => slide.scene.surface === theme.surface);
    const chromeSets = onSurface.map((slide) => slideChrome(slide));
    const chrome = commonChrome(chromeSets);
    const slideNumber = slideNumberSpec(chrome, theme, context);
    const layoutNames = [
      ...new Set(onSurface.map((slide) => layoutName(contracts, slide.scene.layout))),
    ];
    const basics = BASIC_TYPES.flatMap((type) => {
      const contract = contracts.find((candidate) => candidate.pptx?.type === type);
      return contract === undefined || layoutNames.includes(contract.name) ? [] : [contract.name];
    });
    const layouts = [...layoutNames, ...basics].flatMap((name) => {
      const contract = contracts.find((candidate) => candidate.name === name);
      return contract === undefined
        ? []
        : [layoutSpec(input, contract, theme, chrome, context, layoutNames.includes(name))];
    });
    return { surface: theme.surface, theme, chrome, slideNumber, layouts };
  });
}

/**
 * The deck's layout contracts with the fallback layout added when none has its name.
 *
 * @param contracts - The contracts.
 */
function withFallback(contracts: readonly AnyLayoutContract[]): AnyLayoutContract[] {
  return contracts.some((contract) => contract.name === FALLBACK_LAYOUT)
    ? [...contracts]
    : [...contracts, { name: FALLBACK_LAYOUT } as AnyLayoutContract];
}

/**
 * The layout a slide uses: its own when it has a contract, else the fallback.
 *
 * @param contracts - The contracts.
 * @param name - The slide's layout.
 */
export function layoutName(contracts: readonly AnyLayoutContract[], name: string): string {
  return contracts.some((contract) => contract.name === name) ? name : FALLBACK_LAYOUT;
}

/**
 * A slide's chrome, from its grouped items.
 *
 * @param slide - The slide.
 */
export function slideChrome(slide: PptxSlideInput): ChromeShape[] {
  return chromeShapes(slide, groupText(slide.plan.items));
}

/**
 * One layout under a master.
 *
 * @param input - The deck.
 * @param contract - The layout contract.
 * @param theme - The master's theme.
 * @param masterChrome - The master's chrome.
 * @param context - The fonts.
 * @param isUsed - Whether a slide on this surface uses it.
 */
function layoutSpec(
  input: Pick<PptxDeckInput, 'slides' | 'brand'>,
  contract: AnyLayoutContract,
  theme: SurfaceTheme,
  masterChrome: readonly ChromeShape[],
  context: SpecContext,
  isUsed: boolean,
): LayoutSpec {
  const ownSlides = input.slides.filter(
    (slide) => slide.scene.layout === contract.name && slide.scene.surface === theme.surface,
  );
  const reference = ownSlides[0];
  const chrome = reference === undefined ? null : slideChrome(reference);
  const ownChrome = chrome === null || sameChrome(chrome, masterChrome) ? null : chrome;
  const slideNumber = ownChrome === null ? null : slideNumberSpec(ownChrome, theme, context);
  const mapping = contract.pptx;
  if (mapping === undefined) {
    return {
      name: contract.name,
      type: 'blank',
      placeholders: [],
      chrome: ownChrome,
      slideNumber,
      used: isUsed,
    };
  }

  const refs = placeholderRefs(
    mapping.type,
    mapping.placeholders.map((placeholder) => placeholder.kind),
  );
  const placeholders = mapping.placeholders.flatMap((placeholder): PlaceholderSpec[] => {
    const ref = refs.get(placeholder.kind);
    if (ref === undefined) {
      return [];
    }

    return [placeholderSpec(input, contract, placeholder, ref, theme, context)];
  });
  return {
    name: contract.name,
    type: mapping.type,
    placeholders,
    chrome: ownChrome,
    slideNumber,
    used: isUsed,
  };
}

/**
 * One placeholder of a layout: its box and text style, from the first slide that drew its text, or
 * from the brand's default place when no slide did. A slide on another surface sets the text in the
 * master's default color.
 *
 * @param input - The deck.
 * @param contract - The layout contract.
 * @param placeholder - The placeholder's mapping in the contract.
 * @param ref - The placeholder's reference on the layout.
 * @param theme - The master's theme.
 * @param context - The fonts.
 */
function placeholderSpec(
  input: Pick<PptxDeckInput, 'slides' | 'brand'>,
  contract: AnyLayoutContract,
  placeholder: PlaceholderMapping,
  ref: PlaceholderRef,
  theme: SurfaceTheme,
  context: SpecContext,
): PlaceholderSpec {
  const measured = measuredFrame(input, contract, placeholder.kind, theme);
  const offSlide = 'field' in placeholder.from;
  const textContext = specTextContext(theme, input, context);
  const layout = measured === null ? null : layoutFrame(measured.frame.paragraphs);
  const defaults = layout === null ? null : textDefaults(layout, textContext);
  return {
    kind: placeholder.kind,
    ref,
    rect: layout?.rect ?? defaultRect(input, placeholder.kind, offSlide),
    defaults:
      defaults === null || measured?.sameSurface === true
        ? defaults
        : { ...defaults, color: `#${theme.colors.dk1}` },
  };
}

/**
 * The text context layout specs measure styles with.
 *
 * @param theme - The master's theme.
 * @param input - The deck, for the brand's families.
 * @param context - The fonts.
 */
function specTextContext(
  theme: SurfaceTheme,
  input: Pick<PptxDeckInput, 'brand'>,
  context: SpecContext,
): TextContext {
  const families = {
    major: input.brand.typography.families.display.family,
    minor: input.brand.typography.families.body.family,
  };
  return {
    theme,
    families,
    link: () => null,
    slideNumber: null,
    ...(context.font === undefined ? {} : { font: context.font }),
  };
}

/**
 * The slide number placeholder of a set of chrome: where its page number sits and its style.
 *
 * @param chrome - The chrome.
 * @param theme - The master's theme.
 * @param context - The fonts.
 */
function slideNumberSpec(
  chrome: readonly ChromeShape[],
  theme: SurfaceTheme,
  context: SpecContext,
): SlideNumberSpec | null {
  const page = chrome.find((shape) => shape.kind === 'page');
  if (page === undefined || page.node.kind !== 'text') {
    return null;
  }

  const layout = layoutFrame(page.node.paragraphs);
  const brand = {
    major: theme.fonts.major,
    minor: theme.fonts.minor,
  };
  const defaults = textDefaults(layout, {
    theme,
    families: brand,
    link: () => null,
    slideNumber: null,
    ...(context.font === undefined ? {} : { font: context.font }),
  });
  return { rect: layout.rect, defaults, shape: page };
}

/**
 * The frame the first slide of a layout drew a placeholder's text in, preferring a slide on the
 * master's surface.
 *
 * @param input - The deck.
 * @param contract - The layout contract.
 * @param kind - The placeholder kind.
 * @param theme - The master's theme.
 */
function measuredFrame(
  input: Pick<PptxDeckInput, 'slides'>,
  contract: AnyLayoutContract,
  kind: PptxPlaceholderKind,
  theme: SurfaceTheme,
): { frame: TextNode; sameSurface: boolean } | null {
  const source = contract.pptx?.placeholders.find((placeholder) => placeholder.kind === kind)?.from;
  if (source === undefined || 'field' in source) {
    return null;
  }

  const slides = input.slides.filter((slide) => slide.scene.layout === contract.name);
  const ordered = [
    ...slides.filter((slide) => slide.scene.surface === theme.surface),
    ...slides.filter((slide) => slide.scene.surface !== theme.surface),
  ];
  for (const slide of ordered) {
    const frames = groupText(slide.plan.items).flatMap((item) =>
      item.kind === 'native' && item.node.kind === 'text' ? [item.node] : [],
    );
    const frame = frames.find((candidate) => matchesSource(candidate, source));
    if (frame !== undefined) {
      return { frame, sameSurface: slide.scene.surface === theme.surface };
    }
  }

  return null;
}

/**
 * Whether a text frame holds a placeholder source's text.
 *
 * @param frame - The frame.
 * @param source - The source.
 */
export function matchesSource(
  frame: TextNode,
  source: { slot: string } | { selector: string } | { field: string },
): boolean {
  if ('slot' in source) {
    return frame.slot === source.slot && frame.matches.length === 0;
  }

  return 'selector' in source && frame.matches.includes(source.selector);
}

/**
 * The placeholder reference for each kind on a layout of a type: a title slide's title is
 * `ctrTitle`, a subtitle takes index 1 and a body the next free index.
 *
 * @param type - The layout type.
 * @param kinds - The kinds the layout maps, in order.
 * @returns A reference per kind.
 */
export function placeholderRefs(
  type: PptxLayoutType,
  kinds: readonly PptxPlaceholderKind[],
): Map<PptxPlaceholderKind, PlaceholderRef> {
  const refs = new Map<PptxPlaceholderKind, PlaceholderRef>();
  let idx = 1;
  for (const kind of kinds) {
    if (kind === 'title') {
      refs.set(kind, { type: type === 'title' ? 'ctrTitle' : 'title', idx: undefined });
    } else {
      refs.set(kind, { type: kind === 'subtitle' ? 'subTitle' : 'body', idx });
      idx += 1;
    }
  }

  return refs;
}

/**
 * A placeholder's box when no slide shows where it goes: the title on the brand's top margin, the
 * body below it, and a title the layout does not draw just above the slide.
 *
 * @param input - The deck.
 * @param kind - The placeholder kind.
 * @param offSlide - Whether the text comes from a field the layout does not draw.
 */
export function defaultRect(
  input: Pick<PptxDeckInput, 'brand'>,
  kind: PptxPlaceholderKind,
  offSlide: boolean,
): SceneRect {
  const { margin } = input.brand.spacing;
  const width = CANVAS_WIDTH_PX - 2 * margin.x;
  if (offSlide) {
    return {
      x: 0,
      y: -(OFF_SLIDE_HEIGHT_PX + OFF_SLIDE_GAP_PX),
      width: CANVAS_WIDTH_PX,
      height: OFF_SLIDE_HEIGHT_PX,
    };
  }

  const headline = input.brand.typography.scale.headline;
  const titleHeight = headline.size * headline.lineHeight * TITLE_LINES;
  if (kind === 'title') {
    return { x: margin.x, y: margin.y, width, height: titleHeight };
  }

  const top = margin.y + titleHeight + input.brand.spacing.scale.lg;
  return { x: margin.x, y: top, width, height: CANVAS_HEIGHT_PX - margin.y - top };
}
