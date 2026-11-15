import { useState, type ReactNode } from 'react';

import type {
  AgentLintFinding,
  AgentProblem,
  ChangedFile,
  TurnDiffFile,
} from '#protocol/agent-events.ts';
import type {
  DiffView,
  RevertedView,
  TurnLint,
  TurnUsage,
  TurnView,
} from '#runtime/agent-store.ts';

import { DiffHunks } from '#runtime/diff-view.tsx';
import { Icon } from '#runtime/icons.tsx';
import { InlineText } from '#runtime/rich-text.tsx';
import { ProblemCard } from '#runtime/status.tsx';
import { shortPath } from '#runtime/tool-label.ts';

/**
 * Milliseconds in a second.
 */
const MS_PER_SECOND = 1000;

/**
 * Seconds in a minute.
 */
const SECONDS_PER_MINUTE = 60;

/**
 * Tokens in a "k".
 */
const THOUSAND = 1000;

/**
 * Below this cost in US dollars, a cost keeps four decimals so a cheap turn does not read as free.
 */
const CHEAP_COST_USD = 0.01;

/**
 * The decimals a cost below {@link CHEAP_COST_USD} shows.
 */
const CHEAP_COST_DECIMALS = 4;

/**
 * The decimals any other cost shows.
 */
const COST_DECIMALS = 3;

/**
 * The size of the icons on the buttons and lint lines, in CSS pixels.
 */
const ICON_PX = 14;

/**
 * The size of the chevron that opens a disclosure, in CSS pixels.
 */
const CHEVRON_ICON_PX = 12;

/**
 * The tooltip of Undo and Redo while a turn runs, so nothing is restored under it.
 */
const WAIT_FOR_TURN_TITLE = 'Wait for the running turn to end';

/**
 * The tooltip of a changed file that the agent edited again after it stopped.
 */
const CONCURRENT_EDIT_TITLE =
  'It changed again after the agent stopped: likely your own edit, recorded with the turn';

/**
 * Props of {@link TurnFooter}.
 */
export type TurnFooterProps = {
  /**
   * The finished turn.
   */
  readonly turn: TurnView;

  /**
   * The deck folder name, to shorten paths.
   */
  readonly deck: string;

  /**
   * The diff of the turn, once asked for.
   */
  readonly diff: DiffView | undefined;

  /**
   * Whether lint still runs for this turn (the host has not let go of it yet).
   */
  readonly linting: boolean;

  /**
   * Whether a turn runs or waits, so Undo and Redo wait.
   */
  readonly busy: boolean;

  /**
   * Whether Undo would restore this turn.
   */
  readonly canUndo: boolean;

  /**
   * Whether Redo would apply this turn again.
   */
  readonly canRedo: boolean;

  /**
   * The problem of the last undo or redo, shown under the newest footer.
   */
  readonly problem: AgentProblem | null;

  /**
   * The provider's name, for problem headings.
   */
  readonly provider: string;

  /**
   * Whether a later turn finished since, so this footer recedes into the history.
   */
  readonly past?: boolean;

  /**
   * Asks for the turn's diff.
   */
  readonly onDiff: () => void;

  /**
   * Sends undo.
   */
  readonly onUndo: () => void;

  /**
   * Sends redo.
   */
  readonly onRedo: () => void;
};

/**
 * What a finished turn left behind: the changed files (each opens its diff), the lint result of the
 * slides it touched, how long it took and what it cost, and Undo or Redo. Undo and Redo wait while
 * a turn runs; when the journal refuses (a file changed since), the reason shows here.
 *
 * @param props - The turn and its actions.
 */
