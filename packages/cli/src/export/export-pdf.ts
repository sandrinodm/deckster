import type { Page } from 'playwright';

import {
  assemblePdf,
  printNotesPage,
  printSlide,
  staticFontsArgs,
  useStaticFonts,
  type AssembledPdf,
  type FontPlan,
  type NotesPage,
  type PrintedPage,
  type RgbPixels,
} from '@deckster/export';
import { Effect, FileSystem, type Scope } from 'effect';
import path from 'node:path';

import type { OpenedDeck } from '#browser/open-deck.ts';
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
import { playwrightPage } from '#export/export-pptx.ts';

/**
 * Whether slide pages carry Chromium's structure tree (a tagged PDF): headings, paragraphs, lists
 * and figures with their alt text, in reading order.
 */
const TAGGED = true;

/**
 * The JPEG quality rasterised photos are stored at, from 0 to 1.
 */
const JPEG_QUALITY = 0.88;

/**
 * The language a PDF gets when the brand names no locale.
 */
const DEFAULT_LANGUAGE = 'en-US';

/**
 * Prints the targets to one PDF: a page per target as Chromium prints it (vector text, embedded
 * font subsets, links, structure tree), notes pages when asked, the outline, page labels (`3`, or
 * `3.2`, the second step of slide 3, with `--steps`; `Notes 3`), the title, the language from the
 * brand's number locale and an XMP stream; identical images and fonts are stored once and large
 * rasterised photos as JPEG.
 *
 * @param opened - The open deck.
 * @param targets - The slides and steps.
 * @param notes - Whether to add speaker notes pages.
 * @param file - The PDF to write.
 * @param fonts - Static instances of the brand's variable fonts to print text in, so the PDF embeds
 *   TrueType subsets instead of Type 3 fonts; `null` prints in the page's own fonts.
 * @returns What the document holds.
 * @throws CliError, BrowserError or SlideNotReadyError in the error channel when printing fails;
 *   FileSystemError when the file cannot be written.
 */
export const exportPdf = Effect.fn('exportPdf')(function* (
  opened: OpenedDeck,
  targets: readonly ExportTarget[],
  notes: boolean,
  file: string,
  fonts: FontPlan | null = null,
): Effect.fn.Return<
  AssembledPdf,
  CliError | BrowserError | SlideNotReadyError | FileSystemError,
  FileSystem.FileSystem
> {
  const raw = yield* playwrightPage(opened);
  const pages = yield* printPages(opened, raw, targets, fonts);
  const language = documentLanguage(opened.brand.tokens.charts.numbers.locale);
  const notesPages = notes ? yield* printNotes(opened, targets, language) : [];
  const origin = new URL(raw.url()).origin;
  const assembled = yield* Effect.scoped(
    Effect.gen(function* () {
      const encoder = yield* scratchPage(raw);
      return yield* Effect.tryPromise({
        try: () =>
          assemblePdf({
            title: opened.deck.config.title ?? opened.deck.location.id,
            author: null,
            language,
            date: new Date(),
            encodeJpeg: (pixels) => encodeJpeg(encoder, pixels),
            pages,
            notes: notesPages,
            origin,
            slideIds: opened.page.slides.map((slide) => slide.id),
          }),
        catch: (cause) =>
          cliError(
            `Could not assemble the PDF: ${cause instanceof Error ? cause.message : String(cause)}`,
          ),
      });
    }),
  );
  yield* writePdf(file, assembled.bytes);
  return assembled;
});

/**
 * Shows each target in the deck and prints it as one PDF page, with the static font instances set
 * first when the plan has any.
 *
 * @param opened - The open deck.
 * @param raw - The deck's Playwright page.
 * @param targets - The slides and steps.
 * @param fonts - The static font plan, or `null` to print in the page's own fonts.
 * @throws CliError, BrowserError or SlideNotReadyError in the error channel when printing fails.
 */
const printPages = Effect.fn('printPdfPages')(function* (
  opened: OpenedDeck,
  raw: Page,
  targets: readonly ExportTarget[],
  fonts: FontPlan | null,
): Effect.fn.Return<PrintedPage[], CliError | BrowserError | SlideNotReadyError> {
  const pages: PrintedPage[] = [];
  const staticFonts =
    fonts === null || fonts.instances.length === 0 ? null : staticFontsArgs(fonts);
  for (const target of targets) {
    yield* opened.page.show(target.slide.index, target.step);
    if (staticFonts !== null) {
      yield* Effect.tryPromise({
        try: () => raw.evaluate(useStaticFonts, staticFonts),
        catch: (cause) => browserError('set the slide in the static font instances', cause),
      });
    }

    const pdf = yield* printSlide(raw, `slide ${target.slide.index + 1}`, TAGGED).pipe(
      Effect.mapError((error) => cliError(error.message)),
    );
    pages.push({
      pdf,
      slideIndex: target.slide.index,
      title: target.slide.title,
      label: pageLabel(target),
    });
  }

  return pages;
});

/**
 * Writes the assembled PDF, creating its folder first.
 *
 * @param file - The PDF path.
 * @param bytes - The document.
 * @throws FileSystemError in the error channel when the file cannot be written.
 */
const writePdf = Effect.fn('writePdf')(function* (
  file: string,
  bytes: Uint8Array,
): Effect.fn.Return<void, FileSystemError, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  yield* fs.makeDirectory(path.dirname(file), { recursive: true }).pipe(Effect.ignore);
  yield* fs
    .writeFile(file, bytes)
    .pipe(
      Effect.mapError((error) =>
        fileSystemError('write the PDF', file, error, 'Pass `--out` a path that can be written.'),
      ),
    );
});

