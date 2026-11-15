import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

import type { AgentComment } from '#model/agent-comment.ts';
import type { CommentResolution, CommentType } from '#model/comment-schema.ts';
import type { FeedbackRequest } from '#node/comment-request.ts';

import { commentMarkdown } from '#model/agent-markdown.ts';
import { updateComments } from '#overlay/comments-state.ts';
import { copyText } from '#overlay/copy-text.ts';
import { screenshotUrl, sendFeedback } from '#overlay/feedback-client.ts';
import { TypePicker } from '#overlay/type-picker.tsx';

/**
 * The rows of the text field a comment is edited in.
 */
const EDIT_ROWS = 3;

/**
 * Props of {@link CommentCard}.
 */
type CommentCardProps = {
  /**
   * The deck folder name, for the agent payload.
   */
  deck: string;

  /**
   * The comment.
   */
  comment: AgentComment;
};

/**
 * What the card is doing besides showing the comment.
 */
type CardMode = 'view' | 'edit' | 'resolve' | 'delete';

/**
 * Props of the card's parts: the comment, and how to send a change and leave the current mode.
 */
type CardPartProps = {
  /**
   * The comment.
   */
  comment: AgentComment;

  /**
   * Sends a change; the card goes back to viewing when the server applied it.
   */
  send: (request: FeedbackRequest) => Promise<void>;

  /**
   * Goes back to viewing.
   */
  close: () => void;
};

/**
 * The open comment in the panel: its screenshot, full text and resolution, and its actions: copy it
 * for an agent (Markdown with the file and line, the source excerpt and the comment), edit, resolve
 * with a note, reopen and delete (asked twice).
 */
export function CommentCard({ deck, comment }: CommentCardProps): ReactNode {
  const [mode, setMode] = useState<CardMode>('view');

  /**
   * Sends a change and goes back to viewing.
   */
  const send = async (request: FeedbackRequest) => {
    if (await sendFeedback(request)) {
      setMode('view');
    }
  };
  const parts = { comment, send, close: () => setMode('view') };
  return (
    <div className="dc-card" data-deck-interactive="">
      {comment.screenshot === null ? null : (
        <img
          className="dc-shot"
          src={screenshotUrl(comment.id, comment.updatedAt)}
          alt={`Screenshot of the element comment ${comment.number} is about`}
        />
      )}
      {mode === 'edit' ? <EditForm {...parts} /> : <p className="dc-card-text">{comment.text}</p>}
      {comment.resolution === null ? null : <Resolution resolution={comment.resolution} />}
      {mode === 'resolve' ? <ResolveForm {...parts} /> : null}
      <CardActions deck={deck} mode={mode} setMode={setMode} {...parts} />
    </div>
  );
}

/**
 * The text and type of a comment being edited, with Save and Cancel.
 */
function EditForm({ comment, send, close }: CardPartProps): ReactNode {
  const [text, setText] = useState(comment.text);
  const [type, setType] = useState<CommentType | null>(comment.type);
  return (
    <div className="dc-edit">
      <textarea
        className="dc-textarea"
        rows={EDIT_ROWS}
        aria-label="Comment"
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      <div className="dc-row">
        <TypePicker value={type} onChange={setType} />
        <span className="dc-spacer" />
        <button type="button" className="dp-button" onClick={close}>
          Cancel
        </button>
        <button
          type="button"
          className="dp-button"
          data-variant="primary"
          disabled={text.trim() === ''}
          onClick={() => void send({ action: 'update', id: comment.id, text: text.trim(), type })}>
          Save
        </button>
      </div>
    </div>
  );
}

/**
 * The optional note a comment is resolved with; Enter resolves.
 */
function ResolveForm({ comment, send }: CardPartProps): ReactNode {
  const [note, setNote] = useState('');
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    input.current?.focus();
  }, []);

  /**
   * Resolves the comment with the note.
   */
  const resolve = () => void send({ action: 'resolve', id: comment.id, note: note.trim() });

  /**
   * Enter in the note field resolves.
   */
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      resolve();
    }
  };
  return (
    <div className="dc-row">
      <input
        ref={input}
        className="dc-input"
        placeholder="What changed? (optional)"
        aria-label="Resolution note"
        value={note}
        onChange={(event) => setNote(event.target.value)}
        onKeyDown={onKeyDown}
      />
      <button type="button" className="dp-button" data-variant="primary" onClick={resolve}>
        Resolve
      </button>
    </div>
  );
}

/**
 * Who resolved a comment, and their note.
 *
 * @param props - The resolution.
 */
function Resolution({ resolution }: { resolution: CommentResolution }): ReactNode {
  const note = resolution.note === '' ? '' : `: ${resolution.note}`;
  return (
    <p className="dc-resolution">
      Resolved by {resolution.by}
      {note}
    </p>
  );
}

/**
 * Props of {@link CardActions}.
 */
type CardActionsProps = CardPartProps & {
  /**
   * The deck folder name, for the agent payload.
   */
  deck: string;

  /**
   * What the card is doing.
   */
  mode: CardMode;

  /**
   * Changes what the card is doing.
   */
  setMode: (mode: CardMode) => void;
};

/**
 * The card's buttons: copy for agent, edit, resolve or reopen, and delete, which asks again.
 */
function CardActions({ deck, comment, send, mode, setMode }: CardActionsProps): ReactNode {
  /**
   * Deletes the comment and closes its card.
   */
  const remove = () => {
    updateComments({ openId: undefined });
    void send({ action: 'delete', id: comment.id });
  };
  return (
    <div className="dc-actions">
      <button
        type="button"
        className="dp-button"
        onClick={() => void copyText(commentMarkdown(deck, comment), 'Copied for agent')}>
        Copy for agent
      </button>
      <button
        type="button"
        className="dp-button"
        onClick={() => setMode(mode === 'edit' ? 'view' : 'edit')}>
        Edit
      </button>
      {comment.status === 'open' ? (
        <button type="button" className="dp-button" onClick={() => setMode('resolve')}>
          Resolve
        </button>
      ) : (
        <button
          type="button"
          className="dp-button"
          onClick={() => void send({ action: 'reopen', id: comment.id })}>
          Reopen
        </button>
      )}
      {mode === 'delete' ? (
        <button type="button" className="dp-button" data-variant="danger" onClick={remove}>
          Delete for good
        </button>
      ) : (
        <button type="button" className="dp-button" onClick={() => setMode('delete')}>
          Delete
        </button>
      )}
    </div>
  );
}
