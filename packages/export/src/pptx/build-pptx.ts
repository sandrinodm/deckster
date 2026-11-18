import type { PptxPlaceholderKind } from '@deckster/engine/layout';

import { deckCommand } from '@deckster/engine/command';
import { Effect } from 'effect';

import type { OpcPackage } from '#ooxml/opc-package.ts';
import type { PptxDeckInput, PptxSlideInput } from '#pptx/deck-input.ts';
import type { LayoutSource } from '#pptx/layout-art.ts';
import type { LayoutSpec, MasterSpec } from '#pptx/layout-specs.ts';
import type { IdAllocator } from '#pptx/shape-xml.ts';
import type { TextContext } from '#pptx/text-xml.ts';
import type { SurfaceTheme } from '#pptx/theme.ts';

import { exportError, type ExportError } from '#export-error.ts';
import { createPackage } from '#ooxml/opc-package.ts';
import { el, escapeXml, XML_DECLARATION } from '#ooxml/xml.ts';
import { chromeXml, slideNumberPlaceholderXml } from '#pptx/chrome-xml.ts';
import { FALLBACK_LAYOUT, layoutName, masterSpecs } from '#pptx/layout-specs.ts';
import {
  layoutXml,
  masterBackground,
  masterXml,
  notesMasterXml,
  notesSlideXml,
} from '#pptx/master-xml.ts';
import { embedMedia } from '#pptx/media.ts';
import { CONTENT_TYPE, PML_NAMESPACES, REL } from '#pptx/namespaces.ts';
import { backdropFallbackXml, grainXml } from '#pptx/shape-xml.ts';
import { layoutArtXml, slideXml, type SlideWriteResult } from '#pptx/slide-xml.ts';
import { surfaceThemes, themeXml } from '#pptx/theme.ts';
import { CANVAS_HEIGHT_PX, CANVAS_WIDTH_PX, EMU_PER_INCH, SLIDE_SIZE_EMU } from '#units.ts';

/**
 * The first id of slide masters and layouts: PresentationML requires them at or above 2^31.
 */
const FIRST_MASTER_ID = 2_147_483_648;

/**
 * The first slide id PresentationML allows.
 */
const FIRST_SLIDE_ID = 256;

/**
 * The first shape id of the shapes a master adds after its two placeholders.
 */
const MASTER_SHAPE_IDS = 3;

/**
 * The first shape id of a layout's own chrome, clear of its placeholders' ids.
 */
const LAYOUT_SHAPE_IDS = 99;

/**
 * The content type of an embedded font's `.fntdata` part.
 */
const FONT_DATA_CONTENT_TYPE = 'application/x-fontdata';

/**
 * The default tab stop of the presentation's text styles, in EMU: one inch.
 */
const DEFAULT_TAB_SIZE_EMU = EMU_PER_INCH;

/**
 * How many outline levels the presentation's default text style sets.
 */
const TEXT_STYLE_LEVEL_COUNT = 9;

/**
 * The restored size of the outline view's left edge, as PowerPoint saves it.
 */
const VIEW_RESTORED_LEFT = 15_620;

/**
 * The restored size of the outline view's top edge, as PowerPoint saves it.
 */
const VIEW_RESTORED_TOP = 94_660;

/**
 * The grid spacing of the slide view in EMU, as PowerPoint saves it.
 */
const VIEW_GRID_SPACING_EMU = 76_200;

/**
 * The fractional seconds of an ISO timestamp, which the document properties leave out.
 */
const FRACTIONAL_SECONDS = /\.\d{3}Z$/;

/**
 * The `Application` the document properties name, which the brand importer reads to recognise a
 * deckster export.
 */
export const APPLICATION_NAME = 'deckster';

/**
 * Notes page size in EMU: portrait letter, as PowerPoint writes it.
 */
const NOTES_SIZE_EMU = {
  /**
   * The width.
   */
  cx: 6_858_000,

  /**
   * The height.
   */
  cy: 9_144_000,
} as const;

/**
 * What the writer did with one slide, for the export report.
 */
