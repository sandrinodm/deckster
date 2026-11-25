import type { AnyLayoutContract } from '@deckster/engine/layout';
import type { FileSystem, Scope } from 'effect';

import {
  dryRunReport,
  layoutArtCount,
  systemFontsStyle,
  type AssembledPdf,
  type DryRunReport,
  type PptxResult,
} from '@deckster/export';
import { deckCatalog, findDeck } from '@deckster/vite-plugin';
import * as NodeServices from '@effect/platform-node/NodeServices';
import { Effect } from 'effect';
import path from 'node:path';

import type { DeckBrowser } from '#browser/deck-browser.ts';
import type { OpenedDeck } from '#browser/open-deck.ts';
import type { ExportFormat, ExportOptions } from '#export/export-options.ts';
import type { ExportTarget } from '#export/export-targets.ts';
import type { VerifyReport } from '#export/verify-export.ts';
import type { DeckServer } from '#server/deck-server.ts';

import { openDeck } from '#browser/open-deck.ts';
import {
  browserError,
  usageError,
  type BrowserError,
  type CliError,
  type SlideNotReadyError,
} from '#cli-error.ts';
import { assertShotsRender, assertSlidesRender } from '#export/check-slides-render.ts';
import { writeFontFiles } from '#export/export-fonts.ts';
import { exportPdf } from '#export/export-pdf.ts';
import { capturePptx, playwrightPage, writePptx, type PptxCapture } from '#export/export-pptx.ts';
import { exportTargets, hiddenLeftOut, selectSlides } from '#export/export-targets.ts';
import { stageShots } from '#export/stage-shots.ts';
import { verifyExport } from '#export/verify-export.ts';
import { takeShots, type ShotError, type ShotFile } from '#shot/take-shots.ts';
import { Workspace } from '#workspace.ts';

/**
 * The folder exports go to by default, relative to the workspace root.
 */
export const DEFAULT_EXPORT_DIR = path.join('.deck', 'exports');

/**
 * The pixel density decks are opened at for export: pictures of rasterised elements are 2x.
 */
const EXPORT_SCALE = 2;

/**
 * Joins the deck and the brand in the default folder of an export with `--brand`.
 */
const BRAND_SEPARATOR = '@';

/**
 * The formats that are documents rather than pictures, which `--out` can name as a file.
 */
const DOCUMENT_FORMATS: readonly ExportFormat[] = ['pdf', 'pptx'];

/**
 * What an export wrote and found.
 */
export type ExportResult = {
  /**
   * The deck.
   */
  deck: string;

  /**
   * The brand the deck rendered with.
   */
  brand: string;

  /**
   * The output folder.
   */
  outDir: string;

  /**
   * The PDF, if one was written.
   */
  pdf: {
    path: string;
    pages: number;
    outline: string[];
    internalLinks: number;
    externalLinks: number;
  } | null;

  /**
   * The PPTX, if one was written.
   */
  pptx: {
    path: string;
    mode: string;
    masters: string[];
    layouts: string[];
    slides: PptxResult['slides'];
    embeddedFonts: string[];
    fonts: { folder: string; files: string[]; note: string } | null;
  } | null;

  /**
   * The PNG files, if written.
   */
  png: ShotFile[] | null;

  /**
   * The PPTX plan, for `--dry-run` (and every PPTX export).
   */
  dryRun: DryRunReport | null;

  /**
   * The verification, for `--verify`.
   */
  verify: VerifyReport | null;

  /**
   * How many hidden slides were left out because neither `--include-hidden` nor `--slides` asked
   * for them.
   */
  hiddenLeftOut: number;

  /**
   * Things worth knowing, such as videos that stay posters.
   */
  warnings: string[];
};

/**
 * Exports a deck: PDF, PNG and PPTX as asked, the PPTX plan for `--dry-run`, and the fidelity check
 * for `--verify`. The deck is opened once in static mode at 2x for PDF and PPTX; PNGs reuse `deck
 * shot`.
 *
 * @param options - What to export.
 * @returns What was written and found.
 */