export function TurnFooter(props: TurnFooterProps): ReactNode {
  const { turn } = props;
  const meta = metaParts(turn.durationMs, turn.usage);
  const showActions = props.canUndo || props.canRedo;
  const kept = turn.changedFiles
    .filter((file) => file.undoable === false)
    .map((file) => shortPath(file.path, props.deck));
  const quiet =
    turn.changedFiles.length === 0 &&
    turn.reverted === null &&
    turn.conflicts.length === 0 &&
    turn.lint === null &&
    !props.linting &&
    !showActions &&
    props.problem === null;
  if (quiet) {
    return meta.length === 0 && turn.phase !== 'cancelled' ? null : (
      <div className="da-footer" data-quiet="">
        <span className="da-meta">
          {[quietLead(turn.phase), ...meta].filter(Boolean).join(' · ')}
        </span>
      </div>
    );
  }

  const keptVerb = kept.length === 1 ? 'it is' : 'they are';
  const conflictPronoun = turn.conflicts.length === 1 ? 'it' : 'them';
  return (
    <div className="da-footer" data-history={turn.history} data-past={props.past || undefined}>
      {turn.changedFiles.length === 0 ? null : (
        <ChangedFiles
          files={turn.changedFiles}
          deck={props.deck}
          diff={props.diff}
          onDiff={props.onDiff}
          history={turn.history}
        />
      )}
      {turn.reverted === null ? null : <RevertedLine reverted={turn.reverted} deck={props.deck} />}
      {turn.conflicts.length === 0 ? null : (
        <div className="da-footer-note" data-conflicts="">
          Kept your edit of {turn.conflicts.map((file) => shortPath(file, props.deck)).join(', ')}:
          you changed {conflictPronoun} while the agent worked, so its change was not applied.
        </div>
      )}
      <LintLine lint={turn.lint} linting={props.linting} deck={props.deck} />
      {meta.length === 0 && !showActions ? null : (
        <FooterRow
          meta={meta}
          busy={props.busy}
          canUndo={props.canUndo}
          canRedo={props.canRedo}
          undoTitle={undoTitle(props.busy, kept)}
          onUndo={props.onUndo}
          onRedo={props.onRedo}
        />
      )}
      {props.canUndo && kept.length > 0 ? (
        <div className="da-footer-note">
          Undo leaves {kept.join(', ')} as {keptVerb}: too large to undo.
        </div>
      ) : null}
      {turn.skipped.length > 0 ? (
        <div className="da-footer-note">
          Not restored (too large to undo):{' '}
          {turn.skipped.map((file) => shortPath(file.path, props.deck)).join(', ')}.
        </div>
      ) : null}
      {props.problem === null ? null : (
        <ProblemCard problem={props.problem} provider={props.provider} />
      )}
    </div>
  );
}

/**
 * The quiet line for what the turn wrote that is not content: "Ignored 2 changes outside the
 * slides: deck.config.ts, styles.css", with a disclosure that lists each path and what was there,
 * and, when the deck itself had files put back, where the versions found are kept.
 *
 * @param props - What was ignored or put back and the deck, to shorten paths.
 */
export function RevertedLine(props: { reverted: RevertedView; deck: string }): ReactNode {
  const { paths, copies } = props.reverted;
  const names = paths.map((item) => shortPath(item.path, props.deck));
  const noun = paths.length === 1 ? 'change' : 'changes';
  return (
    <details className="da-reverted">
      <summary className="da-footer-note">
        Ignored {paths.length} {noun} outside the slides: {names.join(', ')}
      </summary>
      <ul className="da-reverted-list">
        {paths.map((item) => (
          <li key={item.path}>
            <code>{shortPath(item.path, props.deck)}</code> {item.what}
          </li>
        ))}
      </ul>
      <div className="da-diff-note">
        The agent may change only slide files, media and data; the slide list changes through its
        deck tools. It is told in its next turn.
        {copies === null ? '' : ` The versions found in the deck are kept in ${copies}.`}
      </div>
    </details>
  );
}

/**
 * The row under the changed files: the turn's duration, tokens and cost, and the Undo and Redo
 * buttons that are on offer.
 *
 * @param props - The meta parts, what is on offer and the tooltips and actions.
 */