export type PptxSlideReport = {
  /**
   * The exported slide's 1-based number.
   */
  number: number;

  /**
   * The deck slide's 1-based number.
   */
  slide: number;

  /**
   * The step, or `null` for the finished slide.
   */
  step: number | null;

  /**
   * The slide layout used.
   */
  layout: string;

  /**
   * Counts of what was written.
   */
  counts: SlideWriteResult['counts'];

  /**
   * Placeholders filled, by kind.
   */
  placeholders: PptxPlaceholderKind[];

  /**
   * Links that could not be written, such as relative URLs.
   */
  droppedLinks: string[];
};

/**
 * The written presentation and what it holds.
 */
export type PptxResult = {
  /**
   * The `.pptx` bytes.
   */
  bytes: Uint8Array;

  /**
   * One report per exported slide.
   */
  slides: PptxSlideReport[];

  /**
   * The slide masters written, by surface name.
   */
  masters: string[];

  /**
   * The slide layouts written, by deck layout name (each once, whichever masters have it).
   */
  layouts: string[];

  /**
   * The typefaces of the embedded fonts.
   */
  embeddedFonts: string[];
};

/**
 * Writes a PowerPoint presentation from measured slides: a theme and slide master per brand surface
 * the slides use (theme colors from the surface roles and data palette, theme fonts from the brand
 * families or their embedded instances, the surface background with its grain, the brand's page
 * chrome with a slide number placeholder), the slide layouts the slides use plus a basic set under
 * each master with the placeholders their contracts map, placed and styled as the deck sets them,
 * then every slide with native shapes, text, pictures, tables, charts and diagrams as planned, its
 * notes, links and step animations. Media is stored once per content; fonts are embedded when
 * given.
 *
 * @param input - The deck, brand, layouts, slides and captured files.
 * @returns The presentation and a report per slide.
 * @throws ExportError in the error channel when the brand has no surface.
 */
export const buildPptx = Effect.fn('buildPptx')(function* (
  input: PptxDeckInput,
): Effect.fn.Return<PptxResult, ExportError> {
  const themes = surfaceThemes(input.brand);
  if (themes.length === 0) {
    return yield* exportError(
      'write the PPTX',
      `brand ${input.brand.name} has no surfaces`,
      'Check the brand with `' + deckCommand() + ' brand check <name>`.',
    );
  }

  const pkg = createPackage();
  const specs = masterSpecs(input, {
    themes,
    font: input.fonts?.resolve,
  });
  const ids = { next: FIRST_MASTER_ID, layouts: 0 };
  const masters = specs.map((spec, index) => writeMaster(pkg, input, spec, index + 1, ids));
  const notesMaster = writeNotesMaster(pkg, input, specs[0]?.theme ?? themes[0], specs.length + 1);
  const slidePaths = input.slides.map((_, index) => `ppt/slides/slide${index + 1}.xml`);
  const reports = writeSlideReports(pkg, input, masters, notesMaster, slidePaths);
  const embeddedFonts = writeFonts(pkg, input);
  writePresentation(pkg, input, masters, notesMaster, slidePaths, embeddedFonts);
  writeDocumentProperties(pkg, input);
  return {
    bytes: pkg.toZip(),
    slides: reports,
    masters: masters.map((master) => master.spec.surface),
    layouts: [
      ...new Set(masters.flatMap((master) => master.layouts.map((entry) => entry.spec.name))),
    ],
    embeddedFonts: embeddedFonts.map((font) => font.typeface),
  };
});

/**
 * Writes every exported slide on the master and layout its surface and layout name pick, falling
 * back to the first master and its first layout. Links to a deck slide go to its first export.
 *
 * @param pkg - The package.
 * @param input - The deck.
 * @param masters - The written masters.
 * @param notesMaster - The notes master's path.
 * @param slidePaths - Every slide's part path, in export order.
 */
function writeSlideReports(
  pkg: OpcPackage,
  input: PptxDeckInput,
  masters: readonly WrittenMaster[],
  notesMaster: string,
  slidePaths: readonly string[],
): PptxSlideReport[] {
  const firstExported = new Map<number, number>();
  input.slides.forEach((slide, index) => {
    if (!firstExported.has(slide.slideIndex)) {
      firstExported.set(slide.slideIndex, index);
    }
  });
  return input.slides.map((slide, index) => {
    const master =
      masters.find((candidate) => candidate.spec.surface === slide.scene.surface) ?? masters[0];
    const name = layoutName(input.layouts, slide.scene.layout);
    const layout =
      master?.layouts.find((candidate) => candidate.spec.name === name) ?? master?.layouts[0];
    return writeSlide(pkg, input, slide, index, {
      master,
      layout,
      slidePaths,
      firstExported,
      notesMasterPath: notesMaster,
    });
  });
}