export const runExport = Effect.fn('runExport')(function* (options: ExportOptions) {
  const { root } = yield* Workspace;
  const outExtension = path.extname(options.out ?? '').toLowerCase();
  if ((outExtension === '.pdf' || outExtension === '.pptx') && !isFileOut(options)) {
    return yield* usageError(
      `--out ${options.out ?? ''} names a ${outExtension} file, but the export writes ` +
        `${[...options.formats].join(', ')}. ` +
        'Pass a folder for several formats, or one format for a file.',
      'export',
    );
  }

  yield* findDeck(root, options.deck);
  const outDir = path.resolve(root, outputFolder(options));
  const needsPage =
    options.formats.has('pdf') || options.formats.has('pptx') || options.dryRun || options.verify;
  const rendered = needsPage ? yield* Effect.scoped(exportFromPage(options, outDir)) : null;
  const renderedPng =
    options.formats.has('png') && !options.dryRun
      ? yield* exportPng(options, path.join(outDir, 'png'))
      : null;
  const png = renderedPng?.files ?? null;
  return {
    deck: options.deck,
    brand: rendered?.brand ?? options.brand ?? '',
    outDir,
    pdf: rendered?.pdf ?? null,
    pptx: rendered?.pptx ?? null,
    png,
    dryRun: rendered?.dryRun ?? null,
    verify: rendered?.verify ?? null,
    hiddenLeftOut: rendered?.hiddenLeftOut ?? renderedPng?.hiddenLeftOut ?? 0,
    warnings: rendered?.warnings ?? [],
  } satisfies ExportResult;
});

/**
 * The PDF, PPTX, plan and verification, from one open deck.
 *
 * @param options - What to export.
 * @param outDir - The output folder.
 */
const exportFromPage = Effect.fn('exportFromPage')(function* (
  options: ExportOptions,
  outDir: string,
) {
  const opened = yield* openDeck({ deck: options.deck, brand: options.brand, scale: EXPORT_SCALE });
  if (options.fonts === 'system') {
    yield* useSystemFonts(opened);
  }

  const targets = yield* exportTargets(
    opened.page,
    options.slides,
    options.steps,
    options.includeHidden,
  );
  yield* assertSlidesRender(options.deck, opened.page, targets);
  const hiddenSkipped = hiddenLeftOut(opened.page.slides, options.slides, options.includeHidden);
  const base = path.join(outDir, `${options.deck}${options.steps ? '-steps' : ''}`);
  const pdfFile = fileFor(options, 'pdf', base);
  const wantsPdf = options.formats.has('pdf') && !options.dryRun;
  const wantsPptx = options.formats.has('pptx') || options.dryRun || options.verify;
  const { index: catalog } = yield* deckCatalog({
    root: opened.place.workspaceRoot,
    brand: opened.brand,
    deck: opened.deck.location,
    code: 'load',
  });
  const contracts = [...catalog.values()].map((layout) => layout.contract);
  // The PPTX is measured before the PDF is printed, which sets the slides in the static font
  // instances; a PDF alone measures the slides only to know which instances to cut.
  const capture = yield* captureForExport(opened, targets, contracts, options, {
    wantsPdf,
    wantsPptx,
  });
  const dryRun =
    capture === null || !wantsPptx
      ? null
      : dryRunReport(
          options.mode,
          capture.captured.map((entry) => ({
            number: entry.target.slide.index + 1,
            id: entry.target.slide.id,
            layout: entry.target.slide.layout,
            step: entry.target.stepLabel,
            plan: entry.input.plan,
            layoutArt: layoutArtCount(
              entry.input,
              capture.captured.map((other) => other.input),
              opened.brand.tokens,
              options.mode,
            ),
          })),
        );
  if (options.dryRun || capture === null || !wantsPptx) {
    const pdf: AssembledPdf | null = wantsPdf
      ? yield* exportPdf(opened, targets, options.notes, pdfFile, capture?.fontPlan ?? null)
      : null;
    return {
      brand: opened.brand.tokens.name,
      pdf: pdfSummary(pdf, pdfFile),
      pptx: null,
      dryRun: options.dryRun ? dryRun : null,
      verify: null,
      hiddenLeftOut: hiddenSkipped,
      warnings: reportedWarnings(capture, wantsPptx),
    };
  }

  const pptxFile = fileFor(options, 'pptx', base);
  const pptx = yield* writePptx(capture, opened, contracts, options, pptxFile);
  const fonts = yield* writeFontFiles(capture.fontPlan, outDir);
  const pdf: AssembledPdf | null = wantsPdf
    ? yield* exportPdf(opened, targets, options.notes, pdfFile, capture.fontPlan)
    : null;
  const verifyDir = path.join(outDir, options.steps ? 'verify-steps' : 'verify');
  const rendererFonts = rendererFontsOf(capture, fonts?.files ?? []);
  const verifyRun = verifyExport(
    capture,
    opened,
    contracts,
    options,
    pptxFile,
    verifyDir,
    ...(rendererFonts.length === 0 ? [] : [rendererFonts]),
  ).pipe(Effect.provide(NodeServices.layer));
  const verify = options.verify ? yield* verifyRun : null;
  return {
    brand: opened.brand.tokens.name,
    pdf: pdfSummary(pdf, pdfFile),
    pptx: {
      path: pptxFile,
      mode: options.mode,
      masters: pptx.masters,
      layouts: pptx.layouts,
      slides: pptx.slides,
      embeddedFonts: pptx.embeddedFonts,
      fonts: fonts === null ? null : { folder: fonts.folder, files: fonts.files, note: fonts.note },
    },
    dryRun,
    verify,
    hiddenLeftOut: hiddenSkipped,
    warnings: capture.warnings,
  };
});