function FooterRow(props: {
  meta: readonly string[];
  busy: boolean;
  canUndo: boolean;
  canRedo: boolean;
  undoTitle: string;
  onUndo: () => void;
  onRedo: () => void;
}): ReactNode {
  const redoTitle = props.busy ? WAIT_FOR_TURN_TITLE : 'Apply the changes again';
  return (
    <div className="da-footer-row">
      <span className="da-meta">{props.meta.join(' · ')}</span>
      {props.canUndo ? (
        <button
          type="button"
          className="da-text-button"
          data-action="undo"
          disabled={props.busy}
          title={props.undoTitle}
          onClick={props.onUndo}>
          <Icon name="undo" size={ICON_PX} />
          Undo
        </button>
      ) : null}
      {props.canRedo ? (
        <button
          type="button"
          className="da-text-button"
          data-action="redo"
          disabled={props.busy}
          title={redoTitle}
          onClick={props.onRedo}>
          <Icon name="redo" size={ICON_PX} />
          Redo
        </button>
      ) : null}
    </div>
  );
}

/**
 * The Undo button's tooltip: why it waits, or what it restores.
 *
 * @param busy - Whether a turn runs.
 * @param kept - Files it cannot restore.
 */
function undoTitle(busy: boolean, kept: readonly string[]): string {
  if (busy) {
    return WAIT_FOR_TURN_TITLE;
  }

  if (kept.length === 0) {
    return 'Restore the files';
  }

  return `Restore the files, except ${kept.join(', ')} (too large to undo)`;
}

/**
 * The first words of a quiet footer: how the turn ended, when that is news.
 *
 * @param phase - How the turn ended.
 */
function quietLead(phase: TurnView['phase']): string {
  if (phase === 'cancelled') {
    return 'Stopped';
  }

  return phase === 'completed' ? 'No files changed' : '';
}

/**
 * The changed files; each opens its diff.
 *
 * @param props - The files, the deck, the diff and how to ask for it.
 */
