import type { AnyLayoutContract } from '@deckster/engine/layout';
import type { ChildProcessSpawner } from 'effect/process';

import {
  attributeOverlaps,
  compareImages,
  detectRenderers,
  dockerStatus,
  drawComparison,
  fontFilesIn,
  formatVerdict,
  judgeRegion,
  slideRegions,
  validateOoxml,
  worstRegions,
  type OoxmlValidation,
  type Renderer,
  type RegionVerdict,
  type RendererFont,
  type RendererId,
  type VerifyRegion,
} from '@deckster/export';
import { Effect, FileSystem, type Scope } from 'effect';
import path from 'node:path';

import type { OpenedDeck } from '#browser/open-deck.ts';
import type { ExportOptions } from '#export/export-options.ts';
import type { PptxCapture } from '#export/export-pptx.ts';
import type { ExportTarget } from '#export/export-targets.ts';

import {
  browserError,
  cliError,
  fileSystemError,
  type BrowserError,
  type CliError,
  type FileSystemError,
} from '#cli-error.ts';
import { buildDeckPptx, playwrightPage } from '#export/export-pptx.ts';

/**
 * Matches a Fontsource file name for the Latin subset, the one renderers need.
 */
const LATIN_FACE_PATTERN = /-latin-(?!ext)/;

/**
 * Decimal places in reported scores.
 */
const SCORE_DIGITS = 4;

/**
 * Failed regions outlined and cropped per slide and renderer.
 */
const MARKED_REGIONS = 6;

/**
 * Failed regions printed per slide, across renderers.
 */
const PRINTED_REGIONS = 3;

/**
 * The page the comparisons draw in, as the comparison functions take it.
 */
type ComparisonPage = Parameters<typeof compareImages>[0];

/**
 * One renderer's result for one slide.
 */
export type SlideRender = {
  /**
   * Whole-slide similarity to the web slide, from 0 to 1 (1 is identical); a coarse number, the
   * regions say what differs.
   */
  score: number;

  /**
   * The share of visibly changed pixels, from 0 to 1.
   */
  changed: number;

  /**
   * The side-by-side picture: web, render, difference, failed regions outlined.
   */
  sideBySide: string;

  /**
   * Every compared region with its verdict, in paint order.
   */
  regions: RegionVerdict[];

  /**
   * How many regions failed.
   */
  failed: number;

  /**
   * Crops of the worst failed regions: the web region above the render's.
   */
  crops: string[];
};

/**
 * One exported slide's verification.
 */
export type VerifiedSlide = {
  /**
   * The exported slide's 1-based number.
   */
  number: number;

  /**
   * The slide id.
   */
  id: string;

  /**
   * The step, or `null`.
   */
  step: number | null;

  /**
   * The web screenshot, or `null` when none was taken.
   */
  web: string | null;

  /**
   * The regions compared, as the web drew them.
   */
  regions: VerifyRegion[];

  /**
   * Results by renderer; `null` where the renderer produced no picture.
   */
  renders: Partial<Record<RendererId, SlideRender | null>>;
};

/**
 * Counts of regions, overall and per renderer.
 */
export type RegionTotals = {
  /**
   * Regions compared (blank ones left out).
   */
  checked: number;

  /**
   * Regions with at least one problem.
   */
  failed: number;
};

/**
 * What `deckster export --verify` found.
 */
