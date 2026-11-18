import type { BrandTokens } from '@deckster/brand';
import type { AnyLayoutContract, PptxPlaceholderKind } from '@deckster/engine/layout';

import { parseHash } from '@deckster/engine/hash';

import type { OpcPackage } from '#ooxml/opc-package.ts';
import type { ExportMode, PlanItem } from '#plan/plan-scene.ts';
import type { ChromeShape } from '#pptx/chrome.ts';
import type { PptxSlideInput } from '#pptx/deck-input.ts';
import type { PlaceholderRef } from '#pptx/frame-xml.ts';
import type { LayoutArt, LayoutSource } from '#pptx/layout-art.ts';
import type { LayoutSpec, SlideNumberSpec } from '#pptx/layout-specs.ts';
import type { FontResolver, LinkTarget, TextContext } from '#pptx/text-xml.ts';
import type { SurfaceTheme } from '#pptx/theme.ts';
import type {
  BoxNode,
  ChartNode,
  ImageNode,
  MediaNode,
  SceneNode,
  SceneRect,
  SvgNode,
  TextNode,
} from '#scene/scene.ts';

import { el, XML_DECLARATION } from '#ooxml/xml.ts';
import { groupText } from '#plan/group-text.ts';
import { parentLookup } from '#plan/plan-scene.ts';
import { hasGrainOnly } from '#plan/plan-scene.ts';
import { timingXml, type RevealTarget } from '#pptx/animation-xml.ts';
import { writeChart } from '#pptx/chart-frame.ts';
import { chromeXml, slideNumberXml } from '#pptx/chrome-xml.ts';
import { chromeShapes, sameChrome } from '#pptx/chrome.ts';
import { diagramXml } from '#pptx/diagram-xml.ts';
import { offSlidePlaceholderXml, textFrameXml } from '#pptx/frame-xml.ts';
import { isLayoutArtNode, showsLayoutArt } from '#pptx/layout-art.ts';
import { matchesSource } from '#pptx/layout-specs.ts';
import { SHAPE_TREE_ROOT } from '#pptx/master-xml.ts';
import { embedMedia, mediaPart } from '#pptx/media.ts';
import { MEDIA_EXTENSION, P14_NAMESPACE, PML_NAMESPACES, REL } from '#pptx/namespaces.ts';
import {
  isOutlineCandidate,
  outlineBox,
  outlineSvg,
  type OutlineFonts,
} from '#pptx/outline-text.ts';
import {
  backdropFallbackXml,
  boxXml,
  grainXml,
  hotspotXml,
  idAllocator,
  pictureXml,
  vectorGroupXml,
  type IdAllocator,
} from '#pptx/shape-xml.ts';
import { tableXml } from '#pptx/table-xml.ts';
import { paintFill } from '#pptx/theme.ts';
import { CANVAS_WIDTH_PX } from '#units.ts';

/**
 * Matches a URL with a scheme PowerPoint opens: web, mail and phone links.
 */
const EXTERNAL_LINK_PATTERN = /^(?:https?:|mailto:|tel:)/i;

/**
 * Matches a run of whitespace, which a shape name shows as one space.
 */
const WHITESPACE_PATTERN = /\s+/g;

/**
 * Matches the query or fragment that ends a picture's path in its URL.
 */