/**
 * The warnings an export reports. Notes about native PPTX shapes are for a PPTX that is written,
 * planned (`--dry-run`) or verified; a PDF alone only hears about its fonts.
 *
 * @param capture - The capture, or `null` when nothing was measured.
 * @param wantsPptx - Whether a PPTX is written, planned or verified.
 */
export function reportedWarnings(
  capture: Pick<PptxCapture, 'warnings' | 'fontWarnings'> | null,
  wantsPptx: boolean,
): string[] {
  if (capture === null) {
    return [];
  }

  return wantsPptx ? capture.warnings : capture.fontWarnings;
}

/**
 * Captures the slides for the PPTX, or only measures them when the PDF needs the font instances the
 * slides use: the PPTX is measured before the PDF is printed, which sets the slides in the static
 * font instances. Returns `null` when neither needs the slides measured.
 *
 * @param opened - The open deck.
 * @param targets - The slides and steps.
 * @param contracts - The layout contracts.
 * @param options - What to export.
 * @param wants - Whether the PDF and the PPTX (or the dry run or verification) are written.
 */
const captureForExport = Effect.fn('captureForExport')(function* (
  opened: OpenedDeck,
  targets: readonly ExportTarget[],
  contracts: readonly AnyLayoutContract[],
  options: ExportOptions,
  wants: { wantsPdf: boolean; wantsPptx: boolean },
): Effect.fn.Return<
  PptxCapture | null,
  CliError | SlideNotReadyError | BrowserError,
  FileSystem.FileSystem
> {
  // A PDF alone measures the slides only to know which font instances to cut.
  const measureOnly = !wants.wantsPptx && wants.wantsPdf && options.embedFonts;
  if (!wants.wantsPptx && !measureOnly) {
    return null;
  }

  const captureOptions: ExportOptions = measureOnly
    ? { ...options, mode: 'native', embedMedia: false }
    : options;
  return yield* capturePptx(
    opened,
    targets,
    contracts,
    captureOptions,
    wants.wantsPptx && options.verify,
  );
});

/**
 * The font files the verification renderers install: one per cut instance, named by its family.
 *
 * @param capture - The captured deck.
 * @param files - The written font files, in the order of the instances.
 */
function rendererFontsOf(
  capture: PptxCapture,
  files: readonly string[],
): { family: string; file: string }[] {
  return files.map((file, index) => ({
    family: capture.fontPlan.instances[index]?.familyName ?? path.basename(file),
    file,
  }));
}

/**
 * Renders the open deck in each brand family's substitute (`--fonts system`), so it is measured as
 * an app without the brand's fonts lays it out.
 *
 * @param opened - The open deck.
 * @throws CliError in the error channel when the page has no Playwright handle; BrowserError when
 *   the style cannot be added.
 */
const useSystemFonts = Effect.fn('useSystemFonts')(function* (opened: OpenedDeck) {
  const raw = yield* playwrightPage(opened);
  yield* Effect.tryPromise({
    try: async () => {
      await raw.addStyleTag({ content: systemFontsStyle(opened.brand.tokens) });
      await raw.evaluate(() => document.fonts.ready.then(() => undefined));
    },
    catch: (cause) => browserError('set the deck in the substitute fonts', cause),
  });
});