export type VerifyReport = {
  /**
   * The folder with the pictures and `report.json`.
   */
  outDir: string;

  /**
   * The renderers that ran, with what they are and which fonts they had.
   */
  renderers: { id: RendererId; label: string }[];

  /**
   * Renderers that were asked for but could not run, with why.
   */
  unavailable: { id: RendererId; why: string }[];

  /**
   * Renderers that ran and failed, with why.
   */
  failed: { id: RendererId; why: string }[];

  /**
   * Per renderer that ran, the numbers of the slides it produced no picture for. Any entry fails
   * the verification: a slide nobody rendered was not checked.
   */
  unrendered: { id: RendererId; slides: number[] }[];

  /**
   * The schema validation, or why it could not run.
   */
  validation: OoxmlValidation | { error: string };

  /**
   * Per-slide results.
   */
  slides: VerifiedSlide[];

  /**
   * Counts of regions over every renderer.
   */
  regions: RegionTotals;

  /**
   * Counts of regions by renderer.
   */
  byRenderer: Partial<Record<RendererId, RegionTotals>>;

  /**
   * Whether the file is valid, at least one renderer produced pictures, every renderer rendered
   * every slide and no region failed: what `--verify --strict` requires.
   */
  ok: boolean;

  /**
   * What was written besides `report.json`.
   */
  written: {
    /**
     * Side-by-side pictures.
     */
    sideBySide: number;

    /**
     * Crops of regions.
     */
    crops: number;
  };
};

/**
 * What the renderers read and where their results go.
 */
type RenderPass = {
  /**
   * The captured slides, with web screenshots.
   */
  capture: PptxCapture;

  /**
   * The renderers that ran.
   */
  renderers: readonly Renderer[];

  /**
   * The exported PPTX.
   */
  pptx: string;

  /**
   * The single-slide PPTX of each slide, in slide order.
   */
  singles: readonly string[];

  /**
   * The base name of each slide's pictures, in slide order.
   */
  names: readonly string[];

  /**
   * The verification folder.
   */
  outDir: string;

  /**
   * The fonts the renderers report and install.
   */
  fonts: readonly RendererFont[];

  /**
   * The comparison page.
   */
  blank: ComparisonPage;

  /**
   * The slides, whose renders are filled in.
   */
  slides: VerifiedSlide[];
};

/**
 * Checks an exported PPTX: validates it against the Office Open XML schemas with the Open XML SDK,
 * renders it back to pictures with each available renderer, and compares every slide with its web
 * screenshot region by region (each text block, chart, diagram, picture and table), writing
 * side-by-side pictures with the failed regions outlined, crops of them, and `report.json`.
 *
 * @param capture - The captured slides, with web screenshots.
 * @param opened - The open deck.
 * @param contracts - The layout contracts.
 * @param options - The export options.
 * @param pptx - The exported PPTX.
 * @param outDir - Where to write the pictures and the report.
 * @param fonts - The fonts the `libreoffice` pass installs; by default the static instances in the
 *   export's `fonts` folder (next to `outDir`), else the brand's Latin faces.
 * @returns The report.
 * @throws FileSystemError in the error channel when files cannot be written; BrowserError when the
 *   comparison page fails.
 */