/**
 * The label a printed page shows in the viewer: the slide number, with the step after a dot when
 * every step is exported (`3.2` is the second step of slide 3).
 *
 * @param target - The slide and step.
 */
export function pageLabel(target: Pick<ExportTarget, 'slide' | 'stepLabel'>): string {
  const slide = String(target.slide.index + 1);
  return target.stepLabel === null ? slide : `${slide}.${target.stepLabel + 1}`;
}

/**
 * The document language: the brand's number locale, which the deck's numbers are written in, or
 * `en-US` when it names none.
 *
 * @param locale - The brand's number locale.
 */
export function documentLanguage(locale: string | undefined): string {
  return locale === undefined || locale.trim() === '' ? DEFAULT_LANGUAGE : locale;
}

/**
 * A blank page in the deck's browser context, closed with the scope.
 *
 * @param raw - The deck page.
 */
const scratchPage = Effect.fn('scratchPage')(function* (
  raw: Page,
): Effect.fn.Return<Page, BrowserError, Scope.Scope> {
  return yield* Effect.acquireRelease(
    Effect.tryPromise({
      try: () => raw.context().newPage(),
      catch: (cause) => browserError('open a blank page', cause),
    }),
    (page) => Effect.promise(() => page.close().catch(() => undefined)),
  );
});

/**
 * Encodes RGB pixels as a JPEG with the browser's encoder.
 *
 * @param page - A blank page.
 * @param pixels - The pixels.
 */
async function encodeJpeg(page: Page, pixels: RgbPixels): Promise<Uint8Array> {
  const base64 = await page.evaluate(jpegInPage, {
    rgb: Buffer.from(pixels.data).toString('base64'),
    width: pixels.width,
    height: pixels.height,
    targetWidth: pixels.targetWidth,
    targetHeight: pixels.targetHeight,
    quality: JPEG_QUALITY,
  });
  return new Uint8Array(Buffer.from(base64, 'base64'));
}

/**
 * Draws RGB pixels on a canvas, scales them to the target size and returns them as a base64 JPEG.
 * Runs in the browser; self-contained.
 *
 * @param args - The pixels as base64, their size, the target size and the quality.
 * @param args.rgb - The pixels.
 * @param args.width - The width.
 * @param args.height - The height.
 * @param args.targetWidth - The JPEG's width.
 * @param args.targetHeight - The JPEG's height.
 * @param args.quality - The JPEG quality, 0 to 1.
 */
function jpegInPage(args: {
  rgb: string;
  width: number;
  height: number;
  targetWidth: number;
  targetHeight: number;
  quality: number;
}): string {
  // The constants are local because this function is serialised into the page.
  const RGB_BYTES_PER_PIXEL = 3;
  const RGBA_BYTES_PER_PIXEL = 4;
  const ALPHA_OFFSET = 3;
  const OPAQUE_ALPHA = 255;
  const rgb = Uint8Array.from(atob(args.rgb), (character) => character.charCodeAt(0));
  const pixels = new ImageData(args.width, args.height);
  for (
    let source = 0, target = 0;
    source < rgb.length;
    source += RGB_BYTES_PER_PIXEL, target += RGBA_BYTES_PER_PIXEL
  ) {
    pixels.data[target] = rgb[source] ?? 0;
    pixels.data[target + 1] = rgb[source + 1] ?? 0;
    pixels.data[target + 2] = rgb[source + 2] ?? 0;
    pixels.data[target + ALPHA_OFFSET] = OPAQUE_ALPHA;
  }

  const source = document.createElement('canvas');
  source.width = args.width;
  source.height = args.height;
  source.getContext('2d')?.putImageData(pixels, 0, 0);
  const canvas = document.createElement('canvas');
  canvas.width = args.targetWidth;
  canvas.height = args.targetHeight;
  const context = canvas.getContext('2d');
  if (context !== null) {
    context.imageSmoothingQuality = 'high';
    context.drawImage(source, 0, 0, args.targetWidth, args.targetHeight);
  }

  const url = canvas.toDataURL('image/jpeg', args.quality);
  return url.slice(url.indexOf(',') + 1);
}

/**
 * Prints the notes pages of each exported slide (one, or more when the notes are long), in a second
 * page of the deck's browser.
 *
 * @param opened - The open deck.
 * @param targets - The slides and steps; each slide gets its notes pages.
 * @param language - The language of the notes.
 */
const printNotes = Effect.fn('printNotes')(function* (
  opened: OpenedDeck,
  targets: readonly ExportTarget[],
  language: string,
): Effect.fn.Return<NotesPage[], CliError | BrowserError, Scope.Scope> {
  const raw = yield* playwrightPage(opened);
  const notesPage = yield* scratchPage(raw);
  const fontStack = opened.brand.tokens.typography.families.body.stack;
  const seen = new Set<number>();
  const result: NotesPage[] = [];
  for (const target of targets) {
    if (seen.has(target.slide.index)) {
      continue;
    }

    seen.add(target.slide.index);
    const printed = yield* printNotesPage(notesPage, {
      slideIndex: target.slide.index,
      title: target.slide.title,
      notes: target.slide.notes,
      fontStack,
      language,
    }).pipe(Effect.mapError((error) => cliError(error.message)));
    result.push(...printed);
  }

  return result;
}, Effect.scoped);
