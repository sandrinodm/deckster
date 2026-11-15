import { useDeck, type DeckControls } from '@deckster/engine';
import { useState, type ReactNode } from 'react';

import type { AgentComment } from '#model/agent-comment.ts';
import type { FeedbackAnswer } from '#model/feedback-api.ts';

import { commentsMarkdown } from '#model/agent-markdown.ts';
import { CommentCard } from '#overlay/comment-card.tsx';
import {
  setCommentMode,
  updateComments,
  useCommentsState,
  type StatusFilter,
} from '#overlay/comments-state.ts';
import { copyText } from '#overlay/copy-text.ts';
import { saveAuthor, savedAuthor } from '#overlay/feedback-client.ts';
import { locationLabel } from '#overlay/labels.ts';

/**
 * The status filters, in the order the panel shows them.
 */
const STATUS_FILTERS: readonly { value: StatusFilter; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'all', label: 'All' },
];

/**
 * The anchor states worth a warning chip, with what they say.
 */
const ANCHOR_CHIPS: Readonly<Record<string, string>> = {
  /**
   * The element's line moved.
   */
  moved: 'anchor moved',

  /**
   * The element's line was reworded; the line shown is a guess.
   */
  guessed: 'line guessed',

  /**
   * The element's line is gone; no line is named.
   */
  lost: 'anchor lost',
};

/**
 * What each anchor chip's tooltip explains.
 */
const ANCHOR_HINTS: Readonly<Record<string, string>> = {
  /**
   * The element's line moved.
   */
  moved: 'The line moved; the location is where it is now.',

  /**
   * The element's line was reworded.
   */
  guessed: 'The line was reworded; this is the nearby line most like it. Check it before editing.',

  /**
   * The element's line is gone.
   */
  lost: 'No line matches any more; read the screenshot and the source around the old line.',
};

/**
 * The comment panel, docked on the right: every comment of the deck by slide, filtered by status
 * and slide. Clicking a comment goes to its slide and step, flashes its element and opens its card;
 * "Copy all open" puts every open comment on the clipboard as Markdown for an agent.
 */
export function CommentPanel(): ReactNode {
  const state = useCommentsState();
  const { answer } = state;
  const comments = (answer?.comments ?? []).filter(
    (comment) =>
      (state.status === 'all' || comment.status === state.status) &&
      (state.slide === undefined || comment.slide === state.slide),
  );
  const open = (answer?.comments ?? []).filter((comment) => comment.status === 'open');
  return (
    <aside className="dc-panel" data-deck-interactive="" aria-label="Comments">
      <PanelHead open={open} answer={answer} />
      <PanelFilters answer={answer} />
      {state.problem === undefined ? null : <p className="dc-problem">{state.problem}</p>}
      <CommentList comments={comments} answer={answer} />
      <AuthorField serverAuthor={answer?.author ?? ''} />
    </aside>
  );
}

/**
 * Props of {@link PanelHead}.
 */
type PanelHeadProps = {
  /**
   * The open comments, counted and copied by "Copy all open".
   */
  open: AgentComment[];

  /**
   * The comments as the server answered them, for the deck name.
   */
  answer: FeedbackAnswer | undefined;
};

/**
 * The panel's title row: the open count, "Copy all open" and the close button.
 *
 * @param props - The open comments and the answer they came from.
 */
function PanelHead({ open, answer }: PanelHeadProps): ReactNode {
  return (
    <header className="dc-panel-head">
      <span className="dc-panel-title">Comments</span>
      <span className="dp-chip" data-tone={open.length > 0 ? 'accent' : 'neutral'}>
        {open.length} open
      </span>
      <span className="dc-spacer" />
      <button
        type="button"
        className="dp-button"
        disabled={open.length === 0 || answer === undefined}
        onClick={() =>
          void copyText(
            commentsMarkdown(answer?.deck ?? '', open),
            `Copied ${open.length} for agent`,
          )
        }>
        Copy all open
      </button>
      <button
        type="button"
        className="dp-button"
        data-variant="icon"
        aria-label="Close comments"
        onClick={() => updateComments({ panelOpen: false, openId: undefined })}>
        ×
      </button>
    </header>
  );
}