export const verifyExport = Effect.fn('verifyExport')(function* (
  capture: PptxCapture,
  opened: OpenedDeck,
  contracts: readonly AnyLayoutContract[],
  options: ExportOptions,
  pptx: string,
  outDir: string,
  fonts?: readonly RendererFont[],
): Effect.fn.Return<
  VerifyReport,
  FileSystemError | BrowserError | CliError,
  FileSystem.FileSystem | ChildProcessSpawner.ChildProcessSpawner | Scope.Scope
> {
  const fs = yield* FileSystem.FileSystem;
  yield* fs.remove(path.join(outDir, 'regions'), { recursive: true }).pipe(Effect.ignore);
  for (const folder of ['web', 'singles', 'compare', 'regions']) {
    yield* fs.makeDirectory(path.join(outDir, folder), { recursive: true }).pipe(Effect.ignore);
  }

  const names = capture.captured.map((entry, index) => pictureName(index, entry.target));
  const singles = yield* writeTargets(capture, opened, contracts, options, outDir, names);

  const docker = yield* dockerStatus();
  const validation =
    docker.kind === 'ready'
      ? yield* validateOoxml(pptx).pipe(
          Effect.catch((error) => Effect.succeed({ error: error.message })),
        )
      : { error: docker.why };
  const installed = fonts ?? (yield* fontFilesIn(path.join(path.dirname(outDir), 'fonts'))).slice();
  const rendererFonts = installed.length > 0 ? installed : brandFonts(opened);
  const families = [
    ...Object.values(opened.brand.tokens.typography.families).map((family) => family.family),
    ...installed.map((font) => font.family),
  ];
  const { renderers, unavailable } = yield* detectRenderers(options.renderers, {
    fonts: rendererFonts,
    families,
  });
  const raw = yield* playwrightPage(opened);
  const blank = yield* Effect.acquireRelease(
    Effect.tryPromise({
      try: () => raw.context().newPage(),
      catch: (cause) => browserError('open a comparison page', cause),
    }),
    (page) => Effect.promise(() => page.close().catch(() => undefined)),
  );
  const slides: VerifiedSlide[] = capture.captured.map((entry, index) => ({
    number: index + 1,
    id: entry.target.slide.id,
    step: entry.target.stepLabel,
    web: entry.webShot === null ? null : path.join(outDir, 'web', `${names[index] ?? index}.png`),
    regions: slideRegions(entry.input.scene, entry.input.plan),
    renders: {},
  }));
  const { failed, written } = yield* renderAndCompare({
    capture,
    renderers,
    pptx,
    singles,
    names,
    outDir,
    fonts: rendererFonts,
    blank,
    slides,
  });

  const byRenderer = regionTotals(slides);
  const totals = Object.values(byRenderer).reduce(
    (sum, entry) => ({ checked: sum.checked + entry.checked, failed: sum.failed + entry.failed }),
    { checked: 0, failed: 0 },
  );
  const unrendered = unrenderedSlides(
    slides,
    renderers.map((renderer) => renderer.id),
  );
  const report: VerifyReport = {
    outDir,
    renderers: renderers.map((renderer) => ({ id: renderer.id, label: renderer.label })),
    unavailable,
    failed,
    unrendered,
    validation,
    slides,
    regions: totals,
    byRenderer,
    ok:
      'ok' in validation &&
      validation.ok &&
      written.sideBySide > 0 &&
      unrendered.length === 0 &&
      totals.failed === 0,
    written,
  };
  yield* writeVerifyFile(path.join(outDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  return report;
});

/**
 * The base name of a slide's pictures: its 1-based number, its id and its step when it has one.
 *
 * @param index - The slide's index in the capture.
 * @param target - The exported target.
 */
function pictureName(index: number, target: ExportTarget): string {
  const step = target.stepLabel === null ? '' : `.step${target.stepLabel}`;
  return `${String(index + 1).padStart(2, '0')}-${target.slide.id}${step}`;
}

/**
 * Writes a file of the verification, failing with the path.
 *
 * @param file - The file.
 * @param data - Its text or bytes.
 * @throws FileSystemError in the error channel when the file cannot be written.
 */
const writeVerifyFile = Effect.fn('writeVerifyFile')(function* (
  file: string,
  data: Uint8Array | string,
): Effect.fn.Return<void, FileSystemError, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  const written =
    typeof data === 'string' ? fs.writeFileString(file, data) : fs.writeFile(file, data);
  yield* written.pipe(
    Effect.mapError((error) =>
      fileSystemError('write', file, error, 'Pass `--out` a folder that can be written.'),
    ),
  );
});

/**
 * Writes each slide's web screenshot and the single-slide PPTX the renderers read.
 *
 * @param capture - The captured slides.
 * @param opened - The open deck.
 * @param contracts - The layout contracts.
 * @param options - The export options.
 * @param outDir - The verification folder.
 * @param names - The base name of each slide's pictures.
 * @returns The single-slide PPTX paths, in slide order.
 */
const writeTargets = Effect.fn('writeTargets')(function* (
  capture: PptxCapture,
  opened: OpenedDeck,
  contracts: readonly AnyLayoutContract[],
  options: ExportOptions,
  outDir: string,
  names: readonly string[],
): Effect.fn.Return<string[], FileSystemError | CliError, FileSystem.FileSystem> {
  const singles: string[] = [];
  for (const [index, entry] of capture.captured.entries()) {
    const name = names[index] ?? String(index);
    if (entry.webShot !== null) {
      yield* writeVerifyFile(path.join(outDir, 'web', `${name}.png`), entry.webShot);
    }

    const single = path.join(outDir, 'singles', `${name}.pptx`);
    // Renderers skip a hidden slide, as a slide show does; the picture to compare is the slide's.
    const built = yield* buildDeckPptx(capture, opened, contracts, options, [
      { ...entry.input, hidden: false },
    ]);
    yield* writeVerifyFile(single, built.bytes);
    singles.push(single);
  }

  return singles;
});

/**
 * Renders the PPTX with each renderer and compares every slide's render with its web screenshot,
 * filling in the slides' renders and writing their pictures.
 *
 * @param pass - What the renderers read and where the results go.
 * @returns The renderers that failed, with why, and what was written.
 */
const renderAndCompare = Effect.fn('renderAndCompare')(function* (
  pass: RenderPass,
): Effect.fn.Return<
  { failed: { id: RendererId; why: string }[]; written: { sideBySide: number; crops: number } },
  FileSystemError | BrowserError | CliError,
  FileSystem.FileSystem | ChildProcessSpawner.ChildProcessSpawner | Scope.Scope
> {
  const failed: { id: RendererId; why: string }[] = [];
  const written = { sideBySide: 0, crops: 0 };
  for (const renderer of pass.renderers) {
    const rendered = yield* renderer
      .render({ deck: pass.pptx, singles: pass.singles, workDir: pass.outDir, fonts: pass.fonts })
      .pipe(
        Effect.map((result) => result.pages),
        Effect.catch((error) => {
          failed.push({ id: renderer.id, why: error.message });
          return Effect.succeed(null);
        }),
      );
    if (rendered === null) {
      continue;
    }

    for (const [index, entry] of pass.capture.captured.entries()) {
      const slide = pass.slides[index];
      const page = rendered[index] ?? null;
      if (slide === undefined || entry.webShot === null) {
        continue;
      }

      const name = `${pass.names[index] ?? index}.${renderer.id}`;
      if (page === null) {
        slide.renders[renderer.id] = null;
        continue;
      }

      const result = yield* checkSlide(
        pass.blank,
        entry.webShot,
        page,
        renderer.id,
        slide.regions,
        {
          outDir: pass.outDir,
          name,
        },
      );
      for (const [crop, data] of result.cropData.entries()) {
        yield* writeVerifyFile(crop, data);
      }

      yield* writeVerifyFile(result.sideBySide, result.picture);
      written.sideBySide += 1;
      written.crops += result.crops.length;
      slide.renders[renderer.id] = withoutPictures(result);
    }
  }

  return { failed, written };
});

/**
 * A slide render with the pictures still to write.
 */
type CheckedSlide = SlideRender & {
  /**
   * The side-by-side PNG.
   */
  picture: Uint8Array;

  /**
   * The crop PNGs by path.
   */
  cropData: Map<string, Uint8Array>;
};

/**
 * Compares one rendered slide with its web screenshot region by region and draws the side-by-side
 * picture with the worst failed regions outlined and cropped.
 *
 * @param blank - The comparison page.
 * @param web - The web screenshot.
 * @param rendered - The rendered slide's file.
 * @param renderer - The renderer.
 * @param regions - The slide's regions.
 * @param files - Where pictures go.
 * @param files.outDir - The verification folder.
 * @param files.name - The base name, such as `03-problem.libreoffice`.
 */
const checkSlide = Effect.fn('checkSlide')(function* (
  blank: ComparisonPage,
  web: Uint8Array,
  rendered: string,
  renderer: RendererId,
  regions: readonly VerifyRegion[],
  files: { outDir: string; name: string },
): Effect.fn.Return<CheckedSlide, FileSystemError | CliError, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  const picture = yield* fs
    .readFile(rendered)
    .pipe(
      Effect.mapError((error) =>
        fileSystemError('read', rendered, error, 'Run the command again.'),
      ),
    );
  const comparison = yield* compareImages(blank, web, picture, regions).pipe(
    Effect.mapError((error) => cliError(error.message)),
  );
  const verdicts = judgeAll(regions, comparison.regions);
  const marked = worstRegions(verdicts, MARKED_REGIONS);
  const pictures = yield* drawComparison(
    blank,
    web,
    picture,
    ['web (Chromium)', renderer],
    marked.map((verdict, index) => ({
      rect: verdict.rect,
      offset: verdict.offset,
      tag: String(index + 1),
    })),
  ).pipe(Effect.mapError((error) => cliError(error.message)));
  const cropData = new Map<string, Uint8Array>();
  pictures.crops.forEach((crop, index) => {
    cropData.set(path.join(files.outDir, 'regions', `${files.name}.${index + 1}.png`), crop);
  });
  return {
    score: Number(comparison.score.toFixed(SCORE_DIGITS)),
    changed: Number(comparison.changedShare.toFixed(SCORE_DIGITS)),
    sideBySide: path.join(files.outDir, 'compare', `${files.name}.png`),
    regions: verdicts,
    failed: verdicts.filter((verdict) => verdict.problems.length > 0).length,
    crops: [...cropData.keys()],
    picture: pictures.sideBySide,
    cropData,
  };
});