/**
 * A written slide layout.
 */
type WrittenLayout = {
  /**
   * The layout's spec.
   */
  spec: LayoutSpec;

  /**
   * Its part's path.
   */
  path: string;
};

/**
 * A written slide master and its layouts.
 */
type WrittenMaster = {
  /**
   * The master's spec.
   */
  spec: MasterSpec;

  /**
   * The master part's path.
   */
  path: string;

  /**
   * The master's id in the presentation.
   */
  id: number;

  /**
   * Its layouts.
   */
  layouts: WrittenLayout[];
};

/**
 * The text context of a master or layout: its surface's theme and the deck's fonts, without links
 * or slide numbers.
 *
 * @param input - The deck.
 * @param theme - The surface theme.
 */
function partTextContext(input: PptxDeckInput, theme: SurfaceTheme): TextContext {
  return {
    theme,
    families: { major: theme.fonts.major, minor: theme.fonts.minor },
    link: () => null,
    slideNumber: null,
    ...(input.fonts === null ? {} : { font: input.fonts.resolve }),
  };
}

/**
 * An id allocator that starts after an id.
 *
 * @param after - The last id taken.
 */
function idsAfter(after: number): IdAllocator {
  let next = after;
  return () => {
    next += 1;
    return next;
  };
}

/**
 * Writes a surface's theme, master and layouts: the master's background (native, with the grain
 * tiled over it, or a picture for a mesh), its chrome and slide number placeholder; each layout
 * with its placeholders and, when it differs, its own chrome.
 *
 * @param pkg - The package.
 * @param input - The deck.
 * @param spec - The master's spec.
 * @param number - The master's number.
 * @param ids - The next free master or layout id, and the layouts written so far.
 * @param ids.next - The id.
 * @param ids.layouts - The count.
 */
function writeMaster(
  pkg: OpcPackage,
  input: PptxDeckInput,
  spec: MasterSpec,
  number: number,
  ids: { next: number; layouts: number },
): WrittenMaster {
  const { theme } = spec;
  const path = `ppt/slideMasters/slideMaster${number}.xml`;
  const themePath = `ppt/theme/theme${number}.xml`;
  const masterId = ids.next;
  ids.next += 1;
  pkg.addPart(
    themePath,
    themeXml(theme, `${input.brand.label} ${theme.surface}`, input.fonts?.theme ?? null),
    CONTENT_TYPE.theme,
  );
  const context = partTextContext(input, theme);
  const layouts = writeMasterLayouts(pkg, input, spec, path, ids, context);
  const texture = input.mode === 'hybrid' ? input.surfaceTextures.get(theme.surface) : undefined;
  const picture = texture?.picture ?? null;
  const pictureId =
    picture !== null && theme.texture === 'picture' ? embedMedia(pkg, path, picture) : null;
  const nextId = idsAfter(MASTER_SHAPE_IDS);
  const background = masterBackdropShapes(pkg, input, theme, path, nextId);
  const chrome = chromeXml(pkg, path, spec.chrome, nextId, context, input.brand.label);
  const slideNumber =
    spec.slideNumber === null ? '' : slideNumberPlaceholderXml(spec.slideNumber, nextId(), context);
  pkg.relate(path, REL.theme, themePath);
  pkg.addPart(
    path,
    masterXml(
      theme,
      input.brand,
      masterBackground(theme, pictureId),
      layouts,
      background + chrome + slideNumber,
      input.lang,
    ),
    CONTENT_TYPE.slideMaster,
  );
  return { spec, path, id: masterId, layouts };
}

/**
 * The shapes a master draws over its background: the picture fallback of a native gradient and the
 * grain tiled over it, in `hybrid` mode.
 *
 * @param pkg - The package.
 * @param input - The deck.
 * @param theme - The master's theme.
 * @param ownerPath - The part the shapes go in: the master, or a layout that hides the master's
 *   shapes and draws them itself.
 * @param nextId - The part's shape id allocator.
 * @returns The shapes' markup, empty for a surface without texture.
 */
