import type { AnyLayoutContract } from '@deckster/engine/layout';
import type { Page } from 'playwright';

import {
  buildPptx,
  captureSlide,
  outlineFonts,
  type OutlineFace,
  fetchEmbeddedWithin,
  surfaceThemes,
  type EmbeddedFile,
  type FontPlan,
  type MasterBackground,
  type PptxFonts,
  type PptxResult,
  type PptxSlideInput,
  type SurfaceTexture,
  type SurfaceTheme,
} from '@deckster/export';
import { Effect, FileSystem } from 'effect';
import path from 'node:path';

import type { OpenedDeck } from '#browser/open-deck.ts';
import type { ExportOptions } from '#export/export-options.ts';
import type { ExportTarget } from '#export/export-targets.ts';

import {
  browserError,
  cliError,
  fileSystemError,
  type BrowserError,
  type CliError,
  type FileSystemError,
  type SlideNotReadyError,
} from '#cli-error.ts';
import { planFonts, pptxFonts } from '#export/export-fonts.ts';

/**
 * Video formats PowerPoint plays on Windows and macOS; others (WebM) stay posters.
 */
const EMBEDDABLE_VIDEO = new Set(['mp4', 'mov']);

/**
 * How long a non-static page gets to publish its video sources.
 */
const VIDEO_PAGE_TIMEOUT_MS = 30_000;

/**
 * The videos of the slide that is on screen, in a page opened outside static mode.
 */
const ACTIVE_VIDEO_SELECTOR = 'section[data-slide-active="true"] figure.kit-video video';

/**
 * The characters that need no glyph: soft hyphens, zero-width spaces and joiners, directional marks
 * and the byte order mark.
 */
const INVISIBLE_CHARACTERS = /[­​-‏⁠﻿]/g;

/**
 * The file names of a brand's Latin font subset, which covers the deck's text.
 */
const LATIN_SUBSET_FILE = /-latin-(?!ext)/;

/**
 * One captured target, with the web screenshot verification compares against.
 */
export type CapturedTarget = {
  /**
   * The target.
   */
  target: ExportTarget;

  /**
   * What the writer gets.
   */
  input: PptxSlideInput;

  /**
   * The web screenshot, when verification asked for it.
   */
  webShot: Uint8Array | null;
};

/**
 * What capturing a deck for PPTX produced.
 */
export type PptxCapture = {
  /**
   * The captured targets, in order.
   */
  captured: CapturedTarget[];

  /**
   * The texture of each textured surface's slide master: its grain tile, or a picture of a mesh
   * background.
   */
  textures: Map<string, SurfaceTexture>;

  /**
   * Things the report should mention, such as videos that stay posters.
   */
  warnings: string[];

  /**
   * The font part of `warnings`, which a PDF export reports too; the rest concerns only the PPTX.
   */
  fontWarnings: string[];

  /**
   * How runs are set in fonts and what is embedded, or `null` for the brand families through the
   * theme.
   */
  fonts: PptxFonts | null;

  /**
   * The static font instances cut for the export, for `<out>/fonts` and the PDF.
   */
  fontPlan: FontPlan;
};

/**
 * What the targets of one capture share: the page, the surface themes and the results they fill.
 */
type CaptureState = {
  /**
   * The open deck.
   */
  opened: OpenedDeck;

  /**
   * The deck's Playwright page.
   */
  raw: Page;

  /**
   * The layout contracts.
   */
  contracts: readonly AnyLayoutContract[];

  /**
   * The export options.
   */
  options: ExportOptions;

  /**
   * Whether to keep a web screenshot of each target.
   */
  withScreenshots: boolean;

  /**
   * The surface themes of the brand.
   */
  themes: readonly SurfaceTheme[];

  /**
   * The textures captured so far, by surface.
   */
  textures: Map<string, SurfaceTexture>;

  /**
   * The warnings collected so far.
   */
  warnings: string[];
};

/**
 * Shows every target and captures its scene, plan and files for the PPTX writer: placeholders from
 * the slide's layout contract, the slide master background of its surface, a texture picture for
 * the first slide of each textured surface, local MP4 and MOV videos when embedding is on, and a
 * web screenshot when verifying.
 *
 * @param opened - The open deck.
 * @param targets - What to capture.
 * @param contracts - The layout contracts.
 * @param options - The export options.
 * @param withScreenshots - Whether to keep a web screenshot of each target.
 * @returns The captures.
 * @throws CliError in the error channel when the page has no Playwright handle or a capture fails;
 *   SlideNotReadyError or BrowserError when a slide does not show.
 */
