import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

import type { TranscriptItem, TurnView } from '#runtime/agent-store.ts';
import type { Suggestion } from '#runtime/suggestions.ts';

import { Icon } from '#runtime/icons.tsx';
import { RichText } from '#runtime/rich-text.tsx';
import { canRetry, ProblemCard } from '#runtime/status.tsx';
import { describeTool, summarizeTools } from '#runtime/tool-label.ts';

/**
 * How close to the bottom, in pixels, still counts as reading the latest message.
 */
const PINNED_SLACK_PX = 40;

/**
 * The size of the icons on buttons and tool lines, in CSS pixels.
 */
const ICON_PX = 14;

/**
 * The size of the chevron that opens a disclosure, in CSS pixels.
 */
const CHEVRON_ICON_PX = 12;

/**
 * The size of the agent icon on the empty panel, in CSS pixels.
 */
const EMPTY_ICON_PX = 22;

/**
 * An ISO 8601 timestamp with a time.
 */
const ISO_TIME = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})/g;

/**
 * Props of {@link Transcript}.
 */
export type TranscriptProps = {
  /**
   * The turns, oldest first.
   */
  readonly turns: readonly TurnView[];

  /**
   * The deck folder name, to shorten paths.
   */
  readonly deck: string;

  /**
   * The provider's name.
   */
  readonly provider: string;

  /**
   * The text for the polite live region.
   */
  readonly announcement: string;

  /**
   * Draws the footer of a finished turn.
   */
  readonly footer: (turn: TurnView) => ReactNode;

  /**
   * What the empty panel offers.
   */
  readonly suggestions: readonly Suggestion[];

  /**
   * Puts a suggestion into the composer.
   */
  readonly onSuggestion: (suggestion: Suggestion) => void;

  /**
   * Sends a failed turn's prompt again.
   */
  readonly onRetry: (turn: TurnView) => void;
};

/**
 * The conversation: each turn's prompt, the agent's answer streaming in, its tool calls as one
 * quiet line each, reasoning behind a disclosure, notices, errors with a retry, and the footer. It
 * stays pinned to the newest message unless the reader scrolled up, and then offers a jump back.
 * Completed messages and turn outcomes are announced politely; streamed pieces are not.
 *
 * @param props - The turns and how to act on them.
 */
export function Transcript(props: TranscriptProps): ReactNode {
  const scroller = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const [atBottom, setAtBottom] = useState(true);
  useLayoutEffect(() => {
    const element = scroller.current;
    if (element !== null && pinned.current) {
      element.scrollTop = element.scrollHeight;
    }
  });
  /**
   * Follows whether the reader is at the bottom.
   */
  const onScroll = () => {
    const element = scroller.current;
    if (element === null) {
      return;
    }

    const bottom =
      element.scrollHeight - element.scrollTop - element.clientHeight < PINNED_SLACK_PX;
    pinned.current = bottom;
    setAtBottom(bottom);
  };
  /**
   * Scrolls to the newest message and stays there.
   */
  const jump = () => {
    const element = scroller.current;
    pinned.current = true;
    setAtBottom(true);
    element?.scrollTo({ top: element.scrollHeight, behavior: smoothScroll() });
  };
  return (
    <div className="da-transcript-wrap">
      <div
        ref={scroller}
        className="da-transcript"
        onScroll={onScroll}
        tabIndex={0}
        role="log"
        aria-label="Conversation"
        aria-live="off">
        {props.turns.length === 0 ? (
          <EmptyState
            provider={props.provider}
            suggestions={props.suggestions}
            onSuggestion={props.onSuggestion}
          />
        ) : (
          props.turns.map((turn) => (
            <TurnBlock
              key={turn.turn}
              turn={turn}
              deck={props.deck}
              provider={props.provider}
              footer={props.footer}
              onRetry={props.onRetry}
              last={turn === props.turns.at(-1)}
            />
          ))
        )}
      </div>
      {atBottom ? null : (
        <button type="button" className="da-jump" onClick={jump}>
          <Icon name="down" size={ICON_PX} />
          Jump to latest
        </button>
      )}
      <div className="da-sr-only" aria-live="polite" aria-atomic="true">
        {props.announcement}
      </div>
    </div>
  );
}

/**
 * The empty panel: what the agent can do, and two or three prompts for this slide.
 *
 * @param props - The provider and the suggestions.
 */