function masterBackdropShapes(
  pkg: OpcPackage,
  input: PptxDeckInput,
  theme: SurfaceTheme,
  ownerPath: string,
  nextId: IdAllocator,
): string {
  const texture = input.mode === 'hybrid' ? input.surfaceTextures.get(theme.surface) : undefined;
  const picture = texture?.picture ?? null;
  const canvas = masterCanvas(input);
  const fallback =
    picture !== null && theme.texture !== 'picture' && theme.background.kind !== 'solid'
      ? backdropFallbackXml(canvas, nextId(), embedMedia(pkg, ownerPath, picture))
      : '';
  const tile = texture?.grain ?? null;
  const grain =
    tile !== null && theme.texture === 'grain'
      ? grainXml(canvas, nextId(), embedMedia(pkg, ownerPath, tile.data), tile.size)
      : '';
  return fallback + grain;
}

/**
 * The area a master's background covers: the first slide's canvas, or the standard canvas when the
 * deck has no slides.
 *
 * @param input - The deck.
 */
function masterCanvas(input: PptxDeckInput): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  return {
    x: 0,
    y: 0,
    width: input.slides[0]?.scene.canvas.width ?? CANVAS_WIDTH_PX,
    height: input.slides[0]?.scene.canvas.height ?? CANVAS_HEIGHT_PX,
  };
}

/**
 * A layout as its master lists it: the written layout, its id in the master and its relationship.
 */
type MasterLayout = WrittenLayout & {
  /**
   * The layout's id in the master's `p:sldLayoutIdLst`.
   */
  id: number;

  /**
   * The relationship id the master uses for the layout.
   */
  rId: string;
};

/**
 * Writes a master's layouts: each layout part with its placeholders, related to the master and
 * listed by it. A layout with chrome of its own draws it, and a layout without any takes the
 * master's slide number.
 *
 * @param pkg - The package.
 * @param input - The deck.
 * @param spec - The master's spec.
 * @param masterPath - The master part's path.
 * @param ids - The next free layout id, and the layouts written so far.
 * @param context - The master's text context.
 */
function writeMasterLayouts(
  pkg: OpcPackage,
  input: PptxDeckInput,
  spec: MasterSpec,
  masterPath: string,
  ids: { next: number; layouts: number },
  context: TextContext,
): MasterLayout[] {
  return spec.layouts.map((layout): MasterLayout => {
    ids.layouts += 1;
    const layoutPath = `ppt/slideLayouts/slideLayout${ids.layouts}.xml`;
    const nextId = idsAfter(LAYOUT_SHAPE_IDS);
    const backdrop =
      layout.art === null ? '' : masterBackdropShapes(pkg, input, spec.theme, layoutPath, nextId);
    const art = backdrop + layoutArtShapes(pkg, input, spec, layout, layoutPath, nextId);
    const own = art + layoutOwnXml(pkg, input, layout, layoutPath, nextId, context);
    const inherited =
      layout.chrome === null && spec.slideNumber !== null
        ? slideNumberPlaceholderXml(spec.slideNumber, nextId(), context)
        : '';
    pkg.addPart(
      layoutPath,
      layoutXml(layout, spec.theme, own + inherited),
      CONTENT_TYPE.slideLayout,
    );
    pkg.relate(layoutPath, REL.slideMaster, masterPath);
    const id = ids.next;
    ids.next += 1;
    return {
      spec: layout,
      path: layoutPath,
      id,
      rId: pkg.relate(masterPath, REL.slideLayout, layoutPath),
    };
  });
}

/**
 * The art a brand layout draws once for all its slides, as the first shapes of its layout part.
 *
 * @param pkg - The package.
 * @param input - The deck.
 * @param spec - The master's spec.
 * @param layout - The layout's spec.
 * @param layoutPath - The layout part's path.
 * @param nextId - The layout's shape id allocator.
 * @returns The shapes' markup, empty for a layout without art.
 */
