import { useEffect, useState, type ReactNode } from 'react';

import type { AgentErrorKind, AgentProblem, ProviderId } from '#protocol/agent-events.ts';
import type { AgentViewState } from '#runtime/agent-store.ts';

import { Icon } from '#runtime/icons.tsx';
import { InlineText } from '#runtime/rich-text.tsx';

/**
 * How long "Copied" shows after copying a command, in milliseconds.
 */
const COPIED_MS = 1600;

/**
 * The size of the copy button's icon, in CSS pixels.
 */
const COPY_ICON_PX = 14;

/**
 * Matches the first command in backticks.
 */
const COMMAND = /`([^`]+)`/;

/**
 * How serious a state is: it decides the banner's colour.
 */
export type StatusTone = 'quiet' | 'warn' | 'danger';

/**
 * The provider's name as people know it.
 *
 * @param provider - The provider id.
 */
export function providerLabel(provider: ProviderId | undefined): string {
  switch (provider) {
    case 'claude':
      return 'Claude';
    case 'codex':
      return 'Codex';
    case 'fake':
      return 'Fake agent';
    case undefined:
      return 'Agent';
  }
}

/**
 * The heading for a problem.
 *
 * @param kind - What went wrong.
 * @param provider - The provider's name.
 */
export function problemTitle(kind: AgentErrorKind, provider: string): string {
  switch (kind) {
    case 'not-installed':
      return `${provider} is not installed`;
    case 'not-signed-in':
      return `Not signed in to ${provider}`;
    case 'rate-limit':
      return 'Rate limited';
    case 'quota':
      return 'Usage limit reached';
    case 'cancelled':
      return 'Cancelled';
    case 'timeout':
      return 'The turn timed out';
    case 'crashed':
      return `${provider} stopped unexpectedly`;
    case 'mcp-unavailable':
      return 'Deck tools unavailable';
    case 'conflict':
      return 'Files changed since';
    case 'bad-request':
      return 'Not done';
  }
}

/**
 * How serious a problem is.
 *
 * @param kind - What went wrong.
 */
export function problemTone(kind: AgentErrorKind): StatusTone {
  switch (kind) {
    case 'not-installed':
    case 'not-signed-in':
    case 'crashed':
    case 'timeout':
      return 'danger';
    case 'rate-limit':
    case 'quota':
    case 'conflict':
    case 'bad-request':
      return 'warn';
    case 'mcp-unavailable':
    case 'cancelled':
      return 'quiet';
  }
}

/**
 * The first command in backticks in a fix, such as `claude auth login`.
 *
 * @param fix - The fix sentence.
 */
export function commandIn(fix: string): string | undefined {
  return COMMAND.exec(fix)?.[1];
}

/**
 * Whether a failed turn is worth sending again: it timed out, crashed, hit a passing limit, or
 * failed for a sign-in the person can fix in a terminal.
 *
 * @param kind - What went wrong.
 */
export function canRetry(kind: AgentErrorKind): boolean {
  return (
    kind === 'timeout' ||
    kind === 'crashed' ||
    kind === 'rate-limit' ||
    kind === 'bad-request' ||
    kind === 'not-signed-in'
  );
}

/**
 * A problem with its heading, what went wrong, and the fix; a command in the fix gets its own line
 * with a copy button.
 *
 * @param props - The problem, the provider's name and anything to show under it (a Retry button).
 */
export function ProblemCard({
  problem,
  provider,
  children,
}: {
  problem: AgentProblem;
  provider: string;
  children?: ReactNode;
}): ReactNode {
  const command = commandIn(problem.fix);
  return (
    <div className="da-problem" data-tone={problemTone(problem.kind)} data-kind={problem.kind}>
      <div className="da-problem-title">{problemTitle(problem.kind, provider)}</div>
      <div className="da-problem-message">{problem.message}</div>
      {problem.fix === '' ? null : (
        <div className="da-problem-fix">
          <InlineText text={problem.fix} />
        </div>
      )}
      {command === undefined ? null : <CommandLine command={command} />}
      {children}
    </div>
  );
}

/**
 * A command to run in a terminal, with a copy button.
 *
 * @param props - The command.
 */
export function CommandLine({ command }: { command: string }): ReactNode {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) {
      return undefined;
    }

    const timer = window.setTimeout(() => setCopied(false), COPIED_MS);
    return () => window.clearTimeout(timer);
  }, [copied]);
  /**
   * Copies the command.
   */
  const copy = () => {
    navigator.clipboard
      ?.writeText(command)
      .then(() => setCopied(true))
      .catch(() => undefined);
  };
  return (
    <div className="da-command">
      <code>{command}</code>
      <button
        type="button"
        className="da-icon-button"
        aria-label={copied ? 'Copied' : `Copy ${command}`}
        title={copied ? 'Copied' : 'Copy'}
        onClick={copy}>
        <Icon name="copy" size={COPY_ICON_PX} />
      </button>
      <span className="da-sr-only" aria-live="polite">
        {copied ? 'Copied' : ''}
      </span>
    </div>
  );
}

/**
 * The connection and provider state above the transcript: connecting, reconnecting, the provider
 * missing or signed out, a rate limit or quota, deck tools unavailable. Nothing when all is well,
 * or when the newest turn already shows the same problem.
 *
 * @param props - The view state, and whether the newest turn shows the host's problem already.
 */
export function StatusBanner({
  view,
  shownInline,
}: {
  view: AgentViewState;
  shownInline: boolean;
}): ReactNode {
  const connection = connectionBanner(view.connection);
  if (connection !== undefined) {
    return connection;
  }

  const problem = view.status?.problem;
  if (problem === null || problem === undefined || shownInline) {
    return null;
  }

  if (problem.kind === 'mcp-unavailable') {
    return (
      <div className="da-banner" data-tone="quiet" role="status">
        <strong>Deck tools unavailable.</strong> The agent still works; lint runs after each turn.
      </div>
    );
  }

  const provider = providerLabel(view.status?.provider);
  return (
    <div className="da-banner-card" role="status">
      <ProblemCard problem={problem} provider={provider} />
    </div>
  );
}

/**
 * The banner for a connection that is not open, or undefined while it is open.
 *
 * @param connection - Where the connection is.
 */
function connectionBanner(connection: AgentViewState['connection']): ReactNode | undefined {
  if (connection === 'connecting') {
    return (
      <div className="da-banner" data-tone="quiet" role="status">
        <span className="da-spinner" aria-hidden="true" />
        Connecting to the agent…
      </div>
    );
  }

  if (connection === 'reconnecting') {
    return (
      <div className="da-banner" data-tone="warn" role="status">
        <span className="da-spinner" aria-hidden="true" />
        Reconnecting to the dev server… Turns keep running; the panel catches up when it is back.
      </div>
    );
  }

  if (connection === 'closed') {
    return (
      <div className="da-banner" data-tone="danger" role="status">
        Disconnected from the agent. Reload the page.
      </div>
    );
  }

  return undefined;
}