export const capturePptx = Effect.fn('capturePptx')(function* (
  opened: OpenedDeck,
  targets: readonly ExportTarget[],
  contracts: readonly AnyLayoutContract[],
  options: ExportOptions,
  withScreenshots: boolean,
): Effect.fn.Return<
  PptxCapture,
  CliError | SlideNotReadyError | BrowserError,
  FileSystem.FileSystem
> {
  const raw = yield* playwrightPage(opened);
  const state: CaptureState = {
    opened,
    raw,
    contracts,
    options,
    withScreenshots,
    themes: surfaceThemes(opened.brand.tokens),
    textures: new Map<string, SurfaceTexture>(),
    warnings: [],
  };
  const captured: CapturedTarget[] = [];
  for (const target of targets) {
    captured.push(yield* captureTarget(state, target));
  }

  // Image mode draws no text, so it embeds no fonts.
  const fontPlan = yield* planFonts(
    opened,
    captured.map((entry) => entry.input.scene),
    { embedFonts: options.embedFonts && options.mode !== 'image' },
  );
  const fontNotes = fontWarnings(fontPlan);
  state.warnings.push(...fontNotes);
  const fonts = pptxFonts(fontPlan, opened.brand.tokens, options);
  return {
    captured,
    textures: state.textures,
    warnings: state.warnings,
    fontWarnings: fontNotes,
    fonts,
    fontPlan,
  };
});

/**
 * Shows one target and captures it: its scene, its surface's texture when this is the first slide
 * on the surface, its embeddable videos and, when verifying, its web screenshot.
 *
 * @param state - What the targets share.
 * @param target - The target.
 */
const captureTarget = Effect.fn('captureTarget')(function* (
  state: CaptureState,
  target: ExportTarget,
): Effect.fn.Return<
  CapturedTarget,
  CliError | SlideNotReadyError | BrowserError,
  FileSystem.FileSystem
> {
  const { opened, raw, options } = state;
  yield* opened.page.show(target.slide.index, target.step);
  const surface = yield* readSurface(raw);
  const theme = state.themes.find((candidate) => candidate.surface === surface) ?? state.themes[0];
  const contract = state.contracts.find((candidate) => candidate.name === target.slide.layout);
  const firstOnSurface =
    options.mode === 'hybrid' && theme !== undefined && !state.textures.has(surface);
  const texture = firstOnSurface ? theme.texture : null;
  const gradient = firstOnSurface && theme.background.kind !== 'solid';
  const capture = yield* captureSlide(raw, {
    mode: options.mode,
    placeholderSelectors: placeholderSelectors(contract),
    fieldText: fieldText(target),
    master: masterOf(theme),
    label: `slide ${target.slide.index + 1}`,
    captureTexture: texture,
    captureBackdrop: gradient,
    pictureScale: options.pictureScale,
    outlineText: options.outlineText,
  }).pipe(Effect.mapError((error) => cliError(error.message)));
  state.warnings.push(
    ...capture.scene.warnings.map((warning) => `slide ${target.slide.index + 1}: ${warning}`),
  );
  if (texture !== null || gradient) {
    state.textures.set(surface, {
      grain: texture === 'grain' ? capture.assets.grain : null,
      picture: capture.assets.background,
    });
  }

  const media =
    options.embedMedia && options.mode !== 'image'
      ? yield* embeddableVideos(raw, target, capture.scene.nodes, options, state.warnings)
      : new Map<number, EmbeddedFile>();
  const webShot = state.withScreenshots ? yield* fullScreenshot(raw) : null;
  return {
    target,
    input: {
      slideIndex: target.slide.index,
      step: target.stepLabel,
      title: target.slide.title,
      notes: target.slide.notes,
      scene: capture.scene,
      plan: capture.plan,
      assets: { ...capture.assets, media },
      hidden: target.slide.hidden,
    },
    webShot,
  };
});

/**
 * The surface a shown slide declares, or `default` when it declares none.
 *
 * @param raw - The deck's Playwright page.
 */
const readSurface = Effect.fn('readSurface')(function* (
  raw: Page,
): Effect.fn.Return<string, BrowserError> {
  return yield* Effect.tryPromise({
    try: () =>
      raw.evaluate(
        () =>
          document
            .querySelector('section[data-slide-active="true"]')
            ?.getAttribute('data-surface') ?? 'default',
      ),
    catch: (cause) => browserError('read the slide surface', cause),
  });
});

/**
 * The warnings a font plan adds to the report: its own, then each family that lacks glyphs for some
 * text, once per family.
 *
 * @param fontPlan - The font plan.
 */
