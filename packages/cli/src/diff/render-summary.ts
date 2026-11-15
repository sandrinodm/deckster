import type { SlideDiff } from '#diff/diff-types.ts';

import { describePlace, describeSteps, formatRatio, type DiffReport } from '#diff/diff-report.ts';

/**
 * The statuses that appear in the summary table, in the order they are listed.
 */
const LISTED_STATUSES = ['changed', 'added', 'removed', 'moved'] as const;

/**
 * Renders the Markdown summary of a diff for a pull request comment: a heading, a count line and a
 * table of the slides that differ, each with a link to its picture. Picture paths are relative to
 * the report folder, so the file is for reading beside it.
 *
 * @param report - The report with paths relative to the report folder.
 */
export function renderSummary(report: DiffReport): string {
  const target = report.brand === '' ? report.deck : `${report.deck} (${report.brand})`;
  const listed = report.slides.filter((slide) => slide.status !== 'unchanged');
  const lines = [`### Slide changes in ${target}`, ''];
  if (listed.length === 0) {
    lines.push(
      `No slide changed against \`${report.base}\`: ` +
        `${report.counts.unchanged} slides look the same.`,
    );
    return `${lines.join('\n')}\n`;
  }

  lines.push(
    `Compared with \`${report.base}\`: ${countText(report)}.`,
    '',
    '| Slide | Status | Position | Pixels changed | Picture |',
    '| --- | --- | --- | --- | --- |',
    ...LISTED_STATUSES.flatMap((status) =>
      listed.filter((slide) => slide.status === status).map(tableRow),
    ),
  );
  return `${lines.join('\n')}\n`;
}

/**
 * The count line: `2 changed, 1 added, 5 unchanged`.
 *
 * @param report - The report.
 */
function countText(report: DiffReport): string {
  const parts = [...LISTED_STATUSES, 'unchanged' as const]
    .filter((status) => report.counts[status] > 0)
    .map((status) => `${report.counts[status]} ${status}`);
  return parts.join(', ');
}

/**
 * One table row.
 *
 * @param slide - A slide that differs.
 */
function tableRow(slide: SlideDiff): string {
  const steps = describeSteps(slide);
  const status = steps === '' ? slide.status : `${slide.status} (${steps})`;
  const moved = slide.moved && slide.status === 'changed' ? ', moved' : '';
  const ratio = slide.status === 'changed' ? formatRatio(slide.differenceRatio) : '-';
  const cells = [
    `\`${slide.id}\``,
    `${status}${moved}`,
    describePlace(slide),
    ratio,
    picture(slide),
  ];
  return `| ${cells.join(' | ')} |`;
}

/**
 * The picture cell: the side-by-side picture for a changed slide, else the one picture there is.
 *
 * @param slide - A slide that differs.
 */
function picture(slide: SlideDiff): string {
  const file = slide.compare ?? slide.after ?? slide.before;
  return file === null ? '-' : `![${slide.id}](${file})`;
}