function EmptyState({
  provider,
  suggestions,
  onSuggestion,
}: {
  provider: string;
  suggestions: readonly Suggestion[];
  onSuggestion: (suggestion: Suggestion) => void;
}): ReactNode {
  return (
    <div className="da-empty">
      <div className="da-empty-mark" aria-hidden="true">
        <Icon name="agent" size={EMPTY_ICON_PX} />
      </div>
      <div className="da-empty-title">Ask {provider} to change this slide</div>
      <p className="da-empty-text">
        It edits the deck’s files; the slide reloads as they change, and every turn can be undone.
      </p>
      <ul className="da-suggestions" aria-label="Suggestions">
        {suggestions.map((suggestion) => (
          <li key={suggestion.label} className="da-suggestion-item">
            <button
              type="button"
              className="da-suggestion"
              data-source={suggestion.source}
              onClick={() => onSuggestion(suggestion)}>
              {suggestion.source === 'example' ? null : (
                <span className="da-suggestion-source">{sourceLabel(suggestion.source)}</span>
              )}
              <span className="da-suggestion-text">{suggestion.label}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * One turn.
 *
 * @param props - The turn, the deck, and the footer to draw.
 */
function TurnBlock({
  turn,
  deck,
  provider,
  footer,
  onRetry,
  last,
}: {
  turn: TurnView;
  deck: string;
  provider: string;
  footer: (turn: TurnView) => ReactNode;
  onRetry: (turn: TurnView) => void;
  last: boolean;
}): ReactNode {
  const started = turn.provider !== null;
  const finished = turn.phase !== 'queued' && turn.phase !== 'running';
  const lastItem = turn.items.at(-1);
  const working = turn.phase === 'running' && !(lastItem?.kind === 'text' && lastItem.streaming);
  const lastError = turn.items.findLast((item) => item.kind === 'error');
  /**
   * The retry action of an error: only the newest turn's failure, when the error can be retried and
   * the turn was a prompt of the person's.
   *
   * @param item - The item.
   */
  const retryOf = (item: Exclude<TranscriptItem, { kind: 'tool' }>) =>
    item === lastError &&
    turn.phase === 'failed' &&
    last &&
    canRetry(item.problem.kind) &&
    turn.kind === 'user'
      ? () => onRetry(turn)
      : undefined;
  const workingNote = working ? (
    <div className="da-working" role="status">
      <span className="da-dots" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      Working
    </div>
  ) : null;
  const rows = groupItems(turn.items).map((group) =>
    group.kind === 'tools' ? (
      <ToolGroup key={group.key} items={group.items} deck={deck} finished={finished} />
    ) : (
      <ItemRow
        key={group.item.key}
        item={group.item}
        provider={provider}
        retry={retryOf(group.item)}
      />
    ),
  );
  return (
    <article
      className="da-turn"
      data-phase={turn.phase}
      data-kind={turn.kind}
      aria-label={`Turn ${turn.turn}`}>
      {turn.kind === 'auto-fix' ? (
        <div className="da-autofix">
          <span className="da-chip" data-tone="accent">
            Auto-fix
          </span>
          <span>{autoFixText(turn.autoFixOf)}</span>
        </div>
      ) : (
        <UserPrompt turn={turn} />
      )}
      {turn.phase === 'queued' ? (
        <div className="da-queued">
          <span className="da-chip">Queued</span>
          {queuedText(turn.position)}
        </div>
      ) : null}
      {turn.items.length === 0 && !working ? null : (
        <div className="da-items">
          {rows}
          {workingNote}
        </div>
      )}
      {turn.phase === 'cancelled' && !started ? (
        <div className="da-ended">Removed from the queue.</div>
      ) : null}
      {finished && started ? footer(turn) : null}
    </article>
  );
}

/**
 * The person's prompt with the slide it was about.
 *
 * @param props - The turn.
 */
function UserPrompt({ turn }: { turn: TurnView }): ReactNode {
  const file = turn.slide?.file.split('/').at(-1);
  return (
    <div className="da-prompt">
      <div className="da-prompt-text">{turn.prompt}</div>
      {turn.slide === null ? null : (
        <div className="da-prompt-context">
          {file} · step {turn.slide.step}
        </div>
      )}
    </div>
  );
}

/**
 * A run of items, consecutive tool calls grouped so they read as one quiet block.
 */
type ItemGroup =
  | {
      /**
       * Tool calls.
       */
      readonly kind: 'tools';

      /**
       * The group's key.
       */
      readonly key: string;

      /**
       * The calls.
       */
      readonly items: readonly Extract<TranscriptItem, { kind: 'tool' }>[];
    }
  | {
      /**
       * Anything else.
       */
      readonly kind: 'item';

      /**
       * The item.
       */
      readonly item: Exclude<TranscriptItem, { kind: 'tool' }>;
    };

/**
 * Groups consecutive tool calls.
 *
 * @param items - The items of a turn.
 */
function groupItems(items: readonly TranscriptItem[]): ItemGroup[] {
  const groups: ItemGroup[] = [];
  for (const item of items) {
    const last = groups.at(-1);
    if (item.kind === 'tool') {
      if (last?.kind === 'tools') {
        groups[groups.length - 1] = { ...last, items: [...last.items, item] };
      } else {
        groups.push({ kind: 'tools', key: item.key, items: [item] });
      }
    } else {
      groups.push({ kind: 'item', item });
    }
  }

  return groups;
}

/**
 * A run of tool calls: one line each while the turn runs; once it has finished, a single summary
 * line that opens to the calls. Refused and failed calls always stay in view.
 *
 * @param props - The calls, the deck and whether the turn finished.
 */
function ToolGroup({
  items,
  deck,
  finished,
}: {
  items: readonly Extract<TranscriptItem, { kind: 'tool' }>[];
  deck: string;
  finished: boolean;
}): ReactNode {
  const list = (
    <ul className="da-tools">
      {items.map((item) => (
        <ToolRow key={item.key} item={item} deck={deck} />
      ))}
    </ul>
  );
  const troubled = items.some((item) => item.status === 'denied' || item.status === 'failed');
  if (!finished || items.length < 2 || troubled) {
    return list;
  }

  return (
    <details className="da-tools-summary">
      <summary>
        <Icon name="chevron" size={CHEVRON_ICON_PX} />
        <span className="da-tools-count">{items.length} steps</span>
        <span className="da-tools-text">{summarizeTools(items, deck)}</span>
      </summary>
      {list}
    </details>
  );
}

/**
 * One tool call as a single line: an icon and a short title; a failure or refusal shows its reason
 * when opened.
 *
 * @param props - The call and the deck.
 */
function ToolRow({
  item,
  deck,
}: {
  item: Extract<TranscriptItem, { kind: 'tool' }>;
  deck: string;
}): ReactNode {
  const line = describeTool(item, deck);
  const troubled = item.status === 'denied' || item.status === 'failed';
  const icon = troubled ? item.status : line.icon;
  const text = (
    <>
      <span className="da-tool-icon" data-status={item.status}>
        {item.status === 'running' ? (
          <span className="da-spinner" aria-hidden="true" />
        ) : (
          <Icon name={icon} size={ICON_PX} />
        )}
      </span>
      <span className="da-tool-verb">{line.verb}</span>
      {line.object === '' ? null : <span className="da-tool-object">{line.object}</span>}
    </>
  );
  if (item.detail === null || item.status === 'running' || item.status === 'done') {
    return (
      <li className="da-tool" data-status={item.status} data-icon={line.icon} title={item.title}>
        {text}
      </li>
    );
  }

  return (
    <li className="da-tool" data-status={item.status} data-icon={line.icon}>
      <details>
        <summary title={item.title}>{text}</summary>
        <div className="da-tool-detail">{item.detail}</div>
      </details>
    </li>
  );
}

/**
 * Answer text, reasoning, a notice or an error.
 *
 * @param props - The item, the provider and the retry action for a failed turn.
 */
function ItemRow({
  item,
  provider,
  retry,
}: {
  item: Exclude<TranscriptItem, { kind: 'tool' }>;
  provider: string;
  retry: (() => void) | undefined;
}): ReactNode {
  switch (item.kind) {
    case 'text':
      return (
        <div className="da-answer" data-streaming={item.streaming || undefined}>
          <RichText text={item.text} />
        </div>
      );
    case 'reasoning':
      return (
        <details className="da-reasoning">
          <summary>
            <Icon name="chevron" size={CHEVRON_ICON_PX} />
            Reasoning
          </summary>
          <div className="da-reasoning-text">
            <RichText text={item.text} />
          </div>
        </details>
      );
    case 'notice':
      return (
        <div className="da-notice" data-notice={item.notice}>
          {readableTimes(item.message)}
        </div>
      );
    case 'error':
      return (
        <ProblemCard problem={item.problem} provider={provider}>
          {retry === undefined ? null : (
            <button type="button" className="da-text-button" data-action="retry" onClick={retry}>
              <Icon name="retry" size={ICON_PX} />
              Retry
            </button>
          )}
        </ProblemCard>
      );
  }
}

/**
 * A notice with its ISO timestamps (a rate limit's reset time) written as local dates.
 *
 * @param message - The notice.
 */
export function readableTimes(message: string): string {
  return message.replaceAll(ISO_TIME, (iso) => {
    const date = new Date(iso);
    return Number.isNaN(date.getTime())
      ? iso
      : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  });
}

/**
 * The heading of an auto-fix turn: which turn's lint errors it fixes, when known.
 *
 * @param autoFixOf - The turn whose lint errors it fixes, or null.
 */
function autoFixText(autoFixOf: number | null): string {
  if (autoFixOf === null) {
    return 'Fixing the lint errors';
  }

  return `Fixing the lint errors of turn ${autoFixOf}`;
}

/**
 * How far a queued turn is from running.
 *
 * @param position - How many turns are ahead, or null once it started.
 */
function queuedText(position: number | null): string {
  if (position === null || position <= 0) {
    return 'Starts next.';
  }

  return `${position} ahead.`;
}

/**
 * What a suggestion is based on, as a short tag.
 *
 * @param source - The source.
 */
function sourceLabel(source: Suggestion['source']): string {
  switch (source) {
    case 'lint':
      return 'Lint';
    case 'comment':
      return 'Comment';
    case 'example':
      return 'Try';
  }
}

/**
 * Smooth scrolling unless the reader asked for reduced motion.
 */
function smoothScroll(): ScrollBehavior {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
    ? 'auto'
    : 'smooth';
}
