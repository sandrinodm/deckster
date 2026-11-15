import type { ExportMode, PlanNote, ScenePlan } from '#plan/plan-scene.ts';

/**
 * The width, in characters, the slide number is padded with zeros to.
 */
const SLIDE_NUMBER_WIDTH = 2;

/**
 * The width, in characters, the outcome column of a finding is padded to.
 */
const OUTCOME_WIDTH = 10;

/**
 * The width, in characters, the kind column of a finding is padded to.
 */
const WHAT_WIDTH = 6;

/**
 * The indentation, in spaces, of each finding under its slide.
 */
const FINDING_INDENT = '   ';

/**
 * One slide in the dry-run report.
 */
export type DryRunSlide = {
  /**
   * The 1-based slide number.
   */
  number: number;

  /**
   * The slide id.
   */
  id: string;

  /**
   * The layout.
   */
  layout: string;

  /**
   * The step, or `null` for the finished slide.
   */
  step: number | null;

  /**
   * Counts by outcome.
   */
  counts: Record<PlanNote['outcome'], number>;

  /**
   * Every element that is a picture, simplified or dropped, with why.
   */
  findings: PlanNote[];
};

/**
 * What `deck export --dry-run` reports: per slide, what will be native and what will be rasterised,
 * simplified or dropped, and why.
 */
export type DryRunReport = {
  /**
   * The export mode the plan is for.
   */
  mode: ExportMode;

  /**
   * The slides.
   */
  slides: DryRunSlide[];

  /**
   * Totals over every slide, by outcome.
   */
  totals: Record<PlanNote['outcome'], number>;
};

/**
 * One planned slide, as the report reads it.
 */
export type PlannedSlide = {
  /**
   * The 1-based slide number.
   */
  number: number;

  /**
   * The slide id.
   */
  id: string;

  /**
   * The layout.
   */
  layout: string;

  /**
   * The step, or `null`.
   */
  step: number | null;

  /**
   * The plan.
   */
  plan: ScenePlan;
};

/**
 * Builds the dry-run report from the plans of the slides that would be exported.
 *
 * @param mode - The export mode.
 * @param slides - The planned slides, in order.
 */
export function dryRunReport(mode: ExportMode, slides: readonly PlannedSlide[]): DryRunReport {
  const totals = emptyCounts();
  const reported = slides.map((slide): DryRunSlide => {
    const counts = emptyCounts();
    for (const note of slide.plan.notes) {
      counts[note.outcome] += 1;
      totals[note.outcome] += 1;
    }

    return {
      number: slide.number,
      id: slide.id,
      layout: slide.layout,
      step: slide.step,
      counts,
      findings: slide.plan.notes.filter((note) => note.outcome !== 'native'),
    };
  });
  return { mode, slides: reported, totals };
}

/**
 * The report as text: one line per slide with its counts, then one indented line per finding.
 *
 * @param report - The report.
 */
export function formatDryRun(report: DryRunReport): string {
  const lines = [`PPTX dry run (${report.mode} mode): native / picture / simplified / dropped`];
  for (const slide of report.slides) {
    const step = slide.step === null ? '' : ` step ${slide.step}`;
    const { native, picture, simplified, dropped } = slide.counts;
    const number = String(slide.number).padStart(SLIDE_NUMBER_WIDTH, '0');
    const counts = `${native} / ${picture} / ${simplified} / ${dropped}`;
    lines.push(`${number} ${slide.id}${step} [${slide.layout}]: ${counts}`);
    for (const finding of slide.findings) {
      const outcome = finding.outcome.padEnd(OUTCOME_WIDTH);
      const what = finding.what.padEnd(WHAT_WIDTH);
      const where = finding.selector || '(slide)';
      lines.push(`${FINDING_INDENT}${outcome} ${what} ${where}: ${finding.why}`);
    }
  }

  const { native, picture, simplified, dropped } = report.totals;
  lines.push(
    `Total: ${native} native, ${picture} picture, ${simplified} simplified, ${dropped} dropped.`,
  );
  return lines.join('\n');
}

/**
 * Zero counts for every outcome.
 */
function emptyCounts(): Record<PlanNote['outcome'], number> {
  return { native: 0, picture: 0, simplified: 0, dropped: 0 };
}
