import type { SlideDiff, StepDiff } from '#diff/diff-types.ts';

import {
  describePlace,
  describeSteps,
  formatRatio,
  type DiffCounts,
  type DiffReport,
} from '#diff/diff-report.ts';
import { escapeHtml } from '#diff/escape-html.ts';
import { REPORT_STYLES } from '#diff/report-styles.ts';

/**
 * The sections of the page, in order, with their headings.
 */
const SECTIONS: readonly { status: keyof DiffCounts; heading: string }[] = [
  { status: 'changed', heading: 'Changed' },
  { status: 'added', heading: 'Added' },
  { status: 'removed', heading: 'Removed' },
  { status: 'moved', heading: 'Moved' },
];

/**
 * Renders the report as one static page: a header with the counts and a card with the pictures of
 * every changed, added and removed slide, then the moved slides. It has no script and its pictures
 * are the relative paths of the report, so it works from a folder, an artifact or a web host.
 *
 * @param report - The report with paths relative to the report folder.
 */
export function renderHtml(report: DiffReport): string {
  const target = report.brand === '' ? report.deck : `${report.deck} (${report.brand})`;
  const title = `Slide changes: ${target}`;
  const sections = SECTIONS.flatMap(({ status, heading }) => {
    const slides = report.slides.filter((slide) => slide.status === status);
    return slides.length === 0 ? [] : [section(heading, slides)];
  });
  const stepsNote = report.steps ? ', every step' : '';
  const content =
    sections.length === 0 ? '<p class="empty">No slide changed.</p>' : sections.join('\n');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${REPORT_STYLES}</style>
</head>
<body>
<main>
<h1>${escapeHtml(title)}</h1>
<p class="meta">Compared with <code>${escapeHtml(report.base)}</code>${stepsNote}.</p>
${countList(report.counts)}
${content}
</main>
</body>
</html>
`;
}

/**
 * The pills with the count per status.
 *
 * @param counts - The counts.
 */
function countList(counts: DiffCounts): string {
  const items = [...SECTIONS.map((section) => section.status), 'unchanged' as const].map(
    (status) => `<li>${counts[status]} ${status}</li>`,
  );
  return `<ul class="counts">${items.join('')}</ul>`;
}

/**
 * One section of cards.
 *
 * @param heading - The section heading.
 * @param slides - The slides in it.
 */
function section(heading: string, slides: readonly SlideDiff[]): string {
  const cards = slides.map(card).join('\n');
  return `<section>\n<h2>${escapeHtml(heading)} (${slides.length})</h2>\n${cards}\n</section>`;
}

/**
 * One slide's card: its header, then its pictures, per changed step when the run compared steps.
 *
 * @param slide - A slide that differs.
 */
function card(slide: SlideDiff): string {
  const ratioNote =
    slide.status === 'changed' ? ` &middot; ${formatRatio(slide.differenceRatio)} of pixels` : '';
  const steps = describeSteps(slide);
  const stepsNote = steps === '' ? '' : ` &middot; ${escapeHtml(steps)}`;
  const place = `slide ${escapeHtml(describePlace(slide))}${ratioNote}${stepsNote}`;
  const tag = `<span class="tag">${slide.status}</span>`;
  const title = `<h3>${escapeHtml(slide.id)}</h3>`;
  const header = `<header>${tag}${title}<span class="meta">${place}</span></header>`;
  const changedSteps = (slide.steps ?? []).filter((step) => step.status !== 'unchanged');
  const pictures =
    slide.steps !== undefined && changedSteps.length > 0
      ? changedSteps.map((step) => stepBlock(slide.id, step)).join('\n')
      : pictureBlock(slide.id, slide.compare, slide.after, slide.before);
  return `<article class="card ${slide.status}">\n${header}\n${pictures}\n</article>`;
}

/**
 * The pictures of one step.
 *
 * @param id - The slide id.
 * @param step - A step that differs.
 */
function stepBlock(id: string, step: StepDiff): string {
  const label = `Step ${step.step}${step.status === 'changed' ? '' : ` (${step.status})`}`;
  const pictures = pictureBlock(id, step.compare, step.after, step.before);
  return `<div class="step"><h4>${escapeHtml(label)}</h4>${pictures}</div>`;
}

/**
 * The picture of a slide or step: the side-by-side one when it exists, else the one picture there
 * is, with links to the before and after pictures.
 *
 * @param id - The slide id, for alternative text.
 * @param compare - The side-by-side picture.
 * @param after - The current picture.
 * @param before - The base picture.
 */
function pictureBlock(
  id: string,
  compare: string | null,
  after: string | null,
  before: string | null,
): string {
  const shown = compare ?? after ?? before;
  if (shown === null) {
    return '';
  }

  const links = [
    before === null ? '' : `<a href="${escapeHtml(before)}">before</a>`,
    after === null ? '' : `<a href="${escapeHtml(after)}">after</a>`,
  ].filter((link) => link !== '');
  const alt = compare === null ? `Slide ${id}` : `Slide ${id}: before, after and difference`;
  const source = escapeHtml(shown);
  const image = `<img src="${source}" alt="${escapeHtml(alt)}" loading="lazy">`;
  const caption = links.length === 0 ? '' : `\n<p class="links">${links.join(' &middot; ')}</p>`;
  return `<a href="${source}">${image}</a>${caption}`;
}