/**
 * The verdicts of a slide's regions, blank ones (nothing drawn in the web) left out, with growth
 * into the block below blamed on the block that grew.
 *
 * @param regions - The regions.
 * @param measurements - Their measurements, by id.
 */
export function judgeAll(
  regions: readonly VerifyRegion[],
  measurements: readonly Parameters<typeof judgeRegion>[1][],
): RegionVerdict[] {
  const byId = new Map(measurements.map((measurement) => [measurement.id, measurement]));
  const verdicts = regions.flatMap((region) => {
    const measurement = byId.get(region.id);
    return measurement === undefined || measurement.blank ? [] : [judgeRegion(region, measurement)];
  });
  return attributeOverlaps(regions, verdicts);
}

/**
 * A slide render as the report keeps it, without picture bytes.
 *
 * @param checked - The checked slide.
 */
function withoutPictures(checked: CheckedSlide): SlideRender {
  return {
    score: checked.score,
    changed: checked.changed,
    sideBySide: checked.sideBySide,
    regions: checked.regions,
    failed: checked.failed,
    crops: checked.crops,
  };
}

/**
 * Counts of regions per renderer, from each slide's renders that were produced.
 *
 * @param slides - The verified slides.
 */
export function regionTotals(
  slides: readonly Pick<VerifiedSlide, 'renders'>[],
): Partial<Record<RendererId, RegionTotals>> {
  const totals: Partial<Record<RendererId, RegionTotals>> = {};
  for (const slide of slides) {
    for (const [id, render] of Object.entries(slide.renders) as [
      RendererId,
      SlideRender | null,
    ][]) {
      if (render === null) {
        continue;
      }

      const entry = totals[id] ?? { checked: 0, failed: 0 };
      entry.checked += render.regions.length;
      entry.failed += render.failed;
      totals[id] = entry;
    }
  }

  return totals;
}