function fontWarnings(fontPlan: FontPlan): string[] {
  const missing = fontPlan.missing.flatMap((entry) => {
    const shown = entry.characters.replace(INVISIBLE_CHARACTERS, '');
    if (shown === '') {
      return [];
    }

    return [
      `${entry.family} has no glyphs for "${shown}" in the embedded instance; ` +
        'that text stays in the substitute font.',
    ];
  });
  return [...fontPlan.warnings, ...missing];
}

/**
 * Writes the PPTX of captured slides.
 *
 * @param capture - The captures.
 * @param opened - The open deck.
 * @param contracts - The layout contracts.
 * @param options - The export options.
 * @param file - The file to write.
 * @returns What was written.
 * @throws FileSystemError in the error channel when the file cannot be written.
 */
export const writePptx = Effect.fn('writePptx')(function* (
  capture: PptxCapture,
  opened: OpenedDeck,
  contracts: readonly AnyLayoutContract[],
  options: ExportOptions,
  file: string,
): Effect.fn.Return<PptxResult, FileSystemError | CliError, FileSystem.FileSystem> {
  const result = yield* buildDeckPptx(
    capture,
    opened,
    contracts,
    options,
    capture.captured.map((entry) => entry.input),
  );
  const fs = yield* FileSystem.FileSystem;
  yield* fs.makeDirectory(path.dirname(file), { recursive: true }).pipe(Effect.ignore);
  yield* fs
    .writeFile(file, result.bytes)
    .pipe(
      Effect.mapError((error) =>
        fileSystemError('write the PPTX', file, error, 'Pass `--out` a path that can be written.'),
      ),
    );
  return result;
});

/**
 * Builds a PPTX of some captured slides.
 *
 * @param capture - The captures.
 * @param opened - The open deck.
 * @param contracts - The layout contracts.
 * @param options - The export options.
 * @param slides - The slides to include.
 */
export const buildDeckPptx = Effect.fn('buildDeckPptx')(function* (
  capture: PptxCapture,
  opened: OpenedDeck,
  contracts: readonly AnyLayoutContract[],
  options: ExportOptions,
  slides: readonly PptxSlideInput[],
): Effect.fn.Return<PptxResult, CliError> {
  return yield* buildPptx({
    title: opened.deck.config.title ?? options.deck,
    brand: opened.brand.tokens,
    mode: options.mode,
    layouts: contracts,
    slides,
    surfaceTextures: capture.textures,
    animate: options.animate && !options.steps,
    slideIds: opened.page.slides.map((slide) => slide.id),
    outlineFonts: options.outlineText ? outlineFonts(latinFirst(opened)) : null,
    lang: deckLanguage(opened),
    fonts: capture.fonts,
  }).pipe(Effect.mapError((error) => cliError(error.message)));
});

/**
 * The language of a deck's text: the brand's number locale, else US English.
 *
 * @param opened - The open deck.
 */
export function deckLanguage(opened: OpenedDeck): string {
  const locale = opened.brand.tokens.charts.numbers.locale;
  return locale === '' ? 'en-US' : locale;
}

/**
 * The brand's font faces with the Latin subset of each family first, for outlining.
 *
 * @param opened - The open deck.
 */
function latinFirst(opened: OpenedDeck): OutlineFace[] {
  const faces = opened.brand.fontFaces.map((face) => ({
    family: face.family,
    file: face.url,
    style: face.style,
  }));
  /**
   * Whether a face is the Latin subset, which covers the deck's text.
   */
  const isLatin = (face: OutlineFace): boolean => LATIN_SUBSET_FILE.test(face.file);
  return [...faces.filter(isLatin), ...faces.filter((face) => !isLatin(face))];
}

/**
 * The Playwright page behind the deck page.
 *
 * @param opened - The open deck.
 * @throws CliError in the error channel when the page is a fake without one.
 */
export const playwrightPage = Effect.fn('playwrightPage')(function* (
  opened: OpenedDeck,
): Effect.fn.Return<Page, CliError> {
  const raw = opened.page.playwright;
  if (raw === undefined) {
    return yield* cliError('Export needs a real browser page; this deck page has none.');
  }

  return raw;
});

/**
 * The CSS selectors a layout's placeholders read.
 *
 * @param contract - The layout contract, if any.
 */
function placeholderSelectors(contract: AnyLayoutContract | undefined): string[] {
  return (contract?.pptx?.placeholders ?? []).flatMap((placeholder) =>
    'selector' in placeholder.from ? [placeholder.from.selector] : [],
  );
}

/**
 * The frontmatter text placeholders may read: the slide's string fields and its title.
 *
 * @param target - The target.
 */
function fieldText(target: ExportTarget): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const [key, value] of Object.entries(target.slide.frontmatter)) {
    if (typeof value === 'string') {
      fields[key] = value;
    }
  }

  fields['title'] = target.slide.title;
  return fields;
}

