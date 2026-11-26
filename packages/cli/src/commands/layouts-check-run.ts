import { isSafeName, SAFE_NAME_RULE } from '@deckster/brand';
import { deckCommand } from '@deckster/engine/command';
import { Console, Effect } from 'effect';

import type { LayoutsOwner } from '#layouts/layouts-owner.ts';

import { usageError } from '#cli-error.ts';
import { EXIT_FAILED, EXIT_OK, type Command } from '#command.ts';
import { printJson, withJsonErrors } from '#json-output.ts';
import {
  checkLayouts,
  type LayoutCheckProblem,
  type LayoutCheckResult,
  type LayoutsCheckReport,
} from '#layouts/check-layouts.ts';
import { readLayoutsOwner } from '#layouts/layouts-owner.ts';
import { count } from '#lint/format-report.ts';
import { parseCommandArgs } from '#parse-command-args.ts';
import { Workspace } from '#workspace.ts';

/**
 * The indentation of a problem's fix under its first line.
 */
const FIX_INDENT = ' '.repeat(12);

/**
 * Parses the arguments after `layouts check` and checks the layouts; succeeds with the exit code, 1
 * when any layout has an error.
 */
export const run: Command['run'] = (argv): ReturnType<Command['run']> =>
  withJsonErrors(argv, runCheck(argv));

/**
 * Checks a brand's or a deck's code layouts and prints the report.
 *
 * @param argv - The arguments after `layouts check`.
 */
const runCheck = Effect.fn('deck.layouts.check')(function* (argv: readonly string[]) {
  const { root } = yield* Workspace;
  const { values, positionals } = yield* parseCommandArgs('layouts', argv, {
    json: { type: 'boolean', default: false },
    brand: { type: 'string' },
    deck: { type: 'string' },
  });
  const [layout, ...extra] = positionals;
  if (extra.length > 0) {
    return yield* usageError(
      'Name at most one layout, for example `' +
        deckCommand() +
        ' layouts check kpi-wall --brand acme`, or none to check them all.',
      'layouts',
    );
  }

  if (layout !== undefined && !isSafeName(layout)) {
    return yield* usageError(
      `"${layout}" is not a layout name: a layout is named by its folder, in ${SAFE_NAME_RULE}.`,
      'layouts',
    );
  }

  const owner = yield* readLayoutsOwner('check', values);
  const report = yield* checkLayouts({ root, owner, layout });
  if (values.json) {
    yield* printJson(report);
  } else {
    yield* Console.log(formatReport(report, owner));
  }

  return report.ok ? EXIT_OK : EXIT_FAILED;
});

/**
 * The plain-text report: each layout with its cases or its problems and their fixes, then a verdict
 * line.
 *
 * @param report - What the check found.
 * @param owner - The brand or deck checked.
 */
function formatReport(report: LayoutsCheckReport, owner: LayoutsOwner): string {
  if (report.layouts.length === 0 && report.problems.length === 0) {
    return (
      `${report.dir}/ has no code layouts. Add one with \`${deckCommand()} layouts new <name> ` +
      `--${owner.kind} ${owner.name}\`.`
    );
  }

  const lines = [`${report.dir}/ (rendered in the ${report.brand} brand)`];
  lines.push(...report.problems.flatMap((problem) => problemLines(problem, '  ')));
  for (const layout of report.layouts) {
    lines.push(`  ${layoutHeading(layout)}`);
    lines.push(...layout.problems.flatMap((problem) => problemLines(problem, '    ')));
  }

  const all = [...report.problems, ...report.layouts.flatMap((layout) => layout.problems)];
  const errors = all.filter((problem) => problem.severity === 'error').length;
  const warnings = all.filter((problem) => problem.severity === 'warning').length;
  const notes = all.length - errors - warnings;
  const passing = report.layouts.filter((layout) => layout.ok).length;
  const tally = [
    count(errors, 'error'),
    count(warnings, 'warning'),
    ...(notes === 0 ? [] : [count(notes, 'note')]),
  ];
  lines.push(
    `The ${owner.kind} ${owner.name}: ${passing} of ${count(report.layouts.length, 'layout')} ` +
      `pass (${tally.join(', ')}).`,
  );
  return lines.join('\n');
}

/**
 * The line that names a layout: what was rendered when it passed, else how many problems it has.
 *
 * @param layout - One layout's result.
 */
function layoutHeading(layout: LayoutCheckResult): string {
  const rendered = layout.cases.length === 0 ? 'not rendered' : layout.cases.join(', ');
  if (layout.problems.length === 0) {
    return `${layout.name}: ok (${rendered})`;
  }

  const verdict = layout.ok ? 'ok' : 'fails';
  return `${layout.name}: ${verdict}, ${count(layout.problems.length, 'problem')} (${rendered})`;
}

/**
 * A problem as two lines: the severity, the id, where and what, then the fix.
 *
 * @param problem - The problem.
 * @param indent - The indentation.
 */
function problemLines(problem: LayoutCheckProblem, indent: string): string[] {
  const where = [
    problem.case === undefined ? undefined : `case ${problem.case}`,
    problem.slide === undefined ? undefined : `slide ${problem.slide}`,
    problem.step === undefined ? undefined : `step ${problem.step}`,
    problem.selector,
  ].filter((part) => part !== undefined);
  const at = where.length === 0 ? problem.file : `${problem.file}, ${where.join(', ')}`;
  return [
    `${indent}${problem.severity.padEnd('warning'.length)} ${problem.code} (${at}): ` +
      problem.message,
    `${indent}${FIX_INDENT.slice(indent.length)}Fix: ${problem.fix}`,
  ];
}