/**
 * Props of {@link PanelFilters}.
 */
type PanelFiltersProps = {
  /**
   * The comments as the server answered them, for the counts on the status buttons.
   */
  answer: FeedbackAnswer | undefined;
};

/**
 * The status buttons and the slide picker above the list.
 *
 * @param props - The answer the counts come from.
 */
function PanelFilters({ answer }: PanelFiltersProps): ReactNode {
  const deck = useDeck();
  const state = useCommentsState();
  return (
    <div className="dc-filters">
      <fieldset className="dc-segmented" aria-label="Status">
        {STATUS_FILTERS.map((filter) => (
          <button
            key={filter.value}
            type="button"
            aria-pressed={state.status === filter.value}
            onClick={() => updateComments({ status: filter.value })}>
            {filter.label} {countFor(answer, filter.value)}
          </button>
        ))}
      </fieldset>
      <select
        className="dc-select"
        aria-label="Slide"
        value={state.slide ?? ''}
        onChange={(event) =>
          updateComments({ slide: event.target.value === '' ? undefined : event.target.value })
        }>
        <option value="">All slides</option>
        {deck.slides.map((slide) => (
          <option key={slide.id} value={slide.id}>
            {slide.index + 1}. {slide.title}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * Props of {@link CommentList}.
 */
type CommentListProps = {
  /**
   * The comments that pass the filters, in slide order.
   */
  comments: AgentComment[];

  /**
   * The comments as the server answered them, for the empty message and the deck folder.
   */
  answer: FeedbackAnswer | undefined;
};

/**
 * The comments grouped under their slides, or a message when none pass.
 *
 * @param props - The filtered comments and the answer they came from.
 */
function CommentList({ comments, answer }: CommentListProps): ReactNode {
  const deck = useDeck();
  const { openId } = useCommentsState();
  return (
    <div className="dc-list">
      {comments.length === 0 ? <EmptyList hasAny={(answer?.comments.length ?? 0) > 0} /> : null}
      {groupBySlide(comments).map(([slide, members]) => (
        <section key={slide} className="dc-group">
          <h3 className="dc-group-title">{slideHeading(deck, slide)}</h3>
          {members.map((comment) => (
            <CommentRow
              key={comment.id}
              comment={comment}
              answer={answer}
              isOpen={openId === comment.id}
            />
          ))}
        </section>
      ))}
    </div>
  );
}

/**
 * Props of {@link CommentRow}.
 */
type CommentRowProps = {
  /**
   * The comment.
   */
  comment: AgentComment;

  /**
   * The answer it came from, for the deck name and folder.
   */
  answer: FeedbackAnswer | undefined;

  /**
   * Whether its card is open.
   */
  isOpen: boolean;
};

/**
 * One comment in the list; a click jumps to it and opens its card.
 */
function CommentRow({ comment, answer, isOpen }: CommentRowProps): ReactNode {
  const deck = useDeck();

  /**
   * Goes to the comment's slide and step and flashes its element.
   */
  const jump = () => {
    if (comment.slideNumber !== null) {
      deck.goto(comment.slide, comment.step);
    }

    updateComments({ openId: isOpen ? undefined : comment.id, flashId: comment.id });
  };
  return (
    <article
      className="dc-item"
      data-comment-id={comment.id}
      data-status={comment.status}
      aria-current={isOpen}>
      <button type="button" className="dc-item-main" onClick={jump}>
        <span className="dc-item-pin" data-status={comment.status}>
          {comment.number}
        </span>
        <span className="dc-item-body">
          <span className="dc-item-text">{comment.text}</span>
          <ItemMeta comment={comment} deckDir={answer?.deckDir ?? ''} />
        </span>
      </button>
      {isOpen ? <CommentCard deck={answer?.deck ?? ''} comment={comment} /> : null}
    </article>
  );
}

/**
 * Props of {@link ItemMeta}.
 */
type ItemMetaProps = {
  /**
   * The comment.
   */
  comment: AgentComment;

  /**
   * The deck folder relative to the workspace, for the location label.
   */
  deckDir: string;
};

/**
 * The line under a comment's text: its type, location, anchor warning and author.
 *
 * @param props - The comment and the deck folder.
 */
function ItemMeta({ comment, deckDir }: ItemMetaProps): ReactNode {
  const anchorChip = ANCHOR_CHIPS[comment.anchor.status];
  return (
    <span className="dc-item-meta">
      {comment.type === null ? null : (
        <span className="dc-type-chip" data-type={comment.type}>
          {comment.type}
        </span>
      )}
      <code className="dc-location">{locationLabel(comment, deckDir)}</code>
      {anchorChip === undefined ? null : (
        <span
          className="dc-anchor-chip"
          data-anchor={comment.anchor.status}
          title={ANCHOR_HINTS[comment.anchor.status]}>
          {anchorChip}
        </span>
      )}
      <span className="dc-author">
        {comment.author} · step {comment.step}
      </span>
    </span>
  );
}

/**
 * What the list says when it has nothing to show.
 *
 * @param props - Whether the deck has comments that the filters hide.
 */
function EmptyList({ hasAny }: { hasAny: boolean }): ReactNode {
  if (hasAny) {
    return <p className="dc-empty">No comments match these filters.</p>;
  }

  return (
    <div className="dc-empty">
      <p>No comments yet.</p>
      <button
        type="button"
        className="dp-button"
        data-variant="primary"
        onClick={() => setCommentMode(true)}>
        Start commenting (c)
      </button>
    </div>
  );
}

/**
 * The name field at the foot of the panel: comments and resolutions are signed with it, else with
 * the server's name.
 *
 * @param props - The server's name, shown as the placeholder.
 */
function AuthorField({ serverAuthor }: { serverAuthor: string }): ReactNode {
  const [name, setName] = useState(() => savedAuthor() ?? '');
  return (
    <footer className="dc-panel-foot">
      <label className="dc-author-field">
        <span>Sign as</span>
        <input
          className="dc-input"
          value={name}
          placeholder={serverAuthor}
          onChange={(event) => setName(event.target.value)}
          onBlur={() => saveAuthor(name)}
        />
      </label>
      <span className="dc-hint">
        <kbd>C</kbd> comment mode
      </span>
    </footer>
  );
}

/**
 * Comments grouped by slide, in the order they came.
 *
 * @param comments - Comments in slide order.
 */
function groupBySlide(comments: readonly AgentComment[]): [string, AgentComment[]][] {
  const groups = new Map<string, AgentComment[]>();
  for (const comment of comments) {
    groups.set(comment.slide, [...(groups.get(comment.slide) ?? []), comment]);
  }

  return [...groups];
}

/**
 * A slide group's heading: its number and title, or a note that the deck config does not list it.
 *
 * @param deck - The deck's controls.
 * @param slideId - The slide id.
 */
function slideHeading(deck: DeckControls, slideId: string): string {
  const slide = deck.slides.find((candidate) => candidate.id === slideId);
  return slide === undefined
    ? `${slideId} (not in the deck)`
    : `${slide.index + 1}. ${slide.title}`;
}

/**
 * How many comments a status filter shows.
 *
 * @param answer - The comments.
 * @param status - The filter.
 */
function countFor(answer: FeedbackAnswer | undefined, status: StatusFilter): number {
  if (answer === undefined) {
    return 0;
  }

  return status === 'all' ? answer.counts.open + answer.counts.resolved : answer.counts[status];
}