/**
 * The master background a theme gives its slides.
 *
 * @param theme - The surface theme.
 */
function masterOf(theme: SurfaceTheme | undefined): MasterBackground {
  return theme === undefined
    ? { paint: { kind: 'solid', color: '#ffffff' }, texture: null }
    : { paint: theme.background, texture: theme.texture };
}

/**
 * A full-canvas screenshot.
 *
 * @param raw - The page.
 */
const fullScreenshot = Effect.fn('fullScreenshot')(function* (
  raw: Page,
): Effect.fn.Return<Uint8Array, BrowserError> {
  const buffer = yield* Effect.tryPromise({
    try: () => raw.screenshot({ type: 'png', animations: 'disabled' }),
    catch: (cause) => browserError('take the screenshot', cause),
  });
  return new Uint8Array(buffer);
});

/**
 * The videos of a slide that can be embedded: static mode shows only posters, so the slide is
 * opened once without `?static` to read each video's source, and MP4 and MOV files within the size
 * limit are fetched. Others are reported and stay posters.
 *
 * @param raw - The deck page.
 * @param target - The slide.
 * @param nodes - The slide's scene nodes.
 * @param options - The export options.
 * @param warnings - Collects what stays a poster.
 */
const embeddableVideos = Effect.fn('embeddableVideos')(function* (
  raw: Page,
  target: ExportTarget,
  nodes: readonly { kind: string; id: number }[],
  options: ExportOptions,
  warnings: string[],
): Effect.fn.Return<Map<number, EmbeddedFile>, CliError> {
  const videos = nodes.filter(
    (node) => node.kind === 'media' && 'media' in node && node.media === 'video',
  );
  const media = new Map<number, EmbeddedFile>();
  if (videos.length === 0) {
    return media;
  }

  const slideName = `slide ${target.slide.index + 1}`;
  const sources = yield* liveVideoSources(raw, target.slide.index);
  for (const [index, node] of videos.entries()) {
    const source = sources[index];
    const extension =
      source === undefined ? '' : path.extname(new URL(source).pathname).slice(1).toLowerCase();
    if (source === undefined || !EMBEDDABLE_VIDEO.has(extension)) {
      const name = source === undefined ? 'a video' : path.basename(source);
      const format = extension || 'this format';
      warnings.push(
        `${slideName}: ${name} stays a poster; ` + `PowerPoint embeds MP4 or MOV, not ${format}.`,
      );
      continue;
    }

    const file = yield* fetchEmbeddedWithin(raw, source, slideName, options.maxMediaBytes).pipe(
      Effect.mapError((error) => cliError(error.message)),
    );
    if (file !== null && 'tooLarge' in file) {
      warnings.push(
        `${slideName}: ${path.basename(source)} stays a poster; it is over --max-media-mb ` +
          `(${megabytes(options.maxMediaBytes)}), so it was not downloaded.`,
      );
      continue;
    }

    if (file === null) {
      warnings.push(`${slideName}: ${path.basename(source)} stays a poster; it could not be read.`);
      continue;
    }

    media.set(node.id, file);
  }

  return media;
});

/**
 * A size in megabytes for a message.
 *
 * @param bytes - The size.
 */
function megabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * The sources of the videos a slide plays outside static mode, in document order.
 *
 * @param raw - The deck page, whose context opens a second page.
 * @param slideIndex - The slide.
 */
const liveVideoSources = Effect.fn('liveVideoSources')(function* (
  raw: Page,
  slideIndex: number,
): Effect.fn.Return<string[], CliError> {
  const origin = new URL(raw.url()).origin;
  return yield* Effect.tryPromise({
    try: async () => {
      const live = await raw.context().newPage();
      try {
        await live.goto(`${origin}/#/${slideIndex + 1}/0`);
        await live.waitForFunction(
          () => (window as { __deck?: unknown }).__deck !== undefined,
          undefined,
          { timeout: VIDEO_PAGE_TIMEOUT_MS },
        );
        await live.waitForSelector(ACTIVE_VIDEO_SELECTOR, { timeout: VIDEO_PAGE_TIMEOUT_MS });
        return await live.evaluate(
          (selector) =>
            Array.from(document.querySelectorAll<HTMLVideoElement>(selector)).map(
              (video) => video.currentSrc || video.src,
            ),
          ACTIVE_VIDEO_SELECTOR,
        );
      } finally {
        await live.close();
      }
    },
    catch: (cause) => {
      const reason = cause instanceof Error ? cause.message.split('\n')[0] : String(cause);
      return cliError(
        `Could not read the video sources of slide ${slideIndex + 1}: ${reason}. ` +
          'Pass --no-embed-media to keep posters.',
      );
    },
  });
});
