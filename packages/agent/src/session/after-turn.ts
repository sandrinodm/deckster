import { Effect, Result, Schema } from 'effect';

import type { AgentLintFinding, ChangedFile } from '#protocol/agent-events.ts';
import type { FindingRef } from '#providers/provider-types.ts';

import { DeckTools } from '#mcp/deck-tools.ts';

/**
 * The part of a lint report the agent reads; other fields are ignored.
 */
const LintReport = Schema.Struct({
  /**
   * Every finding.
   */
  findings: Schema.Array(
    Schema.Struct({
      slide: Schema.NullOr(Schema.String),
      file: Schema.String,
      step: Schema.NullOr(Schema.Number),
      rule: Schema.String,
      severity: Schema.Literals(['error', 'warning']),
      message: Schema.String,
      fix: Schema.String,
    }),
  ),
});

/**
 * Decodes a lint report.
 */
const decodeReport = Schema.decodeUnknownResult(LintReport);

/**
 * The characters a regular expression reads as syntax; a deck name escapes them before it goes into
 * a pattern.
 */
const REGEXP_SPECIAL_CHARACTERS = /[.*+?^${}()|[\]\\]/g;

/**
 * The lint result of the slides a turn touched, split into what the turn brought and what was there
 * before it.
 */
export type TurnLint = {
  /**
   * The slides linted.
   */
  readonly slides: readonly string[];

  /**
   * The findings the turn brought: not in the baseline.
   */
  readonly findings: readonly AgentLintFinding[];

  /**
   * The findings on the same slides and files that were already there before the turn.
   */
  readonly existing: readonly AgentLintFinding[];

  /**
   * The error count of the new findings.
   */
  readonly errors: number;

  /**
   * The warning count of the new findings.
   */
  readonly warnings: number;
};

/**
 * The slide ids whose files a turn changed: `decks/<deck>/slides/<id>.<ext>`, helpers in sub
 * folders of `slides/` excluded.
 *
 * @param deck - The deck folder name.
 * @param changes - The changed files.
 */
export function touchedSlides(deck: string, changes: readonly ChangedFile[]): string[] {
  const pattern = new RegExp(`^decks/${escapeRegExp(deck)}/slides/([^/]+)\\.(?:mdx|md|tsx|jsx)$`);
  const ids = changes
    .filter((change) => change.kind !== 'delete')
    .map((change) => pattern.exec(change.path)?.[1])
    .filter((id): id is string => id !== undefined);
  return [...new Set(ids)];
}

/**
 * Lints the whole deck once through the deck tools (`DeckTools.deckLint`, the same lint `deck_lint`
 * and `deckster lint` run; the lint service renders the whole deck and cannot lint a subset of
 * slides). A lint that cannot run gives undefined.
 */
export const lintDeckFindings = Effect.fn('lintDeckFindings')(function* (): Effect.fn.Return<
  readonly AgentLintFinding[] | undefined,
  never,
  DeckTools
> {
  const tools = yield* DeckTools;
  const report = yield* tools.deckLint({}).pipe(Effect.option);
  if (report._tag === 'None') {
    return undefined;
  }

  const decoded = decodeReport(report.value);
  return Result.isFailure(decoded) ? undefined : decoded.success.findings;
});

/**
 * The key a finding is matched by against the baseline: where it is and which rule, not the
 * message, whose numbers move when a too-long title gets shorter but not short enough.
 *
 * @param finding - A finding.
 */
function findingKey(finding: AgentLintFinding): string {
  return JSON.stringify([finding.slide, finding.file, finding.rule, finding.severity]);
}

/**
 * Keeps the findings on the slides a turn touched or in the files it changed, and splits them into
 * new ones and ones the baseline already had (counted per key, so a second error of the same rule
 * on the slide is new). Without a baseline every finding counts as new.
 *
 * @param deck - The deck folder name.
 * @param changes - The files the turn changed.
 * @param all - Every finding of the deck after the turn.
 * @param baseline - Every finding of the deck before the turn, when known.
 * @returns The split, or undefined when the turn changed no file of the deck.
 */
export function compareLint(
  deck: string,
  changes: readonly ChangedFile[],
  all: readonly AgentLintFinding[],
  baseline: readonly AgentLintFinding[] | undefined,
): TurnLint | undefined {
  const deckFiles = changes.filter(
    (change) => change.path.startsWith(`decks/${deck}/`) && change.kind !== 'delete',
  );
  if (deckFiles.length === 0) {
    return undefined;
  }

  const slides = touchedSlides(deck, changes);
  const files = new Set(deckFiles.map((change) => change.path));
  /**
   * Whether a finding is on a slide or file the turn touched.
   *
   * @param finding - The finding.
   */
  const inPlay = (finding: AgentLintFinding) =>
    (finding.slide !== null && slides.includes(finding.slide)) || files.has(finding.file);
  const before = new Map<string, number>();
  for (const finding of (baseline ?? []).filter(inPlay)) {
    const key = findingKey(finding);
    before.set(key, (before.get(key) ?? 0) + 1);
  }

  const findings: AgentLintFinding[] = [];
  const existing: AgentLintFinding[] = [];
  for (const finding of all.filter(inPlay)) {
    const key = findingKey(finding);
    const left = before.get(key) ?? 0;
    if (left > 0) {
      before.set(key, left - 1);
      existing.push(finding);
    } else {
      findings.push(finding);
    }
  }

  const errors = findings.filter((finding) => finding.severity === 'error').length;
  return { slides, findings, existing, errors, warnings: findings.length - errors };
}

/**
 * The findings an automatic follow-up turn is asked to fix: the new errors.
 *
 * @param lint - The lint result.
 */
export function findingsToFix(lint: TurnLint): FindingRef[] {
  return lint.findings
    .filter((finding) => finding.severity === 'error')
    .map(({ slide, file, rule, message, fix }) => ({ slide, file, rule, message, fix }));
}

/**
 * A deck name with regular expression characters escaped.
 *
 * @param value - The name.
 */
function escapeRegExp(value: string): string {
  return value.replaceAll(REGEXP_SPECIAL_CHARACTERS, '\\$&');
}