/**
 * The slides each renderer was expected to render and did not. A slide is expected when it has a
 * web screenshot to compare with; a renderer that failed outright misses all of them.
 *
 * @param slides - The verified slides.
 * @param renderers - The renderers that ran.
 * @returns One entry per renderer that missed slides, with their numbers.
 */
export function unrenderedSlides(
  slides: readonly Pick<VerifiedSlide, 'number' | 'web' | 'renders'>[],
  renderers: readonly RendererId[],
): { id: RendererId; slides: number[] }[] {
  return renderers.flatMap((id) => {
    const missing = slides
      .filter((slide) => slide.web !== null && (slide.renders[id] ?? null) === null)
      .map((slide) => slide.number);
    return missing.length === 0 ? [] : [{ id, slides: missing }];
  });
}

/**
 * The brand's font files for renderers that can install fonts, when the export wrote no static
 * instances: the Latin subset of each face.
 *
 * @param opened - The open deck.
 */
function brandFonts(opened: OpenedDeck): RendererFont[] {
  const faces = opened.brand.fontFaces.filter(
    (face) => LATIN_FACE_PATTERN.test(face.url) || face.unicodeRange === undefined,
  );
  const seen = new Set<string>();
  return faces.flatMap((face) => {
    const key = `${face.family}|${face.style}|${String(face.weight)}`;
    if (seen.has(key)) {
      return [];
    }

    seen.add(key);
    return [{ family: face.family, file: face.url }];
  });
}