function layoutArtShapes(
  pkg: OpcPackage,
  input: PptxDeckInput,
  spec: MasterSpec,
  layout: LayoutSpec,
  layoutPath: string,
  nextId: IdAllocator,
): string {
  if (layout.art === null) {
    return '';
  }

  const options = {
    mode: input.mode,
    brand: input.brand,
    theme: spec.theme,
    placeholders: undefined,
    contract: undefined,
    animate: false,
    outlineFonts: null,
    slideNumber: 0,
    resolveSlide: () => null,
    slideIds: input.slideIds,
    ...(input.fonts === null ? {} : { font: input.fonts.resolve }),
  };
  return layoutArtXml(pkg, layoutPath, layout.art, options, nextId);
}

/**
 * The chrome a layout draws itself: its own page chrome, then its slide number placeholder.
 *
 * @param pkg - The package.
 * @param input - The deck.
 * @param layout - The layout's spec.
 * @param layoutPath - The layout part's path.
 * @param nextId - The layout's shape id allocator.
 * @param context - The layout's text context.
 */
function layoutOwnXml(
  pkg: OpcPackage,
  input: PptxDeckInput,
  layout: LayoutSpec,
  layoutPath: string,
  nextId: IdAllocator,
  context: TextContext,
): string {
  if (layout.chrome === null) {
    return '';
  }

  const chrome = chromeXml(pkg, layoutPath, layout.chrome, nextId, context, input.brand.label);
  if (layout.slideNumber === null) {
    return chrome;
  }

  return chrome + slideNumberPlaceholderXml(layout.slideNumber, nextId(), context);
}

/**
 * Writes the notes master and its theme.
 *
 * @param pkg - The package.
 * @param input - The deck.
 * @param theme - The first master's theme.
 * @param themeNumber - The number of the notes theme part.
 * @returns The notes master's path.
 */
function writeNotesMaster(
  pkg: OpcPackage,
  input: PptxDeckInput,
  theme: SurfaceTheme | undefined,
  themeNumber: number,
): string {
  const path = 'ppt/notesMasters/notesMaster1.xml';
  const themePath = `ppt/theme/theme${themeNumber}.xml`;
  if (theme !== undefined) {
    pkg.addPart(
      themePath,
      themeXml(theme, 'Notes', input.fonts?.theme ?? null),
      CONTENT_TYPE.theme,
    );
  }

  pkg.addPart(path, notesMasterXml(input.lang), CONTENT_TYPE.notesMaster);
  pkg.relate(path, REL.theme, themePath);
  return path;
}

/**
 * Where a slide goes in the package and what it builds on.
 */
type SlidePlace = {
  /**
   * The master of the slide's surface.
   */
  master: WrittenMaster | undefined;

  /**
   * The slide's layout.
   */
  layout: WrittenLayout | undefined;

  /**
   * Every slide's part path, for slide links.
   */
  slidePaths: readonly string[];

  /**
   * The first exported slide of each deck slide index.
   */
  firstExported: ReadonlyMap<number, number>;

  /**
   * The notes master's path.
   */
  notesMasterPath: string;
};

/**
 * The slide number placeholder a slide takes: its layout's, unless the layout has no chrome of its
 * own (or there is no layout), in which case the master's.
 *
 * @param place - Where the slide goes and what it builds on.
 */
function slideNumberSpecOf(place: SlidePlace): MasterSpec['slideNumber'] {
  if (place.layout === undefined || place.layout.spec.chrome === null) {
    return place.master?.spec.slideNumber ?? null;
  }

  return place.layout.spec.slideNumber;
}

/**
 * What the slide's layout part draws, when the layout has art: the art, and the chrome the layout
 * draws itself.
 *
 * @param place - Where the slide goes and what it builds on.
 */
function layoutSourceOf(place: SlidePlace): LayoutSource | undefined {
  const spec = place.layout?.spec;
  if (spec === undefined || spec.art === null) {
    return undefined;
  }

  return { art: spec.art, chrome: spec.chrome ?? [] };
}

/**
 * Resolves a deck slide index to the part of its first exported slide, for slide links. A slide
 * that was not exported links nowhere.
 *
 * @param place - Where the slide goes and which slides were exported.
 */