/**
 * Writes PNGs with `deckster shot`: every slide that is not hidden (all with `--include-hidden`),
 * or each selected one. Fails the way a PDF or PPTX export does when a slide shows an error or the
 * page threw while the deck loaded. The PNGs are taken into a staging folder and published only
 * when every slide rendered. A publish failure rolls back the changes to the earlier PNGs.
 *
 * @param options - What to export.
 * @param outDir - The PNG folder.
 * @throws CliError in the error channel when any slide renders an error; nothing is written then.
 */
const exportPng = Effect.fn('exportPng')(function* (
  options: ExportOptions,
  outDir: string,
): Effect.fn.Return<
  { files: ShotFile[]; hiddenLeftOut: number },
  ShotError,
  Workspace | FileSystem.FileSystem | DeckServer | DeckBrowser | Scope.Scope
> {
  return yield* stageShots(outDir, options.slides === undefined, (staging) =>
    shootPng(options, staging),
  );
});

/**
 * Takes the PNGs into a folder and checks that every slide rendered.
 *
 * @param options - What to export.
 * @param outDir - The folder to write to.
 * @throws CliError in the error channel when any slide renders an error.
 */
const shootPng = Effect.fn('shootPng')(function* (
  options: ExportOptions,
  outDir: string,
): Effect.fn.Return<
  { files: ShotFile[]; hiddenLeftOut: number },
  ShotError,
  Workspace | FileSystem.FileSystem | DeckServer | DeckBrowser | Scope.Scope
> {
  const selection = options.slides;
  const result = yield* takeShots({
    deck: options.deck,
    slide: undefined,
    brand: options.brand,
    steps: options.steps,
    outDir,
    scale: options.scale,
    skipHidden: !options.includeHidden,
    ...(selection === undefined
      ? {}
      : { select: (slides) => selectSlides(slides, selection, options.includeHidden) }),
  });
  yield* assertShotsRender(options.deck, [result]);
  return { files: result.files, hiddenLeftOut: result.hiddenSkipped };
});

/**
 * The output folder: `--out` when it names a folder, the folder of `--out` when it names a file,
 * else `.deck/exports/<deck>` (or `<deck>@<brand>`).
 *
 * @param options - What to export.
 */
function outputFolder(options: ExportOptions): string {
  if (options.out !== undefined) {
    return isFileOut(options) ? path.dirname(options.out) : options.out;
  }

  const folder =
    options.brand === undefined
      ? options.deck
      : `${options.deck}${BRAND_SEPARATOR}${options.brand}`;
  return path.join(DEFAULT_EXPORT_DIR, folder);
}

/**
 * Whether `--out` names a file: it ends in `.pdf` or `.pptx` and one of those is exported.
 *
 * @param options - What to export.
 */
function isFileOut(options: ExportOptions): boolean {
  const extension = path
    .extname(options.out ?? '')
    .slice(1)
    .toLowerCase();
  const documents = DOCUMENT_FORMATS.filter((format) => options.formats.has(format));
  return documents.length === 1 && documents[0] === extension && !options.formats.has('png');
}

/**
 * The file a format is written to.
 *
 * @param options - What to export.
 * @param format - `pdf` or `pptx`.
 * @param base - The default path without extension.
 */
function fileFor(options: ExportOptions, format: 'pdf' | 'pptx', base: string): string {
  if (
    options.out !== undefined &&
    isFileOut(options) &&
    path.extname(options.out).slice(1).toLowerCase() === format
  ) {
    return path.join(path.dirname(base), path.basename(options.out));
  }

  return `${base}.${format}`;
}

/**
 * The PDF part of the result.
 *
 * @param pdf - The assembled PDF, if any.
 * @param file - Where it was written.
 */
function pdfSummary(pdf: AssembledPdf | null, file: string): ExportResult['pdf'] {
  if (pdf === null) {
    return null;
  }

  return {
    path: file,
    pages: pdf.pageCount,
    outline: pdf.outline,
    internalLinks: pdf.internalLinks,
    externalLinks: pdf.externalLinks,
  };
}