/**
 * One line of the verification summary, for standard output or standard error.
 */
export type VerifyLine = {
  /**
   * The text.
   */
  text: string;

  /**
   * Whether it goes to standard error.
   */
  error: boolean;
};

/**
 * The verification as lines for the terminal: the validator's verdict, the renderers and the fonts
 * each had, per slide the worst failed regions across renderers (not a mean), what could not run,
 * and what was written.
 *
 * @param verify - The report.
 * @returns The lines, in order.
 */
export function formatVerify(verify: VerifyReport): VerifyLine[] {
  const lines: VerifyLine[] = [];
  /**
   * Adds a line.
   */
  const out = (text: string, error = false): void => {
    lines.push({ text, error });
  };
  const { validation } = verify;
  if ('error' in validation) {
    out(`OOXML validation did not run: ${validation.error}`, true);
  } else {
    const verdict = validation.ok ? 'valid' : `${validation.errors.length} error(s)`;
    out(`${validation.validator}: ${verdict}`);
    for (const error of validation.errors) {
      out(`  ${error.part ?? ''} ${error.path ?? ''}: ${error.description}`);
    }
  }

  for (const renderer of verify.renderers) {
    const totals = verify.byRenderer[renderer.id];
    const counts =
      totals === undefined ? 'no pictures' : `${totals.failed} of ${totals.checked} regions differ`;
    out(`${renderer.id}: ${counts} (${renderer.label})`);
  }

  for (const missing of [...verify.unavailable, ...verify.failed]) {
    out(`${missing.id}: not used, ${missing.why}`, true);
  }

  for (const missing of verify.unrendered) {
    const numbers = missing.slides.join(', ');
    const noun = missing.slides.length === 1 ? 'slide' : 'slides';
    out(`${missing.id}: no picture for ${noun} ${numbers}, so verification fails`, true);
  }

  if (verify.written.sideBySide > 0) {
    out(`Regions: ${verify.regions.failed} of ${verify.regions.checked} differ`);
    for (const slide of verify.slides) {
      const number = String(slide.number).padStart(2, '0');
      const verdicts = Object.entries(slide.renders).flatMap(([id, render]) =>
        render === null || render === undefined
          ? []
          : render.regions.map((verdict) => ({ ...verdict, renderer: id })),
      );
      const worst = worstRegions(verdicts, PRINTED_REGIONS);
      if (worst.length === 0) {
        out(`  ${number} ${slide.id}: ok`);
        continue;
      }

      const total = verdicts.filter((verdict) => verdict.problems.length > 0).length;
      out(`  ${number} ${slide.id}: ${total} region(s) differ`);
      for (const verdict of worst) {
        out(`     ${formatVerdict(verdict)} (${verdict.renderer})`);
      }
    }

    const crops = verify.written.crops > 0 ? `, ${verify.written.crops} region crop(s)` : '';
    out(
      `Wrote ${verify.written.sideBySide} side-by-side picture(s)${crops} ` +
        `and report.json to ${verify.outDir}`,
    );
  } else {
    out(`No renderer produced pictures; wrote report.json to ${verify.outDir}`, true);
  }

  return lines;
}