function ChangedFiles({
  files,
  deck,
  diff,
  onDiff,
  history,
}: {
  files: readonly ChangedFile[];
  deck: string;
  diff: DiffView | undefined;
  onDiff: () => void;
  history: TurnView['history'];
}): ReactNode {
  const [open, setOpen] = useState<string | undefined>(undefined);
  return (
    <ul className="da-files" aria-label="Changed files">
      {files.map((file) => {
        const expanded = open === file.path;
        const fileDiff =
          diff?.state === 'ready' ? diff.files.find((one) => one.path === file.path) : undefined;
        return (
          <li key={file.path}>
            <ChangedFileButton
              file={file}
              deck={deck}
              history={history}
              expanded={expanded}
              fileDiff={fileDiff}
              onToggle={() => {
                setOpen(expanded ? undefined : file.path);
                if (!expanded) {
                  onDiff();
                }
              }}
            />
            {expanded ? <FileDiff diff={diff} file={fileDiff} /> : null}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The button of one changed file: its kind, path, line counts and what is notable about it.
 *
 * @param props - The file, its part of the diff and whether it is open.
 */
function ChangedFileButton({
  file,
  deck,
  history,
  expanded,
  fileDiff,
  onToggle,
}: {
  file: ChangedFile;
  deck: string;
  history: TurnView['history'];
  expanded: boolean;
  fileDiff: TurnDiffFile | undefined;
  onToggle: () => void;
}): ReactNode {
  return (
    <button type="button" className="da-file" aria-expanded={expanded} onClick={onToggle}>
      <Icon name="chevron" size={CHEVRON_ICON_PX} />
      <span className="da-file-kind" data-kind={file.kind} title={kindLabel(file.kind)}>
        {kindLetter(file.kind)}
      </span>
      <span className="da-file-path">{shortPath(file.path, deck)}</span>
      {fileDiff === undefined ? null : (
        <span className="da-file-counts">
          <span data-sign="+">+{fileDiff.added}</span>
          <span data-sign="-">−{fileDiff.removed}</span>
        </span>
      )}
      {file.concurrentEdit === true ? (
        <span className="da-chip" data-tone="warn" title={CONCURRENT_EDIT_TITLE}>
          also edited by you during this turn
        </span>
      ) : null}
      {file.undoable === false ? (
        <span
          className="da-chip"
          data-tone="warn"
          title="Larger than 5 MB: the journal kept no copy, so undo leaves it as it is">
          too large to undo
        </span>
      ) : null}
      {history === 'undone' ? <span className="da-chip">undone</span> : null}
    </button>
  );
}

/**
 * One file's diff, or why there is none.
 *
 * @param props - The turn's diff and the file's part of it.
 */
function FileDiff({
  diff,
  file,
}: {
  diff: DiffView | undefined;
  file: TurnDiffFile | undefined;
}): ReactNode {
  if (diff === undefined || diff.state === 'loading') {
    return <div className="da-diff-note">Loading the diff…</div>;
  }

  if (diff.state === 'unavailable') {
    return <div className="da-diff-note">{diff.message}</div>;
  }

  if (file === undefined) {
    return <div className="da-diff-note">No diff for this file.</div>;
  }

  if (file.binary) {
    return <div className="da-diff-note">A binary file; no line diff.</div>;
  }

  return <DiffHunks hunks={file.hunks} truncated={file.truncated} label={`Diff of ${file.path}`} />;
}

/**
 * The lint result of a turn: clean, the findings with their rule and fix, still running, or nothing
 * when lint did not run.
 *
 * @param props - The result, whether it is still running and the deck.
 */
function LintLine(props: { lint: TurnLint | null; linting: boolean; deck: string }): ReactNode {
  const existing = props.lint?.existing ?? [];
  const existingVerb = existing.length === 1 ? 'finding was' : 'findings were';
  return (
    <>
      <OwnLint {...props} />
      {existing.length === 0 ? null : (
        <details className="da-existing">
          <summary>
            <Icon name="chevron" size={CHEVRON_ICON_PX} />
            {existing.length} {existingVerb} already there before this turn
          </summary>
          <FindingList findings={existing} deck={props.deck} />
        </details>
      )}
    </>
  );
}

/**
 * The findings a turn brought: clean, the findings with their rule and fix, still running, or
 * nothing when lint did not run.
 *
 * @param props - The result, whether it is still running and the deck.
 */
function OwnLint({
  lint,
  linting,
  deck,
}: {
  lint: TurnLint | null;
  linting: boolean;
  deck: string;
}): ReactNode {
  if (lint === null) {
    return linting ? (
      <div className="da-lint" data-state="running">
        <span className="da-spinner" aria-hidden="true" />
        Checking lint…
      </div>
    ) : null;
  }

  if (lint.findings.length === 0) {
    return (
      <div className="da-lint" data-state="clean">
        <Icon name="lint" size={ICON_PX} />
        {(lint.existing ?? []).length > 0 ? 'No new lint findings' : 'Lint clean'}
      </div>
    );
  }

  const findings = <FindingList findings={lint.findings} deck={deck} />;
  const head = (
    <>
      <Icon name={lint.errors > 0 ? 'failed' : 'lint'} size={ICON_PX} />
      Lint: {lintSummary(lint)}
      {lint.autoFix ? (
        <span className="da-chip" data-tone="accent">
          auto-fix follows
        </span>
      ) : null}
    </>
  );
  // When an automatic fix follows, the findings are the agent's to read: they stay folded.
  return (
    <div className="da-lint" data-state={lint.errors > 0 ? 'errors' : 'warnings'}>
      {lint.autoFix ? (
        <details>
          <summary className="da-lint-head">{head}</summary>
          {findings}
        </details>
      ) : (
        <>
          <div className="da-lint-head">{head}</div>
          {findings}
        </>
      )}
    </div>
  );
}

/**
 * The error and warning counts of a lint result, such as `2 errors, 1 warning`.
 *
 * @param lint - The lint result.
 */
function lintSummary(lint: TurnLint): string {
  return [
    lint.errors > 0 ? countLabel(lint.errors, 'error', 'errors') : '',
    lint.warnings > 0 ? countLabel(lint.warnings, 'warning', 'warnings') : '',
  ]
    .filter((part) => part !== '')
    .join(', ');
}

/**
 * A count with its noun in the form that fits it, such as `1 error` or `3 errors`.
 *
 * @param count - How many.
 * @param singular - The noun for one.
 * @param plural - The noun for any other number.
 */
function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/**
 * Lint findings with their rule, file, message and fix.
 *
 * @param props - The findings and the deck.
 */
function FindingList({
  findings,
  deck,
}: {
  findings: readonly AgentLintFinding[];
  deck: string;
}): ReactNode {
  return (
    <ul className="da-findings">
      {findings.map((finding, index) => (
        <li key={index} data-severity={finding.severity}>
          <span className="da-finding-rule">{finding.rule}</span>
          <span className="da-finding-file">{shortPath(finding.file, deck)}</span>
          <span className="da-finding-message">
            <InlineText text={finding.message} />
          </span>
          {finding.fix === '' ? null : (
            <span className="da-finding-fix">
              <InlineText text={finding.fix} />
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * The duration, tokens and cost of a turn, as short parts.
 *
 * @param durationMs - How long it ran.
 * @param usage - Tokens and cost.
 */
export function metaParts(durationMs: number | null, usage: TurnUsage | null): string[] {
  const parts: string[] = [];
  if (durationMs !== null && durationMs > 0) {
    parts.push(formatDuration(durationMs));
  }

  if (usage !== null && usage.inputTokens + usage.outputTokens > 0) {
    parts.push(`${formatTokens(usage.inputTokens)} in · ${formatTokens(usage.outputTokens)} out`);
  }

  if (usage?.costUsd !== null && usage?.costUsd !== undefined && usage.costUsd > 0) {
    parts.push(`$${formatCost(usage.costUsd)}`);
  }

  return parts;
}

/**
 * A cost in US dollars with its decimals: four below a cent, three from there on.
 *
 * @param costUsd - The cost, above zero.
 */
function formatCost(costUsd: number): string {
  const decimals = costUsd < CHEAP_COST_USD ? CHEAP_COST_DECIMALS : COST_DECIMALS;
  return costUsd.toFixed(decimals);
}

/**
 * A duration such as `850 ms`, `12.4 s` or `2 min 5 s`.
 *
 * @param ms - Milliseconds.
 */
export function formatDuration(ms: number): string {
  if (ms < MS_PER_SECOND) {
    return `${Math.round(ms)} ms`;
  }

  const seconds = ms / MS_PER_SECOND;
  if (seconds < SECONDS_PER_MINUTE) {
    return `${seconds.toFixed(1)} s`;
  }

  const minutes = Math.floor(seconds / SECONDS_PER_MINUTE);
  return `${minutes} min ${Math.round(seconds - minutes * SECONDS_PER_MINUTE)} s`;
}

/**
 * A token count such as `840` or `12.3k`.
 *
 * @param tokens - The count.
 */
function formatTokens(tokens: number): string {
  return tokens < THOUSAND ? `${tokens}` : `${(tokens / THOUSAND).toFixed(1)}k`;
}

/**
 * The letter a change kind shows as.
 *
 * @param kind - How the file changed.
 */
function kindLetter(kind: ChangedFile['kind']): string {
  switch (kind) {
    case 'add':
      return 'A';
    case 'update':
      return 'M';
    case 'delete':
      return 'D';
  }
}

/**
 * A change kind in words.
 *
 * @param kind - How the file changed.
 */
function kindLabel(kind: ChangedFile['kind']): string {
  switch (kind) {
    case 'add':
      return 'Added';
    case 'update':
      return 'Modified';
    case 'delete':
      return 'Deleted';
  }
}
