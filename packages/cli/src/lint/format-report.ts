import { deckCommand } from '@deckster/engine/command';

import type { LintReport } from '#lint/run-lint.ts';
import type { LintFinding } from '#lint/types.ts';

import { BRAND_RULE_ID, brandName } from '#lint/deck-problems.ts';

/**
 * The widest severity word, so rule ids line up.
 */
const SEVERITY_WIDTH = 7;

/**
 * Formats a report for the terminal, grouped by source file, each finding with its fix. Brand
 * findings sit under the brand file, marked as the brand's, and the summary counts them apart.
 *
 * @param report - The lint result.
 */
export function formatReport(report: LintReport): string {
  const lines: string[] = [];
  for (const [file, findings] of groupByFile(report.findings)) {
    const isBrand = findings.every((finding) => finding.rule === BRAND_RULE_ID);
    lines.push(isBrand ? brandHeading(file) : file);
    for (const finding of findings) {
      lines.push(...formatFinding(finding));
    }

    lines.push('');
  }

  lines.push(formatSummary(report));
  return lines.join('\n');
}

/**
 * The heading of the brand file's findings: they hold for every slide, and the brand check lists
 * them without a deck.
 *
 * @param file - The brand file, such as `brands/acme/brand.ts`.
 */
function brandHeading(file: string): string {
  const name = brandName(file);
  const note = `for every slide; \`${deckCommand()} brand check ${name}\` lists these alone`;
  return `${file} (the brand "${name}", ${note})`;
}

/**
 * The findings grouped by source file, in the order each file first appears.
 *
 * @param findings - Every finding.
 */
function groupByFile(findings: readonly LintFinding[]): Map<string, LintFinding[]> {
  const groups = new Map<string, LintFinding[]>();
  for (const finding of findings) {
    groups.set(finding.file, [...(groups.get(finding.file) ?? []), finding]);
  }

  return groups;
}

/**
 * The two lines of one finding: severity, rule, slide and step with the message, then the fix.
 *
 * @param finding - One finding.
 */
function formatFinding(finding: LintFinding): string[] {
  const location = findingLocation(finding);
  const suffix = location === '' ? '' : ` (${location})`;
  const head = `  ${finding.severity.padEnd(SEVERITY_WIDTH)} ${finding.rule}${suffix}`;
  return [`${head}: ${finding.message}`, `          Fix: ${finding.fix}`];
}

/**
 * The slide and step a finding sits at, such as `intro step 2`; empty when neither is set.
 *
 * @param finding - One finding.
 */
function findingLocation(finding: LintFinding): string {
  const step = finding.step === null ? undefined : `step ${finding.step}`;
  return [finding.slide, step].filter((part) => part !== undefined).join(' ');
}

/**
 * The last line of the report: the counts, and how many slides and steps were checked.
 *
 * @param report - The lint result.
 */
function formatSummary(report: LintReport): string {
  const { errors, warnings, slides, steps } = report.summary;
  if (errors === 0 && warnings === 0) {
    const rendered = `${count(slides, 'slide')} (${count(steps, 'step')} checked)`;
    return `${report.deck}: no problems in ${rendered}.`;
  }

  const counts = `${count(errors, 'error')}, ${count(warnings, 'warning')}`;
  return `${report.deck}: ${counts}${fromBrandNote(report)}${checkedNote(slides, steps)}.`;
}

/**
 * The note that counts the brand's findings apart, or nothing when there are none.
 *
 * @param report - The lint result.
 */
function fromBrandNote(report: LintReport): string {
  const fromBrand = report.findings.filter((finding) => finding.rule === BRAND_RULE_ID).length;
  return fromBrand === 0 ? '' : ` (${fromBrand} from the brand)`;
}

/**
 * The note that says how many slides and steps were checked, or nothing when no slide was rendered.
 *
 * @param slides - The number of slides rendered.
 * @param steps - The number of steps rendered.
 */
function checkedNote(slides: number, steps: number): string {
  if (slides === 0) {
    return '';
  }

  return ` in ${count(slides, 'slide')} (${count(steps, 'step')} checked)`;
}

/**
 * A count with its noun, plural unless the count is one: `1 error`, `2 errors`.
 *
 * @param value - The count.
 * @param noun - The singular noun.
 */
export function count(value: number, noun: string): string {
  return `${value} ${noun}${value === 1 ? '' : 's'}`;
}