function slideLinkResolver(place: SlidePlace): (deckIndex: number) => string | null {
  return (deckIndex) => {
    const target = place.firstExported.get(deckIndex);
    return target === undefined ? null : (place.slidePaths[target] ?? null);
  };
}

/**
 * Writes a slide's part from its measured scene, on the theme of its master.
 *
 * @param pkg - The package.
 * @param input - The deck.
 * @param slide - The slide.
 * @param path - The slide part's path.
 * @param place - Where the slide goes and what it builds on.
 * @param theme - The surface theme the slide is written with.
 */
function writeSlideBody(
  pkg: OpcPackage,
  input: PptxDeckInput,
  slide: PptxSlideInput,
  path: string,
  place: SlidePlace,
  theme: SurfaceTheme,
): SlideWriteResult {
  return slideXml(pkg, path, slide, {
    mode: input.mode,
    brand: input.brand,
    theme,
    placeholders: place.layout?.spec,
    layoutSource: layoutSourceOf(place),
    contract: input.layouts.find((contract) => contract.name === (place.layout?.spec.name ?? '')),
    animate: input.animate,
    outlineFonts: input.outlineFonts,
    slideNumber: slide.slideIndex + 1,
    totals: { deck: input.slideIds.length, file: input.slides.length },
    slideIds: input.slideIds,
    chrome: place.layout?.spec.chrome ?? place.master?.spec.chrome ?? [],
    slideNumberSpec: slideNumberSpecOf(place),
    ...(input.fonts === null ? {} : { font: input.fonts.resolve }),
    resolveSlide: slideLinkResolver(place),
  });
}

/**
 * Writes one slide with its relationships and notes.
 *
 * @param pkg - The package.
 * @param input - The deck.
 * @param slide - The slide.
 * @param index - Its zero-based position in the export.
 * @param place - Where it goes and what it builds on.
 */
function writeSlide(
  pkg: OpcPackage,
  input: PptxDeckInput,
  slide: PptxSlideInput,
  index: number,
  place: SlidePlace,
): PptxSlideReport {
  const path = place.slidePaths[index] ?? '';
  if (place.layout !== undefined) {
    pkg.relate(path, REL.slideLayout, place.layout.path);
  }

  const theme = place.master?.spec.theme ?? surfaceThemes(input.brand)[0];
  const written =
    theme === undefined ? null : writeSlideBody(pkg, input, slide, path, place, theme);
  pkg.addPart(path, written?.xml ?? '', CONTENT_TYPE.slide);
  const notesPath = `ppt/notesSlides/notesSlide${index + 1}.xml`;
  pkg.addPart(notesPath, notesSlideXml(slide.notes), CONTENT_TYPE.notesSlide);
  pkg.relate(notesPath, REL.notesMaster, place.notesMasterPath);
  pkg.relate(notesPath, REL.slide, path);
  pkg.relate(path, REL.notesSlide, notesPath);
  return {
    number: index + 1,
    slide: slide.slideIndex + 1,
    step: slide.step,
    layout: place.layout?.spec.name ?? FALLBACK_LAYOUT,
    counts: written?.counts ?? {
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
    },
    placeholders: written?.placeholders ?? [],
    droppedLinks: written?.droppedLinks ?? [],
  };
}

/**
 * An embedded font as written: its typeface and the relationship of each style's part.
 */
type WrittenFont = {
  /**
   * The family name.
   */
  typeface: string;

  /**
   * The `p:font` attributes.
   */
  attributes: Record<string, string | number | undefined>;

  /**
   * The font data parts by style, in the order the schema lists them.
   */
  parts: { style: 'regular' | 'bold' | 'italic' | 'boldItalic'; path: string }[];
};

/**
 * Adds the embedded fonts' data parts (`ppt/fonts/fontN.fntdata`).
 *
 * @param pkg - The package.
 * @param input - The deck.
 */