const QUERY_OR_FRAGMENT_PATTERN = /[?#]/;

/**
 * The PowerPoint action of a link that jumps to a slide.
 */
const SLIDE_JUMP_ACTION = 'ppaction://hlinksldjump';

/**
 * Counts of what a slide holds, for the export report.
 */
export type SlideCounts = {
  /**
   * Native text frames.
   */
  text: number;

  /**
   * Native shapes: boxes, borders and vector shapes.
   */
  shapes: number;

  /**
   * Original images placed as pictures.
   */
  images: number;

  /**
   * Elements rasterised into pictures.
   */
  rasterised: number;

  /**
   * Native tables.
   */
  tables: number;

  /**
   * Native charts.
   */
  charts: number;

  /**
   * Native diagrams.
   */
  diagrams: number;

  /**
   * Embedded videos.
   */
  videos: number;

  /**
   * Click animations.
   */
  animations: number;

  /**
   * Text frames drawn as vector outlines.
   */
  outlined: number;
};

/**
 * A written slide.
 */
export type SlideWriteResult = {
  /**
   * The slide part's XML.
   */
  xml: string;

  /**
   * What it holds.
   */
  counts: SlideCounts;

  /**
   * The placeholders it fills.
   */
  placeholders: PptxPlaceholderKind[];

  /**
   * Links that could not be written.
   */
  droppedLinks: string[];
};

/**
 * What the slide writer needs besides the slide.
 */
export type SlideWriteOptions = {
  /**
   * The export mode.
   */
  mode: ExportMode;

  /**
   * The brand.
   */
  brand: BrandTokens;

  /**
   * The theme of the slide's surface.
   */
  theme: SurfaceTheme;

  /**
   * The slide layout's placeholders, if it maps any.
   */
  placeholders: LayoutSpec | undefined;

  /**
   * The layout contract, for placeholder sources.
   */
  contract: AnyLayoutContract | undefined;

  /**
   * Whether to animate step reveals.
   */
  animate: boolean;

  /**
   * The brand's fonts for outlining display-size text, or `null` to keep text as text.
   */
  outlineFonts: OutlineFonts | null;

  /**
   * The deck slide number, for slide number fields in chrome text.
   */
  slideNumber: number;

  /**
   * The deck's slide count, which the page number shows, and the file's, written instead.
   */
  totals?: { deck: number; file: number };

  /**
   * The art and chrome the slide's layout part draws, when the layout has art. A slide that shows
   * the same leaves the art to the layout; any other slide draws its own art and hides the layout's
   * shapes.
   */
  layoutSource?: LayoutSource | undefined;

  /**
   * The chrome the slide's layout (or master) draws; a slide drawing the same leaves it to the
   * layout.
   */
  chrome?: readonly ChromeShape[];

  /**
   * The slide number placeholder of the slide's layout (or master).
   */
  slideNumberSpec?: SlideNumberSpec | null;

  /**
   * Picks each run's font.
   */
  font?: FontResolver;

  /**
   * The part path of the first exported slide for a deck slide index, or `null` when it was not
   * exported.
   */
  resolveSlide: (deckIndex: number) => string | null;

  /**
   * The complete slide ids in deck order, including slides omitted from this export.
   */
  slideIds: readonly string[];
};

/**
 * Writes one slide: its background, every planned item in paint order (native shapes, text frames
 * and placeholders, pictures, tables, charts, diagrams, videos), link hotspots over pictures, and
 * its step animations; media and chart parts are added to the package.
 *
 * @param pkg - The package.
 * @param path - The slide part's path.
 * @param slide - The slide.
 * @param options - The mode, brand, theme, layout and link resolution.
 */
export function slideXml(
  pkg: OpcPackage,
  path: string,
  slide: PptxSlideInput,
  options: SlideWriteOptions,
): SlideWriteResult {
  const writer = newWriter(pkg, path, slide, options);
  const { shapes, showMaster, filled } = slideShapes(writer);
  const background = backgroundXml(writer);
  const masterShapes = showMaster ? {} : { showMasterSp: 0 };
  const hidden = slide.hidden === true ? { show: 0 } : {};
  const timing = isAnimated(options) ? timingXml(revealSteps(writer.reveals)) : '';
  writer.counts.animations = [...writer.reveals.keys()].length;
  const xml =
    XML_DECLARATION +
    el(
      'p:sld',
      { ...PML_NAMESPACES, 'xmlns:p14': P14_NAMESPACE, ...masterShapes, ...hidden },
      el(
        'p:cSld',
        { name: slide.title },
        background,
        el('p:spTree', {}, SHAPE_TREE_ROOT, ...shapes),
      ),
      el('p:clrMapOvr', {}, el('a:masterClrMapping')),
      timing,
    );
  return {
    xml,
    counts: writer.counts,
    placeholders: filled,
    droppedLinks: writer.droppedLinks,
  };
}

/**
 * Whether the slide gets click animations: they are asked for and the mode has native shapes to
 * animate (image mode draws the slide as one picture).
 *
 * @param options - The slide's write options.
 */
function isAnimated(options: SlideWriteOptions): boolean {
  return options.animate && options.mode !== 'image';
}

/**
 * Takes out the content that a later step replaces, for slides without click animations: without
 * the animation nothing would take it away, so it would stay under its replacement. Items replaced
 * as a whole go, and so do the replaced paragraphs of a text frame (a frame left empty goes too).
 *
 * @param items - The slide's planned items.
 */
function withoutReplaced(items: readonly PlanItem[]): PlanItem[] {
  const kept: PlanItem[] = [];
  for (const item of items) {
    const { node } = item;
    if (node.replacedAt !== null) {
      continue;
    }

    if (item.kind !== 'native' || node.kind !== 'text') {
      kept.push(item);
      continue;
    }

    const paragraphs = node.paragraphs.filter((paragraph) => paragraph.replacedAt === null);
    if (paragraphs.length === node.paragraphs.length) {
      kept.push(item);
    } else if (paragraphs.length > 0) {
      kept.push({ kind: 'native', node: { ...node, paragraphs } });
    }
  }

  return kept;
}

/**
 * Writes the art of a brand layout into its slide layout part: the items the layout's slides would
 * otherwise each draw behind their content, in paint order, with media added to the package once.
 *
 * @param pkg - The package.
 * @param path - The slide layout part's path.
 * @param art - The art and the slide it was measured on.
 * @param options - The mode, brand and theme of the layout's surface.
 * @param nextId - Allocates the layout's shape ids.
 * @returns The shapes' markup.
 */
export function layoutArtXml(
  pkg: OpcPackage,
  path: string,
  art: LayoutArt,
  options: SlideWriteOptions,
  nextId: IdAllocator,
): string {
  const writer: Writer = { ...newWriter(pkg, path, art.slide, options), nextId };
  return art.items.map((item) => itemXml(writer, item, new Map())).join('');
}

/**
 * The state a slide is written with, before any of its shapes is.
 *
 * @param pkg - The package.
 * @param path - The slide part's path.
 * @param slide - The slide.
 * @param options - The mode, brand, theme and layout of the slide.
 */
function newWriter(
  pkg: OpcPackage,
  path: string,
  slide: PptxSlideInput,
  options: SlideWriteOptions,
): Writer {
  const droppedLinks: string[] = [];
  /**
   * Resolves a link and remembers the ones that cannot be written.
   */
  const link = (href: string): LinkTarget | null => {
    const target = resolveLink(pkg, path, href, options);
    if (target === null && !droppedLinks.includes(href)) {
      droppedLinks.push(href);
    }

    return target;
  };
  const counts: SlideCounts = {
    text: 0,
    shapes: 0,
    images: 0,
    rasterised: 0,
    tables: 0,
    charts: 0,
    diagrams: 0,
    videos: 0,
    animations: 0,
    outlined: 0,
  };
  const context: TextContext = {
    theme: options.theme,
    families: { major: options.theme.fonts.major, minor: options.theme.fonts.minor },
    link,
    slideNumber: null,
    ...(options.font === undefined ? {} : { font: options.font }),
  };
  return {
    pkg,
    path,
    slide,
    options,
    nextId: idAllocator(),
    counts,
    context,
    link,
    reveals: new Map(),
    droppedLinks,
  };
}

/**
 * The shapes a slide writes before its background, which the slide writer adds last.
 */
type SlideShapes = {
  /**
   * The shapes' markup, in paint order.
   */
  shapes: string[];

  /**
   * Whether the master's own shapes show behind the slide.
   */
  showMaster: boolean;

  /**
   * The placeholders the shapes fill.
   */
  filled: PptxPlaceholderKind[];
};

/**
 * The shapes of a slide: the whole slide as one picture in image mode, else its normal content.
 *
 * @param writer - The slide's state.
 */
function slideShapes(writer: Writer): SlideShapes {
  if (writer.options.mode === 'image') {
    return { shapes: imageModeShapes(writer), showMaster: false, filled: [] };
  }

  return contentShapes(writer);
}

/**
 * The shapes of a slide in its normal mode: its background grain, its items in paint order, its
 * chrome and the placeholders it fills from its fields.
 *
 * @param writer - The slide's state.
 */
function contentShapes(writer: Writer): SlideShapes {
  const { slide, options } = writer;
  const shapes: string[] = [backgroundGrainXml(writer)];
  const filled: PptxPlaceholderKind[] = [];
  const outlining = options.outlineFonts;
  const planned = groupText(slide.plan.items, (node) =>
    outlining === null ? false : isOutlineCandidate(node.paragraphs),
  );
  const grouped = isAnimated(options) ? planned : withoutReplaced(planned);
  const chrome = chromeShapes(slide, grouped);
  const layoutChrome = options.chrome ?? [];
  // Background layers are the slide's first shapes, so they would cover the chrome its layout
  // draws; a slide that has them draws its own chrome over them instead.
  const source = options.layoutSource;
  const hasLayoutArt = source !== undefined;
  const shown = source !== undefined && showsLayoutArt(slide, source);
  /**
   * Whether the item is art the slide's layout part draws for it.
   */
  const inLayout = (item: PlanItem): boolean => shown && isLayoutArtNode(item.node);
  const backdrop = slide.plan.items.some((item) => item.node.backdrop === true && !inLayout(item));
  const hidesLayout = hasLayoutArt && !shown;
  const inherits = !backdrop && !hidesLayout && sameChrome(chrome, layoutChrome);
  const showMaster =
    !hidesLayout && (inherits || (!backdrop && chrome.length === 0 && layoutChrome.length === 0));
  const chromeNodes = new Set<SceneNode>(chrome.map((shape) => shape.node));
  const items = grouped.filter((item) => !chromeNodes.has(item.node) && !inLayout(item));
  const assigned = assignPlaceholders(items, options);
  for (const item of items) {
    shapes.push(itemXml(writer, item, assigned));
  }

  shapes.push(slideChromeXml(writer, chrome, inherits));

  for (const [kind, text] of fieldPlaceholders(slide, options, assigned)) {
    shapes.push(offSlidePlaceholderXml(text.text, writer.nextId(), text.ref, CANVAS_WIDTH_PX));
    filled.push(kind);
  }

  filled.push(...[...assigned.values()].map((entry) => entry.kind));
  return { shapes, showMaster, filled };
}

/**
 * The state one slide is written with.
 */
type Writer = {
  /**
   * The package.
   */
  pkg: OpcPackage;

  /**
   * The slide part's path.
   */
  path: string;

  /**
   * The slide.
   */
  slide: PptxSlideInput;

  /**
   * The options.
   */
  options: SlideWriteOptions;

  /**
   * Allocates shape ids.
   */
  nextId: IdAllocator;

  /**
   * Counts of what was written.
   */
  counts: SlideCounts;

  /**
   * The text context.
   */
  context: TextContext;

  /**
   * Resolves links.
   */
  link: (href: string) => LinkTarget | null;

  /**
   * What appears at each step, for animations.
   */
  reveals: Map<number, RevealTarget[]>;

  /**
   * The links that could not be written, each once, in the order they were met.
   */
  droppedLinks: string[];
};

/**
 * A frame or picture assigned to a placeholder.
 */
type AssignedPlaceholder = {
  /**
   * The placeholder kind.
   */
  kind: PptxPlaceholderKind;

  /**
   * The placeholder reference.
   */
  ref: PlaceholderRef;
};

/**
 * Which text frames and pictures fill which placeholders: for each placeholder of the layout that
 * reads the page, the first frame holding its slot or selector, or for a picture placeholder the
 * first image in its slot.
 *
 * @param items - The grouped items.
 * @param options - The layout.
 */
function assignPlaceholders(
  items: readonly PlanItem[],
  options: SlideWriteOptions,
): Map<SceneNode, AssignedPlaceholder> {
  const assigned = new Map<SceneNode, AssignedPlaceholder>();
  const mapping = options.contract?.pptx;
  if (mapping === undefined || options.placeholders === undefined) {
    return assigned;
  }

  for (const placeholder of mapping.placeholders) {
    const spec = options.placeholders.placeholders.find(
      (candidate) => candidate.kind === placeholder.kind,
    );
    if (spec === undefined || 'field' in placeholder.from) {
      continue;
    }

    const source = placeholder.from;
    const frame = items.find(
      (item) =>
        item.kind === 'native' &&
        !assigned.has(item.node) &&
        fillsPlaceholder(item.node, placeholder.kind, source),
    );
    if (frame !== undefined) {
      assigned.set(frame.node, { kind: placeholder.kind, ref: spec.ref });
    }
  }

  return assigned;
}

/**
 * Whether a node fills a placeholder: a text frame holding the source's text, or for a picture
 * placeholder an image in the source's slot.
 *
 * @param node - The node.
 * @param kind - The placeholder kind.
 * @param source - Where the placeholder's content is on the page.
 */
function fillsPlaceholder(
  node: SceneNode,
  kind: PptxPlaceholderKind,
  source: { slot: string } | { selector: string },
): boolean {
  if (kind === 'picture') {
    return node.kind === 'image' && 'slot' in source && node.slot === source.slot;
  }

  return node.kind === 'text' && matchesSource(node, source);
}

/**
 * Placeholders that read a frontmatter field, with the slide's text for them.
 *
 * @param slide - The slide.
 * @param options - The layout.
 * @param assigned - The placeholders already filled from the page.
 */
function fieldPlaceholders(
  slide: PptxSlideInput,
  options: SlideWriteOptions,
  assigned: ReadonlyMap<SceneNode, AssignedPlaceholder>,
): [PptxPlaceholderKind, { text: string; ref: PlaceholderRef }][] {
  const mapping = options.contract?.pptx;
  if (mapping === undefined || options.placeholders === undefined) {
    return [];
  }

  const filledKinds = new Set([...assigned.values()].map((entry) => entry.kind));
  return mapping.placeholders.flatMap(
    (placeholder): [PptxPlaceholderKind, { text: string; ref: PlaceholderRef }][] => {
      const spec = options.placeholders?.placeholders.find(
        (candidate) => candidate.kind === placeholder.kind,
      );
      const text =
        'field' in placeholder.from ? slide.scene.fieldText[placeholder.from.field] : undefined;
      const hasText = text !== undefined && text !== '';
      if (spec === undefined || !hasText || filledKinds.has(placeholder.kind)) {
        return [];
      }

      return [[placeholder.kind, { text, ref: spec.ref }]];
    },
  );
}

/**
 * The markup of one planned item.
 *
 * @param writer - The slide's state.
 * @param item - The item.
 * @param assigned - The frames that fill placeholders.
 */
function itemXml(
  writer: Writer,
  item: PlanItem,
  assigned: ReadonlyMap<SceneNode, AssignedPlaceholder>,
): string {
  if (item.kind === 'picture') {
    return rasterXml(writer, item.node, item.scope, { name: item.name, alt: item.alt });
  }

  const { node } = item;
  switch (node.kind) {
    case 'box': {
      return boxItemXml(writer, node);
    }

    case 'text': {
      return textXml(writer, node, assigned.get(node) ?? null);
    }

    case 'image': {
      return imageXml(writer, node, assigned.get(node) ?? null);
    }

    case 'svg': {
      return svgItemXml(writer, node);
    }

    case 'table': {
      writer.counts.tables += 1;
      const id = writer.nextId();
      recordReveal(writer, node, id, false);
      return tableXml(node, id, writer.context);
    }

    case 'chart': {
      return chartItemXml(writer, node);
    }

    case 'diagram': {
      writer.counts.diagrams += 1;
      const { xml, ids } = tracked(writer, (allocate) =>
        diagramXml({
          diagram: node.diagram,
          nodeId: node.id,
          scene: writer.slide.scene,
          nextId: allocate,
          context: writer.context,
        }),
      );
      ids.forEach((id) => recordReveal(writer, node, id, false));
      return xml;
    }

    case 'media': {
      return mediaXml(writer, node);
    }
  }
}

/**
 * A painted box, with the grain tile when the grain alone paints it, recorded for its step.
 *
 * @param writer - The slide's state.
 * @param node - The box.
 */
function boxItemXml(writer: Writer, node: BoxNode): string {
  writer.counts.shapes += 1;
  const grain = hasGrainOnly(node) ? grainFill(writer) : null;
  const { xml, ids } = tracked(writer, (allocate) =>
    boxXml(node, allocate, writer.options.theme, grain),
  );
  ids.forEach((id) => recordReveal(writer, node, id, false));
  return xml;
}

/**
 * An inline SVG as a group of vector shapes, linked when the SVG is inside a link.
 *
 * @param writer - The slide's state.
 * @param node - The SVG.
 */
function svgItemXml(writer: Writer, node: SvgNode): string {
  writer.counts.shapes += node.shapes?.length ?? 0;
  const link = node.href === null ? null : writer.link(node.href);
  const { xml, ids } = tracked(writer, (allocate) =>
    vectorGroupXml(
      node.shapes ?? [],
      node.rect,
      node.href === null ? 'Drawing' : 'Drawing (link)',
      allocate,
      writer.options.theme,
      link,
    ),
  );
  ids.forEach((id) => recordReveal(writer, node, id, false));
  return xml;
}

/**
 * A native chart, with its plot's picture as the fallback in hybrid mode.
 *
 * @param writer - The slide's state.
 * @param node - The chart.
 */
function chartItemXml(writer: Writer, node: ChartNode): string {
  const written = writeChart(
    {
      pkg: writer.pkg,
      path: writer.path,
      scene: writer.slide.scene,
      theme: writer.options.theme,
      mode: writer.options.mode,
      nextId: writer.nextId,
      fallback:
        writer.options.mode === 'hybrid'
          ? (plotId, id, name, alt) => plotPictureXml(writer, plotId, id, name, alt)
          : null,
    },
    node,
  );
  if (written.shapeId !== null) {
    writer.counts.charts += 1;
    recordReveal(writer, node, written.shapeId, false);
  }

  return written.xml;
}

/**
 * A text frame, or the placeholder it fills; chrome text gets a slide number field.
 *
 * @param writer - The slide's state.
 * @param node - The frame.
 * @param placeholder - The placeholder it fills, if any.
 */
function textXml(writer: Writer, node: TextNode, placeholder: AssignedPlaceholder | null): string {
  const fonts = writer.options.outlineFonts;
  if (fonts !== null && isOutlineCandidate(node.paragraphs)) {
    const outlined = outlinedTextXml(writer, node, placeholder, fonts);
    if (outlined !== null) {
      return outlined;
    }
  }

  writer.counts.text += 1;
  const id = writer.nextId();
  const spec =
    placeholder === null
      ? undefined
      : writer.options.placeholders?.placeholders.find((entry) => entry.kind === placeholder.kind);
  const context: TextContext =
    placeholder === null ? writer.context : { ...writer.context, defaults: spec?.defaults ?? null };
  recordTextReveals(writer, node, id);

  const name = frameName(node, placeholder);
  return textFrameXml(node.paragraphs, id, name, context, placeholder?.ref ?? null, {
    layoutRect: spec?.rect ?? null,
  });
}

/**
 * Records when a text frame appears and when it is replaced: as a whole shape when all its
 * paragraphs share a step, else paragraph by paragraph.
 *
 * @param writer - The slide's state.
 * @param node - The frame.
 * @param shapeId - The frame's shape id.
 */
function recordTextReveals(writer: Writer, node: TextNode, shapeId: number): void {
  const steps = node.paragraphs.map((paragraph) => paragraph.step);
  const replaced = node.paragraphs.map((paragraph) => paragraph.replacedAt);
  const uniformStep = steps.every((step) => step === steps[0]);
  const uniformReplaced = replaced.every((step) => step === replaced[0]);
  const whole = {
    step: uniformStep ? (steps[0] ?? node.step) : null,
    replacedAt: uniformReplaced ? (replaced[0] ?? node.replacedAt) : null,
  };
  recordReveal(writer, whole, shapeId, true);
  node.paragraphs.forEach((paragraph, index) => {
    const paragraphs = { start: index, end: index };
    if (!uniformStep && paragraph.step !== null && paragraph.step > 0) {
      addReveal(writer, paragraph.step, { shapeId, paragraphs, hasText: true, effect: 'in' });
    }

    if (!uniformReplaced && paragraph.replacedAt !== null && paragraph.replacedAt > 0) {
      addReveal(writer, paragraph.replacedAt, {
        shapeId,
        paragraphs,
        hasText: true,
        effect: 'out',
      });
    }
  });
}

/**
 * The name the selection pane shows for a text frame.
 *
 * @param node - The frame.
 * @param placeholder - The placeholder it fills, if any.
 */
function frameName(node: TextNode, placeholder: AssignedPlaceholder | null): string {
  if (placeholder !== null) {
    return { title: 'Title', subtitle: 'Subtitle', body: 'Body', picture: 'Picture' }[
      placeholder.kind
    ];
  }

  return `Text: ${excerpt(textOf(node))}`;
}

/**
 * The most characters of text a shape name quotes.
 */
const NAME_EXCERPT_LENGTH = 40;

/**
 * The start of a text, for a shape name.
 *
 * @param text - The text.
 */
function excerpt(text: string): string {
  const trimmed = text.replace(WHITESPACE_PATTERN, ' ').trim();
  return trimmed.length <= NAME_EXCERPT_LENGTH
    ? trimmed
    : `${trimmed.slice(0, NAME_EXCERPT_LENGTH - 1).trimEnd()}…`;
}

/**
 * The text of a frame, paragraphs joined by spaces.
 *
 * @param node - The frame.
 */
function textOf(node: TextNode): string {
  return node.paragraphs
    .map((paragraph) =>
      paragraph.lines.map((line) => line.runs.map((run) => run.text).join('')).join(' '),
    )
    .join(' ');
}

/**
 * A text frame drawn as its glyphs: an SVG picture of the outlines in the brand font at its exact
 * axes, with the browser's own rendering as the PNG fallback, so it looks the same without the font
 * (`--outline-text`, for view-only hand-offs). A frame that fills a placeholder keeps its text in
 * that placeholder just above the slide, so outline view and screen readers still read it.
 *
 * @param writer - The slide's state.
 * @param node - The frame.
 * @param placeholder - The placeholder it fills, if any.
 * @param fonts - The brand's fonts.
 * @returns The shapes, or `null` when a font or the fallback picture is missing.
 */
function outlinedTextXml(
  writer: Writer,
  node: TextNode,
  placeholder: AssignedPlaceholder | null,
  fonts: OutlineFonts,
): string | null {
  const fallback = writer.slide.assets.pictures.get(node.id);
  const box = outlineBox(node.rect, node.paragraphs, writer.slide.scene.canvas);
  const svg = fallback === undefined ? null : outlineSvg(node.paragraphs, fonts, box);
  if (fallback === undefined || svg === null) {
    return null;
  }

  writer.counts.outlined += 1;
  const id = writer.nextId();
  recordReveal(writer, node, id, false);
  const text = textOf(node);
  const xml = pictureXml(box, id, {
    imageId: embedMedia(writer.pkg, writer.path, fallback),
    svgId: embedMedia(writer.pkg, writer.path, {
      data: new TextEncoder().encode(svg),
      extension: 'svg',
    }),
    name: `Outlined text: ${excerpt(text)}`,
    descr: text,
  });
  if (placeholder === null) {
    return xml;
  }

  return xml + offSlidePlaceholderXml(text, writer.nextId(), placeholder.ref, CANVAS_WIDTH_PX);
}

/**
 * An original image: its file embedded once per package, with its crop, radii and grayscale; SVG
 * files get a PNG fallback captured from the page.
 *
 * @param writer - The slide's state.
 * @param node - The image.
 * @param placeholder - The picture placeholder it fills, if any.
 */
function imageXml(
  writer: Writer,
  node: ImageNode,
  placeholder: AssignedPlaceholder | null,
): string {
  const file = writer.slide.assets.images.get(node.src);
  const fallback = writer.slide.assets.pictures.get(node.id);
  const id = writer.nextId();
  const link = node.href === null ? null : writer.link(node.href);
  recordReveal(writer, node, id, false);
  if (file === undefined && fallback === undefined) {
    return '';
  }

  writer.counts.images += 1;
  const isSvg = file?.extension === 'svg';
  const imageId =
    isSvg || file === undefined
      ? embedMedia(writer.pkg, writer.path, fallback ?? new Uint8Array())
      : embedMedia(writer.pkg, writer.path, file);
  const svgId = isSvg && file !== undefined ? embedMedia(writer.pkg, writer.path, file) : undefined;
  return pictureXml(node.rect, id, {
    imageId,
    ...(svgId === undefined ? {} : { svgId }),
    name: node.alt === '' ? 'Picture' : `Picture: ${excerpt(node.alt)}`,
    descr: node.alt === '' ? pictureFallbackAlt(node.src) : node.alt,
    crop: node.crop,
    radii: node.radii,
    opacity: node.opacity,
    locked: node.backdrop === true,
    grayscale: node.grayscale,
    link,
    ...(placeholder === null
      ? {}
      : { nvPr: el('p:ph', { type: placeholder.ref.type, idx: placeholder.ref.idx }) }),
  });
}

/**
 * A rasterised element: its picture at 2x, with link hotspots over the links it contains.
 *
 * @param writer - The slide's state.
 * @param node - The node.
 * @param scope - Whether the picture holds the subtree or only the node's paint.
 * @param label - The picture's name and alt text, when the plan gives them (a chart's plot).
 * @param label.name - The name.
 * @param label.alt - The alt text.
 */
function rasterXml(
  writer: Writer,
  node: SceneNode,
  scope: 'subtree' | 'paint',
  label: { name?: string | undefined; alt?: string | undefined } = {},
): string {
  const picture = writer.slide.assets.pictures.get(node.id);
  if (picture === undefined) {
    return '';
  }

  writer.counts.rasterised += 1;
  const id = writer.nextId();
  recordReveal(writer, node, id, false);
  const svg = node.kind === 'svg' ? new TextEncoder().encode(node.markup) : null;
  const svgId =
    svg === null ? undefined : embedMedia(writer.pkg, writer.path, { data: svg, extension: 'svg' });
  const text = rasterText(writer, node);
  const xml = pictureXml(node.rect, id, {
    imageId: embedMedia(writer.pkg, writer.path, picture),
    ...(svgId === undefined ? {} : { svgId }),
    name: label.name ?? rasterName(scope, text),
    descr: label.alt ?? (scope === 'paint' ? 'Background texture' : text),
  });
  const hotspots = scope === 'subtree' ? linkHotspots(writer, node.rect) : '';
  return xml + hotspots;
}

/**
 * The picture of a native chart's plot as the web drew it, for the chart's alternate content.
 *
 * @param writer - The slide's state.
 * @param plotId - The plot's scene node id.
 * @param id - The shape id, the chart's own.
 * @param name - The chart's name.
 * @param alt - The chart's alt text.
 * @returns The picture, or `''` when none was captured.
 */
function plotPictureXml(
  writer: Writer,
  plotId: number,
  id: number,
  name: string,
  alt: string,
): string {
  const picture = writer.slide.assets.pictures.get(plotId);
  const plot = writer.slide.scene.nodes.find((candidate) => candidate.id === plotId);
  if (picture === undefined || plot === undefined) {
    return '';
  }

  return pictureXml(plot.rect, id, {
    imageId: embedMedia(writer.pkg, writer.path, picture),
    name,
    descr: alt,
  });
}

/**
 * Invisible link shapes over the links inside a rectangle.
 *
 * @param writer - The slide's state.
 * @param rect - The rectangle, or `null` for the whole slide.
 */
function linkHotspots(writer: Writer, rect: SceneRect | null): string {
  return writer.slide.scene.links
    .filter((link) => rect === null || contains(rect, link.rect))
    .map((sceneLink) => {
      const target = writer.link(sceneLink.href);
      return target === null ? '' : hotspotXml(sceneLink.rect, writer.nextId(), target);
    })
    .join('');
}

/**
 * A video embedded over its poster, or a link hotspot to the video or app when it cannot be
 * embedded; the poster itself is the image the page showed.
 *
 * @param writer - The slide's state.
 * @param node - The media node.
 */
function mediaXml(writer: Writer, node: MediaNode): string {
  const video = writer.slide.assets.media.get(node.id);
  const poster = node.poster === null ? undefined : writer.slide.assets.images.get(node.poster);
  if (video === undefined || poster === undefined || node.poster === null) {
    const target = node.href === null ? null : writer.link(node.href);
    return target === null ? '' : hotspotXml(node.rect, writer.nextId(), target);
  }

  writer.counts.videos += 1;
  const mediaPath = mediaPart(writer.pkg, video);
  const videoId = writer.pkg.relate(writer.path, REL.video, mediaPath);
  const mediaId = writer.pkg.relate(writer.path, REL.media, mediaPath);
  const nvPr =
    el('a:videoFile', { 'r:link': videoId }) +
    el(
      'p:extLst',
      {},
      el(
        'p:ext',
        { uri: MEDIA_EXTENSION },
        el('p14:media', { 'xmlns:p14': P14_NAMESPACE, 'r:embed': mediaId }),
      ),
    );
  return pictureXml(node.rect, writer.nextId(), {
    imageId: embedMedia(writer.pkg, writer.path, poster),
    name: 'Video',
    descr: 'Video (shows its poster until played)',
    nvPr,
    radii: node.radii ?? [0, 0, 0, 0],
  });
}

/**
 * The whole slide as one picture with link hotspots and its title off the slide.
 *
 * @param writer - The slide's state.
 */
function imageModeShapes(writer: Writer): string[] {
  const picture = writer.slide.assets.slidePicture;
  if (picture === null) {
    return [];
  }

  writer.counts.rasterised += 1;
  const rect = {
    x: 0,
    y: 0,
    width: writer.slide.scene.canvas.width,
    height: writer.slide.scene.canvas.height,
  };
  const shape = pictureXml(rect, writer.nextId(), {
    imageId: embedMedia(writer.pkg, writer.path, picture),
    name: 'Slide',
    descr: writer.slide.title,
  });
  return [shape, linkHotspots(writer, null)];
}

/**
 * The slide's own background, when it differs from its master's.
 *
 * @param writer - The slide's state.
 */
function backgroundXml(writer: Writer): string {
  const background = writer.slide.plan.background;
  if (writer.options.mode === 'image' || background.kind === 'master') {
    return '';
  }

  if (background.kind === 'paint') {
    return el(
      'p:bg',
      {},
      el('p:bgPr', {}, paintFill(background.paint, writer.options.theme), el('a:effectLst')),
    );
  }

  const picture = writer.slide.assets.pictures.get(background.node.id);
  if (picture === undefined) {
    return '';
  }

  const id = embedMedia(writer.pkg, writer.path, picture);
  return el(
    'p:bg',
    {},
    el(
      'p:bgPr',
      {},
      el(
        'a:blipFill',
        { dpi: 0, rotWithShape: 1 },
        el('a:blip', { 'r:embed': id }),
        el('a:srcRect'),
        el('a:stretch', {}, el('a:fillRect')),
      ),
      el('a:effectLst'),
    ),
  );
}

/**
 * The grain tile of the slide as a fill, embedded once, or `null` when the slide has none.
 *
 * @param writer - The slide's state.
 */
function grainFill(writer: Writer): { imageId: string; size: number } | null {
  const grain = writer.slide.assets.grain;
  return grain === null
    ? null
    : { imageId: embedMedia(writer.pkg, writer.path, grain.data), size: grain.size };
}

/**
 * What the slide draws over its own background: the picture fallback of a gradient background, and
 * the grain when its background is a grained gradient its master does not draw.
 *
 * @param writer - The slide's state.
 */
function backgroundGrainXml(writer: Writer): string {
  const background = writer.slide.plan.background;
  const { canvas } = writer.slide.scene;
  const picture = writer.slide.assets.background;
  const fallback =
    background.kind === 'paint' && background.paint.kind !== 'solid' && picture !== null
      ? backdropFallbackXml(
          { x: 0, y: 0, width: canvas.width, height: canvas.height },
          writer.nextId(),
          embedMedia(writer.pkg, writer.path, picture),
        )
      : '';
  const grain = grainFill(writer);
  if (background.kind !== 'paint' || !background.grain || grain === null) {
    return fallback;
  }

  return (
    fallback +
    grainXml(
      { x: 0, y: 0, width: canvas.width, height: canvas.height },
      writer.nextId(),
      grain.imageId,
      grain.size,
    )
  );
}

/**
 * The slide's chrome: nothing when the layout draws the same (but the slide number, which is a
 * placeholder each slide holds), else the slide's own logo and footer and its slide number.
 *
 * @param writer - The slide's state.
 * @param chrome - The chrome the slide draws.
 * @param inherits - Whether the layout draws the same chrome.
 */
function slideChromeXml(writer: Writer, chrome: readonly ChromeShape[], inherits: boolean): string {
  const context = {
    ...writer.context,
    slideNumber: writer.options.slideNumber,
    totals: writer.options.totals ?? null,
  };
  const own = inherits
    ? ''
    : chromeXml(
        writer.pkg,
        writer.path,
        chrome,
        writer.nextId,
        writer.context,
        writer.options.brand.label,
      );
  const page = chrome.find((shape) => shape.kind === 'page');
  if (page === undefined) {
    return own;
  }

  const spec = inherits ? (writer.options.slideNumberSpec ?? null) : null;
  return own + slideNumberXml(page, spec, writer.nextId(), context);
}

/**
 * The name of a rasterised element's picture: a background, or a picture named after its text.
 *
 * @param scope - Whether the picture holds the subtree or only the node's paint.
 * @param text - The text the picture shows.
 */
function rasterName(scope: 'subtree' | 'paint', text: string): string {
  if (scope === 'paint') {
    return 'Background';
  }

  return text === '' ? 'Picture' : `Picture: ${excerpt(text)}`;
}

/**
 * Alt text for a picture whose page gave none: its file name.
 *
 * @param src - The picture's URL.
 */
function pictureFallbackAlt(src: string): string {
  const name = src.split(QUERY_OR_FRAGMENT_PATTERN)[0]?.split('/').at(-1) ?? '';
  return name === '' ? 'Picture' : `Picture (${decodeURIComponent(name)})`;
}

/**
 * The text a rasterised element shows, for its picture's alt text and name.
 *
 * @param writer - The slide's state.
 * @param node - The rasterised node.
 */
function rasterText(writer: Writer, node: SceneNode): string {
  const parentOf = parentLookup(writer.slide.scene);
  /**
   * Whether a node is the rasterised node or inside it.
   */
  const inside = (candidate: SceneNode): boolean => {
    for (let parent: number | null = candidate.id; parent !== null; parent = parentOf(parent)) {
      if (parent === node.id || parent === Math.floor(node.id)) {
        return true;
      }
    }

    return false;
  };
  return writer.slide.scene.nodes
    .flatMap((candidate) =>
      candidate.kind === 'text' && inside(candidate) ? [textOf(candidate)] : [],
    )
    .join(' ')
    .trim();
}

/**
 * Resolves a link: another slide becomes a slide jump, a web, mail or phone URL an external link,
 * and anything else is dropped.
 *
 * @param pkg - The package.
 * @param path - The slide part's path.
 * @param href - The link.
 * @param options - Slide resolution.
 */
function resolveLink(
  pkg: OpcPackage,
  path: string,
  href: string,
  options: SlideWriteOptions,
): LinkTarget | null {
  const slide = parseHash(href, options.slideIds);
  if (slide !== undefined) {
    const target = options.resolveSlide(slide.slide);
    return target === null
      ? null
      : { id: pkg.relate(path, REL.slide, target), action: SLIDE_JUMP_ACTION };
  }

  if (EXTERNAL_LINK_PATTERN.test(href)) {
    return { id: pkg.relate(path, REL.hyperlink, href, true) };
  }

  return null;
}

/**
 * Runs a writer with an id allocator that remembers the ids it hands out.
 *
 * @param writer - The slide's state.
 * @param write - Writes shapes with the allocator.
 */
function tracked(
  writer: Writer,
  write: (allocate: IdAllocator) => string,
): { xml: string; ids: number[] } {
  const ids: number[] = [];
  /**
   * Allocates an id and records it.
   */
  const allocate: IdAllocator = () => {
    const id = writer.nextId();
    ids.push(id);
    return id;
  };
  return { xml: write(allocate), ids };
}

/**
 * Records that a shape appears at the node's step and disappears at the step that replaces it.
 *
 * @param writer - The slide's state.
 * @param node - The node.
 * @param shapeId - The shape's id.
 * @param hasText - Whether the shape has a text body.
 */
function recordReveal(
  writer: Writer,
  node: Pick<SceneNode, 'step' | 'replacedAt'>,
  shapeId: number,
  hasText: boolean,
): void {
  if (node.step !== null && node.step > 0) {
    addReveal(writer, node.step, { shapeId, paragraphs: null, hasText, effect: 'in' });
  }

  if (node.replacedAt !== null && node.replacedAt > 0) {
    addReveal(writer, node.replacedAt, { shapeId, paragraphs: null, hasText, effect: 'out' });
  }
}

/**
 * Adds a reveal to a step.
 *
 * @param writer - The slide's state.
 * @param step - The step.
 * @param target - What appears or disappears.
 */
function addReveal(writer: Writer, step: number, target: RevealTarget): void {
  const list = writer.reveals.get(step) ?? [];
  list.push(target);
  writer.reveals.set(step, list);
}

/**
 * The reveals in step order.
 *
 * @param reveals - Reveals by step.
 */
function revealSteps(reveals: ReadonlyMap<number, RevealTarget[]>): RevealTarget[][] {
  return [...reveals.entries()].sort((a, b) => a[0] - b[0]).map(([, targets]) => targets);
}

/**
 * Whether a rectangle contains another's center.
 *
 * @param outer - The outer rectangle.
 * @param inner - The inner one.
 */
function contains(outer: SceneRect, inner: SceneRect): boolean {
  const x = inner.x + inner.width / 2;
  const y = inner.y + inner.height / 2;
  return x >= outer.x && x <= outer.x + outer.width && y >= outer.y && y <= outer.y + outer.height;
}
