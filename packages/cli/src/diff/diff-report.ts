import path from 'node:path';

import type { SlideDiff, StepDiff } from '#diff/diff-types.ts';

/**
 * How many slides ended in each status.
 */
export type DiffCounts = {
  /**
   * Slides whose pictures differ.
   */
  changed: number;

  /**
   * Slides only the current version has.
   */
  added: number;

  /**
   * Slides only the base has.
   */
  removed: number;

  /**
   * Slides with the same pictures in another place in the order.
   */
  moved: number;

  /**
   * Slides that look the same and sit in the same place.
   */
  unchanged: number;
};

/**
 * The result of `deck diff`, as `--json` prints it and `report.json` stores it.
 */
export type DiffReport = {
  /**
   * Always `true`; a failure prints `{ ok: false, error }` instead.
   */
  ok: true;

  /**
   * The deck folder name.
   */
  deck: string;

  /**
   * The brand the deck rendered with.
   */
  brand: string;

  /**
   * What the deck was compared against: the git ref, or the folder of baseline pictures.
   */
  base: string;

  /**
   * `ref` for a git revision, `dir` for a folder of pictures.
   */
  baseKind: 'ref' | 'dir';

  /**
   * Whether steps were compared.
   */
  steps: boolean;

  /**
   * The share of changed pixels above which a picture counts as changed.
   */
  threshold: number;

  /**
   * The report folder: absolute in `--json`, `.` in `report.json`.
   */
  outDir: string;

  /**
   * The number of slides per status.
   */
  counts: DiffCounts;

  /**
   * Every slide: the current ones in order, then removed ones. Picture paths are absolute in
   * `--json` and relative to the report folder in `report.json`, `index.html` and `summary.md`.
   */
  slides: SlideDiff[];
};

/**
 * What a report needs besides the slides.
 */
export type ReportMeta = Pick<
  DiffReport,
  'deck' | 'brand' | 'base' | 'baseKind' | 'steps' | 'threshold' | 'outDir'
>;

/**
 * Counts the slides per status.
 *
 * @param slides - The compared slides.
 */
export function countStatuses(slides: readonly SlideDiff[]): DiffCounts {
  const counts: DiffCounts = { changed: 0, added: 0, removed: 0, moved: 0, unchanged: 0 };
  for (const slide of slides) {
    counts[slide.status] += 1;
  }

  return counts;
}

/**
 * Builds the report of a comparison.
 *
 * @param meta - Which deck, brand and base.
 * @param slides - The compared slides.
 */
export function buildReport(meta: ReportMeta, slides: SlideDiff[]): DiffReport {
  return { ok: true, ...meta, counts: countStatuses(slides), slides };
}

/**
 * Whether anything differs: a slide changed, was added, removed or moved.
 *
 * @param report - The report.
 */
export function hasChanges(report: DiffReport): boolean {
  const { changed, added, removed, moved } = report.counts;
  return changed + added + removed + moved > 0;
}

/**
 * The same report with every picture path relative to the report folder, for files that travel with
 * the folder.
 *
 * @param report - The report with absolute paths.
 */
export function relativeReport(report: DiffReport): DiffReport {
  /**
   * A picture path relative to the report folder, with forward slashes.
   */
  const relative = (file: string | null): string | null =>
    file === null ? null : path.relative(report.outDir, file).split(path.sep).join('/');
  /**
   * A step with its picture paths made relative.
   */
  const step = (entry: StepDiff): StepDiff => ({
    ...entry,
    before: relative(entry.before),
    after: relative(entry.after),
    compare: relative(entry.compare),
  });
  return {
    ...report,
    outDir: '.',
    slides: report.slides.map((slide) => ({
      ...slide,
      before: relative(slide.before),
      after: relative(slide.after),
      compare: relative(slide.compare),
      ...(slide.steps === undefined ? {} : { steps: slide.steps.map(step) }),
    })),
  };
}

/**
 * How many percent one whole ratio is.
 */
const PERCENT_PER_RATIO = 100;

/**
 * A share below this many percent is shown as a bound rather than a number.
 */
const SMALLEST_SHOWN_PERCENT = 0.01;

/**
 * A share from this many percent up shows one decimal; below it, two.
 */
const ONE_DECIMAL_FROM_PERCENT = 1;

/**
 * The share of changed pixels as a percentage with a sensible number of digits.
 *
 * @param ratio - The share from 0 to 1.
 */
export function formatRatio(ratio: number): string {
  const percent = ratio * PERCENT_PER_RATIO;
  if (percent === 0) {
    return '0%';
  }

  if (percent < SMALLEST_SHOWN_PERCENT) {
    return `<${SMALLEST_SHOWN_PERCENT}%`;
  }

  const digits = percent < ONE_DECIMAL_FROM_PERCENT ? 2 : 1;
  return `${percent.toFixed(digits)}%`;
}

/**
 * Where a slide sits, as text: `3`, `3 -> 5` for a moved slide, `was 4` for a removed one.
 *
 * @param slide - The slide.
 */
export function describePlace(slide: SlideDiff): string {
  if (slide.beforeNumber === null) {
    return `new at ${slide.afterNumber}`;
  }

  if (slide.afterNumber === null) {
    return `was ${slide.beforeNumber}`;
  }

  return slide.beforeNumber === slide.afterNumber
    ? String(slide.afterNumber)
    : `${slide.beforeNumber} -> ${slide.afterNumber}`;
}

/**
 * The steps of a slide that differ, such as `steps 1, 3`.
 *
 * @param slide - The slide.
 */
export function describeSteps(slide: SlideDiff): string {
  const differing = (slide.steps ?? []).filter((entry) => entry.status !== 'unchanged');
  if (differing.length === 0 || slide.steps === undefined) {
    return '';
  }

  const labels = differing.map((entry) => `${entry.step}${marker(entry.status)}`);
  return `step${labels.length === 1 ? '' : 's'} ${labels.join(', ')}`;
}

/**
 * A suffix for a step that was added or removed.
 *
 * @param status - The step's status.
 */
function marker(status: StepDiff['status']): string {
  if (status === 'added') {
    return ' (new)';
  }

  return status === 'removed' ? ' (removed)' : '';
}