function writeFonts(pkg: OpcPackage, input: PptxDeckInput): WrittenFont[] {
  let number = 0;
  const order = ['regular', 'bold', 'italic', 'boldItalic'] as const;
  return (input.fonts?.embedded ?? []).map((font) => {
    const parts = order.flatMap((style) => {
      const data = font.styles[style];
      if (data === undefined) {
        return [];
      }

      number += 1;
      const partPath = `ppt/fonts/font${number}.fntdata`;
      pkg.addPart(partPath, data, FONT_DATA_CONTENT_TYPE);
      return [{ style, path: partPath }];
    });
    return {
      typeface: font.typeface,
      attributes: {
        typeface: font.typeface,
        panose: font.panose,
        pitchFamily: font.pitchFamily,
        charset: font.charset,
      },
      parts,
    };
  });
}

/**
 * The presentation's default text style: the deck's language and the browser's kerning on every
 * level, so runs need neither.
 *
 * @param lang - The language.
 */
function defaultTextStyleXml(lang: string): string {
  const levels = Array.from({ length: TEXT_STYLE_LEVEL_COUNT }, (_, index) =>
    el(
      `a:lvl${index + 1}pPr`,
      { marL: 0, algn: 'l', defTabSz: DEFAULT_TAB_SIZE_EMU },
      el('a:defRPr', { lang, kern: 0 }),
    ),
  );
  return el(
    'p:defaultTextStyle',
    {},
    el('a:defPPr', {}, el('a:defRPr', { lang, kern: 0 })),
    ...levels,
  );
}

/**
 * Writes `presentation.xml` and its property parts.
 *
 * @param pkg - The package.
 * @param input - The deck.
 * @param masters - The masters.
 * @param notesMaster - The notes master's path.
 * @param slidePaths - The slides' paths.
 * @param fonts - The embedded fonts.
 */
function writePresentation(
  pkg: OpcPackage,
  input: PptxDeckInput,
  masters: readonly WrittenMaster[],
  notesMaster: string,
  slidePaths: readonly string[],
  fonts: readonly WrittenFont[],
): void {
  const path = 'ppt/presentation.xml';
  pkg.relate('', REL.officeDocument, path);
  const masterList = masters.map((master) =>
    el('p:sldMasterId', { id: master.id, 'r:id': pkg.relate(path, REL.slideMaster, master.path) }),
  );
  const notesId = pkg.relate(path, REL.notesMaster, notesMaster);
  const slideList = slidePaths.map((slidePath, index) =>
    el('p:sldId', { id: FIRST_SLIDE_ID + index, 'r:id': pkg.relate(path, REL.slide, slidePath) }),
  );
  const fontList = fonts.map((font) =>
    el(
      'p:embeddedFont',
      {},
      el('p:font', font.attributes),
      ...font.parts.map((part) =>
        el(`p:${part.style}`, { 'r:id': pkg.relate(path, REL.font, part.path) }),
      ),
    ),
  );
  for (const [partPath, type, contentType, xml] of propertyParts()) {
    pkg.addPart(partPath, XML_DECLARATION + xml, contentType);
    pkg.relate(path, type, partPath);
  }

  pkg.addPart(
    path,
    XML_DECLARATION +
      presentationXml(input.lang, masterList, notesId, slideList, fontList, fonts.length > 0),
    CONTENT_TYPE.presentation,
  );
}

/**
 * The property parts `presentation.xml` relates to: the presentation, view and table style
 * properties, each as its part path, relationship type, content type and XML.
 */
function propertyParts() {
  return [
    [
      'ppt/presProps.xml',
      REL.presProps,
      CONTENT_TYPE.presProps,
      el('p:presentationPr', PML_NAMESPACES),
    ],
    [
      'ppt/viewProps.xml',
      REL.viewProps,
      CONTENT_TYPE.viewProps,
      el(
        'p:viewPr',
        PML_NAMESPACES,
        el(
          'p:normalViewPr',
          {},
          el('p:restoredLeft', { sz: VIEW_RESTORED_LEFT }),
          el('p:restoredTop', { sz: VIEW_RESTORED_TOP }),
        ),
        el('p:gridSpacing', { cx: VIEW_GRID_SPACING_EMU, cy: VIEW_GRID_SPACING_EMU }),
      ),
    ],
    [
      'ppt/tableStyles.xml',
      REL.tableStyles,
      CONTENT_TYPE.tableStyles,
      el('a:tblStyleLst', {
        'xmlns:a': PML_NAMESPACES['xmlns:a'],
        def: '{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}',
      }),
    ],
  ] as const;
}

/**
 * The `p:presentation` root: its master, notes master, slide and embedded font lists, the slide and
 * notes sizes and the default text style. An empty list is left out.
 *
 * @param lang - The deck's language.
 * @param masterList - The `p:sldMasterId` entries.
 * @param notesId - The relationship id of the notes master.
 * @param slideList - The `p:sldId` entries.
 * @param fontList - The `p:embeddedFont` entries.
 * @param hasEmbeddedFonts - Whether the deck embeds fonts.
 */
function presentationXml(
  lang: string,
  masterList: readonly string[],
  notesId: string,
  slideList: readonly string[],
  fontList: readonly string[],
  hasEmbeddedFonts: boolean,
): string {
  return el(
    'p:presentation',
    {
      ...PML_NAMESPACES,
      saveSubsetFonts: 1,
      embedTrueTypeFonts: hasEmbeddedFonts ? 1 : undefined,
    },
    el('p:sldMasterIdLst', {}, ...masterList),
    el('p:notesMasterIdLst', {}, el('p:notesMasterId', { 'r:id': notesId })),
    slideList.length === 0 ? '' : el('p:sldIdLst', {}, ...slideList),
    el('p:sldSz', { cx: SLIDE_SIZE_EMU.width, cy: SLIDE_SIZE_EMU.height }),
    el('p:notesSz', NOTES_SIZE_EMU),
    fontList.length === 0 ? '' : el('p:embeddedFontLst', {}, ...fontList),
    defaultTextStyleXml(lang),
  );
}

/**
 * A version in the `XX.YYYY` form Office's `AppVersion` takes: the major version, then the minor
 * and patch versions as two digits each (`0.5.2` is `0.0502`).
 *
 * @param version - A `major.minor.patch` version; missing or malformed parts count as zero.
 */
export function appVersionOf(version: string): string {
  const [major, minor, patch] = version.split('.').map((part) => Number.parseInt(part, 10) || 0);
  /**
   * A version part as two digits.
   */
  const pad = (value: number | undefined): string => String(value ?? 0).padStart(2, '0');
  return `${major ?? 0}.${pad(minor)}${pad(patch)}`;
}

/**
 * Writes the core and extended document properties: title, language, application and dates.
 *
 * @param pkg - The package.
 * @param input - The deck.
 */
function writeDocumentProperties(pkg: OpcPackage, input: PptxDeckInput): void {
  const now = new Date().toISOString().replace(FRACTIONAL_SECONDS, 'Z');
  const core =
    XML_DECLARATION +
    el(
      'cp:coreProperties',
      {
        'xmlns:cp': 'http://schemas.openxmlformats.org/package/2006/metadata/core-properties',
        'xmlns:dc': 'http://purl.org/dc/elements/1.1/',
        'xmlns:dcterms': 'http://purl.org/dc/terms/',
        'xmlns:dcmitype': 'http://purl.org/dc/dcmitype/',
        'xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
      },
      el('dc:title', {}, escapeXml(input.title)),
      el('dc:creator', {}, 'deck'),
      el('cp:lastModifiedBy', {}, 'deck'),
      el('dc:language', {}, escapeXml(input.lang)),
      el('dcterms:created', { 'xsi:type': 'dcterms:W3CDTF' }, now),
      el('dcterms:modified', { 'xsi:type': 'dcterms:W3CDTF' }, now),
    );
  const app =
    XML_DECLARATION +
    el(
      'Properties',
      {
        xmlns: 'http://schemas.openxmlformats.org/officeDocument/2006/extended-properties',
        'xmlns:vt': 'http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes',
      },
      el('Application', {}, APPLICATION_NAME),
      input.appVersion === undefined ? '' : el('AppVersion', {}, appVersionOf(input.appVersion)),
      el('Slides', {}, String(input.slides.length)),
      el('PresentationFormat', {}, 'Widescreen'),
    );
  pkg.addPart('docProps/core.xml', core, CONTENT_TYPE.coreProperties);
  pkg.addPart('docProps/app.xml', app, CONTENT_TYPE.extendedProperties);
  pkg.relate('', REL.coreProperties, 'docProps/core.xml');
  pkg.relate('', REL.extendedProperties, 'docProps/app.xml');
}
